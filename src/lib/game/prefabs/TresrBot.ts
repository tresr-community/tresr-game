import Phaser from "phaser";
import {BaseEntity} from "./BaseEntity";
import type {Enemy} from "./Enemy";
import type {Boss} from "./Boss";
import type {Player} from "./Player";
import type {WalkableArea} from "@/lib/game/WalkableArea";
import {gameState} from "@/lib/game/state";
import {log} from "@/lib/utils/log";

const COMPONENT_NAME = "TresrBot";

export class TresrBot extends BaseEntity {
  private target?: Enemy | Boss;
  private owner?: Player;
  private attackCooldown: number = 0;
  private specialCooldown: number = 0;
  private lifetimeTimer?: Phaser.Time.TimerEvent;
  private fadeTween?: Phaser.Tweens.Tween;
  private isAlive: boolean = false;
  private walkableArea?: WalkableArea;
  private enemyGroup?: Phaser.Physics.Arcade.Group;
  private boss?: Boss;
  private specialRing?: Phaser.GameObjects.Arc;
  private specialRingTween?: Phaser.Tweens.Tween;

  // Pre-computed animation keys
  private animKeys = {
    idle: "tresr_bot_idle",
    walk: "tresr_bot_walk",
    attack: "tresr_bot_attack",
    special: "tresr_bot_special",
  };

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "tresr_bot");

    const botConfig = this.config.gameplay.entities.tresr_bot;
    this.hp = botConfig.health;
    this.maxHp = botConfig.health;

    // Physics body
    const hitbox = botConfig.hitbox;
    this.body?.setCircle(hitbox.radius, hitbox.offsetX, hitbox.offsetY);

    // Start inactive
    this.setActive(false);
    this.setVisible(false);
    if (this.shadow) this.shadow.setVisible(false);
    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).enable = false;
    }
  }

  spawn(x: number, groundY: number, owner: Player) {
    const botConfig = this.config.gameplay.entities.tresr_bot;

    this.owner = owner;
    this.target = undefined;
    this.isAlive = true;
    this.hp = botConfig.health;
    this.maxHp = botConfig.health;
    this.attackCooldown = 0;
    this.specialCooldown = 0;
    this.groundY = groundY;
    this.x = x;
    this.setActive(true);
    this.setVisible(true);
    this.setAlpha(1);
    this.clearTint();
    this.isKnockedBack = false;
    this.isInvincible = false;

    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).enable = true;
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    }

    // Show shadow and health bar
    if (this.shadow) this.shadow.setVisible(true);
    this.enableHealthBar(30, 4, -5);

    // Cache registry lookups
    this.walkableArea = this.scene.registry.get(
      "walkable_area"
    ) as WalkableArea;
    this.enemyGroup = this.scene.registry.get(
      "enemy_group"
    ) as Phaser.Physics.Arcade.Group;

    // Start lifetime timer
    this.lifetimeTimer = this.trackTimer(
      this.scene.time.delayedCall(botConfig.lifetime.duration_ms, () => {
        this.beginFadeOut();
      })
    );

    // Air drop from above screen — body stays enabled (no physics overlaps)
    const ad = botConfig.air_drop;
    this.startAirDrop({
      disableBodyDuringFlight: false,
      landing: {
        flashColor: ad.landing_flash_color,
        flashDurationMs: ad.landing_flash_ms,
        dustColor: ad.landing_dust_color,
        dustRadius: ad.landing_dust_radius,
        dustDurationMs: ad.landing_dust_duration_ms,
        shakeDurationMs: ad.landing_shake_duration,
        shakeIntensity: ad.landing_shake_intensity,
        eventName: "bot_land",
      },
    });

    this.play(this.animKeys.idle, true);
    log.info(COMPONENT_NAME, "Air dropping at", x, groundY);
  }

  protected onGroundHit() {
    if (!this.isAlive || !this.active) return;

    // Zero velocity so AI starts from a clean state
    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    }

    // Standard air drop landing VFX (flash, dust, shake, event)
    super.onGroundHit();

    log.info(COMPONENT_NAME, "Landed at", this.x, this.groundY);
  }

  /**
   * Refresh the lifetime timer when a second powerup is collected
   * while the bot is already active.
   */
  refreshLifetime() {
    if (!this.active || !this.isAlive) return;
    const botConfig = this.config.gameplay.entities.tresr_bot;

    // Cancel existing timer
    if (this.lifetimeTimer) {
      this.lifetimeTimer.destroy();
    }

    // Restore full HP
    this.hp = this.maxHp;

    // Flash to indicate refresh
    this.setTint(0x00ff88);
    this.trackTimer(
      this.scene.time.delayedCall(botConfig.lifetime.spawn_flash_ms, () => {
        if (this.active) this.clearTint();
      })
    );

    // Start new lifetime timer
    this.lifetimeTimer = this.trackTimer(
      this.scene.time.delayedCall(botConfig.lifetime.duration_ms, () => {
        this.beginFadeOut();
      })
    );

    log.info(COMPONENT_NAME, "Lifetime refreshed");
  }

  /**
   * Set the boss reference for target selection
   */
  setBoss(boss: Boss | undefined) {
    this.boss = boss;
  }

  update(time?: number) {
    if (gameState.get().isPaused) return;
    if (!this.active || !this.isAlive) return;

    // During air drop, only process z-axis physics (no AI)
    if (this.z > 0) {
      super.update();
      return;
    }

    if (this.isKnockedBack) {
      super.update();
      return;
    }

    const botConfig = this.config.gameplay.entities.tresr_bot;
    const now = time ?? this.scene.time.now;
    const dt = this.config.gameplay.physics.timestep;

    // Find target — nearest active enemy or boss
    this.findTarget();

    // AI Priority: special → melee → chase → follow → idle
    const enemiesInSpecialRange = this.countEnemiesInRadius(
      botConfig.special.radius
    );

    // 1. Special attack
    if (
      enemiesInSpecialRange >= botConfig.special.min_enemies &&
      now - this.specialCooldown >= botConfig.special.cooldown_ms
    ) {
      this.useSpecial(now);
    }
    // 2. Melee attack
    else if (this.target && this.target.active && this.target.hp > 0) {
      const dist = Phaser.Math.Distance.Between(
        this.x,
        this.groundY,
        this.target.x,
        this.target.groundY
      );

      if (
        dist < botConfig.combat.attack_range &&
        now - this.attackCooldown >= botConfig.combat.attack_cooldown_ms
      ) {
        this.attack(now);
      }
      // 3. Chase
      else if (dist >= botConfig.combat.attack_range) {
        this.moveToward(
          this.target.x,
          this.target.groundY,
          botConfig.speed,
          dt
        );
      }
    }
    // 4. Follow owner
    else if (this.owner && this.owner.active) {
      const distToOwner = Phaser.Math.Distance.Between(
        this.x,
        this.groundY,
        this.owner.x,
        this.owner.groundY
      );
      if (distToOwner > 80) {
        this.moveToward(
          this.owner.x,
          this.owner.groundY,
          botConfig.speed * 0.7,
          dt
        );
      } else {
        // 5. Idle
        this.setVelocityX(0);
        const isIdle =
          this.anims.isPlaying &&
          this.anims.currentAnim?.key === this.animKeys.idle;
        if (!isIdle) {
          this.play(this.animKeys.idle, true);
        }
      }
    }

    // Clamp to walkable area
    if (this.walkableArea) {
      const clamped = this.walkableArea.clampToWalkable(this.x, this.groundY);
      this.x = clamped.x;
      this.groundY = clamped.groundY;
    }

    super.update();
  }

  private findTarget() {
    let nearest: Enemy | Boss | undefined;
    let nearestDist = Infinity;

    // Check enemies
    if (this.enemyGroup) {
      for (const child of this.enemyGroup.getChildren()) {
        const enemy = child as Enemy;
        if (!enemy.active || enemy.hp <= 0) continue;
        const dist = Phaser.Math.Distance.Between(
          this.x,
          this.groundY,
          enemy.x,
          enemy.groundY
        );
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = enemy;
        }
      }
    }

    // Check boss
    if (this.boss && this.boss.active && this.boss.hp > 0) {
      const bossDist = Phaser.Math.Distance.Between(
        this.x,
        this.groundY,
        this.boss.x,
        this.boss.groundY
      );
      if (bossDist < nearestDist) {
        nearest = this.boss;
      }
    }

    // Only switch target if we don't have one or current target is dead/inactive
    if (!this.target || !this.target.active || this.target.hp <= 0) {
      this.target = nearest;
    }
  }

  private countEnemiesInRadius(radius: number): number {
    let count = 0;
    if (this.enemyGroup) {
      for (const child of this.enemyGroup.getChildren()) {
        const enemy = child as Enemy;
        if (!enemy.active || enemy.hp <= 0) continue;
        const dist = Phaser.Math.Distance.Between(
          this.x,
          this.groundY,
          enemy.x,
          enemy.groundY
        );
        if (dist <= radius) count++;
      }
    }
    // Count boss too
    if (this.boss && this.boss.active && this.boss.hp > 0) {
      const dist = Phaser.Math.Distance.Between(
        this.x,
        this.groundY,
        this.boss.x,
        this.boss.groundY
      );
      if (dist <= radius) count++;
    }
    return count;
  }

  private moveToward(
    targetX: number,
    targetGY: number,
    speed: number,
    dt: number
  ) {
    const dx = targetX - this.x;
    const dy = targetGY - this.groundY;
    const angle = Math.atan2(dy, dx);

    this.setFlipX(dx < 0);
    this.setVelocityX(Math.cos(angle) * speed);
    this.groundY += Math.sin(angle) * speed * dt;

    const isWalking =
      this.anims.isPlaying &&
      this.anims.currentAnim?.key === this.animKeys.walk;
    if (!isWalking) {
      this.play(this.animKeys.walk, true);
    }
  }

  private attack(now: number) {
    if (!this.target || !this.target.active) return;
    const botConfig = this.config.gameplay.entities.tresr_bot;

    this.attackCooldown = now;
    this.setFlipX(this.target.x < this.x);
    this.play(this.animKeys.attack, true);

    // Deal damage
    this.target.takeDamage(botConfig.damage);

    // Apply knockback
    const kb = botConfig.knockback;
    this.target.applyKnockback(this.x, kb.force, kb.stun_ms);

    // Emit attack event for sound playback
    this.scene.events.emit("bot_attack");
  }

  private useSpecial(now: number) {
    const botConfig = this.config.gameplay.entities.tresr_bot;
    this.specialCooldown = now;
    this.play(this.animKeys.special, true);

    // Emit special event for sound playback
    this.scene.events.emit("bot_special");

    // AoE damage to all enemies within radius
    if (this.enemyGroup) {
      for (const child of this.enemyGroup.getChildren()) {
        const enemy = child as Enemy;
        if (!enemy.active || enemy.hp <= 0) continue;
        const dist = Phaser.Math.Distance.Between(
          this.x,
          this.groundY,
          enemy.x,
          enemy.groundY
        );
        if (dist <= botConfig.special.radius) {
          enemy.takeDamage(botConfig.special.damage);
        }
      }
    }

    // Damage boss if in range
    if (this.boss && this.boss.active && this.boss.hp > 0) {
      const dist = Phaser.Math.Distance.Between(
        this.x,
        this.groundY,
        this.boss.x,
        this.boss.groundY
      );
      if (dist <= botConfig.special.radius) {
        this.boss.takeDamage(botConfig.special.damage);
      }
    }

    // Expanding green ring VFX (tracked for cleanup)
    this.specialRing = this.scene.add.circle(
      this.x,
      this.groundY,
      10,
      0x00ff88,
      0.6
    );
    this.specialRing.setDepth(this.depth + 1);
    this.specialRingTween = this.scene.tweens.add({
      targets: this.specialRing,
      radius: botConfig.special.radius,
      alpha: 0,
      duration: 400,
      onComplete: () => {
        this.specialRing?.destroy();
        this.specialRing = undefined;
        this.specialRingTween = undefined;
      },
    });
  }

  private beginFadeOut() {
    if (!this.active || !this.isAlive) return;
    this.isAlive = false;
    const botConfig = this.config.gameplay.entities.tresr_bot;

    // Stop AI, play idle
    this.setVelocityX(0);
    this.play(this.animKeys.idle, true);

    // Fade out
    this.fadeTween = this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: botConfig.lifetime.fade_duration_ms,
      onComplete: () => {
        this.fadeTween = undefined;
        this.kill();
      },
    });

    log.info(COMPONENT_NAME, "Fading out");
  }

  public kill() {
    if (this.lifetimeTimer) {
      this.lifetimeTimer.destroy();
      this.lifetimeTimer = undefined;
    }
    if (this.fadeTween) {
      this.fadeTween.stop();
      this.fadeTween = undefined;
    }
    if (this.specialRingTween) {
      this.specialRingTween.stop();
      this.specialRingTween = undefined;
    }
    if (this.specialRing) {
      this.specialRing.destroy();
      this.specialRing = undefined;
    }
    this.isAlive = false;
    this.target = undefined;
    this.owner = undefined;
    this.boss = undefined;
    super.kill();
  }

  protected onDie() {
    // Bot death — no loot, no score, just fade and kill
    this.beginFadeOut();
  }
}
