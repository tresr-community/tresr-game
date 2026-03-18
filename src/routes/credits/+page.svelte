<script lang="ts">
  import {config} from "@/lib/config/client";
  import {onMount} from "svelte";
  import {getVaultCurrentBalance} from "@/lib/blockchain/contracts/vault";
  import {log} from "@/lib/utils/log";
  import SpeechBubble from "@/components/ui/SpeechBubble.svelte";

  const {credits} = config;
  const currentDate = new Date().toLocaleDateString();
</script>

<svelte:head>
  <title>Credits | TRESR</title>
</svelte:head>

<div class="min-h-screen pt-20 pb-10">
  <div class="container mx-auto max-w-2xl px-4 text-center">
    <h1
      class="text-primary font-display mb-12 text-5xl font-black tracking-widest drop-shadow-[0_0_10px_rgba(var(--primary),0.8)]"
    >
      CREDITS
    </h1>

    <SpeechBubble
      avatarSrc="/assets/images/ron_jay_speech_bubble.webp"
      avatarAlt="Ron Jay"
      name="Ron Jay"
      role="Credits"
    >
      {credits?.description}
    </SpeechBubble>

    <div class="flex flex-col gap-16 text-left">
      <!-- Team Section -->
      <section>
        <h2
          class="text-secondary mb-6 text-center font-mono text-2xl tracking-widest uppercase"
        >
          The Crew
        </h2>
        <div class="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {#each credits?.coders || [] as c}
            <div
              class="border-primary/20 transition-hover hover:border-primary/50 rounded-xl border bg-white/5 text-left shadow-sm hover:bg-white/10"
            >
              <div class="flex flex-col gap-1 p-5">
                <div class="text-lg font-bold text-white">{c.name}</div>
                <div
                  class="text-primary/80 font-mono text-sm tracking-wide uppercase"
                >
                  {c.role}
                </div>
                {#if c.description}
                  <div class="mt-2 text-xs text-white/60 italic">
                    {c.description}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>

      <!-- Tech Stack -->
      <section>
        <h2
          class="text-secondary mb-6 text-center font-mono text-2xl tracking-widest uppercase"
        >
          Powered By
        </h2>
        <div class="flex flex-wrap justify-center gap-3">
          {#each credits?.components || [] as component}
            <span
              class="border-primary/50 bg-primary/10 text-primary rounded-full border px-4 py-1.5 text-sm font-medium whitespace-nowrap shadow-sm"
            >
              {component.name}
            </span>
          {/each}
        </div>
      </section>

      <!-- Assets -->
      <section>
        <h2
          class="text-secondary mb-6 text-center font-mono text-2xl tracking-widest uppercase"
        >
          Assets
        </h2>
        <div class="grid gap-4 sm:grid-cols-2">
          {#each credits?.assets || [] as asset}
            <div
              class="transition-hover rounded-xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10"
            >
              <div class="font-mono text-sm text-white/70">
                {#if asset.subtype}
                  <span class="text-white/90">{asset.type}</span>
                  <span class="text-primary/80 text-xs uppercase"
                    >({asset.subtype})</span
                  >
                  <br class="hidden sm:block" />
                  <span class="ml-0 text-xs opacity-50 sm:ml-2"
                    >By {asset.provider}</span
                  >
                {:else}
                  <span class="text-white/90">{asset.type}</span>
                  <br class="hidden sm:block" />
                  <span class="ml-0 text-xs opacity-50 sm:ml-2"
                    >By {asset.provider}</span
                  >
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>
    </div>

    <div class="mt-16 font-mono text-xs opacity-50">
      Generated on {currentDate}
    </div>

    <div class="mt-12 pb-6 text-center">
      <a
        href="/"
        class="border-primary text-primary hover:bg-primary inline-block rounded-md border px-8 py-3 font-mono text-sm tracking-widest uppercase transition-all hover:text-black hover:shadow-[0_0_15px_var(--color-primary)]"
      >
        RETURN HOME
      </a>
    </div>
  </div>
</div>
