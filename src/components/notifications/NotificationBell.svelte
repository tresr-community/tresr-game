<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import {notificationManager, type NotificationDoc} from "@/lib/notifications";
  import PWA from "@/lib/pwa";
  import {log} from "@/lib/utils/log";
  import {loadConfigAsync} from "@/lib/config";
  import {DropdownMenu} from "bits-ui";

  const COMPONENT_NAME = "NotificationBell";

  let customNotifications: string[] = ["No new notifications"];
  let notifications: NotificationDoc[] = [];
  let unreadCount = 0;
  let urgency = "none";

  $: activeNotifications = notifications.filter(
    (n) => !n.data.snoozeUntil || n.data.snoozeUntil < Date.now()
  );
  $: unreadCount = activeNotifications.length;

  let unsubNotifications: () => void;

  onMount(() => {
    loadConfigAsync()
      .then((config) => {
        if (config.app?.custom_notifications) {
          customNotifications = config.app.custom_notifications;
        }
      })
      .catch((e) => log.error(`[${COMPONENT_NAME}] Failed to load config`, e));

    unsubNotifications = notificationManager.subscribe((newNotifs) => {
      notifications = newNotifs;
      urgency = notificationManager.getHighestUrgency();
    });
  });

  onDestroy(() => {
    if (unsubNotifications) unsubNotifications();
  });

  function handleClearAll() {
    notificationManager.clearAll();
  }

  function getUrgencyClass(u: string) {
    if (u === "urgent") return "border-error";
    if (u === "non-urgent") return "border-warning";
    return "border-info";
  }

  function isSnoozed(n: NotificationDoc) {
    return n.data.snoozeUntil && n.data.snoozeUntil > Date.now();
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class="flex h-12 w-12 items-center justify-center rounded-full transition-colors hover:bg-white/10"
    aria-label="Notifications"
  >
    <div class="relative flex items-center justify-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="text-warning h-6 w-6 transition-colors"
        class:glow-orange={urgency === "non-urgent"}
        class:glow-red={urgency === "urgent"}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
      {#if unreadCount > 0}
        <span
          class="bg-primary absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-black/50 text-[10px] font-bold text-black shadow-sm"
        >
          {unreadCount}
        </span>
      {/if}
    </div>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content
    class="border-primary/20 z-50 mt-2 w-80 rounded-xl border bg-black/80 shadow-xl backdrop-blur-md outline-none"
    sideOffset={8}
    align="end"
  >
    <div
      class="flex items-center justify-between border-b border-white/10 p-4 pb-2"
    >
      <h3 class="text-lg font-bold text-white">Notifications</h3>
      <button
        onclick={handleClearAll}
        class="rounded border border-[#ef4444]/50 px-2 py-1 text-xs text-[#ef4444] transition-colors hover:bg-[#ef4444]/10"
        >Clear All</button
      >
    </div>
    <ul class="max-h-96 overflow-y-auto p-2">
      {#if notifications.length === 0}
        <li class="py-4 text-center font-mono text-xs text-white/50 italic">
          {customNotifications[
            Math.floor(Math.random() * customNotifications.length)
          ]}
        </li>
      {:else}
        {#each notifications as n (n.key)}
          <li
            class="mb-2 flex rounded border-l-4 bg-white/5 p-3 transition-colors hover:bg-white/10"
            class:opacity-50={isSnoozed(n)}
            class:border-white_10={isSnoozed(n)}
            class:border-[#ef4444]={!isSnoozed(n) &&
              n.data.urgency === "urgent"}
            class:border-[#facc15]={!isSnoozed(n) &&
              n.data.urgency === "non-urgent"}
            class:border-[#3b82f6]={!isSnoozed(n) && n.data.urgency === "none"}
          >
            <div class="mr-3 text-xs select-none">
              {n.data.urgency === "urgent"
                ? "🔴"
                : n.data.urgency === "non-urgent"
                  ? "🟠"
                  : "🔵"}
            </div>
            <div class="flex-1">
              <span class="text-xs font-bold tracking-tighter text-white">
                {n.data.message}
                {isSnoozed(n) ? "💤" : ""}
              </span>
              {#if n.data.details}
                <p class="mt-1 text-[10px] leading-tight text-white/70">
                  {n.data.details}
                </p>
              {/if}
              {#if n.data.type === "app_update"}
                <button
                  onclick={() => {
                    notificationManager.dismiss(n.key);
                    PWA.getInstance().applyUpdate();
                  }}
                  class="bg-primary hover:bg-primary/80 mt-2 w-full rounded py-1 text-xs font-bold text-black uppercase transition-colors"
                  >Upgrade Now</button
                >
              {:else if n.data.message
                .toLowerCase()
                .includes("consolation") || (n.data.details && n.data.details
                    .toLowerCase()
                    .includes("consolation"))}
                <a
                  href="/claims"
                  class="mt-2 block w-full rounded bg-[#facc15] py-1 text-center text-xs font-bold text-black uppercase transition-colors hover:bg-[#facc15]/80"
                  >Claim Reward 🏆</a
                >
              {/if}
              <span class="mt-1 block font-mono text-[9px] text-white/30"
                >{new Date(n.data.timestamp).toLocaleTimeString()}</span
              >
            </div>
            <div class="ml-2 flex flex-col gap-1">
              {#if !isSnoozed(n)}
                <button
                  onclick={() => notificationManager.snooze(n.key)}
                  class="flex h-6 w-6 items-center justify-center rounded pb-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                  title="Snooze 24h">💤</button
                >
              {/if}
              <button
                onclick={() => notificationManager.dismiss(n.key)}
                class="flex h-6 w-6 items-center justify-center rounded pb-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                title="Dismiss">✕</button
              >
            </div>
          </li>
        {/each}
      {/if}
    </ul>
  </DropdownMenu.Content>
</DropdownMenu.Root>

<style>
  @keyframes breathe-orange {
    0%,
    100% {
      filter: drop-shadow(0 0 2px rgba(255, 165, 0, 0.4));
      transform: scale(1);
    }
    50% {
      filter: drop-shadow(0 0 12px rgba(255, 165, 0, 0.8));
      transform: scale(1.05);
    }
  }
  @keyframes breathe-red {
    0%,
    100% {
      filter: drop-shadow(0 0 2px rgba(255, 0, 0, 0.4));
      transform: scale(1);
    }
    50% {
      filter: drop-shadow(0 0 15px rgba(255, 0, 0, 0.9));
      transform: scale(1.1);
    }
  }
  .glow-orange {
    color: #ffa500 !important;
    animation: breathe-orange 3s ease-in-out infinite;
  }
  .glow-red {
    color: #ff0000 !important;
    animation: breathe-red 2s ease-in-out infinite;
  }
</style>
