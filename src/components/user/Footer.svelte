<script lang="ts">
  import {config} from "@/lib/config/client";
  import ThemeSwitcher from "./ThemeSwitcher.svelte";
  const footerText = config.app.footer_text;
  const packageVersion = import.meta.env.PACKAGE_VERSION || "0.0.0";
</script>

<footer
  class="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-2 pt-2 pb-[env(safe-area-inset-bottom,0px)]"
>
  <div
    class="border-primary/20 pointer-events-auto flex items-center gap-2 rounded-t-lg border-x border-t bg-black/70 px-4 py-1 font-mono text-xs text-white/50 shadow-[0_-5px_20px_rgba(0,0,0,0.5)] backdrop-blur"
  >
    <span class="hidden opacity-75 sm:inline">{footerText}</span>
    <span class="hidden opacity-30 sm:inline">|</span>
    <a href="/credits" class="hover:text-primary transition-colors">CREDITS</a>
    <span class="opacity-30">|</span>
    <a href="/changelog" class="hover:text-primary transition-colors"
      >v{packageVersion}</a
    >
    <span class="opacity-30">|</span>
    <ThemeSwitcher />
  </div>
</footer>
