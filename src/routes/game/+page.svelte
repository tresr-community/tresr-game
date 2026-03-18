<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import GameCanvas from "@/components/game/GameCanvas.svelte";
  import FeeGate from "@/components/game/FeeGate.svelte";
  import BanModal from "@/components/game/BanModal.svelte";
  import MaintenanceModal from "@/components/game/MaintenanceModal.svelte";
  import Loader from "@/components/game/Loader.svelte";

  import { getAuthState, initAuth } from "@/lib/auth";
  import { checkDeviceBan } from "@/lib/auth/ban";
  import { isGuestRateLimited } from "@/lib/auth/guest";
  import { isFeePaid, showFeeGate } from "@/lib/game/fee-gate";
  import { profileStore } from "@/lib/user/store";
  import { trackGameStart } from "@/lib/metrics/analytics";
  import { config } from "@/lib/config/client";
  import { log } from "@/lib/utils/log";
  import { SCENE_KEYS } from "@/lib/game/constants";

  const COMPONENT_NAME = "GamePage";

  let wakeLock: WakeLockSentinel | null = null;
  let lastHandledPortrait: boolean | null = null;

  function checkBan(): boolean {
    const profile = profileStore.get();
    if (!profile) return false;

    const bannedUntil = profile.banned_until;
    if (bannedUntil == null) return false;

    const now = Date.now();
    if (bannedUntil > now) {
      log.info(COMPONENT_NAME, `User is banned until ${bannedUntil}`);
      document.dispatchEvent(
        new CustomEvent("tresr:ban-modal-open", {
          detail: {
            banned_until: bannedUntil,
            offence_count: profile.offence_count ?? 0,
          },
        })
      );
      return true;
    }

    return false;
  }

  async function checkAuthAndFee() {
    await initAuth();
    const auth = getAuthState();

    if (!auth.isAuthenticated) {
      window.location.href = "/";
      return;
    }

    const deviceBan = checkDeviceBan();
    if (deviceBan) {
      log.info(COMPONENT_NAME, "Device is banned, showing ban modal");
      document.dispatchEvent(
        new CustomEvent("tresr:ban-modal-open", {
          detail: {
            banned_until: deviceBan.bannedUntil,
            offence_count: deviceBan.offenceCount,
          },
        })
      );
      return;
    }

    if (checkBan()) return;

    if (auth.isGuest) {
      if (isGuestRateLimited()) {
        log.info(COMPONENT_NAME, "Guest rate limit reached, redirecting");
        window.location.href = "/";
        return;
      }
      log.info(COMPONENT_NAME, "Guest mode - skipping fee gate");
      startGame();
      return;
    }

    const profile = profileStore.get();
    if (profile && !profile.evm_wallet) {
      log.info(COMPONENT_NAME, "No wallet linked, cannot enter fee gate");
      // @ts-ignore
      if (window.showWarningToast) window.showWarningToast("You need to link a wallet first");
      window.location.href = "/";
      return;
    }

    const { isVaultDeployed } = await import("@/lib/blockchain/networks/chain");
    if (!isVaultDeployed(config)) {
      log.info(COMPONENT_NAME, "Vault not deployed, skipping fee gate");
      startGame();
      return;
    }

    const { isSatelliteInSync } = await import("@/lib/satellite/config-hash");
    if (!(await isSatelliteInSync())) {
      log.info(COMPONENT_NAME, "Satellite config hash mismatch — showing maintenance modal");
      document.dispatchEvent(new CustomEvent("tresr:maintenance-modal-open"));
      return;
    }

    if (await isFeePaid()) {
      log.info(COMPONENT_NAME, "Fee already paid this session");
      startGame();
      return;
    }

    const feeTimeout = config.gameplay.fee_gate.transaction_timeout_ms;
    try {
      await showFeeGate(feeTimeout);
      log.info(COMPONENT_NAME, "Fee paid successfully");
      startGame();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("timed out")) {
        log.error(COMPONENT_NAME, "Fee gate transaction timed out");
        window.location.href = "/";
      } else {
        log.info(COMPONENT_NAME, "Fee payment aborted, returning to home");
        window.location.href = "/";
      }
    }
  }

  async function requestLandscapeLock() {
    try {
      // @ts-ignore
      const orientation = screen.orientation as any;
      if (orientation?.lock) {
        await orientation.lock("landscape");
        log.info(COMPONENT_NAME, "Screen orientation locked to landscape");
      }
    } catch {
      log.debug(COMPONENT_NAME, "Orientation lock not available");
    }
  }

  function releaseLandscapeLock() {
    try {
      // @ts-ignore
      const orientation = screen.orientation as any;
      if (orientation?.unlock) {
        orientation.unlock();
      }
    } catch {}
  }

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
        log.info(COMPONENT_NAME, "Wake lock acquired");
      }
    } catch {
      log.debug(COMPONENT_NAME, "Wake lock not available");
    }
  }

  async function reacquireWakeLock() {
    if (document.visibilityState === "visible" && !wakeLock) {
      try {
        wakeLock = await navigator.wakeLock.request("screen");
        log.debug(COMPONENT_NAME, "Wake lock re-acquired");
      } catch {}
    }
  }

  async function releaseWakeLock() {
    if (wakeLock) {
      try {
        await wakeLock.release();
        wakeLock = null;
        log.debug(COMPONENT_NAME, "Wake lock released");
      } catch {}
    }
  }

  async function requestFullscreen() {
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) return;

    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        log.info(COMPONENT_NAME, "Fullscreen activated");
        requestLandscapeLock();
      }
    } catch {
      log.debug(COMPONENT_NAME, "Fullscreen not available");
    }
  }

  function resumeAudioContext() {
    const game = (window as any).__phaserGame;
    if (game?.sound?.context?.state === "suspended") {
      game.sound.context.resume().then(() => {
        log.info(COMPONENT_NAME, "AudioContext resumed on touch");
      });
    }
    document.removeEventListener("touchstart", resumeAudioContext);
    document.removeEventListener("click", resumeAudioContext);
  }

  function startGame() {
    const container = document.getElementById("game-container");
    if (container) {
      container.classList.remove("hidden");
    }

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.inset = "0";

    requestLandscapeLock();
    requestWakeLock();
    requestFullscreen();
    trackGameStart();

    document.addEventListener("touchstart", resumeAudioContext, {once: true});
    document.addEventListener("click", resumeAudioContext, {once: true});

    log.info(COMPONENT_NAME, "Dispatching game engine start event");
    document.dispatchEvent(new CustomEvent("tresr:start-game-engine"));
  }

  function handleKeyboardVisibility() {
    const game = (window as any).__phaserGame;
    if (!game) return;

    const kb = game.input.keyboard;
    if (!kb) return;

    if (document.hidden) {
      kb.clearCaptures();
      kb.enabled = false;
      log.debug(COMPONENT_NAME, "Keyboard capture disabled (tab hidden)");
    } else {
      kb.enabled = true;
      log.debug(COMPONENT_NAME, "Keyboard capture re-enabled (tab visible)");
    }
  }

  function handlePortraitChange(e: Event) {
    const {portrait} = (e as CustomEvent).detail;
    if (portrait === lastHandledPortrait) return;
    lastHandledPortrait = portrait;

    const game = (window as any).__phaserGame;
    if (!game) return;

    const mainScene = game.scene.getScene(SCENE_KEYS.MAIN);
    if (!mainScene) return;

    if (portrait) {
      log.info(COMPONENT_NAME, "Portrait detected, pausing MainScene");
      if (mainScene.scene.isActive()) mainScene.scene.pause();
    } else {
      log.info(COMPONENT_NAME, "Landscape detected, resuming MainScene");
      if (mainScene.scene.isPaused()) mainScene.scene.resume();
    }
  }

  onMount(() => {
    document.addEventListener("visibilitychange", reacquireWakeLock);
    document.addEventListener("visibilitychange", handleKeyboardVisibility);
    document.addEventListener("tresr:portrait-change", handlePortraitChange);
    window.addEventListener("beforeunload", releaseLandscapeLock);

    checkAuthAndFee();
  });

  onDestroy(() => {
    document.removeEventListener("visibilitychange", reacquireWakeLock);
    document.removeEventListener("visibilitychange", handleKeyboardVisibility);
    document.removeEventListener("tresr:portrait-change", handlePortraitChange);
    document.removeEventListener("touchstart", resumeAudioContext);
    document.removeEventListener("click", resumeAudioContext);
    window.removeEventListener("beforeunload", releaseLandscapeLock);

    releaseLandscapeLock();
    releaseWakeLock();

    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.inset = "";

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  });
</script>

<svelte:head>
  <title>TRESR Game | Active Session</title>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
</svelte:head>

<Loader id="game-loader" />

<FeeGate />
<BanModal />
<MaintenanceModal />

<div id="game-container" class="fixed inset-0 hidden h-screen w-full touch-none overflow-hidden">
  <GameCanvas />
</div>
