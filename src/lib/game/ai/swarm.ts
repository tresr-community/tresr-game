import type {AIBehavior, EnemyContext, BehaviorResult} from "./types";
import {getNearbyAlliesCenter} from "./shared";

/**
 * Swarm AI: gains speed boost from nearby allies.
 * Applies a visual tint when the rush threshold is crossed.
 * Otherwise chases the player directly.
 */
export class SwarmBehavior implements AIBehavior {
  readonly type = "swarm" as const;

  private centerOfMass: {x: number; groundY: number; count: number} = {
    x: 0,
    groundY: 0,
    count: 0,
  };
  private checkCounter: number = 0;
  private rushing: boolean = false;

  onSpawn(ctx: EnemyContext): void {
    const swarmConfig = ctx.config.gameplay.entities.enemy.ai.swarm;
    ctx.speed = ctx.baseSpeed * swarmConfig.speed_mult;
    this.centerOfMass = {x: 0, groundY: 0, count: 0};
    this.checkCounter = 0;
    this.rushing = false;
  }

  update(ctx: EnemyContext, _dt: number): BehaviorResult {
    if (!ctx.target) return {action: "idle"};

    const swarmConfig = ctx.config.gameplay.entities.enemy.ai.swarm;

    // Re-evaluate ally center of mass periodically
    this.checkCounter++;
    const checkInterval = swarmConfig.check_frame_interval ?? 10;
    if (this.checkCounter >= checkInterval) {
      this.checkCounter = 0;
      this.centerOfMass = getNearbyAlliesCenter(ctx, swarmConfig.group_radius);

      // Rush tint toggle
      if (
        this.centerOfMass.count >= swarmConfig.rush_threshold &&
        !this.rushing
      ) {
        this.rushing = true;
        ctx.setTint(swarmConfig.rush_tint);
      } else if (
        this.centerOfMass.count < swarmConfig.rush_threshold &&
        this.rushing
      ) {
        this.rushing = false;
        ctx.clearTint();
      }
    }

    // Speed scales with nearby allies
    const swarmMult = Math.min(
      swarmConfig.max_speed_mult,
      1 + this.centerOfMass.count * swarmConfig.speed_bonus_per_ally
    );
    ctx.speed = ctx.baseSpeed * swarmConfig.speed_mult * swarmMult;

    // Check for attack
    const dist = Phaser.Math.Distance.Between(
      ctx.x,
      ctx.groundY,
      ctx.target.x,
      ctx.target.groundY
    );
    if (dist < ctx.attackRange) {
      if (!ctx.isAttacking) {
        ctx.safePlay(ctx.animKeys.attack, true);
      }
      ctx.setVelocityX(0);
      ctx.setVelocityY(0);
      return {action: "handled"};
    }

    // Move
    let moveX = ctx.target.x - ctx.x;
    let moveY = ctx.target.groundY - ctx.groundY;

    // If not rushing but allies are nearby, clump with them (cohesion)
    if (this.centerOfMass.count > 0 && !this.rushing) {
      const dxToGroup = this.centerOfMass.x - ctx.x;
      const dyToGroup = this.centerOfMass.groundY - ctx.groundY;
      // Weight the group pull mildly
      moveX += dxToGroup * 0.5;
      moveY += dyToGroup * 0.5;
    }

    const angle = Math.atan2(moveY, moveX);

    ctx.setFlipX(moveX < 0);
    ctx.setVelocityX(Math.cos(angle) * ctx.speed * ctx.resolutionScale);
    ctx.setVelocityY(0);
    ctx.groundY += Math.sin(angle) * ctx.speed * ctx.resolutionScale * _dt;

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
