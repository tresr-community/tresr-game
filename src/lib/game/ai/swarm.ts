import type {AIBehavior, EnemyContext, BehaviorResult} from "./types";
import {getNearbyAlliesCenter} from "./shared";

/**
 * Swarm AI: scared alone, aggressive in groups.
 *
 * Three-phase behavior:
 * - **Walking in** (first 25% of screen): walks straight forward to clear
 *   the spawn edge before any flee/cohesion logic activates.
 * - **Scared** (< rush_threshold allies nearby): moves slowly, flees from
 *   the player if too close, and gravitates toward other swarm allies
 *   (cohesion). Looks nervous with a blue tint.
 * - **Rushing** (>= rush_threshold allies nearby): turns green, speeds up
 *   with ally count, and aggressively chases the player as a pack.
 *
 * Uses screen-space distance (no 2.5D division), matching chaseTarget().
 */
export class SwarmBehavior implements AIBehavior {
  readonly type = "swarm" as const;

  private centerOfMass: {
    x: number;
    groundY: number;
    sepX: number;
    sepY: number;
    count: number;
  } = {
    x: 0,
    groundY: 0,
    sepX: 0,
    sepY: 0,
    count: 0,
  };
  private checkCounter: number = 0;
  private rushing: boolean = false;

  /** Walk direction: 1 = right, -1 = left. Set on spawn based on spawn side. */
  private walkDir: number = 1;

  /** Whether the enemy has walked far enough in to activate AI behavior. */
  private activated: boolean = false;

  onSpawn(ctx: EnemyContext): void {
    const cfg = ctx.config.gameplay.entities.enemy.ai.swarm;
    ctx.speed = ctx.baseSpeed * cfg.scared_speed_mult;
    this.centerOfMass = {x: 0, groundY: 0, sepX: 0, sepY: 0, count: 0};
    this.checkCounter = 0;
    this.rushing = false;
    this.activated = false;

    // Walk direction based on spawn side
    this.walkDir = ctx.x < ctx.cameraWidth / 2 ? 1 : -1;

    // Start scared
    if (cfg.scared_tint !== 0) {
      ctx.setTint(cfg.scared_tint);
    }
  }

  update(ctx: EnemyContext, dt: number): BehaviorResult {
    // Guard: no target, or target groundY is 0 (uninitialized player position).
    if (!ctx.target || !ctx.target.groundY) return {action: "idle"};

    const cfg = ctx.config.gameplay.entities.enemy.ai.swarm;

    // ─── WALK-IN PHASE: walk straight until 25% of screen from edge ───
    // This prevents the scared/flee logic from immediately pushing the
    // enemy back toward the edge it spawned from.
    if (!this.activated) {
      const margin = ctx.cameraWidth * 0.25;
      const inBounds =
        this.walkDir > 0 ? ctx.x > margin : ctx.x < ctx.cameraWidth - margin;

      if (inBounds) {
        this.activated = true;
      } else {
        // Walk straight forward
        const moveSpeed = ctx.speed * ctx.resolutionScale;
        ctx.setFlipX(this.walkDir < 0);
        ctx.setVelocityX(this.walkDir * moveSpeed);
        ctx.setVelocityY(0);
        ctx.safePlay(ctx.animKeys.walk, true);
        return {action: "handled"};
      }
    }

    // Re-evaluate ally center of mass periodically
    this.checkCounter++;
    const checkInterval = cfg.check_frame_interval;
    if (this.checkCounter >= checkInterval) {
      this.checkCounter = 0;
      this.centerOfMass = getNearbyAlliesCenter(ctx, cfg.group_radius);

      // Phase transition: scared ↔ rushing
      const wasRushing = this.rushing;
      this.rushing = this.centerOfMass.count >= cfg.rush_threshold;

      if (this.rushing && !wasRushing) {
        // Gained enough allies — RUSH!
        ctx.setTint(cfg.rush_tint);
      } else if (!this.rushing && wasRushing) {
        // Lost allies — back to scared
        if (cfg.scared_tint !== 0) {
          ctx.setTint(cfg.scared_tint);
        } else {
          ctx.clearTint();
        }
      }
    }

    // ─── RUSHING: aggressive pack chase ───
    if (this.rushing) {
      // Speed scales with nearby allies
      const swarmMult = Math.min(
        cfg.max_speed_mult,
        1 + this.centerOfMass.count * cfg.speed_bonus_per_ally
      );
      ctx.speed = ctx.baseSpeed * cfg.speed_mult * swarmMult;

      const dx = ctx.target.x - ctx.x;
      const dy = ctx.target.groundY - ctx.groundY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Attack if close enough
      if (dist < ctx.attackRange) {
        if (!ctx.isAttacking) {
          ctx.safePlay(ctx.animKeys.attack, true);
        }
        ctx.setVelocityX(0);
        ctx.setVelocityY(0);
        return {action: "handled"};
      }

      // Chase the player with separation from allies
      let moveX = dist > 0.1 ? dx / dist : 0;
      let moveY = dist > 0.1 ? dy / dist : 0;

      // Separation: push apart if too close to a neighbor
      if (this.centerOfMass.count > 0) {
        moveX += this.centerOfMass.sepX * 0.5;
        moveY += this.centerOfMass.sepY * 0.5;
      }

      const angle = Math.atan2(moveY, moveX);
      const moveSpeed = ctx.speed * ctx.resolutionScale;

      ctx.setFlipX(dx < 0);
      ctx.setVelocityX(Math.cos(angle) * moveSpeed);
      ctx.setVelocityY(0);
      ctx.groundY += Math.sin(angle) * moveSpeed * dt;

      if (ctx.walkableArea) {
        const clamped = ctx.walkableArea.clampToWalkable(ctx.x, ctx.groundY);
        ctx.groundY = clamped.groundY;
      }

      if (!ctx.isAttacking) {
        ctx.safePlay(ctx.animKeys.walk, true);
      }

      return {action: "handled"};
    }

    // ─── SCARED: pinball walk until critical mass ───
    // Walk straight across the screen. Reverse at the edges. Repeat
    // until enough allies gather to form a swarm. This avoids the
    // flickering caused by competing flee/cohesion/drift vectors.
    ctx.speed = ctx.baseSpeed * cfg.scared_speed_mult;

    // Reverse at screen edges
    const edgeMargin = ctx.cameraWidth * 0.1;
    if (ctx.x < edgeMargin && this.walkDir < 0) {
      this.walkDir = 1;
    } else if (ctx.x > ctx.cameraWidth - edgeMargin && this.walkDir > 0) {
      this.walkDir = -1;
    }

    const moveSpeed = ctx.speed * ctx.resolutionScale;
    ctx.setFlipX(this.walkDir < 0);
    ctx.setVelocityX(this.walkDir * moveSpeed);
    ctx.setVelocityY(0);

    ctx.safePlay(ctx.animKeys.walk, true);

    return {action: "handled"};
  }
}
