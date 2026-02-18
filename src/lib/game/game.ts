import Phaser from "phaser";
import {BootScene} from "./scenes/BootScene";
import {Preloader} from "./scenes/Preloader";
import {MainScene} from "./scenes/MainScene";
import {config} from "@/lib/config/client";
import {
  getDevicePerfTier,
  getEffectsMultiplier,
  isMobileDevice,
} from "@/lib/utils/mobile";

export const getGameConfig = (
  containerId: string
): Phaser.Types.Core.GameConfig => {
  const display = config.display;
  const perfTier = getDevicePerfTier();
  const isMobile = isMobileDevice();

  return {
    type: Phaser.AUTO,
    width: display.width,
    height: display.height,
    parent: containerId,
    backgroundColor: display.background_color,
    pixelArt: display.pixel_art,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    fps: {
      target: 60,
      forceSetTimeOut: false,
    },
    audio: {
      disableWebAudio: false,
    },
    input: {
      gamepad: true,
      activePointers: isMobile ? 3 : 2,
      // Prevent right-click context menu on mobile
      mouse: {
        preventDefaultDown: true,
        preventDefaultMove: true,
      },
    },
    physics: {
      default: "arcade",
      arcade: {
        gravity: {x: 0, y: 0},
        debug: false,
      },
    },
    scene: [BootScene, Preloader, MainScene],
    // Expose performance info via Phaser callbacks
    callbacks: {
      postBoot: (game: Phaser.Game) => {
        game.registry.set("perf_tier", perfTier);
        game.registry.set("effects_multiplier", getEffectsMultiplier());
        game.registry.set("is_mobile", isMobile);
      },
    },
    render: {
      pixelArt: display.pixel_art,
    },
  };
};

export const initGame = (containerId: string) => {
  return new Phaser.Game(getGameConfig(containerId));
};
