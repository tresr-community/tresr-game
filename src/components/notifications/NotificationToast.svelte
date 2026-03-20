<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import {notificationManager} from "@/lib/notifications";
  import PWA from "@/lib/pwa";
  import Alert from "@/components/ui/Alert.svelte";
  import Button from "@/components/ui/Button.svelte";

  interface Toast {
    id: string;
    key: string;
    message: string;
    urgency: "info" | "success" | "warning" | "error";
    type?: string;
    details?: string;
    errorId?: string;
  }

  let toasts = $state<Toast[]>([]);
  let timers = new Map<string, ReturnType<typeof setTimeout>>();

  function mapUrgency(u: string): "info" | "success" | "warning" | "error" {
    if (u === "urgent") return "error";
    if (u === "non-urgent") return "warning";
    return "info";
  }

  function removeToast(id: string) {
    toasts = toasts.filter((t) => t.id !== id);
    const t = timers.get(id);
    if (t) {
      clearTimeout(t);
      timers.delete(id);
    }
  }

  function handleNotificationToast(e: Event) {
    const doc = (e as CustomEvent).detail;
    const {message, urgency, type, details, errorId} = doc.data;

    const toast: Toast = {
      id: crypto.randomUUID(),
      key: doc.key,
      message,
      urgency: mapUrgency(urgency),
      type,
      details,
      errorId,
    };

    toasts = [...toasts, toast];
    const timeout = setTimeout(() => removeToast(toast.id), 5000);
    timers.set(toast.id, timeout);
  }

  function handleDismiss(toast: Toast) {
    notificationManager.dismiss(toast.key);
    removeToast(toast.id);
  }

  function handleSnooze(toast: Toast) {
    notificationManager.snooze(toast.key);
    removeToast(toast.id);
  }

  function handleUpgrade(toast: Toast) {
    notificationManager.dismiss(toast.key);
    removeToast(toast.id);
    PWA.getInstance().applyUpdate();
  }

  function handleToastClick(e: MouseEvent, toast: Toast) {
    if ((e.target as HTMLElement).tagName === "BUTTON") return;

    if (toast.type === "app_update") {
      PWA.getInstance().showUpdatePrompt();
    } else if (
      toast.message.toLowerCase().includes("consolation") ||
      (toast.details && toast.details.toLowerCase().includes("consolation"))
    ) {
      window.location.href = "/claims";
    }
  }

  function copyError(errorId: string, btn: HTMLButtonElement) {
    navigator.clipboard?.writeText(errorId).catch(() => {});
    const orig = btn.textContent;
    btn.textContent = "✓";
    setTimeout(() => {
      if (btn) btn.textContent = orig;
    }, 1500);
  }

  onMount(() => {
    window.addEventListener("notification-toast", handleNotificationToast);

    // Attach global helpers only on mount in client
    window.showInfoToast = (message: string, details?: string) => {
      notificationManager.addNotification({
        message,
        urgency: "none",
        type: "info",
        details,
      });
    };

    window.showWarningToast = (message: string, details?: string) => {
      notificationManager.addNotification({
        message,
        urgency: "non-urgent",
        type: "warning",
        details,
      });
    };

    window.showErrorToast = (
      message: string,
      details?: string,
      errorId?: string
    ) => {
      notificationManager.addNotification({
        message,
        urgency: "urgent",
        type: "error",
        details,
        errorId,
      } as any);
    };
  });

  onDestroy(() => {
    window.removeEventListener("notification-toast", handleNotificationToast);
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
  });
</script>

<div
  class="pointer-events-none fixed right-4 bottom-4 z-[99999] m-0 flex flex-col items-end gap-2 p-0"
>
  {#each toasts as toast (toast.id)}
    <div
      class="animate-in slide-in-from-right pointer-events-auto w-[90vw] transition-all duration-300 sm:w-[350px]"
      role="button"
      tabindex="0"
      onclick={(e) => handleToastClick(e, toast)}
      onkeydown={(e) => e.key === "Enter" && handleToastClick(e as any, toast)}
      style={toast.type === "app_update" ||
      toast.message.toLowerCase().includes("consolation")
        ? "cursor: pointer;"
        : ""}
    >
      <Alert variant={toast.urgency}>
        <div class="flex w-full items-start justify-between gap-2">
          <span class="min-w-0 flex-1 font-bold break-words"
            >{toast.message}</span
          >
          <Button
            variant="ghost"
            size="xs"
            class="-mt-1 -mr-2 h-6 px-1 py-0 opacity-50 hover:opacity-100"
            onclick={() => handleDismiss(toast)}
          >
            ✕
          </Button>
        </div>

        {#if toast.details}
          <p class="mt-1 text-xs opacity-90">{toast.details}</p>
        {/if}

        {#if toast.errorId}
          <div class="mt-2 flex w-full items-center gap-2">
            <span class="text-xs opacity-75">Error:</span>
            <code
              class="flex-1 truncate rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px] select-all sm:text-xs"
              >{toast.errorId}</code
            >
            <Button
              variant="ghost"
              size="xs"
              class="h-6 min-h-0 flex-shrink-0 px-2 opacity-70 hover:opacity-100"
              title="Copy error code"
              onclick={(e) => copyError(toast.errorId!, e.currentTarget)}
            >
              ⎘
            </Button>
          </div>
        {/if}

        <div class="mt-2 flex w-full justify-end gap-2">
          {#if toast.type === "app_update"}
            <Button
              variant="primary"
              size="xs"
              onclick={() => handleUpgrade(toast)}>Upgrade</Button
            >
            <Button
              variant="ghost"
              size="xs"
              onclick={() => handleDismiss(toast)}>Later</Button
            >
          {:else}
            <Button
              variant="ghost"
              size="xs"
              onclick={() => handleSnooze(toast)}>Snooze</Button
            >
          {/if}
        </div>
      </Alert>
    </div>
  {/each}
</div>
