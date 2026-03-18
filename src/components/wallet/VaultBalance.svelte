<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { isRpcAvailable } from "@/lib/blockchain/balance";
  import { getEnvironmentKey, isVaultDeployed } from "@/lib/blockchain/networks/chain";
  import { shortenAddress } from "@/lib/blockchain/networks/display";
  import { getReadClient } from "@/lib/blockchain/tx";
  import { getClaimCooldownStatus, getVaultCurrentBalance } from "@/lib/blockchain/contracts/vault";
  import { subscribeToConnection, getConnectedAddress } from "@/lib/wallet/connection";
  import { config } from "@/lib/config/client";
  import { log } from "@/lib/utils/log";
  import { subscribeToAuth } from "@/lib/auth";
  import { getVaultTier, formatCooldown, formatVaultDisplay } from "@/lib/blockchain/vault-status";
  import { VaultAbi } from "@/lib/blockchain/abi/vault";

  const COMPONENT_NAME = "VaultBalance";
  if (!config.wallet?.vault_poll_interval_ms) throw new Error("Missing required config value: wallet.vault_poll_interval_ms");

  const REFRESH_INTERVAL_MS = config.wallet.vault_poll_interval_ms;
  const COOLDOWN_TICK_MS = 1_000;
  const MAX_CONSECUTIVE_ERRORS = 3;
  const WIN_TOAST_DURATION_MS = 8_000;

  const env = getEnvironmentKey();
  const ticker = config.blockchain.avalanche[env].token_ticker;

  let isVisible = false;
  let balanceDisplay = "--";
  let difficulty = { tier: 'locked', emoji: '🔒', label: 'LOCKED', colorClass: 'badge-ghost', unlocked: false };
  let showDifficulty = false;
  let isOffline = !isRpcAvailable();

  let cooldownRemaining = 0;

  let winToastVisible = false;
  let winToastText = "";

  let interval: ReturnType<typeof setInterval> | null = null;
  let cooldownInterval: ReturnType<typeof setInterval> | null = null;
  let winToastTimeout: ReturnType<typeof setTimeout> | null = null;

  let walletConnected = false;
  let isAuthenticatedNonGuest = false;
  let connectedAddress: string | null = null;
  let consecutiveErrors = 0;
  let disposed = false;
  let unwatchClaim: (() => void) | null = null;

  function updateDifficultyBadge(balanceWei: bigint) {
    if (disposed) return;
    const tier = getVaultTier(balanceWei);
    difficulty = { ...tier, unlocked: tier.tier !== 'locked' };
    showDifficulty = true;

    document.dispatchEvent(
      new CustomEvent("tresr:vault-status", {
        detail: { tier: tier.tier, locked: tier.tier === "locked", balance: balanceWei },
      })
    );
  }

  async function fetchCooldown() {
    if (disposed || !walletConnected || !connectedAddress) return;
    try {
      const status = await getClaimCooldownStatus(connectedAddress);
      if (disposed) return;
      cooldownRemaining = status.remainingSeconds;
      startCooldownTick();
    } catch {
      // Silently fail
    }
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
      if (cooldownRemaining <= 0) stopCooldownTick();
    }, COOLDOWN_TICK_MS);
  }

  function stopCooldownTick() {
    if (cooldownInterval) {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
    }
  }

  function showWinToast(user: string, amountWei: bigint) {
    if (disposed) return;

    const amountDisplay = formatVaultDisplay(amountWei);
    const shortAddr = shortenAddress(user);
    winToastText = `🏆 ${shortAddr} just won ${amountDisplay} $${ticker}!`;
    winToastVisible = true;

    document.dispatchEvent(new CustomEvent("tresr:confetti"));

    if (winToastTimeout) clearTimeout(winToastTimeout);
    winToastTimeout = setTimeout(() => {
      winToastVisible = false;
    }, WIN_TOAST_DURATION_MS);

    updateBalance();
  }

  async function startWatchingClaims() {
    if (unwatchClaim || disposed || !isVaultDeployed(config) || !isRpcAvailable()) return;
    try {
      const publicClient = getReadClient();
      const vaultAddress = config.blockchain.avalanche[env].vault_contract as `0x${string}`;

      unwatchClaim = publicClient.watchContractEvent({
        address: vaultAddress,
        abi: VaultAbi,
        eventName: "Claim",
        onLogs: (logs) => {
          for (const l of logs) {
            const args = l.args as {user?: string; amount?: bigint} | undefined;
            if (args?.user && args?.amount) {
              log.info(COMPONENT_NAME, `Claim detected: ${args.user} won ${args.amount}`);
              showWinToast(args.user, args.amount);
            }
          }
        },
      });
      log.info(COMPONENT_NAME, "Watching for Claim events");
    } catch (err) {
      log.error(COMPONENT_NAME, "Failed to watch Claim events:", err);
    }
  }

  function stopWatchingClaims() {
    if (unwatchClaim) {
      unwatchClaim();
      unwatchClaim = null;
    }
  }

  function handleBlockchainSynced(e: Event) {
    if (disposed) return;
    const detail = (e as CustomEvent).detail;
    if (!detail || detail.vaultBalance === undefined) return;

    const balance = detail.vaultBalance;
    isOffline = !isRpcAvailable();

    if (isOffline) {
      balanceDisplay = "Offline";
      showDifficulty = false;
      return;
    }

    balanceDisplay = formatVaultDisplay(balance);
    updateDifficultyBadge(balance);
    consecutiveErrors = 0;
  }

  async function updateBalance() {
    if (disposed || !connectedAddress) return;
    if (!isVaultDeployed(config)) {
      balanceDisplay = "--";
      return;
    }
    try {
      const balance = await getVaultCurrentBalance();
      balanceDisplay = formatVaultDisplay(balance);
      updateDifficultyBadge(balance);
      consecutiveErrors = 0;
    } catch (err) {
      if (disposed) return;
      consecutiveErrors++;
      if (consecutiveErrors <= MAX_CONSECUTIVE_ERRORS) {
        log.error(COMPONENT_NAME, "Vault sync failed:", err);
      } else if (consecutiveErrors === MAX_CONSECUTIVE_ERRORS + 1) {
        log.info(COMPONENT_NAME, `Suppressing further vault sync errors (${consecutiveErrors} consecutive failures)`);
      }
      balanceDisplay = "--";
    }
  }

  function startPolling() {
    updateBalance();
    if (!interval) interval = setInterval(updateBalance, REFRESH_INTERVAL_MS);
    fetchCooldown();
    startWatchingClaims();
  }

  function stopPolling() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    stopCooldownTick();
    stopWatchingClaims();
  }

  function evaluatePolling() {
    if (isAuthenticatedNonGuest) {
      isVisible = true;
      if (walletConnected) {
        consecutiveErrors = 0;
        startPolling();
      } else {
        stopPolling();
        balanceDisplay = "--";
        showDifficulty = false;
      }
    } else {
      isVisible = false;
      stopPolling();
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible" && interval) {
      updateBalance();
    }
  }

  let unsubAuth: (() => void) | null = null;
  let unsubWallet: (() => void) | null = null;

  onMount(() => {
    unsubAuth = subscribeToAuth((state) => {
      isAuthenticatedNonGuest = state.isAuthenticated && !state.isGuest;

      if (isAuthenticatedNonGuest && !unsubWallet) {
        unsubWallet = subscribeToConnection((connected, address) => {
          walletConnected = connected;
          connectedAddress = connected && address ? address : null;
          evaluatePolling();
        });
      } else if (!isAuthenticatedNonGuest && unsubWallet) {
        unsubWallet();
        unsubWallet = null;
        walletConnected = false;
        connectedAddress = null;
      }

      evaluatePolling();
    });

    document.addEventListener("tresr:blockchain-synced", handleBlockchainSynced);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  });

  onDestroy(() => {
    disposed = true;
    stopPolling();
    if (unsubAuth) unsubAuth();
    if (unsubWallet) unsubWallet();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.removeEventListener("tresr:blockchain-synced", handleBlockchainSynced);
    if (winToastTimeout) clearTimeout(winToastTimeout);
  });
</script>

{#if isVisible}
  <div class="stats bg-base-200/50 border-warning/30 border shadow">
    <div class="stat place-items-center">
      <div class="stat-title font-mono text-xs whitespace-nowrap">VAULT PRIZE POOL</div>

      {#if showDifficulty}
        <span class="badge badge-sm {difficulty.colorClass}">
          {difficulty.emoji} {difficulty.label}
        </span>
      {/if}

      <div class="stat-value text-warning text-3xl">
        {#if balanceDisplay === '--' && walletConnected && !isOffline}
          <span class="loading loading-dots loading-sm"></span>
        {:else}
          {balanceDisplay}
        {/if}
      </div>

      <div class="stat-desc flex items-center gap-2 font-mono">
        <span>${ticker}</span>
        {#if cooldownRemaining <= 0}
          <span class="text-xs opacity-70 text-success">✅ READY</span>
        {:else}
          <span class="text-xs opacity-70 text-error">⏱️ {formatCooldown(cooldownRemaining)}</span>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if winToastVisible}
  <div class="toast toast-top toast-center z-[9999] transition-all duration-500">
    <div class="alert alert-success border-success/50 bg-success/20 shadow-lg backdrop-blur">
      <span class="font-mono text-sm">{winToastText}</span>
    </div>
  </div>
{/if}
