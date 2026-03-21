<script lang="ts">
  import {unified} from "unified";
  import remarkParse from "remark-parse";
  import remarkGfm from "remark-gfm";
  import remarkEmoji from "remark-emoji";
  import remarkBreaks from "remark-breaks";
  import remarkRehype from "remark-rehype";
  import rehypeStringify from "rehype-stringify";
  import {config} from "@/lib/config/client";
  import PWA from "@/lib/pwa";
  import {getAuthState} from "@/lib/auth";
  import {enqueueProfileWrite} from "@/lib/user";
  import {trackModalOpen} from "@/lib/metrics/analytics";
  import Modal from "@/components/ui/Modal.svelte";
  import {openHowToPlay} from "@/lib/stores/ui.svelte";

  let open = $state(false);

  // Capture the tick at mount so stale ticks from prior page visits don't
  // re-open the modal when this component mounts on a fresh navigation.
  const mountTick = openHowToPlay.current;

  // Open only when the tick increments *after* this component was mounted
  $effect(() => {
    if (openHowToPlay.current > mountTick) openHowToPlayModal();
  });

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkEmoji)
    .use(remarkBreaks)
    .use(remarkRehype)
    .use(rehypeStringify);

  const instructionsHtml = processor
    .processSync(config.app.instructions)
    .toString();

  async function openHowToPlayModal() {
    open = true;
    trackModalOpen("how_to_play");
    PWA.getInstance().checkForUpdates();

    try {
      const auth = getAuthState();
      if (auth.isAuthenticated && !auth.isGuest && auth.user) {
        await enqueueProfileWrite(auth.user.key, (profile) => ({
          ...profile,
          preferences: {...profile.preferences, has_read_instructions: true},
        }));
      }
    } catch {
      // Non-critical
    }
  }
</script>

<Modal bind:open title="HOW TO PLAY" maxWidth="max-w-2xl" mobileFull>
  <div
    class="prose prose-invert prose-sm prose-headings:text-xl prose-h2:my-4 prose-p:my-2 prose-ul:my-0 prose-ol:my-0 prose-li:my-1 marker:text-primary max-w-none leading-snug break-words text-white/80"
  >
    {@html instructionsHtml}
  </div>
</Modal>
