<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  let dialog: HTMLDialogElement;

  function handleBtnRefresh() {
    window.location.reload();
  }

  function handleBtnBack() {
    dialog?.close();
    window.location.href = "/";
  }

  function handleCancel(e: Event) {
    e.preventDefault();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialog) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function handleMaintenanceModalOpen() {
    dialog?.showModal();
  }

  onMount(() => {
    document.addEventListener("tresr:maintenance-modal-open", handleMaintenanceModalOpen);
  });

  onDestroy(() => {
    document.removeEventListener("tresr:maintenance-modal-open", handleMaintenanceModalOpen);
  });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog bind:this={dialog} id="modal-maintenance" class="modal modal-middle" on:cancel={handleCancel} on:click={handleBackdropClick}>
  <div class="modal-box border-warning/30 bg-base-300 border text-center">
    <h3 class="text-warning font-display text-3xl font-black tracking-widest uppercase">
      Under Maintenance
    </h3>
    <p class="py-4 opacity-70">
      We're deploying an update. Check back soon — no funds are at risk during this window.
    </p>

    <div class="stats stats-vertical bg-base-200/50 my-4 w-full shadow">
      <div class="stat">
        <div class="stat-title text-xs uppercase">Status</div>
        <div class="stat-value text-warning text-lg">Deploying</div>
      </div>
      <div class="stat">
        <div class="stat-title text-xs uppercase">Action Required</div>
        <div class="stat-value font-mono text-base">Check back soon</div>
      </div>
    </div>

    <div class="modal-action flex-col gap-2">
      <button on:click={handleBtnRefresh} class="btn btn-warning btn-block">
        Refresh Page
      </button>
      <button on:click={handleBtnBack} class="btn btn-ghost btn-block">
        Return Home
      </button>
    </div>
  </div>
</dialog>
