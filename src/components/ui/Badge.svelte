<script lang="ts">
  import type {HTMLAttributes} from "svelte/elements";
  import type {Snippet} from "svelte";

  interface Props extends HTMLAttributes<HTMLSpanElement> {
    variant?:
      | "primary"
      | "secondary"
      | "ghost"
      | "info"
      | "success"
      | "warning"
      | "error";
    size?: "sm" | "md" | "lg";
    children: Snippet;
  }

  let {
    variant = "primary",
    size = "md",
    class: className = "",
    children,
    ...rest
  }: Props = $props();

  const baseClasses =
    "inline-flex items-center justify-center font-bold tracking-widest uppercase font-mono transition-colors";

  const variantClasses = {
    primary: "bg-primary text-black",
    secondary: "bg-secondary text-black",
    ghost: "bg-white/10 text-white/70",
    info: "bg-info text-black",
    success: "bg-success text-black",
    warning: "bg-warning text-black",
    error: "bg-error text-white",
  };

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px] rounded",
    md: "px-2.5 py-1 text-xs rounded-md",
    lg: "px-4 py-1.5 text-sm rounded-full",
  };

  let finalClass = $derived(
    [baseClasses, variantClasses[variant], sizeClasses[size], className]
      .filter(Boolean)
      .join(" ")
  );
</script>

<span class={finalClass} {...rest}>
  {@render children()}
</span>
