import Phaser from "phaser";
import {BaseEntity} from "./BaseEntity";
import type {Recorder} from "@/lib/game/Recorder";
import type {WalkableArea} from "@/lib/game/WalkableArea";
import {gameActions, gameState} from "@/lib/game/state";
import TouchInput from "@/lib/game/TouchInput";
import {log} from "@/lib/utils/log";

const COMPONENT_NAME = "Player";

export class Player extends BaseEntity {
  private walkableArea!: WalkableArea;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private recorder?: Recorder;

  // WASD keys (movement — used alongside arrow keys)
  private keyW: Phaser.Input.Keyboard.Key;
  private keyA: Phaser.Input.Keyboard.Key;
  private keyS: Phaser.Input.Keyboard.Key;
  private keyD: Phaser.Input.Keyboard.Key;

  // Action keys
  private keyAttack: Phaser.Input.Keyboard.Key; // J — attack (WASD scheme)
  private keyAttackAlt: Phaser.Input.Keyboard.Key; // Z — attack (arrow scheme)
  private keySuper: Phaser.Input.Keyboard.Key; // K — super (WASD scheme)
  private keySuperAlt: Phaser.Input.Keyboard.Key; // X — super (arrow scheme)
  private keySuperAlt2: Phaser.Input.Keyboard.Key; // Enter — super (universal)
  private keyJump: Phaser.Input.Keyboard.Key; // Space — jump (universal)

  private speed: number = 250;
  private jumpForce: number = 12;
  private isJumping: boolean = false;

  // Super attack config
  private superMaxCharge: number = 100;
  private isDying: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "hero_idle");

    // Use cached config from BaseEntity (set by Preloader in registry) - NO hardcoding
    const gp = this.config.gameplay;
    const playerConfig = gp.entities.player;
    this.hp = playerConfig.health;
    this.maxHp = this.hp;
    this.speed = playerConfig.speed;
    this.jumpForce = playerConfig.jump_force;
    this.superMaxCharge = playerConfig.super.max_charge;
    // gravity is read from config in BaseEntity constructor
    log.info(
      COMPONENT_NAME,
      `Config loaded: HP=${this.hp}, Speed=${this.speed}, Gravity=${this.gravity}, Jump=${this.jumpForce}`
    );

    if (this.scene.input.keyboard) {
      this.cursors = this.scene.input.keyboard.createCursorKeys();

      // WASD movement keys (alongside arrow keys from createCursorKeys)
      this.keyW = this.scene.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.W
      );
      this.keyA = this.scene.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.A
      );
      this.keyS = this.scene.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.S
      );
      this.keyD = this.scene.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.D
      );

      // Action keys — dual scheme: J/K for WASD users, Z/X for arrow users
      this.keyAttack = this.scene.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.J
      );
      this.keyAttackAlt = this.scene.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.Z
      );
      this.keySuper = this.scene.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.K
      );
      this.keySuperAlt = this.scene.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.X
      );
      this.keySuperAlt2 = this.scene.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.ENTER
      );
      this.keyJump = this.scene.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SPACE
      );
    } else {
      throw new Error("Keyboard input not available");
    }

    // Disable Arcade world bounds — Y is manually managed via groundY + Z-axis
    // physics in BaseEntity.updateZ(). Letting Arcade clamp the body Y causes
    // a one-frame position desync (ghost/double sprite). X is clamped by the
    // walkable area safety clamp that runs every frame in update().
    this.setCollideWorldBounds(false);
    // Use hitbox config from YAML
    const hitbox = this.config.gameplay.entities.player.hitbox;
    this.body?.setCircle(hitbox.radius, hitbox.offsetX, hitbox.offsetY);

    // Cache walkable area reference (set by MainScene.create before Player is constructed)
    this.walkableArea = scene.registry.get("walkable_area") as WalkableArea;
    if (!this.walkableArea) {
      throw new Error(
        "Player: walkable_area not found in scene registry. Ensure MainScene.create sets it before constructing Player."
      );
    }

    // Enable health bar for player
    this.enableHealthBar(
      playerConfig.health_bar?.width || 50,
      playerConfig.health_bar?.height || 6,
      playerConfig.health_bar?.offset_y || -5
    );
  }

  setRecorder(recorder: Recorder) {
    this.recorder = recorder;
  }

  update(dt?: number) {
    // Guard: Don't update if destroyed, inactive, or dying (ticket #228)
    if (!this.active || !this.anims) return;
    if (this.isDying) return;

    // Use cached config from BaseEntity
    const gp = this.config.gameplay;
    const playerConfig = gp.entities.player;
    const gamepadDeadzone = playerConfig.input.gamepad_deadzone;
    const speed = this.speed * this.resolutionScale;
    // Use real delta time from MainScene (falls back to reference timestep)
    const frameDt = dt ?? this.referenceDt;

    let vx = 0;
    let moveY = 0; // Depth movement (not Arcade velocity)
    let isMoving = false;

    const currentAnimKey = this.anims.currentAnim?.key;
    const isAttacking =
      this.anims.isPlaying && currentAnimKey === "hero_attack";
    const isChargingSuper =
      this.anims.isPlaying && currentAnimKey === "hero_super";
    const isHurt = this.anims.isPlaying && currentAnimKey === "hero_hurt";
    // Actions that block all movement (attack, super, hurt, knockback)
    const isBlockingAction =
      isAttacking || isChargingSuper || isHurt || this.isKnockedBack;

    // Gamepad Polling
    const pad = this.scene.input.gamepad?.getPad(0);
    const padX = pad ? pad.axes[0].getValue() : 0;
    const padY = pad ? pad.axes[1].getValue() : 0;
    const deadzone = gamepadDeadzone;

    // Touch input (ticket #174)
    const touch = TouchInput.getInstance().state;
    const touchDeadzone = playerConfig.input.touch?.joystick_deadzone ?? 0.15;

    // Allow movement while jumping, but not during blocking actions
    if (!isBlockingAction) {
      // Horizontal movement (use Arcade physics for X)
      if (
        this.cursors.left.isDown ||
        this.keyA.isDown ||
        padX < -deadzone ||
        touch.x < -touchDeadzone
      ) {
        vx = -speed;
        this.setFlipX(true);
        this.recorder?.log("move_left");
        isMoving = true;
      } else if (
        this.cursors.right.isDown ||
        this.keyD.isDown ||
        padX > deadzone ||
        touch.x > touchDeadzone
      ) {
        vx = speed;
        this.setFlipX(false);
        this.recorder?.log("move_right");
        isMoving = true;
      }

      // Vertical/Depth movement (manual - don't use Arcade for Y in 2.5D)
      // This directly modifies groundY to move on the depth plane
      if (
        this.cursors.up.isDown ||
        this.keyW.isDown ||
        padY < -deadzone ||
        touch.y < -touchDeadzone
      ) {
        moveY = -speed * frameDt;
        this.recorder?.log("move_up");
        isMoving = true;
      } else if (
        this.cursors.down.isDown ||
        this.keyS.isDown ||
        padY > deadzone ||
        touch.y > touchDeadzone
      ) {
        moveY = speed * frameDt;
        this.recorder?.log("move_down");
        isMoving = true;
      }

      // Apply horizontal velocity via Arcade, vertical via manual groundY
      this.setVelocityX(vx);
      this.setVelocityY(0); // Don't let Arcade move Y

      // Manually update groundY for depth movement, clamped to walkable area
      if (moveY !== 0) {
        const clamped = this.walkableArea.clampToWalkable(
          this.x,
          this.groundY + moveY
        );
        this.groundY = clamped.groundY;
      }

      // Jump Logic - can jump while moving
      if (
        (Phaser.Input.Keyboard.JustDown(this.keyJump) ||
          (pad && pad.buttons[0].pressed) ||
          touch.jump) &&
        !this.isJumping
      ) {
        this.jump();
      }

      // Attack Logic — check BEFORE setting idle/walk animation
      if (
        Phaser.Input.Keyboard.JustDown(this.keyAttack) ||
        Phaser.Input.Keyboard.JustDown(this.keyAttackAlt) ||
        (pad && pad.buttons[2].pressed) ||
        touch.attack
      ) {
        this.attack();
      }

      // Super Logic (K/X/Enter or RB button, requires full charge)
      else if (
        Phaser.Input.Keyboard.JustDown(this.keySuper) ||
        Phaser.Input.Keyboard.JustDown(this.keySuperAlt) ||
        Phaser.Input.Keyboard.JustDown(this.keySuperAlt2) ||
        (pad && pad.buttons[5].pressed) ||
        touch.super
      ) {
        this.superAttack();
      }

      // Animation State — only change animation if not jumping
      else if (!this.isJumping) {
        if (isMoving) {
          this.play("hero_walk", true);
        } else {
          this.play("hero_idle", true);
        }
      }
    } else {
      this.setVelocity(0, 0);
    }

    // Consume one-shot touch actions after processing
    if (touch.active) {
      TouchInput.getInstance().consumeActions();
    }

    // Always clamp to walkable bounds (safety net for knockback, spawns, etc.)
    // Covers both X (no Arcade world bounds) and groundY (depth plane).
    const clampedPos = this.walkableArea.clampToWalkable(this.x, this.groundY);
    this.x = clampedPos.x;
    this.groundY = clampedPos.groundY;

    // Update Z physics, shadow, depth, and health bar AFTER movement inputs
    super.update(dt);
  }

  private jump() {
    this.isJumping = true;
    this.vz = this.jumpForce;
    this.play("hero_jump", true);
    this.recorder?.log("jump");
  }

  protected onGroundHit() {
    this.isJumping = false;
  }

  public attack() {
    this.play("hero_attack", true);

    this.recorder?.log("attack");

    this.scene.events.emit("player_attack", this);
  }

  public superAttack() {
    // Atomic check-and-reset to prevent race between read and reset (ticket #226)
    if (!gameActions.attemptSuperAttack(this.superMaxCharge)) {
      log.debug(
        COMPONENT_NAME,
        `Super not ready: ${gameState.get().superCharge}/${this.superMaxCharge}`
      );
      return;
    }

    log.info(COMPONENT_NAME, "SUPER ATTACK ACTIVATED!");
    this.recorder?.log("super");

    this.scene.events.emit("player_super", this);
  }

  // Shadow rendering inherited from BaseEntity.updateShadow() which
  // correctly applies offset_x / offset_y from gameplay.visuals.shadow config.

  /**
   * Respawn the player at spawn location with invincibility frames (ticket #191).
   */
  public respawn() {
    const playerConfig = this.config.gameplay.entities.player;
    const {width, height} = this.scene.cameras.main;
    const spawnX = Math.round(playerConfig.spawn.x_ratio * width);
    const spawnY = Math.round(playerConfig.spawn.y_ratio * height);
    const respawnConfig = playerConfig.respawn;

    // Reset death guard and HP
    this.isDying = false;
    this.hp = this.maxHp;
    this.groundY = spawnY;
    this.z = 0;
    this.vz = 0;
    this.isJumping = false;
    this.isKnockedBack = false;
    this.setPosition(spawnX, spawnY);
    this.setVelocity(0, 0);

    // Reactivate
    this.setActive(true);
    this.setVisible(true);
    if (this.shadow) this.shadow.setVisible(true);
    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).enable = true;
    }

    // Invincibility frames — clear any existing timers from previous death (ticket #195)
    this.clearTrackedTimers();
    this.isInvincible = true;
    const blinkInterval = respawnConfig.blink_interval_ms;
    const blinkTimer = this.scene.time.addEvent({
      delay: blinkInterval,
      callback: () => {
        this.setAlpha(this.alpha === 1 ? 0.3 : 1);
      },
      loop: true,
    });
    this.trackTimer(blinkTimer);

    this.trackTimer(
      this.scene.time.delayedCall(respawnConfig.invincibility_ms, () => {
        this.isInvincible = false;
        this.setAlpha(1);
        blinkTimer.destroy();
      })
    );

    gameActions.setHp(this.hp);
    this.play("hero_idle", true);
    log.info(COMPONENT_NAME, "Player respawned with invincibility");
  }

  protected onDie() {
    if (this.isDying) return;
    this.isDying = true;

    // Sync final HP to HUD immediately — update() is skipped while isDying
    gameActions.setHp(this.hp);

    // Disable physics body during death animation (ticket #228)
    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).enable = false;
    }

    const lives = gameState.get().lives;
    if (lives > 1) {
      // Decrement lives and schedule respawn
      gameActions.decrementLives();
      const respawnDelay =
        this.config.gameplay.entities.player.respawn.delay_ms;
      this.play("hero_hurt", true);
      this.setVelocity(0, 0);

      // Brief death animation, then respawn
      this.trackTimer(
        this.scene.time.delayedCall(respawnDelay, () => {
          this.respawn();
        })
      );
      log.info(COMPONENT_NAME, `Player died, ${lives - 1} lives remaining`);
    } else {
      // Final death — game over
      gameActions.setLives(0);
      this.scene.events.emit("player_death", this);
      super.onDie();
    }
  }
}
