import {gameActions, gameState} from "./state";
import type {PlaybackMode} from "./state";
import {getAuthState, subscribeToAuth} from "@/lib/auth";
import {getUserProfile, enqueueProfileWrite} from "@/lib/user";
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
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private shuffledQueue: string[] = [];
  private queueIndex: number = 0;
  private initialPlayStarted: boolean = false;
  private authUnsubscribe: (() => void) | null = null;
  private narrationDone: boolean = false;
  private deferredPlay: (() => void) | null = null;
  private handleBeforeUnload: (() => void) | null = null;
  private handleGameplayStart: (() => void) | null = null;
  private playPromise: Promise<void> | null = null;
  private toggleInProgress: boolean = false;

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
    const mode = gameState.get().music.playbackMode;
    switch (mode) {
      case "repeat-one":
        void this.replayCurrent();
        break;
      case "shuffle":
        this.playRandom();
        break;
      case "normal":
      default:
        this.next();
        break;
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
      this.handleGameplayStart = () => {
        this.narrationDone = true;
        if (this.deferredPlay) {
          this.deferredPlay();
          this.deferredPlay = null;
        }
      };
      window.addEventListener(
        "tresr:gameplay-start",
        this.handleGameplayStart,
        {
          once: true,
        }
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
        try {
          if (state.isAuthenticated && !state.isGuest && state.user) {
            await this.loadPreferences(state.user.key);
          } else if (!this.initialPlayStarted && this.tracks.length > 0) {
            // Guest or unauthenticated — default to shuffle playback
            this.initialPlayStarted = true;
            gameActions.updateMusic({playbackMode: "shuffle"});
            this.playRandomAfterNarration();
          }
        } catch (err) {
          log.warn(COMPONENT_NAME, "Auth callback failed, falling back:", err);
          if (!this.initialPlayStarted && this.tracks.length > 0) {
            this.initialPlayStarted = true;
            gameActions.updateMusic({playbackMode: "shuffle"});
            this.playRandomAfterNarration();
          }
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

  /**
   * Start initial playback based on the current playback mode and favorite track.
   * Called after preferences are loaded or for guests.
   */
  private startInitialPlayback(isPaused: boolean) {
    const mode = gameState.get().music.playbackMode;
    const favorite = gameState.get().music.favoriteTrack;

    if (isPaused) {
      // If the user left the player paused, set the track but don't play
      if (favorite && this.tracks.includes(favorite)) {
        this.setTrack(favorite, false, false);
      } else if (mode === "shuffle") {
        // Queue up a random track silently (so the UI shows something)
        this.playAfterNarration(() => this.playRandom());
      }
      return;
    }

    switch (mode) {
      case "repeat-one":
        if (favorite && this.tracks.includes(favorite)) {
          this.playAfterNarration(() => this.setTrack(favorite, true, false));
        } else {
          // No favorite — fall back to shuffle for the first track
          this.playAfterNarration(() => this.playRandom());
        }
        break;
      case "normal":
        if (favorite && this.tracks.includes(favorite)) {
          // Favorite plays first, then sequential from there
          this.playAfterNarration(() => this.setTrack(favorite, true, false));
        } else {
          // No favorite — start from the first track
          this.playAfterNarration(() =>
            this.setTrack(this.tracks[0], true, false)
          );
        }
        break;
      case "shuffle":
      default:
        this.playRandomAfterNarration();
        break;
    }
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

        // Load playback mode (with backward compatibility for legacy `track` field)
        let mode: PlaybackMode = "shuffle";
        let favorite = "";

        if (prefs.playbackMode) {
          // New format — use directly
          mode = prefs.playbackMode;
          favorite = prefs.favoriteTrack || "";
        } else if ("track" in prefs) {
          // Legacy format: track was "random" or a track name
          const legacyTrack = (prefs as {track?: string}).track;
          if (legacyTrack && legacyTrack !== "random") {
            mode = "normal";
            favorite = legacyTrack;
          } else {
            mode = "shuffle";
          }
        }

        gameActions.updateMusic({
          playbackMode: mode,
          favoriteTrack: favorite,
        });

        this.startInitialPlayback(!!prefs.isPaused);
      } else {
        // Defaults from config
        const audioConfig = config.gameplay.audio;
        const defaultMusicVol = audioConfig.default_music_volume;
        const defaultSfxVol = audioConfig.default_sfx_volume;

        gameActions.updateMusic({playbackMode: "shuffle"});
        this.setVolume(defaultMusicVol, false);
        this.setSfxVolume(defaultSfxVol, false);
        this.playRandomAfterNarration();
      }
    } catch (e) {
      log.warn(
        COMPONENT_NAME,
        "Failed to load preferences, applying defaults:",
        e
      );
      const audioConfig = config.gameplay.audio;
      gameActions.updateMusic({playbackMode: "shuffle"});
      this.setVolume(audioConfig.default_music_volume, false);
      this.setSfxVolume(audioConfig.default_sfx_volume, false);
      this.playRandomAfterNarration();
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
        const musicState = gameState.get().music;
        await enqueueProfileWrite(userId, (profile) => ({
          ...profile,
          preferences: {
            ...profile.preferences,
            music: {
              favoriteTrack: musicState.favoriteTrack || undefined,
              playbackMode: musicState.playbackMode,
              volume: musicState.musicVolume,
              sfxVolume: musicState.sfxVolume,
              isPaused: !musicState.isPlaying,
            },
          },
        }));
        log.debug(COMPONENT_NAME, "Preferences persisted to Juno.");
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

  /**
   * Set and play a track.
   * @param track The track name to play.
   * @param forcePlay If true, start playback even if currently paused.
   * @param isFavorite If true, this was a manual user selection — persist as favorite.
   */
  public setTrack(
    track: string,
    forcePlay: boolean = false,
    isFavorite: boolean = false
  ) {
    if (!this.audio) return;
    const isPlaying = forcePlay || !this.audio.paused;
    const targetVolume = gameState.get().music.musicVolume;

    // Crossfade: fade out old track while fading in new one (ticket #177)
    if (isPlaying && !this.audio.paused && this.audio.src) {
      this.startCrossfade();
    }

    this.audio.src = `/assets/audio/music/${track}.webm`;

    const stateUpdate: Partial<ReturnType<typeof gameState.get>["music"]> = {
      currentTrack: track,
    };
    if (isFavorite) {
      stateUpdate.favoriteTrack = track;
    }
    gameActions.updateMusic(stateUpdate);

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

    const intervalId = setInterval(() => {
      // Stale callback — a new startCrossfade() replaced this.fadingOut.
      // Clear our own interval and bail (ticket #291).
      if (fadeOut !== this.fadingOut) {
        clearInterval(intervalId);
        return;
      }
      remaining--;
      if (remaining <= 0 || !fadeOut) {
        clearInterval(intervalId);
        if (this.fadeInterval === intervalId) this.fadeInterval = null;
        fadeOut.pause();
        fadeOut.src = "";
        this.fadingOut = null;
        return;
      }
      fadeOut.volume = Math.max(0, fadeOut.volume - volumeStep);
    }, crossfadeStep);
    this.fadeInterval = intervalId;
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

  public async toggle() {
    if (!this.audio || this.toggleInProgress) return;
    this.toggleInProgress = true;
    try {
      if (this.audio.paused) {
        await this.safePlay();
        gameActions.updateMusic({
          isPlaying: true,
        });
      } else {
        await this.safePause();
        gameActions.updateMusic({
          isPlaying: false,
        });
      }
      this.persistPreferences();
    } finally {
      this.toggleInProgress = false;
    }
  }

  /**
   * Set the playback mode directly.
   */
  public setPlaybackMode(mode: PlaybackMode) {
    gameActions.updateMusic({playbackMode: mode});
    this.persistPreferences();
  }

  /**
   * Cycle through playback modes: normal → shuffle → repeat-one → normal.
   */
  public cyclePlaybackMode(): PlaybackMode {
    const current = gameState.get().music.playbackMode;
    const order: PlaybackMode[] = ["normal", "shuffle", "repeat-one"];
    const idx = order.indexOf(current);
    const next = order[(idx + 1) % order.length];
    this.setPlaybackMode(next);
    return next;
  }

  /**
   * Replay the current track from the beginning (for repeat-one mode).
   */
  private async replayCurrent() {
    if (!this.audio) return;
    this.audio.currentTime = 0;
    await this.safePlay();
    gameActions.updateMusic({isPlaying: true});
  }

  public async stop() {
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
    await this.safePause();
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

  public async destroy() {
    if (this.authUnsubscribe) {
      this.authUnsubscribe();
      this.authUnsubscribe = null;
    }
    if (this.handleGameplayStart) {
      window.removeEventListener(
        "tresr:gameplay-start",
        this.handleGameplayStart
      );
      this.handleGameplayStart = null;
    }
    this.deferredPlay = null;
    if (this.handleBeforeUnload) {
      window.removeEventListener("beforeunload", this.handleBeforeUnload);
      this.handleBeforeUnload = null;
    }
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    await this.stop();
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
      const musicState = gameState.get().music;
      const prefs = {
        favoriteTrack: musicState.favoriteTrack || undefined,
        playbackMode: musicState.playbackMode,
        volume: musicState.musicVolume,
        sfxVolume: musicState.sfxVolume,
        isPaused: !musicState.isPlaying,
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
      await enqueueProfileWrite(userId, (profile) => ({
        ...profile,
        preferences: {
          ...profile.preferences,
          music: pending,
        },
      }));
      log.info(COMPONENT_NAME, "Synced pending preferences to Juno.");
    } catch (e) {
      log.warn(COMPONENT_NAME, "Failed to sync pending preferences:", e);
    }
  }

  public next() {
    if (this.tracks.length === 0) return;
    const mode = gameState.get().music.playbackMode;
    if (mode === "shuffle") {
      this.playRandom();
      return;
    }
    if (mode === "repeat-one") {
      this.replayCurrent();
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
