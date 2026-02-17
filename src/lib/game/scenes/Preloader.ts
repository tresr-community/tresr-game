import Phaser from "phaser";
import {SCENE_KEYS} from "@/lib/game/constants";
import {SpriteManager, type SpritesConfig} from "@/lib/game/SpriteManager";
import {config as clientConfig} from "@/lib/config/client";
import {log} from "@/lib/utils/log";
import {getAuthState} from "@/lib/auth";
import {getUserProfile} from "@/lib/user";
import {getSessionId} from "@/lib/game/fee-gate";

// Loading screen config interface (spinner only — progress bar + text removed in cinematic rewrite)
interface LoadingScreenConfig {
  spinner: {
    y_offset: number;
  };
}

const COMPONENT_NAME = "Preloader";

export class Preloader extends Phaser.Scene {
  private spriteManager: SpriteManager;
  private spritesConfig!: SpritesConfig;
  private introAudio: HTMLAudioElement | null = null;
  private introFinished: boolean = false;
  // Named listener refs for cleanup (ticket #197, #290)
  private introEndedHandler: (() => void) | null = null;
  private introErrorHandler: (() => void) | null = null;
  private introPlayingHandler: (() => void) | null = null;
  private spinner!: Phaser.GameObjects.Sprite;
  private wallpaperKey: string = "";
  private subtitleText?: Phaser.GameObjects.Text;
  private typewriterDone: boolean = false;
  private typewriterTimer?: Phaser.Time.TimerEvent;
  private readyCheckTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super(SCENE_KEYS.PRELOADER);
    this.spriteManager = new SpriteManager(this);
  }

  init() {
    this.spritesConfig = clientConfig.sprites as unknown as SpritesConfig;
  }

  preload() {
    log.info(COMPONENT_NAME, "Loading assets...");

    const {width, height} = this.cameras.main;
    const loadingConfig: LoadingScreenConfig =
      clientConfig.gameplay.loading_screen;

    const spinnerConfig = loadingConfig.spinner;

    // Display the spinning gold coin loader (preloaded in BootScene)
    this.spinner = this.add.sprite(
      width / 2,
      height / 2 + spinnerConfig.y_offset,
      "loader"
    );
    this.spinner.setOrigin(0.5);
    this.spinner.setScale(
      SpriteManager.getScaleFactor(
        this.spritesConfig,
        "loader",
        height,
        clientConfig.display.design_height
      ) * 0.5
    );
    this.spinner.play("loader_idle");

    // Start intro narration (async — does not block Phaser loader)
    this.startIntroNarration();

    // Load sprites with config (now available from BootScene)
    this.spriteManager.preloadSprites(this.spritesConfig);

    // Load audio and wallpapers from config
    this.loadConfigAssets();

    // When wallpaper image finishes loading, show it early as background with drift
    this.load.on(
      `filecomplete-image-${this.wallpaperKey}`,
      this.showWallpaperBackground,
      this
    );
  }

  private showWallpaperBackground() {
    const {width, height} = this.cameras.main;

    const bg = this.add.image(width / 2, height / 2, this.wallpaperKey);
    const tex = this.textures.get(this.wallpaperKey).getSourceImage();
    const scaleX = width / tex.width;
    const scaleY = height / tex.height;
    const coverScale = Math.max(scaleX, scaleY);
    bg.setScale(coverScale);
    bg.setScrollFactor(0);
    bg.setDepth(-1000);
    bg.setAlpha(0);

    // Fade wallpaper in to 0.3 opacity
    this.tweens.add({
      targets: bg,
      alpha: 0.3,
      duration: 1000,
      ease: "Sine.easeIn",
    });

    // Slow parallax drift
    this.tweens.add({
      targets: bg,
      x: width / 2 + 30,
      duration: 15000,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private startTypewriter() {
    const introText = clientConfig.app.narration_text.intro;
    if (!introText) {
      this.typewriterDone = true;
      return;
    }

    const {width, height} = this.cameras.main;
    const centerY = height / 2;
    const lineHeight = 26; // fontSize 20 + lineSpacing 6

    this.subtitleText = this.add
      .text(width / 2, centerY, "", {
        fontFamily: "Inter, sans-serif",
        fontSize: "20px",
        color: "#d4ffd4",
        wordWrap: {width: 800},
        align: "center",
        lineSpacing: 6,
        shadow: {
          offsetX: 0,
          offsetY: 1,
          color: "#000000",
          blur: 4,
          fill: true,
        },
      })
      .setOrigin(0.5, 0)
      .setDepth(100);

    // Gradient fade mask: text fades out toward the top
    const maskGfx = this.add.graphics();
    maskGfx.setVisible(false);
    const fadeTop = centerY - lineHeight * 4;
    const fadeBottom = centerY + lineHeight * 8;
    // Draw gradient from transparent at top to opaque at center and below
    for (let y = fadeTop; y < centerY; y++) {
      const alpha = (y - fadeTop) / (centerY - fadeTop);
      maskGfx.fillStyle(0xffffff, alpha);
      maskGfx.fillRect(0, y, width, 1);
    }
    maskGfx.fillStyle(0xffffff, 1);
    maskGfx.fillRect(0, centerY, width, fadeBottom - centerY);

    const mask = maskGfx.createGeometryMask();
    this.subtitleText.setMask(mask);

    const chars = introText.split("");
    let charIndex = 0;
    let prevLineCount = 0;

    const advanceChar = () => {
      if (charIndex >= chars.length) {
        this.typewriterDone = true;
        return;
      }

      const char = chars[charIndex];
      charIndex++;

      // Check for paragraph break (two newlines)
      if (
        char === "\n" &&
        charIndex < chars.length &&
        chars[charIndex] === "\n"
      ) {
        charIndex++; // skip second newline
        this.subtitleText!.text += "\n\n";
        // Longer pause for paragraph break
        this.typewriterTimer = this.time.addEvent({
          delay: 600,
          callback: advanceChar,
        });
        this.scrollToCurrentLine(lineHeight);
        prevLineCount = this.countLines();
        return;
      }

      this.subtitleText!.text += char;

      // Check if word-wrap caused a new line
      const currentLineCount = this.countLines();
      if (currentLineCount > prevLineCount) {
        this.scrollToCurrentLine(lineHeight);
        prevLineCount = currentLineCount;
      }

      this.typewriterTimer = this.time.addEvent({
        delay: 50,
        callback: advanceChar,
      });
    };

    advanceChar();
  }

  private countLines(): number {
    if (!this.subtitleText) return 0;
    // getWrappedText returns an array of visual lines after word-wrap
    return this.subtitleText.getWrappedText().length;
  }

  /**
   * Scroll the text upward so the latest line stays at screen center.
   * Older text scrolls up and fades out via the gradient mask.
   */
  private scrollToCurrentLine(lineHeight: number) {
    if (!this.subtitleText) return;
    const {height} = this.cameras.main;
    const centerY = height / 2;
    const totalLines = this.countLines();

    // Target Y: position text so the last line sits at centerY
    // Text origin is (0.5, 0), so top of text is at this.subtitleText.y
    // Last line top = textY + (totalLines - 1) * lineHeight
    // We want that to equal centerY
    const targetY = centerY - (totalLines - 1) * lineHeight;

    this.tweens.add({
      targets: this.subtitleText,
      y: targetY,
      duration: 300,
      ease: "Sine.easeOut",
    });
  }

  private async startIntroNarration() {
    const auth = getAuthState();

    if (auth.isAuthenticated && !auth.isGuest && auth.user) {
      // Logged-in user — check their saved preference
      try {
        const doc = await getUserProfile(auth.user.key);
        if (doc && doc.data.preferences.narration === false) {
          log.info(COMPONENT_NAME, "Narration disabled by user preference");
          this.introFinished = true;
          this.typewriterDone = true;
          window.dispatchEvent(new Event("tresr:narration-complete"));
          return;
        }
      } catch {
        log.warn(
          COMPONENT_NAME,
          "Failed to load narration preference, defaulting to enabled"
        );
      }
    }
    // Guest users always get narration, logged-in users get it unless disabled

    this.introAudio = new Audio("/assets/audio/narration/intro.webm");
    this.introAudio.volume = 1.0;
    this.introEndedHandler = () => {
      this.introFinished = true;
      window.dispatchEvent(new Event("tresr:narration-complete"));
    };
    this.introErrorHandler = () => {
      log.warn(COMPONENT_NAME, "Intro voiceover failed to load");
      this.introFinished = true;
      window.dispatchEvent(new Event("tresr:narration-complete"));
    };
    this.introAudio.addEventListener("ended", this.introEndedHandler);
    this.introAudio.addEventListener("error", this.introErrorHandler);
    // Start typewriter only once audio actually begins playing (ticket #290)
    this.introPlayingHandler = () => {
      this.introPlayingHandler = null; // auto-clear after once fires
      this.startTypewriter();
    };
    this.introAudio.addEventListener("playing", this.introPlayingHandler, {
      once: true,
    });

    this.introAudio.play().catch((e) => {
      log.warn(COMPONENT_NAME, "Intro voiceover autoplay blocked:", e);
      this.introFinished = true;
      this.typewriterDone = true; // skip typewriter if audio was blocked
      window.dispatchEvent(new Event("tresr:narration-complete"));
    });
  }

  // Core SFX types — always preloaded (used every session within first seconds)
  private static readonly CORE_SFX_TYPES = [
    "punch",
    "hurt",
    "explosion",
    "key_collect",
    "countdown",
    "death",
    "powerup_collect",
  ];

  // Deferred SFX types — loaded by MainScene during countdown (OOM fix)
  static readonly DEFERRED_SFX_TYPES = [
    "victory",
    "game_over",
    "bot_attack",
    "bot_special",
    "bot_spawn",
    "open_treasure_chest",
  ];

  private loadConfigAssets() {
    const assets = clientConfig.assets;

    // Load only core SFX during preload (OOM fix: defer contextual SFX)
    // Music is NOT loaded here — MusicManager streams via HTMLAudioElement
    const corePrefixes = Preloader.CORE_SFX_TYPES;
    assets.sfx.forEach((sfx: string) => {
      const isCore = corePrefixes.some((prefix) => sfx.startsWith(prefix));
      if (isCore) {
        this.load.audio(sfx, `/assets/audio/sfx/${sfx}.webm`);
      }
    });

    // Handle Wallpapers
    // NOTE: Intentionally uses Math.random() — wallpaper selection is
    // cosmetic-only and does not affect gameplay or replay validation.
    // The seeded RNG is not available until MainScene.init().
    const wallpapers = assets.wallpapers;
    const selected = wallpapers[Math.floor(Math.random() * wallpapers.length)];

    log.info(COMPONENT_NAME, `Selected wallpaper: ${selected}`);
    this.registry.set("selected_wallpaper", selected);
    this.wallpaperKey = selected;
    this.load.image(selected, `/assets/images/wallpapers/${selected}.webp`);
  }

  create() {
    log.info(COMPONENT_NAME, "Assets loaded. Waiting for intro to finish...");

    this.checkReadyForTransition();
  }

  private checkReadyForTransition() {
    // Both narration and typewriter must be done (or skipped)
    if (this.introFinished && this.typewriterDone) {
      this.startTransition();
      return;
    }

    // Phaser timer — pauses with tab visibility and cleans up with scene
    this.readyCheckTimer = this.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => {
        if (this.introFinished && this.typewriterDone) {
          this.readyCheckTimer?.destroy();
          this.readyCheckTimer = undefined;
          this.startTransition();
        }
      },
    });
  }

  shutdown() {
    // Clean up polling timer to prevent CPU leak across scene transitions
    if (this.readyCheckTimer) {
      this.readyCheckTimer.destroy();
      this.readyCheckTimer = undefined;
    }
    // Clean up typewriter timer
    if (this.typewriterTimer) {
      this.typewriterTimer.destroy();
      this.typewriterTimer = undefined;
    }
    // Clean up intro audio (ticket #197, #290: remove listeners, release buffer)
    if (this.introAudio) {
      this.introAudio.pause();
      if (this.introEndedHandler)
        this.introAudio.removeEventListener("ended", this.introEndedHandler);
      if (this.introErrorHandler)
        this.introAudio.removeEventListener("error", this.introErrorHandler);
      if (this.introPlayingHandler)
        this.introAudio.removeEventListener(
          "playing",
          this.introPlayingHandler
        );
      this.introAudio.src = "";
      this.introAudio = null;
    }
    this.introEndedHandler = null;
    this.introErrorHandler = null;
    this.introPlayingHandler = null;
    // Remove filecomplete listener and camera fade listener
    this.load.off(
      `filecomplete-image-${this.wallpaperKey}`,
      this.showWallpaperBackground,
      this
    );
    this.cameras.main.off("camerafadeoutcomplete");

    // Clean up textures no longer needed after Preloader (OOM fix)
    // Loader spinner is only used in Preloader — free its GPU texture
    if (this.textures.exists("loader")) {
      this.textures.remove("loader");
    }
  }

  private startTransition() {
    // Clear polling timer if still running (ticket #245)
    if (this.readyCheckTimer) {
      this.readyCheckTimer.destroy();
      this.readyCheckTimer = undefined;
    }

    log.info(COMPONENT_NAME, "Starting cinematic transition...");

    const cx = this.spinner.x;
    const cy = this.spinner.y;

    // Gold particle burst from spinner position
    const particles = this.add.particles(cx, cy, "loader", {
      frame: 0,
      speed: {min: 100, max: 400},
      angle: {min: 0, max: 360},
      scale: {start: 0.3, end: 0},
      lifespan: 800,
      quantity: 30,
      emitting: false,
    });
    particles.explode(30);

    // Coin zoom + fade out
    this.tweens.add({
      targets: this.spinner,
      scale: 15,
      alpha: 0,
      duration: 800,
      ease: "Power2",
    });

    // Fade subtitle text out
    if (this.subtitleText) {
      this.tweens.add({
        targets: this.subtitleText,
        alpha: 0,
        duration: 400,
      });
    }

    // Camera fade to black
    this.cameras.main.fadeOut(800, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      // Clean up typewriter timer if still running
      if (this.typewriterTimer) this.typewriterTimer.destroy();
      // Pass fee-gate session ID to MainScene (ticket #244)
      this.scene.start(SCENE_KEYS.MAIN, {sessionId: getSessionId()});
    });
  }
}
