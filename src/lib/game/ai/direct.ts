import type {AIBehavior, EnemyContext, BehaviorResult} from "./types";

/** Direct AI: charges straight at the player with no special movement. */
export class DirectBehavior implements AIBehavior {
  readonly type = "direct" as const;

  onSpawn(ctx: EnemyContext): void {
    ctx.speed = ctx.baseSpeed;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  update(ctx: EnemyContext, _dt: number): BehaviorResult {
    if (!ctx.target) return {action: "idle"};
    return {
      action: "chase",
      targetX: ctx.target.x,
      targetGY: ctx.target.groundY,
    };
  }
}
