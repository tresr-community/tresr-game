<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import PWA from "@/lib/pwa";
  import { log } from "@/lib/utils/log";
  import { trackPwaUpdate } from "@/lib/metrics/analytics";

  const COMPONENT_NAME = "UpdatePrompt";

  let modal: HTMLDialogElement;
  let updateVersion = "v?.?.?";

  function openUpdatePrompt(version: string) {
    if (window.location.pathname.includes("/game")) {
      log.info(COMPONENT_NAME, "Skipping update prompt during game");
      return;
    }
    updateVersion = version;
    modal?.showModal();
  }

  function closeUpdatePrompt() {
    modal?.close();
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
    const { detail } = event;
    openUpdatePrompt(detail.version);
  }

  onMount(() => {
    window.addEventListener("pwa-update-ready", handlePwaUpdateReady);
  });

  onDestroy(() => {
    window.removeEventListener("pwa-update-ready", handlePwaUpdateReady);
  });
</script>

<dialog bind:this={modal} class="modal">
  <div class="modal-box border-primary/30 bg-base-200 border text-center">
    <h3 class="text-primary mb-4 text-xl font-bold">
      🚀 NEW VERSION AVAILABLE
    </h3>
    <p class="mb-6">
      A new version (<span>{updateVersion}</span>) is ready to
      install. Update now to get the latest features and fixes?
    </p>
    <div class="flex flex-col gap-3">
      <button on:click={handleUpdateNow} class="btn btn-primary"> Update Now </button>
      <button on:click={handleUpdateLater} class="btn btn-ghost"> Maybe Later </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
