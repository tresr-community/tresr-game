<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import PWA from "@/lib/pwa";
  import {log} from "@/lib/utils/log";
  import {trackPwaUpdate} from "@/lib/metrics/analytics";
  import Modal from "@/components/ui/Modal.svelte";

  const COMPONENT_NAME = "UpdatePrompt";

  let open = $state(false);
  let updateVersion = $state("v?.?.?");

  function openUpdatePrompt(version: string) {
    if (window.location.pathname.includes("/game")) {
      log.info(COMPONENT_NAME, "Skipping update prompt during game");
      return;
    }
    updateVersion = version;
    open = true;
  }

  function closeUpdatePrompt() {
    open = false;
  }

  async function handleUpdateNow() {
    trackPwaUpdate("applied");
    await PWA.getInstance().applyUpdate();
    closeUpdatePrompt();
  }

  function handleUpdateLater() {
    trackPwaUpdate("dismissed");
    PWA.getInstance().dismissUpdateNotification();
    closeUpdatePrompt();
  }

  function handlePwaUpdateReady(event: Event) {
    if (!(event instanceof CustomEvent)) return;
    const {detail} = event;
    openUpdatePrompt(detail.version);
  }

  onMount(() => {
    window.addEventListener("pwa-update-ready", handlePwaUpdateReady);
  });

  onDestroy(() => {
    window.removeEventListener("pwa-update-ready", handlePwaUpdateReady);
  });
</script>

<Modal bind:open title="🚀 NEW VERSION AVAILABLE" closeOnOutsideClick={false}>
  <p class="mb-6 opacity-80">
    A new version (<span class="text-primary font-bold">{updateVersion}</span>)
    is ready to install. Update now to get the latest features and fixes?
  </p>

  {#snippet footer()}
    <button
      onclick={handleUpdateLater}
      class="rounded-md px-4 py-2 font-bold tracking-wider text-white/50 uppercase transition-colors hover:bg-white/5 hover:text-white sm:mr-2"
    >
      Maybe Later
    </button>
    <button
      onclick={handleUpdateNow}
      class="bg-primary hover:bg-primary/90 rounded-md px-6 py-2 font-bold tracking-widest text-[#0d0d12] uppercase shadow-[0_0_15px_var(--color-primary)] transition-all hover:scale-105 active:scale-95"
    >
      Update Now
    </button>
  {/snippet}
</Modal>
