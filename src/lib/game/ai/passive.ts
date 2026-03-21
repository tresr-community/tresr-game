import type {AIBehavior, EnemyContext, BehaviorResult} from "./types";

/**
 * Passive AI ("The Banker"): walks across the screen minding its own business.
 *
 * Key behaviors:
 * - Walks horizontally in ONE direction (spawn side → opposite side of screen).
 * - Gently steers around the player if they're in the way.
 * - Does NOT attack unless the player hits it first.
 * - On player hit: brief stun → provoked chase with increased speed.
 * - Calms down after forgiveness_time without being hit again.
 * - Higher HP and better loot drops than other enemies.
 *
 * State machine: wandering → stunned → provoked → (forgiven) → wandering
 */
export class PassiveBehavior implements AIBehavior {
  readonly type = "passive" as const;

  /** Walk direction: 1 = right, -1 = left. Set once on spawn based on
   *  spawn side — the banker always crosses to the other side. */
  private direction: number = 1;

  private phase: "wandering" | "stunned" | "provoked" = "wandering";

  /** Time spent in current stunned phase. */
  private stunTimer: number = 0;

  /** Elapsed time since last player hit — drives forgiveness. */
  private timeSinceLastHit: number = 0;

  /** Elapsed time for Y-axis sine wander. */
  private wanderTime: number = 0;

  onSpawn(ctx: EnemyContext): void {
    const cfg = ctx.config.gameplay.entities.enemy.ai.passive;
    ctx.speed = ctx.baseSpeed * cfg.speed_mult;
    this.phase = "wandering";
    this.stunTimer = 0;
    this.timeSinceLastHit = 0;
    this.wanderTime = ctx.rng.frac() * Math.PI * 2;

    // Direction is determined by spawn position: if spawned on the left
    // half, walk right. If on the right half, walk left. This ensures the
    // banker always walks ACROSS the screen like a pedestrian crossing.
    this.direction = ctx.x < ctx.cameraWidth / 2 ? 1 : -1;

    // Higher HP for passive enemies
    const hpMult = cfg.hp_mult;
    ctx.hp = Math.round(ctx.maxHp * hpMult);
    ctx.maxHp = ctx.hp;
  }

  onDamage(ctx: EnemyContext): void {
    const cfg = ctx.config.gameplay.entities.enemy.ai.passive;

    // Only provoke if the player is nearby — this prevents distant bomb
    // explosions from triggering aggro. If the player bombed nearby, they
    // should still provoke (they're close enough to be "responsible").
    if (ctx.target) {
      const dx = ctx.x - ctx.target.x;
      const dy = ctx.groundY - ctx.target.groundY;
      const distToPlayer = Math.sqrt(dx * dx + dy * dy);
      const provokeRadius = ctx.attackRange * 3;
      if (distToPlayer > provokeRadius) {
        // Damage from far away (bomb, super projectile) — take the HP hit
        // but don't get provoked.
        return;
      }
    }

    // Reset forgiveness timer on every nearby hit
    this.timeSinceLastHit = 0;

    if (this.phase === "wandering") {
      // First hit: enter stunned phase (brief freeze before chasing)
      this.phase = "stunned";
      this.stunTimer = 0;
      ctx.setVelocityX(0);
      ctx.setVelocityY(0);

      // Visual feedback: tint to show provocation
      if (cfg.provoked_tint !== 0) {
        ctx.setTint(cfg.provoked_tint);
      }
    }
    // If already stunned or provoked, the timeSinceLastHit reset above
    // keeps the forgiveness clock from expiring.
  }

  update(ctx: EnemyContext, dt: number): BehaviorResult {
    const cfg = ctx.config.gameplay.entities.enemy.ai.passive;

    // ─── Wandering phase: walk across screen, avoid the player ───
    if (this.phase === "wandering") {
      const offscreenKillDistance =
        ctx.config.gameplay.entities.enemy.offscreen_kill_distance_px;
      if (
        ctx.x < -offscreenKillDistance ||
        ctx.x > ctx.cameraWidth + offscreenKillDistance
      ) {
        return {action: "kill"};
      }

      // Horizontal movement — constant direction (spawn side → opposite)
      const moveSpeed = ctx.speed * ctx.resolutionScale;
      ctx.setFlipX(this.direction < 0);
      ctx.setVelocityX(this.direction * moveSpeed);
      ctx.setVelocityY(0);

      // Subtle Y-axis sine wander so it doesn't look rail-locked
      this.wanderTime += dt;
      const yDrift =
        Math.sin(this.wanderTime * cfg.wander_frequency) *
        cfg.wander_amplitude *
        ctx.resolutionScale *
        dt;
      ctx.groundY += yDrift;

      // Player avoidance: if the player is nearby, steer groundY away
      // from them. This makes the passive "step aside" like a cautious
      // pedestrian, without changing their horizontal direction.
      if (ctx.target) {
        const dx = ctx.x - ctx.target.x;
        const dy = ctx.groundY - ctx.target.groundY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const avoidRadius = 150 * ctx.resolutionScale;

        if (dist < avoidRadius && dist > 1) {
          // Steer vertically away from the player
          const avoidStrength =
            ((avoidRadius - dist) / avoidRadius) * moveSpeed * dt;

          if (Math.abs(dy) < 5) {
            // Player is at same depth — dodge downward (arbitrary but consistent)
            ctx.groundY += avoidStrength;
          } else {
            // Move away from the player's Y position
            ctx.groundY += Math.sign(dy) * avoidStrength;
          }
        }
      }

      if (ctx.walkableArea) {
        const clamped = ctx.walkableArea.clampToWalkable(ctx.x, ctx.groundY);
        ctx.groundY = clamped.groundY;
      }

      ctx.safePlay(ctx.animKeys.walk, true);

      return {action: "handled", ignoreHorizontalBounds: true};
    }

    // ─── Stunned phase: brief freeze before chasing ───
    if (this.phase === "stunned") {
      this.stunTimer += dt;
      ctx.setVelocityX(0);
      ctx.setVelocityY(0);

      // Play hurt animation during stun
      ctx.safePlay(ctx.animKeys.hurt, true);

      if (this.stunTimer >= cfg.provoke_delay) {
        this.phase = "provoked";
        ctx.speed = ctx.baseSpeed * cfg.provoked_speed_mult;
      }

      return {action: "handled"};
    }

    // ─── Provoked phase: chase the player (screen-space math) ───
    if (this.phase === "provoked") {
      if (!ctx.target) return {action: "idle"};

      // Track forgiveness
      this.timeSinceLastHit += dt;
      if (
        cfg.forgiveness_time > 0 &&
        this.timeSinceLastHit >= cfg.forgiveness_time
      ) {
        // Calm down — return to wandering
        this.phase = "wandering";
        ctx.speed = ctx.baseSpeed * cfg.speed_mult;
        ctx.clearTint();
        return {action: "handled", ignoreHorizontalBounds: true};
      }

      // Screen-space chase (same pattern as chaseTarget — no 2.5D division)
      const dxToTarget = ctx.target.x - ctx.x;
      const dyToTarget = ctx.target.groundY - ctx.groundY;
      const dist = Math.sqrt(dxToTarget * dxToTarget + dyToTarget * dyToTarget);

      // Attack if close enough
      if (dist < ctx.attackRange) {
        if (!ctx.isAttacking) {
          ctx.safePlay(ctx.animKeys.attack, true);
        }
        ctx.setVelocityX(0);
        ctx.setVelocityY(0);
        return {action: "handled"};
      }

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

    return {action: "idle"};
  }
}
