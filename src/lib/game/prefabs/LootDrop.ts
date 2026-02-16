import Phaser from "phaser";
import type {ConfigTypes} from "@/types/config";
import {SpriteManager, type SpritesConfig} from "@/lib/game/SpriteManager";

// Loot can be either health or a powerup.
// Health is pretty obvious — it heals the player when collected.
// Powerups are special, they currently spawn the 'TRESR Bot'.
export type LootType = "health" | "powerup";

/**
 * Collectible pickup spawned when enemies are defeated.
 *
 * Extends Phaser.Physics.Arcade.Sprite directly rather than BaseEntity.
 * BaseEntity provides health, knockback, health bars, and SpriteManager
 * animation states — none of which apply to a collectible item.
 *
 * Timer and tween cleanup is handled manually in spawn() and kill()
 * to ensure rapid pool recycling doesn't leak resources.
 */
export class LootDrop extends Phaser.Physics.Arcade.Sprite {
  public lootType: LootType = "health";
  public healAmount: number = 0;
  private config: ConfigTypes;
  private bobTween?: Phaser.Tweens.Tween;
  private despawnTimer?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "health_1_idle");
    this.config = scene.registry.get("full_config") as ConfigTypes;
    // Feet-anchored origin to match BaseEntity/Player convention
    this.setOrigin(0.5, 1.0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setActive(false);
    this.setVisible(false);
  }

  /**
   * Spawn a loot drop at the given position.
   */
  public spawn(x: number, y: number, type: LootType, textureKey: string) {
    this.lootType = type;
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    if (this.body) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.enable = true;
      // Prevent Arcade physics from moving/gravity-dragging the body —
      // position is driven entirely by the bobbing tween.
      body.setAllowGravity(false);
      body.setImmovable(true);
      body.setVelocity(0, 0);
    }

    const lootConfig = this.config.gameplay.entities.enemy.loot;
    const spritesConfig = this.scene.registry.get(
      "sprites_config"
    ) as SpritesConfig;
    const scale = SpriteManager.getScaleFactor(spritesConfig, textureKey);
    this.setScale(scale);
    this.healAmount = type === "health" ? lootConfig.health.heal_amount : 0;

    // Play animation FIRST so this.width/height reflect the real texture
    // dimensions. setTexture(textureKey) must NOT be called with the raw
    // key (e.g. "health_1") — Phaser registers textures as "health_1_idle".
    // Calling setTexture with a missing key falls back to __MISSING (32x32),
    // corrupting the body offset calculation below.
    const animKey = `${textureKey}_idle`;
    if (this.scene.anims.exists(animKey)) {
      this.play(animKey, true);
    }

    // Position physics body at feet level to match player body anchor.
    // Values are in unscaled frame-local coords — Phaser applies _sx/_sy
    // internally to both size and offset. Use a generous body so overlap
    // detection works reliably even during the bob cycle.
    // IMPORTANT: This must run AFTER play() so this.width/height are correct.
    if (this.body) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      const bw = lootConfig.hitbox.width;
      const bh = lootConfig.hitbox.height;
      body.setSize(bw, bh);
      body.setOffset((this.width - bw) / 2, this.height - bh);
      // Force-sync body position with sprite — without this the body
      // stays at the old position until the next physics step, causing
      // overlap detection to fail if checked before then.
      body.updateFromGameObject();
    }

    // Stop previous bob tween if respawned before kill (ticket #253)
    if (this.bobTween) {
      this.bobTween.stop();
    }

    // Bobbing tween for visual feedback
    this.bobTween = this.scene.tweens.add({
      targets: this,
      y: y - lootConfig.bob_distance,
      duration: lootConfig.bob_duration,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        // Keep Arcade body in sync with sprite position during bob.
        // Without this, overlap detection uses the stale body position
        // from spawn time, making the item uncollectible.
        if (this.body) {
          (this.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
        }
      },
    });

    // Auto-despawn — destroy previous timer if respawned before it fires (ticket #195)
    if (this.despawnTimer) {
      this.despawnTimer.destroy();
    }
    this.despawnTimer = this.scene.time.delayedCall(
      lootConfig.despawn_ms,
      () => {
        this.kill();
      }
    );
  }

  public kill() {
    if (this.despawnTimer) {
      this.despawnTimer.destroy();
      this.despawnTimer = undefined;
    }
    if (this.bobTween) {
      this.bobTween.stop();
      this.bobTween = undefined;
    }
    this.setActive(false);
    this.setVisible(false);
    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).enable = false;
    }
  }
}
