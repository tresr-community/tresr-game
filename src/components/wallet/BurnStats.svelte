<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getEnvironmentKey, isVaultDeployed } from "@/lib/blockchain/networks/chain";
  import { getTotalFees, getTotalRewards, getVaultTotalBurned } from "@/lib/blockchain/contracts/vault";
  import { formatBalance } from "@/lib/blockchain/balance";
  import { config } from "@/lib/config/client";
  import { log } from "@/lib/utils/log";

  const COMPONENT_NAME = "BurnStats";
  const env = getEnvironmentKey();
  const ticker = config.blockchain.avalanche[env].token_ticker;

  let isSyncing = false;
  let isDeployed = isVaultDeployed(config);

  let fees = "0";
  let rewarded = "0";
  let burned = "0";
  let isLoaded = false;

  const formatWeiAbbr = (weiStr: string) => {
    const num = parseFloat(weiStr.replace(/,/g, ""));
    if (isNaN(num)) return "0";
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  async function loadStats() {
    if (!isDeployed) {
      log.debug(COMPONENT_NAME, "Vault not deployed, skipping stats fetch");
      return;
    }
    try {
      const [f, r, b] = await Promise.all([
        getTotalFees(),
        getTotalRewards(),
        getVaultTotalBurned(),
      ]);

      fees = formatWeiAbbr(formatBalance(f));
      rewarded = formatWeiAbbr(formatBalance(r));
      burned = formatWeiAbbr(formatBalance(b));
      isLoaded = true;
    } catch (err) {
      log.error(COMPONENT_NAME, "Failed to load global stats:", err);
      fees = "0";
      rewarded = "0";
      burned = "0";
      isLoaded = true;
    }
  }

  function handleBlockchainSynced() {
    loadStats();
  }

  function handleBlockchainSyncing(e: Event) {
    const detail = (e as CustomEvent).detail;
    if (detail) isSyncing = detail.syncing;
  }

  onMount(() => {
    window.addEventListener("loader-ready", loadStats, { once: true });
    // In case loader-ready already fired before component mounted
    if (!isLoaded) loadStats();

    document.addEventListener("tresr:blockchain-synced", handleBlockchainSynced);
    document.addEventListener("tresr:blockchain-syncing", handleBlockchainSyncing);
  });

  onDestroy(() => {
    document.removeEventListener("loader-ready", loadStats);
    document.removeEventListener("tresr:blockchain-synced", handleBlockchainSynced);
    document.removeEventListener("tresr:blockchain-syncing", handleBlockchainSyncing);
  });
</script>

{#if isLoaded && isDeployed}
<div class="stats stats-horizontal bg-base-200/50 border-error/20 mt-6 w-full max-w-4xl border shadow relative">
  {#if isSyncing}
    <span class="loading loading-xs loading-spinner absolute top-2 right-2 opacity-40"></span>
  {/if}
  <div class="stat place-items-center">
    <div class="stat-title font-mono text-xs">FEES</div>
    <div class="stat-value text-info text-2xl">{fees}</div>
    <div class="stat-desc font-mono">${ticker}</div>
  </div>
  <div class="stat place-items-center">
    <div class="stat-title font-mono text-xs">REWARDED</div>
    <div class="stat-value text-success text-2xl">{rewarded}</div>
    <div class="stat-desc font-mono">${ticker}</div>
  </div>
  <div class="stat place-items-center">
    <div class="stat-title font-mono text-xs">BURNED</div>
    <div class="stat-value text-error text-2xl">{burned}</div>
    <div class="stat-desc font-mono">${ticker}</div>
  </div>
</div>
{/if}
