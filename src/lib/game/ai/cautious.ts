import Phaser from "phaser";
import type {AIBehavior, EnemyContext, BehaviorResult} from "./types";
import {countNearbyAllies} from "./shared";

/**
 * Cautious AI: strafes laterally at a preferred distance when solo.
 * Once enough allies gather nearby (pack_threshold), charges in.
 * If allies die mid-charge and count drops, retreats to strafe.
 */
export class CautiousBehavior implements AIBehavior {
  readonly type = "cautious" as const;

  private charging: boolean = false;
  private checkCounter: number = 0;
  private nearbyCount: number = 0;
  private strafeDir: number = 1;
  private strafeTimer: number = 0;
  private strafePatienceTimer: number = 0;

  onSpawn(ctx: EnemyContext): void {
    const cautiousConfig = ctx.config.gameplay.entities.enemy.ai.cautious;
    ctx.speed = ctx.baseSpeed * cautiousConfig.speed_mult;
    this.charging = false;
    this.checkCounter = 0;
    this.nearbyCount = 0;
    this.strafeDir = ctx.rng.frac() < 0.5 ? 1 : -1;
    this.strafeTimer = 0;
    this.strafePatienceTimer = 0;
  }

  update(ctx: EnemyContext, dt: number): BehaviorResult {
    if (!ctx.target) return {action: "idle"};

    const cautiousConfig = ctx.config.gameplay.entities.enemy.ai.cautious;
    const distToPlayer = Phaser.Math.Distance.Between(
      ctx.x,
      ctx.groundY,
      ctx.target.x,
      ctx.target.groundY
    );

    // Count nearby allies periodically
    this.checkCounter++;
    const checkInterval = cautiousConfig.check_frame_interval ?? 10;
    if (this.checkCounter >= checkInterval) {
      this.checkCounter = 0;
      this.nearbyCount = countNearbyAllies(ctx, cautiousConfig.group_radius);

      // Toggle charge state based on ally count OR patience limit
      const lostPatience = this.strafePatienceTimer > 5.0;
      if (
        (this.nearbyCount >= cautiousConfig.pack_threshold || lostPatience) &&
        !this.charging
      ) {
        this.charging = true;
        ctx.speed = ctx.baseSpeed * cautiousConfig.charge_speed_mult;
      } else if (
        this.nearbyCount < cautiousConfig.pack_threshold &&
        !lostPatience &&
        this.charging
      ) {
        this.charging = false;
        ctx.speed = ctx.baseSpeed * cautiousConfig.strafe_speed_mult;
      }
    }

    // When not charging: strafe laterally at preferred distance
    if (!this.charging) {
      this.strafePatienceTimer += dt;
      const preferred = cautiousConfig.preferred_distance;

      // Flip strafe direction periodically
      this.strafeTimer += dt;
      if (this.strafeTimer > cautiousConfig.strafe_switch_time) {
        this.strafeDir *= -1;
        this.strafeTimer = 0;
      }

      if (distToPlayer < preferred * 0.7) {
        // Too close — actively retreat
        const retreatAngle = Math.atan2(
          ctx.groundY - ctx.target.groundY,
          ctx.x - ctx.target.x
        );
        ctx.setFlipX(ctx.target.x < ctx.x);
        ctx.setVelocityX(
          Math.cos(retreatAngle) * ctx.speed * ctx.resolutionScale
        );
        ctx.setVelocityY(0);
        ctx.groundY +=
          Math.sin(retreatAngle) * ctx.speed * ctx.resolutionScale * dt;

        if (ctx.walkableArea) {
          const clamped = ctx.walkableArea.clampToWalkable(ctx.x, ctx.groundY);
          ctx.groundY = clamped.groundY;
        }

        ctx.safePlay(ctx.animKeys.walk, true);
        return {action: "handled"};
      } else if (distToPlayer <= preferred * 1.3) {
        // Within strafe zone — move perpendicular to player
        const dxP = ctx.target.x - ctx.x;
        const dyP = ctx.target.groundY - ctx.groundY;
        // Apply 2.5D math
        const dyCorrected = dyP / 0.4;
        const dP = Math.sqrt(dxP * dxP + dyCorrected * dyCorrected);
        if (dP > 1) {
          const perpX = (-dyCorrected / dP) * this.strafeDir;
          const perpY = (dxP / dP) * this.strafeDir;
          const moveAngle = Math.atan2(perpY * 0.4, perpX);

          ctx.setFlipX(ctx.target.x < ctx.x);
          ctx.setVelocityX(
            Math.cos(moveAngle) * ctx.speed * ctx.resolutionScale
          );
          ctx.setVelocityY(0);
          ctx.groundY +=
            Math.sin(moveAngle) * ctx.speed * ctx.resolutionScale * dt;

          if (ctx.walkableArea) {
            const clamped = ctx.walkableArea.clampToWalkable(
              ctx.x,
              ctx.groundY
            );
            ctx.groundY = clamped.groundY;
          }
        }

        ctx.safePlay(ctx.animKeys.walk, true);
        return {action: "handled"};
      }
      // Too far — fall through to chase
    } else {
      // If we made a successful attack in a charge, we reset patience
      if (distToPlayer < ctx.attackRange) {
        this.strafePatienceTimer = 0;
      }
    }

    // Charging or too far from preferred distance: chase the player
    return {
      action: "chase",
      targetX: ctx.target.x,
      targetGY: ctx.target.groundY,
    };
  }
}
