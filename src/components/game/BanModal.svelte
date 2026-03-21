<script lang="ts">
  import {banModal} from "@/lib/stores/ui.svelte";
  import Modal from "@/components/ui/Modal.svelte";

  let open = $state(false);
  let expiresText = $state("—");
  let offenceCount = $state(0);

  $effect(() => {
    const payload = banModal.current;
    if (!payload) return;

    expiresText =
      payload.banned_until === Number.MAX_SAFE_INTEGER
        ? "Permanent"
        : new Date(payload.banned_until).toLocaleString();
    offenceCount = payload.offence_count;
    open = true;
  });

  function handleBtnBack() {
    open = false;
    banModal.set(null);
    window.location.href = "/";
  }
</script>

<Modal
  bind:open
  title="Access Denied"
  closeOnEscape={false}
  closeOnOutsideClick={false}
  mobileFull
>
  <p class="py-2 opacity-70">
    Your account has been temporarily suspended due to a tamper detection
    violation.
  </p>

  <div
    class="my-4 flex w-full flex-col gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 shadow-inner"
  >
    <div class="flex flex-col border-b border-white/5 bg-black/40 p-3">
      <div
        class="text-[10px] font-bold tracking-widest text-[#dc2626] uppercase"
      >
        Reason
      </div>
      <div class="text-sm font-bold text-[#f87171]">
        Tamper Detection Violation
      </div>
    </div>
    <div class="flex flex-col border-b border-white/5 bg-black/40 p-3">
      <div
        class="text-[10px] font-bold tracking-widest text-[#eab308] uppercase"
      >
        Ban Expires
      </div>
      <div class="font-mono text-sm font-bold text-[#fde047]">
        {expiresText}
      </div>
    </div>
    <div class="flex flex-col bg-black/40 p-3">
      <div
        class="text-[10px] font-bold tracking-widest text-[#eab308] uppercase"
      >
        Offence Count
      </div>
      <div class="font-mono text-sm font-bold text-[#fde047]">
        {offenceCount}
      </div>
    </div>
  </div>

  {#snippet footer()}
    <button
      onclick={handleBtnBack}
      class="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2 font-bold tracking-widest text-white/70 uppercase transition-colors hover:bg-white/10 hover:text-white"
    >
      Return Home
    </button>
  {/snippet}
</Modal>
