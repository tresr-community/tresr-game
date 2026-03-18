<script lang="ts">
  import type {Snippet} from "svelte";

  type Props = {
    avatarSrc: string;
    avatarAlt: string;
    name: string;
    role?: string;
    children: Snippet;
  };

  let {avatarSrc, avatarAlt, name, role, children}: Props = $props();
</script>

<div
  class="mb-12 flex w-full flex-col items-start justify-center gap-4 sm:flex-row sm:justify-start"
>
  <!-- Avatar -->
  <div class="flex-shrink-0">
    <div
      class="ring-primary/50 w-16 overflow-hidden rounded-2xl shadow-[0_0_15px_var(--color-primary)] ring-2 sm:w-20"
    >
      <img src={avatarSrc} alt={avatarAlt} class="h-full w-full object-cover" />
    </div>
  </div>

  <!-- Message Container -->
  <div class="flex max-w-2xl flex-col">
    <div
      class="mb-1 flex items-baseline justify-center gap-2 pl-2 sm:justify-start"
    >
      <span class="font-bold text-white/90">{name}</span>
      {#if role}
        <span class="font-mono text-xs text-white/50 uppercase">{role}</span>
      {/if}
    </div>

    <!-- Bubble -->
    <div
      class="bg-primary text-primary-content border-primary/50 relative rounded-2xl rounded-tl-sm border px-5 py-3 text-left text-sm font-medium whitespace-pre-line shadow-[0_4px_20px_-5px_var(--color-primary)] sm:text-base"
    >
      {@render children()}
    </div>
  </div>
</div>
