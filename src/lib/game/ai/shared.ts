import Phaser from "phaser";
import type {EnemyContext, GroupMemberView} from "./types";

/**
 * Shared chase-toward-target logic used by multiple AI behaviors.
 * Moves toward (targetX, targetGY) using 2.5D movement.
 * Plays attack anim when within range, walk anim otherwise.
 * Clamps groundY to walkable area (x clamping done by Enemy after return).
 */
export function chaseTarget(
  ctx: EnemyContext,
  targetX: number,
  targetGY: number,
  dt: number
): void {
  const dx = targetX - ctx.x;
  const dy = targetGY - ctx.groundY;
  const dist = Phaser.Math.Distance.Between(
    ctx.x,
    ctx.groundY,
    targetX,
    targetGY
  );
  const angle = Math.atan2(dy, dx);

  ctx.setFlipX(dx < 0);

  if (dist < ctx.attackRange) {
    if (!ctx.isAttacking) {
      ctx.safePlay(ctx.animKeys.attack, true);
    }
    ctx.setVelocityX(0);
    ctx.setVelocityY(0);
  } else {
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
  }
}

/**
 * Count active enemies within a radius of the given enemy.
 * Used by swarm and cautious behaviors.
 */
export function countNearbyAllies(ctx: EnemyContext, radius: number): number {
  if (!ctx.enemyGroup) return 0;
  let count = 0;
  for (const child of ctx.enemyGroup.getChildren()) {
    const ally = child as unknown as GroupMemberView;
    if (ally._self === ctx._self || !ally.active || ally.hp <= 0) continue;
    if (
      Phaser.Math.Distance.Between(ctx.x, ctx.groundY, ally.x, ally.groundY) <=
      radius
    ) {
      count++;
    }
  }
  return count;
}

/**
 * Calculate the center of mass of nearby allies and a separation vector.
 * Used by swarm behavior for cohesion and separation.
 * Uses screen-space distance (matching chaseTarget pattern — no 2.5D division).
 */
export function getNearbyAlliesCenter(
  ctx: EnemyContext,
  radius: number,
  separationRadius: number = 40
): {x: number; groundY: number; sepX: number; sepY: number; count: number} {
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let count = 0;
  if (!ctx.enemyGroup) return {x: 0, groundY: 0, sepX: 0, sepY: 0, count: 0};
  for (const child of ctx.enemyGroup.getChildren()) {
    const ally = child as unknown as GroupMemberView;
    if (ally._self === ctx._self || !ally.active || ally.hp <= 0) continue;

    // Screen-space distance (no 2.5D division)
    const dx = ally.x - ctx.x;
    const dy = ally.groundY - ctx.groundY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= radius) {
      cx += ally.x;
      cy += ally.groundY;
      count++;

      // Add to separation vector if too close
      if (dist < separationRadius && dist > 0.1) {
        // Push away from ally
        sx -= dx / dist;
        sy -= dy / dist;
      }
    }
  }
  if (count > 0) {
    return {x: cx / count, groundY: cy / count, sepX: sx, sepY: sy, count};
  }
  return {x: 0, groundY: 0, sepX: 0, sepY: 0, count: 0};
}

/**
 * Find the nearest living non-retardio enemy that is on-screen.
 * Used by retardio behavior — retardios should punch other enemy types,
 * not fight each other. Skips enemies still walking in from the edge.
 */
export function findNearestEnemy(
  ctx: EnemyContext
): GroupMemberView | undefined {
  if (!ctx.enemyGroup) return undefined;
  let nearest: GroupMemberView | undefined;
  let nearestDist = Infinity;
  // Only target enemies that are well within the screen
  const minX = ctx.cameraWidth * 0.1;
  const maxX = ctx.cameraWidth * 0.9;
  for (const child of ctx.enemyGroup.getChildren()) {
    const e = child as unknown as GroupMemberView;
    if (e._self === ctx._self || !e.active || e.hp <= 0) continue;
    // Skip other retardios — they should target non-retardio enemies
    if (e.aiTypeName === "retardio") continue;
    // Skip enemies still near the screen edge (walking in)
    if (e.x < minX || e.x > maxX) continue;
    const dx = ctx.x - e.x;
    const dy = ctx.groundY - e.groundY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = e;
    }
  }
  return nearest;
}
