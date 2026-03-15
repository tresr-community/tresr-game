import Phaser from "phaser";
import {Enemy} from "@/lib/game/prefabs/Enemy";
import {Key} from "@/lib/game/prefabs/Key";
import {Bomb} from "@/lib/game/prefabs/Bomb";
import {LootDrop} from "@/lib/game/prefabs/LootDrop";
import {Chest} from "@/lib/game/prefabs/Chest";
import type {TresrBot} from "@/lib/game/prefabs/TresrBot";
import {SpriteManager, type SpritesConfig} from "@/lib/game/SpriteManager";
import type {WalkableArea} from "@/lib/game/WalkableArea";
import type {Recorder} from "@/lib/game/Recorder";
import type {Player} from "@/lib/game/prefabs/Player";
import type {Boss} from "@/lib/game/prefabs/Boss";
import type {GameplayConfig} from "@/lib/game/scenes/MainScene";
import {log} from "@/lib/utils/log";
import {trackLevelComplete} from "@/lib/metrics/analytics";
import {scaleCircleBody, scaleRectBody} from "@/lib/game/utils/physics";

const COMPONENT_NAME = "SpawnManager";

export class SpawnManager {
  // Owned physics groups
  enemies?: Phaser.Physics.Arcade.Group;
  keys?: Phaser.Physics.Arcade.Group;
  bombs?: Phaser.Physics.Arcade.Group;
  lootDrops?: Phaser.Physics.Arcade.Group;

  // Spawn timers
  private spawnTimer?: Phaser.Time.TimerEvent;
  private keySpawnTimer?: Phaser.Time.TimerEvent;
  private bombSpawnTimer?: Phaser.Time.TimerEvent;

  // State
  private powerupDropCount: number = 0;
  private escalationStep: number = 0;
  private currentEnemySpawnMs: number = 0;
  private currentBombSpawnMs: number = 0;

  // Director state
  private directorMode: "normal" | "burst" | "breather" | "limo" = "normal";
  private burstRemaining: number = 0;
  private limoRemaining: number = 0;

  // Dynamic entity references (set by MainScene as they become available)
  private player?: Player;
  private boss?: Boss;
  private tresrBot?: TresrBot;
  private recorder?: Recorder;

  constructor(
    private scene: Phaser.Scene,
    private config: GameplayConfig,
    private rng: Phaser.Math.RandomDataGenerator,
    private walkableArea: WalkableArea,
    private spriteManager: SpriteManager,
    private designHeight: number,
    private getPhase: () => "survival" | "boss" | "victory" | "lost"
  ) {}

  setPlayer(player: Player) {
    this.player = player;
  }

  setBoss(boss: Boss) {
    this.boss = boss;
  }

  setTresrBot(bot: TresrBot) {
    this.tresrBot = bot;
  }

  setRecorder(recorder: Recorder) {
    this.recorder = recorder;
  }

  createGroups() {
    const entities = this.config.entities;
    // Cap max pool sizes based on mobile performance tier
    const multiplier = this.scene.registry.get("effects_multiplier") ?? 1.0;

    // Bombs group (falling bombs that explode on impact)
    // Note: runChildUpdate disabled - we manually call update() in scene update()
    // to ensure Z-axis physics runs after the Arcade physics step (same phase as Player)
    // enable: false prevents createCallbackHandler from re-enabling bodies after construction
    // allowGravity: false prevents Arcade gravity from fighting with our Z-axis system
    this.bombs = this.scene.physics.add.group({
      classType: Bomb,
      maxSize: Math.max(
        1,
        Math.floor(entities.bomb.spawner.pool_size * multiplier)
      ),
      runChildUpdate: false,
      enable: false,
      allowGravity: false,
    });

    // Setup Groups
    this.enemies = this.scene.physics.add.group({
      classType: Enemy,
      defaultKey: "enemy_1_idle",
      maxSize: Math.max(
        5,
        Math.floor(entities.enemy.spawner.pool_size * multiplier)
      ),
      runChildUpdate: false,
    });
    // Store in registry so swarm AI can find nearby allies
    this.scene.registry.set("enemy_group", this.enemies);

    // Note: Keys/bombs use runChildUpdate: false and are manually updated in scene update()
    // to ensure Z-axis physics runs after the Arcade physics step.
    // allowGravity: false prevents Arcade gravity from fighting with our Z-axis system
    // immovable: true prevents Arcade from applying velocity to the body
    // Body stays enabled for overlap detection (key collection during fall)
    this.keys = this.scene.physics.add.group({
      classType: Key,
      maxSize: Math.max(
        2,
        Math.floor(entities.key.spawner.pool_size * multiplier)
      ),
      runChildUpdate: false,
      allowGravity: false,
      immovable: true,
    });

    // Loot drop pool (ticket #192)
    this.lootDrops = this.scene.physics.add.group({
      classType: LootDrop,
      maxSize: Math.max(
        2,
        Math.floor(entities.enemy.loot.pool_size * multiplier)
      ),
      runChildUpdate: false,
      allowGravity: false,
    });
  }

  setupTimers() {
    const entities = this.config.entities;

    // Track current spawn delays for difficulty escalation
    this.currentEnemySpawnMs = entities.enemy.spawner.delay_ms;
    this.currentBombSpawnMs = entities.bomb.spawner.delay_ms;
    this.escalationStep = 0;

    this.directorMode = "normal";
    this.burstRemaining = 0;
    this.limoRemaining = 0;

    // Spawners
    // Instead of a strict loop, kick off the first dynamic tick
    this.scheduleNextEnemySpawn(this.currentEnemySpawnMs);

    // Key Spawner
    this.keySpawnTimer = this.scene.time.addEvent({
      delay: entities.key.spawner.delay_ms,
      callback: this.spawnKey,
      callbackScope: this,
      loop: true,
    });
    // Bomb spawner
    this.bombSpawnTimer = this.scene.time.addEvent({
      delay: this.currentBombSpawnMs,
      callback: this.spawnBomb,
      callbackScope: this,
      loop: true,
    });
  }

  private scheduleNextEnemySpawn(delayMs: number) {
    if (this.spawnTimer) this.spawnTimer.remove();
    this.spawnTimer = this.scene.time.delayedCall(delayMs, () =>
      this.executeSpawnTick()
    );
  }

  private executeSpawnTick() {
    if (this.getPhase() !== "survival" || !this.enemies || !this.player) return;

    const spawnerConfig = this.config.entities.enemy.spawner;
    const directorConfig = spawnerConfig.director;
    let nextDelay = this.currentEnemySpawnMs;

    switch (this.directorMode) {
      case "normal": {
        // Evaluate mode transitions before spawning
        const roll = this.rng.frac();
        if (roll < directorConfig.limo_chance) {
          this.directorMode = "limo";
          this.limoRemaining = directorConfig.limo_count;
          log.info(COMPONENT_NAME, "Director Mode: LIMO! 🏦");
          this.scheduleNextEnemySpawn(0); // Tick immediately
          return;
        } else if (
          roll <
          directorConfig.limo_chance + directorConfig.burst_chance
        ) {
          this.directorMode = "burst";
          this.burstRemaining = this.rng.integerInRange(
            directorConfig.burst_count_min,
            directorConfig.burst_count_max
          );
          log.info(
            COMPONENT_NAME,
            `Director Mode: BURST! 💥 (${this.burstRemaining})`
          );
          this.scheduleNextEnemySpawn(0); // Tick immediately
          return;
        } else if (
          roll <
          directorConfig.limo_chance +
            directorConfig.burst_chance +
            directorConfig.breather_chance
        ) {
          this.directorMode = "breather";
          log.info(COMPONENT_NAME, "Director Mode: BREATHER 😮‍💨");
          this.scheduleNextEnemySpawn(directorConfig.breather_duration_ms);
          return; // Don't spawn this tick
        }

        // Just a normal spawn
        this.spawnEnemy(false);
        break;
      }
      case "burst": {
        this.spawnEnemy(false);
        this.burstRemaining--;
        if (this.burstRemaining <= 0) {
          this.directorMode = "normal";
        } else {
          nextDelay = directorConfig.burst_delay_ms;
        }
        break;
      }
      case "limo": {
        this.spawnEnemy(true);
        this.limoRemaining--;
        if (this.limoRemaining <= 0) {
          this.directorMode = "normal";
        } else {
          // Limo spawns walk out practically on top of each other
          nextDelay = 200;
        }
        break;
      }
      case "breather": {
        // Breather finished, back to normal!
        this.directorMode = "normal";
        this.spawnEnemy(false); // First guy back
        break;
      }
    }

    this.scheduleNextEnemySpawn(nextDelay);
  }

  spawnEnemy(forcePassive: boolean = false) {
    if (this.getPhase() !== "survival" || !this.enemies || !this.player) return;

    // Spawn off-screen and walk in from left or right edge
    const groundY = this.walkableArea.getRandomGroundY(this.rng);
    const edge = this.rng.integerInRange(0, 1);
    const offscreen = this.config.combat.enemy_spawn_offscreen_px;
    const spawnX =
      edge === 0 ? -offscreen : this.scene.cameras.main.width + offscreen;
    // Walk-in target: a random position inside the walkable area
    const walkInTargetX = this.rng.integerInRange(
      this.walkableArea.getLeftX() + 40,
      this.walkableArea.getRightX() - 40
    );

    // Select random enemy variant for visual variety (count comes from sprites config)
    const spritesConfig = this.scene.registry.get(
      "sprites_config"
    ) as SpritesConfig;
    const enemyCount = spritesConfig.enemies.count;
    const enemyVariant = forcePassive
      ? this.rng.integerInRange(1, enemyCount)
      : this.rng.integerInRange(1, enemyCount);
    const textureKey = `enemy_${enemyVariant}_idle`;

    // Lazy-load enemy variant sprites on first spawn
    this.spriteManager.ensureEnemyLoaded(enemyVariant).then(() => {
      if (!this.enemies || !this.player) return;
      const enemy = this.enemies.get(spawnX, groundY, textureKey) as Enemy;
      if (enemy) {
        // Hide immediately — group.get() makes the sprite visible at its old
        // pool position. spawn() will reveal it after setup is complete.
        enemy.setVisible(false);
        // We override AI weights logic via explicit passing or let the prefab handle it if unforced.
        const forcedAiOverride = forcePassive ? "passive" : undefined;
        enemy.spawn(
          spawnX,
          groundY,
          this.rng,
          walkInTargetX,
          textureKey,
          forcedAiOverride
        );
        // Set target AFTER spawn() so it is never cleared by the pool-reset inside spawn().
        // spawn() does not clear _target anymore — see Enemy.ts — but this ordering
        // is kept explicit so the intent is clear.
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

  spawnKey() {
    if (!this.keys) return;
    const {width, height} = this.scene.cameras.main;
    const keySpawner = this.config.entities.key.spawner;
    const xMargin = keySpawner.x_margin;
    const yMarginTop = Math.round(keySpawner.y_margin_top_ratio * height);
    const yMarginBottom = Math.round(keySpawner.y_margin_bottom_ratio * height);

    const x = this.rng.integerInRange(xMargin, width - xMargin);
    const groundY = this.rng.integerInRange(yMarginTop, height - yMarginBottom);
    const key = this.keys.get(x, groundY) as Key;
    if (key) {
      const spritesConfig = this.scene.registry.get(
        "sprites_config"
      ) as SpritesConfig;
      key.spawn(x, groundY);
      key.setScale(
        SpriteManager.getScaleFactor(
          spritesConfig,
          "key",
          height,
          this.designHeight
        )
      );
    }
  }

  spawnBomb() {
    const phase = this.getPhase();
    if ((phase !== "survival" && phase !== "boss") || !this.bombs) return;
    const {width, height} = this.scene.cameras.main;
    const bombSpawner = this.config.entities.bomb.spawner;
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
      const spritesConfig = this.scene.registry.get(
        "sprites_config"
      ) as SpritesConfig;
      bomb.spawn(x, groundY, startZ);
      const bombScale = SpriteManager.getScaleFactor(
        spritesConfig,
        "bomb",
        height,
        this.designHeight
      );
      bomb.setScale(bombScale);
      scaleRectBody(bomb, this.config.entities.bomb.hitbox);
    }
  }

  /**
   * Spawn loot at enemy death position based on drop table (ticket #192)
   */
  spawnLoot(x: number, y: number) {
    if (!this.lootDrops) return;
    const lootConfig = this.config.entities.enemy.loot;

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
    const maxPowerups = this.config.entities.tresr_bot.max_drops_per_game;
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
  spawnTresrBot() {
    if (!this.tresrBot || !this.player) return;

    // If already active, refresh lifetime instead of spawning a new one
    if (this.tresrBot.active) {
      this.tresrBot.refreshLifetime();
      this.recorder?.log("bot_refresh");
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

    this.recorder?.log("bot_spawn");
    // bot_spawn sound plays on landing via "bot_land" event
  }

  /**
   * Spawn the treasure chest after boss defeat (R-004: Chest handling)
   * Returns the timer event for ad-hoc cleanup tracking, or null if already spawned.
   * Calls onChestCreated with the new Chest once the delayed air-drop fires.
   */
  spawnChest(
    currentChest: Chest | undefined,
    score: number,
    collectedKeys: number,
    onChestCreated: (chest: Chest) => void
  ): Phaser.Time.TimerEvent | null {
    if (currentChest) return null; // Prevent double spawn
    trackLevelComplete(score, collectedKeys);

    // Kill all remaining enemies when boss is defeated
    this.killAllEnemies();

    const chestConfig = this.config.entities.chest;

    // Delayed air drop for dramatic effect after boss explosion
    const timer = this.scene.time.delayedCall(
      chestConfig.air_drop.delay_after_boss_ms,
      () => {
        log.info(COMPONENT_NAME, "Air dropping Treasure Chest...");
        const {width} = this.scene.cameras.main;
        // Spawn chest in center of walkable area
        const chestGroundY =
          (this.walkableArea.getTopY() + this.walkableArea.getBottomY()) / 2;
        const chest = new Chest(this.scene, width / 2, chestGroundY, true);
        const spritesConfig = this.scene.registry.get(
          "sprites_config"
        ) as SpritesConfig;
        chest.setScale(
          SpriteManager.getScaleFactor(
            spritesConfig,
            "chest",
            this.scene.cameras.main.height,
            this.designHeight
          )
        );
        onChestCreated(chest);
      }
    );

    // R-004: Chest is opened via attack, not overlap
    // The handlePlayerAttack method now checks for chest proximity
    return timer;
  }

  /** Make all active enemies flee (used at 5-second countdown) */
  fleeAllEnemies() {
    if (!this.enemies) return;
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Enemy;
      if (enemy.active) enemy.flee();
    });
  }

  /** Kill all active enemies (used at boss phase transition and chest spawn) */
  killAllEnemies() {
    if (!this.enemies) return;
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Enemy;
      if (enemy.active) enemy.kill();
    });
  }

  /** Kill all active bombs (used at boss phase transition) */
  killAllBombs() {
    if (!this.bombs) return;
    this.bombs.getChildren().forEach((child) => {
      const bomb = child as Bomb;
      if (bomb.active) bomb.kill();
    });
  }

  /** Remove the enemy spawn timer (used at 5s countdown) */
  removeEnemySpawnTimer() {
    if (this.spawnTimer) this.spawnTimer.remove();
  }

  /** Remove enemy and key spawn timers (boss phase transition). Bombs keep running. */
  removeSurvivalSpawnTimers() {
    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.keySpawnTimer) this.keySpawnTimer.remove();
  }

  pauseTimers() {
    if (this.spawnTimer) this.spawnTimer.paused = true;
    if (this.keySpawnTimer) this.keySpawnTimer.paused = true;
    if (this.bombSpawnTimer) this.bombSpawnTimer.paused = true;
  }

  resumeTimers() {
    if (this.spawnTimer) this.spawnTimer.paused = false;
    if (this.keySpawnTimer) this.keySpawnTimer.paused = false;
    if (this.bombSpawnTimer) this.bombSpawnTimer.paused = false;
  }

  /**
   * Check and apply difficulty escalation based on elapsed survival time.
   * Reduces enemy and bomb spawn delays at configured intervals.
   */
  checkDifficultyEscalation(survivalTimer: number) {
    const esc = this.config.difficulty_escalation;
    if (!esc.enabled) return;

    const elapsed = this.config.time_limit_seconds - survivalTimer;
    const expectedStep = Math.floor(elapsed / esc.interval_seconds);
    if (expectedStep <= this.escalationStep) return;

    this.escalationStep = expectedStep;

    // Update the baseline delay. The director loop will pick it up on the next "normal" tick.
    this.currentEnemySpawnMs = Math.max(
      esc.min_enemy_spawn_ms,
      this.currentEnemySpawnMs * esc.enemy_spawn_multiplier
    );

    // Recreate bomb spawn timer with reduced delay
    this.currentBombSpawnMs = Math.max(
      esc.min_bomb_spawn_ms,
      this.currentBombSpawnMs * esc.bomb_spawn_multiplier
    );
    if (this.bombSpawnTimer) {
      this.bombSpawnTimer.remove();
      this.bombSpawnTimer = this.scene.time.addEvent({
        delay: this.currentBombSpawnMs,
        callback: this.spawnBomb,
        callbackScope: this,
        loop: true,
      });
    }

    log.info(
      COMPONENT_NAME,
      `Difficulty escalated to step ${this.escalationStep}`
    );
  }

  shutdown() {
    // Destroy timers
    this.spawnTimer?.destroy();
    this.keySpawnTimer?.destroy();
    this.bombSpawnTimer?.destroy();

    // Drain object pools (ticket #184)
    this.enemies?.clear(true, true);
    this.keys?.clear(true, true);
    this.bombs?.clear(true, true);
    this.lootDrops?.clear(true, true);

    // Reset state
    this.powerupDropCount = 0;
    this.escalationStep = 0;
    this.currentEnemySpawnMs = 0;
    this.currentBombSpawnMs = 0;
    this.directorMode = "normal";
    this.burstRemaining = 0;
    this.limoRemaining = 0;
    this.player = undefined;
    this.boss = undefined;
    this.tresrBot = undefined;
  }
}
