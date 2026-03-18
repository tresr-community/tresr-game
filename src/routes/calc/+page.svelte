<script lang="ts">
  import {onMount} from "svelte";
  import {getVaultCurrentBalance} from "@/lib/blockchain/contracts/vault";
  import {log} from "@/lib/utils/log";

  // Game constants replicating config/tresr.yaml and satellite/src/lib.rs exactly
  const VAULT_TIER_BUILDING = 10000n * 10n ** 18n;
  const VAULT_TIER_SWEET_SPOT = 50000n * 10n ** 18n;
  const VAULT_TIER_FOMO = 100000n * 10n ** 18n;

  const PAYOUT_FIXED_BUILDING = 500n * 10n ** 18n;
  const PAYOUT_PERCENT_SWEET_SPOT = 10n;
  const PAYOUT_PERCENT_FOMO = 25n;
  const PAYOUT_PERCENT_LEGENDARY = 50n;

  const MAX_SCORE = 20000n;

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

      const keys = parseInt(inputValues.keys || "0");
      const kills = parseInt(inputValues.kills || "0");
      const bossHits = parseInt(inputValues.bossHits || "0");
      const superHits = parseInt(inputValues.superHits || "0");

      // Score evaluation matching gameplayConfig parameters exactly
      const score = BigInt(
        keys * 100 + kills * 10 + bossHits * 25 + superHits * 25
      );

      // 2. Maximum payout tier mapping
      let maxPayoutWei = 0n;
      if (vaultBalanceWei <= VAULT_TIER_BUILDING) {
        maxPayoutWei = PAYOUT_FIXED_BUILDING;
      } else if (vaultBalanceWei <= VAULT_TIER_SWEET_SPOT) {
        maxPayoutWei = (vaultBalanceWei * PAYOUT_PERCENT_SWEET_SPOT) / 100n;
      } else if (vaultBalanceWei <= VAULT_TIER_FOMO) {
        maxPayoutWei = (vaultBalanceWei * PAYOUT_PERCENT_FOMO) / 100n;
      } else {
        maxPayoutWei = (vaultBalanceWei * PAYOUT_PERCENT_LEGENDARY) / 100n;
      }

      // 3. Performance scalar calculation
      // Following `max_perf = max_payout.checked_mul(session.score)...` from Rust
      let maxPerfWei = (maxPayoutWei * score) / MAX_SCORE;

      // Safety cap: never drain more than 50%
      const halfVault = vaultBalanceWei / 2n;
      if (maxPerfWei > halfVault) {
        maxPerfWei = halfVault;
      }

      // 4. Fixed guaranteed compensation (assumes base entry fee)
      // `let guaranteed = fee_amount * 11 / 10;`
      // Assumes generic feeAmount = 1 TRESR
      const feeAmountWei = 1n * 10n ** 18n;
      const guaranteedWei = (feeAmountWei * 11n) / 10n;

      // 5. Final resolution
      let amountWei = maxPerfWei > guaranteedWei ? maxPerfWei : guaranteedWei;
      if (amountWei > vaultBalanceWei) {
        amountWei = vaultBalanceWei;
      }

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
      <div class="card bg-base-200/50 border-primary/20 border shadow-xl">
        <div class="card-body p-6 sm:p-8">
          <h2
            class="text-secondary mb-4 font-mono text-xl tracking-widest uppercase"
          >
            Simulation Inputs
          </h2>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="form-control">
              <label class="label py-1" for="vault_balance"
                ><span class="label-text font-mono text-xs opacity-70"
                  >Vault Balance (TRESR)</span
                ></label
              >
              <input
                type="number"
                id="vault_balance"
                bind:value={inputValues.vaultBalance}
                class="input input-bordered bg-base-300 focus:border-primary w-full font-mono"
                min="0"
                step="1000"
              />
            </div>
            <div class="form-control">
              <label class="label py-1" for="keys"
                ><span class="label-text font-mono text-xs opacity-70"
                  >Keys Collected</span
                ></label
              >
              <input
                type="number"
                id="keys"
                bind:value={inputValues.keys}
                class="input input-bordered bg-base-300 focus:border-primary w-full font-mono"
                min="0"
              />
            </div>
            <div class="form-control">
              <label class="label py-1" for="kills"
                ><span class="label-text font-mono text-xs opacity-70"
                  >Enemy Kills</span
                ></label
              >
              <input
                type="number"
                id="kills"
                bind:value={inputValues.kills}
                class="input input-bordered bg-base-300 focus:border-primary w-full font-mono"
                min="0"
              />
            </div>
            <div class="form-control">
              <label class="label py-1" for="boss_hits"
                ><span class="label-text font-mono text-xs opacity-70"
                  >Boss Hits</span
                ></label
              >
              <input
                type="number"
                id="boss_hits"
                bind:value={inputValues.bossHits}
                class="input input-bordered bg-base-300 focus:border-primary w-full font-mono"
                min="0"
              />
            </div>
            <div class="form-control sm:col-span-2">
              <label class="label py-1" for="super_hits"
                ><span class="label-text font-mono text-xs opacity-70"
                  >Super Hits</span
                ></label
              >
              <input
                type="number"
                id="super_hits"
                bind:value={inputValues.superHits}
                class="input input-bordered bg-base-300 focus:border-primary w-full font-mono"
                min="0"
              />
            </div>
          </div>

          <div class="divider border-primary/20 my-8"></div>

          <div class="text-center font-mono">
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
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4">
      <a href="/" class="btn btn-outline btn-primary font-mono tracking-widest">
        RETURN HOME
      </a>
    </div>
  </div>
</div>
