<script lang="ts">
  import { onMount, tick } from "svelte";
  import { config } from "@/lib/config/client";

  export let minTime = 250;
  export let id = "loader";

  const messages = config.app.loader_messages;
  let message = "Loading...";
  let isHidden = false;
  let isFading = false;
  let mounted = false;

  onMount(() => {
    mounted = true;
    if (messages.length > 0) {
      message = messages[Math.floor(Math.random() * messages.length)];
    }

    const start = (window as any).startTime || Date.now();
    const elapsed = Date.now() - start;
    const remaining = Math.max(0, minTime - elapsed);

    setTimeout(() => {
      isFading = true;
      setTimeout(() => {
        isHidden = true;
        window.dispatchEvent(new CustomEvent("loader-ready"));
      }, 700);
    }, remaining);
  });
</script>

{#if !isHidden && mounted}
<div id={id} class={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black transition-opacity duration-700 ${isFading ? 'opacity-0' : ''}`}>
  <div class="text-center">
    <span class="loading loading-bars loading-lg text-primary"></span>
    <p id={`${id}-message`} class="text-primary font-display mt-4 animate-pulse tracking-widest uppercase">
      {message}
    </p>
  </div>
</div>
{/if}
