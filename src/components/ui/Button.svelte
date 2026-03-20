<script lang="ts">
  import type {HTMLButtonAttributes} from "svelte/elements";
  import type {Snippet} from "svelte";

  interface Props extends HTMLButtonAttributes {
    variant?:
      | "primary"
      | "secondary"
      | "ghost"
      | "outline"
      | "circle"
      | "warning"
      | "error"
      | "info"
      | "success";
    size?: "xs" | "sm" | "md" | "lg";
    children?: Snippet;
  }

  let {
    variant = "primary",
    size = "md",
    class: className = "",
    children,
    ...rest
  }: Props = $props();

  const baseClasses =
    "inline-flex items-center justify-center font-mono font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 shrink-0";

  const variantClasses = {
    primary:
      "bg-primary text-black hover:bg-primary/90 hover:shadow-[0_0_15px_var(--color-primary)]",
    secondary:
      "bg-secondary text-black hover:bg-secondary/90 hover:shadow-[0_0_15px_var(--color-secondary)]",
    ghost: "bg-transparent hover:bg-white/10 text-current",
    outline:
      "border border-primary text-primary hover:bg-primary hover:text-black hover:shadow-[0_0_15px_var(--color-primary)] tracking-widest",
    warning:
      "bg-warning text-black hover:bg-warning/90 hover:shadow-[0_0_15px_var(--color-warning)]",
    error:
      "bg-error text-white hover:bg-error/90 hover:shadow-[0_0_15px_var(--color-error)]",
    info: "bg-info text-black hover:bg-info/90 hover:shadow-[0_0_15px_var(--color-info)]",
    success:
      "bg-success text-black hover:bg-success/90 hover:shadow-[0_0_15px_var(--color-success)]",
    circle:
      "bg-white/10 text-white hover:bg-white/20 border border-white/20 backdrop-blur-sm shadow-xl hover:shadow-[0_0_15px_rgba(255,255,255,0.2)]",
  };

  const sizeClasses = {
    xs: "px-2 py-1 text-xs rounded",
    sm: "px-3 py-1.5 text-sm rounded-md",
    md: "px-6 py-2 rounded-lg text-sm",
    lg: "px-8 py-3 text-lg rounded-xl",
  };

  const circleClasses = {
    xs: "w-6 h-6 rounded-full text-xs focus:ring-2",
    sm: "w-8 h-8 rounded-full text-sm",
    md: "w-12 h-12 rounded-full text-base",
    lg: "w-16 h-16 rounded-full text-xl",
  };

  let isCircle = $derived(variant === "circle");

  let finalClass = $derived(
    [
      baseClasses,
      isCircle ? circleClasses[size] : sizeClasses[size],
      variantClasses[variant],
      className,
    ]
      .filter(Boolean)
      .join(" ")
  );
</script>

<button class={finalClass} {...rest}>
  {@render children?.()}
</button>
