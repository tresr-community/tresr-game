<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { notificationManager, type NotificationDoc } from "@/lib/notifications";
  import PWA from "@/lib/pwa";
  import { log } from "@/lib/utils/log";
  import { loadConfigAsync } from "@/lib/config";

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

<details class="dropdown dropdown-end" id="notification-dropdown">
  <summary class="btn btn-ghost btn-circle" aria-label="Notifications">
    <div class="indicator">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="text-warning h-6 w-6 transition-colors"
        class:glow-orange={urgency === 'non-urgent'}
        class:glow-red={urgency === 'urgent'}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {#if unreadCount > 0}
        <span class="badge badge-sm badge-primary indicator-item">{unreadCount}</span>
      {/if}
    </div>
  </summary>
  <div class="card card-compact dropdown-content bg-base-100 border-primary/20 z-[1] mt-3 w-80 border shadow-xl">
    <div class="card-body p-0">
      <div class="border-base-300 flex items-center justify-between border-b p-4 pb-2">
        <h3 class="text-lg font-bold">Notifications</h3>
        <button on:click={handleClearAll} class="btn btn-xs btn-outline btn-error">Clear All</button>
      </div>
      <ul class="list max-h-96 overflow-y-auto">
        {#if notifications.length === 0}
          <li class="text-base-content/50 py-4 text-center italic font-mono text-xs">
            {customNotifications[Math.floor(Math.random() * customNotifications.length)]}
          </li>
        {:else}
          {#each notifications as n (n.key)}
            <li class="list-row border-l-4" class:opacity-50={isSnoozed(n)} class:border-base-300={isSnoozed(n)} class:border-error={!isSnoozed(n) && n.data.urgency === 'urgent'} class:border-warning={!isSnoozed(n) && n.data.urgency === 'non-urgent'} class:border-info={!isSnoozed(n) && n.data.urgency === 'none'}>
              <div class="text-xs select-none">
                {n.data.urgency === "urgent" ? "🔴" : n.data.urgency === "non-urgent" ? "🟠" : "🔵"}
              </div>
              <div>
                <span class="font-bold text-xs tracking-tighter">
                  {n.data.message} {isSnoozed(n) ? "💤" : ""}
                </span>
                {#if n.data.details}
                  <p class="text-[10px] opacity-70 leading-tight">{n.data.details}</p>
                {/if}
                {#if n.data.type === 'app_update'}
                  <button on:click={() => { notificationManager.dismiss(n.key); PWA.getInstance().applyUpdate(); }} class="btn btn-xs btn-primary mt-2 w-full">Upgrade Now</button>
                {:else if n.data.message.toLowerCase().includes('consolation') || (n.data.details && n.data.details.toLowerCase().includes('consolation'))}
                  <a href="/claims" class="btn btn-xs btn-warning mt-2 w-full">Claim Reward 🏆</a>
                {/if}
                <span class="text-[9px] opacity-30 font-mono block mt-1">{new Date(n.data.timestamp).toLocaleTimeString()}</span>
              </div>
              <div class="flex gap-1">
                {#if !isSnoozed(n)}
                  <button on:click={() => notificationManager.snooze(n.key)} class="btn btn-xs btn-ghost p-0 px-1" title="Snooze 24h">💤</button>
                {/if}
                <button on:click={() => notificationManager.dismiss(n.key)} class="btn btn-xs btn-ghost p-0 px-1">✕</button>
              </div>
            </li>
          {/each}
        {/if}
      </ul>
    </div>
  </div>
</details>

<style>
  @keyframes breathe-orange {
    0%, 100% { filter: drop-shadow(0 0 2px rgba(255, 165, 0, 0.4)); transform: scale(1); }
    50% { filter: drop-shadow(0 0 12px rgba(255, 165, 0, 0.8)); transform: scale(1.05); }
  }
  @keyframes breathe-red {
    0%, 100% { filter: drop-shadow(0 0 2px rgba(255, 0, 0, 0.4)); transform: scale(1); }
    50% { filter: drop-shadow(0 0 15px rgba(255, 0, 0, 0.9)); transform: scale(1.1); }
  }
  .glow-orange { color: #ffa500 !important; animation: breathe-orange 3s ease-in-out infinite; }
  .glow-red { color: #ff0000 !important; animation: breathe-red 2s ease-in-out infinite; }
</style>
