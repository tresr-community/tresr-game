<script lang="ts">
  import {onMount, tick} from "svelte";
  import {config} from "@/lib/config/client";

  let {minTime = 250, id = "loader"}: {minTime?: number; id?: string} =
    $props();

  const messages = config.app.loader_messages;
  let message = $state("Loading...");
  let isHidden = $state(false);
  let isFading = $state(false);
  let mounted = $state(false);

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
  <div
    {id}
    class={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black transition-opacity duration-700 ${isFading ? "opacity-0" : ""}`}
  >
    <div class="text-center">
      <svg
        width="48"
        height="36"
        viewBox="0 0 48 36"
        class="text-primary mx-auto"
        fill="currentColor"
        aria-hidden="true"
      >
        <rect x="0" y="8" width="8" height="20" rx="2" opacity="0.8">
          <animate
            attributeName="height"
            values="20;32;20"
            dur="0.8s"
            repeatCount="indefinite"
            begin="0s"
          />
          <animate
            attributeName="y"
            values="8;2;8"
            dur="0.8s"
            repeatCount="indefinite"
            begin="0s"
          />
        </rect>
        <rect x="10" y="8" width="8" height="20" rx="2" opacity="0.8">
          <animate
            attributeName="height"
            values="20;32;20"
            dur="0.8s"
            repeatCount="indefinite"
            begin="0.1s"
          />
          <animate
            attributeName="y"
            values="8;2;8"
            dur="0.8s"
            repeatCount="indefinite"
            begin="0.1s"
          />
        </rect>
        <rect x="20" y="8" width="8" height="20" rx="2" opacity="0.8">
          <animate
            attributeName="height"
            values="20;32;20"
            dur="0.8s"
            repeatCount="indefinite"
            begin="0.2s"
          />
          <animate
            attributeName="y"
            values="8;2;8"
            dur="0.8s"
            repeatCount="indefinite"
            begin="0.2s"
          />
        </rect>
        <rect x="30" y="8" width="8" height="20" rx="2" opacity="0.8">
          <animate
            attributeName="height"
            values="20;32;20"
            dur="0.8s"
            repeatCount="indefinite"
            begin="0.3s"
          />
          <animate
            attributeName="y"
            values="8;2;8"
            dur="0.8s"
            repeatCount="indefinite"
            begin="0.3s"
          />
        </rect>
        <rect x="40" y="8" width="8" height="20" rx="2" opacity="0.8">
          <animate
            attributeName="height"
            values="20;32;20"
            dur="0.8s"
            repeatCount="indefinite"
            begin="0.4s"
          />
          <animate
            attributeName="y"
            values="8;2;8"
            dur="0.8s"
            repeatCount="indefinite"
            begin="0.4s"
          />
        </rect>
      </svg>
      <p
        id={`${id}-message`}
        class="text-primary font-display mt-4 animate-pulse tracking-widest uppercase"
      >
        {message}
      </p>
    </div>
  </div>
{/if}
