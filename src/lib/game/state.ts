/**
 * GameStateManager — encapsulated game state with validated actions.
 *
 * Write API (`gameActions`): called only from game code, validates all inputs.
 * Read API (`gameState`): safe for UI components, exposes subscribe() and get().
 *
 * The internal nanostore is NOT exported and NOT accessible from window.
 */

import {map} from "nanostores";

export interface MusicState {
  isPlaying: boolean;
  currentTrack: string;
  musicVolume: number;
  sfxVolume: number;
  currentTime: number;
  duration: number;
}

export interface GameState {
  hp: number;
  lives: number;
  score: number;
  keys: number;
  timer: number;
  enemiesKilled: number;
  phase: "survival" | "boss" | "victory" | "lost";
  isPaused: boolean;
  configTampered: boolean;
  superCharge: number;
  bossHp: number;
  bossMaxHp: number;
  music: MusicState;
}

const INITIAL_STATE: GameState = {
  hp: 0,
  lives: 1,
  score: 0,
  keys: 0,
  timer: 0,
  enemiesKilled: 0,
  phase: "survival",
  isPaused: false,
  configTampered: false,
  superCharge: 0,
  bossHp: 0,
  bossMaxHp: 0,
  music: {
    isPlaying: false,
    currentTrack: "",
    musicVolume: 0,
    sfxVolume: 0,
    currentTime: 0,
    duration: 0,
  },
};

const store = map<GameState>({...INITIAL_STATE});

// ---------------------------------------------------------------------------
// Write API — validated actions, called only from game code
// ---------------------------------------------------------------------------

export const gameActions = {
  /** Set player HP (clamped to >= 0) */
  setHp(hp: number) {
    store.setKey("hp", Math.max(0, hp));
  },

  /** Set lives count */
  setLives(lives: number) {
    store.setKey("lives", Math.max(0, lives));
  },

  /** Decrement lives by 1 */
  decrementLives() {
    const current = store.get().lives;
    store.setKey("lives", Math.max(0, current - 1));
  },

  /** Add to the current score (clamped to >= 0) */
  addScore(amount: number) {
    const current = store.get().score;
    store.setKey("score", Math.max(0, current + amount));
  },

  /** Set the score directly (clamped to >= 0) */
  setScore(score: number) {
    store.setKey("score", Math.max(0, score));
  },

  /** Increment collected key count */
  collectKey() {
    store.setKey("keys", store.get().keys + 1);
  },

  /** Set key count directly */
  setKeys(keys: number) {
    store.setKey("keys", Math.max(0, keys));
  },

  /** Update the countdown timer (clamped to >= 0) */
  setTimer(seconds: number) {
    store.setKey("timer", Math.max(0, seconds));
  },

  /** Transition to a new game phase */
  setPhase(phase: GameState["phase"]) {
    store.setKey("phase", phase);
  },

  /** Toggle or set pause state */
  togglePause() {
    store.setKey("isPaused", !store.get().isPaused);
  },

  setPaused(paused: boolean) {
    store.setKey("isPaused", paused);
  },

  /** Increment enemy kill counter (ticket #181) */
  incrementEnemiesKilled() {
    store.setKey("enemiesKilled", store.get().enemiesKilled + 1);
  },

  /** Mark config as tampered (one-way, cannot be un-tampered) */
  setConfigTampered() {
    store.setKey("configTampered", true);
  },

  /** Set super charge (clamped 0 to max) */
  setSuperCharge(value: number, max: number = 100) {
    store.setKey("superCharge", Math.max(0, Math.min(value, max)));
  },

  /** Add super charge (clamped to max) */
  addSuperCharge(amount: number, max: number) {
    const current = store.get().superCharge;
    store.setKey("superCharge", Math.min(current + amount, max));
  },

  /** Reset super charge to 0 */
  resetSuperCharge() {
    store.setKey("superCharge", 0);
  },

  /** Atomic super attack: check charge >= max and reset to 0 in one operation (ticket #226) */
  attemptSuperAttack(maxCharge: number): boolean {
    if (store.get().superCharge < maxCharge) return false;
    store.setKey("superCharge", 0);
    return true;
  },

  /** Update boss HP for HUD display */
  setBossHp(hp: number, maxHp?: number) {
    // Set maxHp BEFORE hp so subscribers never see bossMaxHp=0 with bossHp>0
    // (division by zero would produce Infinity, crashing the progress element)
    if (maxHp !== undefined) {
      store.setKey("bossMaxHp", Math.max(0, maxHp));
    }
    store.setKey("bossHp", Math.max(0, hp));
  },

  /** Update music state (partial merge) */
  updateMusic(partial: Partial<MusicState>) {
    store.setKey("music", {...store.get().music, ...partial});
  },

  /** Reset to initial state */
  reset() {
    const keys = Object.keys(INITIAL_STATE) as (keyof GameState)[];
    for (const key of keys) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.setKey(key, (INITIAL_STATE as any)[key]);
    }
  },
};

// ---------------------------------------------------------------------------
// Read API — safe for UI components (no setKey exposed)
// ---------------------------------------------------------------------------

export const gameState = {
  subscribe: store.subscribe.bind(store),
  get: store.get.bind(store),
};
