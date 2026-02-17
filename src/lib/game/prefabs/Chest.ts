import Phaser from "phaser";
import {BaseEntity} from "./BaseEntity";
import {log} from "@/lib/utils/log";

const COMPONENT_NAME = "Chest";

export class Chest extends BaseEntity {
  private opened: boolean = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    groundY: number,
    airDrop: boolean = false
  ) {
    super(scene, x, groundY, "chest_idle");

    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).setImmovable(true);
      (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    }

    if (airDrop) {
      const ad = this.config.gameplay.entities.chest.air_drop;
      this.startAirDrop({
        disableBodyDuringFlight: true,
        landing: {
          flashColor: ad.landing_flash_color,
          flashDurationMs: ad.landing_flash_ms,
          dustColor: ad.landing_dust_color,
          dustRadius: ad.landing_dust_radius,
          dustDurationMs: ad.landing_dust_duration_ms,
          shakeDurationMs: ad.landing_shake_duration,
          shakeIntensity: ad.landing_shake_intensity,
          eventName: "chest_land",
        },
      });
    }

    if (this.scene.anims.exists("chest_idle")) {
      this.play("chest_idle", true);
    }
  }

  protected onGroundHit() {
    if (!this.active) return;
    super.onGroundHit();
    log.info(COMPONENT_NAME, "Chest landed!");
  }

  open() {
    if (this.opened) return false;
    this.opened = true;
    log.info(COMPONENT_NAME, "Chest Opened! Victory!");

    // Play open animation, then emit victory
    if (this.scene.anims.exists("chest_open")) {
      this.play("chest_open", true);
      this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        this.scene.events.emit("game_win");
      });
    } else {
      this.setTint(0x00ff00);
      this.scene.events.emit("game_win");
    }
    return true;
  }

  public kill() {
    this.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE);
    super.kill();
  }

  destroy(fromScene?: boolean) {
    this.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE);
    super.destroy(fromScene);
  }
}
