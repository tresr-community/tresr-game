import {config} from "$lib/config/client";

// Convert constants to BigInt
const VAULT_TIER_BUILDING =
  BigInt(config.gameplay.vault.tiers.building) * 10n ** 18n;
const VAULT_TIER_SWEET_SPOT =
  BigInt(config.gameplay.vault.tiers.sweet_spot) * 10n ** 18n;
const VAULT_TIER_FOMO = BigInt(config.gameplay.vault.tiers.fomo) * 10n ** 18n;

const PAYOUT_FIXED_BUILDING =
  BigInt(config.gameplay.vault.payout_fixed.building) * 10n ** 18n;
const PAYOUT_PERCENT_SWEET_SPOT = BigInt(
  config.gameplay.vault.payout_percentages.sweet_spot
);
const PAYOUT_PERCENT_FOMO = BigInt(
  config.gameplay.vault.payout_percentages.fomo
);
const PAYOUT_PERCENT_LEGENDARY = BigInt(
  config.gameplay.vault.payout_percentages.legendary
);

const PAYOUT_CURVE = config.gameplay.vault.payout_curve;
const ANTI_CHEAT_MAX_SCORE = BigInt(config.anti_cheat.max_score);

export function calculateScore(
  keys: number,
  kills: number,
  bossHits: number,
  superHits: number
): bigint {
  return BigInt(
    keys * config.gameplay.scoring.key_collection +
      kills * config.gameplay.scoring.enemy_kill +
      bossHits * config.gameplay.scoring.boss_hit +
      superHits * config.gameplay.scoring.super_hit
  );
}

export function calculateMaxPayout(vaultBalanceWei: bigint): bigint {
  if (vaultBalanceWei <= VAULT_TIER_BUILDING) {
    return PAYOUT_FIXED_BUILDING;
  } else if (vaultBalanceWei <= VAULT_TIER_SWEET_SPOT) {
    return (vaultBalanceWei * PAYOUT_PERCENT_SWEET_SPOT) / 100n;
  } else if (vaultBalanceWei <= VAULT_TIER_FOMO) {
    return (vaultBalanceWei * PAYOUT_PERCENT_FOMO) / 100n;
  } else {
    return (vaultBalanceWei * PAYOUT_PERCENT_LEGENDARY) / 100n;
  }
}

export function calculateRewardAmount(
  score: bigint,
  vaultBalanceWei: bigint,
  feeAmountWei: bigint = 1n * 10n ** 18n // Assumes generic 1 TRESR if not provided
): bigint {
  if (score > ANTI_CHEAT_MAX_SCORE) {
    // If exceeded, we return 0 payout. Satellite will ban.
    return 0n;
  }

  const maxPayoutWei = calculateMaxPayout(vaultBalanceWei);
  const lastPoint = PAYOUT_CURVE[PAYOUT_CURVE.length - 1];

  // To precisely match the new Rust `max_perf` scaled by the offset,
  // let's do exactly what Rust does.
  // wait, the Rust logic has:
  // let offset_payout = range_payout * score_offset / score_range
  // let max_perf = base_payout + offset_payout

  let maxPerfWei = 0n;
  if (score >= BigInt(lastPoint.score)) {
    maxPerfWei = (maxPayoutWei * BigInt(lastPoint.percent)) / 100n;
  } else {
    let prevPoint = {score: 0n, percent: 0n};
    for (const pt of PAYOUT_CURVE) {
      const curScore = BigInt(pt.score);
      const curPercent = BigInt(pt.percent);

      if (score <= curScore) {
        const scoreRange = curScore - prevPoint.score;
        const percentRange = curPercent - prevPoint.percent;
        const scoreOffset = score - prevPoint.score;

        const basePayout = (maxPayoutWei * prevPoint.percent) / 100n;
        const rangePayout = (maxPayoutWei * percentRange) / 100n;

        let offsetPayout = 0n;
        if (scoreRange > 0n) {
          offsetPayout = (rangePayout * scoreOffset) / scoreRange;
        }

        maxPerfWei = basePayout + offsetPayout;
        break;
      }
      prevPoint = {score: curScore, percent: curPercent};
    }
  }

  // Safety cap: never drain more than 50%
  const halfVault = vaultBalanceWei / 2n;
  if (maxPerfWei > halfVault) {
    maxPerfWei = halfVault;
  }

  // Guaranteed 1.1x fee
  const guaranteedWei = (feeAmountWei * 11n) / 10n;

  let amountWei = maxPerfWei > guaranteedWei ? maxPerfWei : guaranteedWei;
  if (amountWei > vaultBalanceWei) {
    amountWei = vaultBalanceWei;
  }

  return amountWei;
}
