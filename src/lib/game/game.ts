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
    clearBeforeRender: false,
    powerPreference: "high-performance",
    antialias: false,
    antialiasGL: false,
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
      // Capture all game keys at the Phaser level so their keydown events get
      // preventDefault() called — this stops characters leaking to the browser
      // address bar, DevTools console, or any focussed HTML element outside the
      // canvas. This is the global allowlist; per-scene addCapture() supplements
      // but does NOT call preventDefault() on its own.
      keyboard: {
        capture: [
          Phaser.Input.Keyboard.KeyCodes.UP,
          Phaser.Input.Keyboard.KeyCodes.DOWN,
          Phaser.Input.Keyboard.KeyCodes.LEFT,
          Phaser.Input.Keyboard.KeyCodes.RIGHT,
          Phaser.Input.Keyboard.KeyCodes.W,
          Phaser.Input.Keyboard.KeyCodes.A,
          Phaser.Input.Keyboard.KeyCodes.S,
          Phaser.Input.Keyboard.KeyCodes.D,
          Phaser.Input.Keyboard.KeyCodes.SPACE,
          Phaser.Input.Keyboard.KeyCodes.ENTER,
          Phaser.Input.Keyboard.KeyCodes.Z,
          Phaser.Input.Keyboard.KeyCodes.X,
          Phaser.Input.Keyboard.KeyCodes.J,
          Phaser.Input.Keyboard.KeyCodes.K,
          Phaser.Input.Keyboard.KeyCodes.ESC,
          Phaser.Input.Keyboard.KeyCodes.TAB,
        ],
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

        // Prevent WebAudio from suspending.
        // When enabled this caused SFX stacking on focus return.
        game.sound.pauseOnBlur = false;

        // Re-focus canvas whenever the browser window regains focus so key
        // capture resumes immediately and the OS key-repeat delay (~250-500 ms)
        // doesn't fire on the very first keypress after alt-tab / task switch.
        window.addEventListener("focus", () => {
          game.canvas.focus();
        });
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
