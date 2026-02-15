import Phaser from "phaser";
import {BaseEntity} from "./BaseEntity";
import type {WalkableArea} from "@/lib/game/WalkableArea";
import {gameState} from "@/lib/game/state";
import {log} from "@/lib/utils/log";

const COMPONENT_NAME = "Boss";

export class Boss extends BaseEntity {
  private target?: Phaser.GameObjects.Components.Transform;
  private bossState: "descending" | "fighting" | "defeated" = "descending";
  private speed: number = 150;
  private baseSpeed: number = 150;
  private attackRange: number = 60;
  private baseAttackRange: number = 60;
  private descendThreshold: number = 300;
  private isDefeated: boolean = false;
  private rng: Phaser.Math.RandomDataGenerator;

  // Phase system
  private bossPhase: 1 | 2 = 1;
  private damageMult: number = 1;

  // Attack system
  private attackState: "chasing" | "windup" | "attacking" | "cooldown" =
    "chasing";
  private attackTimer: number = 0;
  private currentAttack: "ground_pound" | "charge" | "summon" | null = null;
  private attackDurationTimer: number = 0;
  private chargeDirection: {x: number; y: number} = {x: 0, y: 0};

  // Pre-computed animation keys (boss texture is always "boss")
  private walkableArea?: WalkableArea;

  private readonly animKeys = {
    idle: "boss_idle",
    walk: "boss_walk",
    attack: "boss_attack",
    hurt: "boss_hurt",
  };

  constructor(
    scene: Phaser.Scene,
    x: number,
    rng: Phaser.Math.RandomDataGenerator
  ) {
    // Load spawn config - need to get config before super() to set startY
    const preConfig = scene.registry.get("full_config");
    const bossConfig = preConfig.gameplay.entities.boss;
    const startY = bossConfig.descent.start_y;
    super(scene, x, startY, "boss"); // Start above screen
    this.rng = rng;
    this.groundY = startY; // Initialize groundY for 2.5D
    this.descendThreshold = Math.round(
      bossConfig.descent.threshold_ratio * scene.cameras.main.height
    );

    // Use cached config from BaseEntity - NO hardcoding
    this.hp = bossConfig.health;
    this.maxHp = this.hp;
    this.baseSpeed = bossConfig.speed;
    this.speed = this.baseSpeed;
    this.baseAttackRange = bossConfig.combat.attack_range;
    this.attackRange = this.baseAttackRange;

    // Disable Arcade physics entirely — boss uses manual 2.5D movement.
    // Attack range is distance-based, not collider-based.
    if (this.body) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.enable = false;
    }

    // Cache walkable area reference
    this.walkableArea = scene.registry.get("walkable_area") as WalkableArea;

    // Enable large health bar for boss
    this.enableHealthBar(80, 8, -10);
  }

  setTarget(target: Phaser.GameObjects.Components.Transform) {
    this.target = target;
  }

  /** Get current effective attack range (larger during charge) */
  public getAttackRange(): number {
    return this.attackRange;
  }

  /** Get current contact damage (scaled by phase multiplier) */
  public getContactDamage(): number {
    const baseDamage = this.config.gameplay.entities.boss.damage;
    if (this.currentAttack === "charge") {
      return (
        this.config.gameplay.entities.boss.attacks.charge.damage *
        this.damageMult
      );
    }
    return baseDamage * this.damageMult;
  }

  update() {
    if (gameState.get().isPaused) return;
    if (!this.active || !this.anims || this.hp <= 0) return;

    const gp = this.config.gameplay;
    const dt = gp.physics.timestep;
    const bossConfig = gp.entities.boss;
    const descentSpeed = bossConfig.descent.speed;

    if (this.bossState === "descending") {
      this.groundY += descentSpeed;
      this.play(this.animKeys.idle, true);
      if (this.groundY >= this.descendThreshold) {
        this.bossState = "fighting";
      }
    } else if (this.bossState === "fighting") {
      // Accumulate attack timer
      this.attackTimer += dt;

      // Get cooldown (reduced in phase 2)
      const globalCooldown = bossConfig.attack_cooldown_ms / 1000;
      const cooldownMult =
        this.bossPhase === 2 ? 1 / bossConfig.phases.phase2_speed_mult : 1;

      switch (this.attackState) {
        case "chasing":
          this.updateChase(dt);
          // Check if ready to attack
          if (this.attackTimer >= globalCooldown * cooldownMult) {
            this.selectAttack();
          }
          break;

        case "windup":
          // Standing still during telegraph
          this.attackDurationTimer -= dt;
          this.play(this.animKeys.attack, true); // Telegraph with attack anim
          if (this.attackDurationTimer <= 0) {
            this.executeAttack();
          }
          break;

        case "attacking":
          this.attackDurationTimer -= dt;
          this.updateCurrentAttack(dt);
          if (this.attackDurationTimer <= 0) {
            this.finishAttack();
          }
          break;

        case "cooldown":
          this.attackDurationTimer -= dt;
          this.updateChase(dt);
          if (this.attackDurationTimer <= 0) {
            this.attackState = "chasing";
          }
          break;
      }
    }

    // Update visual Y from groundY and Z height
    this.y = this.groundY - this.z;

    // Update depth, shadow, and health bar
    this.setDepth(this.groundY);
    this.updateShadow();
    this.updateHealthBar();
  }

  /** Standard chase behavior — extracted for reuse */
  private updateChase(dt: number) {
    if (!this.target) return;

    const speed = this.speed;
    const targetGroundY =
      "groundY" in this.target
        ? (this.target as BaseEntity).groundY
        : this.target.y;

    const dx = this.target.x - this.x;
    const dy = targetGroundY - this.groundY;
    const dist = Phaser.Math.Distance.Between(
      this.x,
      this.groundY,
      this.target.x,
      targetGroundY
    );
    const angle = Math.atan2(dy, dx);

    this.setFlipX(dx < 0);

    const isAttacking =
      this.anims.isPlaying &&
      this.anims.currentAnim?.key === this.animKeys.attack;

    if (dist < this.baseAttackRange) {
      if (!isAttacking) {
        this.play(this.animKeys.attack, true);
      }
    } else {
      this.x += Math.cos(angle) * speed * dt;
      this.groundY += Math.sin(angle) * speed * dt;

      if (this.walkableArea) {
        const clamped = this.walkableArea.clampToWalkable(this.x, this.groundY);
        this.x = clamped.x;
        this.groundY = clamped.groundY;
      }

      if (!isAttacking) {
        this.play(this.animKeys.walk, true);
      }
    }
  }

  /** Pick a random special attack */
  private selectAttack() {
    if (!this.target) return;
    const attacks: ("ground_pound" | "charge" | "summon")[] = [
      "ground_pound",
      "charge",
      "summon",
    ];
    // Seeded random pick for replay determinism (ticket #194)
    this.currentAttack =
      attacks[this.rng.integerInRange(0, attacks.length - 1)];
    this.attackTimer = 0;

    const bossConfig = this.config.gameplay.entities.boss;

    switch (this.currentAttack) {
      case "ground_pound":
        this.attackState = "windup";
        this.attackDurationTimer =
          bossConfig.attacks.ground_pound.windup_ms / 1000;
        this.scene.events.emit("boss_ground_pound_windup", {
          x: this.x,
          y: this.groundY,
        });
        break;
      case "charge": {
        // Lock direction toward player at start
        const targetGY =
          "groundY" in this.target
            ? (this.target as BaseEntity).groundY
            : this.target.y;
        const dx = this.target.x - this.x;
        const dy = targetGY - this.groundY;
        const dist =
          Phaser.Math.Distance.Between(
            this.x,
            this.groundY,
            this.target.x,
            targetGY
          ) || 1;
        this.chargeDirection = {x: dx / dist, y: dy / dist};
        this.attackState = "attacking";
        this.attackDurationTimer = bossConfig.attacks.charge.duration_ms / 1000;
        this.attackRange = this.baseAttackRange * bossConfig.charge_range_mult;
        break;
      }
      case "summon":
        this.attackState = "attacking";
        this.attackDurationTimer = bossConfig.summon_pause_s;
        this.play(this.animKeys.idle, true);
        this.scene.events.emit("boss_summon", {
          x: this.x,
          y: this.groundY,
          count: bossConfig.attacks.summon.count,
        });
        break;
    }
  }

  /** Execute attack after windup completes */
  private executeAttack() {
    const bossConfig = this.config.gameplay.entities.boss;

    if (this.currentAttack === "ground_pound") {
      this.attackState = "cooldown";
      this.attackDurationTimer =
        bossConfig.attacks.ground_pound.cooldown_ms / 1000;
      this.scene.events.emit("boss_ground_pound", {
        x: this.x,
        y: this.groundY,
        radius: bossConfig.attacks.ground_pound.radius,
        damage: bossConfig.attacks.ground_pound.damage * this.damageMult,
      });
    }
  }

  /** Run per-frame logic for the current attack */
  private updateCurrentAttack(dt: number) {
    const bossConfig = this.config.gameplay.entities.boss;

    if (this.currentAttack === "charge") {
      const chargeSpeed = this.baseSpeed * bossConfig.attacks.charge.speed_mult;
      this.x += this.chargeDirection.x * chargeSpeed * dt;
      this.groundY += this.chargeDirection.y * chargeSpeed * dt;

      // Clamp to walkable area
      if (this.walkableArea) {
        const clamped = this.walkableArea.clampToWalkable(this.x, this.groundY);
        this.x = clamped.x;
        this.groundY = clamped.groundY;
      }

      this.play(this.animKeys.attack, true);
      this.setFlipX(this.chargeDirection.x < 0);
    }
  }

  /** Clean up after attack ends */
  private finishAttack() {
    const bossConfig = this.config.gameplay.entities.boss;

    if (this.currentAttack === "charge") {
      this.attackRange = this.baseAttackRange;
      this.attackState = "cooldown";
      this.attackDurationTimer = bossConfig.attacks.charge.cooldown_ms / 1000;
    } else if (this.currentAttack === "summon") {
      this.attackState = "cooldown";
      this.attackDurationTimer = bossConfig.attacks.summon.cooldown_ms / 1000;
    } else {
      this.attackState = "chasing";
    }
    this.currentAttack = null;
  }

  /** Override: boss uses manual position displacement since physics body is disabled */
  public applyKnockback(attackerX: number, force: number, stunMs: number) {
    if (!this.active || this.hp <= 0) return;
    if (this.bossState === "descending") return;

    const dir = this.x >= attackerX ? 1 : -1;
    this.x += dir * force * 0.5;

    // Clamp to walkable bounds
    if (this.walkableArea) {
      const clamped = this.walkableArea.clampToWalkable(this.x, this.groundY);
      this.x = clamped.x;
    }

    this.isKnockedBack = true;
    this.trackTimer(
      this.scene.time.delayedCall(stunMs, () => {
        if (this.active) {
          this.isKnockedBack = false;
        }
      })
    );
  }

  public takeDamage(amount: number) {
    if (this.isDefeated || this.bossState === "defeated") return;
    if (this.bossState === "descending") return;

    const hpBefore = this.hp;
    super.takeDamage(amount);
    if (this.hp === hpBefore) return; // Blocked by invincibility or already dead

    // Phase 2 transition
    if (this.bossPhase === 1) {
      const phases = this.config.gameplay.entities.boss.phases;
      if (this.hp / this.maxHp <= phases.enrage_threshold) {
        this.bossPhase = 2;
        this.speed = this.baseSpeed * phases.phase2_speed_mult;
        this.damageMult = phases.phase2_damage_mult;
        // Red flash to indicate enrage
        this.setTint(0xff0000);
        this.trackTimer(
          this.scene.time.delayedCall(
            this.config.gameplay.entities.boss.enrage_flash_ms,
            () => {
              if (this.active) this.clearTint();
            }
          )
        );
        log.info(COMPONENT_NAME, "Boss entered Phase 2!");
      }
    }

    if (this.hp > 0 && this.anims) {
      this.play(this.animKeys.hurt, true);
    }
  }

  protected onDie() {
    this.isDefeated = true;
    this.bossState = "defeated";
    this.onDefeated();
  }

  private onDefeated() {
    log.info(COMPONENT_NAME, "Gary has been regulated!");
    if (this.anims) this.play(this.animKeys.hurt, true);
    this.setAlpha(this.config.gameplay.entities.boss.defeated_alpha);

    // Trigger events
    this.scene.events.emit("entity_death", {
      type: "boss",
      x: this.x,
      y: this.y,
    });
    this.scene.events.emit("boss_defeated");

    const deathDelay =
      this.config.gameplay.entities.boss.animations.death_delay;
    this.trackTimer(
      this.scene.time.delayedCall(deathDelay, () => {
        if (this.active) {
          this.kill();
        }
      })
    );
  }

  kill() {
    super.kill();
  }
}
