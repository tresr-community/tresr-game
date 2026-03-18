<script lang="ts">
  import {onMount, onDestroy} from "svelte";
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

    // Handle blur event to close dropdown
    const blurListener = (e: MouseEvent) => {
      if (document.activeElement?.closest(".dropdown")) {
        (document.activeElement as HTMLElement)?.blur();
      }
    };
    document.addEventListener("click", blurListener);

    return () => document.removeEventListener("click", blurListener);
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
    manager.toggle();
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

<div
  class="border-primary/20 flex w-48 flex-col gap-1 rounded-lg border bg-black/80 p-2 shadow-xl backdrop-blur select-none sm:w-64 sm:gap-2 sm:p-3"
>
  <!-- Track Info & Controls -->
  <div class="flex items-center justify-between gap-2">
    <div class="flex flex-col overflow-hidden">
      <span class="hidden text-[10px] font-bold uppercase opacity-50 sm:inline"
        >Now Playing</span
      >
      <span
        class="text-primary truncate font-mono text-[10px] font-bold sm:text-xs"
        >{currentTrackName}</span
      >
    </div>

    <div class="flex items-center gap-1">
      <button
        onclick={handlePrev}
        class="flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-white/10"
        aria-label="Previous track"
      >
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
        class="bg-primary hover:bg-primary/80 flex h-6 w-6 items-center justify-center rounded-full text-black transition-colors"
        aria-label="Play or pause"
      >
        {#if isPlaying}
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
            width="14"
            height="14"
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
        class="flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-white/10"
        aria-label="Next track"
      >
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
          ><polygon points="5 4 15 12 5 20 5 4"></polygon><line
            x1="19"
            y1="5"
            x2="19"
            y2="19"
          ></line></svg
        >
      </button>
      <button
        onclick={handleModeClick}
        class={`flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-white/10 ${playbackMode !== "normal" ? "text-primary" : "text-white/60"}`}
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
    </div>
  </div>

  <!-- Progress Bar -->
  <div class="hidden flex-col gap-1 sm:flex">
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
    <div class="flex justify-between font-mono text-[10px] opacity-50">
      <span>{formatTime(currentTime)}</span>
      <span>{formatTime(totalTime)}</span>
    </div>
  </div>

  <!-- Bottom: Track Selector -->
  <div class="hidden items-center gap-3 sm:flex">
    <div class="relative flex-1">
      <button
        class="border-primary/40 text-primary hover:bg-primary/10 flex w-full items-center justify-between truncate rounded border px-2 py-0.5 font-mono text-[10px] transition-colors"
        onclick={(e) => {
          e.stopPropagation();
          const el = e.currentTarget.nextElementSibling as HTMLElement;
          el &&
            (el.style.display =
              el.style.display === "block" ? "none" : "block");
        }}
        type="button"
      >
        <span>Tracks</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"><path d="m18 15-6-6-6 6"></path></svg
        >
      </button>
      <ul
        class="border-primary/20 absolute bottom-full left-0 z-[1] mb-2 hidden max-h-64 w-52 flex-col flex-nowrap overflow-x-hidden overflow-y-auto rounded-lg border bg-black/90 p-2 shadow"
        style="display:none"
      >
        {#each tracks as track}
          <li>
            <!-- svelte-ignore a11y_missing_attribute -->
            <a
              role="button"
              tabindex="0"
              class={`block cursor-pointer truncate rounded px-2 py-1 font-mono text-[10px] hover:bg-white/10 ${favoriteTrack === track ? "bg-primary/20 text-primary font-bold" : ""}`}
              onclick={(e) => {
                e.preventDefault();
                selectTrack(track);
                (e.currentTarget.closest("ul") as HTMLElement).style.display =
                  "none";
              }}
              onkeydown={(e) => e.key === "Enter" && selectTrack(track)}
              >{track}</a
            >
          </li>
        {/each}
      </ul>
    </div>
  </div>

  <!-- Narration Toggle -->
  {#if showNarration}
    <div class="hidden items-center gap-2 max-sm:!hidden">
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label class="flex cursor-pointer items-center gap-2 p-0">
        <span class="font-mono text-[10px] opacity-50">Narration</span>
        <input
          type="checkbox"
          checked={isNarrationEnabled}
          onchange={handleNarrationToggle}
          class="accent-primary h-3 w-3 cursor-pointer"
        />
      </label>
    </div>
  {/if}

  <!-- Volume Controls -->
  <div class="hidden items-center gap-4 sm:flex">
    <!-- Music Volume -->
    <div class="flex flex-1 items-center gap-2">
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
    <div class="flex flex-1 items-center gap-2">
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
</div>
