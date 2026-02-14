import {gameActions, gameState} from "./state";
import {getAuthState, subscribeToAuth} from "@/lib/auth";
import {getUserProfile, saveUserProfile} from "@/lib/user";
import {config} from "@/lib/config/client";
import {log} from "@/lib/utils/log";

const COMPONENT_NAME = "MusicManager";

class MusicManager {
  private static instance: MusicManager;
  private audio: HTMLAudioElement | null = null;
  private fadingOut: HTMLAudioElement | null = null;
  private fadeInterval: ReturnType<typeof setInterval> | null = null;
  private fadeInInterval: ReturnType<typeof setInterval> | null = null;
  private tracks: string[] = [];
  private isRandom: boolean = false;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private shuffledQueue: string[] = [];
  private queueIndex: number = 0;
  private initialPlayStarted: boolean = false;
  private authUnsubscribe: (() => void) | null = null;
  private narrationDone: boolean = false;
  private deferredPlay: (() => void) | null = null;
  private handleBeforeUnload: (() => void) | null = null;
  private playPromise: Promise<void> | null = null;

  // Bound audio event handlers for cleanup (ticket #227)
  private handleTimeUpdate = () => {
    if (this.audio) {
      gameActions.updateMusic({
        currentTime: this.audio.currentTime,
        duration: this.audio.duration || 0,
      });
    }
  };
  private handleEnded = () => {
    if (this.isRandom) {
      this.playRandom();
    } else {
      this.next();
    }
  };

  private constructor() {
    if (typeof window !== "undefined") {
      // Apply config defaults immediately so guests (and everyone) start
      // with the correct volume before any async profile load completes.
      const audioConfig = config.gameplay.audio;
      this.audio = new Audio();
      this.audio.volume = audioConfig.default_music_volume;
      gameActions.updateMusic({
        musicVolume: audioConfig.default_music_volume,
        sfxVolume: audioConfig.default_sfx_volume,
      });

      this.audio.addEventListener("timeupdate", this.handleTimeUpdate);
      this.audio.addEventListener("ended", this.handleEnded);

      // Wait for gameplay to actually start before starting music playback.
      // MainScene dispatches this event after the countdown completes.
      window.addEventListener(
        "tresr:gameplay-start",
        () => {
          this.narrationDone = true;
          if (this.deferredPlay) {
            this.deferredPlay();
            this.deferredPlay = null;
          }
        },
        {once: true}
      );

      // Load tracks from config (does NOT play — waits for auth callback)
      this.loadTracks();

      // Subscribe to auth to load saved preferences (overrides defaults).
      // This fires immediately with the current auth state, so it also
      // handles the initial playRandom() for guests. This avoids the race
      // condition where loadTracks() and loadPreferences() both called
      // playRandom() concurrently.
      // Flush pending preferences to localStorage on tab close (ticket #172)
      this.handleBeforeUnload = () => this.flushPendingPreferences();
      window.addEventListener("beforeunload", this.handleBeforeUnload);

      this.authUnsubscribe = subscribeToAuth(async (state) => {
        if (state.isAuthenticated && !state.isGuest && state.user) {
          await this.loadPreferences(state.user.key);
        } else if (!this.initialPlayStarted && this.tracks.length > 0) {
          // Guest or unauthenticated — start random playback
          this.initialPlayStarted = true;
          this.isRandom = true;
          this.playRandomAfterNarration();
        }
      });
    }
  }

  /**
   * Defer any playback callback until intro narration finishes.
   * If narration already finished (or was skipped), runs immediately.
   */
  private playAfterNarration(fn: () => void) {
    if (this.narrationDone) {
      fn();
    } else {
      this.deferredPlay = fn;
    }
  }

  private playRandomAfterNarration() {
    this.playAfterNarration(() => this.playRandom());
  }

  private async loadPreferences(userId: string) {
    try {
      this.initialPlayStarted = true;

      // Sync any pending preferences saved to localStorage on previous tab close (ticket #172)
      await this.syncPendingPreferences(userId);

      const doc = await getUserProfile(userId);
      if (doc && doc.data.preferences.music) {
        const prefs = doc.data.preferences.music;
        log.info(COMPONENT_NAME, "Loading preferences from Juno:", prefs);

        if (prefs.volume !== undefined) {
          this.setVolume(prefs.volume, false);
        }

        // Load SFX volume preference
        if (prefs.sfxVolume !== undefined) {
          this.setSfxVolume(prefs.sfxVolume, false);
        }

        if (prefs.track && prefs.track !== "random") {
          this.playAfterNarration(() =>
            this.setTrack(prefs.track!, !prefs.isPaused)
          );
        } else {
          this.isRandom = true;
          this.playRandomAfterNarration();
        }
      } else {
        // Defaults from config
        const audioConfig = config.gameplay.audio;
        const defaultMusicVol = audioConfig.default_music_volume;
        const defaultSfxVol = audioConfig.default_sfx_volume;

        this.isRandom = true;
        this.setVolume(defaultMusicVol, false);
        this.setSfxVolume(defaultSfxVol, false);
        this.playRandomAfterNarration();
      }
    } catch (e) {
      log.warn(COMPONENT_NAME, "Failed to load preferences:", e);
    }
  }

  private persistPreferences() {
    const auth = getAuthState();
    if (!auth.isAuthenticated || auth.isGuest || !auth.user) return;

    if (this.saveTimeout) clearTimeout(this.saveTimeout);

    const debounceMs = config.gameplay.audio.preference_save_debounce_ms;

    this.saveTimeout = setTimeout(async () => {
      try {
        const userId = auth.user!.key;
        const doc = await getUserProfile(userId);
        if (doc) {
          const profile = doc.data;
          profile.preferences.music = {
            track: this.isRandom
              ? "random"
              : gameState.get().music.currentTrack,
            volume: gameState.get().music.musicVolume,
            sfxVolume: gameState.get().music.sfxVolume,
            isPaused: !gameState.get().music.isPlaying,
          };
          await saveUserProfile(userId, profile, doc.version);
          log.debug(COMPONENT_NAME, "Preferences persisted to Juno.");
        }
      } catch (e) {
        log.warn(COMPONENT_NAME, "Failed to persist preferences:", e);
      }
    }, debounceMs);
  }

  public static getInstance(): MusicManager {
    if (!MusicManager.instance) {
      MusicManager.instance = new MusicManager();
    }
    return MusicManager.instance;
  }

  private loadTracks() {
    this.tracks = config.assets.music;
  }

  public setTrack(track: string, forcePlay: boolean = false) {
    if (!this.audio) return;
    const isPlaying = forcePlay || !this.audio.paused;
    const targetVolume = gameState.get().music.musicVolume;

    // Crossfade: fade out old track while fading in new one (ticket #177)
    if (isPlaying && !this.audio.paused && this.audio.src) {
      this.startCrossfade();
    }

    this.audio.src = `/assets/audio/music/${track}.webm`;
    gameActions.updateMusic({
      currentTrack: track,
    });
    if (isPlaying) {
      this.audio.volume = 0;
      this.safePlay().then(() => this.fadeIn(targetVolume));
      gameActions.updateMusic({
        isPlaying: true,
      });
    }
    this.persistPreferences();
  }

  /**
   * Start crossfade by moving current audio to fadingOut and ramping down.
   */
  private startCrossfade() {
    // Clean up any existing fade (ticket #197: release media buffer)
    if (this.fadeInterval) clearInterval(this.fadeInterval);
    if (this.fadingOut) {
      this.safePauseElement(this.fadingOut);
      this.fadingOut.src = "";
      this.fadingOut = null;
    }

    // Remove listeners from old audio before moving to fadingOut (ticket #227)
    if (this.audio) {
      this.audio.removeEventListener("timeupdate", this.handleTimeUpdate);
      this.audio.removeEventListener("ended", this.handleEnded);
    }

    // Clear any active fade-in interval (ticket #227)
    if (this.fadeInInterval) {
      clearInterval(this.fadeInInterval);
      this.fadeInInterval = null;
    }

    // Move current audio to fadingOut
    this.fadingOut = this.audio;
    this.audio = new Audio();
    this.audio.volume = 0;

    // Attach named handlers to new audio element
    this.audio.addEventListener("timeupdate", this.handleTimeUpdate);
    this.audio.addEventListener("ended", this.handleEnded);

    // Fade out old audio
    const fadeOut = this.fadingOut;
    if (!fadeOut) return;

    const crossfadeDuration = config.gameplay.audio.crossfade_duration_ms;
    const crossfadeStep = config.gameplay.audio.crossfade_step_ms;
    const steps = crossfadeDuration / crossfadeStep;
    const volumeStep = fadeOut.volume / steps;
    let remaining = steps;

    this.fadeInterval = setInterval(() => {
      // Stale callback — this interval was already cleared by the new
      // startCrossfade(). Just return; do NOT clear this.fadeInterval
      // since it now belongs to the new crossfade (ticket #227).
      if (fadeOut !== this.fadingOut) {
        return;
      }
      remaining--;
      if (remaining <= 0 || !fadeOut) {
        if (this.fadeInterval) clearInterval(this.fadeInterval);
        this.fadeInterval = null;
        fadeOut.pause();
        fadeOut.src = "";
        this.fadingOut = null;
        return;
      }
      fadeOut.volume = Math.max(0, fadeOut.volume - volumeStep);
    }, crossfadeStep);
  }

  /**
   * Fade in the current audio element to the target volume.
   */
  private fadeIn(targetVolume: number) {
    if (!this.audio) return;
    // Clear any previous fade-in (ticket #227)
    if (this.fadeInInterval) {
      clearInterval(this.fadeInInterval);
      this.fadeInInterval = null;
    }
    const crossfadeDuration = config.gameplay.audio.crossfade_duration_ms;
    const crossfadeStep = config.gameplay.audio.crossfade_step_ms;
    const steps = crossfadeDuration / crossfadeStep;
    const volumeStep = targetVolume / steps;
    let current = 0;

    this.fadeInInterval = setInterval(() => {
      current++;
      if (!this.audio || current >= steps) {
        if (this.fadeInInterval) {
          clearInterval(this.fadeInInterval);
          this.fadeInInterval = null;
        }
        if (this.audio) this.audio.volume = targetVolume;
        return;
      }
      this.audio.volume = Math.min(targetVolume, volumeStep * current);
    }, crossfadeStep);
  }

  /**
   * Safely start playback, tracking the promise to prevent race conditions.
   * All pause operations await this promise before pausing.
   */
  private safePlay(): Promise<void> {
    if (!this.audio) return Promise.resolve();
    this.playPromise = this.audio
      .play()
      .catch((e) => {
        if (e.name !== "AbortError") {
          log.warn(COMPONENT_NAME, "Play failed:", e);
        }
      })
      .finally(() => {
        this.playPromise = null;
      });
    return this.playPromise;
  }

  /**
   * Safely pause the main audio element, awaiting any pending play() first.
   */
  private async safePause() {
    if (this.playPromise) {
      await this.playPromise;
    }
    this.audio?.pause();
  }

  /**
   * Safely pause an arbitrary audio element (used for crossfade cleanup).
   */
  private safePauseElement(el: HTMLAudioElement) {
    // The element being faded out is never the one with the active playPromise,
    // but guard defensively anyway.
    try {
      el.pause();
    } catch {
      // Ignore — element may already be disposed
    }
  }

  public toggle() {
    if (!this.audio) return;
    if (this.audio.paused) {
      this.safePlay();
      gameActions.updateMusic({
        isPlaying: true,
      });
    } else {
      this.safePause();
      gameActions.updateMusic({
        isPlaying: false,
      });
    }
    this.persistPreferences();
  }

  public setRandom(enabled: boolean) {
    this.isRandom = enabled;
    if (enabled && !gameState.get().music.currentTrack) {
      this.playRandom();
    }
    this.persistPreferences();
  }

  public stop() {
    // Clean up any crossfade in progress
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
    if (this.fadeInInterval) {
      clearInterval(this.fadeInInterval);
      this.fadeInInterval = null;
    }
    if (this.fadingOut) {
      this.fadingOut.pause();
      this.fadingOut.src = "";
      this.fadingOut = null;
    }
    if (!this.audio) return;
    this.safePause();
    this.audio.currentTime = 0;
    gameActions.updateMusic({
      isPlaying: false,
    });
  }

  public setVolume(vol: number, persist: boolean = true) {
    if (!this.audio) return;
    this.audio.volume = vol;
    gameActions.updateMusic({
      musicVolume: vol,
    });
    if (persist) this.persistPreferences();
  }

  public setSfxVolume(vol: number, persist: boolean = true) {
    gameActions.updateMusic({
      sfxVolume: vol,
    });
    if (persist) this.persistPreferences();
  }

  public seek(time: number) {
    if (!this.audio) return;
    this.audio.currentTime = time;
  }

  public destroy() {
    if (this.authUnsubscribe) {
      this.authUnsubscribe();
      this.authUnsubscribe = null;
    }
    if (this.handleBeforeUnload) {
      window.removeEventListener("beforeunload", this.handleBeforeUnload);
      this.handleBeforeUnload = null;
    }
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.stop();
    // Remove listeners and release audio element media buffer (ticket #197, #227)
    if (this.audio) {
      this.audio.removeEventListener("timeupdate", this.handleTimeUpdate);
      this.audio.removeEventListener("ended", this.handleEnded);
      this.audio.src = "";
      this.audio = null;
    }
  }

  private static PENDING_PREFS_KEY = "tresr_pending_music_prefs";

  /**
   * Synchronously save pending preferences to localStorage on tab close.
   * These are picked up and synced to Juno on next loadPreferences() call.
   */
  private flushPendingPreferences() {
    if (!this.saveTimeout) return;
    clearTimeout(this.saveTimeout);
    this.saveTimeout = null;
    try {
      const prefs = {
        track: this.isRandom ? "random" : gameState.get().music.currentTrack,
        volume: gameState.get().music.musicVolume,
        sfxVolume: gameState.get().music.sfxVolume,
        isPaused: !gameState.get().music.isPlaying,
      };
      localStorage.setItem(
        MusicManager.PENDING_PREFS_KEY,
        JSON.stringify(prefs)
      );
    } catch {
      // localStorage may be unavailable
    }
  }

  /**
   * On load, check for pending preferences saved by flushPendingPreferences()
   * and sync them to Juno, then clear the localStorage entry.
   */
  private async syncPendingPreferences(userId: string) {
    try {
      const raw = localStorage.getItem(MusicManager.PENDING_PREFS_KEY);
      if (!raw) return;
      localStorage.removeItem(MusicManager.PENDING_PREFS_KEY);
      const pending = JSON.parse(raw);
      const doc = await getUserProfile(userId);
      if (doc) {
        const profile = doc.data;
        profile.preferences.music = pending;
        await saveUserProfile(userId, profile, doc.version);
        log.info(COMPONENT_NAME, "Synced pending preferences to Juno.");
      }
    } catch (e) {
      log.warn(COMPONENT_NAME, "Failed to sync pending preferences:", e);
    }
  }

  public next() {
    if (this.tracks.length === 0) return;
    if (this.isRandom) {
      this.playRandom();
      return;
    }
    const current = gameState.get().music.currentTrack;
    const index = this.tracks.indexOf(current);
    const nextIndex = (index + 1) % this.tracks.length;
    this.setTrack(this.tracks[nextIndex], true);
  }

  public prev() {
    if (this.tracks.length === 0) return;
    const current = gameState.get().music.currentTrack;
    const index = this.tracks.indexOf(current);
    const prevIndex = (index - 1 + this.tracks.length) % this.tracks.length;
    this.setTrack(this.tracks[prevIndex], true);
  }

  private static SHUFFLE_STORAGE_KEY = "tresr_shuffle_state";

  /** Save shuffle queue state to sessionStorage for page navigation persistence */
  private saveShuffleState() {
    try {
      sessionStorage.setItem(
        MusicManager.SHUFFLE_STORAGE_KEY,
        JSON.stringify({
          queue: this.shuffledQueue,
          index: this.queueIndex,
          tracks: this.tracks,
        })
      );
    } catch {
      // sessionStorage may be unavailable
    }
  }

  /** Restore shuffle queue state from sessionStorage if valid */
  private restoreShuffleState(): boolean {
    try {
      const stored = sessionStorage.getItem(MusicManager.SHUFFLE_STORAGE_KEY);
      if (!stored) return false;
      const state = JSON.parse(stored);
      // Runtime type validation (ticket #143)
      if (
        !state ||
        !Array.isArray(state.queue) ||
        !Array.isArray(state.tracks) ||
        typeof state.index !== "number" ||
        state.index < 0
      ) {
        return false;
      }
      // Validate all queue entries are strings that exist in current tracks
      if (
        !state.queue.every(
          (t: unknown) =>
            typeof t === "string" && this.tracks.includes(t as string)
        )
      ) {
        return false;
      }
      // Only restore if track list hasn't changed and index is in bounds
      if (
        JSON.stringify(state.tracks) !== JSON.stringify(this.tracks) ||
        state.index >= state.queue.length
      ) {
        return false;
      }
      this.shuffledQueue = state.queue;
      this.queueIndex = state.index;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Shuffles the queue using Fisher-Yates algorithm.
   * Ensures the last track of the previous queue isn't the first of the new one.
   *
   * NOTE (ticket #266): Music shuffle is a non-gameplay path — it does not
   * affect replay validation, anti-cheat hashes, or seeded-RNG determinism.
   * We use crypto.getRandomValues() instead of Math.random() to avoid any
   * argument that the seeded-RNG invariant is not enforced.
   */
  private shuffleQueue() {
    const current = gameState.get().music.currentTrack;
    this.shuffledQueue = [...this.tracks];

    // Fisher-Yates shuffle using crypto RNG (non-gameplay, see note above)
    for (let i = this.shuffledQueue.length - 1; i > 0; i--) {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      const j = arr[0] % (i + 1);
      [this.shuffledQueue[i], this.shuffledQueue[j]] = [
        this.shuffledQueue[j],
        this.shuffledQueue[i],
      ];
    }

    // If the first track is the same as the last played, move it to the end
    if (this.shuffledQueue.length > 1 && this.shuffledQueue[0] === current) {
      const first = this.shuffledQueue.shift()!;
      this.shuffledQueue.push(first);
    }

    this.queueIndex = 0;
    this.saveShuffleState();
  }

  public playRandom() {
    if (this.tracks.length === 0) return;

    // For single-track playlists, just play the track
    if (this.tracks.length === 1) {
      this.setTrack(this.tracks[0], true);
      return;
    }

    // Restore shuffle state from sessionStorage on first call, or reshuffle if exhausted
    if (this.queueIndex >= this.shuffledQueue.length) {
      if (!this.restoreShuffleState()) {
        this.shuffleQueue();
      }
    }

    this.setTrack(this.shuffledQueue[this.queueIndex++], true);
    this.saveShuffleState();
  }
}

export default MusicManager;
