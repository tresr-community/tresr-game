<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { initSatellite } from "@junobuild/core";

  import Header from "@/components/user/Header.svelte";
  import ProfileModal from "@/components/user/ProfileModal.svelte";
  import UpdatePrompt from "@/components/pwa/UpdatePrompt.svelte";
  import NotificationToast from "@/components/notifications/NotificationToast.svelte";
  import Confetti from "@/components/effects/Confetti.svelte";

  import "../styles/global.css";

  let isPortraitMode = false;

  onMount(() => {
    // 1. Initialize Juno satellite container
    initSatellite();

    // 2. Register PWA and Analytics
    import("@/lib/pwa").then((m) => m.default.getInstance().register());
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

    function isPortrait() {
      if (!isTouchDevice()) return false;
      if (window.innerHeight > window.innerWidth) return true;
      if (window.matchMedia && window.matchMedia("(orientation: portrait)").matches) return true;
      return false;
    }

    function applyPortrait(portrait: boolean) {
      if (portrait === lastPortrait) return;
      lastPortrait = portrait;
      isPortraitMode = portrait;
      document.dispatchEvent(
        new CustomEvent("tresr:portrait-change", { detail: { portrait } })
      );
    }

    function check() {
      applyPortrait(isPortrait());
    }

    function debouncedCheck() {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(check, 150);
    }

    check();
    window.addEventListener("resize", debouncedCheck);
    window.addEventListener("orientationchange", () => setTimeout(check, 100));

    return () => {
      window.removeEventListener("resize", debouncedCheck);
      window.removeEventListener("orientationchange", () => setTimeout(check, 100)); // Will not exactly match but anon func is fine to leak on layout destruction since Layout lives forever in SPA.

      import("@/lib/pwa").then((m) => m.default.getInstance().destroy());
    };
  });
</script>

<Header />
<main>
  <slot />
</main>

{#if isPortraitMode}
  <div
    id="portrait-warning"
    class="fixed inset-0 z-[99999] flex flex-col items-center justify-center gap-6 bg-black text-center"
  >
    <div class="animate-bounce text-7xl">📱</div>
    <p class="font-display text-primary text-3xl font-bold tracking-wide">
      ROTATE YOUR DEVICE
    </p>
    <p class="max-w-xs text-lg opacity-60">
      This game is best played in landscape mode.
    </p>
    <div class="mt-4 animate-pulse text-5xl">↻</div>
  </div>
{/if}

<UpdatePrompt />
<NotificationToast />
<ProfileModal />
<Confetti />
