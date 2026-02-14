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

export type VaultTier = "locked" | "easy" | "normal" | "hard" | "extreme";

export interface VaultTierInfo {
  tier: VaultTier;
  label: string;
  emoji: string;
  /** CSS class name for theming (DaisyUI semantic color) */
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
    easy: BigInt(v.tiers.easy) * ONE_TOKEN,
    normal: BigInt(v.tiers.normal) * ONE_TOKEN,
    hard: BigInt(v.tiers.hard) * ONE_TOKEN,
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
      colorClass: "text-base-content/50",
      multiplier: 0,
    };
  }

  if (balanceWei < t.easy) {
    return {
      tier: "easy",
      label: "Easy",
      emoji: "🟢",
      colorClass: "text-success",
      multiplier: m.easy,
    };
  }

  if (balanceWei < t.normal) {
    return {
      tier: "normal",
      label: "Normal",
      emoji: "🟡",
      colorClass: "text-warning",
      multiplier: m.normal,
    };
  }

  if (balanceWei < t.hard) {
    return {
      tier: "hard",
      label: "Hard",
      emoji: "🔴",
      colorClass: "text-error",
      multiplier: m.hard,
    };
  }

  return {
    tier: "extreme",
    label: "EXTREME",
    emoji: "🟣",
    colorClass: "text-secondary",
    multiplier: m.extreme,
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
