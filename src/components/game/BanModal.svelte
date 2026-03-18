<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  let dialog: HTMLDialogElement;
  let expiresText = "—";
  let offenceCount = 0;

  function handleBtnBack() {
    dialog.close();
    window.location.href = "/";
  }

  // Prevent Escape key dismissal (ticket #155)
  function handleCancel(e: Event) {
    e.preventDefault();
  }

  // Prevent backdrop click dismissal (ticket #155)
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialog) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function handleBanModalOpen(e: Event) {
    const detail = (e as CustomEvent<{banned_until: number; offence_count: number}>).detail;

    if (detail.banned_until === Number.MAX_SAFE_INTEGER) {
      expiresText = "Permanent";
    } else {
      const date = new Date(detail.banned_until);
      expiresText = date.toLocaleString();
    }

    offenceCount = detail.offence_count;
    dialog.showModal();
  }

  onMount(() => {
    document.addEventListener("tresr:ban-modal-open", handleBanModalOpen);
  });

  onDestroy(() => {
    document.removeEventListener("tresr:ban-modal-open", handleBanModalOpen);
  });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog
  bind:this={dialog}
  class="modal modal-middle"
  on:cancel={handleCancel}
  on:click={handleBackdropClick}
>
  <div class="modal-box border-error/30 bg-base-300 border text-center">
    <h3 class="text-error font-display text-3xl font-black tracking-widest uppercase">
      Access Denied
    </h3>
    <p class="py-4 opacity-70">
      Your account has been temporarily suspended due to a tamper detection violation.
    </p>

    <div class="stats stats-vertical bg-base-200/50 my-4 w-full shadow">
      <div class="stat">
        <div class="stat-title text-xs uppercase">Reason</div>
        <div class="stat-value text-error text-lg">Tamper Detection Violation</div>
      </div>
      <div class="stat">
        <div class="stat-title text-xs uppercase">Ban Expires</div>
        <div class="stat-value text-warning font-mono text-lg">{expiresText}</div>
      </div>
      <div class="stat">
        <div class="stat-title text-xs uppercase">Offence Count</div>
        <div class="stat-value text-warning font-mono text-lg">{offenceCount}</div>
      </div>
    </div>

    <div class="modal-action flex-col gap-2">
      <button on:click={handleBtnBack} class="btn btn-ghost btn-block">
        Return Home
      </button>
    </div>
  </div>
</dialog>
