<script lang="ts">
  import {config} from "@/lib/config/client";

  const message = config.app.custom_404 || "404, degen not found.";
</script>

<svelte:head>
  <title>404 - Not Found</title>
</svelte:head>

<div
  class="flex min-h-screen flex-col items-center justify-center gap-8 bg-black px-4 text-center"
>
  <img
    src="/assets/images/ron_jay_404.webp"
    class="ring-primary/30 w-48 max-w-sm rounded-2xl shadow-2xl ring-2 sm:w-64"
    alt="Ron Jay"
  />
  <div class="max-w-md space-y-4">
    <div
      class="border-primary/20 inline-block rounded-xl border bg-white/5 px-6 py-4 text-left shadow-lg backdrop-blur"
    >
      <p class="mb-1 font-mono text-xs text-white/40">RON JAY — Just now</p>
      <p class="text-primary font-mono text-lg">{message}</p>
    </div>
    <div>
      <a
        href="/"
        class="border-primary text-primary hover:bg-primary inline-block rounded-md border px-8 py-3 font-mono text-sm tracking-widest uppercase transition-all hover:text-black hover:shadow-[0_0_15px_var(--color-primary)]"
      >
        GO HOME
      </a>
    </div>
  </div>
</div>
