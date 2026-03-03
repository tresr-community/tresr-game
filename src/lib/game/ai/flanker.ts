import type {AIBehavior, EnemyContext, BehaviorResult} from "./types";

/**
 * Flanker AI: orbits the player at a set radius, then lunges in to attack.
 * Three-phase state machine: orbiting → lunging → recovering → orbiting...
 */
export class FlankerBehavior implements AIBehavior {
  readonly type = "flanker" as const;

  private phase: "orbiting" | "lunging" | "recovering" = "orbiting";
  private timer: number = 0;
  private flankDirection: number = 1;
  private switchTimer: number = 0;

  onSpawn(ctx: EnemyContext): void {
    const flankerConfig = ctx.config.gameplay.entities.enemy.ai.flanker;
    ctx.speed = ctx.baseSpeed * flankerConfig.speed_mult;
    this.phase = "orbiting";
    this.timer = 0;
    this.switchTimer = 0;
    this.flankDirection = ctx.rng.frac() < 0.5 ? 1 : -1;
  }

  update(ctx: EnemyContext, dt: number): BehaviorResult {
    if (!ctx.target) return {action: "idle"};

    this.timer += dt;
    const flankerConfig = ctx.config.gameplay.entities.enemy.ai.flanker;
    const orbitRadius = flankerConfig.offset;

    // --- Orbiting phase: circle around the player ---
    if (this.phase === "orbiting") {
      this.switchTimer += dt;
      if (this.switchTimer > flankerConfig.switch_time) {
        this.switchTimer = 0;
        this.flankDirection *= -1;
      }

      const dxToTarget = ctx.target.x - ctx.x;
      const dyToTarget = ctx.target.groundY - ctx.groundY;

      // Calculate 2.5D corrected distance
      const dyCorrected = dyToTarget / 0.4;
      const dist = Math.sqrt(
        dxToTarget * dxToTarget + dyCorrected * dyCorrected
      );

      let dirX = 0;
      let dirY = 0;
      if (dist > 0.1) {
        dirX = dxToTarget / dist;
        dirY = dyCorrected / dist;
      }

      // Tangential vector (perpendicular to direction to target)
      const tangentX = -dirY * this.flankDirection;
      const tangentY = dirX * this.flankDirection;

      // Blend radial (inward/outward) and tangential based on error from orbitRadius
      const distanceError = dist - orbitRadius;

      // Clamp radial weight between -1 (push out) and 1 (pull in). divisor controls how fast it corrects
      const radialWeight = Math.max(-1, Math.min(1, distanceError / 40));
      const tangentWeight = 1.0;

      let moveX = dirX * radialWeight + tangentX * tangentWeight;
      let moveY = dirY * radialWeight + tangentY * tangentWeight;

      const moveMag = Math.sqrt(moveX * moveX + moveY * moveY);
      if (moveMag > 0) {
        moveX /= moveMag;
        moveY /= moveMag;
      }

      const moveAngle = Math.atan2(moveY * 0.4, moveX);

      ctx.setFlipX(ctx.target.x < ctx.x);
      ctx.setVelocityX(Math.cos(moveAngle) * ctx.speed * ctx.resolutionScale);
      ctx.setVelocityY(0);
      ctx.groundY += Math.sin(moveAngle) * ctx.speed * ctx.resolutionScale * dt;

      if (ctx.walkableArea) {
        const clamped = ctx.walkableArea.clampToWalkable(ctx.x, ctx.groundY);
        ctx.groundY = clamped.groundY;
      }

      ctx.safePlay(ctx.animKeys.walk, true);

      // Only accrue lunge timer if we are relatively close to the orbit radius
      if (Math.abs(distanceError) < 40) {
        this.timer += dt;
      }

      // Transition to lunge after orbit_time has been spent on the orbit path
      if (this.timer >= flankerConfig.orbit_time) {
        this.phase = "lunging";
        this.timer = 0;
        ctx.speed = ctx.baseSpeed * flankerConfig.lunge_speed_mult;
      }

      return {action: "handled"};
    }

    // --- Lunging phase: dash straight at the player ---
    if (this.phase === "lunging") {
      if (this.timer > flankerConfig.lunge_duration) {
        this.phase = "recovering";
        this.timer = 0;
        ctx.speed = ctx.baseSpeed * flankerConfig.speed_mult;
      }
      // Fall through to shared chase at boosted speed
      return {
        action: "chase",
        targetX: ctx.target.x,
        targetGY: ctx.target.groundY,
      };
    }

    // --- Recovering phase: back away from the player ---
    if (this.phase === "recovering") {
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

      if (this.timer > flankerConfig.recovery_time) {
        this.phase = "orbiting";
        this.timer = 0;
        ctx.speed = ctx.baseSpeed * flankerConfig.speed_mult;
      }

      return {action: "handled"};
    }

    return {action: "idle"};
  }
}
