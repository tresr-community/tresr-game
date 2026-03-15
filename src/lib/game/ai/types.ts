import type Phaser from "phaser";
import type {WalkableArea} from "@/lib/game/WalkableArea";
import type {ConfigTypes} from "@/types/config";

/** AI behavior types for enemy variety. */
export type EnemyAIType =
  | "direct"
  | "flanker"
  | "cautious"
  | "erratic"
  | "swarm"
  | "passive"
  | "retardio";

/**
 * Context exposed to AI behaviors by the Enemy host.
 * Deliberately hides Phaser internals so strategies remain
 * decoupled from the rendering engine.
 */
export interface EnemyContext {
  // --- Position (2.5D) ---
  readonly x: number;
  groundY: number;

  // --- Movement ---
  readonly baseSpeed: number;
  speed: number;
  readonly resolutionScale: number;
  readonly attackRange: number;

  // --- Health ---
  hp: number;
  maxHp: number;

  // --- Animation ---
  readonly animKeys: Readonly<{
    idle: string;
    walk: string;
    attack: string;
    hurt: string;
  }>;
  safePlay(key: string, ignoreIfPlaying?: boolean): void;
  readonly isAttacking: boolean;

  // --- Physics (write) ---
  setFlipX(flip: boolean): void;
  setVelocityX(vx: number): void;
  setVelocityY(vy: number): void;
  setTint(tint: number): void;
  clearTint(): void;

  // --- Environment ---
  readonly walkableArea: WalkableArea | undefined;
  readonly cameraWidth: number;

  // --- Targeting ---
  readonly target: {readonly x: number; readonly groundY: number} | undefined;

  // --- Group access (for swarm/cautious/retardio) ---
  readonly enemyGroup: Phaser.Physics.Arcade.Group | undefined;

  // --- Config ---
  readonly config: ConfigTypes;

  // --- RNG ---
  readonly rng: Phaser.Math.RandomDataGenerator;

  // --- Identity (for group filtering) ---
  readonly _self: object;
  readonly aiTypeName: string;
}

/**
 * Minimal view of another enemy, used by strategies that scan the group.
 */
export interface GroupMemberView {
  readonly _self: object;
  readonly active: boolean;
  readonly hp: number;
  readonly x: number;
  readonly groundY: number;
  readonly aiTypeName: string;
  takeDamage(amount: number): void;
}

/**
 * Result returned by AIBehavior.update() telling Enemy what to do.
 */
export type BehaviorResult = (
  | {action: "chase"; targetX: number; targetGY: number}
  | {action: "handled"}
  | {action: "idle"}
  | {action: "kill"}
) & {
  /** If true, Enemy.ts will not forcefully clamp this enemy's X position to the screen edge. */
  ignoreHorizontalBounds?: boolean;
};

/**
 * Interface that all AI behavior strategies must implement.
 */
export interface AIBehavior {
  readonly type: EnemyAIType;

  /** Called when the enemy spawns or recycles from pool. Reset all per-spawn state. */
  onSpawn(ctx: EnemyContext): void;

  /** Main AI tick. Returns an intent for the Enemy host to execute. */
  update(ctx: EnemyContext, dt: number): BehaviorResult;

  /** Optional hook called when the enemy takes damage. */
  onDamage?(ctx: EnemyContext): void;
}
