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
    const lateralOffset =
      Math.sin(this.timer * erraticConfig.zigzag_frequency * Math.PI * 2) *
      erraticConfig.zigzag_amplitude;

    // Perpendicular offset: rotate the direction-to-player by 90°
    const dxToPlayer = ctx.target.x - ctx.x;
    const dyToPlayer = ctx.target.groundY - ctx.groundY;
    const distToP = Math.sqrt(
      dxToPlayer * dxToPlayer + dyToPlayer * dyToPlayer
    );

    let targetX = ctx.target.x;
    let targetGY = ctx.target.groundY;

    if (distToP > 1) {
      const perpX = -dyToPlayer / distToP;
      const perpGY = dxToPlayer / distToP;
      targetX = ctx.target.x + perpX * lateralOffset;
      targetGY = ctx.target.groundY + perpGY * lateralOffset;
    }

    return {action: "chase", targetX, targetGY};
  }
}
