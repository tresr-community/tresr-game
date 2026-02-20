import Phaser from "phaser";
import type {ConfigTypes} from "@/types/config";

/** Key for the shared shadow texture generated once per scene */
const SHADOW_TEXTURE_KEY = "__shadow_ellipse";

/** Configuration for landing VFX played by startAirDrop(). */
interface AirDropLandingConfig {
  flashColor: number;
  flashDurationMs: number;
  dustColor: number;
  dustRadius: number;
  dustDurationMs: number;
  shakeDurationMs: number;
  shakeIntensity: number;
  eventName: string;
}

export class BaseEntity extends Phaser.Physics.Arcade.Sprite {
  public hp: number = 100;
  public maxHp: number = 100;
  protected shadow: Phaser.GameObjects.Image;
  protected healthBar?: Phaser.GameObjects.Graphics;
  protected showHealthBar: boolean = false;
  protected healthBarWidth: number = 40;
  protected healthBarHeight: number = 6;
  protected healthBarOffsetY: number = -10;
  private lastHealthPercent: number = -1;
  private lastHealthBarX: number = 0;
  private lastHealthBarY: number = 0;

  // Cached config - loaded once in constructor, not per-frame
  protected config: ConfigTypes;

  // Knockback state (ticket #175)
  public isKnockedBack: boolean = false;

  // Invincibility state (ticket #191 — respawn iframes)
  public isInvincible: boolean = false;

  /**
   * Resolution-independent speed multiplier (canvasHeight / designHeight).
   * Stored in registry by MainScene each frame; all entities multiply
   * velocities by this so movement covers the same screen-fraction
   * regardless of viewport size.
   */
  protected get resolutionScale(): number {
    return (this.scene?.registry?.get("resolution_scale") as number) || 1;
  }

  // Timer tracking for cleanup on kill/destroy (ticket #195)
  protected pendingTimers: Phaser.Time.TimerEvent[] = [];

  // Damage tint timer — stored separately to cancel on rapid hits (ticket A5)
  private damageTintTimer?: Phaser.Time.TimerEvent;

  // 2.5D Physics
  public z: number = 0;
  public vz: number = 0;
  public gravity: number = 0.8;
  public groundY: number = 0;

  // Air drop state (set by startAirDrop, consumed by onGroundHit)
  protected _airDropLanding: AirDropLandingConfig | null = null;
  protected _isAirDropping: boolean = false;

  /**
   * Ensure the shared shadow texture exists (created once per scene).
   * Uses a RenderTexture to pre-render the ellipse, then all entities
   * share an Image pointing at the same texture — eliminating per-entity
   * Graphics clear+redraw every frame (ticket #158).
   */
  private static ensureShadowTexture(scene: Phaser.Scene, cfg: ConfigTypes) {
    if (scene.textures.exists(SHADOW_TEXTURE_KEY)) return;
    const s = cfg.gameplay.visuals.shadow;
    const rt = scene.add.renderTexture(0, 0, s.width, s.height);
    const g = scene.add.graphics();
    g.fillStyle(s.color, s.opacity);
    g.fillEllipse(s.width / 2, s.height / 2, s.width, s.height);
    rt.draw(g, 0, 0);
    rt.saveTexture(SHADOW_TEXTURE_KEY);
    g.destroy();
    rt.destroy();
  }

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    this.groundY = y;

    // Cache config once - it doesn't change mid-game
    this.config = scene.registry.get("full_config") as ConfigTypes;

    // Feet-anchored origin: x-center, y-bottom.
    // groundY represents where the character's feet touch the ground.
    // The sprite renders upward from this point. This is the standard
    // approach for 2.5D beat-em-ups (Streets of Rage, etc.).
    this.setOrigin(0.5, 1.0);

    // Add to scene and physics
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Ensure shared shadow texture exists, then create a lightweight Image
    BaseEntity.ensureShadowTexture(scene, this.config);
    this.shadow = scene.add.image(x, this.groundY, SHADOW_TEXTURE_KEY);
    this.shadow.setOrigin(0.5, 0.5);
    this.updateShadow();

    // Setup health bar (hidden by default, subclasses can enable)
    this.healthBar = scene.add.graphics();
    this.healthBar.setVisible(false);
  }

  /**
   * Track a timer for cleanup when entity is killed/destroyed (ticket #195).
   */
  protected trackTimer(timer: Phaser.Time.TimerEvent): Phaser.Time.TimerEvent {
    this.pendingTimers.push(timer);
    return timer;
  }

  /**
   * Destroy all tracked timers and clear the array.
   */
  protected clearTrackedTimers() {
    for (const t of this.pendingTimers) {
      t.destroy();
    }
    this.pendingTimers.length = 0;
  }

  /**
   * Enable health bar display for this entity
   */
  protected enableHealthBar(
    width: number = 40,
    height: number = 6,
    offsetY: number = -10
  ) {
    this.showHealthBar = true;
    this.healthBarWidth = width;
    this.healthBarHeight = height;
    this.healthBarOffsetY = offsetY;
    if (this.healthBar) {
      this.healthBar.setVisible(true);
    }
  }

  /**
   * Get color based on health percentage
   */
  protected getHealthColor(percent: number): number {
    const hb = this.config.gameplay.health_bar;
    if (percent > hb.thresholds.high) return hb.colors.high;
    if (percent > hb.thresholds.medium) return hb.colors.medium;
    if (percent > hb.thresholds.low) return hb.colors.low;
    return hb.colors.critical;
  }

  /**
   * Update health bar position and fill
   */
  protected updateHealthBar() {
    if (!this.healthBar || !this.showHealthBar) return;

    const percent = Math.max(0, this.hp / this.maxHp);
    const barX = this.x - this.healthBarWidth / 2;
    // With origin (0.5, 1.0), this.y is feet. Head is at this.y - displayHeight.
    const barY = this.y - this.displayHeight + this.healthBarOffsetY;

    // Skip full redraw if neither HP nor position changed
    if (
      percent === this.lastHealthPercent &&
      barX === this.lastHealthBarX &&
      barY === this.lastHealthBarY
    ) {
      return;
    }

    this.lastHealthPercent = percent;
    this.lastHealthBarX = barX;
    this.lastHealthBarY = barY;

    this.healthBar.clear();

    // Background (dark)
    const hb = this.config.gameplay.health_bar;
    this.healthBar.fillStyle(hb.background_color, 0.5);
    this.healthBar.fillRect(
      barX,
      barY,
      this.healthBarWidth,
      this.healthBarHeight
    );

    // Foreground (health)
    if (percent > 0) {
      const color = this.getHealthColor(percent);
      this.healthBar.fillStyle(color, 1);
      this.healthBar.fillRect(
        barX,
        barY,
        this.healthBarWidth * percent,
        this.healthBarHeight
      );
    }

    // Keep health bar above entity
    this.healthBar.setDepth(this.depth + 1);
  }

  /**
   * Update shadow position — just repositions a shared-texture Image
   * instead of clearing and redrawing a Graphics object every frame (ticket #158).
   * Shadow sits at the character's feet (groundY) regardless of jump height.
   */
  protected updateShadow() {
    const s = this.config.gameplay.visuals.shadow;
    const rs = this.resolutionScale;
    this.shadow.setPosition(
      this.x + s.offset_x * rs,
      this.groundY + s.offset_y * rs
    );
    this.shadow.setScale(rs);
    this.shadow.setDepth(this.depth - 1);
    // Apply directional angle if configured (simulates angled light source)
    if (s.angle !== undefined) {
      this.shadow.setAngle(s.angle);
    }
  }

  /**
   * Initiate an air drop from above the visible screen.
   * Calculates z so visual Y (= groundY - z) is above the screen,
   * then lets existing z-physics (gravity) bring the entity down.
   * Optionally stores landing VFX config for the default onGroundHit().
   */
  protected startAirDrop(config?: {
    offscreenMargin?: number;
    disableBodyDuringFlight?: boolean;
    landing?: AirDropLandingConfig;
  }): void {
    const margin = config?.offscreenMargin ?? 50;
    this._isAirDropping = true;
    this.z = this.groundY + margin;
    this.vz = 0;
    this.y = this.groundY - this.z;

    if (config?.disableBodyDuringFlight && this.body) {
      (this.body as Phaser.Physics.Arcade.Body).enable = false;
    }

    this._airDropLanding = config?.landing ?? null;
  }

  update(dt?: number) {
    this.updateZ(dt);
    this.syncBodyPosition();
    this.setDepth(this.groundY);
    this.updateShadow();
    this.updateHealthBar();
  }

  /** Reference timestep (1/60s) that gravity/vz values were originally tuned for. */
  protected static readonly REFERENCE_DT = 0.01667;

  protected updateZ(dt?: number) {
    if (this.z > 0 || this.vz !== 0) {
      // Scale gravity by the ratio of actual dt to the reference timestep.
      // This preserves Symplectic-Euler jump height/feel at any frame rate.
      const step = dt ?? BaseEntity.REFERENCE_DT;
      const gravityScale = step / BaseEntity.REFERENCE_DT;
      const gravityStep = this.gravity * gravityScale;

      this.z += this.vz;
      this.vz -= gravityStep;

      // Cap max jump height so visual Y never goes above the top of the canvas.
      // Skipped during air drops where z intentionally exceeds groundY.
      if (!this._isAirDropping) {
        const maxZ = this.groundY;
        if (this.z > maxZ) {
          this.z = maxZ;
          this.vz = 0;
        }
      }

      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
        this.onGroundHit();
      }
    }
    // Visual Y = Ground Y - Z height (feet position with origin 0.5, 1.0)
    const newY = this.groundY - this.z;

    // Set sprite position first — Arcade derives body from this in preUpdate.
    this.y = newY;

    // Sync Arcade body to match, using the SAME formula as Phaser's
    // Body.updateFromGameObject() to prevent position desync/flickering.
    // Phaser formula: body.y = sprite.y + scaleY * (offset.y - displayOriginY)
    // We must match this exactly, otherwise Body.postUpdate() applies a
    // non-zero delta that shifts the sprite to a wrong position for one frame,
    // creating a ghost/double-image flicker effect.
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body && body.enable) {
      const bodyY =
        this.y + this.scaleY * (body.offset.y - this.displayOriginY);
      body.position.y = bodyY;
      body.prev.y = bodyY;
      body.prevFrame.y = bodyY;
    }
  }

  /**
   * Sync the Arcade body position to match the sprite's current (x, y),
   * using the same formula as Phaser's Body.updateFromGameObject().
   * Call this after manually setting this.x / this.y to prevent
   * Body.postUpdate() from snapping the sprite to a stale position.
   */
  protected syncBodyPosition() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body && body.enable) {
      const bodyX =
        this.x + this.scaleX * (body.offset.x - this.displayOriginX);
      const bodyY =
        this.y + this.scaleY * (body.offset.y - this.displayOriginY);
      body.position.x = bodyX;
      body.position.y = bodyY;
      body.prev.x = bodyX;
      body.prev.y = bodyY;
      body.prevFrame.x = bodyX;
      body.prevFrame.y = bodyY;
    }
  }

  protected onGroundHit() {
    this._isAirDropping = false;
    if (!this._airDropLanding) return;

    const landing = this._airDropLanding;
    this._airDropLanding = null; // One-shot: prevent replay on future jumps

    // Re-enable body if it was disabled during flight
    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).enable = true;
    }

    // Flash tint
    this.setTint(landing.flashColor);
    this.trackTimer(
      this.scene.time.delayedCall(landing.flashDurationMs, () => {
        if (this.active) this.clearTint();
      })
    );

    // Dust cloud VFX
    const dust = this.scene.add.circle(
      this.x,
      this.groundY,
      10,
      landing.dustColor,
      0.5
    );
    dust.setDepth(this.depth - 1);
    this.scene.tweens.add({
      targets: dust,
      radius: landing.dustRadius,
      alpha: 0,
      duration: landing.dustDurationMs,
      onComplete: () => dust.destroy(),
    });

    // Camera shake
    this.scene.cameras.main.shake(
      landing.shakeDurationMs,
      landing.shakeIntensity
    );

    // Emit landing event
    this.scene.events.emit(landing.eventName);
  }

  public takeDamage(amount: number) {
    if (this.hp <= 0 || this.isInvincible) return;
    this.hp = Math.round(this.hp - amount);
    this.setTint(0xff0000);
    // Cancel previous tint timer to prevent premature clearTint on rapid hits
    if (this.damageTintTimer) {
      this.damageTintTimer.destroy();
    }
    const tintDuration = this.config.gameplay.visuals.damage_tint_duration;
    this.damageTintTimer = this.trackTimer(
      this.scene.time.delayedCall(tintDuration, () => {
        this.damageTintTimer = undefined;
        this.clearTint();
      })
    );
    if (this.hp <= 0) this.onDie();
  }

  /**
   * Apply knockback impulse away from attacker (ticket #175).
   * Direction is computed from attacker position to this entity.
   */
  public applyKnockback(attackerX: number, force: number, stunMs: number) {
    if (!this.active || this.hp <= 0) return;

    const dir = this.x >= attackerX ? 1 : -1;
    this.setVelocityX(dir * force * this.resolutionScale);
    this.isKnockedBack = true;

    this.trackTimer(
      this.scene.time.delayedCall(stunMs, () => {
        if (this.active) {
          this.setVelocityX(0);
          this.isKnockedBack = false;
        }
      })
    );
  }

  /**
   * Default onDie behavior - subclasses should override to use kill() for pooling
   * This base implementation emits death event but does NOT destroy, allowing subclasses
   * to decide between kill() (for pooled entities) or destroy() (for non-pooled entities)
   */
  protected onDie() {
    this.scene.events.emit("entity_death", {
      type: this.texture.key,
      x: this.x,
      y: this.y,
    });
    // Default: deactivate for pooling (subclasses can override)
    this.kill();
  }

  /**
   * Deactivate entity for object pooling - entity can be reused via spawn()
   * Shadows are hidden, not destroyed, so they can be reused
   */
  public kill() {
    this.clearTrackedTimers();
    this.setActive(false);
    this.setVisible(false);
    this.lastHealthPercent = -1;
    if (this.shadow) {
      this.shadow.setVisible(false);
    }
    if (this.healthBar) {
      this.healthBar.setVisible(false);
    }
    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).enable = false;
    }
  }

  /**
   * Override destroy to clean up shadow and health bar objects that are
   * not children of the physics group (ticket #234).
   */
  destroy(fromScene?: boolean) {
    this.clearTrackedTimers();
    if (this.shadow) {
      this.shadow.destroy();
      this.shadow = undefined!;
    }
    if (this.healthBar) {
      this.healthBar.destroy();
      this.healthBar = undefined;
    }
    super.destroy(fromScene);
  }
}
