/**
 * SpriteManager - Reusable sprite loading and animation configuration
 *
 * Provides DRY sprite handling by reading configuration from tresr.yaml
 * (via config-client.json) and creating consistent animations across
 * all game entities.
 *
 * All sprites use per-animation sheets (one single-row strip per animation).
 * Each anim entry specifies its own path, frameWidth, and frameHeight.
 * Every anim is loaded as "{entity}_{anim}". The first anim is also loaded
 * as the bare "{entity}" key for Phaser sprite constructor compatibility.
 * Animations always reference per-anim keys to avoid texture-swap flickering.
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
  pathTemplate: string;
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
   * The first anim is ALSO loaded as the bare "{entityKey}" so that entity
   * constructors (which pass the base key to Phaser.Sprite) get valid
   * frame dimensions. Animations never reference the base key — they all
   * use per-anim keys — so no texture-swap flickering occurs.
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
      // Also load the first anim as the base entity key for the constructor
      if (i === 0) {
        this.scene.load.spritesheet(entityKey, anim.path, {
          frameWidth: anim.frameWidth,
          frameHeight: anim.frameHeight,
        });
      }
    }
  }

  /**
   * Load per-animation sprite sheets for a templated enemy variant.
   * Resolves {i} in pathTemplate for each anim. Same dual-key pattern:
   * every anim gets "{entityKey}_{animName}", first also gets "{entityKey}".
   */
  private preloadEnemySprites(
    variantIndex: number,
    enemyConfig: EnemySpriteConfig
  ): void {
    const entityKey = `enemy_${variantIndex}`;

    for (let i = 0; i < enemyConfig.anims.length; i++) {
      const anim = enemyConfig.anims[i];
      const textureKey = `${entityKey}_${anim.name}`;
      const path = anim.pathTemplate.replace("{i}", String(variantIndex));
      this.scene.load.spritesheet(textureKey, path, {
        frameWidth: anim.frameWidth,
        frameHeight: anim.frameHeight,
      });
      // Also load the first anim as the base entity key for the constructor
      if (i === 0) {
        this.scene.load.spritesheet(entityKey, path, {
          frameWidth: anim.frameWidth,
          frameHeight: anim.frameHeight,
        });
      }
    }
  }

  /**
   * Preload all sprite assets based on configuration.
   * Call this in the scene's preload() method.
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

    // Load enemy sprite sheets (templated for N variants)
    if (spriteConfig.enemies) {
      for (let i = 1; i <= spriteConfig.enemies.count; i++) {
        this.preloadEnemySprites(i, spriteConfig.enemies);
      }
    }

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

    log.info(COMPONENT_NAME, "Sprites queued for loading");
  }

  /**
   * Create all animations based on configuration.
   * Call this in the scene's create() method.
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

    // Create enemy animations (templated)
    if (spriteConfig.enemies) {
      for (let i = 1; i <= spriteConfig.enemies.count; i++) {
        this.createEnemyAnimations(i, spriteConfig.enemies.anims);
      }
    }

    // Create item animations
    if (spriteConfig.items) {
      Object.keys(spriteConfig.items).forEach((key) => {
        this.createEntityAnimations(key, spriteConfig.items[key].anims);
      });
    }

    log.info(COMPONENT_NAME, "Animations created");
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
   */
  static getScaleFactor(
    spritesConfig: SpritesConfig,
    entityKey: string
  ): number {
    if (entityKey === "hero") return spritesConfig.hero?.scaleFactor ?? 1;
    if (entityKey === "super") return spritesConfig.super?.scaleFactor ?? 1;
    if (entityKey === "boss") return spritesConfig.boss?.scaleFactor ?? 1;
    if (entityKey === "tresr_bot")
      return spritesConfig.tresr_bot?.scaleFactor ?? 1;
    if (entityKey.startsWith("enemy"))
      return spritesConfig.enemies?.scaleFactor ?? 1;
    if (spritesConfig.items?.[entityKey])
      return spritesConfig.items[entityKey].scaleFactor ?? 1;
    return 1;
  }

  /**
   * Get animation key for an entity
   */
  static getAnimKey(textureKey: string, animName: string): string {
    return `${textureKey}_${animName}`;
  }
}

export default SpriteManager;
