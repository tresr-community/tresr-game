<script lang="ts">
  import {config} from "@/lib/config/client";
  import {onMount} from "svelte";

  const message = config.app.custom_404 || "404, degen not found.";
</script>

<svelte:head>
  <title>404 - Not Found</title>
</svelte:head>

<div class="hero bg-base-200 min-h-screen">
  <div class="hero-content flex-col lg:flex-row">
    <img
      src="/assets/images/ron_jay_404.webp"
      class="mask mask-squircle max-w-sm rounded-lg shadow-2xl"
      alt="Ron Jay"
    />
    <div>
      <div class="chat chat-start">
        <div class="chat-header">
          Ron Jay
          <time class="text-xs opacity-50">Just now</time>
        </div>
        <div class="chat-bubble chat-bubble-primary text-lg">
          {message}
        </div>
      </div>

      <div class="mt-6">
        <a href="/" class="btn btn-primary"> GO HOME </a>
      </div>
    </div>
  </div>
</div>
