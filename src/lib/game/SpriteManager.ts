/**
 * SpriteManager - Reusable sprite loading and animation configuration
 *
 * Provides DRY sprite handling by reading configuration from tresr.yaml
 * (via config-client.json) and creating consistent animations across
 * all game entities.
 *
 * All sprites use per-animation sheets (one single-row strip per animation).
 * Each anim entry specifies its own path, frameWidth, and frameHeight.
 * Every anim is loaded as "{entity}_{anim}" (e.g., "hero_idle").
 * Entity constructors use the first animation key as their initial texture.
 *
 * Enemy sprites are lazy-loaded on first spawn to reduce memory usage.
 *
 * Part of R-005: Create reusable Sprite Functions/Module
 */

import Phaser from "phaser";
import {config} from "@/lib/config/client";
import {log} from "@/lib/utils/log";

const COMPONENT_NAME = "SpriteManager";

export interface SpriteAnimConfig {
  name: string;
  frames: number;
  frameRate: number;
  repeat: number;
  path: string;
  frameWidth: number;
  frameHeight: number;
}

export interface SpriteConfig {
  scaleFactor?: number;
  anims: SpriteAnimConfig[];
}

export interface EnemyAnimConfig {
  name: string;
  frames: number;
  frameRate: number;
  repeat: number;
  /** Per-variant path template with {i} placeholder */
  pathTemplate?: string;
  /** Shared path — same sprite for all variants */
  path?: string;
  frameWidth: number;
  frameHeight: number;
}

export interface EnemySpriteConfig {
  scaleFactor?: number;
  count: number;
  anims: EnemyAnimConfig[];
}

export interface SpritesConfig {
  defaults: {
    frameWidth: number;
    frameHeight: number;
  };
  hero: SpriteConfig;
  super?: SpriteConfig;
  boss: SpriteConfig;
  tresr_bot?: SpriteConfig;
  enemies: EnemySpriteConfig;
  items: Record<string, SpriteConfig>;
  statics: Array<{name: string; path: string}>;
}

/**
 * SpriteManager handles all sprite loading and animation creation
 * in a DRY, configuration-driven manner.
 */
export class SpriteManager {
  private scene: Phaser.Scene;
  private config: SpritesConfig | null = null;

  /** Track which enemy variants have been lazy-loaded */
  private loadedEnemyVariants: Set<number> = new Set();
  /** Track in-flight enemy variant loads to prevent concurrent duplicates */
  private pendingEnemyLoads: Map<number, Promise<void>> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Load sprite configuration from the static client config
   */
  loadConfig(): SpritesConfig {
    if (this.config) return this.config;
    this.config = config.sprites as unknown as SpritesConfig;
    return this.config;
  }

  /**
   * Load per-animation sprite sheets for an entity.
   * Every anim is loaded as "{entityKey}_{animName}" (e.g., "hero_idle").
   */
  private preloadEntitySprites(
    entityKey: string,
    spriteConfig: SpriteConfig
  ): void {
    for (let i = 0; i < spriteConfig.anims.length; i++) {
      const anim = spriteConfig.anims[i];
      const textureKey = `${entityKey}_${anim.name}`;
      this.scene.load.spritesheet(textureKey, anim.path, {
        frameWidth: anim.frameWidth,
        frameHeight: anim.frameHeight,
      });
    }
  }

  /**
   * Load per-animation sprite sheets for a templated enemy variant.
   * Supports both `path` (shared sprite) and `pathTemplate` (per-variant {i}).
   */
  private preloadEnemySprites(
    variantIndex: number,
    enemyConfig: EnemySpriteConfig
  ): void {
    const entityKey = `enemy_${variantIndex}`;

    for (let i = 0; i < enemyConfig.anims.length; i++) {
      const anim = enemyConfig.anims[i];
      const textureKey = `${entityKey}_${anim.name}`;

      // Resolve path: prefer pathTemplate (per-variant), fall back to path (shared)
      let spritePath: string | undefined;
      if (anim.pathTemplate) {
        spritePath = anim.pathTemplate.replace("{i}", String(variantIndex));
      } else if (anim.path) {
        spritePath = anim.path;
      }

      if (!spritePath) {
        log.warn(
          COMPONENT_NAME,
          `Enemy anim "${anim.name}" has no path or pathTemplate — skipping`
        );
        continue;
      }

      this.scene.load.spritesheet(textureKey, spritePath, {
        frameWidth: anim.frameWidth,
        frameHeight: anim.frameHeight,
      });
    }
  }

  /**
   * Preload all sprite assets based on configuration.
   * Call this in the scene's preload() method.
   *
   * NOTE: Enemy sprites are NOT loaded here — they are lazy-loaded
   * on first spawn via ensureEnemyLoaded() to reduce startup memory.
   */
  preloadSprites(spritesCfg?: SpritesConfig): void {
    const spriteConfig = spritesCfg || this.loadConfig();

    // Load hero sprite sheets
    if (spriteConfig.hero) {
      this.preloadEntitySprites("hero", spriteConfig.hero);
    }

    // Load super projectile sprite sheets
    if (spriteConfig.super) {
      this.preloadEntitySprites("super", spriteConfig.super);
    }

    // Load boss sprite sheets
    if (spriteConfig.boss) {
      this.preloadEntitySprites("boss", spriteConfig.boss);
    }

    // Load tresr_bot sprite sheets
    if (spriteConfig.tresr_bot) {
      this.preloadEntitySprites("tresr_bot", spriteConfig.tresr_bot);
    }

    // Enemy sprites are lazy-loaded via ensureEnemyLoaded() on first spawn

    // Load item sprite sheets
    if (spriteConfig.items) {
      Object.entries(spriteConfig.items).forEach(([key, itemConfig]) => {
        this.preloadEntitySprites(key, itemConfig);
      });
    }

    // Load static images
    if (spriteConfig.statics) {
      spriteConfig.statics.forEach((staticConfig) => {
        this.scene.load.image(staticConfig.name, staticConfig.path);
      });
    }

    log.info(COMPONENT_NAME, "Sprites queued for loading (enemies deferred)");
  }

  /**
   * Lazy-load sprites for a specific enemy variant on first spawn.
   * Returns a Promise that resolves once the textures are loaded and
   * animations are created. Subsequent calls for the same variant
   * resolve immediately.
   */
  ensureEnemyLoaded(variantIndex: number): Promise<void> {
    if (this.loadedEnemyVariants.has(variantIndex)) {
      return Promise.resolve();
    }

    // Return existing in-flight promise to prevent concurrent duplicate loads
    const pending = this.pendingEnemyLoads.get(variantIndex);
    if (pending) {
      return pending;
    }

    const spriteConfig = this.loadConfig();
    if (!spriteConfig.enemies) {
      return Promise.resolve();
    }

    const entityKey = `enemy_${variantIndex}`;
    const animKeys = spriteConfig.enemies.anims.map(
      (a) => `${entityKey}_${a.name}`
    );

    // Check if textures already exist (e.g. from a previous scene)
    if (this.scene.textures.exists(animKeys[0])) {
      this.loadedEnemyVariants.add(variantIndex);
      // Still create animations in case they don't exist yet
      this.createEnemyAnimations(variantIndex, spriteConfig.enemies.anims);
      return Promise.resolve();
    }

    // Queue the sprite sheets for loading
    this.preloadEnemySprites(variantIndex, spriteConfig.enemies);

    // Wait for ALL spritesheets in this variant to finish loading before
    // creating animations. Previously we only waited for the first sheet,
    // which caused walk/jump/attack/hurt textures to have 0 frames.
    const loadPromise = new Promise<void>((resolve) => {
      let remaining = animKeys.length;
      const onSheetLoaded = () => {
        remaining--;
        if (remaining <= 0) {
          this.createEnemyAnimations(variantIndex, spriteConfig.enemies.anims);
          this.loadedEnemyVariants.add(variantIndex);
          this.pendingEnemyLoads.delete(variantIndex);
          log.info(COMPONENT_NAME, `Lazy-loaded enemy variant ${variantIndex}`);
          resolve();
        }
      };
      for (const key of animKeys) {
        // cspell:disable-next-line -- Phaser loader event name
        this.scene.load.once(`filecomplete-spritesheet-${key}`, onSheetLoaded);
      }
      this.scene.load.start();
    });

    this.pendingEnemyLoads.set(variantIndex, loadPromise);
    return loadPromise;
  }

  /**
   * Create all animations based on configuration.
   * Call this in the scene's create() method.
   *
   * NOTE: Enemy animations are created lazily via ensureEnemyLoaded().
   */
  createAnimations(spritesCfg?: SpritesConfig): void {
    const spriteConfig = spritesCfg || this.loadConfig();

    // Create hero animations
    if (spriteConfig.hero) {
      this.createEntityAnimations("hero", spriteConfig.hero.anims);
    }

    // Create super projectile animations
    if (spriteConfig.super) {
      this.createEntityAnimations("super", spriteConfig.super.anims);
    }

    // Create boss animations
    if (spriteConfig.boss) {
      this.createEntityAnimations("boss", spriteConfig.boss.anims);
    }

    // Create tresr_bot animations
    if (spriteConfig.tresr_bot) {
      this.createEntityAnimations("tresr_bot", spriteConfig.tresr_bot.anims);
    }

    // Enemy animations are created lazily via ensureEnemyLoaded()

    // Create item animations
    if (spriteConfig.items) {
      Object.keys(spriteConfig.items).forEach((key) => {
        this.createEntityAnimations(key, spriteConfig.items[key].anims);
      });
    }

    log.info(COMPONENT_NAME, "Animations created (enemies deferred)");
  }

  /**
   * Create animations for a single entity.
   * Every animation references its own "{entityKey}_{animName}" texture key.
   * No animation references the base entity key — this prevents texture-swap
   * flickering in Phaser's WebGL renderer.
   */
  private createEntityAnimations(
    entityKey: string,
    anims: SpriteAnimConfig[]
  ): void {
    for (let i = 0; i < anims.length; i++) {
      const anim = anims[i];
      const animKey = `${entityKey}_${anim.name}`;

      if (this.scene.anims.exists(animKey)) continue;

      const textureKey = `${entityKey}_${anim.name}`;
      const frameEnd = anim.frames - 1;

      // Validate texture has enough frames
      const tex = this.scene.textures.get(textureKey);
      const totalFrames = tex ? tex.frameTotal - 1 : 0;
      if (frameEnd >= totalFrames) {
        log.warn(
          COMPONENT_NAME,
          `Skipping "${animKey}": needs frames 0-${frameEnd} but texture "${textureKey}" only has ${totalFrames} frames.`
        );
        continue;
      }

      this.scene.anims.create({
        key: animKey,
        frames: this.scene.anims.generateFrameNumbers(textureKey, {
          start: 0,
          end: frameEnd,
        }),
        frameRate: anim.frameRate,
        repeat: anim.repeat,
      });
    }
  }

  /**
   * Create animations for a templated enemy variant.
   * Same pattern: every animation uses its own per-anim texture key.
   */
  private createEnemyAnimations(
    variantIndex: number,
    anims: EnemyAnimConfig[]
  ): void {
    const entityKey = `enemy_${variantIndex}`;

    for (let i = 0; i < anims.length; i++) {
      const anim = anims[i];
      const animKey = `${entityKey}_${anim.name}`;

      if (this.scene.anims.exists(animKey)) continue;

      const textureKey = `${entityKey}_${anim.name}`;
      const frameEnd = anim.frames - 1;

      // Validate texture has enough frames
      const tex = this.scene.textures.get(textureKey);
      const totalFrames = tex ? tex.frameTotal - 1 : 0;
      if (frameEnd >= totalFrames) {
        log.warn(
          COMPONENT_NAME,
          `Skipping "${animKey}": needs frames 0-${frameEnd} but texture "${textureKey}" only has ${totalFrames} frames.`
        );
        continue;
      }

      this.scene.anims.create({
        key: animKey,
        frames: this.scene.anims.generateFrameNumbers(textureKey, {
          start: 0,
          end: frameEnd,
        }),
        frameRate: anim.frameRate,
        repeat: anim.repeat,
      });
    }
  }

  /**
   * Get the scaleFactor for an entity sprite.
   * Checks top-level sprites (hero, super, boss, enemies) and items.
   * Returns 1 if no scaleFactor is configured.
   *
   * When `canvasHeight` and `designHeight` are provided the config
   * scaleFactor is multiplied by `canvasHeight / designHeight` so sprites
   * maintain the same proportional screen size regardless of resolution.
   * `designHeight` comes from `display.design_height` in tresr.yaml.
   */
  static getScaleFactor(
    spritesConfig: SpritesConfig,
    entityKey: string,
    canvasHeight?: number,
    designHeight?: number
  ): number {
    const resMult =
      canvasHeight && designHeight ? canvasHeight / designHeight : 1;

    let base: number;
    if (entityKey === "hero") {
      base = spritesConfig.hero?.scaleFactor ?? 1;
    } else if (entityKey === "super") {
      base = spritesConfig.super?.scaleFactor ?? 1;
    } else if (entityKey === "boss") {
      base = spritesConfig.boss?.scaleFactor ?? 1;
    } else if (entityKey === "tresr_bot") {
      base = spritesConfig.tresr_bot?.scaleFactor ?? 1;
    } else if (entityKey.startsWith("enemy")) {
      base = spritesConfig.enemies?.scaleFactor ?? 1;
    } else if (spritesConfig.items?.[entityKey]) {
      base = spritesConfig.items[entityKey].scaleFactor ?? 1;
    } else {
      base = 1;
    }

    return base * resMult;
  }

  /**
   * Clean up tracking state and pending event listeners.
   * Call from MainScene.shutdown() alongside other manager shutdowns.
   */
  shutdown(): void {
    // Remove in-flight filecomplete listeners for any pending enemy loads
    for (const variantIndex of this.pendingEnemyLoads.keys()) {
      const spriteConfig = this.config;
      if (spriteConfig?.enemies) {
        const entityKey = `enemy_${variantIndex}`;
        for (const anim of spriteConfig.enemies.anims) {
          const key = `${entityKey}_${anim.name}`;
          // cspell:disable-next-line -- Phaser loader event name
          this.scene.load.removeAllListeners(`filecomplete-spritesheet-${key}`);
        }
      }
    }

    this.pendingEnemyLoads.clear();
    this.loadedEnemyVariants.clear();

    log.info(COMPONENT_NAME, "Shutdown complete");
  }

  /**
   * Get animation key for an entity
   */
  static getAnimKey(textureKey: string, animName: string): string {
    return `${textureKey}_${animName}`;
  }
}

export default SpriteManager;
