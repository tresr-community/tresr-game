<script lang="ts">
  import type {HTMLAttributes} from "svelte/elements";
  import type {Snippet} from "svelte";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    variant?: "default" | "bordered" | "glowing";
    padding?: "none" | "sm" | "md" | "lg";
    children: Snippet;
  }

  let {
    variant = "default",
    padding = "md",
    class: className = "",
    children,
    ...rest
  }: Props = $props();

  const baseClasses = "rounded-xl overflow-hidden transition-all";

  const variantClasses = {
    default: "bg-white/5 border border-white/10 shadow-sm",
    bordered: "bg-white/5 border border-primary/20",
    glowing:
      "bg-white/8 border border-primary/30 shadow-[0_0_15px_rgba(var(--color-primary),0.15)] hover:border-primary/50",
  };

  const paddingClasses = {
    none: "",
    sm: "p-3 sm:p-4",
    md: "p-4 sm:p-6",
    lg: "p-6 sm:p-8",
  };

  let finalClass = $derived(
    [baseClasses, variantClasses[variant], paddingClasses[padding], className]
      .filter(Boolean)
      .join(" ")
  );
</script>

<div class={finalClass} {...rest}>
  {@render children()}
</div>
