<script lang="ts">
  import { config } from "@/lib/config/client";
  const footerText = config.app.footer_text;
  const packageVersion = import.meta.env.PACKAGE_VERSION || "0.0.0";
</script>

<footer class="fixed inset-x-0 bottom-0 z-20 flex justify-center px-2 pt-2 pb-[env(safe-area-inset-bottom,0px)]">
  <div class="bg-base-300/80 border-primary/20 text-base-content/50 rounded-t-lg border-x border-t px-4 pt-1 font-mono text-xs backdrop-blur">
    <span class="opacity-75">{footerText}</span>
    <span class="mx-2">|</span>
    <a href="/credits" class="link link-hover link-primary">CREDITS</a>
    <span class="mx-2">|</span>
    <a href="/changelog" class="link link-hover link-primary">v{packageVersion}</a>
  </div>
</footer>
