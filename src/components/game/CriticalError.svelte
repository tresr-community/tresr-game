<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import {gameState} from "@/lib/game/state";
  import {log} from "@/lib/utils/log";
  import {trackError} from "@/lib/metrics/analytics";
  import Modal from "@/components/ui/Modal.svelte";

  let open = $state(false);
  let errorMessage = $state("An unexpected error occurred.");
  let unsubState: () => void;

  function showCriticalError(message: string) {
    log.error("CriticalError", message);
    errorMessage = message;
    if (!open) open = true;

    trackError("critical_error", message, {severity: "critical"}).catch(
      () => {}
    );

    const game = (window as any).__phaserGame;
    if (game) {
      try {
        game.destroy(true);
        delete (window as any).__phaserGame;
      } catch {}
    }
  }

  function handleCriticalEvent(e: Event) {
    const message =
      (e as CustomEvent<string>).detail || "An unexpected error occurred.";
    showCriticalError(message);
  }

  onMount(() => {
    document.addEventListener("tresr:critical-error", handleCriticalEvent);

    unsubState = gameState.subscribe((state) => {
      if (state.criticalError && !open) {
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

<Modal
  bind:open
  title="Critical Error"
  closeOnEscape={false}
  closeOnOutsideClick={false}
>
  <div
    role="alert"
    class="my-4 flex items-start gap-4 rounded-md border border-[#dc2626]/50 bg-[#dc2626]/20 px-4 py-4 text-left text-[#fecaca]"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-6 w-6 shrink-0 stroke-[#f87171]"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
    <p class="font-mono text-sm sm:text-base">{errorMessage}</p>
  </div>

  <p
    class="flex items-center justify-center py-1 text-center text-xs text-white/50 italic sm:py-2"
  >
    The game has been stopped. Check the browser console for additional details.
  </p>

  {#snippet footer()}
    <button
      onclick={() => (window.location.href = "/")}
      class="w-full rounded-md border border-[#dc2626]/50 bg-[#dc2626]/10 px-4 py-2 font-bold tracking-widest text-[#f87171] uppercase transition-colors hover:bg-[#dc2626]/20"
    >
      Return to Base
    </button>
  {/snippet}
</Modal>
