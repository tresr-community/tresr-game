<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { unified } from "unified";
  import remarkParse from "remark-parse";
  import remarkGfm from "remark-gfm";
  import remarkEmoji from "remark-emoji";
  import remarkBreaks from "remark-breaks";
  import remarkRehype from "remark-rehype";
  import rehypeStringify from "rehype-stringify";
  import { config } from "@/lib/config/client";
  import PWA from "@/lib/pwa";
  import { getAuthState } from "@/lib/auth";
  import { enqueueProfileWrite } from "@/lib/user";
  import { trackModalOpen } from "@/lib/metrics/analytics";

  let dialog: HTMLDialogElement;

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkEmoji)
    .use(remarkBreaks)
    .use(remarkRehype)
    .use(rehypeStringify);

  const instructionsHtml = processor.processSync(config.app.instructions).toString();

  async function openHowToPlayModal() {
    dialog?.showModal();
    trackModalOpen("how_to_play");
    PWA.getInstance().checkForUpdates();

    try {
      const auth = getAuthState();
      if (auth.isAuthenticated && !auth.isGuest && auth.user) {
        await enqueueProfileWrite(auth.user.key, (profile) => ({
          ...profile,
          preferences: { ...profile.preferences, has_read_instructions: true },
        }));
      }
    } catch {
      // Non-critical
    }
  }

  function closeHowToPlayModal() {
    dialog?.close();
  }

  function handleOpenHowToPlay() {
    openHowToPlayModal();
  }

  onMount(() => {
    document.addEventListener("tresr:open-how-to-play", handleOpenHowToPlay);
  });

  onDestroy(() => {
    document.removeEventListener("tresr:open-how-to-play", handleOpenHowToPlay);
  });
</script>

<dialog bind:this={dialog} id="how-to-play-modal" class="modal">
  <div class="modal-box border-primary/30 bg-base-200 w-11/12 max-w-3xl border">
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-primary text-2xl font-black tracking-widest">
        HOW TO PLAY
      </h2>
      <button on:click={closeHowToPlayModal} class="btn btn-circle btn-ghost min-h-[44px] min-w-[44px] text-lg">
        ✕
      </button>
    </div>

    <div class="prose prose-headings:text-xl prose-p:my-2 prose-h2:my-4 prose-li:my-1 prose-ol:my-0 prose-ul:my-0 prose-invert prose-sm max-w-none leading-snug break-words">
      {@html instructionsHtml}
    </div>
  </div>

  <form method="dialog" class="modal-backdrop">
    <button on:click={closeHowToPlayModal}>close</button>
  </form>
</dialog>
