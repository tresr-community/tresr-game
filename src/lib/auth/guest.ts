/**
 * Guest rate-limiting utilities.
 *
 * Guests are limited to N sessions per day (configured via
 * `config.gameplay.guest.max_sessions_per_day`). The count is stored in
 * localStorage keyed by `config.gameplay.guest.storage_key`.
 *
 * - `isGuestRateLimited()` — read-only check, returns true when the cap is reached.
 * - `incrementGuestSession()` — bumps the counter after a game actually completes.
 */

import {config} from "@/lib/config/client";
import {log} from "@/lib/utils/log";

const COMPONENT_NAME = "GuestRateLimit";

interface GuestSessionData {
  count: number;
  date: string;
}

function getSessionData(): GuestSessionData {
  const key = config.gameplay.guest.storage_key;
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return {count: 0, date: ""};
    return JSON.parse(stored) as GuestSessionData;
  } catch {
    return {count: 0, date: ""};
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Read-only check: has the guest exhausted their daily sessions?
 */
export function isGuestRateLimited(): boolean {
  const maxSessions = config.gameplay.guest.max_sessions_per_day;
  const data = getSessionData();
  const today = todayKey();

  // New day — not limited.
  if (data.date !== today) return false;

  const limited = data.count >= maxSessions;
  if (limited) {
    log.info(
      COMPONENT_NAME,
      `Guest rate limit reached: ${data.count}/${maxSessions}`
    );
  }
  return limited;
}

/**
 * Increment the guest session counter. Call this after a game finishes
 * (victory or defeat), not before.
 */
export function incrementGuestSession(): void {
  const key = config.gameplay.guest.storage_key;
  const maxSessions = config.gameplay.guest.max_sessions_per_day;
  const today = todayKey();
  const data = getSessionData();

  if (data.date !== today) {
    data.count = 0;
    data.date = today;
  }

  data.count++;

  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage unavailable (private browsing, etc.) — best effort
  }

  log.info(
    COMPONENT_NAME,
    `Guest session recorded: ${data.count}/${maxSessions}`
  );
}
