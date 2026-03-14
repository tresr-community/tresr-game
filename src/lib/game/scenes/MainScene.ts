import Phaser from "phaser";
import {SCENE_KEYS} from "@/lib/game/constants";
import {Player} from "@/lib/game/prefabs/Player";
import {Enemy} from "@/lib/game/prefabs/Enemy";
import {Key} from "@/lib/game/prefabs/Key";
import {Boss} from "@/lib/game/prefabs/Boss";
import {Chest} from "@/lib/game/prefabs/Chest";
import {Bomb} from "@/lib/game/prefabs/Bomb";
import {LootDrop} from "@/lib/game/prefabs/LootDrop";
import {TresrBot} from "@/lib/game/prefabs/TresrBot";
import {gameActions, gameState} from "@/lib/game/state";
import {Recorder} from "@/lib/game/Recorder";
import {SpriteManager, type SpritesConfig} from "@/lib/game/SpriteManager";
import {Preloader} from "@/lib/game/scenes/Preloader";
import {config as clientConfig} from "@/lib/config/client";
import {setDoc} from "@junobuild/core";
import {claimAuthorize} from "@/declarations/satellite/satellite.api";
import {enqueueProfileWrite} from "@/lib/user";
import {getAuthState} from "@/lib/auth";
import {
  trackGameLoss,
  trackGameWin,
  trackBossSpawned,
  trackPlayerDeath,
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
import {SpawnManager} from "@/lib/game/managers/SpawnManager";
import {CombatManager} from "@/lib/game/managers/CombatManager";
import {UIManager} from "@/lib/game/managers/UIManager";
import {scaleCircleBody} from "@/lib/game/utils/physics";

// Helper type for gameplay config (entity-centric schema)
export interface GameplayConfig {
  time_limit_seconds: number;
  difficulty_escalation: {
    enabled: boolean;
    interval_seconds: number;
    enemy_spawn_multiplier: number;
    bomb_spawn_multiplier: number;
    min_enemy_spawn_ms: number;
    min_bomb_spawn_ms: number;
  };
  physics: {
    fps: number;
    gravity: number;
    timestep: number;
    game_speed: number;
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
  claim_retries: {
    max_attempts: number;
    base_delay_ms: number;
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
      spawner: {
        pool_size: number;
        delay_ms: number;
        buffer_distance: number;
        director: {
          burst_chance: number;
          burst_count_min: number;
          burst_count_max: number;
          burst_delay_ms: number;
          breather_chance: number;
          breather_duration_ms: number;
          limo_chance: number;
          limo_count: number;
        };
      };
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
      terminal_vz: number;
      drag: number;
      wind_frequency: number;
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
    sfx_volume_overrides: Record<string, number>;
  };
}

const COMPONENT_NAME = "MainScene";

export class MainScene extends Phaser.Scene {
  private player?: Player;
  private boss?: Boss;
  private chest?: Chest;
  private tresrBot?: TresrBot;
  private recorder: Recorder = new Recorder();
  private spriteManager: SpriteManager;
  private spawnManager!: SpawnManager;
  private combatManager!: CombatManager;
  private uiManager!: UIManager;
  private gameplayConfig!: GameplayConfig;
  private designHeight: number = 720;
  private walkableArea!: WalkableArea;

  private survivalTimer: number = 300;
  private survivalCountdown?: Phaser.Time.TimerEvent;
  private background?: Phaser.GameObjects.Image;

  public collectedKeys: number = 0;
  public score: number = 0;
  public phase: "survival" | "boss" | "victory" | "lost" = "survival";
  public sessionId: string = "";
  public userAddr: string = "";
  public configHash: string = "";
  private configTampered: boolean = false;
  private configVerification: Promise<boolean> | null = null;

  private escKey?: Phaser.Input.Keyboard.Key;

  // Ad-hoc timer tracking for cleanup on shutdown (ticket #195)
  private adHocTimers: Phaser.Time.TimerEvent[] = [];

  // Store unsubscribe function for cleanup
  private storeUnsubscribe?: () => void;

  // Seeded RNG for reproducible gameplay
  private rng!: Phaser.Math.RandomDataGenerator;
  private seed: number = 0;

  constructor() {
    super(SCENE_KEYS.MAIN);
    this.spriteManager = new SpriteManager(this);
  }

  init(data: {sessionId?: string; userAddr?: string; seed?: number}) {
    // Use fee-gate session ID passed from Preloader; guests get a non-claimable placeholder (ticket #244)
    this.sessionId = data.sessionId || `guest-${Date.now()}`;
    this.userAddr =
      data.userAddr || "0x0000000000000000000000000000000000000000";

    // Initialize seeded RNG for reproducible gameplay
    this.seed = data.seed || Date.now();
    this.rng = new Phaser.Math.RandomDataGenerator([this.seed.toString()]);
    // Physics FPS is set in create() after gameplayConfig is loaded from registry

    this.recorder.reset();
    this.configTampered = false;
    TouchInput.getInstance().reset();
    gameActions.setPaused(false);

    // Subscribe to Pause state synchronously (before async work)
    this.storeUnsubscribe = gameState.subscribe((state) => {
      this.setPause(state.isPaused);
    });

    // Start config hash verification — resolves before the 3s countdown
    // finishes but after Phaser calls create() (since Phaser doesn't await
    // async init). The .then() sets configTampered as soon as the sub-ms
    // SHA-256 digest completes; startGameplay() re-checks before spawners.
    this.configVerification = this.verifyConfigHash();
    this.configVerification.then((hashValid) => {
      if (!hashValid) {
        this.configTampered = true;
        gameActions.setConfigTampered();
        log.error(
          COMPONENT_NAME,
          "Config integrity check failed. Gameplay disabled."
        );
        document.dispatchEvent(new CustomEvent("tresr:config-tampered"));
      }
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
      fee_gate: gameplay.fee_gate,
      difficulty_escalation: gameplay.difficulty_escalation,
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
      this.combatManager.cancelHitStop();
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
    this.designHeight = fullConfig.display?.design_height ?? 720;

    // Fixed physics step for determinism
    this.physics.world.setFPS(this.gameplayConfig.physics.fps || 60);

    // Apply game_speed as a true global speed multiplier.
    // Phaser's world.timeScale DIVIDES the physics delta, so 1/speed = faster.
    // This scales all Arcade velocities (setVelocityX/Y) uniformly.
    const gameSpeed = this.gameplayConfig.physics.game_speed;
    if (gameSpeed !== 1) {
      this.physics.world.timeScale = 1 / gameSpeed;
      this.anims.globalTimeScale = gameSpeed; // Speed up animations proportionally
    }

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

    // Load deferred SFX (OOM fix: not loaded during Preloader)
    // Non-blocking — queues load while countdown plays
    this.loadDeferredSfx();

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

    // Initialize SpawnManager (owns enemy/key/bomb/loot groups and spawn timers)
    this.spawnManager = new SpawnManager(
      this,
      this.gameplayConfig,
      this.rng,
      this.walkableArea,
      this.spriteManager,
      this.designHeight,
      () => this.phase
    );
    this.spawnManager.createGroups();

    // Combat manager (handles attacks, damage, VFX, super projectiles)
    this.combatManager = new CombatManager(
      this,
      this.gameplayConfig,
      this.spawnManager,
      this.spriteManager,
      this.rng,
      this.walkableArea,
      this.designHeight,
      () => this.phase,
      (points: number) => {
        this.score += points;
      },
      (key: string) => this.playSound(key),
      (timer: Phaser.Time.TimerEvent) => this.adHocTimers.push(timer)
    );
    this.combatManager.createGroups();

    // UI manager (announcements, countdown, HUD sync)
    this.uiManager = new UIManager(
      this,
      this.gameplayConfig,
      (timer: Phaser.Time.TimerEvent) => this.adHocTimers.push(timer)
    );

    // Instantiate Player at spawn position from config ratios
    this.player = new Player(
      this,
      Math.round(entities.player.spawn.x_ratio * width),
      Math.round(entities.player.spawn.y_ratio * height)
    );
    const spritesConfig = this.registry.get("sprites_config") as SpritesConfig;
    const heroScale = SpriteManager.getScaleFactor(
      spritesConfig,
      "hero",
      height,
      this.designHeight
    );
    this.player.setScale(heroScale);
    scaleCircleBody(this.player, entities.player.hitbox);
    this.player.play("hero_idle", true);
    this.player.setRecorder(this.recorder);
    this.spawnManager.setPlayer(this.player);
    this.spawnManager.setRecorder(this.recorder);
    this.combatManager.setPlayer(this.player);

    // Instantiate TresrBot (starts inactive, spawned on powerup collection)
    this.tresrBot = new TresrBot(this, 0, 0);
    this.physics.add.existing(this.tresrBot);
    const botScale = SpriteManager.getScaleFactor(
      spritesConfig,
      "tresr_bot",
      height,
      this.designHeight
    );
    this.tresrBot.setScale(botScale);
    scaleCircleBody(this.tresrBot, entities.tresr_bot.hitbox);
    this.spawnManager.setTresrBot(this.tresrBot);
    this.combatManager.setTresrBot(this.tresrBot);

    // Initialize lives from config (ticket #191)
    gameActions.setLives(entities.player.lives);

    // Collisions
    this.physics.add.overlap(
      this.player,
      this.spawnManager.keys!,
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
      this.spawnManager.lootDrops!,
      this.collectLoot,
      undefined,
      this
    );

    // Event Listeners
    this.events.on("boss_defeated", this.spawnChest, this);
    this.events.on("game_win", this.onVictory, this);
    this.events.on("player_death", this.onPlayerDeath, this);
    this.events.on("bot_attack", this.handleBotAttack, this);
    this.events.on("bot_special", this.handleBotSpecial, this);
    this.events.on("bot_land", this.handleBotLand, this);
    this.events.on("chest_land", this.handleChestLand, this);
    // Combat events (managed by CombatManager)
    this.combatManager.registerEvents();

    // Fade in from black (cinematic transition from Preloader)
    this.cameras.main.fadeIn(1000, 0, 0, 0);

    // 3-2-1 countdown before gameplay starts
    this.uiManager.showCountdown(() => {
      this.startGameplay();
    });
  }

  private startGameplay() {
    // Re-check config tampering before starting spawners (#92)
    if (this.configTampered) {
      log.error(COMPONENT_NAME, "Config tampered — gameplay start aborted.");
      return;
    }

    // Signal music to start now that gameplay has begun
    window.dispatchEvent(new Event("tresr:gameplay-start"));

    // Survival Clock
    this.survivalCountdown = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (this.phase !== "survival") return;
        if (this.survivalTimer > 0) {
          this.survivalTimer--;
          this.uiManager.updateTimerStatus(this.survivalTimer);
          this.spawnManager.checkDifficultyEscalation(this.survivalTimer);

          // At 5 seconds remaining: enemies flee, stop spawning new ones
          if (this.survivalTimer === 5) {
            this.spawnManager.removeEnemySpawnTimer();
            this.spawnManager.fleeAllEnemies();
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

    // Spawners (managed by SpawnManager)
    this.spawnManager.setupTimers();

    // Enemy attack timer (R-004: enemies deal damage on contact)
    this.combatManager.setupEnemyAttackTimer();
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
    this.events.off("player_death", this.onPlayerDeath, this);
    this.events.off("bot_attack", this.handleBotAttack, this);
    this.events.off("bot_special", this.handleBotSpecial, this);
    this.events.off("bot_land", this.handleBotLand, this);
    this.events.off("chest_land", this.handleChestLand, this);
    this.combatManager.unregisterEvents();

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

    // Clean up timers (optional chaining for idempotent shutdown)
    this.survivalCountdown?.destroy();
    // Clean up ad-hoc timers (ticket #195)
    for (const t of this.adHocTimers) t.destroy();
    this.adHocTimers.length = 0;

    // Unsubscribe from store
    if (this.storeUnsubscribe) this.storeUnsubscribe();

    // Drain spawn-related pools and timers
    this.spawnManager.shutdown();
    this.combatManager.shutdown();
    this.uiManager.shutdown();
    this.spriteManager.shutdown();

    // Kill bot before nulling references
    if (this.tresrBot && this.tresrBot.active) {
      this.tresrBot.kill();
    }

    // Null entity references to allow GC
    this.player = null as unknown as Player;
    this.boss = undefined;
    this.tresrBot = undefined;

    // Clean up textures to prevent GPU memory accumulation across sessions (OOM fix)
    // Remove wallpaper texture
    const wallpaperKey = this.registry.get("selected_wallpaper") as string;
    if (wallpaperKey && this.textures.exists(wallpaperKey)) {
      this.textures.remove(wallpaperKey);
    }

    // Remove entity textures (hero, boss, super, tresr_bot, items, lazy-loaded enemies)
    const spritesConfig = this.registry.get("sprites_config") as
      | SpritesConfig
      | undefined;
    if (spritesConfig) {
      const removeEntityTextures = (
        entityKey: string,
        config: {anims: {name: string}[]}
      ) => {
        for (const anim of config.anims) {
          const texKey = `${entityKey}_${anim.name}`;
          if (this.textures.exists(texKey)) this.textures.remove(texKey);
        }
      };

      if (spritesConfig.hero) removeEntityTextures("hero", spritesConfig.hero);
      if (spritesConfig.boss) removeEntityTextures("boss", spritesConfig.boss);
      if (spritesConfig.super)
        removeEntityTextures("super", spritesConfig.super);
      if (spritesConfig.tresr_bot)
        removeEntityTextures("tresr_bot", spritesConfig.tresr_bot);

      // Enemy variants that were lazy-loaded
      if (spritesConfig.enemies) {
        for (let i = 1; i <= spritesConfig.enemies.count; i++) {
          removeEntityTextures(`enemy_${i}`, spritesConfig.enemies);
        }
      }

      // Items
      if (spritesConfig.items) {
        for (const [key, itemConfig] of Object.entries(spritesConfig.items)) {
          removeEntityTextures(key, itemConfig);
        }
      }
    }

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
    this.spawnManager.pauseTimers();
    this.combatManager.pauseTimers();
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
      this.spawnManager.resumeTimers();
      this.combatManager.resumeTimers();
    }
  }

  /**
   * Load deferred SFX that were skipped during Preloader (OOM fix).
   * These are contextual sounds (victory, game_over, bot, chest) that
   * won't trigger for minutes into a session. Loading during the countdown
   * gives them plenty of time to load before they're needed.
   */
  private loadDeferredSfx() {
    const allSfx = clientConfig.assets.sfx as string[];
    const deferredPrefixes = Preloader.DEFERRED_SFX_TYPES;
    let queued = 0;

    for (const sfx of allSfx) {
      const isDeferred = deferredPrefixes.some((prefix) =>
        sfx.startsWith(prefix)
      );
      if (isDeferred) {
        this.load.audio(sfx, `/assets/audio/sfx/${sfx}.webm`);
        queued++;
      }
    }

    if (queued > 0) {
      // Log deferred SFX load failures instead of silent failure
      this.load.on("loaderror", (file: Phaser.Loader.File) => {
        log.warn(
          COMPONENT_NAME,
          `Failed to load deferred SFX: ${file.key} (${file.url})`
        );
      });
      this.load.start();
      log.info(COMPONENT_NAME, `Queued ${queued} deferred SFX for loading`);
    }
  }

  private playSound(type: string) {
    // Drop SFX when tab is hidden — Chrome suspends the AudioContext but game
    // logic keeps firing (throttled). Without this guard the queued sounds all
    // flush at once on refocus, producing a loud burst (ticket #sfx-burst).
    if (document.hidden) return;

    // Skip SFX if the AudioContext is suspended (e.g. mobile Safari before gesture)
    const ctx = (this.sound as Phaser.Sound.WebAudioSoundManager).context;
    if (ctx?.state === "suspended") {
      log.debug(COMPONENT_NAME, "AudioContext suspended, SFX skipped");
      return;
    }

    const sfxVariants = this.gameplayConfig.audio.sfx_variants;
    const count = sfxVariants[type];
    if (!count || count <= 0) {
      log.warn(COMPONENT_NAME, `No SFX variants found for type: ${type}`);
      return;
    }
    const variant = this.rng.integerInRange(1, count);
    const key = `${type}_${variant}`;

    // Resolve per-type volume multiplier — throws if the type is missing from
    // config so we catch config drift early during testing (no silent defaults).
    const overrides = this.gameplayConfig.audio.sfx_volume_overrides;
    const multiplier = overrides[type];
    if (multiplier === undefined) {
      throw new Error(
        `[MainScene] sfx_volume_overrides is missing entry for SFX type "${type}". Add it to tresr.yaml audio.sfx_volume_overrides.`
      );
    }

    try {
      // Guard: deferred SFX may not be loaded yet (OOM fix)
      if (!this.cache.audio.exists(key)) return;
      this.sound.play(key, {
        volume: gameState.get().music.sfxVolume * multiplier,
      });
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

    // Re-scale all entity sprites for new canvas size
    const spritesConfig = this.registry.get("sprites_config") as SpritesConfig;
    if (spritesConfig) {
      if (this.player) {
        this.player.setScale(
          SpriteManager.getScaleFactor(
            spritesConfig,
            "hero",
            height,
            this.designHeight
          )
        );
      }
      if (this.boss?.active) {
        this.boss.setScale(
          SpriteManager.getScaleFactor(
            spritesConfig,
            "boss",
            height,
            this.designHeight
          )
        );
      }
      if (this.tresrBot) {
        this.tresrBot.setScale(
          SpriteManager.getScaleFactor(
            spritesConfig,
            "tresr_bot",
            height,
            this.designHeight
          )
        );
      }
      if (this.chest?.active) {
        this.chest.setScale(
          SpriteManager.getScaleFactor(
            spritesConfig,
            "chest",
            height,
            this.designHeight
          )
        );
      }
      if (this.spawnManager.enemies) {
        const enemyScale = SpriteManager.getScaleFactor(
          spritesConfig,
          "enemy",
          height,
          this.designHeight
        );
        for (const child of this.spawnManager.enemies.getChildren()) {
          const enemy = child as Enemy;
          if (enemy.active) enemy.setScale(enemyScale);
        }
      }
      if (this.spawnManager.keys) {
        const keyScale = SpriteManager.getScaleFactor(
          spritesConfig,
          "key",
          height,
          this.designHeight
        );
        for (const child of this.spawnManager.keys.getChildren()) {
          if ((child as Phaser.GameObjects.Sprite).active) {
            (child as Phaser.GameObjects.Sprite).setScale(keyScale);
          }
        }
      }
      if (this.spawnManager.bombs) {
        const bombScale = SpriteManager.getScaleFactor(
          spritesConfig,
          "bomb",
          height,
          this.designHeight
        );
        for (const child of this.spawnManager.bombs.getChildren()) {
          if ((child as Phaser.GameObjects.Sprite).active) {
            (child as Phaser.GameObjects.Sprite).setScale(bombScale);
          }
        }
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
      this.adHocTimers.push(
        this.time.delayedCall(300, () => {
          this.playSound("bot_spawn");
        })
      );
      this.spawnManager.spawnTresrBot();
    }

    loot.kill();
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
    this.spawnManager.removeSurvivalSpawnTimers();
    // Keep bombSpawnTimer running — spec requires bombs during boss phase
    this.combatManager.removeEnemyAttackTimer();
    // Deactivate all enemies and bombs for pooling instead of destroying them
    // Using kill() keeps them in the pool for potential future use
    this.spawnManager.killAllEnemies();
    this.spawnManager.killAllBombs();

    const {width} = this.cameras.main;
    this.boss = new Boss(this, width / 2, this.rng);
    const spritesConfig = this.registry.get("sprites_config") as SpritesConfig;
    this.boss.setScale(
      SpriteManager.getScaleFactor(
        spritesConfig,
        "boss",
        this.cameras.main.height,
        this.designHeight
      )
    );
    this.boss.play("boss_idle", true);
    if (this.player) this.boss.setTarget(this.player);
    if (this.tresrBot) this.tresrBot.setBoss(this.boss);
    this.spawnManager.setBoss(this.boss);
    this.combatManager.setBoss(this.boss);

    // Track boss HP in store for HUD display
    gameActions.setBossHp(this.boss.hp, this.boss.maxHp);

    // Re-add attack timer for boss contact damage checks
    this.combatManager.setupEnemyAttackTimer();

    this.combatManager.triggerFlash();
    this.playSound("explosion"); // Arrival sound
    this.uiManager.showPhaseAnnouncement("BULL MARKET");
    trackBossSpawned();
  }

  /**
   * Spawn the treasure chest after boss defeat (R-004: Chest handling)
   * Delegates to SpawnManager; chest reference set via callback.
   */
  private spawnChest() {
    const timer = this.spawnManager.spawnChest(
      this.chest,
      this.score,
      this.collectedKeys,
      (chest) => {
        this.chest = chest;
        this.combatManager.setChest(chest);
      }
    );
    if (timer) this.adHocTimers.push(timer);
  }

  private async onVictory() {
    if (this.phase === "victory" || this.phase === "lost") return;
    this.phase = "victory";
    gameActions.setPhase("victory");
    log.info(COMPONENT_NAME, "VICTORY! Authorizing settlement...");

    // Freeze the simulation on victory — same as death, prevents stray
    // bomb/contact damage or timer callbacks from firing during claim flow.
    this.physics.world.pause();
    this.anims.pauseAll();
    this.time.paused = true;
    this.spawnManager.pauseTimers();
    this.combatManager.pauseTimers();

    // Kill bot on game end
    if (this.tresrBot && this.tresrBot.active) {
      this.tresrBot.kill();
      this.recorder.log("bot_despawn");
    }

    this.playSound("victory");
    this.uiManager.showPhaseAnnouncement("VICTORY");

    // Fire global confetti event
    document.dispatchEvent(
      new CustomEvent("tresr:confetti", {
        detail: {
          count: 200,
          colors: ["#facc15", "#f59e0b", "#fbbf24", "#34d399", "#60a5fa"],
        },
      })
    );
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

        // Update stats for win — uses centralized write queue
        const auth = getAuthState();
        if (auth.isAuthenticated && auth.user) {
          try {
            const score = BigInt(this.score);
            await enqueueProfileWrite(auth.user.key, (profile) => ({
              ...profile,
              stats: {
                ...profile.stats,
                total_games_played:
                  BigInt(profile.stats.total_games_played ?? 0) + 1n,
                total_games_won:
                  BigInt(profile.stats.total_games_won ?? 0) + 1n,
                high_score:
                  score > BigInt(profile.stats.high_score ?? 0)
                    ? score
                    : BigInt(profile.stats.high_score ?? 0),
              },
            }));
            log.info(COMPONENT_NAME, "Win stats saved to Juno.");
          } catch (err) {
            log.error(COMPONENT_NAME, "Failed to save win stats:", err);
          }
        }

        // Save game session for leaderboard active score tracking
        await this.saveGameSession(true);
      } else {
        log.error(COMPONENT_NAME, "Claim authorization failed:", result.Err);
      }
    } catch {
      log.error(COMPONENT_NAME, "Failed to authorize claim");
    }
  }

  /**
   * Save a game session document to trigger the satellite's on_game_session_update
   * hook, which writes to the leaderboard. Retries on version conflict.
   */
  private async saveGameSession(bossDefeated: boolean) {
    const claimRetries = this.gameplayConfig.claim_retries;
    const MAX_ATTEMPTS = claimRetries?.max_attempts || 3;
    const BASE_DELAY_MS = claimRetries?.base_delay_ms || 100;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        await setDoc({
          collection: "audit",
          doc: {
            key: `session_${this.sessionId}`,
            data: {
              started_at:
                Date.now() -
                (this.gameplayConfig.time_limit_seconds - this.survivalTimer) *
                  1000,
              ended_at: Date.now(),
              keys_collected: this.collectedKeys,
              boss_defeated: bossDefeated,
              score: this.score,
              reward_claimed: false,
            },
          },
        });
        log.info(
          COMPONENT_NAME,
          "Game session saved for active score tracking."
        );
        return;
      } catch (err) {
        const isVersionConflict =
          err instanceof Error &&
          err.message.includes("version_outdated_or_future");

        if (isVersionConflict && attempt < MAX_ATTEMPTS - 1) {
          const backoff = BASE_DELAY_MS * Math.pow(2, attempt);
          log.warn(
            COMPONENT_NAME,
            `Game session version conflict (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying in ${backoff}ms...`
          );
          await new Promise((r) => setTimeout(r, backoff));

          // If the scene or its systems were destroyed during the timeout (e.g., user navigated away), abort safely.
          if (!this.sys || !this.scene || !this.scene.manager) {
            log.warn(
              COMPONENT_NAME,
              "Scene destroyed during delay, aborting saveGameSession retry."
            );
            return;
          }

          continue;
        }
        log.error(COMPONENT_NAME, "Failed to save game session:", err);
      }
    }
  }

  private async onPlayerDeath() {
    if (this.phase === "lost" || this.phase === "victory") return;
    const deathPhase = this.phase;
    this.phase = "lost";
    gameActions.setPhase("lost");
    log.info(COMPONENT_NAME, "PLAYER DIED. System Critical.");

    // Freeze the simulation — stop all spawning, physics, and timers so
    // bombs/enemies/boss stop processing. The scene stays alive (no black
    // screen) so the death overlay renders over the frozen game world.
    this.physics.world.pause();
    this.anims.pauseAll();
    this.time.paused = true;
    if (this.survivalCountdown) this.survivalCountdown.paused = true;
    this.spawnManager.pauseTimers();
    this.combatManager.pauseTimers();

    // Kill bot on game end
    if (this.tresrBot && this.tresrBot.active) {
      this.tresrBot.kill();
      this.recorder.log("bot_despawn");
    }

    this.playSound("game_over");
    void MusicManager.getInstance().stop();
    this.uiManager.showPhaseAnnouncement("DEFEAT");
    const deathDuration = Math.round(
      this.gameplayConfig.time_limit_seconds - this.survivalTimer
    );
    trackPlayerDeath(this.score, deathPhase, this.collectedKeys);
    trackGameLoss("player_died", {
      score: this.score,
      phase: deathPhase,
      keysCollected: this.collectedKeys,
      duration: deathDuration,
    });

    // Increment guest session counter after game completes
    const auth = getAuthState();
    if (auth.isGuest) {
      incrementGuestSession();
    }

    // Save stats — uses centralized write queue
    if (auth.isAuthenticated && auth.user) {
      try {
        const score = BigInt(this.score);
        await enqueueProfileWrite(auth.user.key, (profile) => ({
          ...profile,
          stats: {
            ...profile.stats,
            total_games_played:
              BigInt(profile.stats.total_games_played ?? 0) + 1n,
            total_games_lost: BigInt(profile.stats.total_games_lost ?? 0) + 1n,
            high_score:
              score > BigInt(profile.stats.high_score ?? 0)
                ? score
                : BigInt(profile.stats.high_score ?? 0),
          },
        }));
        log.info(COMPONENT_NAME, "Loss stats saved to Juno.");
      } catch (err) {
        log.error(COMPONENT_NAME, "Failed to save loss stats:", err);
      }

      // Save game session for leaderboard active score tracking
      await this.saveGameSession(false);
    }
  }

  update(time: number, delta: number) {
    if (this.configTampered) return;

    // Game over — simulation is frozen, nothing to update
    if (this.phase === "lost" || this.phase === "victory") return;

    // Handle Pause via ESC
    if (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey)) {
      gameActions.togglePause();
    }

    if (gameState.get().isPaused) return;

    // Compute frame-rate independent delta time (seconds), scaled by game_speed.
    // Phaser gives `delta` in milliseconds; clamp to avoid spiral-of-death on tab-switch.
    // game_speed is ALSO applied to Arcade via physics.world.timeScale (set in init),
    // but the raw `delta` here is NOT scaled by world.timeScale, so we must apply
    // game_speed to keep Z-axis physics (jumps, gravity, depth movement) in sync
    // with Arcade horizontal movement.
    const gameSpeed = this.gameplayConfig.physics.game_speed;
    const dt = Math.min(delta / 1000, 0.05) * gameSpeed;

    // Resolution-independent speed scaling.
    // With Phaser.Scale.RESIZE the canvas matches the viewport, so absolute
    // px/s speeds cover different screen fractions on different devices.
    // Multiplying all velocities by canvasHeight/designHeight keeps movement
    // proportional regardless of resolution (same ratio used for sprite scaling).
    const resScale = this.cameras.main.height / this.designHeight;
    this.registry.set("resolution_scale", resScale);

    if (this.background && this.player) {
      const {width, height} = this.cameras.main;
      // Subtle parallax drift — background shifts slightly opposite to player movement
      this.background.x = width / 2 - this.player.x * 0.02;
      this.background.y = height / 2 - this.player.y * 0.02;
    }

    if (this.player && this.player.active) {
      this.player.update(dt);
    }
    if (this.boss) {
      this.boss.update(dt);
    }
    if (this.tresrBot && this.tresrBot.active) {
      this.tresrBot.update(time, dt);
    }
    if (this.chest?.active) {
      this.chest.update(dt);
    }

    // Cache group children once per frame to avoid repeated getChildren() allocations
    const enemyChildren = this.spawnManager.enemies?.getChildren();
    const keyChildren = this.spawnManager.keys?.getChildren();
    const bombChildren = this.spawnManager.bombs?.getChildren();

    // Manually update enemies, keys, and bombs after the Arcade physics step.
    // This ensures all entities receive the same game_speed-scaled dt and
    // prevents Arcade body.postUpdate from overwriting Z-axis / X-axis
    // adjusted positions (which caused enemy teleporting flicker).
    if (enemyChildren) {
      for (let i = 0; i < enemyChildren.length; i++) {
        const child = enemyChildren[i];
        if (child.active) (child as Enemy).update(dt);
      }
    }
    if (keyChildren) {
      for (let i = 0; i < keyChildren.length; i++) {
        const child = keyChildren[i];
        if (child.active) (child as Key).update(dt);
      }
    }
    if (bombChildren) {
      for (let i = 0; i < bombChildren.length; i++) {
        const child = bombChildren[i];
        if (child.active) (child as Bomb).update(dt);
      }
    }

    // Update super projectiles + clear super damage flag (managed by CombatManager)
    this.combatManager.updateProjectiles(dt);

    // Sync HUD state (score, keys, HP, boss HP) with change detection (ticket #162, #200)
    this.uiManager.syncState(
      this.score,
      this.collectedKeys,
      this.player?.hp,
      this.boss?.hp
    );
  }
}
