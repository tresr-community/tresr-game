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
  import {log} from "@/lib/utils/log";
  import {config} from "@/lib/config/client";
  import {initializeJunoSatellite} from "@/lib/utils/juno";
  import {getErrors} from "@/lib/satellite/satellite-api";
  import Button from "@/components/ui/Button.svelte";

  const COMPONENT_NAME = "Header";
  let isExpanded = $state(false);
  let currentUrgency: "none" | "non-urgent" | "urgent" = $state("none");
  let isAdmin = $state(false);

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
    document.dispatchEvent(new CustomEvent("tresr:open-profile"));
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

      {#if !isAuthenticated || isGuest}
        <!-- Profile: Guest -->
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="flex h-12 w-12 items-center justify-center rounded-full text-xl transition-colors hover:bg-white/10"
            title="Profile (Guest)">👤</DropdownMenu.Trigger
          >
          <DropdownMenu.Content
            class="border-primary/20 z-[60] mt-2 w-72 rounded-xl border bg-black/80 p-4 shadow-xl backdrop-blur-md outline-none"
            sideOffset={8}
            align="end"
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
          class="flex h-12 w-12 items-center justify-center rounded-full text-xl transition-colors hover:bg-white/10"
          title="My Profile">👤</button
        >
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
