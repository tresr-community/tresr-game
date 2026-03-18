/**
 * Vault Status — tier classification and UI helpers.
 *
 * Pure functions that classify the vault balance into tiers and provide
 * display metadata for the homepage. See docs/fomo.md for economics design.
 */

import {config} from "@/lib/config/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VaultTier =
  | "locked"
  | "building"
  | "sweet_spot"
  | "fomo"
  | "legendary";

export interface VaultTierInfo {
  tier: VaultTier;
  label: string;
  emoji: string;
  /** Tailwind CSS class name for theming */
  colorClass: string;
  /** Difficulty multiplier */
  multiplier: number;
}

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

const DECIMALS = 18;
const ONE_TOKEN = BigInt(10 ** DECIMALS);

function getThresholds() {
  const v = config.gameplay.vault;
  return {
    minimumCap: BigInt(v.minimum_cap) * ONE_TOKEN,
    building: BigInt(v.tiers.building) * ONE_TOKEN,
    sweet_spot: BigInt(v.tiers.sweet_spot) * ONE_TOKEN,
    fomo: BigInt(v.tiers.fomo) * ONE_TOKEN,
  };
}

function getMultipliers() {
  return config.gameplay.vault.difficulty_multipliers;
}

/**
 * Classify a vault balance (in wei) into a tier.
 */
export function getVaultTier(balanceWei: bigint): VaultTierInfo {
  const t = getThresholds();
  const m = getMultipliers();

  if (balanceWei < t.minimumCap) {
    return {
      tier: "locked",
      label: "VAULT RECHARGING",
      emoji: "⚫",
      colorClass: "text-white/40",
      multiplier: 0,
    };
  }

  if (balanceWei < t.building) {
    return {
      tier: "building",
      label: "BUILDING",
      emoji: "🟢",
      colorClass: "text-success",
      multiplier: m.building,
    };
  }

  if (balanceWei < t.sweet_spot) {
    return {
      tier: "sweet_spot",
      label: "SWEET SPOT",
      emoji: "🟡",
      colorClass: "text-warning",
      multiplier: m.sweet_spot,
    };
  }

  if (balanceWei < t.fomo) {
    return {
      tier: "fomo",
      label: "FOMO",
      emoji: "🔴",
      colorClass: "text-error",
      multiplier: m.fomo,
    };
  }

  return {
    tier: "legendary",
    label: "LEGENDARY",
    emoji: "🟣",
    colorClass: "text-secondary",
    multiplier: m.legendary,
  };
}

/**
 * Check whether vault is below minimum cap (paid mode should be locked).
 */
export function isVaultLocked(balanceWei: bigint): boolean {
  const t = getThresholds();
  return balanceWei < t.minimumCap;
}

/**
 * Format a cooldown in seconds to HH:MM:SS or "READY".
 */
export function formatCooldown(remainingSeconds: number): string {
  if (remainingSeconds <= 0) return "READY";

  const h = Math.floor(remainingSeconds / 3600);
  const m = Math.floor((remainingSeconds % 3600) / 60);
  const s = remainingSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

/**
 * Format a vault balance for display (e.g. "12,345" whole tokens).
 */
export function formatVaultDisplay(balanceWei: bigint): string {
  const whole = balanceWei / ONE_TOKEN;
  return whole.toLocaleString();
}
