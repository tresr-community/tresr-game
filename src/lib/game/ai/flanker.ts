import type {AIBehavior, EnemyContext, BehaviorResult} from "./types";

/**
 * Flanker AI: orbits the player at a set radius, then lunges in to attack.
 * Three-phase state machine: orbiting → lunging → recovering → orbiting...
 */
export class FlankerBehavior implements AIBehavior {
  readonly type = "flanker" as const;

  private phase: "orbiting" | "lunging" | "recovering" = "orbiting";
  private orbitAngle: number = 0;
  private timer: number = 0;
  private flankDirection: number = 1;

  onSpawn(ctx: EnemyContext): void {
    const flankerConfig = ctx.config.gameplay.entities.enemy.ai.flanker;
    ctx.speed = ctx.baseSpeed * flankerConfig.speed_mult;
    this.phase = "orbiting";
    this.orbitAngle = ctx.rng.frac() * Math.PI * 2;
    this.timer = 0;
    this.flankDirection = ctx.rng.frac() < 0.5 ? 1 : -1;
  }

  update(ctx: EnemyContext, dt: number): BehaviorResult {
    if (!ctx.target) return {action: "idle"};

    this.timer += dt;
    const flankerConfig = ctx.config.gameplay.entities.enemy.ai.flanker;
    const orbitRadius = flankerConfig.offset;

    // --- Orbiting phase: circle around the player ---
    if (this.phase === "orbiting") {
      this.orbitAngle += dt * 2; // ~2 rad/s orbit speed
      const orbitX =
        ctx.target.x +
        Math.cos(this.orbitAngle) * orbitRadius * this.flankDirection;
      const orbitGY =
        ctx.target.groundY + Math.sin(this.orbitAngle) * (orbitRadius * 0.4); // squished ellipse for 2.5D

      const dxOrbit = orbitX - ctx.x;
      const dyOrbit = orbitGY - ctx.groundY;
      const orbitAngle = Math.atan2(dyOrbit, dxOrbit);

      ctx.setFlipX(ctx.target.x < ctx.x);
      ctx.setVelocityX(Math.cos(orbitAngle) * ctx.speed * ctx.resolutionScale);
      ctx.setVelocityY(0);
      ctx.groundY +=
        Math.sin(orbitAngle) * ctx.speed * ctx.resolutionScale * dt;

      if (ctx.walkableArea) {
        const clamped = ctx.walkableArea.clampToWalkable(ctx.x, ctx.groundY);
        ctx.groundY = clamped.groundY;
      }

      ctx.safePlay(ctx.animKeys.walk, true);

      // Transition to lunge after orbit_time
      if (this.timer > flankerConfig.orbit_time) {
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
