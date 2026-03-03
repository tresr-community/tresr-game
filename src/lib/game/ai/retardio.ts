import Phaser from "phaser";
import type {
  AIBehavior,
  EnemyContext,
  BehaviorResult,
  GroupMemberView,
} from "./types";
import {findNearestEnemy} from "./shared";

/**
 * Retardio AI: chaotic enemy that attacks OTHER enemies.
 * Walks around erratically punching non-retardio enemies.
 * Re-targets periodically or when target dies.
 */
export class RetardioBehavior implements AIBehavior {
  readonly type = "retardio" as const;

  private retardioTarget: GroupMemberView | undefined;
  private retargetTimer: number = 0;
  private attackTimer: number = 0;
  private jitterOffset: {x: number; y: number} = {x: 0, y: 0};
  private jitterTimer: number = 0;

  onSpawn(ctx: EnemyContext): void {
    const retardioConfig = ctx.config.gameplay.entities.enemy.ai.retardio;
    ctx.speed = ctx.baseSpeed * (retardioConfig?.speed_mult ?? 1.1);
    this.retardioTarget = undefined;
    this.retargetTimer = 0;
    this.attackTimer = 0;
    this.jitterOffset = {x: 0, y: 0};
    this.jitterTimer = 0;
  }

  update(ctx: EnemyContext, dt: number): BehaviorResult {
    const retardioConfig = ctx.config.gameplay.entities.enemy.ai.retardio;
    const jitterTime = retardioConfig?.jitter_time ?? 0.3;

    this.retargetTimer += dt;
    this.attackTimer += dt;
    this.jitterTimer += dt;

    // Re-pick target periodically or if current target is dead
    if (
      !this.retardioTarget ||
      !this.retardioTarget.active ||
      this.retardioTarget.hp <= 0 ||
      this.retargetTimer > (retardioConfig?.retarget_time ?? 4)
    ) {
      this.retargetTimer = 0;
      this.retardioTarget = findNearestEnemy(ctx);
    }

    if (this.retardioTarget) {
      const targetGY = this.retardioTarget.groundY;

      // Add erratic jitter (bug fix: use hardcoded values instead of erratic config)
      if (this.jitterTimer > jitterTime) {
        this.jitterOffset = {
          x: (ctx.rng.frac() - 0.5) * 80,
          y: (ctx.rng.frac() - 0.5) * 40,
        };
        this.jitterTimer = 0;
      }

      const dx = this.retardioTarget.x - ctx.x;
      const dy = targetGY - ctx.groundY;
      const dist = Phaser.Math.Distance.Between(
        ctx.x,
        ctx.groundY,
        this.retardioTarget.x,
        targetGY
      );
      ctx.setFlipX(dx < 0);

      if (dist < ctx.attackRange) {
        // Punch the other enemy
        ctx.safePlay(ctx.animKeys.attack, true);
        ctx.setVelocityX(0);
        ctx.setVelocityY(0);

        // Deal damage on cooldown
        if (this.retardioTarget.active && this.retardioTarget.hp > 0) {
          const attackCooldown = retardioConfig?.attack_cooldown_s ?? 0.5;
          if (this.attackTimer > attackCooldown) {
            this.retardioTarget.takeDamage(retardioConfig?.attack_damage ?? 10);
            this.attackTimer = 0;
          }
        }
      } else {
        const moveDirX = dx + this.jitterOffset.x;
        const moveDirY = dy + this.jitterOffset.y;
        const moveAngle = Math.atan2(moveDirY, moveDirX);

        ctx.setVelocityX(Math.cos(moveAngle) * ctx.speed * ctx.resolutionScale);
        ctx.setVelocityY(0);
        ctx.groundY +=
          Math.sin(moveAngle) * ctx.speed * ctx.resolutionScale * dt;

        if (ctx.walkableArea) {
          const clamped = ctx.walkableArea.clampToWalkable(ctx.x, ctx.groundY);
          ctx.groundY = clamped.groundY;
        }

        ctx.safePlay(ctx.animKeys.walk, true);
      }

      return {action: "handled"};
    }

    // No enemies nearby — wander erratically
    if (this.jitterTimer > jitterTime) {
      ctx.setFlipX(ctx.rng.frac() < 0.5);
      ctx.setVelocityX(
        (ctx.rng.frac() - 0.5) * ctx.speed * ctx.resolutionScale
      );
      this.jitterTimer = 0;
    }
    ctx.setVelocityY(0);
    ctx.safePlay(ctx.animKeys.walk, true);

    return {action: "handled"};
  }
}
