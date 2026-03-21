<script lang="ts">
  import HowToPlayModal from "@/components/game/HowToPlayModal.svelte";
  import LeaderboardModal from "@/components/game/LeaderboardModal.svelte";
  import Loader from "@/components/game/Loader.svelte";
  import LoginButton from "@/components/auth/LoginButton.svelte";
  import VaultBalance from "@/components/wallet/VaultBalance.svelte";
  import BurnStats from "@/components/wallet/BurnStats.svelte";
  import Footer from "@/components/user/Footer.svelte";
  import {config} from "@/lib/config/client";
  import {onMount} from "svelte";
  import {openLeaderboard, openHowToPlay} from "@/lib/stores/ui.svelte";

  const appName = config.app.name;
  const timeLimitMinutes = Math.floor(config.gameplay.time_limit_seconds / 60);

  const LAST_WALLPAPER_KEY = "tresr_last_wallpaper";
  let wallpaperBgUrl = $state("");
  let isWallpaperReady = $state(false);

  function selectWallpaper() {
    const wallpapers = config.assets.wallpapers;
    if (wallpapers.length === 0) return "";

    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_WALLPAPER_KEY);
    } catch {}

    let candidates = wallpapers;
    if (last && wallpapers.length > 1) {
      candidates = wallpapers.filter((w) => w !== last);
    }

    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    try {
      localStorage.setItem(LAST_WALLPAPER_KEY, selected);
    } catch {}
    return selected;
  }

  function handleLeaderboardClick() {
    openLeaderboard.open();
  }

  function handleManualClick() {
    openHowToPlay.open();
  }

  onMount(() => {
    const wallpaper = selectWallpaper();
    if (wallpaper) {
      const img = new Image();
      img.onload = () => {
        wallpaperBgUrl = `url('${img.src}')`;
        isWallpaperReady = true;
      };
      img.src = `/assets/images/wallpapers/${wallpaper}.webp`;
    }
  });
</script>

<svelte:head>
  <title>{appName}</title>
</svelte:head>

<Loader />

<!-- Wallpaper Background -->
<div
  class={`pointer-events-none fixed inset-0 z-[-2] bg-cover bg-center bg-no-repeat transition-opacity duration-1000 ${isWallpaperReady ? "opacity-30" : "opacity-0"}`}
  style={isWallpaperReady ? `background-image: ${wallpaperBgUrl}` : ""}
></div>

<!-- Terminal Grid Background -->
<div
  class="pointer-events-none fixed inset-0 z-[-1] bg-[linear-gradient(rgba(18,16,11,0.8)_2px,transparent_2px),linear-gradient(90deg,rgba(18,16,11,0.8)_2px,transparent_2px)] bg-[size:40px_40px] opacity-20"
></div>

<div id="main-content" class="transition-opacity duration-1000">
  <div
    class="relative flex min-h-dvh flex-col items-center justify-center pb-12"
  >
    <div
      class="z-10 flex w-full flex-col items-center px-2 text-center md:px-4"
    >
      <div class="flex max-w-3xl flex-col items-center">
        <h1
          class="font-display text-primary mb-1 text-5xl font-black tracking-tighter drop-shadow-[0_0_10px_rgba(var(--color-primary),0.8)] sm:mb-2 sm:text-6xl md:text-7xl lg:text-8xl"
        >
          {appName}
        </h1>
        <p
          class="border-secondary/20 mt-1 mb-3 rounded-lg border bg-black/50 px-3 py-1 font-mono text-[10px] tracking-widest uppercase backdrop-blur sm:mb-4 sm:px-4 sm:py-1.5 sm:text-xs md:mb-6 md:text-sm lg:text-xl"
        >
          <span class="text-info">COLLECT KEYS.</span>{" "}
          <span class="text-error">FIGHT ENEMIES.</span>{" "}
          <span class="text-warning italic">CLAIM THE $TRESR.</span>
        </p>

        <div
          class="mt-2 flex w-full shrink-0 flex-col items-center gap-4 md:mt-4 md:gap-6"
        >
          <div class="relative z-10 flex shrink-0 flex-col gap-1">
            <LoginButton />
          </div>

          <div
            class="grid w-full max-w-4xl shrink-0 grid-cols-2 gap-3 opacity-90 sm:gap-4 md:grid-cols-3 md:gap-6"
          >
            <div
              class="border-primary/20 flex shrink-0 flex-col items-center justify-center rounded-xl border bg-black/40 px-2 py-3 shadow backdrop-blur sm:px-5 sm:py-4"
            >
              <div
                class="font-mono text-[10px] uppercase opacity-50 sm:text-xs"
              >
                OBJECTIVE
              </div>
              <div
                class="text-primary mt-1 font-mono text-xl font-bold sm:mt-1.5 sm:text-2xl md:text-3xl"
              >
                COLLECT
              </div>
              <div class="mt-1 text-[10px] opacity-40 sm:text-xs">
                Gather Keys
              </div>
            </div>
            <div
              id="vault-display"
              class="hidden shrink-0 overflow-hidden rounded-xl md:block"
            >
              <VaultBalance />
            </div>
            <div
              class="border-primary/20 flex shrink-0 flex-col items-center justify-center rounded-xl border bg-black/40 px-2 py-3 shadow backdrop-blur sm:px-5 sm:py-4"
            >
              <div
                class="font-mono text-[10px] uppercase opacity-50 sm:text-xs"
              >
                THREAT
              </div>
              <div
                class="text-secondary mt-1 font-mono text-xl font-bold sm:mt-1.5 sm:text-2xl md:text-3xl"
              >
                SURVIVE
              </div>
              <div class="mt-1 text-[10px] opacity-40 sm:text-xs">
                {timeLimitMinutes} Minutes
              </div>
            </div>
          </div>

          <div class="w-full shrink-0">
            <BurnStats />
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Bottom Corner Buttons -->
  <div class="fixed bottom-8 left-8 z-30">
    <button
      type="button"
      aria-label="Open Leaderboard"
      title="Leaderboard"
      class="border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50 inline-flex items-center gap-2 rounded-md border bg-transparent px-4 py-2 font-mono transition-all"
      onclick={handleLeaderboardClick}
    >
      <span class="text-xl">🏆</span>
      <span class="hidden lg:inline">LEADERBOARD</span>
    </button>
  </div>

  <div class="fixed right-8 bottom-8 z-30">
    <button
      type="button"
      aria-label="Open Game Manual"
      title="Manual"
      class="border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50 inline-flex items-center gap-2 rounded-md border bg-transparent px-4 py-2 font-mono transition-all"
      onclick={handleManualClick}
    >
      <span class="hidden lg:inline">MANUAL</span>
      <span class="text-xl">❓</span>
    </button>
  </div>

  <Footer />
</div>

<HowToPlayModal />
<LeaderboardModal />
