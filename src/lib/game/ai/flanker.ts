import type {AIBehavior, EnemyContext, BehaviorResult} from "./types";

/**
 * Flanker AI: orbits the player at a set radius, then lunges in to attack.
 *
 * Four-phase state machine: orbiting → lunging → striking → recovering → orbiting…
 *
 * IMPORTANT geometry note:
 * The walkable ground area is only ~100px tall (topY≈600, bottomY≈700 on 720p)
 * but the full screen width (~1280px). The orbit uses a PERSISTENT angle that
 * accumulates across frames, creating visible circular/elliptical motion around
 * the player. Y movement is dampened by depthRatio so the orbit fits the
 * compressed ground plane.
 *
 * Movement follows the proven chaseTarget() pattern: all velocities and
 * groundY deltas are in screen-space with no additional depth scaling.
 */
export class FlankerBehavior implements AIBehavior {
  readonly type = "flanker" as const;

  private phase: "orbiting" | "lunging" | "striking" | "recovering" =
    "orbiting";

  /** General timer — drives phase transitions. */
  private timer: number = 0;

  /** Lunge-accrual timer — ticks during orbit to trigger lunges. */
  private lungeAccrued: number = 0;

  /** Randomised orbit duration for this cycle. */
  private currentOrbitTime: number = 0;

  private flankDirection: number = 1;
  private switchTimer: number = 0;

  /**
   * Persistent orbit angle (radians) — accumulates across frames.
   * This is the KEY difference from the buggy version that recomputed
   * the angle from position each frame (which produced sub-pixel movement).
   */
  private orbitAngle: number = 0;

  onSpawn(ctx: EnemyContext): void {
    const cfg = ctx.config.gameplay.entities.enemy.ai.flanker;
    ctx.speed = ctx.baseSpeed * cfg.speed_mult;
    this.phase = "orbiting";
    this.timer = 0;
    this.lungeAccrued = 0;
    this.switchTimer = 0;
    this.flankDirection = ctx.rng.frac() < 0.5 ? 1 : -1;
    this.currentOrbitTime = this.randomiseOrbitTime(ctx);

    // Initialize orbit angle from actual position so the flanker
    // doesn't teleport to a random orbit point on spawn.
    if (ctx.target) {
      this.orbitAngle = Math.atan2(
        ctx.groundY - ctx.target.groundY,
        ctx.x - ctx.target.x
      );
    } else {
      this.orbitAngle = ctx.rng.frac() * Math.PI * 2;
    }
  }

  /** Compute a randomised orbit duration for this cycle. */
  private randomiseOrbitTime(ctx: EnemyContext): number {
    const cfg = ctx.config.gameplay.entities.enemy.ai.flanker;
    const variance = cfg.orbit_time_variance;
    const lo = cfg.orbit_time * (1 - variance);
    const hi = cfg.orbit_time * (1 + variance);
    return lo + ctx.rng.frac() * (hi - lo);
  }

  update(ctx: EnemyContext, dt: number): BehaviorResult {
    if (!ctx.target) return {action: "idle"};

    this.timer += dt;
    const cfg = ctx.config.gameplay.entities.enemy.ai.flanker;
    const orbitRadius = cfg.offset;

    // Depth ratio: Y range is compressed relative to X in the ground plane.
    // The walkable Y range is ~108px while X is ~1280px.
    const depthRatio = 0.4;

    // ─── Orbiting phase: circle around the player ───
    if (this.phase === "orbiting") {
      // Switch orbit direction periodically
      this.switchTimer += dt;
      if (this.switchTimer > cfg.switch_time) {
        this.switchTimer = 0;
        this.flankDirection *= -1;
      }

      // Advance the persistent orbit angle.
      // Use 60% of max linear speed to set angular speed — this ensures the
      // flanker (moving at 100% speed) can always keep up with the orbit point.
      const moveSpeed = ctx.speed * ctx.resolutionScale;
      const angularSpeed = (moveSpeed * 0.6) / orbitRadius;
      this.orbitAngle += this.flankDirection * angularSpeed * dt;

      // Desired position on the orbit ellipse around the player
      const desiredX = ctx.target.x + Math.cos(this.orbitAngle) * orbitRadius;
      const desiredGY =
        ctx.target.groundY +
        Math.sin(this.orbitAngle) * orbitRadius * depthRatio;

      // Steer toward desired orbit position
      const dxToDesired = desiredX - ctx.x;
      const dyToDesired = desiredGY - ctx.groundY;
      const distToDesired = Math.sqrt(
        dxToDesired * dxToDesired + dyToDesired * dyToDesired
      );

      if (distToDesired > 0.5) {
        const moveAngle = Math.atan2(dyToDesired, dxToDesired);

        ctx.setVelocityX(Math.cos(moveAngle) * moveSpeed);
        ctx.setVelocityY(0);
        ctx.groundY += Math.sin(moveAngle) * moveSpeed * dt;
      } else {
        ctx.setVelocityX(0);
        ctx.setVelocityY(0);
      }

      ctx.setFlipX(ctx.target.x < ctx.x);

      if (ctx.walkableArea) {
        const clamped = ctx.walkableArea.clampToWalkable(ctx.x, ctx.groundY);
        ctx.groundY = clamped.groundY;
      }

      ctx.safePlay(ctx.animKeys.walk, true);

      // Only accrue lunge timer when close to the orbit path.
      // This prevents lunging before actually reaching orbit radius.
      if (distToDesired < 50) {
        this.lungeAccrued += dt;
      }

      // Transition to lunge after enough orbit time
      if (this.lungeAccrued >= this.currentOrbitTime) {
        this.phase = "lunging";
        this.timer = 0;
        this.lungeAccrued = 0;
        ctx.speed = ctx.baseSpeed * cfg.lunge_speed_mult;

        // Visual telegraph
        if (cfg.lunge_tint !== 0) {
          ctx.setTint(cfg.lunge_tint);
        }
      }

      return {action: "handled"};
    }

    // ─── Lunging phase: dash at the player until attack range ───
    if (this.phase === "lunging") {
      const dxToTarget = ctx.target.x - ctx.x;
      const dyToTarget = ctx.target.groundY - ctx.groundY;
      const dist = Math.sqrt(dxToTarget * dxToTarget + dyToTarget * dyToTarget);

      // Reached attack range — play the attack and enter striking phase
      if (dist < ctx.attackRange) {
        this.phase = "striking";
        this.timer = 0;
        ctx.setVelocityX(0);
        ctx.setVelocityY(0);
        ctx.safePlay(ctx.animKeys.attack, false);
        return {action: "handled"};
      }

      // Max lunge timeout — abort if player outruns flanker
      if (this.timer > cfg.lunge_duration) {
        this.phase = "recovering";
        this.timer = 0;
        ctx.speed = ctx.baseSpeed * cfg.speed_mult;
        ctx.clearTint();
        return {action: "handled"};
      }

      // Chase toward player (matching chaseTarget pattern)
      const angle = Math.atan2(dyToTarget, dxToTarget);

      ctx.setFlipX(dxToTarget < 0);
      ctx.setVelocityX(Math.cos(angle) * ctx.speed * ctx.resolutionScale);
      ctx.setVelocityY(0);
      ctx.groundY += Math.sin(angle) * ctx.speed * ctx.resolutionScale * dt;

      if (ctx.walkableArea) {
        const clamped = ctx.walkableArea.clampToWalkable(ctx.x, ctx.groundY);
        ctx.groundY = clamped.groundY;
      }

      if (!ctx.isAttacking) {
        ctx.safePlay(ctx.animKeys.walk, true);
      }

      return {action: "handled"};
    }

    // ─── Striking phase: hold still while attack animation plays ───
    if (this.phase === "striking") {
      ctx.setVelocityX(0);
      ctx.setVelocityY(0);

      // Stay in striking until attack animation finishes
      if (!ctx.isAttacking && this.timer > 0.1) {
        this.phase = "recovering";
        this.timer = 0;
        ctx.speed = ctx.baseSpeed * cfg.speed_mult;
        ctx.clearTint();
      }

      return {action: "handled"};
    }

    // ─── Recovering phase: retreat with lateral bias ───
    if (this.phase === "recovering") {
      const dxFromTarget = ctx.x - ctx.target.x;
      const dyFromTarget = ctx.groundY - ctx.target.groundY;

      const retreatDist = Math.sqrt(
        dxFromTarget * dxFromTarget + dyFromTarget * dyFromTarget
      );

      let retreatDirX = 0;
      let retreatDirY = 0;
      if (retreatDist > 0.1) {
        retreatDirX = dxFromTarget / retreatDist;
        retreatDirY = dyFromTarget / retreatDist;
      }

      // Lateral bias: diagonal retreat
      const lateralBias = cfg.recovery_lateral_bias;
      const perpX = -retreatDirY * this.flankDirection;
      const perpY = retreatDirX * this.flankDirection;

      let moveX = retreatDirX + perpX * lateralBias;
      let moveY = retreatDirY + perpY * lateralBias;

      const moveMag = Math.sqrt(moveX * moveX + moveY * moveY);
      if (moveMag > 0) {
        moveX /= moveMag;
        moveY /= moveMag;
      }

      const retreatAngle = Math.atan2(moveY, moveX);

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

      if (this.timer > cfg.recovery_time) {
        this.phase = "orbiting";
        this.timer = 0;
        this.lungeAccrued = 0;
        ctx.speed = ctx.baseSpeed * cfg.speed_mult;
        this.currentOrbitTime = this.randomiseOrbitTime(ctx);

        // Re-sync orbit angle to actual position so the flanker
        // doesn't snap to a stale orbit point after recovery
        this.orbitAngle = Math.atan2(
          ctx.groundY - ctx.target.groundY,
          ctx.x - ctx.target.x
        );
      }

      return {action: "handled"};
    }

    return {action: "idle"};
  }
}
