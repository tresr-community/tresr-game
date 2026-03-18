<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import MusicManager from "@/lib/game/MusicManager";
  import { gameState, type PlaybackMode } from "@/lib/game/state";
  import { config } from "@/lib/config/client";
  import { getAuthState } from "@/lib/auth";
  import { authStore } from "@/lib/auth/store";
  import { getUserProfile, enqueueProfileWrite } from "@/lib/user";

  const manager = MusicManager.getInstance();
  const tracks = config.assets.music;

  let currentTrackName = "Loading...";
  let isPlaying = false;
  let playbackMode: PlaybackMode = "shuffle";
  let currentTime = 0;
  let totalTime = 0;
  let progress = 0;
  let musicVolume = 75;
  let sfxVolume = 50;
  let favoriteTrack = "";

  let showNarration = false;
  let isNarrationEnabled = true;

  let unsubState: () => void;
  let unsubAuth: () => void;

  let narrationGeneration = 0;
  let narrationSaveGen = 0;
  let seekActive = false;

  onMount(() => {
    unsubState = gameState.subscribe((state) => {
      currentTrackName = state.music.currentTrack || "No Track Selected";
      isPlaying = state.music.isPlaying;
      currentTime = state.music.currentTime;
      totalTime = state.music.duration;
      if (!seekActive) {
        progress = state.music.duration > 0 ? (state.music.currentTime / state.music.duration) * 100 : 0;
      }
      musicVolume = state.music.musicVolume * 100;
      sfxVolume = state.music.sfxVolume * 100;
      playbackMode = state.music.playbackMode;
      favoriteTrack = state.music.favoriteTrack;
    });

    unsubAuth = authStore.subscribe(async (state) => {
      const gen = ++narrationGeneration;
      if (state.isAuthenticated && !state.isGuest && state.user) {
        showNarration = true;
        try {
          const doc = await getUserProfile(state.user.key);
          if (gen === narrationGeneration && doc) {
            isNarrationEnabled = doc.data.preferences.narration !== false;
          }
        } catch {}
      } else {
        showNarration = false;
      }
    });

    // Handle blur event to close dropdown
    const blurListener = (e: MouseEvent) => {
      if (document.activeElement?.closest('.dropdown')) {
        (document.activeElement as HTMLElement)?.blur();
      }
    };
    document.addEventListener("click", blurListener);

    return () => document.removeEventListener("click", blurListener);
  });

  onDestroy(() => {
    if (unsubState) unsubState();
    if (unsubAuth) unsubAuth();
  });

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

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
  }

  function handleSfxVolume(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value) / 100;
    manager.setSfxVolume(val);
  }

  function selectTrack(track: string) {
    manager.setTrack(track, true, true);
    (document.activeElement as HTMLElement)?.blur();
  }

  async function handleNarrationToggle() {
    isNarrationEnabled = !isNarrationEnabled;
    const gen = ++narrationSaveGen;
    const auth = getAuthState();
    if (!auth.isAuthenticated || auth.isGuest || !auth.user) return;
    try {
      if (gen !== narrationSaveGen) return;
      await enqueueProfileWrite(auth.user.key, (profile) => ({
        ...profile,
        preferences: {
          ...profile.preferences,
          narration: isNarrationEnabled,
        },
      }));
    } catch {}
  }
</script>

<div class="bg-base-300/90 border-primary/20 flex w-48 flex-col gap-1 rounded-lg border p-2 shadow-xl backdrop-blur select-none sm:w-64 sm:gap-2 sm:p-3">
  <!-- Track Info & Controls -->
  <div class="flex items-center justify-between gap-2">
    <div class="flex flex-col overflow-hidden">
      <span class="hidden text-[10px] font-bold uppercase opacity-50 sm:inline">Now Playing</span>
      <span class="text-primary truncate font-mono text-[10px] font-bold sm:text-xs">{currentTrackName}</span>
    </div>

    <div class="flex items-center gap-1">
      <button on:click={handlePrev} class="btn btn-xs btn-circle btn-ghost" aria-label="Previous track">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
      </button>
      <button on:click={handleToggle} class="btn btn-xs btn-circle btn-primary" aria-label="Play or pause">
        {#if isPlaying}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        {/if}
      </button>
      <button on:click={handleNext} class="btn btn-xs btn-circle btn-ghost" aria-label="Next track">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
      </button>
      <button on:click={handleModeClick} class={`btn btn-xs btn-circle btn-ghost ${playbackMode !== 'normal' ? 'btn-active text-primary' : ''}`} aria-label="Playback mode" title={playbackMode === 'normal' ? 'Normal' : playbackMode === 'shuffle' ? 'Shuffle' : 'Repeat One'}>
        {#if playbackMode === 'normal'}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="17" y1="18" x2="3" y2="18"></line></svg>
        {:else if playbackMode === 'shuffle'}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path><line x1="11" y1="10" x2="11" y2="18"></line><text x="11" y="16" text-anchor="middle" font-size="8" fill="currentColor" stroke="none">1</text></svg>
        {/if}
      </button>
    </div>
  </div>

  <!-- Progress Bar -->
  <div class="hidden flex-col gap-1 sm:flex">
    <input type="range" min="0" max="100" class="range range-primary range-xs h-1" bind:value={progress} on:input={handleSeekUpdate} on:mousedown={() => seekActive = true} on:mouseup={() => seekActive = false} on:touchstart={() => seekActive = true} on:touchend={() => seekActive = false} />
    <div class="flex justify-between font-mono text-[10px] opacity-50">
      <span>{formatTime(currentTime)}</span>
      <span>{formatTime(totalTime)}</span>
    </div>
  </div>

  <!-- Bottom: Track Selector -->
  <div class="hidden items-center gap-3 sm:flex">
    <div class="dropdown dropdown-bottom dropdown-start flex-1">
      <div tabindex="0" role="button" class="btn btn-xs btn-outline btn-primary w-full justify-between truncate px-2 font-mono text-[10px]">
        <span>Tracks</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"></path></svg>
      </div>
      <ul tabindex="0" class="dropdown-content menu bg-base-200 rounded-box border-primary/20 z-[1] mt-2 max-h-64 w-52 flex-col flex-nowrap overflow-x-hidden overflow-y-auto border p-2 shadow">
        {#each tracks as track}
          <!-- svelte-ignore a11y-missing-attribute -->
          <li><a class={`text-[10px] py-1 font-mono truncate ${favoriteTrack === track ? 'bg-primary/20 font-bold' : ''}`} on:click|preventDefault={() => selectTrack(track)}>{track}</a></li>
        {/each}
      </ul>
    </div>
  </div>

  <!-- Narration Toggle -->
  {#if showNarration}
  <div class="hidden items-center gap-2 max-sm:!hidden">
    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label class="label cursor-pointer gap-2 p-0">
      <span class="font-mono text-[10px] opacity-50">Narration</span>
      <input type="checkbox" checked={isNarrationEnabled} on:change={handleNarrationToggle} class="checkbox checkbox-primary checkbox-xs" />
    </label>
  </div>
  {/if}

  <!-- Volume Controls -->
  <div class="hidden items-center gap-4 sm:flex">
    <!-- Music Volume -->
    <div class="flex flex-1 items-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-50" aria-label="Music Volume"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
      <input type="range" min="0" max="100" class="range range-primary range-xs h-1 flex-1" bind:value={musicVolume} on:input={handleMusicVolume} title="Music Volume" />
    </div>

    <!-- SFX Volume -->
    <div class="flex flex-1 items-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-50" aria-label="SFX Volume"><path d="m9 12 2 2 4-4"></path><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"></path><path d="M22 19H2"></path></svg>
      <input type="range" min="0" max="100" class="range range-secondary range-xs h-1 flex-1" bind:value={sfxVolume} on:input={handleSfxVolume} title="SFX Volume" />
    </div>
  </div>
</div>
