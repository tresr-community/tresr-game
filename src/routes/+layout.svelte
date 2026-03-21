<script lang="ts">
  import {onMount} from "svelte";
  import type {Snippet} from "svelte";
  import {initSatellite} from "@junobuild/core";

  import Header from "@/components/user/Header.svelte";
  import ProfileModal from "@/components/user/ProfileModal.svelte";
  import UpdatePrompt from "@/components/pwa/UpdatePrompt.svelte";
  import NotificationToast from "@/components/notifications/NotificationToast.svelte";
  import Confetti from "@/components/effects/Confetti.svelte";
  import {isPortrait} from "@/lib/stores/ui.svelte";
  import PwaRegistration from "@/lib/pwa";

  import "../styles/global.css";

  let {children}: {children: Snippet} = $props();

  let isPortraitMode = $state(false);

  onMount(() => {
    // 1. Initialize Juno satellite container
    const isLocalEmulator =
      typeof window !== "undefined" &&
      (window.location.hostname.endsWith("localhost") ||
        window.location.hostname === "127.0.0.1");

    initSatellite({
      satelliteId: __JUNO_SATELLITE_ID__,
      container: isLocalEmulator ? "http://127.0.0.1:5987" : undefined,
    });

    // 2. Register PWA and Analytics
    PwaRegistration.getInstance().register();
    import("@/lib/metrics/analytics").then(async (m) => {
      await m.initAnalytics();
      await m.trackPageView(window.location.pathname);
    });

    // 3. Portrait mode detection
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastPortrait: boolean | null = null;

    function isTouchDevice() {
      return "ontouchstart" in window || navigator.maxTouchPoints > 0;
    }

    function checkIsPortrait() {
      if (!isTouchDevice()) return false;
      if (window.innerHeight > window.innerWidth) return true;
      if (
        window.matchMedia &&
        window.matchMedia("(orientation: portrait)").matches
      )
        return true;
      return false;
    }

    function applyPortrait(portrait: boolean) {
      if (portrait === lastPortrait) return;
      lastPortrait = portrait;
      isPortraitMode = portrait;
      // Signal via store — game/+page.svelte reacts via $effect
      isPortrait.set(portrait);
    }

    function check() {
      applyPortrait(checkIsPortrait());
    }

    function debouncedCheck() {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(check, 150);
    }

    check();
    window.addEventListener("resize", debouncedCheck);
    const orientationHandler = () => setTimeout(check, 100);
    window.addEventListener("orientationchange", orientationHandler);

    return () => {
      window.removeEventListener("resize", debouncedCheck);
      window.removeEventListener("orientationchange", orientationHandler);

      PwaRegistration.getInstance().destroy();
    };
  });

  async function enterFullscreenLandscape() {
    try {
      // Step 1: go fullscreen (requires user gesture — this button IS that gesture)
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else {
        const el = document.documentElement as any;
        if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      }
    } catch {
      // Fullscreen blocked (e.g. iOS Safari in some contexts) — fall through
    }

    try {
      // Step 2: lock orientation to landscape (only works after fullscreen on most browsers)
      const orientation = screen.orientation as any;
      if (orientation?.lock) await orientation.lock("landscape");
    } catch {
      // iOS Safari doesn't support orientation lock — user must rotate manually
    }
  }
</script>

<Header />
<main>
  {@render children()}
</main>

{#if isPortraitMode}
  <div
    id="portrait-warning"
    class="fixed inset-0 z-[99999] flex flex-col items-center justify-center gap-6 bg-black text-center"
  >
    <div class="animate-bounce text-7xl">📱</div>
    <p class="font-display text-primary text-3xl font-bold tracking-wide">
      READY TO PLAY?
    </p>
    <p class="max-w-xs text-lg opacity-60">
      Tap below to enter fullscreen landscape mode.
    </p>
    <button
      onclick={enterFullscreenLandscape}
      class="bg-primary hover:bg-primary/90 mt-2 rounded-md px-8 py-3 text-base font-bold tracking-widest text-black uppercase shadow-[0_0_20px_var(--color-primary)] transition-all hover:scale-[1.02] active:scale-95"
    >
      ⛶ Play Fullscreen
    </button>
    <p class="max-w-xs text-sm opacity-30">
      or rotate your device to landscape
    </p>
  </div>
{/if}

<UpdatePrompt />
<NotificationToast />
<ProfileModal />
<Confetti />
