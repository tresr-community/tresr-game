<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import NotificationBell from "@/components/notifications/NotificationBell.svelte";
  import WalletLink from "@/components/wallet/WalletLink.svelte";
  import FaucetButton from "@/components/wallet/FaucetButton.svelte";
  import NotificationToast from "@/components/notifications/NotificationToast.svelte";
  import {DropdownMenu} from "bits-ui";
  // Assuming MusicPlayer is ported, if not we ignore or use a placeholder
  import MusicPlayer from "@/components/game/MusicPlayer.svelte";

  import {initAuth, getAuthState} from "@/lib/auth";
  import {authStore} from "@/lib/auth/store.svelte";
  import {notificationManager} from "@/lib/notifications";
  import {enqueueProfileWrite} from "@/lib/user";
  import {claimsStore} from "@/lib/user/claimsStore.svelte";
  import {log} from "@/lib/utils/log";
  import {config} from "@/lib/config/client";
  import {initializeJunoSatellite} from "@/lib/utils/juno";
  import {getErrors} from "@/lib/satellite/satellite-api";
  import Button from "@/components/ui/Button.svelte";

  const COMPONENT_NAME = "Header";
  let isExpanded = $state(false);
  let currentUrgency: "none" | "non-urgent" | "urgent" = $state("none");
  let isAdmin = $state(false);

  /** Phone detection for fullscreen music (phones get fullscreen, tablets get large dropdown, desktop gets mini). Uses 896px to cover phone landscape. Touch devices get bigger targets via CSS. */
  let isMobile = $state(
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 896px)").matches
      : false
  );
  let isMusicOpen = $state(false);

  function handleMusicClick() {
    isMusicOpen = true;
    // Let HUD.svelte know so it can pause the game if in-session
    window.dispatchEvent(new CustomEvent("tresr:music-open"));
  }

  /** Dropdown auto-dismiss — 5 s, paused on hover */
  const DROP_CLOSE_MS = 5000;
  let musicDropOpen = $state(false);
  let musicDropTimer: ReturnType<typeof setTimeout> | null = null;
  let guestDropOpen = $state(false);
  let guestDropTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (!musicDropOpen) return;
    const t = setTimeout(() => {
      musicDropOpen = false;
    }, DROP_CLOSE_MS);
    musicDropTimer = t;
    return () => {
      clearTimeout(t);
      if (musicDropTimer === t) musicDropTimer = null;
    };
  });
  $effect(() => {
    if (!guestDropOpen) return;
    const t = setTimeout(() => {
      guestDropOpen = false;
    }, DROP_CLOSE_MS);
    guestDropTimer = t;
    return () => {
      clearTimeout(t);
      if (guestDropTimer === t) guestDropTimer = null;
    };
  });

  function resetMusicTimer() {
    if (musicDropTimer) clearTimeout(musicDropTimer);
    musicDropTimer = setTimeout(() => {
      musicDropOpen = false;
    }, DROP_CLOSE_MS);
  }
  function clearMusicTimer() {
    if (musicDropTimer) {
      clearTimeout(musicDropTimer);
      musicDropTimer = null;
    }
  }
  function resetGuestTimer() {
    if (guestDropTimer) clearTimeout(guestDropTimer);
    guestDropTimer = setTimeout(() => {
      guestDropOpen = false;
    }, DROP_CLOSE_MS);
  }
  function clearGuestTimer() {
    if (guestDropTimer) {
      clearTimeout(guestDropTimer);
      guestDropTimer = null;
    }
  }

  let isAuthenticated = $derived(authStore.value.isAuthenticated);
  let isGuest = $derived(authStore.value.isGuest);

  let headerIcons: HTMLDivElement;

  async function startup() {
    log.info(COMPONENT_NAME, "startup running");
    await initAuth();
    await notificationManager.init();
    await initializeJunoSatellite();

    if (isAuthenticated && !isGuest) {
      try {
        const result = await getErrors();
        isAdmin = "Ok" in result;
      } catch {
        isAdmin = false;
      }
    }
  }

  function handleAuthBtnClick() {
    window.dispatchEvent(new CustomEvent("tresr:open-profile"));
  }

  function handleToolbarClickOutside(e: MouseEvent) {
    const header = document.getElementById("app-header");
    if (
      header &&
      !header.contains(e.target as Node) &&
      isExpanded &&
      window.innerWidth < 1024
    ) {
      isExpanded = false;
    }
  }

  function handleToggle() {
    isExpanded = !isExpanded;
  }

  function handleBreakpointChange(e: MediaQueryListEvent) {
    isExpanded = e.matches;
  }

  onMount(() => {
    void startup();

    // Track phone breakpoint for music (phones <896px get fullscreen; tablets/desktop use dropdown). Touch devices get larger UI via CSS.
    const mobileMql = window.matchMedia(`(max-width: 1023px)`);
    isMobile = mobileMql.matches;
    const onMobileChange = (e: MediaQueryListEvent) => {
      isMobile = e.matches;
      // Close fullscreen overlay when switching to desktop
      if (!e.matches) isMusicOpen = false;
    };
    mobileMql.addEventListener("change", onMobileChange);

    const desktopMql = window.matchMedia(`(min-width: 1024px)`);
    isExpanded = desktopMql.matches;
    desktopMql.addEventListener("change", handleBreakpointChange);

    document.addEventListener("click", handleToolbarClickOutside);

    const unsubToggleNotifications = notificationManager.subscribe((notifs) => {
      const active = notifs.filter(
        (n) => !n.data.snoozeUntil || n.data.snoozeUntil < Date.now()
      );
      if (active.some((n) => n.data.urgency === "urgent"))
        currentUrgency = "urgent";
      else if (active.length > 0) currentUrgency = "non-urgent";
      else currentUrgency = "none";
    });

    return () => {
      mobileMql.removeEventListener("change", onMobileChange);
      desktopMql.removeEventListener("change", handleBreakpointChange);
      document.removeEventListener("click", handleToolbarClickOutside);
      unsubToggleNotifications();
    };
  });
</script>

<header
  id="app-header"
  class="pointer-events-none fixed top-0 right-0 left-0 z-[50] flex justify-end p-4"
  style="padding-top: max(1rem, var(--safe-top)); padding-right: max(1rem, var(--safe-right));"
>
  <div
    class="border-primary/20 pointer-events-auto flex items-center gap-2 rounded-full border bg-black/60 p-1 shadow-lg backdrop-blur-md"
  >
    <div
      bind:this={headerIcons}
      class="flex items-center gap-2 transition-all duration-300 ease-in-out"
      class:max-w-0={!isExpanded}
      class:opacity-0={!isExpanded}
      class:overflow-hidden={!isExpanded}
      style={isExpanded
        ? "max-width: 500px; opacity: 1;"
        : "max-width: 0; opacity: 0;"}
    >
      <NotificationBell />

      <WalletLink />
      <FaucetButton />

      <!-- Music trigger: fullscreen on phones, dropdown on tablets/desktop -->

      {#if !isMobile}
        <!-- Desktop: dropdown as before -->
        <DropdownMenu.Root bind:open={musicDropOpen}>
          <DropdownMenu.Trigger
            class="flex h-12 w-12 items-center justify-center rounded-full text-xl transition-colors hover:bg-white/10"
            title="Music Player"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              class="text-primary h-5 w-5 drop-shadow-[0_0_6px_var(--color-primary)]"
            >
              <path
                d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
              />
            </svg>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            class="z-[60] outline-none"
            sideOffset={8}
            align="end"
            onmouseenter={clearMusicTimer}
            onmouseleave={resetMusicTimer}
          >
            <MusicPlayer />
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {:else}
        <!-- Mobile: single tap opens fullscreen overlay -->
        <button
          onclick={handleMusicClick}
          class="flex h-12 w-12 items-center justify-center rounded-full text-xl transition-colors hover:bg-white/10"
          aria-label="Open Music Player"
          title="Music Player"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="text-primary h-5 w-5 drop-shadow-[0_0_6px_var(--color-primary)]"
          >
            <path
              d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
            />
          </svg>
        </button>
      {/if}

      {#if !isAuthenticated || isGuest}
        <!-- Profile: Guest -->
        <DropdownMenu.Root bind:open={guestDropOpen}>
          <DropdownMenu.Trigger
            class="flex h-12 w-12 items-center justify-center rounded-full text-xl transition-colors hover:bg-white/10"
            title="Profile (Guest)">👤</DropdownMenu.Trigger
          >
          <DropdownMenu.Content
            class="border-primary/20 z-[60] mt-2 w-72 rounded-xl border bg-black/80 p-4 shadow-xl backdrop-blur-md outline-none"
            sideOffset={8}
            align="end"
            onmouseenter={clearGuestTimer}
            onmouseleave={resetGuestTimer}
          >
            <h3 class="text-lg font-bold text-white">Profile</h3>
            <div class="mb-2 text-xs text-white/50">Unavailable</div>
            <p class="text-sm text-white/70">
              Please log in as a degen to access your profile.
            </p>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {:else}
        <!-- Profile: Authenticated -->
        <button
          onclick={handleAuthBtnClick}
          class="relative flex h-12 w-12 items-center justify-center rounded-full text-xl transition-colors hover:bg-white/10 {claimsStore.hasUrgentClaims
            ? 'bg-warning/20 animate-pulse shadow-[0_0_15px_var(--color-warning)]'
            : ''}"
          title="My Profile"
        >
          {#if claimsStore.hasUrgentClaims}
            <span class="absolute top-0 right-0 z-10 flex h-3 w-3">
              <span
                class="bg-warning absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              ></span>
              <span class="bg-warning relative inline-flex h-3 w-3 rounded-full"
              ></span>
            </span>
          {/if}
          👤
        </button>
      {/if}

      {#if isAdmin}
        <a
          href="/admin"
          class="flex h-12 w-12 items-center justify-center rounded-full text-xl transition-colors hover:bg-white/10"
          title="Admin Panel">🛡</a
        >
        <a
          href="/calc"
          class="flex h-12 w-12 items-center justify-center rounded-full text-xl transition-colors hover:bg-white/10"
          title="Prize Calculator">🧮</a
        >
      {/if}
    </div>

    <!-- Toggle button -->
    <Button
      variant="ghost"
      size="md"
      onclick={handleToggle}
      class="h-12 w-12 rounded-full text-lg transition-transform duration-300 {isExpanded
        ? 'rotate-180'
        : ''} {!isExpanded && currentUrgency === 'non-urgent'
        ? 'toggle-glow-orange'
        : ''} {!isExpanded && currentUrgency === 'urgent'
        ? 'toggle-glow-red'
        : ''}"
      title="Toggle toolbar"
    >
      «
    </Button>
  </div>
</header>

{#if isMusicOpen}
  <!-- Phone fullscreen music overlay (moved outside header pill to avoid max-w-0 clipping) -->
  <div
    class="fixed inset-0 z-[200] flex flex-col bg-black/95 backdrop-blur-md"
    style="padding-top: max(1rem, var(--safe-top)); padding-bottom: max(1rem, var(--safe-bottom));"
  >
    <div
      class="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3"
    >
      <h2 class="font-bold text-white">🎵 Music Player</h2>
      <button
        onclick={() => (isMusicOpen = false)}
        class="flex h-10 w-10 items-center justify-center rounded-full text-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Close music player">✕</button
      >
    </div>
    <div class="flex min-h-0 flex-1 overflow-y-auto px-4 md:px-0">
      <div
        class="mx-auto flex w-full max-w-2xl flex-col pt-1 pb-4 sm:pt-2 sm:pb-8"
      >
        <MusicPlayer isFullscreen={true} />
      </div>
    </div>
    <div
      class="flex shrink-0 animate-bounce items-center justify-center gap-1 py-2"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-3 w-3 text-white/30"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        ><path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M19 9l-7 7-7-7"
        /></svg
      >
      <span
        class="font-mono text-[10px] tracking-widest text-white/30 uppercase"
        >Scroll</span
      >
    </div>
  </div>
{/if}

<!-- <NotificationToast /> is handled globally in layout -->

<style>
  @keyframes toggle-breathe-orange {
    0%,
    100% {
      box-shadow: 0 0 4px rgba(255, 165, 0, 0.3);
    }
    50% {
      box-shadow:
        0 0 14px rgba(255, 165, 0, 0.8),
        0 0 28px rgba(255, 165, 0, 0.3);
    }
  }
  @keyframes toggle-breathe-red {
    0%,
    100% {
      box-shadow: 0 0 4px rgba(255, 0, 0, 0.3);
    }
    50% {
      box-shadow:
        0 0 14px rgba(255, 0, 0, 0.9),
        0 0 28px rgba(255, 0, 0, 0.4);
    }
  }
  :global(.toggle-glow-orange) {
    animation: toggle-breathe-orange 3s ease-in-out infinite;
  }
  :global(.toggle-glow-red) {
    animation: toggle-breathe-red 2s ease-in-out infinite;
  }

  @media (min-width: 1024px) {
    /* .flex.items-center.gap-2.transition-all {
      max-width: 500px !important;
      opacity: 1 !important;
    } */
  }
</style>
