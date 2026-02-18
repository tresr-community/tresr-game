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
  | "swarm"
  | "passive"
  | "retardio";

export class Enemy extends BaseEntity {
  private target?: Phaser.GameObjects.Components.Transform;
  private speed: number = 100;
  private baseSpeed: number = 100;
  private attackRange: number = 40;
  private aiType: EnemyAIType = "direct";
  private aiTimer: number = 0;
  private flankDirection: number = 1;
  private erraticOffset: {x: number; y: number} = {x: 0, y: 0};
  private rng!: Phaser.Math.RandomDataGenerator;
  private walkableArea?: WalkableArea;
  private enemyGroup?: Phaser.Physics.Arcade.Group;
  private swarmNearbyCount: number = 0;
  private swarmCheckCounter: number = 0;
  private swarmRushing: boolean = false;

  // Flanker AI state — orbit → lunge → recover
  private flankerPhase: "orbiting" | "lunging" | "recovering" = "orbiting";
  private flankerOrbitAngle: number = 0;

  // Passive AI state
  private passiveDirection: number = 1; // 1 = right, -1 = left
  private provoked: boolean = false;

  // Retardio AI state — targets other enemies instead of the player
  private retardioTarget?: Enemy;
  private retardioTimer: number = 0;

  // Cautious AI state
  private cautiousCharging: boolean = false;
  private cautiousCheckCounter: number = 0;
  private cautiousNearbyCount: number = 0;
  private cautiousStrafeDir: number = 1;
  private cautiousStrafeTimer: number = 0;

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
    texture: string = "enemy_1_idle"
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
    // Strip _idle suffix from texture if present to get base entity key
    const baseKey = texture.replace(/_idle$/, "");
    this.animKeys = {
      idle: `${baseKey}_idle`,
      walk: `${baseKey}_walk`,
      attack: `${baseKey}_attack`,
      hurt: `${baseKey}_hurt`,
    };
  }

  setTarget(target: Phaser.GameObjects.Components.Transform) {
    this.target = target;
  }

  /** @deprecated Use spawn(x, y, rng) instead */
  setRng(rng: Phaser.Math.RandomDataGenerator) {
    this.rng = rng;
  }

  /** Play animation only if it exists — prevents infinite Phaser warnings
   *  that lock the browser when a texture failed to load or had 0 frames. */
  private safePlay(key: string, ignoreIfPlaying: boolean = true): void {
    if (this.scene.anims.exists(key)) {
      this.play(key, ignoreIfPlaying);
    }
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
      ["swarm", weights.swarm],
      ["passive", weights.passive],
      ["retardio", weights.retardio],
    ];
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    if (totalWeight <= 0) {
      this.aiType = "direct";
      this.flankDirection = this.rng.frac() < 0.5 ? 1 : -1;
      return;
    }
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
        break;
      case "erratic":
        this.speed = this.baseSpeed * aiConfig.erratic.speed_mult;
        break;
      case "flanker":
        this.speed = this.baseSpeed * aiConfig.flanker.speed_mult;
        break;
      case "swarm":
        this.speed = this.baseSpeed * aiConfig.swarm.speed_mult;
        break;
      case "passive": {
        this.speed = this.baseSpeed * aiConfig.passive.speed_mult;
        this.provoked = false;
        // Pick random walk direction
        this.passiveDirection = this.rng.frac() < 0.5 ? 1 : -1;
        // Higher HP for passive enemies
        const hpMult = aiConfig.passive.hp_mult ?? 1.5;
        this.hp = Math.round(this.maxHp * hpMult);
        this.maxHp = this.hp;
        break;
      }
      case "retardio": {
        // Erratic speed, targets other enemies
        this.speed = this.baseSpeed * (aiConfig.retardio?.speed_mult ?? 1.1);
        this.retardioTarget = undefined;
        this.retardioTimer = 0;
        break;
      }
      default:
        this.speed = this.baseSpeed;
    }
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
    const aiConfig = gp.entities.enemy.ai;
    // Use real delta time from MainScene (falls back to reference timestep)
    const frameDt = dt ?? BaseEntity.REFERENCE_DT;

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
      this.safePlay(this.animKeys.walk, true);
      super.update(dt);
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
      this.safePlay(this.animKeys.walk, true);
      // Kill once off-screen
      if (this.x < -50 || this.x > width + 50) {
        this.kill();
        return;
      }
      super.update(dt);
      return;
    }

    this.aiTimer += frameDt;

    // --- Passive AI: Walk across screen, ignore player unless provoked ---
    if (this.aiType === "passive" && !this.provoked) {
      const {width} = this.scene.cameras.main;
      this.setFlipX(this.passiveDirection < 0);
      this.setVelocityX(this.passiveDirection * this.speed);
      this.setVelocityY(0);
      this.safePlay(this.animKeys.walk, true);

      // Walk off-screen → self-destruct (no kill event, just disappears)
      if (this.x < -50 || this.x > width + 50) {
        this.kill();
        return;
      }

      // Clamp to walkable area
      if (this.walkableArea) {
        const clamped = this.walkableArea.clampToWalkable(this.x, this.groundY);
        this.x = clamped.x;
        this.groundY = clamped.groundY;
      }

      super.update(dt);
      return;
    }

    // --- Retardio AI: Chase and attack other enemies (not the player) ---
    if (this.aiType === "retardio") {
      const retDt = frameDt;
      const aiConfig = this.config.gameplay.entities.enemy.ai;
      const jitterTime = aiConfig.retardio?.jitter_time ?? 0.3;

      // Re-pick target every few seconds or if current target is dead
      this.retardioTimer += retDt;
      if (
        !this.retardioTarget ||
        !this.retardioTarget.active ||
        this.retardioTarget.hp <= 0 ||
        this.retardioTimer > (aiConfig.retardio?.retarget_time ?? 4)
      ) {
        this.retardioTimer = 0;
        this.retardioTarget = this.findNearestEnemy();
      }

      if (this.retardioTarget) {
        const targetGY = this.retardioTarget.groundY ?? this.retardioTarget.y;
        // Add some erratic jitter
        if (this.aiTimer > jitterTime) {
          this.erraticOffset = {
            x: (this.rng.frac() - 0.5) * 80,
            y: (this.rng.frac() - 0.5) * 40,
          };
          this.aiTimer = 0;
        }
        const tX = this.retardioTarget.x + this.erraticOffset.x;
        const tGY = targetGY + this.erraticOffset.y;
        const dx = tX - this.x;
        const dy = tGY - this.groundY;
        const dist = Phaser.Math.Distance.Between(
          this.x,
          this.groundY,
          tX,
          tGY
        );
        const angle = Math.atan2(dy, dx);
        this.setFlipX(dx < 0);

        if (dist < this.attackRange) {
          // Punch the other enemy
          this.safePlay(this.animKeys.attack, true);
          this.setVelocityX(0);
          this.setVelocityY(0);
          // Actually deal damage to the target enemy
          if (this.retardioTarget.active && this.retardioTarget.hp > 0) {
            // Damage every ~0.5s
            if (this.retardioTimer > 0.5 || this.retardioTimer === 0) {
              this.retardioTarget.takeDamage(
                aiConfig.retardio?.attack_damage ?? 10
              );
              this.retardioTimer = 0;
            }
          }
        } else {
          this.setVelocityX(Math.cos(angle) * this.speed);
          this.setVelocityY(0);
          this.groundY += Math.sin(angle) * this.speed * retDt;
          if (this.walkableArea) {
            const clamped = this.walkableArea.clampToWalkable(
              this.x,
              this.groundY
            );
            this.x = clamped.x;
            this.groundY = clamped.groundY;
          }
          this.safePlay(this.animKeys.walk, true);
        }
      } else {
        // No enemies nearby — wander erratically (timer-gated like erratic AI)
        if (this.aiTimer > jitterTime) {
          this.setFlipX(this.rng.frac() < 0.5);
          this.setVelocityX((this.rng.frac() - 0.5) * this.speed);
          this.aiTimer = 0;
        }
        this.setVelocityY(0);
        this.safePlay(this.animKeys.walk, true);
      }

      super.update(dt);
      return;
    }

    if (this.target) {
      const chaseDt = frameDt;

      // Calculate direction to target's ground position
      const targetGroundY =
        "groundY" in this.target
          ? (this.target as BaseEntity).groundY
          : this.target.y;

      let targetX = this.target.x;
      let targetGY = targetGroundY;

      // Apply AI-specific movement modifiers
      switch (this.aiType) {
        case "flanker": {
          const flankerConfig = aiConfig.flanker;
          const orbitRadius = flankerConfig.offset;

          if (this.flankerPhase === "orbiting") {
            // Circle around the player at orbit radius
            this.flankerOrbitAngle += chaseDt * 2; // ~2 rad/s orbit speed
            const orbitX =
              this.target.x +
              Math.cos(this.flankerOrbitAngle) *
                orbitRadius *
                this.flankDirection;
            const orbitGY =
              targetGroundY +
              Math.sin(this.flankerOrbitAngle) * (orbitRadius * 0.4); // squished ellipse for 2.5D

            const dxOrbit = orbitX - this.x;
            const dyOrbit = orbitGY - this.groundY;
            const orbitAngle = Math.atan2(dyOrbit, dxOrbit);

            this.setFlipX(this.target.x < this.x);
            this.setVelocityX(Math.cos(orbitAngle) * this.speed);
            this.setVelocityY(0);
            this.groundY += Math.sin(orbitAngle) * this.speed * chaseDt;

            if (this.walkableArea) {
              const clamped = this.walkableArea.clampToWalkable(
                this.x,
                this.groundY
              );
              this.x = clamped.x;
              this.groundY = clamped.groundY;
            }

            this.safePlay(this.animKeys.walk, true);

            // Transition to lunge after orbit_time
            if (this.aiTimer > flankerConfig.orbit_time) {
              this.flankerPhase = "lunging";
              this.aiTimer = 0;
              this.speed = this.baseSpeed * flankerConfig.lunge_speed_mult;
            }
            super.update(dt);
            return;
          }

          if (this.flankerPhase === "lunging") {
            // Dash straight at the player
            // targetX/targetGY already point at the player — fall through to chase
            if (this.aiTimer > flankerConfig.lunge_duration) {
              this.flankerPhase = "recovering";
              this.aiTimer = 0;
              this.speed = this.baseSpeed * flankerConfig.speed_mult;
            }
            // Fall through to normal chase with boosted speed
            break;
          }

          if (this.flankerPhase === "recovering") {
            // Back away from the player
            const retreatAngle = Math.atan2(
              this.groundY - targetGroundY,
              this.x - this.target.x
            );
            this.setFlipX(this.target.x < this.x);
            this.setVelocityX(Math.cos(retreatAngle) * this.speed);
            this.setVelocityY(0);
            this.groundY += Math.sin(retreatAngle) * this.speed * chaseDt;

            if (this.walkableArea) {
              const clamped = this.walkableArea.clampToWalkable(
                this.x,
                this.groundY
              );
              this.x = clamped.x;
              this.groundY = clamped.groundY;
            }

            this.safePlay(this.animKeys.walk, true);

            if (this.aiTimer > flankerConfig.recovery_time) {
              this.flankerPhase = "orbiting";
              this.aiTimer = 0;
              this.speed = this.baseSpeed * flankerConfig.speed_mult;
            }
            super.update(dt);
            return;
          }
          break;
        }
        case "erratic": {
          // Continuous sine-wave zigzag — snake toward the player
          const erraticConfig = aiConfig.erratic;
          const lateralOffset =
            Math.sin(
              this.aiTimer * erraticConfig.zigzag_frequency * Math.PI * 2
            ) * erraticConfig.zigzag_amplitude;

          // Perpendicular offset: rotate the direction-to-player by 90°
          const dxToPlayer = this.target.x - this.x;
          const dyToPlayer = targetGroundY - this.groundY;
          const distToP = Math.sqrt(
            dxToPlayer * dxToPlayer + dyToPlayer * dyToPlayer
          );
          if (distToP > 1) {
            // Unit perpendicular vector (rotated 90°)
            const perpX = -dyToPlayer / distToP;
            const perpGY = dxToPlayer / distToP;
            targetX = this.target.x + perpX * lateralOffset;
            targetGY = targetGroundY + perpGY * lateralOffset;
          }
          break;
        }
        case "cautious": {
          // Strafe laterally when solo, charge with pack
          const cautiousConfig = aiConfig.cautious;
          const distToPlayer = Phaser.Math.Distance.Between(
            this.x,
            this.groundY,
            this.target.x,
            targetGroundY
          );

          // Count nearby allies every 10 frames
          this.cautiousCheckCounter++;
          if (this.cautiousCheckCounter >= 10) {
            this.cautiousCheckCounter = 0;
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
                  ) <= cautiousConfig.group_radius
                ) {
                  nearbyCount++;
                }
              }
            }
            this.cautiousNearbyCount = nearbyCount;

            // Toggle charge state based on ally count
            if (
              this.cautiousNearbyCount >= cautiousConfig.pack_threshold &&
              !this.cautiousCharging
            ) {
              this.cautiousCharging = true;
              this.speed = this.baseSpeed * cautiousConfig.charge_speed_mult;
            } else if (
              this.cautiousNearbyCount < cautiousConfig.pack_threshold &&
              this.cautiousCharging
            ) {
              this.cautiousCharging = false;
              this.speed = this.baseSpeed * cautiousConfig.strafe_speed_mult;
            }
          }

          // When not charging: strafe laterally at preferred distance
          if (!this.cautiousCharging) {
            const preferred = cautiousConfig.preferred_distance;

            // Flip strafe direction periodically
            this.cautiousStrafeTimer += chaseDt;
            if (this.cautiousStrafeTimer > cautiousConfig.strafe_switch_time) {
              this.cautiousStrafeDir *= -1;
              this.cautiousStrafeTimer = 0;
            }

            if (distToPlayer < preferred * 0.7) {
              // Too close — actively retreat
              const retreatAngle = Math.atan2(
                this.groundY - targetGroundY,
                this.x - this.target.x
              );
              this.setFlipX(this.target.x < this.x);
              this.setVelocityX(Math.cos(retreatAngle) * this.speed);
              this.setVelocityY(0);
              this.groundY += Math.sin(retreatAngle) * this.speed * chaseDt;

              if (this.walkableArea) {
                const clamped = this.walkableArea.clampToWalkable(
                  this.x,
                  this.groundY
                );
                this.x = clamped.x;
                this.groundY = clamped.groundY;
              }

              this.safePlay(this.animKeys.walk, true);
              super.update(dt);
              return;
            } else if (distToPlayer <= preferred * 1.3) {
              // Within strafe zone — move laterally (perpendicular to player)
              const dxP = this.target.x - this.x;
              const dyP = targetGroundY - this.groundY;
              const dP = Math.sqrt(dxP * dxP + dyP * dyP);
              if (dP > 1) {
                const perpX = (-dyP / dP) * this.cautiousStrafeDir;
                const perpGY = (dxP / dP) * this.cautiousStrafeDir;
                this.setFlipX(this.target.x < this.x);
                this.setVelocityX(perpX * this.speed);
                this.setVelocityY(0);
                this.groundY += perpGY * this.speed * chaseDt;

                if (this.walkableArea) {
                  const clamped = this.walkableArea.clampToWalkable(
                    this.x,
                    this.groundY
                  );
                  this.x = clamped.x;
                  this.groundY = clamped.groundY;
                }
              }

              this.safePlay(this.animKeys.walk, true);
              super.update(dt);
              return;
            }
            // Too far — creep closer (fall through to normal chase)
          }
          // If charging or too far, fall through to normal chase behavior
          break;
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

            // Rush activation: apply/clear tint when threshold crossed
            if (
              this.swarmNearbyCount >= swarmConfig.rush_threshold &&
              !this.swarmRushing
            ) {
              this.swarmRushing = true;
              this.setTint(swarmConfig.rush_tint);
            } else if (
              this.swarmNearbyCount < swarmConfig.rush_threshold &&
              this.swarmRushing
            ) {
              this.swarmRushing = false;
              this.clearTint();
            }
          }
          const swarmMult = Math.min(
            swarmConfig.max_speed_mult,
            1 + this.swarmNearbyCount * swarmConfig.speed_bonus_per_ally
          );
          this.speed = this.baseSpeed * swarmConfig.speed_mult * swarmMult;
          // Fall through to default chase behavior
          break;
        }
        // "direct", "passive" (provoked), "retardio" (handled above) — no modification
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
          this.safePlay(this.animKeys.attack, true);
        }
        this.setVelocityX(0);
        this.setVelocityY(0);
      } else {
        this.setVelocityX(Math.cos(angle) * this.speed);
        this.setVelocityY(0);
        this.groundY += Math.sin(angle) * this.speed * chaseDt;

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
          this.safePlay(this.animKeys.walk, true);
        }
      }
    } else {
      this.setVelocity(0, 0);
      this.safePlay(this.animKeys.idle, true);
    }

    super.update(dt);
  }

  public takeDamage(amount: number) {
    if (this.hp <= 0) return;

    // Passive enemies become provoked when attacked
    if (this.aiType === "passive" && !this.provoked) {
      this.provoked = true;
      const aiConfig = this.config.gameplay.entities.enemy.ai;
      this.speed = this.baseSpeed * aiConfig.passive.provoked_speed_mult;
    }

    super.takeDamage(amount);
    // Show health bar after damage applied, but not for dead enemies
    if (!this.showHealthBar && this.hp > 0 && this.hp < this.maxHp) {
      this.enableHealthBar(30, 4, -5);
    }
    if (this.hp > 0 && this.anims) {
      this.safePlay(this.animKeys.hurt, true);
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

    if (this.anims) this.safePlay(this.animKeys.hurt, true);
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
    this.animKeys = {
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
    this.provoked = false;
    this.passiveDirection = 1;
    this.retardioTarget = undefined;
    this.retardioTimer = 0;
    this.cautiousCharging = false;
    this.cautiousCheckCounter = 0;
    this.cautiousNearbyCount = 0;
    this.cautiousStrafeDir = this.rng?.frac() < 0.5 ? 1 : -1;
    this.cautiousStrafeTimer = 0;
    this.swarmNearbyCount = 0;
    this.swarmCheckCounter = 0;
    this.swarmRushing = false;
    this.flankerPhase = "orbiting";
    this.flankerOrbitAngle = this.rng ? this.rng.frac() * Math.PI * 2 : 0;
    this.lastPlayerDamageTime = 0;
    this.walkableArea = this.scene.registry.get(
      "walkable_area"
    ) as WalkableArea;
    this.enemyGroup = this.scene.registry.get(
      "enemy_group"
    ) as Phaser.Physics.Arcade.Group;
    this.selectRandomAI();

    // Walk-in state: enemy walks from off-screen to target position
    if (walkInTargetX !== undefined) {
      this.enterState = "walking_in";
      this.walkInTargetX = walkInTargetX;
    } else {
      this.enterState = "active";
    }
    this.anims.stop();
    this.safePlay(this.animKeys.walk, true);
  }

  /**
   * Find the nearest living enemy (for retardio AI targeting).
   * Excludes self and other retardio enemies.
   */
  private findNearestEnemy(): Enemy | undefined {
    if (!this.enemyGroup) return undefined;
    let nearest: Enemy | undefined;
    let nearestDist = Infinity;
    for (const child of this.enemyGroup.getChildren()) {
      const e = child as Enemy;
      if (e === this || !e.active || e.hp <= 0) continue;
      if (e.aiType === "retardio") continue; // don't target other retardios
      const d = Phaser.Math.Distance.Between(
        this.x,
        this.groundY,
        e.x,
        e.groundY
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearest = e;
      }
    }
    return nearest;
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
