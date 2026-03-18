<script lang="ts">
  import HowToPlayModal from "@/components/game/HowToPlayModal.svelte";
  import LeaderboardModal from "@/components/game/LeaderboardModal.svelte";
  import Loader from "@/components/game/Loader.svelte";
  import LoginButton from "@/components/auth/LoginButton.svelte";
  import VaultBalance from "@/components/wallet/VaultBalance.svelte";
  import BurnStats from "@/components/wallet/BurnStats.svelte";
  import Footer from "@/components/user/Footer.svelte";
  import {config} from "@/lib/config/client";
  import {onMount, onDestroy} from "svelte";

  const appName = config.app.name;
  const timeLimitMinutes = Math.floor(config.gameplay.time_limit_seconds / 60);

  const LAST_WALLPAPER_KEY = "tresr_last_wallpaper";
  let wallpaperBgUrl = "";
  let isWallpaperReady = false;
  let vaultLocked = false;
  let loginContent = "LOGIN";

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

  function handleVaultStatus(e: Event) {
    const {locked} = (e as CustomEvent).detail;
    vaultLocked = locked;
  }

  function handleLeaderboardClick() {
    document.dispatchEvent(new CustomEvent("tresr:open-leaderboard"));
  }

  function handleManualClick() {
    document.dispatchEvent(new CustomEvent("tresr:open-how-to-play"));
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

    document.addEventListener("tresr:vault-status", handleVaultStatus);
  });

  onDestroy(() => {
    document.removeEventListener("tresr:vault-status", handleVaultStatus);
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
    class="hero relative flex min-h-dvh flex-col justify-end pb-8 md:justify-center md:pb-12"
  >
    <div class="hero-content z-10 px-2 text-center md:px-4">
      <div class="max-w-3xl">
        <h1
          class="font-display text-primary mb-0 text-xl font-black tracking-tighter drop-shadow-[0_0_10px_rgba(var(--primary),0.8)] md:mb-2 md:text-5xl lg:text-7xl"
        >
          {appName}
        </h1>
        <p
          class="border-secondary/20 bg-base-100/50 my-0 rounded-lg border px-3 py-0.5 font-mono text-sm tracking-widest uppercase backdrop-blur md:my-8 md:py-6 md:text-xl lg:text-2xl"
        >
          <span class="text-info">COLLECT KEYS.</span>{" "}
          <span class="text-error">FIGHT ENEMIES.</span>{" "}
          <span class="text-warning italic">CLAIM THE $TRESR.</span>
        </p>

        <div class="mt-0.5 flex flex-col items-center gap-0 md:mt-8 md:gap-6">
          <div
            class="-mb-3 flex flex-col gap-1 md:mb-0 md:flex-row md:gap-4"
            style={vaultLocked ? "opacity: 0.5;" : ""}
          >
            <LoginButton />
            {#if vaultLocked}
              <div
                class="absolute inset-0 z-10 block pointer-events-auto cursor-not-allowed"
              ></div>
            {/if}
          </div>

          <div
            class="grid w-full max-w-4xl grid-cols-2 gap-1 opacity-80 md:grid-cols-3 md:gap-6"
          >
            <div class="stats bg-base-200/50 border-primary/20 border shadow">
              <div class="stat place-items-center">
                <div class="stat-title font-mono text-xs">OBJECTIVE</div>
                <div class="stat-value text-primary text-xl md:text-3xl">
                  COLLECT
                </div>
                <div class="stat-desc">Gather Keys</div>
              </div>
            </div>
            <div id="vault-display" class="hidden md:block">
              <VaultBalance />
            </div>
            <div class="stats bg-base-200/50 border-primary/20 border shadow">
              <div class="stat place-items-center">
                <div class="stat-title font-mono text-xs">THREAT</div>
                <div class="stat-value text-secondary text-xl md:text-3xl">
                  SURVIVE
                </div>
                <div class="stat-desc">{timeLimitMinutes} Minutes</div>
              </div>
            </div>
          </div>

          <BurnStats />
        </div>
      </div>
    </div>
  </div>

  <!-- Bottom Corner Buttons -->
  <div
    class="tooltip tooltip-right fixed bottom-8 left-8 z-30"
    data-tip="Leaderboard"
  >
    <!-- svelte-ignore a11y-missing-attribute -->
    <a
      role="button"
      tabindex="0"
      aria-label="Open Leaderboard"
      class="btn btn-ghost text-primary hover:bg-primary/10 hover:border-primary/50 gap-2 border border-transparent font-mono"
      on:click|preventDefault={handleLeaderboardClick}
      on:keydown={(e) => e.key === "Enter" && handleLeaderboardClick()}
    >
      <span class="text-xl">🏆</span>
      <span class="hidden lg:inline">LEADERBOARD</span>
    </a>
  </div>

  <div
    class="tooltip tooltip-left fixed right-8 bottom-8 z-30"
    data-tip="Manual"
  >
    <!-- svelte-ignore a11y-missing-attribute -->
    <a
      role="button"
      tabindex="0"
      aria-label="Open Game Manual"
      class="btn btn-ghost text-primary hover:bg-primary/10 hover:border-primary/50 gap-2 border border-transparent font-mono"
      on:click|preventDefault={handleManualClick}
      on:keydown={(e) => e.key === "Enter" && handleManualClick()}
    >
      <span class="hidden lg:inline">MANUAL</span>
      <span class="text-xl">❓</span>
    </a>
  </div>

  <Footer />
</div>

<HowToPlayModal />
<LeaderboardModal />
