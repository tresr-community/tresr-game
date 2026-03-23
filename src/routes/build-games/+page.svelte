<script lang="ts">
  import Footer from "@/components/user/Footer.svelte";
</script>

<svelte:head>
  <title>Build Games | TRESR</title>
</svelte:head>

<div class="min-h-screen pt-20 pb-10">
  <div class="container mx-auto max-w-3xl px-4 text-center">
    <h1
      class="text-primary font-display mb-4 text-5xl font-black tracking-widest drop-shadow-[0_0_10px_rgba(var(--primary),0.8)]"
    >
      BUILD GAMES 2026
    </h1>
    <p class="mb-12 font-mono text-sm opacity-60">
      Avalanche Build Games &middot; $1,000,000 Prize Pool &middot; 6 Weeks
    </p>

    <!-- Stages — custom vertical timeline -->
    <div class="relative w-full space-y-0 text-left">
      <!-- Stage 1: Idea — PASSED -->
      <div class="relative flex gap-4 pb-10">
        <div class="flex flex-col items-center">
          <div
            class="bg-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-black"
          >
            1
          </div>
          <div class="bg-primary/30 mt-1 w-0.5 flex-1"></div>
        </div>
        <div class="w-full pb-2">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span
              class="bg-primary/20 text-primary rounded px-2.5 py-0.5 font-mono text-xs font-semibold"
              >STAGE 1</span
            >
            <span
              class="rounded border border-green-500/50 bg-green-500/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-green-400"
              >PASSED</span
            >
          </div>
          <div class="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
            <h2
              class="text-secondary mb-1 font-mono text-2xl tracking-widest uppercase"
            >
              Idea
            </h2>
            <p class="mb-1 font-mono text-xs opacity-50">
              Deadline: February 25, 2026
            </p>
            <p class="mb-6 text-sm opacity-70">
              1-minute video pitch explaining the project idea, target problem,
              solution approach, and value proposition.
            </p>
            <div
              class="overflow-hidden rounded-xl border border-white/10 bg-white/5"
            >
              <figure class="px-4 pt-4">
                <!-- svelte-ignore a11y-media-has-caption -->
                <video
                  src="/videos/stage-1.webm"
                  controls
                  playsinline
                  preload="metadata"
                  class="w-full rounded-lg"
                >
                  Your browser does not support WebM video.
                </video>
              </figure>
              <div class="flex flex-col items-center p-4 text-center">
                <p class="font-mono text-xs opacity-50">Stage 1 Pitch</p>
                <a
                  href="https://youtu.be/i383N6NwAbw"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="mt-2 inline-flex items-center gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-1.5 font-mono text-xs text-red-400 transition-all hover:bg-red-500/20"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    class="size-[1.2em]"
                  >
                    <path
                      d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z"
                    ></path>
                  </svg>
                  Watch on YouTube
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Stage 2: MVP — PASSED -->
      <div class="relative flex gap-4 pb-10">
        <div class="flex flex-col items-center">
          <div
            class="bg-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-black"
          >
            2
          </div>
          <div class="bg-primary/30 mt-1 w-0.5 flex-1"></div>
        </div>
        <div class="w-full pb-2">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span
              class="bg-primary/20 text-primary rounded px-2.5 py-0.5 font-mono text-xs font-semibold"
              >STAGE 2</span
            >
            <span
              class="rounded border border-green-500/50 bg-green-500/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-green-400"
              >PASSED</span
            >
          </div>
          <div class="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
            <h2
              class="text-secondary mb-1 font-mono text-2xl tracking-widest uppercase"
            >
              MVP
            </h2>
            <p class="mb-1 font-mono text-xs opacity-50">
              Deadline: March 9, 2026
            </p>
            <p class="mb-4 text-sm opacity-70">
              Functional prototype, GitHub repository, technical documentation,
              and product walkthrough video.
            </p>

            <!-- MVP Highlights -->
            <div class="mb-4 text-left">
              <p
                class="mb-2 font-mono text-xs font-bold tracking-wider uppercase opacity-70"
              >
                MVP Highlights
              </p>
              <ul class="list-inside list-disc space-y-1 text-sm opacity-70">
                <li>
                  Hybrid architecture &mdash; Phaser 3 game engine + HTML5
                  SvelteKit frontend + Avalanche C-Chain settlement
                </li>
                <li>SIWA (Sign In With Avalanche) wallet authentication</li>
                <li>
                  Vault contract &mdash; pay-to-play fee deposits &amp;
                  oracle-signed claims
                </li>
                <li>
                  Anti-cheat pipeline &mdash; seeded RNG, input recording,
                  config hash verification
                </li>
                <li>
                  2.5D physics with Z-axis gravity, depth sorting &amp; shadow
                  rendering
                </li>
                <li>
                  5 enemy variants, 4 AI types, boss fight phase,
                  parachute-physics key airdrops
                </li>
                <li>Guest mode for frictionless onboarding of normies</li>
              </ul>
            </div>

            <!-- Teaser Video -->
            <div
              class="mb-4 overflow-hidden rounded-xl border border-white/10 bg-white/5"
            >
              <div class="flex flex-col items-center p-4 text-center">
                <p class="font-mono text-xs opacity-50">Stage 2 Teaser</p>
                <a
                  href="https://youtu.be/SBPIdfj97wY"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="mt-2 inline-flex items-center gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-1.5 font-mono text-xs text-red-400 transition-all hover:bg-red-500/20"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    class="size-[1.2em]"
                  >
                    <path
                      d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z"
                    ></path>
                  </svg>
                  Watch on YouTube
                </a>
              </div>
            </div>

            <!-- Walkthrough Video -->
            <div
              class="overflow-hidden rounded-xl border border-white/10 bg-white/5"
            >
              <figure class="px-4 pt-4">
                <!-- svelte-ignore a11y-media-has-caption -->
                <video
                  src="/videos/stage-2.webm"
                  controls
                  playsinline
                  preload="metadata"
                  class="w-full rounded-lg"
                >
                  Your browser does not support WebM video.
                </video>
              </figure>
              <div class="flex flex-col items-center p-4 text-center">
                <p class="font-mono text-xs opacity-50">Stage 2 Walkthrough</p>
                <a
                  href="https://youtu.be/6vTbWBfK-eY"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="mt-2 inline-flex items-center gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-1.5 font-mono text-xs text-red-400 transition-all hover:bg-red-500/20"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    class="size-[1.2em]"
                  >
                    <path
                      d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z"
                    ></path>
                  </svg>
                  Watch on YouTube
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Stage 3: GTM & Vision — ELIMINATED -->
      <div class="relative flex gap-4 pb-10">
        <div class="flex flex-col items-center">
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-700/60 text-xs font-bold text-white"
          >
            3
          </div>
          <div class="mt-1 w-0.5 flex-1 bg-red-700/30"></div>
        </div>
        <div class="w-full pb-2">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span
              class="rounded bg-white/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-white/60"
              >STAGE 3</span
            >
            <span
              class="rounded border border-red-500/50 bg-red-500/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-red-400"
              >ELIMINATED</span
            >
          </div>
          <div class="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <h2
              class="text-secondary mb-1 font-mono text-2xl tracking-widest uppercase"
            >
              GTM &amp; Vision
            </h2>
            <p class="mb-1 font-mono text-xs opacity-50">
              Deadline: March 19, 2026
            </p>
            <p class="text-sm opacity-70">
              Go-to-market plan, growth strategy, user personas, competitive
              analysis, and long-term vision.
            </p>
          </div>
        </div>
      </div>

      <!-- Stage 4: Finals — ELIMINATED -->
      <div class="relative flex gap-4 pb-6">
        <div class="flex flex-col items-center">
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-700/60 text-xs font-bold text-white"
          >
            4
          </div>
        </div>
        <div class="w-full pb-2">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span
              class="rounded bg-white/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-white/60"
              >STAGE 4</span
            >
            <span
              class="rounded border border-red-500/50 bg-red-500/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-red-400"
              >ELIMINATED</span
            >
          </div>
          <div class="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <h2
              class="text-secondary mb-1 font-mono text-2xl tracking-widest uppercase"
            >
              Finals
            </h2>
            <p class="mb-1 font-mono text-xs opacity-50">
              Deadline: March 27, 2026
            </p>
            <p class="text-sm opacity-70">
              Final pitch deck, live product demo, complete documentation, and
              Q&amp;A with judges.
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-16 font-mono text-xs opacity-50">
      Avalanche Build Games 2026 &middot; <a
        href="https://build.avax.network/build-games"
        target="_blank"
        class="text-primary underline underline-offset-2 hover:opacity-80"
        >build.avax.network</a
      >
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
