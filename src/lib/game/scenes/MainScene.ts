import Phaser from "phaser";
import {SCENE_KEYS} from "@/lib/game/constants";
import {Player} from "@/lib/game/prefabs/Player";
import {Enemy} from "@/lib/game/prefabs/Enemy";
import {Key} from "@/lib/game/prefabs/Key";
import {Boss} from "@/lib/game/prefabs/Boss";
import {Chest} from "@/lib/game/prefabs/Chest";
import {Bomb} from "@/lib/game/prefabs/Bomb";
import {SuperProjectile} from "@/lib/game/prefabs/SuperProjectile";
import {LootDrop} from "@/lib/game/prefabs/LootDrop";
import {TresrBot} from "@/lib/game/prefabs/TresrBot";
import {gameActions, gameState} from "@/lib/game/state";
import {Recorder} from "@/lib/game/Recorder";
import {SpriteManager, type SpritesConfig} from "@/lib/game/SpriteManager";
import {setDoc} from "@junobuild/core";
import {claimAuthorize} from "@/declarations/satellite/satellite.api";
import {getUserProfile, saveUserProfile} from "@/lib/user";
import {getAuthState} from "@/lib/auth";
import {
  trackGameLoss,
  trackGameWin,
  trackBossSpawned,
  trackBossDefeated,
  trackPlayerDeath,
  trackLevelComplete,
  trackGamePause,
  trackGameResume,
} from "@/lib/metrics/analytics";
import MusicManager from "@/lib/game/MusicManager";
import {WalkableArea} from "@/lib/game/WalkableArea";
import {log} from "@/lib/utils/log";
import {canonicalStringify} from "@/lib/utils/canonical-stringify";
import {timingSafeEqual} from "@/lib/utils/timing-safe-equal";
import {recordOffense} from "@/lib/auth/ban";
import {incrementGuestSession} from "@/lib/auth/guest";
import TouchInput from "@/lib/game/TouchInput";

// Helper type for gameplay config (entity-centric schema)
interface GameplayConfig {
  time_limit_seconds: number;
  physics: {
    gravity: number;
    timestep: number;
  };
  visuals: {
    shadow: {color: number; opacity: number; width: number; height: number};
    damage_tint_duration: number;
  };
  scoring: {
    key_collection: number;
    enemy_kill: number;
    boss_hit: number;
    super_hit: number;
  };
  entities: {
    player: {
      health: number;
      damage: number;
      speed: number;
      jump_force: number;
      knockback: {force: number; stun_ms: number};
      hitbox: {radius: number; offsetX: number; offsetY: number};
      combat: {reach: number; attack_range: number; hit_stop_ms: number};
      super: {
        damage: number;
        splash_damage: number;
        splash_radius: number;
        speed: number;
        max_range: number;
        charge_per_kill: number;
        max_charge: number;
        max_projectiles: number;
        hitbox: {
          width: number;
          height: number;
          hit_radius: number;
          depth_threshold: number;
          fire_offset: number;
          offscreen_margin: number;
        };
        effects: {
          shake_duration: number;
          shake_intensity: number;
          explosion_initial_radius: number;
          explosion_expand_duration: number;
        };
      };
      effects: {
        attack_shake_duration: number;
        attack_shake_intensity: number;
        victory_flash_duration: number;
      };
      spawn: {x_ratio: number; y_ratio: number};
      lives: number;
      respawn: {
        invincibility_ms: number;
        blink_interval_ms: number;
        delay_ms: number;
      };
      input: {
        gamepad_deadzone: number;
        touch: {joystick_radius: number; joystick_deadzone: number};
      };
    };
    enemy: {
      health: number;
      damage: number;
      speed: number;
      knockback: {force: number; stun_ms: number};
      hitbox: {radius: number; offsetX: number; offsetY: number};
      combat: {
        attack_range: number;
        attack_check_ms: number;
        depth_threshold: number;
      };
      ai: Record<string, Record<string, number>>;
      animations: {death_delay: number};
      spawner: {pool_size: number; delay_ms: number; buffer_distance: number};
      loot: {
        health: {
          drop_chance: number;
          heal_amount: number;
          variants: number;
        };
        powerup: {drop_chance: number; variants: number};
        pool_size: number;
        bob_distance: number;
        bob_duration: number;
        despawn_ms: number;
      };
    };
    boss: {
      health: number;
      damage: number;
      speed: number;
      knockback: {force: number; stun_ms: number};
      hitbox: {radius: number; offsetX: number; offsetY: number};
      combat: {attack_range: number; contact_depth_threshold: number};
      descent: {speed: number; start_y: number; threshold_ratio: number};
      phases: {
        enrage_threshold: number;
        phase2_speed_mult: number;
        phase2_damage_mult: number;
      };
      attacks: {
        ground_pound: {
          damage: number;
          radius: number;
          windup_ms: number;
          cooldown_ms: number;
        };
        charge: {
          speed_mult: number;
          damage: number;
          duration_ms: number;
          cooldown_ms: number;
        };
        summon: {count: number; cooldown_ms: number};
      };
      attack_cooldown_ms: number;
      charge_range_mult: number;
      summon_pause_s: number;
      defeated_alpha: number;
      enrage_flash_ms: number;
      ground_pound_effects: {
        shake_duration: number;
        shake_intensity: number;
        ring_initial_radius: number;
        ring_expand_duration: number;
      };
      death_effects: {
        shake_duration: number;
        shake_intensity: number;
        flash_duration: number;
        flash_r: number;
        flash_g: number;
        flash_b: number;
      };
      animations: {death_delay: number};
    };
    key: {
      speed: number;
      gravity: number;
      bounce_threshold: number;
      oscillation: {frequency: number; amplitude: number};
      bounce_damping: number;
      offscreen_kill_distance: number;
      animations: {fade_duration: number; fade_delay: number};
      spawner: {
        pool_size: number;
        delay_ms: number;
        start_z: number;
        x_margin: number;
        y_margin_top_ratio: number;
        y_margin_bottom_ratio: number;
      };
    };
    bomb: {
      damage: number;
      explosion_radius: number;
      hitbox: {width: number; height: number};
      effects: {shake_duration: number; shake_intensity: number};
      spawner: {
        pool_size: number;
        delay_ms: number;
        start_z: number;
        x_margin: number;
        y_margin_top_ratio: number;
        y_margin_bottom_ratio: number;
      };
    };
    chest: {
      combat: {interact_range: number};
      air_drop: {
        delay_after_boss_ms: number;
        landing_flash_color: number;
        landing_flash_ms: number;
        landing_dust_color: number;
        landing_dust_radius: number;
        landing_dust_duration_ms: number;
        landing_shake_duration: number;
        landing_shake_intensity: number;
      };
    };
    tresr_bot: {
      health: number;
      damage: number;
      speed: number;
      air_drop: {
        landing_flash_color: number;
        landing_flash_ms: number;
        landing_dust_color: number;
        landing_dust_radius: number;
        landing_dust_duration_ms: number;
        landing_shake_duration: number;
        landing_shake_intensity: number;
      };
      knockback: {force: number; stun_ms: number};
      hitbox: {radius: number; offsetX: number; offsetY: number};
      combat: {
        attack_range: number;
        attack_cooldown_ms: number;
        target_switch_ms: number;
      };
      lifetime: {
        duration_ms: number;
        fade_duration_ms: number;
        spawn_flash_ms: number;
      };
      special: {
        cooldown_ms: number;
        damage: number;
        radius: number;
        min_enemies: number;
      };
      max_concurrent: number;
      max_drops_per_game: number;
    };
  };
  walkable_area: {
    top_y_ratio: number;
    bottom_y_ratio: number;
    left_x_ratio: number;
    right_x_ratio: number;
  };
  combat: {
    enemy_damage_cooldown_ms: number;
    enemy_spawn_offscreen_px: number;
    boss_melee_range_bonus: number;
    projectile_hit_radius: number;
  };
  announcements: {
    font: string;
    color: string;
    stroke_color: string;
    stroke_thickness: number;
    enter_duration: number;
    display_duration: number;
    exit_duration: number;
  };
  audio: {
    crossfade_duration_ms: number;
    crossfade_step_ms: number;
    sfx_variants: Record<string, number>;
  };
}

const COMPONENT_NAME = "MainScene";

export class MainScene extends Phaser.Scene {
  private player?: Player;
  private enemies?: Phaser.Physics.Arcade.Group;
  private keys?: Phaser.Physics.Arcade.Group;
  private bombs?: Phaser.Physics.Arcade.Group;
  private superProjectiles?: Phaser.Physics.Arcade.Group;
  private lootDrops?: Phaser.Physics.Arcade.Group;
  private boss?: Boss;
  private chest?: Chest;
  private tresrBot?: TresrBot;
  private powerupDropCount: number = 0;
  private recorder: Recorder = new Recorder();
  private spriteManager: SpriteManager;
  private gameplayConfig!: GameplayConfig;
  private walkableArea!: WalkableArea;

  private survivalTimer: number = 300;
  private survivalCountdown?: Phaser.Time.TimerEvent;
  private spawnTimer?: Phaser.Time.TimerEvent;
  private keySpawnTimer?: Phaser.Time.TimerEvent;
  private bombSpawnTimer?: Phaser.Time.TimerEvent;
  private enemyAttackTimer?: Phaser.Time.TimerEvent;
  private background?: Phaser.GameObjects.Image;

  public collectedKeys: number = 0;
  public score: number = 0;
  public phase: "survival" | "boss" | "victory" | "lost" = "survival";
  public sessionId: string = "";
  public userAddr: string = "";
  public configHash: string = "";
  private configTampered: boolean = false;
  private superDamageActive: boolean = false;

  // Change detection for store updates (ticket #162, #200: avoid per-frame thrashing)
  private lastReportedScore: number = 0;
  private lastReportedKeys: number = 0;
  private lastReportedHp: number = 0;
  private lastReportedBossHp: number = 0;

  private escKey?: Phaser.Input.Keyboard.Key;

  // Ad-hoc timer tracking for cleanup on shutdown (ticket #195)
  private adHocTimers: Phaser.Time.TimerEvent[] = [];

  // Store unsubscribe function for cleanup
  private storeUnsubscribe?: () => void;

  // Seeded RNG for reproducible gameplay
  private rng!: Phaser.Math.RandomDataGenerator;
  private seed: number = 0;

  // Damage cooldown tracking for overlap-based collision
  private lastBossDamageTime: number = 0;

  // Hit-stop state tracking (ticket #230)
  private hitStopActive: boolean = false;
  private hitStopTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super(SCENE_KEYS.MAIN);
    this.spriteManager = new SpriteManager(this);
  }

  /** Apply a circular physics body from config hitbox values.
   *  All values are in unscaled frame-local coords. Phaser internally applies
   *  the game object's scale (_sx/_sy) to both the radius (via sourceWidth/height)
   *  and the offset (via the body position formula: body.y = sprite.y + scaleY *
   *  (offset.y - displayOriginY)). No manual scaling needed. */
  private scaleCircleBody(
    entity: Phaser.Physics.Arcade.Sprite,
    hitbox: {radius: number; offsetX: number; offsetY: number}
  ) {
    const body = entity.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setCircle(hitbox.radius, hitbox.offsetX, hitbox.offsetY);
    }
  }

  /** Apply a rectangular physics body from config hitbox values.
   *  Values are in unscaled frame-local coords — Phaser applies _sx/_sy internally. */
  private scaleRectBody(
    entity: Phaser.Physics.Arcade.Sprite,
    hitbox: {width: number; height: number}
  ) {
    const body = entity.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setSize(hitbox.width, hitbox.height);
    }
  }

  async init(data: {sessionId?: string; userAddr?: string; seed?: number}) {
    // Use fee-gate session ID passed from Preloader; guests get a non-claimable placeholder (ticket #244)
    this.sessionId = data.sessionId || `guest-${Date.now()}`;
    this.userAddr =
      data.userAddr || "0x0000000000000000000000000000000000000000";

    // Initialize seeded RNG for reproducible gameplay
    this.seed = data.seed || Date.now();
    this.rng = new Phaser.Math.RandomDataGenerator([this.seed.toString()]);
    this.physics.world.setFPS(60); // Fixed physics step for determinism

    this.recorder.reset();
    this.configTampered = false;
    this.hitStopActive = false;
    this.hitStopTimer = undefined;
    this.superDamageActive = false;
    this.powerupDropCount = 0;
    TouchInput.getInstance().reset();
    gameActions.setPaused(false);

    // Verify and store config hash for anti-cheat (ticket #108, #128)
    // Blocking — must complete before gameplay starts
    const hashValid = await this.verifyConfigHash();
    if (!hashValid) {
      this.configTampered = true;
      gameActions.setConfigTampered();
      log.error(
        COMPONENT_NAME,
        "Config integrity check failed. Gameplay disabled."
      );
    }

    // Subscribe to Pause state (store unsubscribe for cleanup)
    this.storeUnsubscribe = gameState.subscribe((state) => {
      this.setPause(state.isPaused);
    });
  }

  /**
   * Verify config integrity by computing a hash of critical gameplay values
   * and comparing it to the build-time hash stored in the config.
   * Returns true if hash matches (or no build hash to compare against).
   * The hash is stored on the session for backend verification.
   */
  private async verifyConfigHash(): Promise<boolean> {
    const fullConfig = this.registry.get("full_config");
    if (!fullConfig?.gameplay) return false;

    const gameplay = fullConfig.gameplay;
    const criticalValues = {
      entities: gameplay.entities,
      scoring: gameplay.scoring,
      time_limit_seconds: gameplay.time_limit_seconds,
      max_keys: gameplay.max_keys,
      walkable_area: gameplay.walkable_area,
      physics: gameplay.physics,
      combat: gameplay.combat,
      audio: gameplay.audio,
      vault: gameplay.vault,
    };
    const criticalJson = canonicalStringify(criticalValues);

    const encoder = new TextEncoder();
    const data = encoder.encode(criticalJson);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedHash = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    this.configHash = computedHash;

    // Compare with build-time hash
    const buildHash = fullConfig.configHash as string | undefined;
    if (buildHash && !timingSafeEqual(buildHash, computedHash)) {
      log.error(
        COMPONENT_NAME,
        "Config hash mismatch! Game config may have been tampered with."
      );
      return false;
    }

    return true;
  }

  private setPause(isPaused: boolean) {
    if (isPaused) {
      trackGamePause();
      // Cancel active hit-stop before pausing (ticket #230)
      if (this.hitStopActive) {
        if (this.hitStopTimer) {
          this.hitStopTimer.destroy();
          this.hitStopTimer = undefined;
        }
        this.hitStopActive = false;
        // Physics is already paused by hit-stop; game pause keeps it paused.
      }
      this.physics.world.pause();
      this.anims.pauseAll();
      this.time.paused = true;
    } else {
      trackGameResume();
      this.physics.world.resume();
      this.anims.resumeAll();
      this.time.paused = false;
    }
  }

  create() {
    // Block gameplay if config integrity check failed (#128)
    if (this.configTampered) {
      log.error(COMPONENT_NAME, "Config tampered — scene creation aborted.");

      // Show visible error on game canvas
      const {width, height} = this.cameras.main;
      this.add
        .text(
          width / 2,
          height / 2,
          "Configuration error.\nPlease refresh the page.",
          {
            font: "32px Orbitron",
            color: "#ff0000",
            align: "center",
          }
        )
        .setOrigin(0.5)
        .setDepth(1000);

      // Clean up store subscription from init()
      if (this.storeUnsubscribe) {
        this.storeUnsubscribe();
        this.storeUnsubscribe = undefined;
      }

      // Notify Astro layer
      document.dispatchEvent(new CustomEvent("tresr:config-tampered"));
      return;
    }

    log.info(COMPONENT_NAME, "God Mode Initialized.");
    const {width, height} = this.cameras.main;

    // Load gameplay config from registry
    const fullConfig = this.registry.get("full_config");
    this.gameplayConfig = fullConfig.gameplay as GameplayConfig;

    // Initialize survival timer from config
    this.survivalTimer = this.gameplayConfig.time_limit_seconds;

    // Initialize walkable area from config ratios × canvas dimensions
    const wa = this.gameplayConfig.walkable_area;
    this.walkableArea = new WalkableArea(
      wa.top_y_ratio,
      wa.bottom_y_ratio,
      wa.left_x_ratio,
      wa.right_x_ratio,
      width,
      height
    );
    // Store in registry so entities can access it
    this.registry.set("walkable_area", this.walkableArea);

    // CRITICAL: Create animations FIRST before any sprites try to use them
    this.createAnimations();

    // Input: ESC for Pause
    if (this.input.keyboard) {
      this.escKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.ESC
      );
    }

    // Background — scale wallpaper to fill the canvas (cover fit)
    const wallpaperKey = this.registry.get("selected_wallpaper") as string;
    log.info(COMPONENT_NAME, `Using wallpaper: ${wallpaperKey}`);

    this.background = this.add.image(width / 2, height / 2, wallpaperKey);
    // Scale to cover the full canvas while maintaining aspect ratio
    const tex = this.textures.get(wallpaperKey).getSourceImage();
    const scaleX = width / tex.width;
    const scaleY = height / tex.height;
    const coverScale = Math.max(scaleX, scaleY);
    this.background.setScale(coverScale);
    this.background.setScrollFactor(0);
    this.background.setDepth(-1000);

    // Set World Boundaries
    this.physics.world.setBounds(0, 0, width, height);
    this.cameras.main.setBounds(0, 0, width, height);

    // Listen for canvas resize events
    this.scale.on("resize", this.handleResize, this);

    // Get entity configs
    const entities = this.gameplayConfig.entities;

    // Bombs group (falling bombs that explode on impact)
    // Note: runChildUpdate disabled - we manually call update() in scene update()
    // to ensure Z-axis physics runs after the Arcade physics step (same phase as Player)
    // enable: false prevents createCallbackHandler from re-enabling bodies after construction
    // allowGravity: false prevents Arcade gravity from fighting with our Z-axis system
    this.bombs = this.physics.add.group({
      classType: Bomb,
      maxSize: entities.bomb.spawner.pool_size,
      runChildUpdate: false,
      enable: false,
      allowGravity: false,
    });

    // Super projectile group (hadouken-style spinning coin)
    this.superProjectiles = this.physics.add.group({
      classType: SuperProjectile,
      maxSize: entities.player.super.max_projectiles,
      runChildUpdate: true,
    });

    // Instantiate Player at spawn position from config ratios
    this.player = new Player(
      this,
      Math.round(entities.player.spawn.x_ratio * width),
      Math.round(entities.player.spawn.y_ratio * height)
    );
    const spritesConfig = this.registry.get("sprites_config") as SpritesConfig;
    const heroScale = SpriteManager.getScaleFactor(spritesConfig, "hero");
    this.player.setScale(heroScale);
    this.scaleCircleBody(this.player, entities.player.hitbox);
    this.player.play("hero_idle", true);
    this.player.setRecorder(this.recorder);

    // Instantiate TresrBot (starts inactive, spawned on powerup collection)
    this.tresrBot = new TresrBot(this, 0, 0);
    this.physics.add.existing(this.tresrBot);
    const botScale = SpriteManager.getScaleFactor(spritesConfig, "tresr_bot");
    this.tresrBot.setScale(botScale);
    this.scaleCircleBody(this.tresrBot, entities.tresr_bot.hitbox);

    // Initialize lives from config (ticket #191)
    gameActions.setLives(entities.player.lives);

    // Setup Groups
    this.enemies = this.physics.add.group({
      classType: Enemy,
      defaultKey: "enemy_1",
      maxSize: entities.enemy.spawner.pool_size,
      runChildUpdate: true,
    });
    // Store in registry so swarm AI can find nearby allies
    this.registry.set("enemy_group", this.enemies);
    // Note: Keys/bombs use runChildUpdate: false and are manually updated in scene update()
    // to ensure Z-axis physics runs after the Arcade physics step.
    // allowGravity: false prevents Arcade gravity from fighting with our Z-axis system
    // immovable: true prevents Arcade from applying velocity to the body
    // Body stays enabled for overlap detection (key collection during fall)
    this.keys = this.physics.add.group({
      classType: Key,
      maxSize: entities.key.spawner.pool_size,
      runChildUpdate: false,
      allowGravity: false,
      immovable: true,
    });

    // Loot drop pool (ticket #192)
    this.lootDrops = this.physics.add.group({
      classType: LootDrop,
      maxSize: entities.enemy.loot.pool_size,
      runChildUpdate: false,
      allowGravity: false,
    });

    // Collisions
    this.physics.add.overlap(
      this.player,
      this.keys,
      this.collectKey,
      undefined,
      this
    );

    // Enemy contact damage is handled in handleEnemyAttacks() via distance
    // check on groundY, not physics overlap — this ensures 2.5D depth-plane
    // alignment works correctly across the walkable area band.

    // Loot collection overlap (ticket #192)
    this.physics.add.overlap(
      this.player,
      this.lootDrops,
      this.collectLoot,
      undefined,
      this
    );

    // Event Listeners
    this.events.on("boss_defeated", this.spawnChest, this);
    this.events.on("game_win", this.onVictory, this);
    this.events.on("player_attack", this.handlePlayerAttack, this);
    this.events.on("player_super", this.handlePlayerSuper, this);
    this.events.on("super_pierce", this.handleSuperPierce, this);
    this.events.on("super_hit", this.handleSuperProjectileHit, this);
    this.events.on("player_death", this.onPlayerDeath, this);
    this.events.on("entity_death", this.onEntityDeath, this);
    this.events.on("bomb_explosion", this.handleBombExplosion, this);
    this.events.on("boss_ground_pound", this.handleBossGroundPound, this);
    this.events.on("boss_summon", this.handleBossSummon, this);
    this.events.on("bot_attack", this.handleBotAttack, this);
    this.events.on("bot_special", this.handleBotSpecial, this);
    this.events.on("bot_land", this.handleBotLand, this);
    this.events.on("chest_land", this.handleChestLand, this);

    // Fade in from black (cinematic transition from Preloader)
    this.cameras.main.fadeIn(1000, 0, 0, 0);

    // 3-2-1 countdown before gameplay starts
    this.showCountdown(() => {
      this.startGameplay();
    });
  }

  private showCountdown(onComplete: () => void) {
    const {width, height} = this.cameras.main;
    const ann = this.gameplayConfig.announcements;

    const numbers = ["3", "2", "1"];
    let index = 0;

    const showNext = () => {
      if (index >= numbers.length) {
        this.showPhaseAnnouncement("BEAR MARKET");
        onComplete();
        return;
      }

      const numText = this.add
        .text(width / 2, height / 2, numbers[index], {
          font: ann.font,
          color: ann.color,
          stroke: ann.stroke_color,
          strokeThickness: ann.stroke_thickness,
        })
        .setOrigin(0.5)
        .setDepth(1000)
        .setScale(3)
        .setAlpha(1);

      // Play countdown SFX
      try {
        this.sound.play("countdown_1", {
          volume: gameState.get().music.sfxVolume,
        });
      } catch {
        // SFX may not be ready yet
      }

      // Each beat lasts 1 second: tween animates out over 800ms,
      // then a 200ms gap before the next number starts.
      this.tweens.add({
        targets: numText,
        scale: 1,
        alpha: 0,
        duration: 800,
        ease: "Power2",
        onComplete: () => {
          numText.destroy();
          index++;
          this.adHocTimers.push(this.time.delayedCall(200, showNext));
        },
      });
    };

    // Start countdown after a brief delay to let fade-in start
    this.adHocTimers.push(this.time.delayedCall(400, showNext));
  }

  private startGameplay() {
    // Signal music to start now that gameplay has begun
    window.dispatchEvent(new Event("tresr:gameplay-start"));

    const entities = this.gameplayConfig.entities;

    // Survival Clock
    this.survivalCountdown = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (this.phase !== "survival") return;
        if (this.survivalTimer > 0) {
          this.survivalTimer--;
          this.updateTimerStatus();

          // At 5 seconds remaining: enemies flee, stop spawning new ones
          if (this.survivalTimer === 5) {
            if (this.spawnTimer) this.spawnTimer.remove();
            if (this.enemies) {
              this.enemies.getChildren().forEach((child) => {
                const enemy = child as Enemy;
                if (enemy.active) enemy.flee();
              });
            }
          }

          // 3-2-1 countdown SFX
          if (this.survivalTimer <= 3 && this.survivalTimer > 0) {
            this.playSound("countdown");
          }
        } else {
          this.onSurvivalComplete();
        }
      },
      callbackScope: this,
      loop: true,
    });

    // Spawners
    this.spawnTimer = this.time.addEvent({
      delay: entities.enemy.spawner.delay_ms,
      callback: this.spawnEnemy,
      callbackScope: this,
      loop: true,
    });
    // Key Spawner
    this.keySpawnTimer = this.time.addEvent({
      delay: entities.key.spawner.delay_ms,
      callback: this.spawnKey,
      callbackScope: this,
      loop: true,
    });
    // Bomb spawner
    this.bombSpawnTimer = this.time.addEvent({
      delay: entities.bomb.spawner.delay_ms,
      callback: this.spawnBomb,
      callbackScope: this,
      loop: true,
    });

    // Enemy attack timer (R-004: enemies deal damage on contact)
    const enemyAttackCheckMs = entities.enemy.combat.attack_check_ms;
    this.enemyAttackTimer = this.time.addEvent({
      delay: enemyAttackCheckMs,
      callback: this.handleEnemyAttacks,
      callbackScope: this,
      loop: true,
    });
  }

  /**
   * Shutdown handler for proper cleanup (R-004: Event listener cleanup)
   * Ensures all tweens, timers, sounds, and keyboard listeners are cleaned up
   */
  shutdown() {
    log.info(COMPONENT_NAME, "Shutting down, cleaning up...");

    // Clean up event listeners
    this.scale.off("resize", this.handleResize, this);
    this.events.off("boss_defeated", this.spawnChest, this);
    this.events.off("game_win", this.onVictory, this);
    this.events.off("player_attack", this.handlePlayerAttack, this);
    this.events.off("player_super", this.handlePlayerSuper, this);
    this.events.off("super_pierce", this.handleSuperPierce, this);
    this.events.off("super_hit", this.handleSuperProjectileHit, this);
    this.events.off("player_death", this.onPlayerDeath, this);
    this.events.off("entity_death", this.onEntityDeath, this);
    this.events.off("bomb_explosion", this.handleBombExplosion, this);
    this.events.off("boss_ground_pound", this.handleBossGroundPound, this);
    this.events.off("boss_summon", this.handleBossSummon, this);
    this.events.off("bot_attack", this.handleBotAttack, this);
    this.events.off("bot_special", this.handleBotSpecial, this);
    this.events.off("bot_land", this.handleBotLand, this);
    this.events.off("chest_land", this.handleChestLand, this);

    // Remove any pending super animation listener (ticket #251)
    if (this.player?.active) {
      this.player.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
    }

    // Kill all active tweens to prevent memory leaks from phase announcements/hit effects
    this.tweens.killAll();

    // Remove all keyboard listeners (prevents orphaned listeners on scene restart)
    this.input.keyboard?.removeAllKeys(true);

    // Stop all sounds to prevent audio overlap on scene transitions
    this.sound.stopAll();

    // Clean up timers
    if (this.survivalCountdown) this.survivalCountdown.destroy();
    if (this.spawnTimer) this.spawnTimer.destroy();
    if (this.keySpawnTimer) this.keySpawnTimer.destroy();
    if (this.bombSpawnTimer) this.bombSpawnTimer.destroy();
    if (this.enemyAttackTimer) this.enemyAttackTimer.destroy();
    // Clean up ad-hoc timers (ticket #195)
    for (const t of this.adHocTimers) t.destroy();
    this.adHocTimers.length = 0;

    // Unsubscribe from store
    if (this.storeUnsubscribe) this.storeUnsubscribe();

    // Drain object pools (ticket #184)
    this.enemies?.clear(true, true);
    this.keys?.clear(true, true);
    this.bombs?.clear(true, true);
    this.superProjectiles?.clear(true, true);
    this.lootDrops?.clear(true, true);

    // Kill bot before nulling references
    if (this.tresrBot && this.tresrBot.active) {
      this.tresrBot.kill();
    }

    // Null entity references to allow GC
    this.player = null as unknown as Player;
    this.boss = undefined;
    this.tresrBot = undefined;

    log.info(COMPONENT_NAME, "Cleanup complete");
  }

  /**
   * Sleep handler - properly pause all physics, timers, and updates
   * Called when scene is put to sleep (background) but not destroyed
   */
  sleep() {
    log.info(COMPONENT_NAME, "Scene sleeping...");

    // Pause physics world
    this.physics.world.pause();

    // Pause animations
    this.anims.pauseAll();

    // Pause scene time (pauses all timers created via this.time)
    this.time.paused = true;

    // Pause spawner timers explicitly
    if (this.survivalCountdown) this.survivalCountdown.paused = true;
    if (this.spawnTimer) this.spawnTimer.paused = true;
    if (this.keySpawnTimer) this.keySpawnTimer.paused = true;
    if (this.bombSpawnTimer) this.bombSpawnTimer.paused = true;
    if (this.enemyAttackTimer) this.enemyAttackTimer.paused = true;
  }

  /**
   * Wake handler - resume physics, timers, and updates
   * Called when scene wakes from sleep, respects user pause state
   */
  wake() {
    log.info(COMPONENT_NAME, "Scene waking...");

    // Check if the user has the game paused - don't resume if so
    const isPaused = gameState.get().isPaused;

    if (!isPaused) {
      // Resume physics world
      this.physics.world.resume();

      // Resume animations
      this.anims.resumeAll();

      // Resume scene time
      this.time.paused = false;

      // Resume spawner timers
      if (this.survivalCountdown) this.survivalCountdown.paused = false;
      if (this.spawnTimer) this.spawnTimer.paused = false;
      if (this.keySpawnTimer) this.keySpawnTimer.paused = false;
      if (this.bombSpawnTimer) this.bombSpawnTimer.paused = false;
      if (this.enemyAttackTimer) this.enemyAttackTimer.paused = false;
    }
  }

  private showPhaseAnnouncement(text: string) {
    const {width, height} = this.cameras.main;
    const ann = this.gameplayConfig.announcements;
    const overlay = this.add
      .text(width / 2, height / 2, text, {
        font: ann.font,
        color: ann.color,
        stroke: ann.stroke_color,
        strokeThickness: ann.stroke_thickness,
      })
      .setOrigin(0.5)
      .setDepth(1000)
      .setAlpha(0)
      .setScale(0.5);

    if (text === "DEFEAT" || text === "SYSTEM CRITICAL") {
      overlay.setColor("#ff0000");
    } else if (text === "BOSS PHASE") {
      overlay.setColor("#ffaa00");
    }

    this.tweens.add({
      targets: overlay,
      alpha: 1,
      scale: 1,
      duration: ann.enter_duration,
      ease: "Back.easeOut",
      onComplete: () => {
        this.adHocTimers.push(
          this.time.delayedCall(ann.display_duration, () => {
            this.tweens.add({
              targets: overlay,
              alpha: 0,
              scale: 1.5,
              duration: ann.exit_duration,
              onComplete: () => overlay.destroy(),
            });
          })
        );
      },
    });
  }

  private playSound(type: string) {
    const sfxVariants = this.gameplayConfig.audio.sfx_variants;
    const count = sfxVariants[type];
    if (!count || count <= 0) {
      log.warn(COMPONENT_NAME, `No SFX variants found for type: ${type}`);
      return;
    }
    const variant = this.rng.integerInRange(1, count);
    const key = `${type}_${variant}`;

    try {
      this.sound.play(key, {volume: gameState.get().music.sfxVolume});
    } catch {
      log.warn(COMPONENT_NAME, `Failed to play sound: ${key}`);
    }
  }

  // --- TresrBot sound event handlers ---

  private handleBotAttack() {
    this.playSound("bot_attack");
  }

  private handleBotSpecial() {
    this.playSound("bot_special");
  }

  private handleBotLand() {
    this.playSound("explosion");
  }

  private handleChestLand() {
    this.playSound("explosion");
  }

  /**
   * Create animations using SpriteManager (R-005: DRY animation creation)
   * Falls back to manual creation if config not available
   */
  private createAnimations() {
    // Try to get sprite config from registry (set by Preloader)
    const spritesConfig = this.registry.get("sprites_config");

    if (spritesConfig) {
      // Use config-driven animation creation
      this.spriteManager.createAnimations(spritesConfig);
    } else {
      // Fallback: SpriteManager will use defaults
      this.spriteManager.createAnimations();
    }
  }

  /**
   * Handle enemy & boss attacks via 2.5D distance checks on groundY.
   * Uses groundY (depth plane) instead of physics overlap so attacks connect
   * correctly across the walkable area band (R-004).
   */
  private handleEnemyAttacks() {
    if (!this.player || !this.player.active || this.player.hp <= 0) return;
    if (this.phase === "lost" || this.phase === "victory") return;

    const player = this.player;
    const now = this.time.now;
    const cooldownMs = this.gameplayConfig.combat.enemy_damage_cooldown_ms;
    const pkb = this.gameplayConfig.entities.player.knockback;

    // Check enemy attack damage — only when enemy is in attack animation
    // and within range on BOTH axes (horizontal + depth) separately.
    if (this.enemies) {
      const enemyAttackRange =
        this.gameplayConfig.entities.enemy.combat.attack_range;
      const enemyDamage = this.gameplayConfig.entities.enemy.damage;
      const depthThreshold =
        this.gameplayConfig.entities.enemy.combat.depth_threshold;

      this.enemies.getChildren().forEach((child) => {
        const enemy = child as Enemy;
        if (!enemy.active || enemy.hp <= 0) return;
        if (now - enemy.lastPlayerDamageTime < cooldownMs) return;

        // Only deal damage when enemy is playing attack animation
        const isAttacking =
          enemy.anims.isPlaying &&
          enemy.anims.currentAnim?.key.endsWith("_attack");
        if (!isAttacking) return;

        const hDist = Math.abs(player.x - enemy.x);
        const dDist = Math.abs(player.groundY - enemy.groundY);
        if (hDist < enemyAttackRange && dDist < depthThreshold) {
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
        this.gameplayConfig.entities.boss.combat.contact_depth_threshold;

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

  private updateTimerStatus() {
    gameActions.setTimer(this.survivalTimer);
  }

  /**
   * Handle dynamic canvas resize — recompute world bounds, walkable area,
   * and background cover-scale so the game fills any viewport.
   */
  private handleResize(gameSize: Phaser.Structs.Size) {
    const width = gameSize.width;
    const height = gameSize.height;

    // Update world and camera bounds
    this.physics.world.setBounds(0, 0, width, height);
    this.cameras.main.setBounds(0, 0, width, height);

    // Update walkable area pixel values from ratios
    if (this.walkableArea) {
      this.walkableArea.resize(width, height);
    }

    // Re-scale background to cover the new canvas
    if (this.background) {
      this.background.setPosition(width / 2, height / 2);
      const tex = this.textures
        .get(this.registry.get("selected_wallpaper") as string)
        .getSourceImage();
      const scaleX = width / tex.width;
      const scaleY = height / tex.height;
      this.background.setScale(Math.max(scaleX, scaleY));
    }
  }

  private spawnEnemy() {
    if (this.phase !== "survival" || !this.enemies || !this.player) return;

    // Spawn off-screen and walk in from left or right edge
    const groundY = this.walkableArea.getRandomGroundY(this.rng);
    const edge = this.rng.integerInRange(0, 1);
    const offscreen = this.gameplayConfig.combat.enemy_spawn_offscreen_px;
    const spawnX =
      edge === 0 ? -offscreen : this.cameras.main.width + offscreen;
    // Walk-in target: a random position inside the walkable area
    const walkInTargetX = this.rng.integerInRange(
      this.walkableArea.getLeftX() + 40,
      this.walkableArea.getRightX() - 40
    );

    // Select random enemy variant for visual variety (count comes from sprites config)
    const spritesConfig = this.registry.get("sprites_config") as SpritesConfig;
    const enemyCount = spritesConfig.enemies.count;
    const enemyVariant = this.rng.integerInRange(1, enemyCount);
    const textureKey = `enemy_${enemyVariant}`;
    const enemy = this.enemies.get(spawnX, groundY, textureKey) as Enemy;
    if (enemy) {
      enemy.spawn(spawnX, groundY, this.rng, walkInTargetX, textureKey);
      enemy.setTarget(this.player);
      const enemyScale = SpriteManager.getScaleFactor(
        spritesConfig,
        textureKey
      );
      enemy.setScale(enemyScale);
      this.scaleCircleBody(enemy, this.gameplayConfig.entities.enemy.hitbox);
    }
  }

  private spawnKey() {
    if (!this.keys) return;
    const {width, height} = this.cameras.main;
    const keySpawner = this.gameplayConfig.entities.key.spawner;
    const xMargin = keySpawner.x_margin;
    const yMarginTop = Math.round(keySpawner.y_margin_top_ratio * height);
    const yMarginBottom = Math.round(keySpawner.y_margin_bottom_ratio * height);

    const x = this.rng.integerInRange(xMargin, width - xMargin);
    const groundY = this.rng.integerInRange(yMarginTop, height - yMarginBottom);
    const key = this.keys.get(x, groundY) as Key;
    if (key) {
      const spritesConfig = this.registry.get(
        "sprites_config"
      ) as SpritesConfig;
      key.spawn(x, groundY);
      key.setScale(SpriteManager.getScaleFactor(spritesConfig, "key"));
    }
  }

  private spawnBomb() {
    if (this.phase !== "survival" || !this.bombs) return;
    const {width, height} = this.cameras.main;
    const bombSpawner = this.gameplayConfig.entities.bomb.spawner;
    const xMargin = bombSpawner.x_margin;
    const yMarginTop = Math.round(bombSpawner.y_margin_top_ratio * height);
    const yMarginBottom = Math.round(
      bombSpawner.y_margin_bottom_ratio * height
    );
    const startZ = bombSpawner.start_z;

    const x = this.rng.integerInRange(xMargin, width - xMargin);
    const groundY = this.rng.integerInRange(yMarginTop, height - yMarginBottom);
    const bomb = this.bombs.get(x, groundY) as Bomb;
    if (bomb) {
      const spritesConfig = this.registry.get(
        "sprites_config"
      ) as SpritesConfig;
      bomb.spawn(x, groundY, startZ);
      const bombScale = SpriteManager.getScaleFactor(spritesConfig, "bomb");
      bomb.setScale(bombScale);
      this.scaleRectBody(bomb, this.gameplayConfig.entities.bomb.hitbox);
    }
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
    if (this.enemies) {
      this.enemies.getChildren().forEach((enemy) => {
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
    const gpFx = this.gameplayConfig.entities.boss.ground_pound_effects;
    this.cameras.main.shake(gpFx.shake_duration, gpFx.shake_intensity);

    // Expanding ring VFX
    const ring = this.add.circle(
      data.x,
      data.y,
      gpFx.ring_initial_radius,
      0xff4400,
      0.6
    );
    ring.setDepth(1000);
    this.tweens.add({
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
    if (!this.enemies || !this.player) return;

    const spritesConfig = this.registry.get("sprites_config") as SpritesConfig;
    const enemyCount = spritesConfig.enemies.count;
    const {width} = this.cameras.main;

    const summonOffscreen = this.gameplayConfig.combat.enemy_spawn_offscreen_px;
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
      const textureKey = `enemy_${enemyVariant}`;
      const enemy = this.enemies.get(spawnX, groundY, textureKey) as Enemy;
      if (enemy) {
        enemy.spawn(spawnX, groundY, this.rng, walkInTargetX, textureKey);
        enemy.setTarget(this.player);
        const enemyScale = SpriteManager.getScaleFactor(
          spritesConfig,
          textureKey
        );
        enemy.setScale(enemyScale);
        this.scaleCircleBody(enemy, this.gameplayConfig.entities.enemy.hitbox);
      }
    }
  }

  private collectKey(
    _player:
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile
      | Phaser.Types.Physics.Arcade.GameObjectWithBody,
    keyObj:
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
  ) {
    const k = keyObj as Key;
    if (k.active) {
      k.kill();
      this.collectedKeys++;
      this.score += this.gameplayConfig.scoring.key_collection;
      this.playSound("key_collect");
      log.info(COMPONENT_NAME, `Key Collected! Total: ${this.collectedKeys}`);
    }
  }

  /**
   * Collect a loot drop on overlap (ticket #192)
   */
  private collectLoot(
    _player:
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile
      | Phaser.Types.Physics.Arcade.GameObjectWithBody,
    lootObj:
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
  ) {
    const loot = lootObj as LootDrop;
    if (!loot.active) return;

    if (loot.lootType === "health" && this.player) {
      const newHp = Math.min(
        this.player.hp + loot.healAmount,
        this.player.maxHp
      );
      this.player.hp = newHp;
      gameActions.setHp(newHp);
      this.playSound("key_collect");
    }
    // Power-ups: spawn or refresh TresrBot companion
    if (loot.lootType === "powerup") {
      this.playSound("powerup_collect");
      // Hero voice line after a short delay (calling down the bot)
      this.time.delayedCall(300, () => {
        this.playSound("bot_spawn");
      });
      this.spawnTresrBot();
    }

    loot.kill();
  }

  /**
   * Spawn loot at enemy death position based on drop table (ticket #192)
   */
  private spawnLoot(x: number, y: number) {
    if (!this.lootDrops) return;
    const lootConfig = this.gameplayConfig.entities.enemy.loot;

    // Roll for health drop (seeded RNG for replay determinism — ticket #194)
    if (this.rng.frac() < lootConfig.health.drop_chance) {
      const variant = this.rng.integerInRange(1, lootConfig.health.variants);
      const drop = this.lootDrops.get(x, y) as LootDrop | null;
      if (drop) {
        drop.spawn(x, y, "health", `health_${variant}`);
        return; // Only one drop per enemy
      }
    }

    // Roll for power-up drop (seeded RNG for replay determinism — ticket #194)
    // Cap at max_drops_per_game to prevent infinite bot refreshes
    const maxPowerups =
      this.gameplayConfig.entities.tresr_bot.max_drops_per_game;
    if (
      this.powerupDropCount < maxPowerups &&
      this.rng.frac() < lootConfig.powerup.drop_chance
    ) {
      const variant = this.rng.integerInRange(1, lootConfig.powerup.variants);
      const drop = this.lootDrops.get(x, y) as LootDrop | null;
      if (drop) {
        drop.spawn(x, y, "powerup", `powerup_${variant}`);
        this.powerupDropCount++;
      }
    }
  }

  /**
   * Spawn or refresh the TresrBot AI companion.
   * Called when the player collects a powerup loot drop.
   */
  private spawnTresrBot() {
    if (!this.tresrBot || !this.player) return;

    // If already active, refresh lifetime instead of spawning a new one
    if (this.tresrBot.active) {
      this.tresrBot.refreshLifetime();
      this.recorder.log("bot_refresh");
      return;
    }

    // Spawn near the player
    const spawnX = this.player.x + (this.player.flipX ? 60 : -60);
    const spawnGY = this.player.groundY;
    this.tresrBot.spawn(spawnX, spawnGY, this.player);

    // Pass boss reference if we're in boss phase
    if (this.boss) {
      this.tresrBot.setBoss(this.boss);
    }

    this.recorder.log("bot_spawn");
    // bot_spawn sound plays on landing via "bot_land" event
  }

  /**
   * Handle player attack - damage enemies, boss, and open chest (R-004: Attack handling)
   */
  private handlePlayerAttack(player: Player) {
    const playerConfig = this.gameplayConfig.entities.player;
    const scoring = this.gameplayConfig.scoring;
    const playerScale = player.scaleX;
    const reach = playerConfig.combat.reach * playerScale;
    const attackRange = playerConfig.combat.attack_range;
    const playerDamage = playerConfig.damage;

    const attackX = player.flipX ? player.x - reach : player.x + reach;
    const attackY = player.groundY;

    let hit = false;

    // Check enemy hits (use groundY for 2.5D depth-plane distance, not visual y)
    if (this.enemies) {
      this.enemies.getChildren().forEach((enemy) => {
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
            const ekb = this.gameplayConfig.entities.enemy.knockback;
            e.applyKnockback(player.x, ekb.force, ekb.stun_ms);
            if (e.hp <= 0) {
              this.score += scoring.enemy_kill;
            }
            hit = true;
          }
        }
      });
    }

    // Check boss hit (use groundY for 2.5D depth-plane distance)
    if (this.boss && this.boss.active && this.boss.hp > 0) {
      const bossRange =
        this.gameplayConfig.entities.boss.combat.attack_range +
        this.gameplayConfig.combat.boss_melee_range_bonus;
      const dist = Phaser.Math.Distance.Between(
        attackX,
        attackY,
        this.boss.x,
        this.boss.groundY
      );
      if (dist < bossRange) {
        this.boss.takeDamage(playerDamage);
        const bkb = this.gameplayConfig.entities.boss.knockback;
        this.boss.applyKnockback(player.x, bkb.force, bkb.stun_ms);
        this.score += scoring.boss_hit;
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
    const anim = this.anims.exists("hero_super")
      ? this.anims.get("hero_super")
      : null;
    if (anim && anim.frames && anim.frames.length > 0) {
      try {
        player.play("hero_super", true);
        let superRetries = 0;
        const maxSuperRetries = 3;
        const onAnimComplete = () => {
          if (
            !player.active ||
            this.phase === "lost" ||
            this.phase === "victory"
          ) {
            return;
          }
          if (player.anims.currentAnim?.key === "hero_super") {
            this.fireProjectile(player);
          } else if (superRetries < maxSuperRetries) {
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
    const superConfig = this.gameplayConfig.entities.player.super;
    const superEffects = superConfig.effects;

    log.info(COMPONENT_NAME, "SUPER ATTACK - Projectile fired!");

    // Camera shake on release
    this.cameras.main.shake(
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
      if (this.enemies) {
        projectile.setCollisionTargets(this.enemies, this.boss);
      }
      // Offset Y upward to torso height (origin is at feet with setOrigin(0.5, 1.0))
      const torsoY = player.y - player.displayHeight * 0.6;
      projectile.fire(player.x, torsoY, player.groundY, direction);
      const spritesConfig = this.registry.get(
        "sprites_config"
      ) as SpritesConfig;
      projectile.setScale(SpriteManager.getScaleFactor(spritesConfig, "super"));
    }
  }

  /**
   * Handle super projectile piercing through an enemy — fire VFX + scoring
   */
  private handleSuperPierce(data: {x: number; y: number; killed: boolean}) {
    const scoring = this.gameplayConfig.scoring;

    // Score: full kill points if enemy died, hit points if survived
    if (data.killed) {
      this.score += scoring.enemy_kill;
    } else {
      this.score += scoring.super_hit;
    }

    // Fire burst VFX at pierce point
    const burst = this.add.circle(data.x, data.y, 6, 0xff6600, 0.9);
    burst.setDepth(1000);
    this.tweens.add({
      targets: burst,
      radius: 24,
      alpha: 0,
      duration: 200,
      onComplete: () => burst.destroy(),
    });

    // Inner white-hot core
    const core = this.add.circle(data.x, data.y, 3, 0xffcc00, 1);
    core.setDepth(1001);
    this.tweens.add({
      targets: core,
      radius: 10,
      alpha: 0,
      duration: 150,
      onComplete: () => core.destroy(),
    });

    this.playSound("punch");
    gameActions.setScore(this.score);
  }

  /**
   * Handle super projectile boss impact — explosion VFX + scoring
   */
  private handleSuperProjectileHit(data: {
    x: number;
    y: number;
    groundY: number;
  }) {
    const scoring = this.gameplayConfig.scoring;
    const superEffects = this.gameplayConfig.entities.player.super.effects;

    this.score += scoring.boss_hit;

    // Visual explosion at impact point
    this.triggerFlash();

    // Expanding ring VFX at impact
    const initialRadius = superEffects.explosion_initial_radius;
    const expandDuration = superEffects.explosion_expand_duration;
    const ring = this.add.circle(data.x, data.y, initialRadius, 0xffff00, 0.5);
    ring.setDepth(1000);
    this.tweens.add({
      targets: ring,
      radius: 80,
      alpha: 0,
      duration: expandDuration,
      onComplete: () => ring.destroy(),
    });

    log.info(COMPONENT_NAME, "Super projectile hit boss!");
  }

  private onEntityDeath(data: {type: string; x: number; y: number}) {
    if (data.type.startsWith("enemy")) {
      this.playSound("death");
      gameActions.incrementEnemiesKilled();
      this.spawnLoot(data.x, data.y);

      // Don't replenish super charge from kills caused by the super attack itself
      if (this.superDamageActive) return;

      // Accumulate super charge on enemy kill
      const config = this.registry.get("full_config");
      const playerSuper = config.gameplay.entities.player.super;
      const chargePerKill = playerSuper.charge_per_kill;
      const maxCharge = playerSuper.max_charge;
      gameActions.addSuperCharge(chargePerKill, maxCharge);
    } else if (data.type === "boss") {
      trackBossDefeated();
      this.playSound("explosion");
      MusicManager.getInstance().stop();

      // Fire explosion VFX — 3-layer expanding circles
      const deathFx = this.gameplayConfig.entities.boss.death_effects;

      // Layer 1: White-hot core
      const core = this.add.circle(data.x, data.y, 15, 0xffffff, 1);
      core.setDepth(1002);
      this.tweens.add({
        targets: core,
        radius: 40,
        alpha: 0,
        duration: 200,
        onComplete: () => core.destroy(),
      });

      // Layer 2: Orange inner fire
      const inner = this.add.circle(data.x, data.y, 20, 0xff6600, 0.9);
      inner.setDepth(1001);
      this.tweens.add({
        targets: inner,
        radius: 80,
        alpha: 0,
        duration: 300,
        onComplete: () => inner.destroy(),
      });

      // Layer 3: Red-orange outer ring
      const outer = this.add.circle(data.x, data.y, 30, 0xff4400, 0.7);
      outer.setDepth(1000);
      this.tweens.add({
        targets: outer,
        radius: 150,
        alpha: 0,
        duration: 500,
        onComplete: () => outer.destroy(),
      });

      // Camera shake + fire-tinted flash
      this.cameras.main.shake(deathFx.shake_duration, deathFx.shake_intensity);
      this.cameras.main.flash(
        deathFx.flash_duration,
        deathFx.flash_r,
        deathFx.flash_g,
        deathFx.flash_b
      );
    }
  }

  private triggerImpact() {
    const playerConfig = this.gameplayConfig.entities.player;
    this.cameras.main.shake(
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
    this.physics.world.pause();
    this.hitStopTimer = this.time.delayedCall(hitStopMs, () => {
      this.hitStopActive = false;
      this.hitStopTimer = undefined;
      this.physics.world.resume();
    });
    this.adHocTimers.push(this.hitStopTimer);
  }

  private triggerFlash() {
    const flashDuration =
      this.gameplayConfig.entities.player.effects.victory_flash_duration;
    this.cameras.main.flash(flashDuration, 255, 255, 255);
  }

  private onSurvivalComplete() {
    if (this.phase !== "survival") return; // Guard
    log.info(
      COMPONENT_NAME,
      "Bear Market complete. Bull Market (Boss) incoming..."
    );
    this.phase = "boss";
    gameActions.setPhase("boss");
    if (this.survivalCountdown) this.survivalCountdown.remove();
    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.keySpawnTimer) this.keySpawnTimer.remove();
    if (this.bombSpawnTimer) this.bombSpawnTimer.remove();
    if (this.enemyAttackTimer) this.enemyAttackTimer.remove();
    // Deactivate all enemies and bombs for pooling instead of destroying them
    // Using kill() keeps them in the pool for potential future use
    if (this.enemies) {
      this.enemies.getChildren().forEach((child) => {
        const enemy = child as Enemy;
        if (enemy.active) enemy.kill();
      });
    }
    if (this.bombs) {
      this.bombs.getChildren().forEach((child) => {
        const bomb = child as Bomb;
        if (bomb.active) bomb.kill();
      });
    }

    const {width} = this.cameras.main;
    this.boss = new Boss(this, width / 2, this.rng);
    const spritesConfig = this.registry.get("sprites_config") as SpritesConfig;
    this.boss.setScale(SpriteManager.getScaleFactor(spritesConfig, "boss"));
    this.boss.play("boss_idle", true);
    if (this.player) this.boss.setTarget(this.player);
    if (this.tresrBot) this.tresrBot.setBoss(this.boss);

    // Track boss HP in store for HUD display
    gameActions.setBossHp(this.boss.hp, this.boss.maxHp);

    // Re-add attack timer for boss contact damage checks
    const enemyAttackCheckMs =
      this.gameplayConfig.entities.enemy.combat.attack_check_ms;
    this.enemyAttackTimer = this.time.addEvent({
      delay: enemyAttackCheckMs,
      callback: this.handleEnemyAttacks,
      callbackScope: this,
      loop: true,
    });

    this.triggerFlash();
    this.playSound("explosion"); // Arrival sound
    this.showPhaseAnnouncement("BOSS PHASE");
    trackBossSpawned();
  }

  /**
   * Spawn the treasure chest after boss defeat (R-004: Chest handling)
   * Chest must be opened via player attack, not overlap
   */
  private spawnChest() {
    if (this.chest) return; // Prevent double spawn
    trackLevelComplete(this.score, this.collectedKeys);

    // Kill all remaining enemies when boss is defeated
    if (this.enemies) {
      this.enemies.getChildren().forEach((child) => {
        const enemy = child as Enemy;
        if (enemy.active) enemy.kill();
      });
    }

    const chestConfig = this.gameplayConfig.entities.chest;

    // Delayed air drop for dramatic effect after boss explosion
    this.time.delayedCall(chestConfig.air_drop.delay_after_boss_ms, () => {
      log.info(COMPONENT_NAME, "Air dropping Treasure Chest...");
      const {width} = this.cameras.main;
      // Spawn chest in center of walkable area
      const chestGroundY =
        (this.walkableArea.getTopY() + this.walkableArea.getBottomY()) / 2;
      this.chest = new Chest(this, width / 2, chestGroundY, true);
      const spritesConfig = this.registry.get(
        "sprites_config"
      ) as SpritesConfig;
      this.chest.setScale(SpriteManager.getScaleFactor(spritesConfig, "chest"));
    });

    // R-004: Chest is opened via attack, not overlap
    // The handlePlayerAttack method now checks for chest proximity
  }

  /**
   * Attempt to open chest via player attack (R-004: Chest opens via punch)
   * Returns true if chest was opened
   */
  private tryOpenChest(attackX: number, attackY: number): boolean {
    if (!this.chest || !this.chest.active) return false;

    const dist = Phaser.Math.Distance.Between(
      attackX,
      attackY,
      this.chest.x,
      this.chest.groundY
    );

    const chestRange = this.gameplayConfig.entities.chest.combat.interact_range;
    if (dist < chestRange) {
      if (this.chest.open()) {
        this.playSound("open_treasure_chest");
        return true;
      }
    }
    return false;
  }

  private async onVictory() {
    if (this.phase === "victory" || this.phase === "lost") return;
    this.phase = "victory";
    gameActions.setPhase("victory");
    log.info(COMPONENT_NAME, "VICTORY! Authorizing settlement...");

    // Kill bot on game end
    if (this.tresrBot && this.tresrBot.active) {
      this.tresrBot.kill();
      this.recorder.log("bot_despawn");
    }

    this.playSound("victory");
    this.showPhaseAnnouncement("VICTORY");
    const winDuration = Math.round(
      this.gameplayConfig.time_limit_seconds - this.survivalTimer
    );
    trackGameWin(this.score, {
      keysCollected: this.collectedKeys,
      duration: winDuration,
    });

    const auth = getAuthState();
    if (auth.isGuest) {
      incrementGuestSession();
      log.info(COMPONENT_NAME, "Guest victory - skipping wallet verification.");
      return;
    }

    // Refuse claim if config was tampered with
    if (this.configTampered || this.configHash === "") {
      log.error(
        COMPONENT_NAME,
        "Config integrity check failed — claim refused."
      );
      // Record offense on user's profile (escalating ban)
      if (auth.isAuthenticated && auth.user) {
        recordOffense(auth.user.key, "config_hash_mismatch", this.sessionId);
      }
      return;
    }

    log.info(COMPONENT_NAME, "TRIGGERING DUMMY WALLET VERIFICATION...");

    try {
      // Build length-prefixed binary payload (ticket #164):
      // [4 bytes input length][inputs][configHash][4 bytes seed length][seed]
      const inputs = this.recorder.serialize();
      const hashBytes = new TextEncoder().encode(this.configHash);
      const seedBytes = new TextEncoder().encode(this.seed.toString());
      const payload = new Uint8Array(
        4 + inputs.length + hashBytes.length + 4 + seedBytes.length
      );
      let offset = 0;
      new DataView(payload.buffer).setUint32(offset, inputs.length);
      offset += 4;
      payload.set(inputs, offset);
      offset += inputs.length;
      payload.set(hashBytes, offset);
      offset += hashBytes.length;
      new DataView(payload.buffer).setUint32(offset, seedBytes.length);
      offset += 4;
      payload.set(seedBytes, offset);

      // Juno: direct #[update] call to Rust claim_authorize() —
      //   validates replay, checks ban status, calculates reward, returns (amount, signature).
      //   On cheat detection: calls apply_ban() and saves ban to "users" collection.
      const result = await claimAuthorize(
        this.sessionId,
        BigInt(this.score),
        this.userAddr,
        payload
      );

      if ("Ok" in result) {
        log.info(COMPONENT_NAME, "Claim authorized successfully!");
        // Dispatch claim auth data to the UI via CustomEvent.
        // SECURITY NOTE (ticket #157): CustomEvents can be spoofed from DevTools.
        // This is an accepted client-side weakness — the smart contract validates
        // the oracle signature on-chain, so spoofed data is rejected at settlement.
        document.dispatchEvent(
          new CustomEvent("tresr:claim-auth", {detail: result.Ok})
        );

        // Update stats for win
        // Juno: getDoc + setDoc on "users" collection →
        //   Rust assert: assert_user_profile() — validates EVM wallet format + signature
        //   Rust hook:   on_set_doc("users") → no-op
        const auth = getAuthState();
        if (auth.isAuthenticated && auth.user) {
          const profileDoc = await getUserProfile(auth.user.key);
          if (profileDoc) {
            const profile = profileDoc.data;
            profile.stats.totalGamesPlayed =
              (profile.stats.totalGamesPlayed || 0n) + 1n;
            profile.stats.totalGamesWon =
              (profile.stats.totalGamesWon || 0n) + 1n;
            if (BigInt(this.score) > profile.stats.highScore) {
              profile.stats.highScore = BigInt(this.score);
            }
            await saveUserProfile(auth.user.key, profile, profileDoc.version);
            log.info(COMPONENT_NAME, "Win stats saved to Juno.");
          }
        }

        // Save game session for leaderboard active score tracking
        if (this.sessionId && !this.sessionId.startsWith("guest-")) {
          try {
            await setDoc({
              collection: "game_sessions",
              doc: {
                key: this.sessionId,
                data: {
                  startedAt:
                    Date.now() -
                    (this.gameplayConfig.time_limit_seconds -
                      this.survivalTimer) *
                      1000,
                  endedAt: Date.now(),
                  keysCollected: this.collectedKeys,
                  bossDefeated: true,
                  score: this.score,
                  rewardClaimed: false,
                },
              },
            });
            log.info(
              COMPONENT_NAME,
              "Game session saved for active score tracking."
            );
          } catch (err) {
            log.error(COMPONENT_NAME, "Failed to save game session:", err);
          }
        }
      } else {
        log.error(COMPONENT_NAME, "Claim authorization failed:", result.Err);
      }
    } catch {
      log.error(COMPONENT_NAME, "Failed to authorize claim");
    }
  }

  private async onPlayerDeath() {
    if (this.phase === "lost" || this.phase === "victory") return;
    this.phase = "lost";
    gameActions.setPhase("lost");
    log.info(COMPONENT_NAME, "PLAYER DIED. System Critical.");

    // Kill bot on game end
    if (this.tresrBot && this.tresrBot.active) {
      this.tresrBot.kill();
      this.recorder.log("bot_despawn");
    }

    this.playSound("game_over");
    MusicManager.getInstance().stop();
    this.showPhaseAnnouncement("DEFEAT");
    const deathDuration = Math.round(
      this.gameplayConfig.time_limit_seconds - this.survivalTimer
    );
    trackPlayerDeath(this.score, this.phase, this.collectedKeys);
    trackGameLoss("player_died", {
      score: this.score,
      phase: this.phase,
      keysCollected: this.collectedKeys,
      duration: deathDuration,
    });

    // Increment guest session counter after game completes
    const auth = getAuthState();
    if (auth.isGuest) {
      incrementGuestSession();
    }

    // Save stats
    // Juno: getDoc + setDoc on "users" collection →
    //   Rust assert: assert_user_profile() — validates EVM wallet format + signature
    //   Rust hook:   on_set_doc("users") → no-op
    if (auth.isAuthenticated && auth.user) {
      try {
        const profileDoc = await getUserProfile(auth.user.key);
        if (profileDoc) {
          const profile = profileDoc.data;
          profile.stats.totalGamesPlayed =
            (profile.stats.totalGamesPlayed || 0n) + 1n;
          profile.stats.totalGamesLost =
            (profile.stats.totalGamesLost || 0n) + 1n;
          if (BigInt(this.score) > profile.stats.highScore) {
            profile.stats.highScore = BigInt(this.score);
          }
          await saveUserProfile(auth.user.key, profile, profileDoc.version);
          log.info(COMPONENT_NAME, "High score saved to Juno.");
        }

        // Save game session for leaderboard active score tracking
        if (this.sessionId && !this.sessionId.startsWith("guest-")) {
          try {
            await setDoc({
              collection: "game_sessions",
              doc: {
                key: this.sessionId,
                data: {
                  startedAt:
                    Date.now() -
                    (this.gameplayConfig.time_limit_seconds -
                      this.survivalTimer) *
                      1000,
                  endedAt: Date.now(),
                  keysCollected: this.collectedKeys,
                  bossDefeated: false,
                  score: this.score,
                  rewardClaimed: false,
                },
              },
            });
            log.info(
              COMPONENT_NAME,
              "Game session saved for active score tracking."
            );
          } catch (err) {
            log.error(COMPONENT_NAME, "Failed to save game session:", err);
          }
        }
      } catch {
        log.error(COMPONENT_NAME, "Failed to save high score");
      }
    }
  }

  update() {
    if (this.configTampered) return;

    // Handle Pause via ESC
    if (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey)) {
      gameActions.togglePause();
    }

    if (gameState.get().isPaused) return;

    if (this.background && this.player) {
      const {width, height} = this.cameras.main;
      // Subtle parallax drift — background shifts slightly opposite to player movement
      this.background.x = width / 2 - this.player.x * 0.02;
      this.background.y = height / 2 - this.player.y * 0.02;
    }

    if (this.player && this.player.active) {
      this.player.update();
      if (this.player.hp !== this.lastReportedHp) {
        gameActions.setHp(this.player.hp);
        this.lastReportedHp = this.player.hp;
      }
    }
    if (this.boss) {
      this.boss.update();
      if (this.boss.hp !== this.lastReportedBossHp) {
        gameActions.setBossHp(this.boss.hp);
        this.lastReportedBossHp = this.boss.hp;
      }
    }
    if (this.tresrBot && this.tresrBot.active) {
      this.tresrBot.update(this.time.now);
    }
    if (this.chest?.active) {
      this.chest.update();
    }

    // Clear super damage flag once all projectiles have despawned (handles misses)
    if (this.superDamageActive && this.superProjectiles) {
      const hasActive = this.superProjectiles
        .getChildren()
        .some((p) => p.active);
      if (!hasActive) this.superDamageActive = false;
    }

    // Manually update keys and bombs for Z-axis falling physics.
    // These run here (in scene update, after Arcade physics step) rather than
    // via runChildUpdate (which runs in preUpdate, before physics step).
    // This matches Player/Boss update timing and prevents Arcade body.postUpdate
    // from overwriting the Z-axis adjusted positions.
    if (this.keys) {
      this.keys.getChildren().forEach((child) => {
        if (child.active) (child as Key).update();
      });
    }
    if (this.bombs) {
      this.bombs.getChildren().forEach((child) => {
        if (child.active) (child as Bomb).update();
      });
    }

    // Only update store when values actually change (ticket #162)
    if (this.score !== this.lastReportedScore) {
      gameActions.setScore(this.score);
      this.lastReportedScore = this.score;
    }
    if (this.collectedKeys !== this.lastReportedKeys) {
      gameActions.setKeys(this.collectedKeys);
      this.lastReportedKeys = this.collectedKeys;
    }
  }
}
