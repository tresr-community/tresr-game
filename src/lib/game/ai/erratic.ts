import type {AIBehavior, EnemyContext, BehaviorResult} from "./types";

/**
 * Erratic AI: snakes toward the player with continuous sine-wave zigzag.
 * Visibly weaves side-to-side — hard to track and predict.
 */
export class ErraticBehavior implements AIBehavior {
  readonly type = "erratic" as const;

  private timer: number = 0;

  onSpawn(ctx: EnemyContext): void {
    const erraticConfig = ctx.config.gameplay.entities.enemy.ai.erratic;
    ctx.speed = ctx.baseSpeed * erraticConfig.speed_mult;
    this.timer = 0;
  }

  update(ctx: EnemyContext, dt: number): BehaviorResult {
    if (!ctx.target) return {action: "idle"};

    this.timer += dt;

    const erraticConfig = ctx.config.gameplay.entities.enemy.ai.erratic;

    const dxToTarget = ctx.target.x - ctx.x;
    const dyToTarget = ctx.target.groundY - ctx.groundY;

    // Correct dy for 2.5D math
    const dyCorrected = dyToTarget / 0.4;
    const dist = Math.sqrt(dxToTarget * dxToTarget + dyCorrected * dyCorrected);

    if (dist < ctx.attackRange) {
      if (!ctx.isAttacking) {
        ctx.safePlay(ctx.animKeys.attack, true);
      }
      ctx.setVelocityX(0);
      ctx.setVelocityY(0);
      return {action: "handled"};
    }

    let dirX = 0;
    let dirY = 0;
    if (dist > 0.1) {
      dirX = dxToTarget / dist;
      dirY = dyCorrected / dist;
    }

    // Tangential vector (perpendicular)
    const perpX = -dirY;
    const perpY = dirX;

    // Apply lateral velocity based on the derivative of the sine wave
    const lateralVelocity =
      Math.cos(this.timer * erraticConfig.zigzag_frequency * Math.PI * 2) *
      erraticConfig.zigzag_amplitude *
      (erraticConfig.zigzag_frequency * Math.PI * 2);

    let moveX = dirX * ctx.speed + perpX * lateralVelocity;
    let moveY = dirY * ctx.speed + perpY * lateralVelocity;

    const mag = Math.sqrt(moveX * moveX + moveY * moveY);
    if (mag > 0) {
      moveX = (moveX / mag) * ctx.speed;
      moveY = (moveY / mag) * ctx.speed;
    }

    const worldMoveAngle = Math.atan2(moveY * 0.4, moveX);

    ctx.setFlipX(ctx.target.x < ctx.x);
    ctx.setVelocityX(
      Math.cos(worldMoveAngle) * ctx.speed * ctx.resolutionScale
    );
    ctx.setVelocityY(0);
    ctx.groundY +=
      Math.sin(worldMoveAngle) * ctx.speed * ctx.resolutionScale * dt;

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
