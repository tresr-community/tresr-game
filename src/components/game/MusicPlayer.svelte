<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  let {isFullscreen = false} = $props<{isFullscreen?: boolean}>();
  import MusicManager from "@/lib/game/MusicManager";
  import {gameState, type PlaybackMode} from "@/lib/game/state";
  import {config} from "@/lib/config/client";
  import {getAuthState} from "@/lib/auth";
  import {authStore} from "@/lib/auth/store.svelte";
  import {getUserProfile, enqueueProfileWrite} from "@/lib/user";

  const manager = MusicManager.getInstance();
  const tracks = config.assets.music;

  let currentTrackName = $state("Loading...");
  let isPlaying = $state(false);
  let playbackMode: PlaybackMode = $state("shuffle");
  let currentTime = $state(0);
  let totalTime = $state(0);
  let progress = $state(0);
  let musicVolume = $state(75);
  let sfxVolume = $state(50);
  let favoriteTrack = $state("");

  let showNarration = $state(false);
  let isNarrationEnabled = $state(true);
  let isDropdownOpen = $state(false);

  let unsubState: () => void;

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
        progress =
          state.music.duration > 0
            ? (state.music.currentTime / state.music.duration) * 100
            : 0;
      }
      musicVolume = state.music.musicVolume * 100;
      sfxVolume = state.music.sfxVolume * 100;
      playbackMode = state.music.playbackMode;
      favoriteTrack = state.music.favoriteTrack;
    });

    $effect(() => {
      const state = authStore.value;
      const gen = ++narrationGeneration;
      if (state.isAuthenticated && !state.isGuest && state.user) {
        showNarration = true;
        getUserProfile(state.user.key)
          .then((doc) => {
            if (gen === narrationGeneration && doc) {
              isNarrationEnabled = doc.data.preferences.narration !== false;
            }
          })
          .catch(() => {});
      } else {
        showNarration = false;
      }
    });

    // Handle click outside to close dropdown
    const clickListener = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("#track-dropdown-container")) {
        isDropdownOpen = false;
      }
    };
    document.addEventListener("click", clickListener);

    return () => document.removeEventListener("click", clickListener);
  });

  onDestroy(() => {
    if (unsubState) unsubState();
  });

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function handleToggle() {
    if (!currentTrackName && tracks.length > 0) {
      const idx = Math.floor(Math.random() * tracks.length);
      selectTrack(tracks[idx]);
    } else {
      manager.toggle();
    }
  }
  function handlePrev() {
    manager.prev();
  }
  function handleNext() {
    manager.next();
  }
  function handleModeClick() {
    manager.cyclePlaybackMode();
  }

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
    isDropdownOpen = false;
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

<div
  class="flex flex-col select-none {isFullscreen
    ? 'w-full px-4 pb-2 sm:px-12 sm:pb-8'
    : 'border-primary/20 w-80 gap-2 rounded-xl border bg-black/90 p-3 shadow-2xl backdrop-blur sm:w-96 sm:gap-3 sm:p-4'}"
>
  <!-- Track Info & Controls -->
  <div
    id="track-dropdown-container"
    class="relative flex {isFullscreen
      ? 'shrink-0 flex-col items-center gap-2'
      : 'shrink-0 items-center justify-between gap-2'}"
  >
    <button
      class="flex cursor-pointer flex-col overflow-hidden hover:opacity-80 {isFullscreen
        ? 'items-center text-center'
        : 'text-left'}"
      onclick={(e) => {
        if (!isFullscreen) {
          e.stopPropagation();
          isDropdownOpen = !isDropdownOpen;
        }
      }}
      type="button"
    >
      <span
        class="text-xs font-bold uppercase opacity-50 {isFullscreen
          ? 'mb-2 inline tracking-widest'
          : 'hidden sm:inline'}"
      >
        Now Playing
        {#if !isFullscreen}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="ml-1 inline-block"><path d="m6 9 6 6 6-6"></path></svg
          >
        {/if}
      </span>
      <span
        class="text-primary truncate font-mono font-bold {isFullscreen
          ? 'mt-1 text-4xl tracking-wide'
          : 'text-xs sm:text-sm'}"
      >
        {currentTrackName}
      </span>
    </button>
    {#if !isFullscreen && isDropdownOpen}
      <ul
        id="track-dropdown"
        class="border-primary/20 scrollbar-thumb-primary/50 scrollbar-thin scrollbar-track-transparent absolute top-full left-0 z-50 mt-2 max-h-64 w-full min-w-[16rem] flex-col flex-nowrap overflow-x-hidden overflow-y-auto rounded-lg border bg-black/90 p-2 shadow"
      >
        {#each tracks as track}
          <li>
            <!-- svelte-ignore a11y_missing_attribute -->
            <a
              role="button"
              tabindex="0"
              class={`block cursor-pointer truncate rounded px-2 py-1 font-mono text-xs hover:bg-white/10 ${favoriteTrack === track ? "text-primary bg-primary/20 font-bold" : ""}`}
              onclick={(e) => {
                e.preventDefault();
                selectTrack(track);
              }}
              onkeydown={(e) => e.key === "Enter" && selectTrack(track)}
              >{track}</a
            >
          </li>
        {/each}
      </ul>
    {/if}

    <div
      class="flex items-center {isFullscreen
        ? 'mt-4 w-full justify-center gap-6'
        : 'gap-1'}"
    >
      <button
        onclick={handlePrev}
        class="flex items-center justify-center rounded-full transition-colors hover:bg-white/10 active:scale-95 {isFullscreen
          ? 'h-16 w-16'
          : 'h-9 w-9'}"
        aria-label="Previous track"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={isFullscreen ? "18" : "14"}
          height={isFullscreen ? "18" : "14"}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><polygon points="19 20 9 12 19 4 19 20"></polygon><line
            x1="5"
            y1="19"
            x2="5"
            y2="5"
          ></line></svg
        >
      </button>
      <button
        onclick={handleToggle}
        class="bg-primary hover:bg-primary/80 flex items-center justify-center rounded-full text-black transition-colors active:scale-95 {isFullscreen
          ? 'h-24 w-24'
          : 'h-10 w-10'}"
        aria-label="Play or pause"
      >
        {#if isPlaying}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={isFullscreen ? "24" : "14"}
            height={isFullscreen ? "24" : "14"}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><rect x="6" y="4" width="4" height="16"></rect><rect
              x="14"
              y="4"
              width="4"
              height="16"
            ></rect></svg
          >
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={isFullscreen ? "24" : "14"}
            height={isFullscreen ? "24" : "14"}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><polygon points="5 3 19 12 5 21 5 3"></polygon></svg
          >
        {/if}
      </button>
      <button
        onclick={handleNext}
        class="flex items-center justify-center rounded-full transition-colors hover:bg-white/10 active:scale-95 {isFullscreen
          ? 'h-16 w-16'
          : 'h-9 w-9'}"
        aria-label="Next track"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={isFullscreen ? "18" : "14"}
          height={isFullscreen ? "18" : "14"}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><polygon points="5 4 15 12 5 20 5 4"></polygon><line
            x1="19"
            y1="5"
            x2="19"
            y2="19"
          ></line></svg
        >
      </button>
      {#if !isFullscreen}
        <button
          onclick={handleModeClick}
          class={`flex items-center justify-center rounded-full transition-colors hover:bg-white/10 active:scale-95 ${playbackMode !== "normal" ? "text-primary" : "text-white/60"} h-9 w-9`}
          aria-label="Playback mode"
          title={playbackMode === "normal"
            ? "Normal"
            : playbackMode === "shuffle"
              ? "Shuffle"
              : "Repeat One"}
        >
          {#if playbackMode === "normal"}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><line x1="17" y1="10" x2="3" y2="10"></line><line
                x1="21"
                y1="6"
                x2="3"
                y2="6"
              ></line><line x1="21" y1="14" x2="3" y2="14"></line><line
                x1="17"
                y1="18"
                x2="3"
                y2="18"
              ></line></svg
            >
          {:else if playbackMode === "shuffle"}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><polyline points="16 3 21 3 21 8"></polyline><line
                x1="4"
                y1="20"
                x2="21"
                y2="3"
              ></line><polyline points="21 16 21 21 16 21"></polyline><line
                x1="15"
                y1="15"
                x2="21"
                y2="21"
              ></line><line x1="4" y1="4" x2="9" y2="9"></line></svg
            >
          {:else}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><polyline points="17 1 21 5 17 9"></polyline><path
                d="M3 11V9a4 4 0 0 1 4-4h14"
              ></path><polyline points="7 23 3 19 7 15"></polyline><path
                d="M21 13v2a4 4 0 0 1-4 4H3"
              ></path><line x1="11" y1="10" x2="11" y2="18"></line><text
                x="11"
                y="16"
                text-anchor="middle"
                font-size="8"
                fill="currentColor"
                stroke="none">1</text
              ></svg
            >
          {/if}
        </button>
      {/if}
    </div>
  </div>

  <!-- Progress Bar & Volumes Wrapper -->
  <div
    class="shrink-0 flex-col gap-4 {isFullscreen
      ? 'mt-4 flex w-full'
      : 'mt-2 hidden w-full sm:flex'}"
  >
    <!-- Progress Bar -->
    <div class="flex w-full flex-col gap-1">
      <input
        type="range"
        min="0"
        max="100"
        class="accent-primary h-1 w-full cursor-pointer"
        bind:value={progress}
        oninput={handleSeekUpdate}
        onmousedown={() => (seekActive = true)}
        onmouseup={() => (seekActive = false)}
        ontouchstart={() => (seekActive = true)}
        ontouchend={() => (seekActive = false)}
      />
      <div
        class="flex items-center justify-between font-mono text-xs opacity-50"
      >
        <span>{formatTime(currentTime)}</span>
        {#if isFullscreen}
          <button
            onclick={handleModeClick}
            class={`flex items-center justify-center rounded-full opacity-100 transition-colors hover:bg-white/10 active:scale-95 ${playbackMode !== "normal" ? "text-primary" : "text-white/60"} h-8 w-8`}
            aria-label="Playback mode"
            title={playbackMode === "normal"
              ? "Normal"
              : playbackMode === "shuffle"
                ? "Shuffle"
                : "Repeat One"}
          >
            {#if playbackMode === "normal"}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><line x1="17" y1="10" x2="3" y2="10"></line><line
                  x1="21"
                  y1="6"
                  x2="3"
                  y2="6"
                ></line><line x1="21" y1="14" x2="3" y2="14"></line><line
                  x1="17"
                  y1="18"
                  x2="3"
                  y2="18"
                ></line></svg
              >
            {:else if playbackMode === "shuffle"}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><polyline points="16 3 21 3 21 8"></polyline><line
                  x1="4"
                  y1="20"
                  x2="21"
                  y2="3"
                ></line><polyline points="21 16 21 21 16 21"></polyline><line
                  x1="15"
                  y1="15"
                  x2="21"
                  y2="21"
                ></line><line x1="4" y1="4" x2="9" y2="9"></line></svg
              >
            {:else}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><polyline points="17 1 21 5 17 9"></polyline><path
                  d="M3 11V9a4 4 0 0 1 4-4h14"
                ></path><polyline points="7 23 3 19 7 15"></polyline><path
                  d="M21 13v2a4 4 0 0 1-4 4H3"
                ></path><line x1="11" y1="10" x2="11" y2="18"></line><text
                  x="11"
                  y="16"
                  text-anchor="middle"
                  font-size="8"
                  fill="currentColor"
                  stroke="none">1</text
                ></svg
              >
            {/if}
          </button>
        {/if}
        <span>{formatTime(totalTime)}</span>
      </div>
    </div>

    <!-- Volume Controls -->
    <div class="w-full flex-col gap-2 {isFullscreen ? 'flex gap-6' : 'flex'}">
      <!-- Music Volume -->
      <div class="flex flex-1 items-center {isFullscreen ? 'gap-4' : 'gap-2'}">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="opacity-50"
          aria-label="Music Volume"
          ><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path
            d="M15.54 8.46a5 5 0 0 1 0 7.07"
          ></path></svg
        >
        <input
          type="range"
          min="0"
          max="100"
          class="accent-primary h-1 flex-1 cursor-pointer"
          bind:value={musicVolume}
          oninput={handleMusicVolume}
          title="Music Volume"
        />
      </div>

      <!-- SFX Volume -->
      <div class="flex flex-1 items-center {isFullscreen ? 'gap-4' : 'gap-2'}">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="opacity-50"
          aria-label="SFX Volume"
          ><path d="m9 12 2 2 4-4"></path><path
            d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"
          ></path><path d="M22 19H2"></path></svg
        >
        <input
          type="range"
          min="0"
          max="100"
          class="accent-secondary h-1 flex-1 cursor-pointer"
          bind:value={sfxVolume}
          oninput={handleSfxVolume}
          title="SFX Volume"
        />
      </div>
    </div>

    <!-- Narration Toggle -->
    {#if showNarration}
      <div
        class="items-center gap-2 {isFullscreen
          ? 'mt-2 ml-1 flex w-full'
          : 'mt-1 flex'}"
      >
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="flex cursor-pointer items-center gap-2 p-0">
          <span class="font-mono text-xs opacity-50">Narration</span>
          <input
            type="checkbox"
            checked={isNarrationEnabled}
            onchange={handleNarrationToggle}
            class="accent-primary h-3 w-3 cursor-pointer"
          />
        </label>
      </div>
    {/if}
  </div>

  <!-- Inline Tracklist (Fullscreen Only) -->
  {#if isFullscreen}
    <div
      class="relative mt-2 flex flex-col rounded-2xl border border-white/10 bg-white/5 p-4 sm:mt-4"
    >
      <div
        class="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 rounded-t-2xl bg-gradient-to-b from-black/20 to-transparent"
      ></div>
      <h3
        class="mb-3 shrink-0 text-center text-xs font-bold tracking-widest uppercase opacity-50"
      >
        Up Next
      </h3>
      <ul
        class="scrollbar-thin scrollbar-thumb-primary/50 scrollbar-track-transparent flex flex-1 flex-col overflow-y-auto pr-2"
      >
        {#each tracks as track}
          <li class="mb-1 shrink-0">
            <!-- svelte-ignore a11y_missing_attribute -->
            <a
              role="button"
              tabindex="0"
              class={`block cursor-pointer truncate rounded-xl px-4 py-3 font-mono text-sm transition-all hover:bg-white/10 active:scale-[0.98] ${favoriteTrack === track ? "text-primary bg-primary/20 font-bold shadow-inner" : "text-white/80"}`}
              onclick={(e) => {
                e.preventDefault();
                selectTrack(track);
              }}
              onkeydown={(e) => e.key === "Enter" && selectTrack(track)}
            >
              <div class="flex items-center gap-3">
                {#if favoriteTrack === track}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="text-primary shrink-0"
                  >
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                {:else}
                  <div class="h-[14px] w-[14px]"></div>
                {/if}
                <span class="truncate">{track}</span>
              </div>
            </a>
          </li>
        {/each}
      </ul>
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 rounded-b-2xl bg-gradient-to-t from-black/40 to-transparent"
      ></div>
    </div>
  {/if}
</div>
