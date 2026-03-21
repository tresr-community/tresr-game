<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import {isRpcAvailable} from "@/lib/blockchain/balance";
  import {
    getEnvironmentKey,
    isVaultDeployed,
  } from "@/lib/blockchain/networks/chain";
  import {shortenAddress} from "@/lib/blockchain/networks/display";
  import {getReadClient} from "@/lib/blockchain/tx";
  import {getVaultCurrentBalance} from "@/lib/blockchain/contracts/vault";
  import {config} from "@/lib/config/client";
  import {log} from "@/lib/utils/log";
  import {
    getVaultTier,
    formatVaultDisplay,
  } from "@/lib/blockchain/vault-status";
  import {VaultAbi} from "@/lib/blockchain/abi/vault";
  import {getConnectedAddress} from "@/lib/wallet/connection";
  import {profileStore} from "@/lib/user/store.svelte";
  import Card from "@/components/ui/Card.svelte";
  import Badge from "@/components/ui/Badge.svelte";
  import {balanceRefreshTick, vaultStatus} from "@/lib/stores/ui.svelte";

  const COMPONENT_NAME = "VaultBalance";
  if (!config.wallet?.vault_poll_interval_ms)
    throw new Error(
      "Missing required config value: wallet.vault_poll_interval_ms"
    );

  const REFRESH_INTERVAL_MS = config.wallet.vault_poll_interval_ms;
  const MAX_CONSECUTIVE_ERRORS = 3;

  const env = getEnvironmentKey();
  const ticker = config.blockchain.avalanche[env].token_ticker;

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

  let interval: ReturnType<typeof setInterval> | null = null;

  let consecutiveErrors = $state(0);
  let disposed = false;
  let unwatchClaim: (() => void) | null = null;

  /** Deduplicate Claim events across watcher reconnects / component remounts. */
  const MAX_SEEN_SESSIONS = 20;
  const seenSessionIds = new Set<string>();

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

  function showWinToast(sessionId: string, user: string, amountWei: bigint) {
    if (disposed) return;

    // Deduplicate: skip events we've already shown
    if (seenSessionIds.has(sessionId)) return;
    seenSessionIds.add(sessionId);
    // Evict oldest entries to cap memory
    if (seenSessionIds.size > MAX_SEEN_SESSIONS) {
      const first = seenSessionIds.values().next().value;
      if (first) seenSessionIds.delete(first);
    }

    const amountDisplay = formatVaultDisplay(amountWei);
    const myAddress = getConnectedAddress();
    const isSelf =
      !!myAddress && user.toLowerCase() === myAddress.toLowerCase();

    let message: string;
    if (isSelf) {
      const nickname = profileStore.value?.nickname;
      const who = nickname || "You";
      message = `🎉 ${who} just won ${amountDisplay} $${ticker}!`;
      log.info(COMPONENT_NAME, `Self-win: ${amountDisplay} $${ticker}`);
    } else {
      const shortAddr = shortenAddress(user);
      message = `🏆 ${shortAddr} just won ${amountDisplay} $${ticker}!`;
      log.info(
        COMPONENT_NAME,
        `FOMO: ${shortAddr} won ${amountDisplay} $${ticker}`
      );
    }

    // Route through the notification toast system with confetti
    window.showConfettiToast?.(message);

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
        .proxy_contract as `0x${string}`;

      unwatchClaim = publicClient.watchContractEvent({
        address: vaultAddress,
        abi: VaultAbi,
        eventName: "Claim",
        onLogs: (logs) => {
          for (const l of logs) {
            const args = l.args as
              | {
                  sessionId?: string;
                  user?: string;
                  amount?: bigint;
                }
              | undefined;
            if (args?.user && args?.amount) {
              const sid =
                args.sessionId ?? l.transactionHash ?? crypto.randomUUID();
              log.info(
                COMPONENT_NAME,
                `Claim detected: ${args.user} won ${args.amount}`
              );
              showWinToast(sid, args.user, args.amount);
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
    if (disposed) return;
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
    startWatchingClaims();
  }

  function stopPolling() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    stopWatchingClaims();
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible" && interval) {
      updateBalance();
    }
  }

  onMount(() => {
    // Vault balance is a public read — always poll, no wallet needed.
    if (isVaultDeployed(config) && isRpcAvailable()) {
      startPolling();
    }

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
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });
</script>

{#if isVaultDeployed(config)}
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
        {#if balanceDisplay === "--" && !isOffline}
          <span class="animate-pulse">...</span>
        {:else}
          {balanceDisplay}
        {/if}
      </div>

      <div class="mt-1 flex items-center gap-2 font-mono">
        <span class="opacity-80">${ticker}</span>
        <span class="text-success text-xs font-bold">✅ READY</span>
      </div>
    </div>
  </Card>
{/if}
