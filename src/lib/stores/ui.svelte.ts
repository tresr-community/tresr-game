/**
 * UI Signal Stores — Svelte 5 reactive state
 *
 * Module-level $state atoms for Svelte-to-Svelte UI signals.
 * Exposed via getter + named setter functions since cross-module
 * $state bindings are read-only at compile time.
 *
 * ⚠️  These are .svelte.ts atoms — only usable within the Svelte
 * compiler context. For state shared with Phaser (plain TS classes),
 * use the nanostores in src/lib/game/state.ts instead.
 *
 * Events intentionally NOT here (cross Phaser/SW boundary):
 *   tresr:claim-auth, tresr:config-tampered, tresr:gameplay-start,
 *   pwa-update-ready, notification-toast
 */

// ---------------------------------------------------------------------------
// Ban Modal
// ---------------------------------------------------------------------------

export interface BanModalPayload {
  banned_until: number;
  offence_count: number;
}

let _banModal = $state<BanModalPayload | null>(null);
export const banModal = {
  get current() {
    return _banModal;
  },
  set(value: BanModalPayload | null) {
    _banModal = value;
  },
};

// ---------------------------------------------------------------------------
// Maintenance Modal
// ---------------------------------------------------------------------------

let _maintenanceModal = $state(false);
export const maintenanceModal = {
  get current() {
    return _maintenanceModal;
  },
  set(value: boolean) {
    _maintenanceModal = value;
  },
};

// ---------------------------------------------------------------------------
// Balance Refresh Tick
// ---------------------------------------------------------------------------

let _balanceRefreshTick = $state(0);
export const balanceRefreshTick = {
  get current() {
    return _balanceRefreshTick;
  },
  /** Call to signal blockchain balances should be refreshed. */
  tick() {
    _balanceRefreshTick = Date.now();
  },
};

// ---------------------------------------------------------------------------
// Confetti Trigger
// ---------------------------------------------------------------------------

export interface ConfettiPayload {
  count?: number;
  colors?: string[];
}

let _confettiTrigger = $state<ConfettiPayload | null>(null);
export const confettiTrigger = {
  get current() {
    return _confettiTrigger;
  },
  fire(payload: ConfettiPayload = {}) {
    _confettiTrigger = payload;
    // Reset to null so the next fire() re-runs any $effect watching it.
    setTimeout(() => (_confettiTrigger = null), 0);
  },
};

// ---------------------------------------------------------------------------
// Vault Status
// ---------------------------------------------------------------------------

export interface VaultStatusPayload {
  tier: string;
  locked: boolean;
  balance: bigint;
}

let _vaultStatus = $state<VaultStatusPayload | null>(null);
export const vaultStatus = {
  get current() {
    return _vaultStatus;
  },
  set(value: VaultStatusPayload) {
    _vaultStatus = value;
  },
};

// ---------------------------------------------------------------------------
// Leaderboard Modal
// ---------------------------------------------------------------------------

let _openLeaderboard = $state(0); // tick-counter: increment to open
export const openLeaderboard = {
  get current() {
    return _openLeaderboard;
  },
  open() {
    _openLeaderboard++;
  },
};

// ---------------------------------------------------------------------------
// How-to-Play Modal
// ---------------------------------------------------------------------------

let _openHowToPlay = $state(0); // tick-counter: increment to open
export const openHowToPlay = {
  get current() {
    return _openHowToPlay;
  },
  open() {
    _openHowToPlay++;
  },
};

// ---------------------------------------------------------------------------
// Portrait Orientation (migrated from tresr:portrait-change DOM event)
// ---------------------------------------------------------------------------

let _isPortrait = $state(false);
export const isPortrait = {
  get current() {
    return _isPortrait;
  },
  set(value: boolean) {
    _isPortrait = value;
  },
};
