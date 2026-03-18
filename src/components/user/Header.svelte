<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import NotificationBell from "@/components/notifications/NotificationBell.svelte";
  import WalletLink from "@/components/wallet/WalletLink.svelte";
  import FaucetButton from "@/components/wallet/FaucetButton.svelte";
  import NotificationToast from "@/components/notifications/NotificationToast.svelte";
  // Assuming MusicPlayer is ported, if not we ignore or use a placeholder
  import MusicPlayer from "@/components/game/MusicPlayer.svelte";

  import { initAuth, getAuthState } from "@/lib/auth";
  import { authStore } from "@/lib/auth/store";
  import { notificationManager } from "@/lib/notifications";
  import { enqueueProfileWrite } from "@/lib/user";
  import { log } from "@/lib/utils/log";
  import { config } from "@/lib/config/client";
  import { initSatellite } from "@junobuild/core";
  import { getErrors } from "@/lib/satellite/satellite-api";

  const COMPONENT_NAME = "Header";
  const availableThemes = config.daisyui?.themes || [];

  let currentTheme = "synthwave";
  let isExpanded = false;
  let currentUrgency: "none" | "non-urgent" | "urgent" = "none";
  let isAdmin = false;

  $: authState = $authStore;
  $: isAuthenticated = authState.isAuthenticated;
  $: isGuest = authState.isGuest;

  let headerIcons: HTMLDivElement;
  let allDropdowns: HTMLDetailsElement[] = [];

  function setTheme(theme: string) {
    currentTheme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    log.debug(COMPONENT_NAME, `Updating user theme to ${theme}`);

    const auth = getAuthState();
    if (auth.isAuthenticated && auth.user && !auth.isGuest) {
      enqueueProfileWrite(auth.user.key, (profile) => ({
        ...profile,
        preferences: { ...profile.preferences, theme },
      })).catch((e) => log.error(COMPONENT_NAME, "Failed to persist theme", e));
    }
  }

  async function startup() {
    log.info(COMPONENT_NAME, "startup running");
    await initAuth();
    await notificationManager.init();
    await initSatellite();

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
    document.dispatchEvent(new CustomEvent("tresr:open-profile"));
  }

  function handleDropdownClickOutside(e: MouseEvent) {
    allDropdowns.forEach(dd => {
      if (dd.open && !dd.contains(e.target as Node)) {
        dd.removeAttribute("open");
      }
    });
  }

  function handleToolbarClickOutside(e: MouseEvent) {
    const header = document.getElementById("app-header");
    if (header && !header.contains(e.target as Node) && isExpanded && window.innerWidth < 1024) {
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
    currentTheme = localStorage.getItem("theme") || "synthwave";
    document.documentElement.setAttribute("data-theme", currentTheme);

    void startup();

    const desktopMql = window.matchMedia(`(min-width: 1024px)`);
    isExpanded = desktopMql.matches;
    desktopMql.addEventListener("change", handleBreakpointChange);

    document.addEventListener("click", handleDropdownClickOutside);
    document.addEventListener("click", handleToolbarClickOutside);

    const unsubToggleNotifications = notificationManager.subscribe((notifs) => {
      const active = notifs.filter((n) => !n.data.snoozeUntil || n.data.snoozeUntil < Date.now());
      if (active.some((n) => n.data.urgency === "urgent")) currentUrgency = "urgent";
      else if (active.length > 0) currentUrgency = "non-urgent";
      else currentUrgency = "none";
    });

    return () => {
      desktopMql.removeEventListener("change", handleBreakpointChange);
      document.removeEventListener("click", handleDropdownClickOutside);
      document.removeEventListener("click", handleToolbarClickOutside);
      unsubToggleNotifications();
    };
  });
</script>

<header id="app-header" class="pointer-events-none fixed top-0 right-0 left-0 z-[50] flex justify-end p-4" style="padding-top: max(1rem, var(--safe-top)); padding-right: max(1rem, var(--safe-right));">
  <div class="bg-base-100/50 border-primary/20 pointer-events-auto flex items-center gap-2 rounded-full border p-1 shadow-lg backdrop-blur-md">
    <div
      bind:this={headerIcons}
      class="flex items-center gap-2 transition-all duration-300 ease-in-out"
      class:max-w-0={!isExpanded}
      class:opacity-0={!isExpanded}
      class:overflow-hidden={!isExpanded}
      style={isExpanded ? "max-width: 500px; opacity: 1;" : "max-width: 0; opacity: 0;"}
    >
      <!-- Music Player -->
      <!-- <details class="dropdown dropdown-end" bind:this={allDropdowns[0]}>
        <summary class="btn btn-ghost btn-circle text-xl" title="Music Player">🎵</summary>
        <div class="dropdown-content z-[1] mt-3">
          <MusicPlayer />
        </div>
      </details> -->

      <NotificationBell />

      <!-- Theme Selector -->
      <details class="dropdown dropdown-end" bind:this={allDropdowns[1]}>
        <summary class="btn btn-ghost btn-circle text-xl" title="Theme">🎨</summary>
        <ul class="dropdown-content menu bg-base-100 rounded-box z-[1] max-h-[60vh] w-auto max-w-[90vw] min-w-56 overflow-y-auto p-2 shadow">
          {#each availableThemes as theme}
            <li>
              <button class="theme-controller w-full btn btn-sm btn-ghost justify-start" class:font-bold={theme === currentTheme} on:click={() => setTheme(theme)}>
                {theme.charAt(0).toUpperCase() + theme.slice(1)}
              </button>
            </li>
          {/each}
        </ul>
      </details>

      <WalletLink />
      <FaucetButton />

      {#if !isAuthenticated || isGuest}
        <!-- Profile: Guest -->
        <details class="dropdown dropdown-end" bind:this={allDropdowns[2]}>
          <summary class="btn btn-ghost btn-circle text-xl" title="Profile (Guest)">👤</summary>
          <div class="card card-compact dropdown-content bg-base-100 border-primary/20 z-[1] mt-3 w-72 border shadow-xl">
            <div class="card-body">
              <h3 class="text-lg font-bold">Profile</h3>
              <div class="mb-2 text-xs opacity-70">Unavailable</div>
              <p>Please log in as a degen to access your profile.</p>
            </div>
          </div>
        </details>
      {:else}
        <!-- Profile: Authenticated -->
        <button on:click={handleAuthBtnClick} class="btn btn-ghost btn-circle text-xl" title="My Profile">👤</button>
      {/if}

      {#if isAdmin}
        <a href="/admin" class="btn btn-ghost btn-circle text-xl" title="Admin Panel">🛡</a>
      {/if}
    </div>

    <!-- Toggle button -->
    <button
      on:click={handleToggle}
      class="btn btn-ghost btn-circle text-lg transition-transform duration-300"
      class:rotate-180={isExpanded}
      class:toggle-glow-orange={!isExpanded && currentUrgency === 'non-urgent'}
      class:toggle-glow-red={!isExpanded && currentUrgency === 'urgent'}
      title="Toggle toolbar"
    >
      «
    </button>
  </div>
</header>

<!-- <NotificationToast /> is handled globally in layout -->

<style>
  @keyframes toggle-breathe-orange {
    0%, 100% { box-shadow: 0 0 4px rgba(255, 165, 0, 0.3); }
    50% { box-shadow: 0 0 14px rgba(255, 165, 0, 0.8), 0 0 28px rgba(255, 165, 0, 0.3); }
  }
  @keyframes toggle-breathe-red {
    0%, 100% { box-shadow: 0 0 4px rgba(255, 0, 0, 0.3); }
    50% { box-shadow: 0 0 14px rgba(255, 0, 0, 0.9), 0 0 28px rgba(255, 0, 0, 0.4); }
  }
  .toggle-glow-orange { animation: toggle-breathe-orange 3s ease-in-out infinite; }
  .toggle-glow-red { animation: toggle-breathe-red 2s ease-in-out infinite; }

  @media (min-width: 1024px) {
    /* .flex.items-center.gap-2.transition-all {
      max-width: 500px !important;
      opacity: 1 !important;
    } */
  }
</style>
