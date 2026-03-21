<script lang="ts">
  import {maintenanceModal} from "@/lib/stores/ui.svelte";
  import Modal from "@/components/ui/Modal.svelte";

  let open = $state(false);

  $effect(() => {
    if (maintenanceModal.current) open = true;
  });

  function handleBtnRefresh() {
    window.location.reload();
  }

  function handleBtnBack() {
    open = false;
    maintenanceModal.set(false);
    window.location.href = "/";
  }
</script>

<Modal
  bind:open
  title="Under Maintenance"
  closeOnEscape={false}
  closeOnOutsideClick={false}
  mobileFull
>
  <p class="py-2 opacity-70">
    We're deploying an update. Check back soon — no funds are at risk during
    this window.
  </p>

  <div
    class="my-4 flex w-full flex-col gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 shadow-inner"
  >
    <div class="flex flex-col border-b border-white/5 bg-black/40 p-3">
      <div
        class="text-[10px] font-bold tracking-widest text-[#eab308] uppercase"
      >
        Status
      </div>
      <div class="text-sm font-bold text-[#fde047]">Deploying</div>
    </div>
    <div class="flex flex-col bg-black/40 p-3">
      <div
        class="text-[10px] font-bold tracking-widest text-white/50 uppercase"
      >
        Action Required
      </div>
      <div class="font-mono text-sm font-bold text-white/70">
        Check back soon
      </div>
    </div>
  </div>

  {#snippet footer()}
    <div class="flex w-full flex-col gap-2">
      <button
        onclick={handleBtnRefresh}
        class="w-full rounded-md bg-[#eab308] px-4 py-2 font-bold tracking-widest text-black uppercase shadow-[0_0_15px_rgba(234,179,8,0.4)] transition-all hover:scale-[1.02] hover:bg-[#ca8a04] active:scale-95"
      >
        Refresh Page
      </button>
      <button
        onclick={handleBtnBack}
        class="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2 font-bold tracking-widest text-white/70 uppercase transition-colors hover:bg-white/10 hover:text-white"
      >
        Return Home
      </button>
    </div>
  {/snippet}
</Modal>
