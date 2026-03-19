<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import {goto} from "$app/navigation";
  import {config} from "@/lib/config/client";
  import {authStore} from "@/lib/auth/store.svelte";
  import {getDisplayName} from "@/lib/auth";
  import {profileStore} from "@/lib/user/store.svelte";
  import {log} from "@/lib/utils/log";
  import Modal from "@/components/ui/Modal.svelte";

  let {hideTrigger = false} = $props();

  const COMPONENT_NAME = "Auth";

  // Which Auth Providers are enabled?
  const iidEnabled = config.auth?.iid?.enabled ?? true;
  const avalancheEnabled = config.auth?.avalanche?.enabled ?? true;
  const webauthnEnabled = config.auth?.webauthn?.enabled ?? true;
  const guestEnabled = config.gameplay?.guest?.enabled ?? true;
  const degenEnabled = iidEnabled || avalancheEnabled || webauthnEnabled;

  // Modals
  let loginModalOpen = $state(false);
  let registerModalOpen = $state(false);
  let guestLimitModalOpen = $state(false);
  let maintenanceInfoModalOpen = $state(false);

  // Auth Tabs
  let activeTab: "normie" | "degen" = $state(guestEnabled ? "normie" : "degen");

  // State
  let registerNickname = $state("");
  let isAuthLoading = $state(false);
  let authLoadingText = $state("Signing in...");

  // Specific button loading states
  let isNormieLoading = $state(false);
  let isIILoading = $state(false);
  let isAvalancheLoading = $state(false);

  let isMaintenance = $state(false);
  let maintenancePollId: ReturnType<typeof setInterval> | null = null;

  let isAuthenticated = $derived(authStore.value.isAuthenticated);
  let isGuest = $derived(authStore.value.isGuest);
  let displayName = $derived(
    authStore.value.isGuest ? "NORMIE" : getDisplayName()
  );

  // Lazy loaded modules
  async function getAuth() {
    return import("@/lib/auth");
  }
  async function getGuestRateLimit() {
    return (await import("@/lib/auth/guest")).isGuestRateLimited;
  }
  async function getAnalytics() {
    return (await import("@/lib/metrics/analytics")).trackLogin;
  }

  function showAuthOverlay(text = "Signing in...") {
    authLoadingText = text;
    isAuthLoading = true;
  }

  function hideAuthOverlay() {
    isAuthLoading = false;
  }

  function onAuthProgress(e: Event) {
    const detail = (e as CustomEvent<{step: string}>).detail;
    if (detail?.step) showAuthOverlay(detail.step);
  }

  async function handleAvalancheLogin() {
    isAvalancheLoading = true;
    loginModalOpen = false;

    try {
      isAvalancheLoading = false;
      showAuthOverlay("Awaiting wallet connection...");
      const {signInWithAvalanche} = await getAuth();
      await signInWithAvalanche();
      hideAuthOverlay();
      const trackLogin = await getAnalytics();
      trackLogin("avalanche");
    } catch (error: unknown) {
      hideAuthOverlay();
      isAvalancheLoading = false;
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("cancelled") ||
        message.includes("rejected") ||
        message.includes("disconnected")
      ) {
        window.showWarningToast?.("Login cancelled or rejected");
      } else if (message.includes("SIWA") || message.includes("canister")) {
        log.error(COMPONENT_NAME, "SIWA canister error", error);
      } else if (message.includes("chain") || message.includes("network")) {
        log.error(COMPONENT_NAME, "Network/chain mismatch", error);
      } else {
        log.error(COMPONENT_NAME, "Avalanche Auth failed", error);
      }
      loginModalOpen = true;
    }
  }

  async function handleNormieLogin() {
    isNormieLoading = true;
    try {
      const {signInAsGuest} = await getAuth();
      await signInAsGuest();
      const trackLogin = await getAnalytics();
      trackLogin("guest");
      loginModalOpen = false;
    } catch (error) {
      log.error(COMPONENT_NAME, "Guest login failed", error);
    } finally {
      isNormieLoading = false;
    }
  }

  async function handleIILogin() {
    isIILoading = true;
    try {
      const {signInWithInternetIdentity} = await getAuth();
      await signInWithInternetIdentity();
      const trackLogin = await getAnalytics();
      trackLogin("internet_identity");
      loginModalOpen = false;
    } catch (error) {
      log.error(COMPONENT_NAME, "II Auth failed", error);
    } finally {
      isIILoading = false;
    }
  }

  async function handleWebAuthNLogin() {
    const {checkPasskeyAvailability, signInWithPasskey} = await getAuth();
    if (!(await checkPasskeyAvailability())) {
      window.showErrorToast?.(
        "Passkey not supported",
        "Your browser does not support WebAuthn."
      );
      return;
    }
    try {
      await signInWithPasskey();
      const trackLogin = await getAnalytics();
      trackLogin("passkey_login");
      loginModalOpen = false;
    } catch (error) {
      log.error(COMPONENT_NAME, "Passkey login failed", error);
    }
  }

  async function handleWebAuthNRegister() {
    const {checkPasskeyAvailability} = await getAuth();
    if (!(await checkPasskeyAvailability())) {
      window.showErrorToast?.(
        "Passkey not supported",
        "Your browser does not support WebAuthn."
      );
      return;
    }
    registerModalOpen = true;
  }

  async function confirmRegister() {
    try {
      const {signUpWithPasskey} = await getAuth();
      await signUpWithPasskey(registerNickname || "PassKey");
      const trackLogin = await getAnalytics();
      trackLogin("passkey_signup");
      registerModalOpen = false;
      loginModalOpen = false;
    } catch (error) {
      log.error(COMPONENT_NAME, "Passkey registration failed", error);
    }
  }

  async function handleLoginClick() {
    if (isAuthenticated) {
      if (isMaintenance) {
        maintenanceInfoModalOpen = true;
        return;
      }
      if (isGuest) {
        const isGuestRateLimited = await getGuestRateLimit();
        if (isGuestRateLimited()) {
          log.info(COMPONENT_NAME, "Guest rate limit reached, showing modal");
          guestLimitModalOpen = true;
          return;
        }
      }
      goto("/game");
    } else {
      loginModalOpen = true;
    }
  }

  async function handleLogout() {
    const {handleSignOut} = await getAuth();
    await handleSignOut();
  }

  function handleAuthModalOpen() {
    loginModalOpen = true;
  }

  async function checkMaintenanceStatus() {
    if (isMaintenance) return;
    try {
      const {isSatelliteInSync} = await import("@/lib/satellite/config-hash");
      const inSync = await isSatelliteInSync();
      if (!inSync) {
        isMaintenance = true;
        log.info(COMPONENT_NAME, "Maintenance detected — START button locked");
        startMaintenancePoll();
      }
    } catch {}
  }

  function startMaintenancePoll() {
    if (maintenancePollId) return;
    const POLL_INTERVAL_MS = 15_000;
    log.info(COMPONENT_NAME, "Starting maintenance recovery poll (every 15 s)");

    maintenancePollId = setInterval(async () => {
      try {
        const {isSatelliteInSync} = await import("@/lib/satellite/config-hash");
        const inSync = await isSatelliteInSync({quiet: true});
        if (inSync) {
          const {maintenanceState} = await import(
            "@/lib/utils/maintenance-state"
          );
          maintenanceState.deactivate();
          isMaintenance = false;
          log.info(
            COMPONENT_NAME,
            "Satellite back in sync — START button unlocked"
          );
          clearInterval(maintenancePollId!);
          maintenancePollId = null;
        }
      } catch {}
    }, POLL_INTERVAL_MS);
  }

  // Effect to check maintenance on auth change
  $effect(() => {
    if (isAuthenticated) {
      checkMaintenanceStatus();
    }
  });

  onMount(() => {
    window.addEventListener("tresr:auth-progress", onAuthProgress);
    window.addEventListener("auth-modal:open", handleAuthModalOpen);

    if (typeof requestIdleCallback === "function") {
      if (isAuthenticated && authStore.value.authMode === "avalanche") {
        requestIdleCallback(() => {
          import("@/lib/wallet/appkit")
            .then((m) => m.getAppKit())
            .catch(() => {});
        });
      }
    }
  });

  onDestroy(() => {
    window.removeEventListener("tresr:auth-progress", onAuthProgress);
    window.removeEventListener("auth-modal:open", handleAuthModalOpen);
    if (maintenancePollId) clearInterval(maintenancePollId);
  });
</script>

<div class="flex flex-col items-center gap-0.5">
  <button
    onclick={handleLoginClick}
    class:hidden={hideTrigger}
    class="font-display rounded-lg px-8 py-3 text-lg font-black tracking-widest uppercase transition-all duration-300 hover:scale-[1.02] active:scale-95 md:px-12 md:text-2xl
      {!isAuthenticated && !isMaintenance
      ? 'bg-primary text-black shadow-[0_0_20px_var(--color-primary)]'
      : ''}
      {isAuthenticated && !isMaintenance
      ? 'animate-pulse bg-[#10b981] text-black shadow-[0_0_20px_rgba(16,185,129,0.5)]'
      : ''}
      {isMaintenance ? 'bg-[#facc15] text-black opacity-60' : ''}"
  >
    {#if isMaintenance}
      UPGRADING
    {:else if isAuthenticated}
      <span class="flex flex-col items-center leading-tight">
        <span>START</span>
        <span
          style="font-size:0.55em;font-weight:700;opacity:0.85;letter-spacing:0.05em"
          >({displayName})</span
        >
      </span>
    {:else}
      LOGIN
    {/if}
  </button>

  {#if isAuthenticated}
    <button
      onclick={handleLogout}
      class="mt-2 font-mono text-xs font-bold tracking-widest text-[#ef4444] uppercase opacity-50 transition-opacity hover:underline hover:opacity-100"
    >
      logout
    </button>
  {/if}
</div>

<!-- Login Modal -->
<Modal bind:open={loginModalOpen} title="Acknowledge Identity">
  <div
    class="mb-4 flex w-full rounded-md border border-white/10 bg-black/40 p-1"
  >
    {#if guestEnabled}
      <button
        class="flex-1 rounded py-2 text-center text-[10px] font-bold tracking-widest transition-colors {activeTab ===
        'normie'
          ? 'bg-primary text-black'
          : 'text-white/50 hover:bg-white/5 hover:text-white'} uppercase"
        onclick={() => (activeTab = "normie")}
      >
        Normie
      </button>
    {/if}
    {#if degenEnabled}
      <button
        class="flex-1 rounded py-2 text-center text-[10px] font-bold tracking-widest transition-colors {activeTab ===
        'degen'
          ? 'bg-[#a78bfa] text-black'
          : 'text-white/50 hover:bg-white/5 hover:text-white'} uppercase"
        onclick={() => (activeTab = "degen")}
      >
        Degen
      </button>
    {/if}
  </div>

  <div
    class="rounded-md border border-white/10 bg-black/40 p-4 shadow-inner sm:p-6"
  >
    {#if activeTab === "normie"}
      <div class="animate-in fade-in flex flex-col gap-4">
        <p
          class="text-center text-xs tracking-wide text-white/70 sm:text-sm"
        >
          Fight some bankers without spending tokens.
        </p>
        <p
          class="text-center text-xs tracking-wide text-white/50 italic sm:text-sm"
        >
          No risk, no reward.
        </p>
        <button
          onclick={handleNormieLogin}
          disabled={isNormieLoading}
          class="flex w-full items-center justify-center gap-2 rounded-md bg-[#6b7280] px-4 py-3 font-bold tracking-widest text-white uppercase shadow-[0_0_10px_rgba(107,114,128,0.4)] transition-all hover:scale-[1.02] hover:bg-[#9ca3af] active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        >
          {#if isNormieLoading}
            <div
              class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
            ></div>
          {/if}
          {isNormieLoading ? "Connecting..." : "Login as a Normie"}
        </button>
      </div>
    {:else}
      <div class="animate-in fade-in flex flex-col gap-4">
        {#if degenEnabled}
          <p
            class="text-center text-xs tracking-wide text-white/70 sm:text-sm"
          >
            Join the decentralized elite.
          </p>
          <p
            class="text-center text-xs tracking-wide text-white/50 italic sm:text-sm"
          >
            High risk, high reward.
          </p>
          <div class="flex flex-col gap-3">
            {#if iidEnabled}
              <button
                onclick={handleIILogin}
                disabled={isIILoading}
                class="flex w-full items-center justify-center gap-2 rounded-md bg-[#3b82f6] px-4 py-3 font-bold tracking-widest text-white uppercase shadow-[0_0_10px_rgba(59,130,246,0.4)] transition-all hover:scale-[1.02] hover:bg-[#60a5fa] active:scale-95 disabled:pointer-events-none disabled:opacity-50"
              >
                {#if isIILoading}
                  <div
                    class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                  ></div>
                {/if}
                {isIILoading ? "Connecting..." : "Internet Identity"}
              </button>
            {/if}

            {#if avalancheEnabled}
              <button
                onclick={handleAvalancheLogin}
                disabled={isAvalancheLoading}
                class="flex w-full items-center justify-center gap-2 rounded-md bg-[#a78bfa] px-4 py-3 font-bold tracking-widest text-black uppercase shadow-[0_0_10px_rgba(167,139,250,0.5)] transition-all hover:scale-[1.02] hover:bg-[#c4b5fd] active:scale-95 disabled:pointer-events-none disabled:opacity-50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  class="h-5 w-5"
                >
                  <path
                    d="M2.273 5.625A4.483 4.483 0 015.25 4.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 3H5.25a3 3 0 00-2.977 2.625zM2.273 8.625A4.483 4.483 0 015.25 7.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 6H5.25a3 3 0 00-2.977 2.625zM5.25 9a3 3 0 00-3 3v6a3 3 0 003 3h13.5a3 3 0 003-3v-6a3 3 0 00-3-3H15a.75.75 0 00-.75.75 2.25 2.25 0 01-4.5 0A.75.75 0 009 9H5.25z"
                  />
                </svg>
                {isAvalancheLoading ? "Connecting..." : "Avalanche Wallet"}
              </button>
            {/if}

            {#if webauthnEnabled}
              <div
                class="my-1 flex items-center justify-center gap-2 opacity-50"
              >
                <div class="h-px flex-1 bg-white/20"></div>
                <div
                  class="text-[10px] font-bold tracking-widest text-white uppercase"
                >
                  Passkey
                </div>
                <div class="h-px flex-1 bg-white/20"></div>
              </div>
              <div class="flex gap-2">
                <button
                  onclick={handleWebAuthNLogin}
                  class="flex-1 rounded-md border border-white/10 bg-white/5 py-3 font-bold tracking-widest text-white uppercase transition-colors hover:bg-white/10"
                >
                  Login
                </button>
                <button
                  onclick={handleWebAuthNRegister}
                  class="flex-1 rounded-md border border-[#a78bfa]/30 bg-[#a78bfa]/10 py-3 font-bold tracking-widest text-[#a78bfa] uppercase transition-colors hover:bg-[#a78bfa]/20"
                >
                  Register
                </button>
              </div>
            {/if}
          </div>
        {:else}
          <p
            class="mb-2 text-center text-sm font-bold tracking-widest text-[#facc15] uppercase"
          >
            🛠️ Contracts Deploying
          </p>
          <p class="text-center text-xs text-white opacity-60">
            Degen login is coming soon. Check back after the first deployment is
            complete.
          </p>
        {/if}
      </div>
    {/if}
  </div>
</Modal>

<!-- PassKey Registration Modal -->
<Modal bind:open={registerModalOpen} title="Register PassKey">
  <div class="mt-4 flex flex-col gap-2">
    <label
      class="text-[10px] font-bold tracking-widest text-white/50 uppercase"
      for="passkey-nickname"
    >
      Optional Nickname
    </label>
    <input
      id="passkey-nickname"
      bind:value={registerNickname}
      type="text"
      placeholder="Agent Name"
      class="focus:border-primary w-full rounded border border-white/10 bg-black/40 p-2 font-mono text-sm text-white focus:outline-none"
      maxlength={20}
    />
  </div>
  {#snippet footer()}
    <div class="flex w-full gap-2">
      <button
        onclick={confirmRegister}
        class="border-primary/50 bg-primary/20 text-primary hover:bg-primary flex-1 rounded border p-2 font-bold tracking-widest uppercase transition-colors hover:text-black"
      >
        Register
      </button>
      <button
        onclick={() => (registerModalOpen = false)}
        class="flex-1 rounded border border-white/10 bg-white/5 p-2 font-bold tracking-widest text-white/70 uppercase transition-colors hover:bg-white/10 hover:text-white"
      >
        Cancel
      </button>
    </div>
  {/snippet}
</Modal>

<!-- Guest Session Limit Modal -->
<Modal
  bind:open={guestLimitModalOpen}
  title="Session Limit Reached"
  closeOnEscape={false}
  closeOnOutsideClick={false}
>
  <p class="py-4 text-center text-sm text-white/70">
    You've used all your free guest sessions for today. Come back tomorrow or
    upgrade to Degen for unlimited play.
  </p>
  {#snippet footer()}
    <button
      onclick={() => (guestLimitModalOpen = false)}
      class="w-full rounded border border-[#f59e0b]/50 bg-[#f59e0b]/20 p-2 font-bold tracking-widest text-[#fbd38d] uppercase transition-colors hover:bg-[#f59e0b] hover:text-black"
    >
      Acknowledge
    </button>
  {/snippet}
</Modal>

<!-- Maintenance Info Dialog -->
<Modal bind:open={maintenanceInfoModalOpen} title="Upgrading">
  <p class="py-4 text-center text-sm text-white/70">
    The game is currently being upgraded, check back soon!
  </p>
  {#snippet footer()}
    <button
      onclick={() => (maintenanceInfoModalOpen = false)}
      class="w-full rounded border border-[#f59e0b]/50 bg-[#f59e0b]/20 p-2 font-bold tracking-widest text-[#fbd38d] uppercase transition-colors hover:bg-[#f59e0b] hover:text-black"
    >
      Got It
    </button>
  {/snippet}
</Modal>

<!-- Auth Loading Overlay -->
{#if isAuthLoading}
  <div
    class="fixed inset-0 z-[99998] flex items-center justify-center bg-black/80 backdrop-blur-sm"
  >
    <div
      class="border-primary/20 flex flex-col items-center gap-4 rounded-xl border bg-black/40 p-6 text-center shadow-[0_0_30px_rgba(var(--primary),0.1)]"
    >
      <div
        class="border-primary h-10 w-10 animate-spin rounded-full border-4 border-t-transparent"
      ></div>
      <p
        class="text-primary animate-pulse font-mono text-sm font-bold tracking-widest uppercase"
      >
        {authLoadingText}
      </p>
    </div>
  </div>
{/if}
