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
import {gameState, gameActions} from "@/lib/game/state";

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
      // Capture touch events as non-passive so Phaser can call
      // preventDefault() without the browser warning about passive listeners.
      // Without this, every jump button press produces:
      // "Unable to preventDefault inside passive event listener invocation."
      touch: {
        capture: true,
      },
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
          const state = gameState.get();
          // Only forcibly re-focus the canvas if not paused
          if (!state.isPaused) {
            game.canvas.focus();
          }
        });

        // Auto-pause when window loses focus to free inputs and pause the game properly
        window.addEventListener("blur", () => {
          const state = gameState.get();
          if (
            (state.phase === "survival" || state.phase === "boss") &&
            !state.isPaused
          ) {
            gameActions.setPaused(true);
          }
        });

        // Robust keyboard capture during active gameplay to prevent "jumping + something"
        // (like ALT+D or CMD+L) from leaking to the browser's address bar.
        // We only intercept modifier-heavy shortcuts. Raw inputs like WASD or Space
        // MUST NOT be preventDefault()-ed here, otherwise Phaser's input manager
        // will drop them as they never reach the canvas properly.
        window.addEventListener(
          "keydown",
          (e: KeyboardEvent) => {
            const state = gameState.get();
            if (
              (state.phase === "survival" || state.phase === "boss") &&
              !state.isPaused
            ) {
              const target = e.target as HTMLElement;
              // Let DOM inputs receive events (e.g., if there's an overlaid UI form)
              if (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
                return;

              const isMod = e.metaKey || e.ctrlKey || e.altKey;

              // Only intercept if a modifier is pressed (to protect WASD/Arrows).
              // We want to block navigating away or focusing the browser UI.
              if (isMod) {
                const key = e.key.toLowerCase();
                // Allow standard developer / system shortcuts we *want* to keep
                if (key === "f5" || key === "f11" || key === "f12") return;
                // Allow Cut/Copy/Paste/Reload
                if (
                  (e.metaKey || e.ctrlKey) &&
                  ["r", "c", "v", "x"].includes(key)
                )
                  return;

                // For anything else (e.g. ALT+D, CMD+L, CMD+T), prevent it from
                // leaking to the browser while the user is actively fighting.
                e.preventDefault();
              }
            }
          },
          {capture: true} // intercept before browser defaults
        );
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
