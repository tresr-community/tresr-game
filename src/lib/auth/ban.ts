/**
 * Anti-Cheat Ban System — Client-Side Offense Recording
 *
 * Records offenses and applies escalating bans on the user's Juno profile.
 *
 * SECURITY NOTE: This is client-side enforcement only — a deterrent, not a hard
 * enforcement boundary. Full security requires server-side enforcement in the
 * Juno satellite (see satellite/src/lib.rs).
 */

import {getUserProfile, saveUserProfile} from "@/lib/user";
import {log} from "@/lib/utils/log";

const COMPONENT_NAME = "BanSystem";

/**
 * Escalating ban durations in milliseconds.
 * Must match `server.anti_cheat.ban_durations_hours` in tresr.yaml: [24, 72, 168]
 */
const BAN_DURATIONS_MS = [
  24 * 60 * 60 * 1000, // 1st offense: 24 hours
  72 * 60 * 60 * 1000, // 2nd offense: 72 hours
  168 * 60 * 60 * 1000, // 3rd offense: 168 hours (7 days)
];

/**
 * Offense count at which the ban becomes permanent.
 * Must match `server.anti_cheat.permanent_after_offence` in tresr.yaml: 4
 */
const PERMANENT_AFTER_OFFENCE = 4;

/** Far-future timestamp for permanent bans (serializable, not Infinity). */
const PERMANENT_BAN_MS = Number.MAX_SAFE_INTEGER;

/**
 * Calculate ban duration for a given offense count.
 */
function getBanDurationMs(offenceCount: number): number {
  if (offenceCount >= PERMANENT_AFTER_OFFENCE) {
    return PERMANENT_BAN_MS;
  }
  const idx = Math.max(0, offenceCount - 1);
  return BAN_DURATIONS_MS[idx] ?? BAN_DURATIONS_MS[BAN_DURATIONS_MS.length - 1];
}

/**
 * Record an offense on the user's profile and apply an escalating ban.
 *
 * @param principal The user's Principal ID (Juno document key)
 * @param reason One of the configured ban_reasons from tresr.yaml
 * @param sessionId Optional game session ID for audit trail
 */
export async function recordOffense(
  principal: string,
  reason: string,
  sessionId?: string
): Promise<void> {
  try {
    const userDoc = await getUserProfile(principal);
    if (!userDoc) {
      log.warn(
        COMPONENT_NAME,
        "Cannot record offense: user profile not found for",
        principal
      );
      return;
    }

    const profile = userDoc.data;
    const newCount = (profile.offence_count ?? 0) + 1;
    const banDurationMs = getBanDurationMs(newCount);

    const bannedUntil =
      banDurationMs === PERMANENT_BAN_MS
        ? PERMANENT_BAN_MS
        : Date.now() + banDurationMs;

    profile.offence_count = newCount;
    profile.banned_until = bannedUntil;

    // Juno: setDoc on "users" → Rust assert_user_profile() then on_set_doc (no-op).
    // NOTE: Server-side enforcement also exists in Rust claim_authorize() → apply_ban().
    await saveUserProfile(principal, profile, userDoc.version);

    // Also set device-level ban so guests can't bypass (ticket #203)
    setDeviceBan(bannedUntil, newCount);

    log.warn(
      COMPONENT_NAME,
      `Offense recorded: principal=${principal.substring(0, 8)}..., ` +
        `reason=${reason}, offence_count=${newCount}, ` +
        `banned_until=${bannedUntil}, sessionId=${sessionId ?? "N/A"}`
    );
  } catch (err) {
    // Don't crash the game on ban write failure
    log.error(
      COMPONENT_NAME,
      "Failed to record offense:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Check if a user is currently banned.
 * Returns the ban details if banned, or null if not banned.
 */
export async function checkBanStatus(
  principal: string
): Promise<{bannedUntil: number; offenceCount: number} | null> {
  try {
    const userDoc = await getUserProfile(principal);
    if (!userDoc) return null;

    const {banned_until, offence_count} = userDoc.data;
    if (banned_until != null && banned_until > Date.now()) {
      return {
        bannedUntil: banned_until,
        offenceCount: offence_count ?? 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

const DEVICE_BAN_KEY = "tresr_device_ban";

/**
 * Set a device-level ban flag in localStorage so bans persist
 * across guest/authenticated modes (ticket #203).
 */
export function setDeviceBan(bannedUntil: number, offenceCount: number): void {
  try {
    localStorage.setItem(
      DEVICE_BAN_KEY,
      JSON.stringify({bannedUntil, offenceCount})
    );
  } catch {
    // localStorage unavailable — best-effort
  }
}

/**
 * Check for a device-level ban stored in localStorage.
 * Returns ban details if active, null otherwise.
 */
export function checkDeviceBan(): {
  bannedUntil: number;
  offenceCount: number;
} | null {
  try {
    const stored = localStorage.getItem(DEVICE_BAN_KEY);
    if (!stored) return null;
    const data = JSON.parse(stored) as {
      bannedUntil: number;
      offenceCount: number;
    };
    if (data.bannedUntil > Date.now()) {
      return data;
    }
    // Ban expired — clean up
    localStorage.removeItem(DEVICE_BAN_KEY);
    return null;
  } catch {
    return null;
  }
}
