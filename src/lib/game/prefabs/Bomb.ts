import Phaser from "phaser";
import {BaseEntity} from "./BaseEntity";
import {gameState} from "@/lib/game/state";
import {log} from "@/lib/utils/log";

const COMPONENT_NAME = "Bomb";

/**
 * Bomb - A falling bomb that explodes on ground impact.
 * Uses custom Z-axis physics (not Arcade velocity) for the fall.
 * Damage is splash-based via scene event, no Arcade collider needed.
 *
 * IMPORTANT: The Arcade body is permanently disabled on bombs.
 * The PhysicsGroup's createCallbackHandler re-enables bodies after
 * construction, so we must pass `enable: false` in the group config
 * AND re-disable in spawn(). All positioning is done manually.
 */
export class Bomb extends BaseEntity {
  private damage: number = 25;
  private explosionRadius: number = 100;
  private hasExploded: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    // Texture key "bomb" maps to the candle sprite asset in config
    super(scene, x, y, "bomb_idle");

    const bombConfig = this.config.gameplay.entities.bomb;
    this.damage = bombConfig.damage;
    this.explosionRadius = bombConfig.explosion_radius;

    // Disable Arcade body — we use custom Z-axis physics only.
    // Note: The PhysicsGroup's createCallbackHandler will call
    // body.setEnable(defaults.setEnable) AFTER this constructor.
    // We must also disable in spawn() to catch that re-enable.
    if (this.body) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.enable = false;
    }
  }

  spawn(x: number, groundY: number, startZ: number = 400) {
    this.setActive(true);
    this.setVisible(true);

    if (this.shadow) {
      this.shadow.setVisible(true);
    }

    this.groundY = groundY;
    this.setDepth(this.groundY);
    this.z = startZ;
    this.vz = 0;
    this.hasExploded = false;
    this.setAlpha(1);

    // Reset inherited state flags (same fix as Enemy #231)
    this.isKnockedBack = false;
    this.isInvincible = false;

    // Disable Arcade body — prevents Arcade's postUpdate from
    // overwriting our manual Y position. Must happen before setPosition
    // so the body doesn't try to sync.
    if (this.body) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.enable = false;
      body.setAllowGravity(false);
    }

    // Position visually above the landing point.
    // IMPORTANT: Do NOT use setPosition() — Phaser's setPosition(x, y) resets
    // this.z to 0 when the third arg is omitted, destroying our Z-axis height.
    this.x = x;
    this.y = groundY - this.z;

    // Reload config for recycled objects
    const bombConfig = this.config.gameplay.entities.bomb;
    this.damage = bombConfig.damage;
    this.explosionRadius = bombConfig.explosion_radius;

    // Play idle animation
    if (this.scene.anims.exists("bomb_idle")) {
      this.play("bomb_idle", true);
    }

    log.info(
      COMPONENT_NAME,
      `Spawned: x=${x} groundY=${groundY} startZ=${startZ} z=${this.z} vz=${this.vz} gravity=${this.gravity} y=${this.y} bodyEnabled=${this.body ? (this.body as Phaser.Physics.Arcade.Body).enable : "none"}`
    );
  }

  update() {
    if (gameState.get().isPaused) return;
    if (!this.active || this.hasExploded) return;

    // --- Z-axis falling (inline, not via BaseEntity.updateZ) ---
    // We inline this so we can skip the Arcade body sync entirely.
    if (this.z > 0) {
      this.z += this.vz; // update position first (Symplectic Euler)
      this.vz -= this.gravity; // then apply gravity

      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
        this.onGroundHit();
        return; // exploded — skip rest
      }
    } else if (this.z === 0 && !this.hasExploded) {
      // Safety: if z somehow started at 0, trigger ground hit
      this.onGroundHit();
      return;
    }

    // Update visual Y from Z height
    this.y = this.groundY - this.z;

    // Update shadow (skip health bar — bombs don't have one)
    this.updateShadow();
  }

  protected onGroundHit() {
    if (this.hasExploded) return;
    this.hasExploded = true;
    log.debug(
      COMPONENT_NAME,
      `Ground hit at x=${this.x} groundY=${this.groundY}`
    );
    this.explode();
  }

  private explode() {
    const scene = this.scene;

    // Snap to ground for the explosion visual
    this.y = this.groundY;

    // Visual explosion effect — expanding orange circle matching damage radius
    const explosion = scene.add.circle(
      this.x,
      this.groundY,
      this.explosionRadius * 0.2,
      0xff6600,
      0.5
    );
    explosion.setDepth(1000);
    scene.tweens.add({
      targets: explosion,
      radius: this.explosionRadius,
      alpha: 0,
      duration: 300,
      onComplete: () => explosion.destroy(),
    });

    // Camera shake
    const effects = this.config.gameplay.entities.bomb.effects;
    scene.cameras.main.shake(effects.shake_duration, effects.shake_intensity);

    // Emit explosion event so MainScene handles damage + sound
    scene.events.emit("bomb_explosion", {
      x: this.x,
      y: this.groundY,
      radius: this.explosionRadius,
      damage: this.damage,
    });

    this.kill();
  }

  kill() {
    this.clearTrackedTimers(); // ticket #225: clear stale timers before pool recycling
    this.setActive(false);
    this.setVisible(false);
    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).enable = false;
    }
    if (this.shadow) {
      this.shadow.setVisible(false);
    }
  }
}
