<script lang="ts">
  import {Dialog} from "bits-ui";
  import type {Snippet} from "svelte";
  import {fade, fly} from "svelte/transition";

  type Props = {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    title?: string;
    description?: string;
    trigger?: Snippet;
    children: Snippet;
    footer?: Snippet;
    preventScroll?: boolean;
    closeOnEscape?: boolean;
    closeOnOutsideClick?: boolean;
    maxWidth?: string;
  };

  let {
    open = $bindable(false),
    onOpenChange,
    title,
    description,
    trigger,
    children,
    footer,
    preventScroll = true,
    closeOnEscape = true,
    closeOnOutsideClick = true,
    maxWidth = "max-w-lg",
  }: Props = $props();

  function handleOpenChange(state: boolean) {
    if (onOpenChange) onOpenChange(state);
    open = state;
  }
</script>

<Dialog.Root bind:open {onOpenChange}>
  {#if trigger}
    <Dialog.Trigger>
      {@render trigger()}
    </Dialog.Trigger>
  {/if}
  <Dialog.Portal>
    <Dialog.Overlay forceMount>
      {#snippet child({props, open})}
        {#if open}
          <div
            {...props}
            transition:fade={{duration: 150}}
            class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm"
          ></div>
        {/if}
      {/snippet}
    </Dialog.Overlay>

    <Dialog.Content
      {preventScroll}
      escapeKeydownBehavior={closeOnEscape ? "close" : "ignore"}
      interactOutsideBehavior={closeOnOutsideClick ? "close" : "ignore"}
      forceMount
    >
      {#snippet child({props, open})}
        {#if open}
          <div
            {...props}
            transition:fly={{duration: 250, y: 15}}
            class="fixed top-[50%] left-[50%] z-[101] flex w-[95%] flex-col sm:w-full {maxWidth} border-primary/50 max-h-[90dvh] translate-x-[-50%] translate-y-[-50%] gap-0 border-y-2 bg-[#0d0d12] p-6 shadow-[0_0_50px_-12px_rgba(180,50,250,0.3)] sm:rounded-xl sm:border-x-2"
          >
            {#if title}
              <div
                class="mb-4 flex shrink-0 flex-col space-y-2 pr-10 text-center"
              >
                <Dialog.Title
                  class="text-2xl font-black tracking-widest text-white uppercase italic drop-shadow-[0_0_8px_var(--color-primary)]"
                >
                  {title}
                </Dialog.Title>
                {#if description}
                  <Dialog.Description class="text-sm text-white/60">
                    {description}
                  </Dialog.Description>
                {/if}
              </div>
            {/if}

            <div
              class="scrollbar-thin scrollbar-track-white/5 scrollbar-thumb-primary/40 hover:scrollbar-thumb-primary/70 min-h-0 flex-1 overflow-y-auto pr-1 text-white/90"
            >
              {@render children()}
            </div>

            {#if footer}
              <div
                class="mt-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:justify-end"
              >
                {@render footer()}
              </div>
            {/if}

            <Dialog.Close
              class="focus:ring-primary absolute top-4 right-4 rounded-full bg-white/5 p-1 text-white/50 transition-all hover:bg-white/10 hover:text-white focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0d0d12] focus:outline-none disabled:pointer-events-none"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="h-4 w-4"
                ><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg
              >
              <span class="sr-only">Close</span>
            </Dialog.Close>
          </div>
        {/if}
      {/snippet}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
