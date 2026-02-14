import Phaser from "phaser";
import {BootScene} from "./scenes/BootScene";
import {Preloader} from "./scenes/Preloader";
import {MainScene} from "./scenes/MainScene";
import {config} from "@/lib/config/client";

export const getGameConfig = (
  containerId: string
): Phaser.Types.Core.GameConfig => {
  const display = config.display;

  return {
    type: Phaser.AUTO,
    width: display.width,
    height: display.height,
    parent: containerId,
    backgroundColor: display.background_color,
    pixelArt: display.pixel_art,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: {
      gamepad: true,
    },
    physics: {
      default: "arcade",
      arcade: {
        gravity: {x: 0, y: 0},
        debug: false,
      },
    },
    scene: [BootScene, Preloader, MainScene],
  };
};

export const initGame = (containerId: string) => {
  return new Phaser.Game(getGameConfig(containerId));
};
