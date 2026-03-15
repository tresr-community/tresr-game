import type {AIBehavior, EnemyContext, BehaviorResult} from "./types";

/**
 * Passive AI: walks across the screen ignoring the player.
 * If attacked, becomes provoked and switches to chase behavior.
 */
export class PassiveBehavior implements AIBehavior {
  readonly type = "passive" as const;

  private direction: number = 1;
  private provoked: boolean = false;

  onSpawn(ctx: EnemyContext): void {
    const passiveConfig = ctx.config.gameplay.entities.enemy.ai.passive;
    ctx.speed = ctx.baseSpeed * passiveConfig.speed_mult;
    this.direction = ctx.rng.frac() < 0.5 ? 1 : -1;
    this.provoked = false;

    // Higher HP for passive enemies
    const hpMult = passiveConfig.hp_mult;
    ctx.hp = Math.round(ctx.maxHp * hpMult);
    ctx.maxHp = ctx.hp;
  }

  onDamage(ctx: EnemyContext): void {
    if (!this.provoked) {
      this.provoked = true;
      const passiveConfig = ctx.config.gameplay.entities.enemy.ai.passive;
      ctx.speed = ctx.baseSpeed * passiveConfig.provoked_speed_mult;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  update(ctx: EnemyContext, _dt: number): BehaviorResult {
    // Once provoked, chase the player like a direct enemy
    if (this.provoked) {
      if (!ctx.target) return {action: "idle"};
      return {
        action: "chase",
        targetX: ctx.target.x,
        targetGY: ctx.target.groundY,
      };
    }

    // Walk across screen
    const offscreenKillDistance =
      ctx.config.gameplay.entities.enemy.offscreen_kill_distance_px ?? 50;
    if (
      ctx.x < -offscreenKillDistance ||
      ctx.x > ctx.cameraWidth + offscreenKillDistance
    ) {
      return {action: "kill"};
    }

    ctx.setFlipX(this.direction < 0);
    ctx.setVelocityX(this.direction * ctx.speed * ctx.resolutionScale);
    ctx.setVelocityY(0);
    ctx.safePlay(ctx.animKeys.walk, true);

    return {action: "handled", ignoreHorizontalBounds: true};
  }
}
