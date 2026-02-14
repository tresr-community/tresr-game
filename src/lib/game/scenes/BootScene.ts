import Phaser from "phaser";
import {SCENE_KEYS} from "@/lib/game/constants";
import {config} from "@/lib/config/client";
import {log} from "@/lib/utils/log";

const COMPONENT_NAME = "BootScene";

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.BOOT);
  }

  init() {
    // Store config in Phaser registry for scenes that need it via the registry pattern
    this.registry.set("full_config", config);
    this.registry.set("sprites_config", config.sprites);
    log.info(COMPONENT_NAME, "Config loaded from static import");
  }

  preload() {
    log.info(COMPONENT_NAME, "Preloading...");

    const loaderAnim = config.sprites.items.loader.anims.find(
      (a) => a.name === "idle"
    );
    if (!loaderAnim) {
      throw new Error("[FATAL] Loader idle animation not found in config");
    }

    this.load.spritesheet("loader", loaderAnim.path, {
      frameWidth: loaderAnim.frameWidth,
      frameHeight: loaderAnim.frameHeight,
    });
  }

  create() {
    log.info(COMPONENT_NAME, "Starting Preloader...");

    const loaderAnim = config.sprites.items.loader.anims.find(
      (a) => a.name === "idle"
    );
    if (!loaderAnim) {
      throw new Error("[FATAL] Loader idle animation not found in config");
    }

    this.anims.create({
      key: "loader_idle",
      frames: this.anims.generateFrameNumbers("loader", {
        start: 0,
        end: loaderAnim.frames - 1,
      }),
      frameRate: loaderAnim.frameRate,
      repeat: loaderAnim.repeat,
    });

    this.scene.start(SCENE_KEYS.PRELOADER);
  }
}
