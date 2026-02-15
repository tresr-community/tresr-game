import Phaser from "phaser";
import {BaseEntity} from "./BaseEntity";
import type {WalkableArea} from "@/lib/game/WalkableArea";
import {gameState} from "@/lib/game/state";

//const COMPONENT_NAME = "Enemy";

// AI behavior types for enemy variety
type EnemyAIType =
  | "direct"
  | "flanker"
  | "cautious"
  | "erratic"
  | "ranged"
  | "swarm"
  | "burrower";

export class Enemy extends BaseEntity {
  private target?: Phaser.GameObjects.Components.Transform;
  private speed: number = 100;
  private baseSpeed: number = 100;
  private attackRange: number = 40;
  private aiType: EnemyAIType = "direct";
  private aiTimer: number = 0;
  private flankDirection: number = 1;
  private erraticOffset: {x: number; y: number} = {x: 0, y: 0};
  private burrowerTriggered: boolean = false;
  private burrowerEdgeX: number = 0;
  private rng!: Phaser.Math.RandomDataGenerator;
  private walkableArea?: WalkableArea;
  private enemyGroup?: Phaser.Physics.Arcade.Group;
  private swarmNearbyCount: number = 0;
  private swarmCheckCounter: number = 0;

  // Per-enemy damage cooldown (ticket #139: each enemy tracks its own cooldown)
  public lastPlayerDamageTime: number = 0;

  // Spawn/despawn state: walking_in → active → fleeing
  private enterState: "walking_in" | "active" | "fleeing" = "active";
  private walkInTargetX: number = 0;

  // Pre-computed animation keys to avoid string concatenation per frame
  private animKeys!: {idle: string; walk: string; attack: string; hurt: string};

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string = "enemy_1"
  ) {
    super(scene, x, y, texture);

    // Use cached config from BaseEntity - NO hardcoding
    const enemyConfig = this.config.gameplay.entities.enemy;
    this.hp = enemyConfig.health;
    this.maxHp = this.hp;
    this.baseSpeed = enemyConfig.speed;
    this.speed = this.baseSpeed;
    this.attackRange = enemyConfig.combat.attack_range;

    // Set physics properties from config
    const hitbox = enemyConfig.hitbox;
    this.body?.setCircle(hitbox.radius, hitbox.offsetX, hitbox.offsetY);

    // Pre-compute animation keys to avoid string concatenation every frame
    this.animKeys = {
      idle: `${texture}_idle`,
      walk: `${texture}_walk`,
      attack: `${texture}_attack`,
      hurt: `${texture}_hurt`,
    };
  }

  setTarget(target: Phaser.GameObjects.Components.Transform) {
    this.target = target;
  }

  /** @deprecated Use spawn(x, y, rng) instead */
  setRng(rng: Phaser.Math.RandomDataGenerator) {
    this.rng = rng;
  }

  private selectRandomAI() {
    // Weighted random selection from config
    const aiConfig = this.config.gameplay.entities.enemy.ai;
    const weights = aiConfig.weights;
    const entries: [EnemyAIType, number][] = [
      ["direct", weights.direct],
      ["flanker", weights.flanker],
      ["cautious", weights.cautious],
      ["erratic", weights.erratic],
      ["ranged", weights.ranged],
      ["swarm", weights.swarm],
      ["burrower", weights.burrower],
    ];
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.rng.frac() * totalWeight;
    this.aiType = "direct"; // fallback
    for (const [type, w] of entries) {
      roll -= w;
      if (roll <= 0) {
        this.aiType = type;
        break;
      }
    }

    this.flankDirection = this.rng.frac() < 0.5 ? 1 : -1;

    // Adjust stats based on AI type
    switch (this.aiType) {
      case "cautious":
        this.speed = this.baseSpeed * aiConfig.cautious.speed_mult;
        this.attackRange = this.attackRange * aiConfig.cautious.range_mult;
        break;
      case "erratic":
        this.speed = this.baseSpeed * aiConfig.erratic.speed_mult;
        break;
      case "flanker":
        this.speed = this.baseSpeed * aiConfig.flanker.speed_mult;
        break;
      case "ranged":
        this.speed = this.baseSpeed * aiConfig.ranged.speed_mult;
        break;
      case "swarm":
        this.speed = this.baseSpeed * aiConfig.swarm.speed_mult;
        break;
      case "burrower": {
        // Burrower enemies hide off-screen and rush in when the player is nearby
        this.speed = 0;
        const cam = this.scene.cameras.main;
        const offDist = aiConfig.burrower.offscreen_distance;
        // Pick nearest edge based on spawn position, park just off-screen
        if (this.x < cam.width / 2) {
          this.burrowerEdgeX = -offDist;
        } else {
          this.burrowerEdgeX = cam.width + offDist;
        }
        this.setPosition(this.burrowerEdgeX, this.y);
        this.setVisible(false);
        // Hide shadow too — otherwise a ghost shadow appears on the walkable area
        if (this.shadow) this.shadow.setVisible(false);
        break;
      }
      default:
        this.speed = this.baseSpeed;
    }
  }

  update() {
    if (gameState.get().isPaused) return;
    if (!this.active || !this.anims || this.hp <= 0) return;
    // Skip AI movement during knockback — let physics impulse play out
    if (this.isKnockedBack) {
      super.update();
      return;
    }

    // Use cached config from BaseEntity
    const gp = this.config.gameplay;
    const aiConfig = gp.entities.enemy.ai;
    const timestep = gp.physics.timestep;
    const flankerOffset = aiConfig.flanker.offset;
    const flankerSwitchTime = aiConfig.flanker.switch_time;
    const erraticUpdateTime = aiConfig.erratic.update_time;
    const erraticJitterX = aiConfig.erratic.jitter_x;
    const erraticJitterY = aiConfig.erratic.jitter_y;

    // Handle walk-in from off-screen
    if (this.enterState === "walking_in") {
      const walkSpeed = this.baseSpeed;
      const dx = this.walkInTargetX - this.x;
      this.setFlipX(dx < 0);
      if (Math.abs(dx) < 5) {
        this.x = this.walkInTargetX;
        this.setVelocityX(0);
        this.enterState = "active";
      } else {
        this.setVelocityX(Math.sign(dx) * walkSpeed);
        this.setVelocityY(0);
      }
      this.play(this.animKeys.walk, true);
      super.update();
      return;
    }

    // Handle fleeing off-screen
    if (this.enterState === "fleeing") {
      const fleeSpeed = this.baseSpeed * 1.5;
      const {width} = this.scene.cameras.main;
      // Run toward nearest edge
      const nearestEdge = this.x < width / 2 ? -100 : width + 100;
      this.setFlipX(nearestEdge < this.x);
      this.setVelocityX(Math.sign(nearestEdge - this.x) * fleeSpeed);
      this.setVelocityY(0);
      this.play(this.animKeys.walk, true);
      // Kill once off-screen
      if (this.x < -50 || this.x > width + 50) {
        this.kill();
        return;
      }
      super.update();
      return;
    }

    this.aiTimer += timestep;

    if (this.target) {
      const dt = timestep;

      // Calculate direction to target's ground position
      const targetGroundY =
        "groundY" in this.target
          ? (this.target as BaseEntity).groundY
          : this.target.y;

      // Burrower AI: hide off-screen until player is near the edge, then rush in
      if (this.aiType === "burrower" && !this.burrowerTriggered) {
        // Check if player is within trigger_radius of the burrower's edge
        const playerDistToEdge = Math.abs(this.target.x - this.burrowerEdgeX);
        if (playerDistToEdge <= aiConfig.burrower.trigger_radius) {
          this.burrowerTriggered = true;
          this.setVisible(true);
          if (this.shadow) this.shadow.setVisible(true);
          this.speed = this.baseSpeed * aiConfig.burrower.speed_mult;
        } else {
          // Stay hidden off-screen
          this.setVelocity(0, 0);
          super.update();
          return;
        }
      }

      let targetX = this.target.x;
      let targetGY = targetGroundY;

      // Apply AI-specific movement modifiers
      switch (this.aiType) {
        case "flanker":
          // Try to approach from the side
          targetX += this.flankDirection * flankerOffset;
          // Switch flank direction occasionally
          if (this.aiTimer > flankerSwitchTime) {
            this.flankDirection *= -1;
            this.aiTimer = 0;
          }
          break;
        case "erratic":
          // Add random jitter to movement
          if (this.aiTimer > erraticUpdateTime) {
            const randX = this.rng.frac();
            const randY = this.rng.frac();
            this.erraticOffset = {
              x: (randX - 0.5) * erraticJitterX,
              y: (randY - 0.5) * erraticJitterY,
            };
            this.aiTimer = 0;
          }
          targetX += this.erraticOffset.x;
          targetGY += this.erraticOffset.y;
          break;
        case "cautious":
          // Stop and wait occasionally
          if (Math.sin(this.aiTimer * 2) > 0.8) {
            this.setVelocity(0, 0);
            this.play(this.animKeys.idle, true);
            super.update();
            return;
          }
          break;
        case "ranged": {
          // Keep preferred distance from player, fire projectiles
          const rdx = this.target.x - this.x;
          const rdy = targetGroundY - this.groundY;
          const rdist = Phaser.Math.Distance.Between(
            this.x,
            this.groundY,
            this.target.x,
            targetGroundY
          );
          const preferred = aiConfig.ranged.preferred_distance;

          this.setFlipX(rdx < 0);

          if (rdist < preferred * 0.8) {
            // Too close — retreat
            const retreatAngle = Math.atan2(rdy, rdx);
            const retreatSpeed =
              this.baseSpeed * aiConfig.ranged.retreat_speed_mult;
            this.setVelocityX(-Math.cos(retreatAngle) * retreatSpeed);
            this.setVelocityY(0);
            this.groundY += -Math.sin(retreatAngle) * retreatSpeed * dt;
          } else {
            // Hold position
            this.setVelocity(0, 0);
          }

          // Fire timer
          if (this.aiTimer >= aiConfig.ranged.fire_rate) {
            this.aiTimer = 0;
            const dirX = rdx / (rdist || 1);
            const dirY = rdy / (rdist || 1);
            this.scene.events.emit("enemy_projectile_fire", {
              x: this.x,
              y: this.y,
              groundY: this.groundY,
              dirX,
              dirY,
              speed: aiConfig.ranged.projectile_speed,
              damage: aiConfig.ranged.projectile_damage,
            });
          }

          // Clamp to walkable area (both X and groundY)
          if (this.walkableArea) {
            const clamped = this.walkableArea.clampToWalkable(
              this.x,
              this.groundY
            );
            this.groundY = clamped.groundY;
            if (this.x !== clamped.x) {
              this.x = clamped.x;
              this.setVelocityX(0);
            }
          }

          this.play(this.animKeys.idle, true);
          super.update();
          return;
        }
        case "swarm": {
          // Speed boost from nearby allies (re-evaluate every 10 frames)
          const swarmConfig = aiConfig.swarm;
          this.swarmCheckCounter++;
          if (this.swarmCheckCounter >= 10) {
            this.swarmCheckCounter = 0;
            let nearbyCount = 0;
            if (this.enemyGroup) {
              for (const child of this.enemyGroup.getChildren()) {
                const ally = child as Enemy;
                if (ally === this || !ally.active || ally.hp <= 0) continue;
                if (
                  Phaser.Math.Distance.Between(
                    this.x,
                    this.groundY,
                    ally.x,
                    ally.groundY
                  ) <= swarmConfig.group_radius
                ) {
                  nearbyCount++;
                }
              }
            }
            this.swarmNearbyCount = nearbyCount;
          }
          const swarmMult = Math.min(
            swarmConfig.max_speed_mult,
            1 + this.swarmNearbyCount * swarmConfig.speed_bonus_per_ally
          );
          this.speed = this.baseSpeed * swarmConfig.speed_mult * swarmMult;
          // Fall through to default chase behavior
          break;
        }
        // "direct" and "burrower" (once triggered) — no modification, chase directly
      }

      const dx = targetX - this.x;
      const dy = targetGY - this.groundY;
      const dist = Phaser.Math.Distance.Between(
        this.x,
        this.groundY,
        targetX,
        targetGY
      );
      const angle = Math.atan2(dy, dx);

      this.setFlipX(dx < 0);

      // Use pre-computed animation keys to avoid string concat per frame
      const isAttacking =
        this.anims.isPlaying &&
        this.anims.currentAnim?.key === this.animKeys.attack;

      if (dist < this.attackRange) {
        if (!isAttacking) {
          this.play(this.animKeys.attack, true);
        }
        this.setVelocityX(0);
        this.setVelocityY(0);
      } else {
        this.setVelocityX(Math.cos(angle) * this.speed);
        this.setVelocityY(0);
        this.groundY += Math.sin(angle) * this.speed * dt;

        // Clamp to walkable area (both X and groundY)
        if (this.walkableArea) {
          const clamped = this.walkableArea.clampToWalkable(
            this.x,
            this.groundY
          );
          this.x = clamped.x;
          this.groundY = clamped.groundY;
        }

        if (!isAttacking) {
          this.play(this.animKeys.walk, true);
        }
      }
    } else {
      this.setVelocity(0, 0);
      this.play(this.animKeys.idle, true);
    }

    super.update();
  }

  public takeDamage(amount: number) {
    if (this.hp <= 0) return;
    super.takeDamage(amount);
    // Show health bar after damage applied, but not for dead enemies
    if (!this.showHealthBar && this.hp > 0 && this.hp < this.maxHp) {
      this.enableHealthBar(30, 4, -5);
    }
    if (this.hp > 0 && this.anims) {
      this.play(this.animKeys.hurt, true);
    }
  }

  protected onDie() {
    // Emit entity_death event for super charge accumulation
    this.scene.events.emit("entity_death", {
      type: this.texture.key,
      x: this.x,
      y: this.y,
    });

    // Hide health bar immediately on death (don't wait for kill delay)
    if (this.healthBar) {
      this.healthBar.setVisible(false);
    }

    if (this.anims) this.play(this.animKeys.hurt, true);
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
    y: number,
    rng: Phaser.Math.RandomDataGenerator,
    walkInTargetX?: number,
    textureKey?: string
  ) {
    this.rng = rng;
    this.setActive(true);
    this.setVisible(true);
    // Re-show shadow for recycled enemies
    if (this.shadow) {
      this.shadow.setVisible(true);
    }
    // Hide health bar until damaged
    this.showHealthBar = false;
    if (this.healthBar) {
      this.healthBar.setVisible(false);
    }

    // Re-compute animation keys for the target texture variant.
    // Phaser's Group.getFirst() does NOT apply the texture key to recycled
    // members — this.texture.key may still reference the last animation's
    // per-anim texture (e.g. "enemy_1_hurt" instead of "enemy_1"), which
    // causes invalid anim keys like "enemy_1_hurt_idle". Use the explicit
    // textureKey parameter passed by the caller instead.
    const tex = textureKey || this.texture.key;
    if (textureKey) {
      this.setTexture(textureKey);
    }
    this.animKeys = {
      idle: `${tex}_idle`,
      walk: `${tex}_walk`,
      attack: `${tex}_attack`,
      hurt: `${tex}_hurt`,
    };

    // Enable physics body FIRST so setPosition/setVelocity are not no-ops (ticket #245)
    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).enable = true;
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    }

    // Initialize groundY for 2.5D positioning
    this.groundY = y;
    this.z = 0;
    this.setPosition(x, y);
    this.hp = this.maxHp;
    this.setAlpha(1);
    this.clearTint();
    this.setVelocity(0, 0);
    this.target = undefined;

    // Reset inherited state flags (ticket #231)
    this.isKnockedBack = false;
    this.isInvincible = false;

    // Reset AI state
    this.aiTimer = 0;
    this.erraticOffset = {x: 0, y: 0};
    this.burrowerTriggered = false;
    this.burrowerEdgeX = 0;
    this.swarmNearbyCount = 0;
    this.swarmCheckCounter = 0;
    this.lastPlayerDamageTime = 0;
    this.walkableArea = this.scene.registry.get(
      "walkable_area"
    ) as WalkableArea;
    this.enemyGroup = this.scene.registry.get(
      "enemy_group"
    ) as Phaser.Physics.Arcade.Group;
    this.selectRandomAI();

    // Walk-in state: enemy walks from off-screen to target position
    // Burrower enemies skip walk-in — they stay at their edge position
    // until triggered by player proximity.
    if (this.aiType === "burrower") {
      this.enterState = "active";
    } else if (walkInTargetX !== undefined) {
      this.enterState = "walking_in";
      this.walkInTargetX = walkInTargetX;
    } else {
      this.enterState = "active";
    }
    this.anims.stop();
    this.play(this.animKeys.walk, true);
  }

  /**
   * Make the enemy flee off-screen. It walks toward the nearest edge
   * and self-destructs once off-screen (no death sound/event).
   */
  flee() {
    if (!this.active || this.enterState === "fleeing") return;
    this.enterState = "fleeing";
    this.target = undefined;
  }

  kill() {
    super.kill();
  }
}
