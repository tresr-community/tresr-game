<script lang="ts">
  import {onMount} from "svelte";
  import {
    getEnvironmentKey,
    isVaultDeployed,
  } from "@/lib/blockchain/networks/chain";
  import {
    getTotalFees,
    getTotalRewards,
    getVaultTotalBurned,
  } from "@/lib/blockchain/contracts/vault";
  import {formatBalance} from "@/lib/blockchain/balance";
  import {config} from "@/lib/config/client";
  import {log} from "@/lib/utils/log";

  const COMPONENT_NAME = "BurnStats";
  const env = getEnvironmentKey();
  const ticker = config.blockchain.avalanche[env].token_ticker;

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

  onMount(() => {
    window.addEventListener("loader-ready", loadStats, {once: true});
    // In case loader-ready already fired before component mounted
    if (!isLoaded) loadStats();
  });
</script>

{#if isLoaded && isDeployed}
  <div class="relative mt-6 grid w-full max-w-4xl grid-cols-3 gap-2">
    <div
      class="border-info/20 flex flex-col items-center rounded-xl border bg-black/40 px-5 py-4 shadow backdrop-blur"
    >
      <div class="font-mono text-xs uppercase opacity-50">FEES</div>
      <div class="text-info mt-1 font-mono text-2xl font-bold">{fees}</div>
      <div class="mt-1 font-mono text-xs opacity-40">${ticker}</div>
    </div>
    <div
      class="flex flex-col items-center rounded-xl border border-green-500/20 bg-black/40 px-5 py-4 shadow backdrop-blur"
    >
      <div class="font-mono text-xs uppercase opacity-50">REWARDED</div>
      <div class="mt-1 font-mono text-2xl font-bold text-green-400">
        {rewarded}
      </div>
      <div class="mt-1 font-mono text-xs opacity-40">${ticker}</div>
    </div>
    <div
      class="flex flex-col items-center rounded-xl border border-red-500/20 bg-black/40 px-5 py-4 shadow backdrop-blur"
    >
      <div class="font-mono text-xs uppercase opacity-50">BURNED</div>
      <div class="mt-1 font-mono text-2xl font-bold text-red-400">{burned}</div>
      <div class="mt-1 font-mono text-xs opacity-40">${ticker}</div>
    </div>
  </div>
{/if}
