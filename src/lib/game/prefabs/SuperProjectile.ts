import Phaser from "phaser";
import {gameState} from "@/lib/game/state";
import type {Enemy} from "./Enemy";
import type {Boss} from "./Boss";
import type {ConfigTypes} from "@/types/config";

/**
 * SuperProjectile - A hadouken-style spinning coin that travels horizontally.
 * Pierces through all regular enemies (damaging each once), explodes on boss hit.
 */
export class SuperProjectile extends Phaser.Physics.Arcade.Sprite {
  private speed: number = 400;
  private maxRange: number = 800;
  private damage: number = 100;
  private direction: number = 1;
  private travelled: number = 0;
  private projectileGroundY: number = 0;
  private hasHit: boolean = false;

  // Track pierced enemies to avoid hitting the same one every frame
  private piercedEnemies: Set<Enemy> = new Set();

  // Cached config - loaded once in constructor, not per-frame
  private config: ConfigTypes;

  // Direct references to collision targets (set by MainScene for performance)
  private enemyGroup?: Phaser.Physics.Arcade.Group;
  private bossRef?: Boss;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "super");

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Cache config once - it doesn't change mid-game
    this.config = scene.registry.get("full_config") as ConfigTypes;
    const superConfig = this.config.gameplay.entities.player.super;
    this.speed = superConfig.speed;
    this.maxRange = superConfig.max_range;
    this.damage = superConfig.damage;

    // Disable arcade gravity — projectile travels horizontally
    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    }

    // Set hitbox size from config
    const hitboxConfig = superConfig.hitbox;
    this.body?.setSize(hitboxConfig.width, hitboxConfig.height);

    // Start inactive
    this.setActive(false);
    this.setVisible(false);
  }

  /**
   * Set collision targets for efficient hit detection
   * Called by MainScene to avoid per-frame scene.children.list scanning
   */
  setCollisionTargets(enemies: Phaser.Physics.Arcade.Group, boss?: Boss) {
    this.enemyGroup = enemies;
    this.bossRef = boss;
  }

  fire(x: number, y: number, groundY: number, direction: number) {
    this.setActive(true);
    this.setVisible(true);
    this.direction = direction;
    this.travelled = 0;
    this.hasHit = false;
    this.piercedEnemies.clear();
    this.projectileGroundY = groundY;

    // Use cached config
    const fireOffset =
      this.config.gameplay.entities.player.super.hitbox.fire_offset;

    // Position at player's torso height
    this.setPosition(x + direction * fireOffset, y);
    this.setFlipX(direction < 0);
    this.setDepth(groundY);

    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).enable = true;
    }

    // Play spinning animation
    if (this.scene.anims.exists("super_spin")) {
      this.play("super_spin", true);
    }
  }

  update(_time: number, delta: number) {
    if (gameState.get().isPaused) return;
    if (!this.active || this.hasHit) return;

    // Use cached config
    const offscreenMargin =
      this.config.gameplay.entities.player.super.hitbox.offscreen_margin;

    const dt = delta / 1000;
    const moveX = this.direction * this.speed * dt;
    this.x += moveX;
    this.travelled += Math.abs(moveX);

    // Despawn if past max range or off-screen
    const {width} = this.scene.cameras.main;
    if (
      this.travelled > this.maxRange ||
      this.x < -offscreenMargin ||
      this.x > width + offscreenMargin
    ) {
      this.kill();
      return;
    }

    // Check collisions with enemies and boss
    this.checkCollisions();
  }

  private checkCollisions() {
    // Use cached config
    const hitboxConfig = this.config.gameplay.entities.player.super.hitbox;
    const hitRadius = hitboxConfig.hit_radius;
    const depthThreshold = hitboxConfig.depth_threshold;

    // Pierce through enemies — damage each one once
    if (this.enemyGroup) {
      const children = this.enemyGroup.getChildren();
      for (const child of children) {
        const enemy = child as Enemy;
        if (!enemy.active || enemy.hp <= 0) continue;
        if (this.piercedEnemies.has(enemy)) continue;

        const hDist = Math.abs(this.x - enemy.x);
        const dDist = Math.abs(this.projectileGroundY - enemy.groundY);

        if (hDist < hitRadius && dDist < depthThreshold) {
          this.piercedEnemies.add(enemy);
          enemy.takeDamage(this.damage);

          // Emit pierce event for VFX and scoring (per-enemy)
          this.scene.events.emit("super_pierce", {
            x: enemy.x,
            y: enemy.y,
            killed: enemy.hp <= 0,
          });
        }
      }
    }

    // Explode on boss hit — stops the projectile
    if (this.bossRef && this.bossRef.active && this.bossRef.hp > 0) {
      const hDist = Math.abs(this.x - this.bossRef.x);
      const dDist = Math.abs(this.projectileGroundY - this.bossRef.groundY);

      if (hDist < hitRadius && dDist < depthThreshold) {
        this.hasHit = true;
        this.bossRef.takeDamage(this.damage);

        // Emit boss hit event for explosion VFX and scoring
        this.scene.events.emit("super_hit", {
          x: this.x,
          y: this.y,
          groundY: this.projectileGroundY,
        });

        this.kill();
      }
    }
  }

  kill() {
    this.setActive(false);
    this.setVisible(false);
    this.piercedEnemies.clear();
    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).enable = false;
    }
  }
}
