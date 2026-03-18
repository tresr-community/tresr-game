<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { gameState } from "@/lib/game/state";
  import { log } from "@/lib/utils/log";
  import { trackError } from "@/lib/metrics/analytics";

  let dialog: HTMLDialogElement;
  let errorMessage = "An unexpected error occurred.";
  let unsubState: () => void;

  function showCriticalError(message: string) {
    log.error("CriticalError", message);
    errorMessage = message;
    if (dialog && !dialog.open) dialog.showModal();

    trackError("critical_error", message, { severity: "critical" }).catch(() => {});

    const game = (window as any).__phaserGame;
    if (game) {
      try {
        game.destroy(true);
        delete (window as any).__phaserGame;
      } catch {}
    }
  }

  function handleCriticalEvent(e: Event) {
    const message = (e as CustomEvent<string>).detail || "An unexpected error occurred.";
    showCriticalError(message);
  }

  onMount(() => {
    document.addEventListener("tresr:critical-error", handleCriticalEvent);

    unsubState = gameState.subscribe((state) => {
      if (state.criticalError && !dialog.open) {
        showCriticalError(state.criticalError);
      }
    });

    (window as any).triggerCriticalError = (msg?: string) => {
      showCriticalError(msg || "Test critical error from console");
    };
  });

  onDestroy(() => {
    document.removeEventListener("tresr:critical-error", handleCriticalEvent);
    if (unsubState) unsubState();
    delete (window as any).triggerCriticalError;
  });
</script>

<dialog bind:this={dialog} class="modal modal-middle">
  <div class="modal-box border-error/30 bg-base-300 flex h-full max-h-full w-full max-w-full flex-col items-center justify-center border p-4 text-center sm:h-auto sm:max-h-[85vh] sm:w-auto sm:max-w-lg sm:rounded-2xl sm:p-6">
    <h3 class="text-error font-display text-2xl font-black tracking-widest uppercase sm:text-4xl">
      Critical Error
    </h3>

    <div role="alert" class="alert alert-error my-4 text-left">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p class="text-sm sm:text-base">{errorMessage}</p>
    </div>

    <p class="py-1 text-xs italic opacity-50 sm:py-2 sm:text-sm">
      The game has been stopped. Check the browser console for additional details.
    </p>

    <div class="modal-action w-full flex-col gap-1 sm:gap-2">
      <button on:click={() => window.location.href='/'} class="btn btn-error btn-block btn-sm sm:btn-md">
        Return to Base
      </button>
    </div>
  </div>
</dialog>
