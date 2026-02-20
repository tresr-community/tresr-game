import Phaser from "phaser";
import {SCENE_KEYS} from "@/lib/game/constants";
import {SpriteManager, type SpritesConfig} from "@/lib/game/SpriteManager";
import {config as clientConfig} from "@/lib/config/client";
import {log} from "@/lib/utils/log";
import {getAuthState} from "@/lib/auth";
import {getUserProfile} from "@/lib/user";
import {getSessionId} from "@/lib/game/fee-gate";

// Loading screen config interface
interface LoadingScreenConfig {
  mode: "sprite" | "video";
  spinner: {
    y_offset: number;
  };
  video?: {
    path: string;
    scale: number;
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
  private spinner?: Phaser.GameObjects.Sprite;
  private loaderMode: "sprite" | "video" = "sprite";
  private wallpaperKey: string = "";
  private subtitleText?: Phaser.GameObjects.Text;
  private typewriterDone: boolean = false;
  private typewriterTimer?: Phaser.Time.TimerEvent;
  private charDelay: number = 50; // Default; overridden by audio duration
  private readyCheckTimer?: Phaser.Time.TimerEvent;
  // DOM overlay elements for video loader mode
  private overlayEl?: HTMLDivElement;
  private overlayTextContainer?: HTMLDivElement;
  private domTypewriterTimeoutId?: number;
  private removeVideoTimeoutId?: number;

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
    const loadingConfig = clientConfig.gameplay
      .loading_screen as unknown as LoadingScreenConfig;

    this.loaderMode = loadingConfig.mode ?? "sprite";

    if (this.loaderMode === "video" && loadingConfig.video) {
      // Video mode: create a DOM <img> overlay displaying the animated WebP
      this.createVideoLoader(loadingConfig.video);
    } else {
      // Sprite mode: display the spinning gold coin loader (preloaded in BootScene)
      const spinnerConfig = loadingConfig.spinner;
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
    }

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

  /**
   * Create a full-screen DOM overlay displaying the animated WebP video.
   * Sits above the Phaser canvas, HUD, touch controls, and header (z-index 90)
   * so the intro is a true full-screen cinema experience.
   * Contains a glassmorphism panel with terminal-style typewriter text.
   */
  private createVideoLoader(videoConfig: {
    path: string;
    scale: number;
    y_offset: number;
  }) {
    // Full-screen overlay — covers everything except portrait warning & toasts
    const overlay = document.createElement("div");
    overlay.id = "video-intro-overlay";
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 90;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      transition: opacity 0.8s ease;
    `;

    // Animated WebP background (plays natively via CSS)
    const videoBg = document.createElement("div");
    videoBg.style.cssText = `
      position: absolute;
      inset: 0;
      background-image: url('${videoConfig.path}');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    `;
    overlay.appendChild(videoBg);

    // Subtle vignette gradient for text contrast
    const vignette = document.createElement("div");
    vignette.style.cssText = `
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at center, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.5) 100%);
      pointer-events: none;
    `;
    overlay.appendChild(vignette);

    // Glassmorphism panel for narration text
    const panel = document.createElement("div");
    panel.style.cssText = `
      position: relative;
      width: 85%;
      max-width: 700px;
      margin-bottom: 2%;
      padding: 1.2rem 1.5rem;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-radius: 16px;
      border: 1px solid rgba(0, 255, 136, 0.15);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
      max-height: 35vh;
      overflow-y: auto;
      overflow-x: hidden;
      scroll-behavior: smooth;
      scrollbar-width: none;
      -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 20%, black 100%);
      mask-image: linear-gradient(to bottom, transparent 0%, black 20%, black 100%);
    `;
    overlay.appendChild(panel);

    // Text container inside panel
    const textContainer = document.createElement("div");
    panel.appendChild(textContainer);

    document.body.appendChild(overlay);
    this.overlayEl = overlay;
    this.overlayTextContainer = textContainer;

    log.info(COMPONENT_NAME, `Video loader: ${videoConfig.path} (DOM overlay)`);
  }

  /**
   * Fade out and remove the video DOM overlay.
   * Reveals the Phaser canvas (and camera fade-to-black) beneath.
   */
  private removeVideoLoader(fadeDuration: number = 800): Promise<void> {
    return new Promise((resolve) => {
      if (!this.overlayEl) {
        resolve();
        return;
      }

      this.overlayEl.style.opacity = "0";

      this.removeVideoTimeoutId = window.setTimeout(() => {
        this.removeVideoTimeoutId = undefined;
        this.overlayEl?.remove();
        this.overlayEl = undefined;
        this.overlayTextContainer = undefined;
        resolve();
      }, fadeDuration);
    });
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

  private startTypewriter(charDelay?: number) {
    const introText = clientConfig.app.narration_text.intro;
    if (!introText) {
      this.typewriterDone = true;
      return;
    }

    // Video mode: use DOM-based typewriter in the overlay panel
    if (this.loaderMode === "video" && this.overlayTextContainer) {
      this.startDomTypewriter(introText, charDelay);
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
          delay: 600, // paragraph pause
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
        delay: charDelay ?? this.charDelay,
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

  /**
   * DOM-based typewriter for video mode (hybrid terminal + glassmorphism).
   * Text types character-by-character; older paragraphs fade like a terminal log.
   */
  private startDomTypewriter(text: string, charDelay?: number) {
    const container = this.overlayTextContainer!;
    const paragraphs = text.split(/\n\n+/);
    let paraIndex = 0;
    let charIndex = 0;
    let currentLine = this.addOverlayTextLine();

    const advanceChar = () => {
      if (paraIndex >= paragraphs.length) {
        this.typewriterDone = true;
        return;
      }

      const currentPara = paragraphs[paraIndex];

      if (charIndex >= currentPara.length) {
        // Paragraph complete — move to next
        paraIndex++;
        charIndex = 0;

        if (paraIndex >= paragraphs.length) {
          this.typewriterDone = true;
          return;
        }

        // Fade older paragraphs (terminal scroll effect)
        this.updateOverlayLineOpacities();
        currentLine = this.addOverlayTextLine();

        // Keep panel scrolled to newest text
        const panel = container.parentElement;
        if (panel) panel.scrollTop = panel.scrollHeight;

        // Pause between paragraphs
        this.domTypewriterTimeoutId = window.setTimeout(advanceChar, 600);
        return;
      }

      currentLine.textContent =
        (currentLine.textContent || "") + currentPara[charIndex];
      charIndex++;

      // Auto-scroll
      const panel = container.parentElement;
      if (panel) panel.scrollTop = panel.scrollHeight;

      this.domTypewriterTimeoutId = window.setTimeout(
        advanceChar,
        charDelay ?? this.charDelay
      );
    };

    advanceChar();
  }

  /** Create a new paragraph element in the overlay text container. */
  private addOverlayTextLine(): HTMLParagraphElement {
    const p = document.createElement("p");
    p.style.cssText = `
      color: #00ff88;
      font-family: 'Inter', sans-serif;
      font-size: clamp(14px, 2.5vw, 18px);
      text-align: center;
      line-height: 1.7;
      white-space: pre-wrap;
      text-shadow: 0 0 10px rgba(0, 255, 136, 0.4), 0 2px 8px rgba(0, 0, 0, 0.9);
      margin: 0 0 0.5em 0;
      transition: opacity 0.6s ease;
    `;
    this.overlayTextContainer!.appendChild(p);
    return p;
  }

  /** Fade older paragraphs — newest stays bright, older lines dim out. */
  private updateOverlayLineOpacities() {
    if (!this.overlayTextContainer) return;
    const lines = Array.from(
      this.overlayTextContainer.children
    ) as HTMLElement[];
    const count = lines.length;
    for (let i = 0; i < count; i++) {
      const age = count - i; // 1 = newest completed, higher = older
      if (age <= 1) lines[i].style.opacity = "0.55";
      else if (age === 2) lines[i].style.opacity = "0.3";
      else if (age === 3) lines[i].style.opacity = "0.15";
      else lines[i].style.opacity = "0.08";
    }
  }

  private async startIntroNarration() {
    const auth = getAuthState();

    // Start audio IMMEDIATELY to preserve the browser's user-gesture autoplay
    // window. If the user preference (fetched async below) says to skip, we
    // stop the already-playing audio afterward.
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

    // Compute per-character typewriter delay from audio duration so text
    // and voice finish together (fixes 5-second desync).
    this.computeCharDelay(this.introAudio);

    // Start typewriter only once audio actually begins playing (ticket #290)
    this.introPlayingHandler = () => {
      this.introPlayingHandler = null; // auto-clear after once fires
      this.startTypewriter(this.charDelay);
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

    // Check authenticated user's narration preference in parallel.
    // If they've disabled narration, stop the already-playing audio.
    if (auth.isAuthenticated && !auth.isGuest && auth.user) {
      try {
        const doc = await getUserProfile(auth.user.key);
        if (doc && doc.data.preferences.narration === false) {
          log.info(COMPONENT_NAME, "Narration disabled by user preference");
          this.stopNarration();
          return;
        }
      } catch {
        log.warn(
          COMPONENT_NAME,
          "Failed to load narration preference, defaulting to enabled"
        );
      }
    }
  }

  /**
   * Derive per-character typewriter delay from the narration audio duration.
   * Ensures text finishes at the same time as the voice.
   */
  private computeCharDelay(audio: HTMLAudioElement) {
    const introText = clientConfig.app.narration_text.intro;
    if (!introText) return;

    const compute = () => {
      const duration = audio.duration;
      // Guard: duration may be NaN/Infinity for streaming or failed loads
      if (!Number.isFinite(duration) || duration <= 0) return;

      const totalChars = introText.replace(/\n\n+/g, "").length;
      const paragraphCount = introText.split(/\n\n+/).length;
      const totalParagraphPauseMs = Math.max(0, paragraphCount - 1) * 600;
      const availableMs = duration * 1000 - totalParagraphPauseMs;
      // Floor of 30ms prevents unreadably fast text
      this.charDelay = Math.max(30, Math.floor(availableMs / totalChars));

      log.info(
        COMPONENT_NAME,
        `Audio duration: ${duration.toFixed(1)}s → charDelay: ${this.charDelay}ms`
      );
    };

    // Duration may already be available (cached audio)
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      compute();
    } else {
      audio.addEventListener("loadedmetadata", compute, {once: true});
    }
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

  /**
   * Stop narration that is already playing (or pending).
   * Used when the user's saved preference says narration is disabled,
   * but audio was started eagerly to preserve the autoplay gesture window.
   */
  private stopNarration() {
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
    if (this.typewriterTimer) {
      this.typewriterTimer.destroy();
      this.typewriterTimer = undefined;
    }
    this.introFinished = true;
    this.typewriterDone = true;
    window.dispatchEvent(new Event("tresr:narration-complete"));
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
    if (this.loaderMode === "sprite" && this.textures.exists("loader")) {
      this.textures.remove("loader");
    }

    // Clean up video DOM overlay if still present
    if (this.removeVideoTimeoutId) {
      clearTimeout(this.removeVideoTimeoutId);
      this.removeVideoTimeoutId = undefined;
    }
    if (this.domTypewriterTimeoutId) {
      clearTimeout(this.domTypewriterTimeoutId);
      this.domTypewriterTimeoutId = undefined;
    }
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = undefined;
      this.overlayTextContainer = undefined;
    }
  }

  private startTransition() {
    // Clear polling timer if still running (ticket #245)
    if (this.readyCheckTimer) {
      this.readyCheckTimer.destroy();
      this.readyCheckTimer = undefined;
    }

    log.info(COMPONENT_NAME, "Starting cinematic transition...");

    if (this.loaderMode === "sprite" && this.spinner) {
      // Sprite mode: particle burst + zoom out
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
    } else {
      // Video mode: fade out the DOM overlay to reveal the game beneath
      this.removeVideoLoader(800);
    }

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
      // Clean up typewriter timers if still running
      if (this.typewriterTimer) this.typewriterTimer.destroy();
      if (this.domTypewriterTimeoutId) {
        clearTimeout(this.domTypewriterTimeoutId);
        this.domTypewriterTimeoutId = undefined;
      }
      // Pass fee-gate session ID to MainScene (ticket #244)
      this.scene.start(SCENE_KEYS.MAIN, {sessionId: getSessionId()});
    });
  }
}
