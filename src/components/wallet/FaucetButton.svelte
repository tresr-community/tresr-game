<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import {authStore} from "@/lib/auth/store.svelte";
  import {walletStore} from "@/lib/wallet/store.svelte";
  import {profileStore} from "@/lib/user/store.svelte";
  import {getConnectedAddress} from "@/lib/wallet/connection";
  import {
    claimFaucet,
    getFaucetCooldownStatus,
    getFaucetDripAmount,
    isFaucetDeployed,
  } from "@/lib/blockchain/faucet";
  import {clearCachedBalance, formatBalance} from "@/lib/blockchain/balance";
  import {config} from "@/lib/config/client";
  import {log} from "@/lib/utils/log";
  import {trackFaucetClaim, trackError} from "@/lib/metrics/analytics";
  import {JUNO_ENVIRONMENT} from "@/lib/config/constants";
  import {balanceRefreshTick} from "@/lib/stores/ui.svelte";

  const COMPONENT_NAME = "FaucetButton";
  const isProduction = JUNO_ENVIRONMENT === "production";
  const EMOJI_CONTENT = "🚰";

  // True when a wallet is actively connected via wagmi OR linked in the user profile
  let hasWallet = $derived(
    walletStore.value.connected || !!profileStore.value?.evm_wallet
  );

  let isVisible = $state(false);
  let isProcessing = $state(false);
  let cooldownRemaining = $state(0);
  let cooldownInterval: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  $effect(() => {
    if (
      !isProduction &&
      authStore.value.isAuthenticated &&
      !authStore.value.isGuest &&
      hasWallet &&
      isFaucetDeployed(config)
    ) {
      isVisible = true;
      if (cooldownRemaining <= 0 && !isProcessing) {
        if (hasWallet && !isProcessing) {
          checkInitialCooldown();
        }
      }
    } else {
      isVisible = false;
    }
  });

  let btnDisabled = $derived(
    isProcessing || !hasWallet || cooldownRemaining > 0
  );
  let btnTitle = $derived(
    isProcessing
      ? "Processing..."
      : !hasWallet
        ? "Connecting wallet…"
        : cooldownRemaining > 0
          ? `Cooldown: ${formatCooldownTime(cooldownRemaining)}`
          : "Claim test tokens"
  );
  let btnContent = $derived(isProcessing ? "" : EMOJI_CONTENT);

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
    if (
      (!walletStore.value.connected && !profileStore.value?.evm_wallet) ||
      disposed
    )
      return;
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

    if (!hasWallet) {
      window.showWarningToast?.("Connect your wallet first 🔗");
      return;
    }

    let address = getConnectedAddress();

    // ICP users with a linked wallet may not have wagmi connected yet.
    // Connect on-demand so the faucet transaction can proceed.
    if (!address && profileStore.value?.evm_wallet) {
      try {
        const {connectWallet} = await import("@/lib/wallet/connection");
        const connection = await connectWallet();
        address = connection.address;
      } catch (err) {
        log.warn(COMPONENT_NAME, "Failed to connect wallet for faucet", err);
        window.showWarningToast?.(
          "Please connect your wallet and try again 🔗"
        );
        return;
      }
    }

    if (!address) {
      log.warn(COMPONENT_NAME, "No wallet address found");
      return;
    }

    isProcessing = true;

    try {
      const status = await getFaucetCooldownStatus(address);
      if (disposed) return;
      if (!status.canClaim) {
        log.warn(
          COMPONENT_NAME,
          `Faucet on cooldown: ${formatCooldownTime(status.remainingSeconds)}`
        );
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
        const env = (
          await import("@/lib/blockchain/networks/chain")
        ).getEnvironmentKey();
        const ticker = config.blockchain.avalanche[env].token_ticker;
        amountDisplay = `${formatBalance(dripAmount)} $${ticker}`;
      } catch {
        // Non-critical
      }

      trackFaucetClaim(amountDisplay);
      window.showInfoToast?.(`Claimed ${amountDisplay}!`);

      clearCachedBalance(address);
      balanceRefreshTick.tick();

      try {
        const status = await getFaucetCooldownStatus(address);
        if (disposed) return;
        if (!status.canClaim) setCooldownState(status.remainingSeconds);
      } catch {
        // Non-critical
      }
    } catch (err: any) {
      const message = err?.message || String(err);

      const isUserRejection =
        message.includes("User rejected") ||
        message.includes("user rejected") ||
        message.includes("User denied") ||
        message.includes("rejected the request");
      const isReconnecting = message.includes("unavailable while reconnecting");
      const isBalanceTooHigh = message.includes("Balance too high");

      if (!isUserRejection && !isBalanceTooHigh) {
        log.error(COMPONENT_NAME, "Faucet claim failed", err);
      }
      if (!isUserRejection && !isReconnecting && !isBalanceTooHigh) {
        trackError("faucet_claim", message);
      }

      if (isUserRejection) window.showInfoToast?.("Transaction cancelled ✋");
      else if (isReconnecting)
        window.showWarningToast?.(
          "Wallet is reconnecting — please try again in a moment 🔄"
        );
      else if (isBalanceTooHigh)
        window.showWarningToast?.(
          "Sorry degen, you already have too many tokens 🤑"
        );
      else if (message.includes("Cooldown active"))
        window.showWarningToast?.("Hold up — faucet is on cooldown ⏳");
      else if (message.includes("Faucet empty"))
        window.showWarningToast?.("Faucet is dry — no tokens left 🏜️");
      else if (message.includes("not broadcast to the network"))
        window.showWarningToast?.(
          "Transaction not sent — check your wallet activity and try again 🔄"
        );
      else if (
        message.includes("already imported") ||
        message.includes("nonce too low") ||
        message.includes("replacement transaction underpriced")
      )
        window.showWarningToast?.(
          "Duplicate transaction detected — reset your wallet activity and try again 🔄"
        );
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
    onclick={handleClick}
    disabled={btnDisabled}
    class="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xl transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
    title={btnTitle}
  >
    {#if isProcessing}
      <svg
        class="h-5 w-5 animate-spin text-current"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
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
