<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import {isRpcAvailable} from "@/lib/blockchain/balance";
  import {
    getEnvironmentKey,
    isVaultDeployed,
  } from "@/lib/blockchain/networks/chain";
  import {shortenAddress} from "@/lib/blockchain/networks/display";
  import {getReadClient} from "@/lib/blockchain/tx";
  import {
    getClaimCooldownStatus,
    getVaultCurrentBalance,
  } from "@/lib/blockchain/contracts/vault";
  import {
    subscribeToConnection,
    getConnectedAddress,
  } from "@/lib/wallet/connection";
  import {config} from "@/lib/config/client";
  import {log} from "@/lib/utils/log";
  import {subscribeToAuth} from "@/lib/auth";
  import {
    getVaultTier,
    formatCooldown,
    formatVaultDisplay,
  } from "@/lib/blockchain/vault-status";
  import {VaultAbi} from "@/lib/blockchain/abi/vault";
  import Card from "@/components/ui/Card.svelte";
  import Badge from "@/components/ui/Badge.svelte";
  import Alert from "@/components/ui/Alert.svelte";
  import {
    balanceRefreshTick,
    confettiTrigger,
    vaultStatus,
  } from "@/lib/stores/ui.svelte";

  const COMPONENT_NAME = "VaultBalance";
  if (!config.wallet?.vault_poll_interval_ms)
    throw new Error(
      "Missing required config value: wallet.vault_poll_interval_ms"
    );

  const REFRESH_INTERVAL_MS = config.wallet.vault_poll_interval_ms;
  const COOLDOWN_TICK_MS = 1_000;
  const MAX_CONSECUTIVE_ERRORS = 3;
  const WIN_TOAST_DURATION_MS = 8_000;

  const env = getEnvironmentKey();
  const ticker = config.blockchain.avalanche[env].token_ticker;

  let isVisible = $state(false);
  let balanceDisplay = $state("--");
  let difficulty = $state({
    tier: "locked",
    emoji: "🔒",
    label: "LOCKED",
    colorClass: "ghost",
    unlocked: false,
  });
  let showDifficulty = $state(false);
  let isOffline = $state(!isRpcAvailable());

  let badgeVariant = $derived(
    difficulty.colorClass as
      | "success"
      | "warning"
      | "error"
      | "info"
      | "ghost"
      | "primary"
      | "secondary"
  );

  let cooldownRemaining = $state(0);

  let winToastVisible = $state(false);
  let winToastText = $state("");

  let interval: ReturnType<typeof setInterval> | null = null;
  let cooldownInterval: ReturnType<typeof setInterval> | null = null;
  let winToastTimeout: ReturnType<typeof setTimeout> | null = null;

  let walletConnected = $state(false);
  let isAuthenticatedNonGuest = $state(false);
  let connectedAddress: string | null = $state(null);
  let consecutiveErrors = $state(0);
  let disposed = false;
  let unwatchClaim: (() => void) | null = null;

  function updateDifficultyBadge(balanceWei: bigint) {
    if (disposed) return;
    const tier = getVaultTier(balanceWei);
    difficulty = {...tier, unlocked: tier.tier !== "locked"};
    showDifficulty = true;

    vaultStatus.set({
      tier: tier.tier,
      locked: tier.tier === "locked",
      balance: balanceWei,
    });
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

    confettiTrigger.fire({});

    if (winToastTimeout) clearTimeout(winToastTimeout);
    winToastTimeout = setTimeout(() => {
      winToastVisible = false;
    }, WIN_TOAST_DURATION_MS);

    updateBalance();
  }

  async function startWatchingClaims() {
    if (
      unwatchClaim ||
      disposed ||
      !isVaultDeployed(config) ||
      !isRpcAvailable()
    )
      return;
    try {
      const publicClient = getReadClient();
      const vaultAddress = config.blockchain.avalanche[env]
        .vault_contract as `0x${string}`;

      unwatchClaim = publicClient.watchContractEvent({
        address: vaultAddress,
        abi: VaultAbi,
        eventName: "Claim",
        onLogs: (logs) => {
          for (const l of logs) {
            const args = l.args as {user?: string; amount?: bigint} | undefined;
            if (args?.user && args?.amount) {
              log.info(
                COMPONENT_NAME,
                `Claim detected: ${args.user} won ${args.amount}`
              );
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
        log.info(
          COMPONENT_NAME,
          `Suppressing further vault sync errors (${consecutiveErrors} consecutive failures)`
        );
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

    document.addEventListener("visibilitychange", handleVisibilityChange);

    $effect(() => {
      const tick = balanceRefreshTick.current;
      if (tick === 0 || disposed) return;
      updateBalance();
    });
  });

  onDestroy(() => {
    disposed = true;
    stopPolling();
    if (unsubAuth) unsubAuth();
    if (unsubWallet) unsubWallet();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (winToastTimeout) clearTimeout(winToastTimeout);
  });
</script>

{#if isVisible}
  <Card variant="bordered" class="border-warning/30 h-full">
    <div class="flex h-full flex-col items-center justify-center p-4">
      <div class="mb-2 font-mono text-xs whitespace-nowrap opacity-70">
        VAULT PRIZE POOL
      </div>

      {#if showDifficulty}
        <Badge variant={badgeVariant} size="sm" class="mb-2">
          {difficulty.emoji}
          {difficulty.label}
        </Badge>
      {/if}

      <div class="text-warning mb-1 text-3xl font-bold">
        {#if balanceDisplay === "--" && walletConnected && !isOffline}
          <span class="animate-pulse">...</span>
        {:else}
          {balanceDisplay}
        {/if}
      </div>

      <div class="mt-1 flex items-center gap-2 font-mono">
        <span class="opacity-80">${ticker}</span>
        {#if cooldownRemaining <= 0}
          <span class="text-success text-xs font-bold">✅ READY</span>
        {:else}
          <span class="text-error text-xs font-bold"
            >⏱️ {formatCooldown(cooldownRemaining)}</span
          >
        {/if}
      </div>
    </div>
  </Card>
{/if}

{#if winToastVisible}
  <div
    class="animate-in fade-in slide-in-from-top-4 pointer-events-none fixed top-4 right-0 left-0 z-[9999] flex justify-center transition-all duration-500"
  >
    <Alert variant="success" class="shadow-2xl">
      <span class="font-mono text-sm font-bold">{winToastText}</span>
    </Alert>
  </div>
{/if}
