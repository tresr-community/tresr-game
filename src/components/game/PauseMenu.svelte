<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { gameActions, gameState, type PlaybackMode } from "@/lib/game/state";
  import MusicManager from "@/lib/game/MusicManager";

  let dialog: HTMLDialogElement;
  let showQuitConfirm = false;

  const manager = MusicManager.getInstance();

  let trackName = "Loading...";
  let isPlaying = false;
  let playbackMode: PlaybackMode = "shuffle";
  let currentTime = 0;
  let totalTime = 0;
  let progress = 0;
  let musicVolume = 75;
  let sfxVolume = 50;

  let seekActive = false;
  let unsubState: () => void;

  onMount(() => {
    unsubState = gameState.subscribe((state) => {
      if (state.isPaused) {
        if (dialog && !dialog.open) {
          musicVolume = Math.round(state.music.musicVolume * 100);
          sfxVolume = Math.round(state.music.sfxVolume * 100);
          dialog.showModal();
        }
      } else {
        if (dialog && dialog.open) {
          dialog.close();
          (document.activeElement as HTMLElement)?.blur();
          document.querySelector("canvas")?.focus();
        }
        showQuitConfirm = false;
      }

      trackName = state.music.currentTrack || "No Track Selected";
      isPlaying = state.music.isPlaying;
      currentTime = state.music.currentTime;
      totalTime = state.music.duration;

      if (!seekActive) {
        progress = state.music.duration > 0 ? (state.music.currentTime / state.music.duration) * 100 : 0;
      }

      playbackMode = state.music.playbackMode;
    });
  });

  onDestroy(() => {
    if (unsubState) unsubState();
  });

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function handleResume() { gameActions.setPaused(false); }
  function handleAbort() { showQuitConfirm = true; }
  function handleQuitYes() { window.location.href = "/"; }
  function handleQuitCancel() { showQuitConfirm = false; }

  function handleToggle() { manager.toggle(); }
  function handlePrev() { manager.prev(); }
  function handleNext() { manager.next(); }
  function handleModeClick() { manager.cyclePlaybackMode(); }

  function handleSeekUpdate(e: Event) {
    const target = e.target as HTMLInputElement;
    progress = parseFloat(target.value);
    const val = (progress / 100) * totalTime;
    manager.seek(val);
  }

  function handleMusicVolume(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value) / 100;
    manager.setVolume(val);
    musicVolume = parseInt((e.target as HTMLInputElement).value); // reactive update
  }

  function handleSfxVolume(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value) / 100;
    manager.setSfxVolume(val);
    sfxVolume = parseInt((e.target as HTMLInputElement).value); // reactive update
  }
</script>

<dialog bind:this={dialog} id="pause-modal" class="modal modal-middle">
  <div class="modal-box border-primary/30 bg-base-300 flex h-full max-h-full w-full max-w-full flex-col overflow-y-auto border p-3 text-center sm:h-auto sm:max-h-[90vh] sm:w-auto sm:max-w-lg sm:rounded-2xl sm:p-6">
    <!-- Close button (top-right) -->
    <button on:click={handleResume} class="btn btn-circle btn-ghost absolute top-2 right-2 min-h-[44px] min-w-[44px] text-lg" aria-label="Close pause menu">✕</button>

    <h3 class="text-primary font-display text-xl font-black tracking-widest uppercase sm:text-4xl">
      Mission Paused
    </h3>

    <!-- Mini audio player -->
    <div class="bg-base-200/50 mt-3 rounded-lg p-3 sm:mt-5 sm:p-4">
      <!-- Track name -->
      <div class="mb-2 flex items-center justify-center gap-2">
        <span class="hidden text-[10px] font-bold uppercase opacity-50 sm:inline">Now Playing</span>
        <span class="text-primary truncate font-mono text-xs font-bold">{trackName}</span>
      </div>

      <!-- Playback controls -->
      <div class="mb-3 flex items-center justify-center gap-3">
        <button on:click={handlePrev} class="btn btn-sm btn-circle btn-ghost" aria-label="Previous track">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
        </button>

        <button on:click={handleToggle} class="btn btn-md btn-circle btn-primary" aria-label="Play or pause">
          {#if isPlaying}
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          {/if}
        </button>

        <button on:click={handleNext} class="btn btn-sm btn-circle btn-ghost" aria-label="Next track">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
        </button>

        <!-- Playback mode cycle -->
        <button on:click={handleModeClick} class={`btn btn-sm btn-circle btn-ghost ${playbackMode !== 'normal' ? 'btn-active text-primary' : ''}`} aria-label="Playback mode" title={playbackMode === 'normal' ? 'Normal' : playbackMode === 'shuffle' ? 'Shuffle' : 'Repeat One'}>
          {#if playbackMode === 'normal'}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="17" y1="18" x2="3" y2="18"></line></svg>
          {:else if playbackMode === 'shuffle'}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path><line x1="11" y1="10" x2="11" y2="18"></line><text x="11" y="16" text-anchor="middle" font-size="8" fill="currentColor" stroke="none">1</text></svg>
          {/if}
        </button>
      </div>

      <!-- Progress bar + timestamps -->
      <div class="mb-3 flex flex-col gap-1">
        <input type="range" min="0" max="100" bind:value={progress} on:input={handleSeekUpdate} on:mousedown={() => seekActive = true} on:mouseup={() => seekActive = false} on:touchstart={() => seekActive = true} on:touchend={() => seekActive = false} class="range range-primary range-xs w-full" />
        <div class="flex justify-between font-mono text-[10px] opacity-50">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalTime)}</span>
        </div>
      </div>

      <!-- Volume sliders -->
      <div class="mb-2 flex items-center justify-between sm:mb-3">
        <!-- svelte-ignore a11y-label-has-associated-control -->
        <label class="text-xs font-bold uppercase opacity-60">Music</label>
        <span class="font-mono text-xs opacity-50">{musicVolume}%</span>
      </div>
      <input type="range" min="0" max="100" bind:value={musicVolume} on:input={handleMusicVolume} class="range range-primary range-xs sm:range-sm w-full" />

      <div class="mt-2 mb-1 flex items-center justify-between sm:mt-3">
        <!-- svelte-ignore a11y-label-has-associated-control -->
        <label class="text-xs font-bold uppercase opacity-60">SFX</label>
        <span class="font-mono text-xs opacity-50">{sfxVolume}%</span>
      </div>
      <input type="range" min="0" max="100" bind:value={sfxVolume} on:input={handleSfxVolume} class="range range-secondary range-xs sm:range-sm w-full" />
    </div>

    <div class="modal-action flex-col gap-1 sm:gap-2">
      <button on:click={handleResume} class="btn btn-primary btn-block btn-sm sm:btn-md">Get back in the fight</button>
      <button on:click={handleAbort} class="btn btn-ghost btn-block btn-sm sm:btn-md text-error">Return Home</button>
    </div>

    <!-- Quit confirmation -->
    <div class={`mt-4 ${showQuitConfirm ? '' : 'hidden'}`}>
      <p class="text-error text-sm font-bold">Are you sure? Progress will be lost.</p>
      <div class="mt-2 flex gap-2">
        <button on:click={handleQuitYes} class="btn btn-error btn-sm flex-1">Yes, quit</button>
        <button on:click={handleQuitCancel} class="btn btn-ghost btn-sm flex-1">Cancel</button>
      </div>
    </div>
  </div>
</dialog>
