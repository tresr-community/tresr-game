<script lang="ts">
  import type {HTMLAttributes} from "svelte/elements";
  import type {Snippet} from "svelte";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    variant?: "info" | "success" | "warning" | "error";
    icon?: boolean;
    children: Snippet;
  }

  let {
    variant = "info",
    icon = true,
    class: className = "",
    children,
    ...rest
  }: Props = $props();

  const baseClasses =
    "flex items-start gap-3 rounded-lg border p-4 shadow-lg backdrop-blur text-sm";

  const variantClasses = {
    info: "border-info/50 bg-info/20 text-info font-medium",
    success: "border-success/50 bg-success/20 text-success font-medium",
    warning: "border-warning/50 bg-warning/20 text-warning font-medium",
    error: "border-error/50 bg-error/20 text-error font-medium",
  };

  let finalClass = $derived(
    [baseClasses, variantClasses[variant], className].filter(Boolean).join(" ")
  );
</script>

<div role="alert" class={finalClass} {...rest}>
  {#if icon}
    <div class="mt-0.5 shrink-0 opacity-80">
      {#if variant === "info"}
        ℹ️
      {:else if variant === "success"}
        ✅
      {:else if variant === "warning"}
        ⚠️
      {:else if variant === "error"}
        ❌
      {/if}
    </div>
  {/if}
  <div class="flex w-full flex-1 flex-col items-start gap-1">
    {@render children()}
  </div>
</div>
