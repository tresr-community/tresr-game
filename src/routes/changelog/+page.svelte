<script lang="ts">
  import {config} from "@/lib/config/client";
  import SpeechBubble from "@/components/ui/SpeechBubble.svelte";

  const versions = config.changelog?.versions ?? [];
</script>

<svelte:head>
  <title>Changelog | TRESR</title>
</svelte:head>

<div class="min-h-screen pt-20 pb-10">
  <div class="container mx-auto max-w-3xl px-4">
    <h1
      class="text-primary font-display mb-12 text-center text-5xl font-black tracking-widest drop-shadow-[0_0_10px_rgba(var(--primary),0.8)]"
    >
      CHANGELOG
    </h1>

    <SpeechBubble
      avatarSrc="/assets/images/ron_jay_speech_bubble.webp"
      avatarAlt="Ron Jay"
      name="Ron Jay"
      role="Patch Notes"
    >
      Listen up, Degen. Here's what we shipped.
      <br />
      Every update, every fix, every buff and nerf — it's all here.
    </SpeechBubble>

    <!-- Timeline -->
    <div
      class="border-primary/30 relative ml-4 space-y-8 border-l-2 pb-8 text-left sm:ml-6"
    >
      {#each versions as release, i}
        <div class="relative pl-6 sm:pl-8">
          <!-- Timeline point -->
          <div
            class="absolute top-1 -left-[11px] h-5 w-5 rounded-full border-2 bg-[#0a0a0f] {i ===
            0
              ? 'border-primary shadow-[0_0_10px_var(--color-primary)]'
              : 'border-white/20'} flex items-center justify-center"
          >
            {#if i === 0}
              <div class="bg-primary h-2 w-2 animate-pulse rounded-full"></div>
            {/if}
          </div>

          <div class="w-full">
            <div
              class={`rounded-xl border p-4 shadow-sm transition-all hover:scale-[1.01] sm:p-6 ${i === 0 ? "border-primary/50 bg-primary/10" : "border-white/10 bg-white/5"}`}
            >
              <!-- Version header -->
              <div class="mb-4 flex flex-wrap items-center gap-3">
                <span
                  class={`rounded px-2 py-1 font-mono text-xs font-bold ${i === 0 ? "bg-primary shadow-primary/30 text-black shadow-sm" : "bg-white/10 text-white/70"}`}
                >
                  v{release.version}
                </span>
                {#if i === 0}
                  <span
                    class="bg-secondary/20 text-secondary animate-pulse rounded px-2 py-1 text-[10px] font-bold tracking-wider uppercase"
                  >
                    LATEST
                  </span>
                {/if}
                <span class="font-mono text-xs text-white/50">
                  {release.date}
                </span>
              </div>

              <!-- Title -->
              <h2
                class={`mb-3 text-lg font-bold tracking-wide ${i === 0 ? "text-primary drop-shadow-[0_0_5px_rgba(var(--color-primary),0.5)]" : "text-white/80"}`}
              >
                {release.title}
              </h2>

              <!-- Notes -->
              <ul class="space-y-2">
                {#each release.notes as note}
                  <li class="flex items-start gap-2 text-sm">
                    <span
                      class="text-primary/70 mt-0.5 shrink-0 font-mono text-xs"
                    >
                      &#9656;
                    </span>
                    <span class="leading-relaxed text-white/80">{note}</span>
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        </div>
      {/each}
    </div>

    {#if versions.length === 0}
      <div class="py-10 text-center font-mono opacity-50">
        No changelog entries yet.
      </div>
    {/if}

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
