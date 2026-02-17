import Phaser from "phaser";
import {BaseEntity} from "./BaseEntity";
import {gameState} from "@/lib/game/state";
import {log} from "@/lib/utils/log";

const COMPONENT_NAME = "Key";

/**
 * Key - A collectible that airdrops from the sky with a parachute sway.
 * Uses custom Z-axis physics (not Arcade velocity) for the fall.
 * The Arcade body is only enabled when the key is on the ground (z=0)
 * so the overlap collider with the player works for collection.
 *
 * IMPORTANT: The Arcade body is disabled during falling to prevent
 * Arcade's postUpdate from overwriting our manual Y position.
 * Body is re-enabled once the key lands so physics overlap detection works.
 */
export class Key extends BaseEntity {
  private initialX: number = 0;
  private time: number = 0;
  private speed: number = 50;
  private oscillationFrequency: number = 2;
  private oscillationAmplitude: number = 30;
  private isFading: boolean = false;
  private fadeTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "key_idle");
    this.initialX = x;

    const keyConfig = this.config.gameplay.entities.key;
    this.speed = keyConfig.speed;
    this.oscillationFrequency = keyConfig.oscillation.frequency;
    this.oscillationAmplitude = keyConfig.oscillation.amplitude;
    this.gravity = keyConfig.gravity;

    // Disable Arcade gravity — we use custom Z-axis physics for vertical movement.
    // Body stays enabled for overlap detection (key collection).
    if (this.body) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setImmovable(true);
      body.setVelocity(0, 0);
    }
  }

  update() {
    if (gameState.get().isPaused) return;
    if (!this.active) return;

    const gp = this.config.gameplay;
    const timestep = gp.physics.timestep;
    const offscreenKillDistance = gp.entities.key.offscreen_kill_distance;

    // --- Z-axis falling (inline, not via BaseEntity.updateZ) ---
    if (this.z > 0 || this.vz !== 0) {
      this.z += this.vz;
      this.vz -= this.gravity;

      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
        this.onGroundHit();
      }
    }

    // Horizontal drift with oscillation (parachute sway effect)
    this.time += timestep;
    const {width} = this.scene.cameras.main;
    const halfWidth = this.displayWidth / 2;
    this.x = Phaser.Math.Clamp(
      this.initialX +
        this.speed * this.time +
        Math.sin(this.time * this.oscillationFrequency) *
          this.oscillationAmplitude,
      halfWidth,
      width - halfWidth
    );

    // Update visual Y from Z height
    this.y = this.groundY - this.z;

    // Sync Arcade body to match our manual sprite position.
    // Uses shared BaseEntity method (same formula as Phaser's updateFromGameObject).
    this.syncBodyPosition();

    this.updateShadow();

    // Kill if off screen (safety)
    if (this.y > this.scene.cameras.main.height + offscreenKillDistance) {
      this.kill();
    }
  }

  spawn(x: number, groundY: number) {
    this.setActive(true);
    this.setVisible(true);
    if (this.shadow) {
      this.shadow.setVisible(true);
    }
    this.groundY = groundY;
    this.setDepth(this.groundY);

    const keyConfig = this.config.gameplay.entities.key;
    const startZ = keyConfig.spawner.start_z;
    this.z = startZ;
    this.vz = 0;
    this.initialX = x;
    this.time = 0;
    this.setAlpha(1);
    this.isFading = false;
    this.fadeTween = null;

    // Reset inherited state flags (same fix as Enemy #231)
    this.isKnockedBack = false;
    this.isInvincible = false;

    this.gravity = keyConfig.gravity;
    this.speed = keyConfig.speed;
    this.oscillationFrequency = keyConfig.oscillation.frequency;
    this.oscillationAmplitude = keyConfig.oscillation.amplitude;

    // Keep body enabled (for overlap collection) but prevent Arcade movement
    if (this.body) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.enable = true;
      body.setAllowGravity(false);
      body.setImmovable(true);
      body.setVelocity(0, 0);
    }

    // Position visually above the landing point.
    // IMPORTANT: Do NOT use setPosition() — Phaser's setPosition(x, y) resets
    // this.z to 0 when the third arg is omitted, destroying our Z-axis height.
    this.x = x;
    this.y = groundY - this.z;

    // Play idle animation (spinning key)
    if (this.scene.anims.exists("key_idle")) {
      this.play("key_idle", true);
    }

    log.info(
      COMPONENT_NAME,
      `Spawned: x=${x} groundY=${groundY} z=${this.z} gravity=${this.gravity} y=${this.y}`
    );
  }

  protected onGroundHit() {
    const keyConfig = this.config.gameplay.entities.key;
    const bounceThreshold = keyConfig.bounce_threshold;
    const bounceDamping = keyConfig.bounce_damping;
    const fadeDuration = keyConfig.animations.fade_duration;
    const fadeDelay = keyConfig.animations.fade_delay;

    // Bounce logic
    if (Math.abs(this.vz) > bounceThreshold) {
      this.vz = -this.vz * bounceDamping;
    } else {
      // Start fade out timer
      if (!this.isFading) {
        this.isFading = true;
        this.fadeTween = this.scene.tweens.add({
          targets: this,
          alpha: 0,
          duration: fadeDuration,
          delay: fadeDelay,
          onComplete: () => {
            if (this.active) this.kill();
          },
        });
      }
    }
  }

  kill() {
    this.clearTrackedTimers(); // ticket #225: clear stale timers before pool recycling
    if (this.fadeTween) {
      this.fadeTween.stop();
      this.fadeTween = null;
    }
    this.setActive(false);
    this.setVisible(false);
    if (this.shadow) {
      this.shadow.setVisible(false);
    }
    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).enable = false;
    }
  }
}
