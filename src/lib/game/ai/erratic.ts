import type {AIBehavior, EnemyContext, BehaviorResult} from "./types";

/**
 * Erratic AI: "drunk walk" toward the player using Brownian angular noise.
 *
 * Instead of a predictable sine-wave zigzag, the heading accumulates small
 * random angular deltas each frame (brownian motion) while a mean-reversion
 * force gently pulls the heading back toward the player.  The result is an
 * organic, never-repeating weaving path that is genuinely hard to predict.
 *
 * Speed also fluctuates randomly within a configurable range so the enemy
 * occasionally lurches forward or slows to a crawl — very different from the
 * perfectly constant-speed direct chase.
 */
export class ErraticBehavior implements AIBehavior {
  readonly type = "erratic" as const;

  /** Accumulated angular offset from the "direct" bearing (radians). */
  private wanderAngle: number = 0;

  /** Current speed multiplier (fluctuates each frame). */
  private currentSpeedMult: number = 1;

  onSpawn(ctx: EnemyContext): void {
    const cfg = ctx.config.gameplay.entities.enemy.ai.erratic;
    ctx.speed = ctx.baseSpeed * cfg.speed_mult;

    // Start with a random wander angle so each spawn looks different
    this.wanderAngle = (ctx.rng.frac() - 0.5) * Math.PI * 0.5;
    this.currentSpeedMult = 1;
  }

  update(ctx: EnemyContext, dt: number): BehaviorResult {
    if (!ctx.target) return {action: "idle"};

    const cfg = ctx.config.gameplay.entities.enemy.ai.erratic;

    // --- Distance to player (2.5D corrected) ---
    const dxToTarget = ctx.target.x - ctx.x;
    const dyToTarget = ctx.target.groundY - ctx.groundY;
    const dyCorrected = dyToTarget / 0.4;
    const dist = Math.sqrt(dxToTarget * dxToTarget + dyCorrected * dyCorrected);

    // --- Attack if close enough ---
    if (dist < ctx.attackRange) {
      if (!ctx.isAttacking) {
        ctx.safePlay(ctx.animKeys.attack, true);
      }
      ctx.setVelocityX(0);
      ctx.setVelocityY(0);
      return {action: "handled"};
    }

    // --- Brownian angular drift ---
    // Add a random angular delta each frame. The magnitude is scaled by dt
    // and the drift_rate config so it's frame-rate independent.
    const angularNoise = (ctx.rng.frac() - 0.5) * 2 * cfg.drift_rate * dt;
    this.wanderAngle += angularNoise;

    // Mean-revert toward 0 (i.e. toward the direct bearing to the player).
    // Stronger reversion = more "sober", weaker = more "drunk".
    this.wanderAngle *= 1 - cfg.mean_reversion * dt;

    // Clamp to avoid extreme spiralling
    const maxAngle = Math.PI * 0.7;
    this.wanderAngle = Math.max(
      -maxAngle,
      Math.min(maxAngle, this.wanderAngle)
    );

    // --- Speed fluctuation ---
    // Random walk toward a target multiplier between (1 - variance) and (1 + variance)
    const targetMult = 1 + (ctx.rng.frac() - 0.5) * 2 * cfg.speed_variance;
    // Smoothly interpolate toward the target so speed changes feel organic
    this.currentSpeedMult +=
      (targetMult - this.currentSpeedMult) * Math.min(1, dt * 3);
    // Clamp to prevent extreme values
    this.currentSpeedMult = Math.max(
      1 - cfg.speed_variance,
      Math.min(1 + cfg.speed_variance, this.currentSpeedMult)
    );

    // --- Compute final movement direction ---
    let dirX = 0;
    let dirY = 0;
    if (dist > 0.1) {
      dirX = dxToTarget / dist;
      dirY = dyCorrected / dist;
    }

    // Base angle towards the player (in screen space)
    const baseAngle = Math.atan2(dirY * 0.4, dirX);

    // Apply the brownian wander offset
    const worldMoveAngle = baseAngle + this.wanderAngle;

    const effectiveSpeed = ctx.speed * this.currentSpeedMult;

    ctx.setFlipX(Math.cos(worldMoveAngle) < 0);
    ctx.setVelocityX(
      Math.cos(worldMoveAngle) * effectiveSpeed * ctx.resolutionScale
    );
    ctx.setVelocityY(0);
    ctx.groundY +=
      Math.sin(worldMoveAngle) * effectiveSpeed * ctx.resolutionScale * dt;

    if (ctx.walkableArea) {
      const clamped = ctx.walkableArea.clampToWalkable(ctx.x, ctx.groundY);
      ctx.groundY = clamped.groundY;
    }

    if (!ctx.isAttacking) {
      ctx.safePlay(ctx.animKeys.walk, true);
    }

    return {action: "handled"};
  }
}
