import Phaser from "phaser";
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
    // Guard: no target, or target groundY is 0 (uninitialized player position).
    // Chasing groundY=0 sends the enemy toward the top-left corner off-screen.
    if (!ctx.target || !ctx.target.groundY) return {action: "idle"};

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

    // --- Build movement vector ---
    // Use normalised, independently-weighted vectors so cohesion can never
    // cancel out the player-chase direction and freeze the enemy.
    const chaseLen = Phaser.Math.Distance.Between(
      ctx.x,
      ctx.groundY,
      ctx.target.x,
      ctx.target.groundY
    );
    let moveX = chaseLen > 0 ? (ctx.target.x - ctx.x) / chaseLen : 0;
    let moveY =
      chaseLen > 0 ? (ctx.target.groundY - ctx.groundY) / chaseLen : 0;

    // Cohesion: blend toward group center only when not rushing.
    // Weight is mild (0.25) so it nudges clustering without fighting the chase.
    if (this.centerOfMass.count > 0 && !this.rushing) {
      const dxToGroup = this.centerOfMass.x - ctx.x;
      const dyToGroup = this.centerOfMass.groundY - ctx.groundY;
      const groupLen = Math.sqrt(dxToGroup * dxToGroup + dyToGroup * dyToGroup);
      if (groupLen > 1) {
        moveX += (dxToGroup / groupLen) * 0.25;
        moveY += (dyToGroup / groupLen) * 0.25;
      }
    }

    const angle = Math.atan2(moveY, moveX);
    const vx = Math.cos(angle) * ctx.speed * ctx.resolutionScale;
    const vy = Math.sin(angle) * ctx.speed * ctx.resolutionScale;

    ctx.setFlipX(moveX < 0);
    ctx.setVelocityX(vx);
    ctx.setVelocityY(0);
    ctx.groundY += vy * _dt;

    // Clamp groundY to walkable band, then apply wall-slide so the enemy
    // redirects along the boundary instead of vibrating against it.
    if (ctx.walkableArea) {
      const prevGroundY = ctx.groundY;
      const clamped = ctx.walkableArea.clampToWalkable(ctx.x, ctx.groundY);
      ctx.groundY = clamped.groundY;

      // If Y was clamped we hit an edge wall — slide horizontally instead
      // of stalling (keeps the enemy moving rather than getting stuck).
      if (Math.abs(clamped.groundY - prevGroundY) > 0.5) {
        ctx.groundY = clamped.groundY; // already set above
        // Don't zero X velocity — let the horizontal component carry through
      }
    }

    if (!ctx.isAttacking) {
      ctx.safePlay(ctx.animKeys.walk, true);
    }

    return {action: "handled"};
  }
}
