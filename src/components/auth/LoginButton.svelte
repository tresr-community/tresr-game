<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { config } from "@/lib/config/client";
  import { isVaultDeployed } from "@/lib/blockchain/networks/chain";
  import { authStore } from "@/lib/auth/store";
  import { getDisplayName } from "@/lib/auth";
  import { profileStore } from "@/lib/user/store";
  import { log } from "@/lib/utils/log";

  export let hideTrigger = false;

  const COMPONENT_NAME = "Auth";

  // Which Auth Providers are enabled?
  const iidEnabled = config.auth?.iid?.enabled ?? true;
  const avalancheEnabled = (config.auth?.avalanche?.enabled ?? true) && isVaultDeployed(config);
  const webauthnEnabled = config.auth?.webauthn?.enabled ?? true;
  const guestEnabled = config.gameplay?.guest?.enabled ?? true;
  const degenEnabled = iidEnabled || avalancheEnabled || webauthnEnabled;

  // Modals
  let loginModal: HTMLDialogElement;
  let registerModal: HTMLDialogElement;
  let guestLimitModal: HTMLDialogElement;
  let maintenanceInfoModal: HTMLDialogElement;

  // State
  let registerNickname = "";
  let isAuthLoading = false;
  let authLoadingText = "Signing in...";

  // Specific button loading states
  let isNormieLoading = false;
  let isIILoading = false;
  let isAvalancheLoading = false;

  let isMaintenance = false;
  let maintenancePollId: ReturnType<typeof setInterval> | null = null;

  $: authState = $authStore;
  $: profileState = $profileStore; // needed to trigger reactivity when profile changes
  $: isAuthenticated = authState.isAuthenticated;
  $: isGuest = authState.isGuest;
  $: displayName = isGuest ? "NORMIE" : getDisplayName();

  // Lazy loaded modules
  async function getAuth() { return import("@/lib/auth"); }
  async function getGuestRateLimit() { return (await import("@/lib/auth/guest")).isGuestRateLimited; }
  async function getAnalytics() { return (await import("@/lib/metrics/analytics")).trackLogin; }

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
    loginModal.close();

    try {
      isAvalancheLoading = false;
      showAuthOverlay("Awaiting wallet connection...");
      const { signInWithAvalanche } = await getAuth();
      await signInWithAvalanche();
      hideAuthOverlay();
      const trackLogin = await getAnalytics();
      trackLogin("avalanche");
    } catch (error: any) {
      hideAuthOverlay();
      isAvalancheLoading = false;
      const message = error?.message || String(error);
      if (message.includes("cancelled") || message.includes("rejected") || message.includes("disconnected")) {
        window.showWarningToast?.("Login cancelled or rejected");
      } else if (message.includes("SIWA") || message.includes("canister")) {
        log.error(COMPONENT_NAME, "SIWA canister error", error);
      } else if (message.includes("chain") || message.includes("network")) {
        log.error(COMPONENT_NAME, "Network/chain mismatch", error);
      } else {
        log.error(COMPONENT_NAME, "Avalanche Auth failed", error);
      }
      loginModal.showModal();
    }
  }

  async function handleNormieLogin() {
    isNormieLoading = true;
    try {
      const { signInAsGuest } = await getAuth();
      await signInAsGuest();
      const trackLogin = await getAnalytics();
      trackLogin("guest");
      loginModal.close();
    } catch (error) {
      log.error(COMPONENT_NAME, "Guest login failed", error);
    } finally {
      isNormieLoading = false;
    }
  }

  async function handleIILogin() {
    isIILoading = true;
    try {
      const { signInWithInternetIdentity } = await getAuth();
      await signInWithInternetIdentity();
      const trackLogin = await getAnalytics();
      trackLogin("internet_identity");
      loginModal.close();
    } catch (error) {
      log.error(COMPONENT_NAME, "II Auth failed", error);
    } finally {
      isIILoading = false;
    }
  }

  async function handleWebAuthNLogin() {
    const { checkPasskeyAvailability, signInWithPasskey } = await getAuth();
    if (!(await checkPasskeyAvailability())) {
      window.showErrorToast?.("Passkey not supported", "Your browser does not support WebAuthn.");
      return;
    }
    try {
      await signInWithPasskey();
      const trackLogin = await getAnalytics();
      trackLogin("passkey_login");
      loginModal.close();
    } catch (error) {
      log.error(COMPONENT_NAME, "Passkey login failed", error);
    }
  }

  async function handleWebAuthNRegister() {
    const { checkPasskeyAvailability } = await getAuth();
    if (!(await checkPasskeyAvailability())) {
      window.showErrorToast?.("Passkey not supported", "Your browser does not support WebAuthn.");
      return;
    }
    registerModal.showModal();
  }

  async function confirmRegister() {
    try {
      const { signUpWithPasskey } = await getAuth();
      await signUpWithPasskey(registerNickname || "PassKey");
      const trackLogin = await getAnalytics();
      trackLogin("passkey_signup");
      registerModal.close();
      loginModal.close();
    } catch (error) {
      log.error(COMPONENT_NAME, "Passkey registration failed", error);
    }
  }

  async function handleLoginClick() {
    if (isAuthenticated) {
      if (isMaintenance) {
        maintenanceInfoModal.showModal();
        return;
      }
      if (isGuest) {
        const isGuestRateLimited = await getGuestRateLimit();
        if (isGuestRateLimited()) {
          log.info(COMPONENT_NAME, "Guest rate limit reached, showing modal");
          guestLimitModal.showModal();
          return;
        }
      }
      window.location.href = "/game";
    } else {
      loginModal.showModal();
    }
  }

  async function handleLogout() {
    const { handleSignOut } = await getAuth();
    await handleSignOut();
  }

  function handleAuthModalOpen() {
    loginModal?.showModal();
  }

  async function checkMaintenanceStatus() {
    if (isMaintenance) return;
    try {
      const { isSatelliteInSync } = await import("@/lib/satellite/config-hash");
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
        const { isSatelliteInSync } = await import("@/lib/satellite/config-hash");
        const inSync = await isSatelliteInSync({ quiet: true });
        if (inSync) {
          const { maintenanceState } = await import("@/lib/utils/maintenance-state");
          maintenanceState.deactivate();
          isMaintenance = false;
          log.info(COMPONENT_NAME, "Satellite back in sync — START button unlocked");
          clearInterval(maintenancePollId!);
          maintenancePollId = null;
        }
      } catch {}
    }, POLL_INTERVAL_MS);
  }

  // Effect to check maintenance on auth change
  $: if (isAuthenticated) {
    checkMaintenanceStatus();
  }

  onMount(() => {
    window.addEventListener("tresr:auth-progress", onAuthProgress);
    window.addEventListener("auth-modal:open", handleAuthModalOpen);

    // Initial maintenance check if already authed
    if (isAuthenticated) {
      checkMaintenanceStatus();
    }

    if (typeof requestIdleCallback === "function") {
      if (isAuthenticated && authState.authMode === "avalanche") {
        requestIdleCallback(() => {
          import("@/lib/wallet/appkit").then((m) => m.getAppKit()).catch(() => {});
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
    on:click={handleLoginClick}
    class:hidden={hideTrigger}
    class="btn btn-md md:btn-lg font-display px-8 text-lg tracking-widest shadow-[0_0_30px_rgba(var(--primary),0.4)] transition-all duration-500 hover:scale-105 md:px-12 md:text-2xl"
    class:btn-primary={!isAuthenticated && !isMaintenance}
    class:btn-success={isAuthenticated && !isMaintenance}
    class:animate-pulse={isAuthenticated && !isMaintenance}
    class:btn-warning={isMaintenance}
    class:opacity-60={isMaintenance}
  >
    {#if isMaintenance}
      UPGRADING
    {:else if isAuthenticated}
      <span class="flex flex-col items-center leading-tight">
        <span>START</span>
        <span style="font-size:0.55em;font-weight:500;opacity:0.85;letter-spacing:0.05em">({displayName})</span>
      </span>
    {:else}
      LOGIN
    {/if}
  </button>

  {#if isAuthenticated}
    <button
      on:click={handleLogout}
      class="btn btn-link btn-xs text-error font-mono opacity-50 transition-opacity hover:opacity-100"
    >
      logout
    </button>
  {/if}
</div>

<!-- Login Modal -->
<dialog bind:this={loginModal} class="modal">
  <div class="modal-box border-primary/30 bg-base-200 relative h-full max-h-full w-full max-w-full border sm:h-auto sm:max-h-[85vh] sm:w-auto sm:max-w-md sm:rounded-2xl">
    <button
      on:click={() => loginModal.close()}
      class="btn btn-circle btn-ghost absolute top-2 right-2 min-h-[44px] min-w-[44px] text-lg"
    >✕</button>

    <h3 class="text-primary mb-6 text-center text-2xl font-bold tracking-widest uppercase">
      Acknowledge Identity
    </h3>

    <div class="tabs tabs-lift">
      {#if guestEnabled}
        <input type="radio" name="auth_tabs" class="tab" aria-label="Normie" checked />
        <div class="tab-content border-base-300 bg-base-100 p-6">
          <p class="mb-6 text-center text-sm italic opacity-70">
            "Fight some bankers without spending tokens. No risk, no reward."
          </p>
          <button
            on:click={handleNormieLogin}
            disabled={isNormieLoading}
            class="btn btn-secondary w-full font-bold tracking-widest uppercase"
            class:loading={isNormieLoading}
          >
            {isNormieLoading ? "Connecting..." : "Login as a Normie"}
          </button>
        </div>
      {/if}

      {#if degenEnabled}
        <input type="radio" name="auth_tabs" class="tab" aria-label="Degen" checked={!guestEnabled} />
        <div class="tab-content border-base-300 bg-base-100 p-6">
          <p class="mb-6 text-center text-sm italic opacity-70">
            "Join the decentralized elite. High risk, high reward."
          </p>
          <div class="flex flex-col gap-3">
            {#if iidEnabled}
              <button
                on:click={handleIILogin}
                disabled={isIILoading}
                class="btn btn-primary w-full font-bold tracking-widest uppercase"
                class:loading={isIILoading}
              >
                {isIILoading ? "Connecting..." : "Login with Internet Identity"}
              </button>
            {/if}

            {#if avalancheEnabled}
              <button
                on:click={handleAvalancheLogin}
                disabled={isAvalancheLoading}
                class="btn btn-accent w-full gap-2 font-bold tracking-widest uppercase"
                class:loading={isAvalancheLoading}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5">
                  <path d="M2.273 5.625A4.483 4.483 0 015.25 4.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 3H5.25a3 3 0 00-2.977 2.625zM2.273 8.625A4.483 4.483 0 015.25 7.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 6H5.25a3 3 0 00-2.977 2.625zM5.25 9a3 3 0 00-3 3v6a3 3 0 003 3h13.5a3 3 0 003-3v-6a3 3 0 00-3-3H15a.75.75 0 00-.75.75 2.25 2.25 0 01-4.5 0A.75.75 0 009 9H5.25z" />
                </svg>
                {isAvalancheLoading ? "Connecting..." : "Login with Avalanche Wallet"}
              </button>
            {/if}

            {#if webauthnEnabled}
              <div class="divider text-[10px] tracking-tighter uppercase opacity-50">
                Login with a Passkey
              </div>
              <div class="flex gap-2">
                <button
                  on:click={handleWebAuthNLogin}
                  class="btn btn-outline flex-1 font-bold tracking-widest uppercase"
                >
                  Login
                </button>
                <button
                  on:click={handleWebAuthNRegister}
                  class="btn btn-outline text-secondary flex-1 font-bold tracking-widest uppercase"
                >
                  Register
                </button>
              </div>
            {/if}
          </div>
        </div>
      {:else}
        <input type="radio" name="auth_tabs" class="tab" aria-label="Degen" checked={!guestEnabled} disabled />
        <div class="tab-content border-base-300 bg-base-100 p-6">
          <p class="text-warning mb-2 text-center text-sm font-bold tracking-widest uppercase">
            🛠️ Contracts Deploying
          </p>
          <p class="text-center text-xs opacity-60">
            Degen login is coming soon. Check back after the first deployment is complete.
          </p>
        </div>
      {/if}
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button aria-label="Close dialog">close</button>
  </form>
</dialog>

<!-- PassKey Registration Modal -->
<dialog bind:this={registerModal} class="modal">
  <div class="modal-box bg-base-100">
    <h3 class="text-lg font-bold">Register PassKey</h3>
    <div class="form-control mt-4">
      <label class="label">
        <span class="label-text">Optional Nickname</span>
      </label>
      <input
        bind:value={registerNickname}
        type="text"
        placeholder="PassKey"
        class="input input-bordered"
        maxlength="20"
      />
    </div>
    <div class="modal-action">
      <button on:click={() => registerModal.close()} class="btn">Cancel</button>
      <button on:click={confirmRegister} class="btn btn-primary">Register</button>
    </div>
  </div>
</dialog>

<!-- Guest Session Limit Modal -->
<dialog bind:this={guestLimitModal} class="modal modal-middle" on:cancel|preventDefault on:click|self|preventDefault>
  <div class="modal-box border-warning/30 bg-base-300 border text-center">
    <h3 class="text-warning font-display text-2xl font-black tracking-widest uppercase">
      Session Limit Reached
    </h3>
    <p class="py-4 opacity-70">
      You've used all your free guest sessions for today. Come back tomorrow or upgrade to Degen for unlimited play.
    </p>
    <div class="modal-action justify-center">
      <button on:click={() => guestLimitModal.close()} class="btn btn-warning">OK</button>
    </div>
  </div>
</dialog>

<!-- Maintenance Info Dialog -->
<dialog bind:this={maintenanceInfoModal} class="modal modal-middle">
  <div class="modal-box border-warning/30 bg-base-300 max-w-sm border text-center">
    <h3 class="text-warning font-display text-2xl font-black tracking-widest uppercase">
      Upgrading
    </h3>
    <p class="py-4 opacity-70">
      The game is currently being upgraded, check back soon!
    </p>
    <div class="modal-action justify-center">
      <button on:click={() => maintenanceInfoModal.close()} class="btn btn-warning">Got it</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button aria-label="Close dialog">close</button>
  </form>
</dialog>

<!-- Auth Loading Overlay -->
{#if isAuthLoading}
  <div class="bg-base-300/80 fixed inset-0 z-[99998] flex items-center justify-center backdrop-blur-sm">
    <div class="flex flex-col items-center gap-4 text-center">
      <span class="loading loading-spinner loading-lg text-primary"></span>
      <p class="text-lg font-bold tracking-wide opacity-80">
        {authLoadingText}
      </p>
    </div>
  </div>
{/if}
