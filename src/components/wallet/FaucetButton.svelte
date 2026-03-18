<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { authStore } from "@/lib/auth/store";
  import { walletStore } from "@/lib/wallet/store";
  import { getConnectedAddress } from "@/lib/wallet/connection";
  import {
    claimFaucet,
    getFaucetCooldownStatus,
    getFaucetDripAmount,
    isFaucetDeployed,
  } from "@/lib/blockchain/faucet";
  import { clearCachedBalance, formatBalance } from "@/lib/blockchain/balance";
  import { config } from "@/lib/config/client";
  import { log } from "@/lib/utils/log";
  import { trackFaucetClaim, trackError } from "@/lib/metrics/analytics";
  import { JUNO_ENVIRONMENT } from "@/lib/config/constants";

  const COMPONENT_NAME = "FaucetButton";
  const isProduction = JUNO_ENVIRONMENT === "production";
  const EMOJI_CONTENT = "🚰";

  let isVisible = false;
  let isProcessing = false;
  let cooldownRemaining = 0;
  let cooldownInterval: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  $: auth = $authStore;
  $: wallet = $walletStore;

  $: {
    if (!isProduction && auth.isAuthenticated && !auth.isGuest && wallet.connected && isFaucetDeployed(config)) {
      isVisible = true;
      if (cooldownRemaining <= 0 && !isProcessing) {
        if (wallet.connected && !isProcessing) {
          checkInitialCooldown();
        }
      }
    } else {
      isVisible = false;
    }
  }

  $: btnDisabled = isProcessing || !wallet.connected || cooldownRemaining > 0;
  $: btnTitle = isProcessing ? "Processing..." : !wallet.connected ? "Connecting wallet…" : cooldownRemaining > 0 ? `Cooldown: ${formatCooldownTime(cooldownRemaining)}` : "Claim test tokens";
  $: btnContent = isProcessing ? "" : EMOJI_CONTENT;

  function formatCooldownTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  function startCooldownTick() {
    stopCooldownTick();
    if (cooldownRemaining <= 0) return;
    cooldownInterval = setInterval(() => {
      if (disposed) {
        stopCooldownTick();
        return;
      }
      cooldownRemaining = Math.max(0, cooldownRemaining - 1);
      if (cooldownRemaining <= 0) {
        stopCooldownTick();
      }
    }, 1000);
  }

  function stopCooldownTick() {
    if (cooldownInterval) {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
    }
  }

  function setCooldownState(seconds: number) {
    cooldownRemaining = seconds;
    if (seconds <= 0) {
      stopCooldownTick();
      return;
    }
    startCooldownTick();
  }

  async function checkInitialCooldown() {
    if (!wallet.connected || disposed) return;
    const address = getConnectedAddress();
    if (!address) return;
    try {
      const status = await getFaucetCooldownStatus(address);
      if (disposed) return;
      if (!status.canClaim) {
        setCooldownState(status.remainingSeconds);
      }
    } catch {
      // Silently fail
    }
  }

  async function handleClick() {
    if (isProcessing || disposed || btnDisabled) return;

    if (!wallet.connected) {
      window.showWarningToast?.("Connect your wallet first 🔗");
      return;
    }

    const address = getConnectedAddress();
    if (!address) {
      log.warn(COMPONENT_NAME, "No wallet address found");
      return;
    }

    isProcessing = true;

    try {
      const status = await getFaucetCooldownStatus(address);
      if (disposed) return;
      if (!status.canClaim) {
        log.warn(COMPONENT_NAME, `Faucet on cooldown: ${formatCooldownTime(status.remainingSeconds)}`);
        setCooldownState(status.remainingSeconds);
        isProcessing = false;
        return;
      }
    } catch (err) {
      log.error(COMPONENT_NAME, "Failed to check cooldown", err);
      isProcessing = false;
      return;
    }

    try {
      await claimFaucet();

      let amountDisplay = "tokens";
      try {
        const dripAmount = await getFaucetDripAmount();
        const env = (await import("@/lib/blockchain/networks/chain")).getEnvironmentKey();
        const ticker = config.blockchain.avalanche[env].token_ticker;
        amountDisplay = `${formatBalance(dripAmount)} $${ticker}`;
      } catch {
        // Non-critical
      }

      trackFaucetClaim(amountDisplay);
      window.showInfoToast?.(`Claimed ${amountDisplay}!`);

      clearCachedBalance(address);
      document.dispatchEvent(new CustomEvent("tresr:balance-refresh"));

      try {
        const status = await getFaucetCooldownStatus(address);
        if (disposed) return;
        if (!status.canClaim) setCooldownState(status.remainingSeconds);
      } catch {
        // Non-critical
      }
    } catch (err: any) {
      const message = err?.message || String(err);

      const isUserRejection = message.includes("User rejected") || message.includes("user rejected") || message.includes("User denied") || message.includes("rejected the request");
      const isReconnecting = message.includes("unavailable while reconnecting");
      const isBalanceTooHigh = message.includes("Balance too high");

      if (!isUserRejection && !isBalanceTooHigh) {
        log.error(COMPONENT_NAME, "Faucet claim failed", err);
      }
      if (!isUserRejection && !isReconnecting && !isBalanceTooHigh) {
        trackError("faucet_claim", message);
      }

      if (isUserRejection) window.showInfoToast?.("Transaction cancelled ✋");
      else if (isReconnecting) window.showWarningToast?.("Wallet is reconnecting — please try again in a moment 🔄");
      else if (isBalanceTooHigh) window.showWarningToast?.("Sorry degen, you already have too many tokens 🤑");
      else if (message.includes("Cooldown active")) window.showWarningToast?.("Hold up — faucet is on cooldown ⏳");
      else if (message.includes("Faucet empty")) window.showWarningToast?.("Faucet is dry — no tokens left 🏜️");
      else if (message.includes("not broadcast to the network")) window.showWarningToast?.("Transaction not sent — check your wallet activity and try again 🔄");
      else if (message.includes("already imported") || message.includes("nonce too low") || message.includes("replacement transaction underpriced")) window.showWarningToast?.("Duplicate transaction detected — reset your wallet activity and try again 🔄");
    } finally {
      isProcessing = false;
    }
  }

  onDestroy(() => {
    disposed = true;
    stopCooldownTick();
  });
</script>

{#if !isProduction && isVisible}
  <button
    on:click={handleClick}
    disabled={btnDisabled}
    class="btn btn-ghost btn-circle text-xl"
    title={btnTitle}
  >
    {#if isProcessing}
      <span class="loading loading-spinner loading-sm"></span>
    {:else}
      {btnContent}
    {/if}
  </button>
{/if}

<style>
  button:disabled {
    pointer-events: auto;
    cursor: not-allowed;
  }
</style>
