/**
 * Physics-Based Anti-Cheat Limits
 *
 * Derives the **maximum physically possible** value for each scoring component
 * from the game config. These limits are used by:
 *   - The /calc page to flag per-field violations
 *   - (Future) Server-side replay_verify_plausibility() for deeper checks
 *
 * All math is deterministic and derived from the same `config` values baked
 * into the client and the satellite Wasm, so a mismatch is impossible unless
 * the config was tampered.
 */

import {config} from "@/lib/config/client";

const gp = config.gameplay;
const ent = gp.entities;

/** Total game clock in milliseconds. */
const GAME_DURATION_MS = gp.time_limit_seconds * 1_000;

/** Minimum enemy spawn interval after full difficulty escalation (ms). */
const ENEMY_MIN_SPAWN_MS = gp.difficulty_escalation.min_enemy_spawn_ms;

// ---------------------------------------------------------------------------
// Max Keys
// ---------------------------------------------------------------------------

/**
 * Hard upper bound enforced by the satellite, also reflected in the UI.
 * The key spawner has its own rate (2 000 ms) but the satellite hard-caps at
 * max_keys, which is the binding constraint.
 */
export const maxKeys = (): number => gp.max_keys; // 150

// ---------------------------------------------------------------------------
// Max Enemy Kills
// ---------------------------------------------------------------------------

/**
 * Upper bound on enemy kills.
 *
 * Enemies spawn at a baseline rate that accelerates via difficulty escalation
 * down to `min_enemy_spawn_ms`. We use the minimum interval (most generous to
 * the player) to compute the total that could theoretically spawn. A 25%
 * margin accommodates burst spawning.
 */
export const maxEnemyKills = (): number => {
  const totalSpawned = Math.floor(GAME_DURATION_MS / ENEMY_MIN_SPAWN_MS);
  return Math.ceil(totalSpawned * 1.25); // 25 % buffer for burst waveS
};

// ---------------------------------------------------------------------------
// Max Boss Hits
// ---------------------------------------------------------------------------

/**
 * Upper bound on boss hits.
 *
 * The boss has a fixed HP pool; each player melee does fixed damage.
 * There is exactly ONE boss per session (not re-spawnable).
 *
 * boss_hp / player_damage  →  50 / 25 = 2 hits exactly
 */
export const maxBossHits = (): number => {
  const bossHp = ent.boss.health; // 50
  const playerDmg = ent.player.damage; // 25
  return Math.ceil(bossHp / playerDmg); // 2
};

// ---------------------------------------------------------------------------
// Max Super Hits
// ---------------------------------------------------------------------------

/**
 * Upper bound on super hits.
 *
 * Each super activation requires a full charge (100%) earned by killing
 *   `max_charge / charge_per_kill`  =  100 / 10  =  10 enemies.
 * Each activation fires `max_projectiles` (3) projectiles → 3 "Super" score events.
 *
 * max_super_fires  = floor(maxEnemyKills() / kills_per_charge)
 * max_super_hits   = max_super_fires × max_projectiles
 */
export const maxSuperHits = (): number => {
  const {charge_per_kill, max_charge, max_projectiles} = ent.player.super;
  const killsPerCharge = max_charge / charge_per_kill; // 10
  const maxFires = Math.floor(maxEnemyKills() / killsPerCharge);
  return maxFires * max_projectiles;
};

// ---------------------------------------------------------------------------
// Convenience bundle
// ---------------------------------------------------------------------------

export interface PhysicsLimits {
  keys: number;
  kills: number;
  bossHits: number;
  superHits: number;
}

let _cached: PhysicsLimits | null = null;

/**
 * Returns the maximum physically possible value for each scoring input.
 * Memoised — config values are immutable at runtime.
 */
export const getPhysicsLimits = (): PhysicsLimits => {
  if (_cached) return _cached;
  _cached = {
    keys: maxKeys(),
    kills: maxEnemyKills(),
    bossHits: maxBossHits(),
    superHits: maxSuperHits(),
  };
  return _cached;
};
