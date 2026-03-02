import type {AIBehavior, EnemyContext, BehaviorResult} from "./types";
import {countNearbyAllies} from "./shared";

/**
 * Swarm AI: gains speed boost from nearby allies.
 * Applies a visual tint when the rush threshold is crossed.
 * Otherwise chases the player directly.
 */
export class SwarmBehavior implements AIBehavior {
  readonly type = "swarm" as const;

  private nearbyCount: number = 0;
  private checkCounter: number = 0;
  private rushing: boolean = false;

  onSpawn(ctx: EnemyContext): void {
    const swarmConfig = ctx.config.gameplay.entities.enemy.ai.swarm;
    ctx.speed = ctx.baseSpeed * swarmConfig.speed_mult;
    this.nearbyCount = 0;
    this.checkCounter = 0;
    this.rushing = false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  update(ctx: EnemyContext, _dt: number): BehaviorResult {
    if (!ctx.target) return {action: "idle"};

    const swarmConfig = ctx.config.gameplay.entities.enemy.ai.swarm;

    // Re-evaluate ally count periodically
    this.checkCounter++;
    const checkInterval = swarmConfig.check_frame_interval ?? 10;
    if (this.checkCounter >= checkInterval) {
      this.checkCounter = 0;
      this.nearbyCount = countNearbyAllies(ctx, swarmConfig.group_radius);

      // Rush tint toggle
      if (this.nearbyCount >= swarmConfig.rush_threshold && !this.rushing) {
        this.rushing = true;
        ctx.setTint(swarmConfig.rush_tint);
      } else if (
        this.nearbyCount < swarmConfig.rush_threshold &&
        this.rushing
      ) {
        this.rushing = false;
        ctx.clearTint();
      }
    }

    // Speed scales with nearby allies
    const swarmMult = Math.min(
      swarmConfig.max_speed_mult,
      1 + this.nearbyCount * swarmConfig.speed_bonus_per_ally
    );
    ctx.speed = ctx.baseSpeed * swarmConfig.speed_mult * swarmMult;

    return {
      action: "chase",
      targetX: ctx.target.x,
      targetGY: ctx.target.groundY,
    };
  }
}
