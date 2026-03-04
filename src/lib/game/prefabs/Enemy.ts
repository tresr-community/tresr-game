import Phaser from "phaser";
import {BaseEntity} from "./BaseEntity";
import type {WalkableArea} from "@/lib/game/WalkableArea";
import {gameState} from "@/lib/game/state";
import {log} from "@/lib/utils/log";
import type {AIBehavior, EnemyContext} from "@/lib/game/ai";
import {createBehavior, selectRandomAIType} from "@/lib/game/ai";
import {chaseTarget} from "@/lib/game/ai/shared";

const COMPONENT_NAME = "Enemy";

export class Enemy extends BaseEntity {
  private _target?: Phaser.GameObjects.Components.Transform;
  private _speed: number = 100;
  private _baseSpeed: number = 100;
  private _attackRange: number = 40;
  private _rng!: Phaser.Math.RandomDataGenerator;
  private _walkableArea?: WalkableArea;
  private _enemyGroup?: Phaser.Physics.Arcade.Group;

  // Per-enemy damage cooldown (ticket #139: each enemy tracks its own cooldown)
  public lastPlayerDamageTime: number = 0;

  // Spawn/despawn state: walking_in → active → fleeing
  private enterState: "walking_in" | "active" | "fleeing" = "active";
  private walkInTargetX: number = 0;

  // Pre-computed animation keys to avoid string concatenation per frame
  private _animKeys!: {
    idle: string;
    walk: string;
    attack: string;
    hurt: string;
  };

  // AI behavior strategy — each behavior holds its own state
  private behavior!: AIBehavior;

  // Cached EnemyContext bridge — closures always reflect current state
  private _ctx!: EnemyContext;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string = "enemy_1_idle"
  ) {
    super(scene, x, y, texture);

    // Use cached config from BaseEntity - NO hardcoding
    const enemyConfig = this.config.gameplay.entities.enemy;
    this.hp = enemyConfig.health;
    this.maxHp = this.hp;
    this._baseSpeed = enemyConfig.speed;
    this._speed = this._baseSpeed;
    this._attackRange = enemyConfig.combat.attack_range;

    // Set physics properties from config
    const hitbox = enemyConfig.hitbox;
    this.body?.setCircle(hitbox.radius, hitbox.offsetX, hitbox.offsetY);

    // Pre-compute animation keys to avoid string concatenation every frame
    // Strip _idle suffix from texture if present to get base entity key
    const baseKey = texture.replace(/_idle$/, "");
    this._animKeys = {
      idle: `${baseKey}_idle`,
      walk: `${baseKey}_walk`,
      attack: `${baseKey}_attack`,
      hurt: `${baseKey}_hurt`,
    };

    // Initialize default behavior and context
    this.behavior = createBehavior("direct");
    this.buildContext();
  }

  setTarget(target: Phaser.GameObjects.Components.Transform) {
    this._target = target;
  }

  /** AI type name exposed for group scanning (retardio filtering). */
  get aiTypeName(): string {
    return this.behavior.type;
  }

  /** Identity ref for GroupMemberView self-filtering. */
  get _self(): object {
    return this;
  }

  /** Play animation only if it exists — prevents infinite Phaser warnings
   *  that lock the browser when a texture failed to load or had 0 frames. */
  private safePlay(key: string, ignoreIfPlaying: boolean = true): void {
    if (this.scene.anims.exists(key)) {
      this.play(key, ignoreIfPlaying);
    } else {
      log.warn(COMPONENT_NAME, `Animation "${key}" not found, skipping`);
    }
  }

  /**
   * Build the EnemyContext bridge object.
   * Created once; closures capture `enemy` so every access reflects live state.
   * Protected fields (config, resolutionScale) are accessible from the closure.
   */
  private buildContext(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const enemy = this;
    this._ctx = {
      get x() {
        return enemy.x;
      },
      get groundY() {
        return enemy.groundY;
      },
      set groundY(v: number) {
        enemy.groundY = v;
      },
      get baseSpeed() {
        return enemy._baseSpeed;
      },
      get speed() {
        return enemy._speed;
      },
      set speed(v: number) {
        enemy._speed = v;
      },
      get resolutionScale() {
        return enemy.resolutionScale;
      },
      get attackRange() {
        return enemy._attackRange;
      },
      get hp() {
        return enemy.hp;
      },
      set hp(v: number) {
        enemy.hp = v;
      },
      get maxHp() {
        return enemy.maxHp;
      },
      set maxHp(v: number) {
        enemy.maxHp = v;
      },
      get animKeys() {
        return enemy._animKeys;
      },
      safePlay: (key: string, ignoreIfPlaying?: boolean) =>
        enemy.safePlay(key, ignoreIfPlaying),
      get isAttacking() {
        return (
          enemy.anims?.isPlaying === true &&
          enemy.anims?.currentAnim?.key === enemy._animKeys.attack
        );
      },
      setFlipX: (flip: boolean) => enemy.setFlipX(flip),
      setVelocityX: (vx: number) => enemy.setVelocityX(vx),
      setVelocityY: (vy: number) => enemy.setVelocityY(vy),
      setTint: (tint: number) => enemy.setTint(tint),
      clearTint: () => enemy.clearTint(),
      get walkableArea() {
        return enemy._walkableArea;
      },
      get cameraWidth() {
        return enemy.scene.cameras.main.width;
      },
      get target() {
        if (!enemy._target) return undefined;
        const t = enemy._target;
        const gY = "groundY" in t ? (t as BaseEntity).groundY : t.y;
        return {x: t.x, groundY: gY};
      },
      get enemyGroup() {
        return enemy._enemyGroup;
      },
      get config() {
        return enemy.config;
      },
      get rng() {
        return enemy._rng;
      },
      get _self() {
        return enemy;
      },
      get aiTypeName() {
        return enemy.behavior.type;
      },
    };
  }

  update(dt?: number) {
    if (gameState.get().isPaused) return;
    if (!this.active || !this.anims || this.hp <= 0) return;
    // Skip AI movement during knockback — let physics impulse play out
    if (this.isKnockedBack) {
      super.update();
      return;
    }

    // Use cached config from BaseEntity
    const gp = this.config.gameplay;
    // Use real delta time from MainScene (falls back to reference timestep)
    const frameDt = dt ?? this.referenceDt;

    // Handle walk-in from off-screen
    if (this.enterState === "walking_in") {
      const walkSpeed = this._baseSpeed * this.resolutionScale;
      // We still use walkInTargetX to determine which direction to walk
      const dx = this.walkInTargetX - this.x;
      this.setFlipX(dx < 0);

      // If we've entered the walkable bounds, or reached the target, become active immediately!
      // Provide a buffer so they are fully visible before stopping their strict walk-in.
      const buffer = 40;
      const walkableLeft = (this._walkableArea?.getLeftX() ?? 0) + buffer;
      const walkableRight =
        (this._walkableArea?.getRightX() ?? this.scene.cameras.main.width) -
        buffer;

      const isPastLeftEdge = dx > 0 && this.x >= walkableLeft;
      const isPastRightEdge = dx < 0 && this.x <= walkableRight;

      if (isPastLeftEdge || isPastRightEdge || Math.abs(dx) < 5) {
        // AI activates as soon as they cross the visible walkable threshold
        this.enterState = "active";
      } else {
        this.setVelocityX(Math.sign(dx) * walkSpeed);
        this.setVelocityY(0);
      }
      this.safePlay(this._animKeys.walk, true);
      super.update(dt);
      return;
    }

    // Handle fleeing off-screen
    if (this.enterState === "fleeing") {
      const fleeSpeed =
        this._baseSpeed *
        gp.entities.enemy.flee_speed_mult *
        this.resolutionScale;
      const {width} = this.scene.cameras.main;
      // Run toward nearest edge
      const fleeMargin = gp.entities.enemy.flee_margin_px ?? 50;
      const nearestEdge =
        this.x < width / 2 ? -fleeMargin * 2 : width + fleeMargin * 2;
      this.setFlipX(nearestEdge < this.x);
      this.setVelocityX(Math.sign(nearestEdge - this.x) * fleeSpeed);
      this.setVelocityY(0);
      this.safePlay(this._animKeys.walk, true);
      // Kill once off-screen
      if (this.x < -fleeMargin || this.x > width + fleeMargin) {
        this.kill();
        return;
      }
      super.update(dt);
      return;
    }

    // --- Delegate to AI behavior strategy ---
    const result = this.behavior.update(this._ctx, frameDt);

    switch (result.action) {
      case "chase":
        chaseTarget(this._ctx, result.targetX, result.targetGY, frameDt);
        break;
      case "handled":
        // Behavior did all movement — just clamp x below
        break;
      case "idle":
        this.setVelocity(0, 0);
        this.safePlay(this._animKeys.idle, true);
        break;
      case "kill":
        this.kill();
        return;
    }

    // Clamp x to walkable area (behaviors handle their own groundY clamping)
    // If X was clamped, zero the X velocity so the enemy doesn't oscillate
    // against the wall every frame (classic boundary-bounce stuck bug).
    if (this._walkableArea) {
      const clamped = this._walkableArea.clampToWalkable(this.x, this.groundY);
      if (clamped.x !== this.x) {
        this.setVelocityX(0);
      }
      this.x = clamped.x;
    }

    super.update(dt);
  }

  public takeDamage(amount: number) {
    if (this.hp <= 0) return;

    // Delegate to behavior's onDamage hook (e.g., passive provoke)
    this.behavior.onDamage?.(this._ctx);

    super.takeDamage(amount);
    // Show health bar after damage applied, but not for dead enemies
    if (!this.showHealthBar && this.hp > 0 && this.hp < this.maxHp) {
      const enemyConfig = this.config.gameplay.entities.enemy;
      this.enableHealthBar(
        enemyConfig.health_bar?.width ?? 30,
        enemyConfig.health_bar?.height ?? 4,
        enemyConfig.health_bar?.offset_y ?? -5
      );
    }
    if (this.hp > 0 && this.anims) {
      this.safePlay(this._animKeys.hurt, true);
    }
  }

  protected onDie() {
    // Emit entity_death event for super charge accumulation
    this.scene.events.emit("entity_death", {
      type: this.texture.key,
      x: this.x,
      y: this.groundY,
    });

    // Hide health bar immediately on death (don't wait for kill delay)
    if (this.healthBar) {
      this.healthBar.setVisible(false);
    }

    if (this.anims) this.safePlay(this._animKeys.hurt, true);
    this.setVelocity(0, 0);
    // Use cached config from BaseEntity
    const deathDelay =
      this.config.gameplay.entities.enemy.animations.death_delay;
    this.trackTimer(
      this.scene.time.delayedCall(deathDelay, () => {
        if (this.active) {
          // Use kill() for pooling - hides shadow instead of destroying
          this.kill();
        }
      })
    );
  }

  spawn(
    x: number,
    groundY: number,
    rng: Phaser.Math.RandomDataGenerator,
    walkInTargetX: number,
    textureKey: string,
    aiOverride?: string
  ) {
    this._rng = rng;
    this.setActive(true);
    // Keep invisible until body is enabled and position is set — prevents
    // Phaser rendering the recycled sprite at its stale pool position for
    // one frame, which causes the "two enemies at once" ghost flicker.
    // (shadow and visibility are restored below after setPosition)
    this.setVisible(false);
    if (this.shadow) {
      this.shadow.setVisible(false);
    }
    // Hide health bar until damaged
    this.showHealthBar = false;
    if (this.healthBar) {
      this.healthBar.setVisible(false);
    }

    // Re-compute animation keys for the target texture variant.
    // Phaser's Group.getFirst() does NOT apply the texture key to recycled
    // members — this.texture.key may still reference the last animation's
    // per-anim texture (e.g. "enemy_1_hurt" instead of "enemy_1_idle"), which
    // causes invalid anim keys like "enemy_1_hurt_idle". Use the explicit
    // textureKey parameter passed by the caller instead.
    // Strip any anim suffix to get the base entity key (e.g., "enemy_1")
    const tex = textureKey || this.texture.key;
    const baseKey = tex.replace(/_(idle|walk|jump|attack|hurt)$/, "");
    if (textureKey) {
      // Set to the _idle texture for this variant
      this.setTexture(`${baseKey}_idle`);
    }
    this._animKeys = {
      idle: `${baseKey}_idle`,
      walk: `${baseKey}_walk`,
      attack: `${baseKey}_attack`,
      hurt: `${baseKey}_hurt`,
    };

    // Enable physics body FIRST so setPosition/setVelocity are not no-ops (ticket #245)
    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).enable = true;
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    }

    // Initialize groundY for 2.5D positioning
    this.groundY = groundY;
    this.z = 0;
    this.setPosition(x, groundY);
    // Body is enabled and position is set — safe to reveal the sprite now.
    this.setVisible(true);
    if (this.shadow) {
      this.shadow.setVisible(true);
    }
    this.hp = this.maxHp;
    this.setAlpha(1);
    this.clearTint();
    this.setVelocity(0, 0);
    // Note: _target is NOT cleared here — SpawnManager always calls setTarget()
    // immediately after spawn(). Clearing it would create a 1-frame window where
    // the AI has no target and produces erratic / idle movement.

    // Reset inherited state flags (ticket #231)
    this.isKnockedBack = false;
    this.isInvincible = false;

    this.lastPlayerDamageTime = 0;
    this._walkableArea = this.scene.registry.get(
      "walkable_area"
    ) as WalkableArea;
    this._enemyGroup = this.scene.registry.get(
      "enemy_group"
    ) as Phaser.Physics.Arcade.Group;

    // Select AI type and create fresh behavior (each holds its own state)
    type AITypeKeys =
      | "direct"
      | "flanker"
      | "cautious"
      | "swarm"
      | "erratic"
      | "passive"
      | "retardio";
    let aiType: AITypeKeys;
    if (
      aiOverride &&
      [
        "direct",
        "flanker",
        "cautious",
        "swarm",
        "erratic",
        "passive",
        "retardio",
      ].includes(aiOverride)
    ) {
      aiType = aiOverride as AITypeKeys;
    } else {
      aiType = selectRandomAIType(this.config, this._rng) as AITypeKeys;
    }
    this.behavior = createBehavior(aiType);
    this.behavior.onSpawn(this._ctx);

    log.debug(COMPONENT_NAME, `AI selected: ${this.behavior.type}`);

    // Walk-in state: enemy walks from off-screen to target position
    if (walkInTargetX !== undefined) {
      this.enterState = "walking_in";

      // Calculate walk in limit
      const margin =
        this.config.gameplay.entities.enemy.walk_in_boundary_margin_px ?? 5;
      const {width} = this.scene.cameras.main;

      // Clamp the walk-in target to within allowed bounds
      this.walkInTargetX = Math.min(
        Math.max(walkInTargetX, margin),
        width - margin
      );
    } else {
      this.enterState = "active";
    }
    this.anims.stop();
    this.safePlay(this._animKeys.walk, true);
  }

  /**
   * Make the enemy flee off-screen. It walks toward the nearest edge
   * and self-destructs once off-screen (no death sound/event).
   */
  flee() {
    if (!this.active || this.enterState === "fleeing") return;
    this.enterState = "fleeing";
    this._target = undefined;
  }

  kill() {
    super.kill();
  }
}
