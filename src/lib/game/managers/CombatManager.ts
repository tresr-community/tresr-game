import Phaser from "phaser";
import {Enemy} from "@/lib/game/prefabs/Enemy";
import {SuperProjectile} from "@/lib/game/prefabs/SuperProjectile";
import type {Player} from "@/lib/game/prefabs/Player";
import type {Boss} from "@/lib/game/prefabs/Boss";
import type {Chest} from "@/lib/game/prefabs/Chest";
import type {TresrBot} from "@/lib/game/prefabs/TresrBot";
import type {SpawnManager} from "@/lib/game/managers/SpawnManager";
import {SpriteManager, type SpritesConfig} from "@/lib/game/SpriteManager";
import type {WalkableArea} from "@/lib/game/WalkableArea";
import type {GameplayConfig} from "@/lib/game/scenes/MainScene";
import {gameActions} from "@/lib/game/state";
import {trackBossDefeated} from "@/lib/metrics/analytics";
import MusicManager from "@/lib/game/MusicManager";
import {log} from "@/lib/utils/log";
import {scaleCircleBody} from "@/lib/game/utils/physics";

const COMPONENT_NAME = "CombatManager";

export class CombatManager {
  // Public group (MainScene reads for collision setup)
  superProjectiles?: Phaser.Physics.Arcade.Group;

  // Owned timer
  private enemyAttackTimer?: Phaser.Time.TimerEvent;

  // Combat state
  private lastBossDamageTime: number = 0;
  private hitStopActive: boolean = false;
  private hitStopTimer?: Phaser.Time.TimerEvent;
  superDamageActive: boolean = false;

  // Dynamic entity references (set by MainScene as they become available)
  private player?: Player;
  private boss?: Boss;
  private chest?: Chest;
  private tresrBot?: TresrBot;

  constructor(
    private scene: Phaser.Scene,
    private config: GameplayConfig,
    private spawnManager: SpawnManager,
    private spriteManager: SpriteManager,
    private rng: Phaser.Math.RandomDataGenerator,
    private walkableArea: WalkableArea,
    private designHeight: number,
    private getPhase: () => "survival" | "boss" | "victory" | "lost",
    private addScore: (points: number) => void,
    private playSound: (key: string) => void,
    private addAdHocTimer: (timer: Phaser.Time.TimerEvent) => void
  ) {}

  setPlayer(player: Player) {
    this.player = player;
  }

  setBoss(boss: Boss) {
    this.boss = boss;
  }

  setChest(chest: Chest | undefined) {
    this.chest = chest;
  }

  setTresrBot(bot: TresrBot) {
    this.tresrBot = bot;
  }

  createGroups() {
    const entities = this.config.entities;
    this.superProjectiles = this.scene.physics.add.group({
      classType: SuperProjectile,
      maxSize: entities.player.super.max_projectiles,
      runChildUpdate: false,
    });
  }

  /** Register combat event listeners on the scene event emitter. */
  registerEvents() {
    this.scene.events.on("player_attack", this.handlePlayerAttack, this);
    this.scene.events.on("player_super", this.handlePlayerSuper, this);
    this.scene.events.on("super_pierce", this.handleSuperPierce, this);
    this.scene.events.on("super_hit", this.handleSuperProjectileHit, this);
    this.scene.events.on("entity_death", this.onEntityDeath, this);
    this.scene.events.on("bomb_explosion", this.handleBombExplosion, this);
    this.scene.events.on("boss_ground_pound", this.handleBossGroundPound, this);
    this.scene.events.on("boss_summon", this.handleBossSummon, this);
  }

  /** Unregister combat event listeners (called from MainScene.shutdown). */
  unregisterEvents() {
    this.scene.events.off("player_attack", this.handlePlayerAttack, this);
    this.scene.events.off("player_super", this.handlePlayerSuper, this);
    this.scene.events.off("super_pierce", this.handleSuperPierce, this);
    this.scene.events.off("super_hit", this.handleSuperProjectileHit, this);
    this.scene.events.off("entity_death", this.onEntityDeath, this);
    this.scene.events.off("bomb_explosion", this.handleBombExplosion, this);
    this.scene.events.off(
      "boss_ground_pound",
      this.handleBossGroundPound,
      this
    );
    this.scene.events.off("boss_summon", this.handleBossSummon, this);
  }

  /** Create the periodic enemy/boss attack check timer. */
  setupEnemyAttackTimer() {
    const ms = this.config.entities.enemy.combat.attack_check_ms;
    this.enemyAttackTimer = this.scene.time.addEvent({
      delay: ms,
      callback: this.handleEnemyAttacks,
      callbackScope: this,
      loop: true,
    });
  }

  removeEnemyAttackTimer() {
    if (this.enemyAttackTimer) this.enemyAttackTimer.remove();
  }

  pauseTimers() {
    if (this.enemyAttackTimer) this.enemyAttackTimer.paused = true;
  }

  resumeTimers() {
    if (this.enemyAttackTimer) this.enemyAttackTimer.paused = false;
  }

  /** Cancel any active hit-stop (used when game pauses — ticket #230). */
  cancelHitStop() {
    if (this.hitStopActive) {
      if (this.hitStopTimer) {
        this.hitStopTimer.destroy();
        this.hitStopTimer = undefined;
      }
      this.hitStopActive = false;
    }
  }

  /**
   * Update super projectiles and clear the super-damage flag when all
   * projectiles have despawned. Called from MainScene.update().
   */
  updateProjectiles(dt: number) {
    const children = this.superProjectiles?.getChildren();
    if (!children) return;

    // Clear super damage flag once all projectiles have despawned (handles misses)
    if (this.superDamageActive) {
      let hasActive = false;
      for (let i = 0; i < children.length; i++) {
        if (children[i].active) {
          hasActive = true;
          break;
        }
      }
      if (!hasActive) this.superDamageActive = false;
    }

    // Update active projectiles
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.active) (child as SuperProjectile).update(dt);
    }
  }

  /**
   * Handle enemy & boss attacks via 2.5D distance checks on groundY.
   * Uses groundY (depth plane) instead of physics overlap so attacks connect
   * correctly across the walkable area band (R-004).
   */
  private handleEnemyAttacks() {
    if (!this.player || !this.player.active || this.player.hp <= 0) return;
    const phase = this.getPhase();
    if (phase === "lost" || phase === "victory") return;

    const player = this.player;
    const now = this.scene.time.now;
    const cooldownMs = this.config.combat.enemy_damage_cooldown_ms;
    const pkb = this.config.entities.player.knockback;

    // Check enemy attack damage — only when enemy is in attack animation
    // and within range on BOTH axes (horizontal + depth) separately.
    if (this.spawnManager.enemies) {
      const enemyAttackRange = this.config.entities.enemy.combat.attack_range;
      const enemyDamage = this.config.entities.enemy.damage;
      const depthThreshold = this.config.entities.enemy.combat.depth_threshold;

      this.spawnManager.enemies.getChildren().forEach((child) => {
        const enemy = child as Enemy;
        if (!enemy.active || enemy.hp <= 0) return;
        if (now - enemy.lastPlayerDamageTime < cooldownMs) return;

        // Only deal damage when enemy is playing attack animation
        const isAttacking =
          enemy.anims.isPlaying &&
          enemy.anims.currentAnim?.key.endsWith("_attack");
        if (!isAttacking) return;

        const dx = player.x - enemy.x;
        const hDist = Math.abs(dx);
        const dDist = Math.abs(player.groundY - enemy.groundY);

        // Check if enemy is actually facing the player
        const isFacingPlayer = enemy.flipX ? dx < 10 : dx > -10;

        // Enemy handles its own advance/stop distance. The damage hit code must match the
        // swing distance so the player actually takes damage when inside the enemy's attack range.
        const hitRange = enemyAttackRange;

        if (hDist < hitRange && dDist < depthThreshold && isFacingPlayer) {
          player.takeDamage(enemyDamage);
          player.applyKnockback(enemy.x, pkb.force, pkb.stun_ms);
          this.playSound("hurt");
          enemy.lastPlayerDamageTime = now;
        }
      });
    }

    // Check boss contact with player — separate axis checks
    if (this.boss && this.boss.active && this.boss.hp > 0) {
      if (now - this.lastBossDamageTime < cooldownMs) return;

      const bossAttackRange = this.boss.getAttackRange();
      const bossDamage = this.boss.getContactDamage();
      const bossDepthThreshold =
        this.config.entities.boss.combat.contact_depth_threshold;

      const hDist = Math.abs(this.player.x - this.boss.x);
      const dDist = Math.abs(this.player.groundY - this.boss.groundY);
      if (hDist < bossAttackRange && dDist < bossDepthThreshold) {
        this.player.takeDamage(bossDamage);
        this.player.applyKnockback(this.boss.x, pkb.force, pkb.stun_ms);
        this.playSound("hurt");
        this.lastBossDamageTime = now;
      }
    }
  }

  /**
   * Handle player attack - damage enemies, boss, and open chest (R-004: Attack handling)
   */
  private handlePlayerAttack(player: Player) {
    const playerConfig = this.config.entities.player;
    const scoring = this.config.scoring;
    const playerScale = player.scaleX;
    const reach = playerConfig.combat.reach * playerScale;
    const attackRange = playerConfig.combat.attack_range;
    const playerDamage = playerConfig.damage;

    const attackX = player.flipX ? player.x - reach : player.x + reach;
    const attackY = player.groundY;

    let hit = false;

    // Check enemy hits (use groundY for 2.5D depth-plane distance, not visual y)
    if (this.spawnManager.enemies) {
      this.spawnManager.enemies.getChildren().forEach((enemy) => {
        const e = enemy as Enemy;
        if (e.active && e.hp > 0) {
          const dist = Phaser.Math.Distance.Between(
            attackX,
            attackY,
            e.x,
            e.groundY
          );
          if (dist < attackRange) {
            e.takeDamage(playerDamage);
            const ekb = this.config.entities.enemy.knockback;
            e.applyKnockback(player.x, ekb.force, ekb.stun_ms);
            if (e.hp <= 0) {
              this.addScore(scoring.enemy_kill);
            }
            hit = true;
          }
        }
      });
    }

    // Check boss hit (use groundY for 2.5D depth-plane distance)
    if (this.boss && this.boss.active && this.boss.hp > 0) {
      const bossRange =
        this.config.entities.boss.combat.attack_range +
        this.config.combat.boss_melee_range_bonus;
      const dist = Phaser.Math.Distance.Between(
        attackX,
        attackY,
        this.boss.x,
        this.boss.groundY
      );
      if (dist < bossRange) {
        this.boss.takeDamage(playerDamage);
        const bkb = this.config.entities.boss.knockback;
        this.boss.applyKnockback(player.x, bkb.force, bkb.stun_ms);
        this.addScore(scoring.boss_hit);
        gameActions.incrementBossHits();
        hit = true;
      }
    }

    // R-004: Check chest hit (opens via attack, per spec)
    if (this.tryOpenChest(attackX, attackY)) {
      hit = true;
    }

    if (hit) {
      this.playSound("punch");
      this.triggerImpact();
    }
  }

  /**
   * Handle super attack - Hero charges up, then fires a hadouken projectile
   * Phase 1: Play hero_super animation (charge-up with glowing hands)
   * Phase 2: On last frame, spawn spinning coin projectile
   */
  private handlePlayerSuper(player: Player) {
    log.info(COMPONENT_NAME, "SUPER ATTACK - Charging up!");

    // Play the hero charge-up animation (row 6 of hero.png)
    // Validate animation exists AND has valid frames before playing.
    // Cached old sprites can cause Phaser to register animations with broken frame data.
    const anim = this.scene.anims.exists("hero_super")
      ? this.scene.anims.get("hero_super")
      : null;
    if (anim && anim.frames && anim.frames.length > 0) {
      try {
        player.play("hero_super", true);
        let superRetries = 0;
        const maxSuperRetries = 3;
        const onAnimComplete = () => {
          const phase = this.getPhase();
          if (!player.active || phase === "lost" || phase === "victory") {
            player.off(
              Phaser.Animations.Events.ANIMATION_COMPLETE,
              onAnimComplete
            );
            return;
          }
          if (player.anims.currentAnim?.key === "hero_super") {
            this.fireProjectile(player);
          } else if (superRetries < maxSuperRetries && player.active) {
            superRetries++;
            player.once(
              Phaser.Animations.Events.ANIMATION_COMPLETE,
              onAnimComplete
            );
          } else {
            log.warn(
              COMPONENT_NAME,
              "Super animation re-listen exceeded max retries, firing immediately"
            );
            this.fireProjectile(player);
          }
        };
        player.once(
          Phaser.Animations.Events.ANIMATION_COMPLETE,
          onAnimComplete
        );
      } catch (err) {
        log.warn(
          COMPONENT_NAME,
          "hero_super animation failed to play, firing immediately:",
          err
        );
        this.fireProjectile(player);
      }
    } else {
      log.warn(
        COMPONENT_NAME,
        "hero_super animation not found or has no valid frames, firing immediately"
      );
      this.fireProjectile(player);
    }
  }

  /**
   * Fire the hadouken projectile after charge-up animation completes
   */
  private fireProjectile(player: Player) {
    const superConfig = this.config.entities.player.super;
    const superEffects = superConfig.effects;

    log.info(COMPONENT_NAME, "SUPER ATTACK - Projectile fired!");

    // Camera shake on release
    this.scene.cameras.main.shake(
      superEffects.shake_duration,
      superEffects.shake_intensity
    );
    this.playSound("explosion");

    // Spawn projectile in the direction the player is facing
    const direction = player.flipX ? -1 : 1;
    const projectile = this.superProjectiles?.get() as SuperProjectile;
    if (projectile) {
      // Suppress super charge accumulation while super projectiles are in flight
      this.superDamageActive = true;
      // Set collision targets for efficient hit detection (direct group access vs scene scan)
      if (this.spawnManager.enemies) {
        projectile.setCollisionTargets(this.spawnManager.enemies, this.boss);
      }
      // Offset Y upward to torso height (origin is at feet with setOrigin(0.5, 1.0))
      const torsoY = player.y - player.displayHeight * 0.6;
      projectile.fire(player.x, torsoY, player.groundY, direction);
      const spritesConfig = this.scene.registry.get(
        "sprites_config"
      ) as SpritesConfig;
      projectile.setScale(
        SpriteManager.getScaleFactor(
          spritesConfig,
          "super",
          this.scene.cameras.main.height,
          this.designHeight
        )
      );
    }
  }

  /**
   * Handle super projectile piercing through an enemy — fire VFX + scoring
   */
  private handleSuperPierce(data: {x: number; y: number; killed: boolean}) {
    const scoring = this.config.scoring;

    // Score: full kill points if enemy died, hit points if survived
    if (data.killed) {
      this.addScore(scoring.enemy_kill);
    } else {
      this.addScore(scoring.super_hit);
      gameActions.incrementSuperHits();
    }

    // Fire burst VFX at pierce point
    const burst = this.scene.add.circle(data.x, data.y, 6, 0xff6600, 0.9);
    burst.setDepth(1000);
    this.scene.tweens.add({
      targets: burst,
      radius: 24,
      alpha: 0,
      duration: 200,
      onComplete: () => burst.destroy(),
    });

    // Inner white-hot core
    const core = this.scene.add.circle(data.x, data.y, 3, 0xffcc00, 1);
    core.setDepth(1001);
    this.scene.tweens.add({
      targets: core,
      radius: 10,
      alpha: 0,
      duration: 150,
      onComplete: () => core.destroy(),
    });

    this.playSound("punch");
  }

  /**
   * Handle super projectile boss impact — explosion VFX + scoring
   */
  private handleSuperProjectileHit(data: {
    x: number;
    y: number;
    groundY: number;
  }) {
    const scoring = this.config.scoring;
    const superEffects = this.config.entities.player.super.effects;

    this.addScore(scoring.boss_hit);
    gameActions.incrementBossHits();

    // Visual explosion at impact point
    this.triggerFlash();

    // Expanding ring VFX at impact
    const initialRadius = superEffects.explosion_initial_radius;
    const expandDuration = superEffects.explosion_expand_duration;
    const ring = this.scene.add.circle(
      data.x,
      data.y,
      initialRadius,
      0xffff00,
      0.5
    );
    ring.setDepth(1000);
    this.scene.tweens.add({
      targets: ring,
      radius: 80,
      alpha: 0,
      duration: expandDuration,
      onComplete: () => ring.destroy(),
    });

    log.info(COMPONENT_NAME, "Super projectile hit boss!");
  }

  /**
   * Handle bomb explosion - damage player and enemies in radius
   */
  private handleBombExplosion(data: {
    x: number;
    y: number;
    radius: number;
    damage: number;
  }) {
    // Play explosion sound using seeded RNG (ticket #118)
    this.playSound("explosion");

    // Damage player if in range
    if (this.player && this.player.active && this.player.hp > 0) {
      const distToPlayer = Phaser.Math.Distance.Between(
        data.x,
        data.y,
        this.player.x,
        this.player.groundY
      );
      if (distToPlayer < data.radius) {
        this.player.takeDamage(data.damage);
        this.playSound("hurt");
      }
    }

    // Damage enemies if in range
    if (this.spawnManager.enemies) {
      this.spawnManager.enemies.getChildren().forEach((enemy) => {
        const e = enemy as Enemy;
        if (e.active && e.hp > 0) {
          const dist = Phaser.Math.Distance.Between(
            data.x,
            data.y,
            e.x,
            e.groundY
          );
          if (dist < data.radius) {
            e.takeDamage(data.damage);
          }
        }
      });
    }

    // Damage boss if in range
    if (this.boss && this.boss.active && this.boss.hp > 0) {
      const distToBoss = Phaser.Math.Distance.Between(
        data.x,
        data.y,
        this.boss.x,
        this.boss.groundY
      );
      if (distToBoss < data.radius) {
        this.boss.takeDamage(data.damage);
      }
    }

    // Damage tresr bot if in range
    if (this.tresrBot && this.tresrBot.active && this.tresrBot.hp > 0) {
      const distToBot = Phaser.Math.Distance.Between(
        data.x,
        data.y,
        this.tresrBot.x,
        this.tresrBot.groundY
      );
      if (distToBot < data.radius) {
        this.tresrBot.takeDamage(data.damage);
      }
    }
  }

  /**
   * Handle boss ground pound AoE — damage player if in radius, VFX + camera shake
   */
  private handleBossGroundPound(data: {
    x: number;
    y: number;
    radius: number;
    damage: number;
  }) {
    this.playSound("explosion");
    const gpFx = this.config.entities.boss.ground_pound_effects;
    this.scene.cameras.main.shake(gpFx.shake_duration, gpFx.shake_intensity);

    // Expanding ring VFX
    const ring = this.scene.add.circle(
      data.x,
      data.y,
      gpFx.ring_initial_radius,
      0xff4400,
      0.6
    );
    ring.setDepth(1000);
    this.scene.tweens.add({
      targets: ring,
      radius: data.radius,
      alpha: 0,
      duration: gpFx.ring_expand_duration,
      onComplete: () => ring.destroy(),
    });

    // Damage player if in range
    if (this.player && this.player.active && this.player.hp > 0) {
      const dist = Phaser.Math.Distance.Between(
        data.x,
        data.y,
        this.player.x,
        this.player.groundY
      );
      if (dist < data.radius) {
        this.player.takeDamage(data.damage);
        this.playSound("hurt");
      }
    }
  }

  /**
   * Handle boss summon — spawn enemies near the boss position
   */
  private handleBossSummon(data: {x: number; y: number; count: number}) {
    if (!this.spawnManager.enemies || !this.player) return;

    const spritesConfig = this.scene.registry.get(
      "sprites_config"
    ) as SpritesConfig;
    const enemyCount = spritesConfig.enemies.count;
    const {width} = this.scene.cameras.main;

    const summonOffscreen = this.config.combat.enemy_spawn_offscreen_px;
    for (let i = 0; i < data.count; i++) {
      // Spawn off-screen from alternating edges, walk in toward boss area
      const groundY = this.walkableArea.getRandomGroundY(this.rng);
      const edge = i % 2; // alternate left/right
      const spawnX = edge === 0 ? -summonOffscreen : width + summonOffscreen;
      const walkInTargetX = this.rng.integerInRange(
        this.walkableArea.getLeftX() + 40,
        this.walkableArea.getRightX() - 40
      );

      const enemyVariant = this.rng.integerInRange(1, enemyCount);
      const textureKey = `enemy_${enemyVariant}_idle`;

      // Lazy-load enemy variant sprites on first spawn
      this.spriteManager.ensureEnemyLoaded(enemyVariant).then(() => {
        if (!this.spawnManager.enemies || !this.player) return;
        const enemy = this.spawnManager.enemies.get(
          spawnX,
          groundY,
          textureKey
        ) as Enemy;
        if (enemy) {
          // Hide immediately — group.get() makes the sprite visible at its old
          // pool position. spawn() will reveal it after setup is complete.
          enemy.setVisible(false);
          enemy.spawn(spawnX, groundY, this.rng, walkInTargetX, textureKey);
          enemy.setTarget(this.player);
          const enemyScale = SpriteManager.getScaleFactor(
            spritesConfig,
            textureKey,
            this.scene.cameras.main.height,
            this.designHeight
          );
          enemy.setScale(enemyScale);
          scaleCircleBody(enemy, this.config.entities.enemy.hitbox);
        }
      });
    }
  }

  /** Handle entity death — sounds, loot, super charge, boss death VFX */
  private onEntityDeath(data: {type: string; x: number; y: number}) {
    if (data.type.startsWith("enemy")) {
      this.playSound("death");
      gameActions.incrementEnemiesKilled();
      this.spawnManager.spawnLoot(data.x, data.y);

      // Don't replenish super charge from kills caused by the super attack itself
      if (this.superDamageActive) return;

      // Accumulate super charge on enemy kill
      const chargePerKill = this.config.entities.player.super.charge_per_kill;
      const maxCharge = this.config.entities.player.super.max_charge;
      gameActions.addSuperCharge(chargePerKill, maxCharge);
    } else if (data.type === "boss") {
      trackBossDefeated();
      this.playSound("explosion");
      void MusicManager.getInstance().stop();

      // Fire explosion VFX — 3-layer expanding circles
      const deathFx = this.config.entities.boss.death_effects;

      // Layer 1: White-hot core
      const core = this.scene.add.circle(data.x, data.y, 15, 0xffffff, 1);
      core.setDepth(1002);
      this.scene.tweens.add({
        targets: core,
        radius: 40,
        alpha: 0,
        duration: 200,
        onComplete: () => core.destroy(),
      });

      // Layer 2: Orange inner fire
      const inner = this.scene.add.circle(data.x, data.y, 20, 0xff6600, 0.9);
      inner.setDepth(1001);
      this.scene.tweens.add({
        targets: inner,
        radius: 80,
        alpha: 0,
        duration: 300,
        onComplete: () => inner.destroy(),
      });

      // Layer 3: Red-orange outer ring
      const outer = this.scene.add.circle(data.x, data.y, 30, 0xff4400, 0.7);
      outer.setDepth(1000);
      this.scene.tweens.add({
        targets: outer,
        radius: 150,
        alpha: 0,
        duration: 500,
        onComplete: () => outer.destroy(),
      });

      // Camera shake + fire-tinted flash
      this.scene.cameras.main.shake(
        deathFx.shake_duration,
        deathFx.shake_intensity
      );
      this.scene.cameras.main.flash(
        deathFx.flash_duration,
        deathFx.flash_r,
        deathFx.flash_g,
        deathFx.flash_b
      );
    }
  }

  private triggerImpact() {
    const playerConfig = this.config.entities.player;
    this.scene.cameras.main.shake(
      playerConfig.effects.attack_shake_duration,
      playerConfig.effects.attack_shake_intensity
    );
    this.playSound("hurt");

    // Hit stop: pause physics briefly (ticket #230: track state for pause sync fix)
    const hitStopMs = playerConfig.combat.hit_stop_ms;

    // Cancel any overlapping hit-stop before starting a new one
    if (this.hitStopTimer) {
      this.hitStopTimer.destroy();
      this.hitStopTimer = undefined;
    }

    this.hitStopActive = true;
    (
      this.scene as Phaser.Scene & {
        physics: Phaser.Physics.Arcade.ArcadePhysics;
      }
    ).physics.world.pause();
    this.hitStopTimer = this.scene.time.delayedCall(hitStopMs, () => {
      this.hitStopActive = false;
      this.hitStopTimer = undefined;
      (
        this.scene as Phaser.Scene & {
          physics: Phaser.Physics.Arcade.ArcadePhysics;
        }
      ).physics.world.resume();
    });
    this.addAdHocTimer(this.hitStopTimer);
  }

  triggerFlash() {
    const flashDuration =
      this.config.entities.player.effects.victory_flash_duration;
    this.scene.cameras.main.flash(flashDuration, 255, 255, 255);
  }

  /**
   * Attempt to open chest via player attack (R-004: Chest opens via punch)
   * Returns true if chest was opened
   */
  tryOpenChest(attackX: number, attackY: number): boolean {
    if (!this.chest || !this.chest.active) return false;

    const dist = Phaser.Math.Distance.Between(
      attackX,
      attackY,
      this.chest.x,
      this.chest.groundY
    );

    const chestRange = this.config.entities.chest.combat.interact_range;
    if (dist < chestRange) {
      if (this.chest.open()) {
        this.playSound("open_treasure_chest");
        return true;
      }
    }
    return false;
  }

  shutdown() {
    this.enemyAttackTimer?.destroy();
    this.superProjectiles?.clear(true, true);
    if (this.hitStopTimer) {
      this.hitStopTimer.destroy();
      this.hitStopTimer = undefined;
    }
    this.lastBossDamageTime = 0;
    this.hitStopActive = false;
    this.superDamageActive = false;
    this.player = undefined;
    this.boss = undefined;
    this.chest = undefined;
    this.tresrBot = undefined;
  }
}
