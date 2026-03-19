<script lang="ts">
  import {onMount} from "svelte";
  import {getVaultCurrentBalance} from "@/lib/blockchain/contracts/vault";
  import {log} from "@/lib/utils/log";
  import {config} from "@/lib/config/client";

  import {calculateScore, calculateRewardAmount} from "@/lib/game/reward";

  interface Inputs {
    vaultBalance: HTMLInputElement | null;
    keys: HTMLInputElement | null;
    kills: HTMLInputElement | null;
    bossHits: HTMLInputElement | null;
    superHits: HTMLInputElement | null;
  }

  let inputs: Inputs = {
    vaultBalance: null,
    keys: null,
    kills: null,
    bossHits: null,
    superHits: null,
  };
  let resultEl: HTMLElement | null = null;

  let resultText = "0.00 TRESR";
  let isImpossible = false;
  let inputValues = {
    vaultBalance: "50000",
    keys: "50",
    kills: "10",
    bossHits: "0",
    superHits: "0",
  };

  function calculate() {
    try {
      // 1. Inputs
      const vaultInput = parseFloat(inputValues.vaultBalance || "0");
      // Safe precision scaling up to 18 decimals
      const vaultBalanceWei =
        BigInt(Math.floor(vaultInput * 1000000)) * 10n ** 12n;

      let keys = parseInt(inputValues.keys || "0");
      if (keys > config.gameplay.max_keys) {
        keys = config.gameplay.max_keys;
        inputValues.keys = keys.toString();
      }

      const kills = parseInt(inputValues.kills || "0");
      const bossHits = parseInt(inputValues.bossHits || "0");
      const superHits = parseInt(inputValues.superHits || "0");

      // Score evaluation
      const score = calculateScore(keys, kills, bossHits, superHits);
      isImpossible = score > BigInt(config.anti_cheat.max_score);

      // Final resolution
      const amountWei = calculateRewardAmount(score, vaultBalanceWei);

      const formatted = (Number(amountWei) / 1e18).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 5,
      });
      resultText = `${formatted} TRESR`;
    } catch (e) {
      log.error("Calc", "Calculation failed", e);
      resultText = "0.00 TRESR";
    }
  }

  // Fetch actual vault balance
  async function init() {
    try {
      const balWei = await getVaultCurrentBalance();
      if (balWei > 0n) {
        inputValues.vaultBalance = (Number(balWei) / 1e18).toFixed(2);
        calculate();
      }
    } catch (e) {
      log.warn("Calc", "Could not fetch on-chain vault balance", e);
    }
  }

  onMount(() => {
    calculate();
    init();
  });

  // React to changes
  $: {
    inputValues;
    calculate();
  }
</script>

<svelte:head>
  <title>Prize Calculator | TRESR</title>
</svelte:head>

<div class="min-h-screen pt-20 pb-10">
  <div class="container mx-auto max-w-2xl px-4 text-center">
    <h1
      class="text-primary font-display mb-12 text-4xl font-black tracking-widest drop-shadow-[0_0_10px_rgba(var(--primary),0.8)] sm:text-5xl"
    >
      PRIZE CALCULATOR
    </h1>

    <div class="mb-12 w-full text-left">
      <div class="border-primary/20 rounded-xl border bg-white/5 shadow-xl">
        <div class="p-6 sm:p-8">
          <h2
            class="text-secondary mb-4 text-center font-mono text-xl tracking-widest uppercase"
          >
            Simulation Inputs
          </h2>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1 sm:col-span-2">
              <label for="vault_balance" class="font-mono text-xs opacity-70"
                >Vault Balance (TRESR)</label
              >
              <input
                type="number"
                id="vault_balance"
                bind:value={inputValues.vaultBalance}
                class="focus:border-primary w-full rounded border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white focus:outline-none"
                min="0"
                step="1000"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label for="keys" class="font-mono text-xs opacity-70"
                >Keys Collected</label
              >
              <input
                type="number"
                id="keys"
                bind:value={inputValues.keys}
                class="focus:border-primary w-full rounded border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white focus:outline-none"
                min="0"
                max={config.gameplay.max_keys}
              />
            </div>
            <div class="flex flex-col gap-1">
              <label for="kills" class="font-mono text-xs opacity-70"
                >Enemy Kills</label
              >
              <input
                type="number"
                id="kills"
                bind:value={inputValues.kills}
                class="focus:border-primary w-full rounded border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white focus:outline-none"
                min="0"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label for="boss_hits" class="font-mono text-xs opacity-70"
                >Boss Hits</label
              >
              <input
                type="number"
                id="boss_hits"
                bind:value={inputValues.bossHits}
                class="focus:border-primary w-full rounded border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white focus:outline-none"
                min="0"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label for="super_hits" class="font-mono text-xs opacity-70"
                >Super Hits</label
              >
              <input
                type="number"
                id="super_hits"
                bind:value={inputValues.superHits}
                class="focus:border-primary w-full rounded border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white focus:outline-none"
                min="0"
              />
            </div>
          </div>

          <div class="border-primary/20 my-8 border-t"></div>

          <div class="text-center font-mono">
            {#if isImpossible}
              <div
                class="mb-2 animate-pulse text-sm font-black tracking-widest text-[#ef4444] uppercase"
              >
                ⚠ ANTI-CHEAT ACTIVATED
              </div>
              <div
                class="animate-pulse text-4xl font-black break-words text-[#ef4444] drop-shadow-[0_0_8px_rgba(239,68,68,0.8)] sm:text-5xl"
              >
                IMPOSSIBLE SCORE
              </div>
              <div class="mt-2 text-xs text-[#ef4444] opacity-50">
                Detected maximum mathematical limit exceeded
              </div>
            {:else}
              <div
                class="text-secondary mb-2 text-sm tracking-widest uppercase opacity-70"
              >
                Calculated Payout
              </div>
              <div
                class="text-primary text-4xl font-black break-words drop-shadow-[0_0_8px_rgba(var(--primary),0.8)] sm:text-5xl"
              >
                {resultText}
              </div>
              <div class="mt-2 text-xs opacity-50">
                Determined strictly by on-chain algorithm variables
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4">
      <a
        href="/"
        class="border-primary text-primary hover:bg-primary inline-block rounded-md border px-8 py-3 font-mono text-sm tracking-widest uppercase transition-all hover:text-black hover:shadow-[0_0_15px_var(--color-primary)]"
      >
        RETURN HOME
      </a>
    </div>
  </div>
</div>
