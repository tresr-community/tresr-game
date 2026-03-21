<script lang="ts">
  import {onDestroy} from "svelte";
  import {authStore} from "@/lib/auth/store.svelte";
  import {walletStore} from "@/lib/wallet/store.svelte";
  import {profileStore} from "@/lib/user/store.svelte";
  import {getConnectedAddress} from "@/lib/wallet/connection";
  import {
    claimFaucet,
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

  // True when the user's ICP profile has a linked EVM wallet, OR a SIWA wallet
  // session is live. We deliberately do NOT use walletStore.value.connected alone
  // here — a stale wagmi reconnect from a previous browser session (different
  // account) would incorrectly make this true for a new user with no linked wallet,
  // causing the faucet button to appear greyed-out/disabled.
  let hasWallet = $derived(
    !!profileStore.value?.evm_wallet || walletStore.value.connected
  );

  let isVisible = $state(false);
  let isProcessing = $state(false);
  let disposed = false;

  $effect(() => {
    // Only show the faucet when the user's profile has an evm_wallet linked.
    // - SIWA users: their login wallet is stored as evm_wallet ✓
    // - ICP users who linked a wallet: evm_wallet is set ✓
    // - ICP users with a stale wagmi reconnect from a previous session: evm_wallet
    //   is undefined → button stays hidden ✓
    const profileLinkedWallet = !!profileStore.value?.evm_wallet;

    if (
      !isProduction &&
      authStore.value.isAuthenticated &&
      !authStore.value.isGuest &&
      profileLinkedWallet &&
      isFaucetDeployed(config)
    ) {
      isVisible = true;
    } else {
      isVisible = false;
    }
  });

  let btnDisabled = $derived(isProcessing || !hasWallet);
  let btnTitle = $derived(
    isProcessing
      ? "Processing..."
      : !hasWallet
        ? "Connecting wallet…"
        : "Claim test tokens"
  );
  let btnContent = $derived(isProcessing ? "" : EMOJI_CONTENT);

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
