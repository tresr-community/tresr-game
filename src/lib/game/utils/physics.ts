import Phaser from "phaser";

/**
 * Apply a circular physics body from config hitbox values.
 * All values are in unscaled frame-local coords. Phaser internally applies
 * the game object's scale (_sx/_sy) to both the radius (via sourceWidth/height)
 * and the offset (via the body position formula: body.y = sprite.y + scaleY *
 * (offset.y - displayOriginY)). No manual scaling needed.
 */
export function scaleCircleBody(
  entity: Phaser.Physics.Arcade.Sprite,
  hitbox: {radius: number; offsetX: number; offsetY: number}
): void {
  const body = entity.body as Phaser.Physics.Arcade.Body;
  if (body) {
    body.setCircle(hitbox.radius, hitbox.offsetX, hitbox.offsetY);
  }
}

/**
 * Apply a rectangular physics body from config hitbox values.
 * Values are in unscaled frame-local coords — Phaser applies _sx/_sy internally.
 */
export function scaleRectBody(
  entity: Phaser.Physics.Arcade.Sprite,
  hitbox: {width: number; height: number}
): void {
  const body = entity.body as Phaser.Physics.Arcade.Body;
  if (body) {
    body.setSize(hitbox.width, hitbox.height);
  }
}
