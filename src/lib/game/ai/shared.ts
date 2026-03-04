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
 * Calculate the center of mass of nearby allies.
 * Used by swarm behavior for cohesion.
 */
export function getNearbyAlliesCenter(
  ctx: EnemyContext,
  radius: number
): {x: number; groundY: number; count: number} {
  let cx = 0;
  let cy = 0;
  let count = 0;
  if (!ctx.enemyGroup) return {x: 0, groundY: 0, count: 0};
  for (const child of ctx.enemyGroup.getChildren()) {
    const ally = child as unknown as GroupMemberView;
    if (ally._self === ctx._self || !ally.active || ally.hp <= 0) continue;
    if (
      Phaser.Math.Distance.Between(ctx.x, ctx.groundY, ally.x, ally.groundY) <=
      radius
    ) {
      cx += ally.x;
      cy += ally.groundY;
      count++;
    }
  }
  if (count > 0) {
    return {x: cx / count, groundY: cy / count, count};
  }
  return {x: 0, groundY: 0, count: 0};
}

/**
 * Find the nearest living enemy that is not a retardio.
 * Used by retardio behavior.
 */
export function findNearestEnemy(
  ctx: EnemyContext
): GroupMemberView | undefined {
  if (!ctx.enemyGroup) return undefined;
  let nearest: GroupMemberView | undefined;
  let nearestDist = Infinity;
  for (const child of ctx.enemyGroup.getChildren()) {
    const e = child as unknown as GroupMemberView;
    if (e._self === ctx._self || !e.active || e.hp <= 0) continue;
    if (e.aiTypeName === "retardio") continue;
    const d = Phaser.Math.Distance.Between(ctx.x, ctx.groundY, e.x, e.groundY);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = e;
    }
  }
  return nearest;
}
