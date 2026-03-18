<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { notificationManager } from "@/lib/notifications";
  import PWA from "@/lib/pwa";

  interface NotificationDoc {
    key: string;
    data: {
      message: string;
      urgency: string;
      type?: string;
      details?: string;
      errorId?: string;
    };
  }

  let container: HTMLElement;
  const activeTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  function getUrgencyClass(urgency: string) {
    switch (urgency) {
      case "urgent":
        return "alert-error text-error-content";
      case "non-urgent":
        return "alert-warning text-warning-content";
      default:
        return "alert-info text-info-content";
    }
  }

  function removeToast(el: HTMLElement) {
    activeTimers.delete(el);
    el.classList.add("animate-out", "fade-out", "slide-out-to-right");
    setTimeout(() => {
      el.remove();
      if (container && container.children.length === 0) {
        container.hidePopover?.();
      }
    }, 300);
  }

  function handleNotificationToast(e: Event) {
    if (!container) return;
    const doc: NotificationDoc = (e as CustomEvent).detail;
    const { message, urgency, type, details, errorId } = doc.data;

    const toast = document.createElement("div");
    toast.className = `alert ${getUrgencyClass(urgency)} shadow-lg animate-in slide-in-from-right duration-300 pointer-events-auto flex flex-col items-start gap-2 min-w-[300px] max-w-[90vw] sm:max-w-sm`;

    const isUpdate = type === "app_update";

    const headerRow = document.createElement("div");
    headerRow.className = "flex w-full justify-between items-center gap-2";

    const headerLeft = document.createElement("div");
    headerLeft.className = "flex items-center gap-2 flex-1";
    const iconSpan = document.createElement("span");
    iconSpan.textContent = urgency === "urgent" ? "\u{1F6A8}" : "\u{1F514}";
    const msgSpan = document.createElement("span");
    msgSpan.className = "font-bold break-words min-w-0";
    msgSpan.textContent = message;
    headerLeft.append(iconSpan, msgSpan);

    const dismissBtn = document.createElement("button");
    dismissBtn.className = "btn btn-ghost btn-xs shrink-0";
    dismissBtn.textContent = "\u2715";
    headerRow.append(headerLeft, dismissBtn);
    toast.appendChild(headerRow);

    if (details) {
      const detailsP = document.createElement("p");
      detailsP.className = "text-xs opacity-90";
      detailsP.textContent = details;
      toast.appendChild(detailsP);
    }

    if (errorId) {
      const errorRow = document.createElement("div");
      errorRow.className = "flex items-center gap-2 mt-1 w-full";

      const codeSpan = document.createElement("code");
      codeSpan.className = "text-xs font-mono bg-black/30 px-1.5 py-0.5 rounded select-all";
      codeSpan.textContent = errorId;

      const copyBtn = document.createElement("button");
      copyBtn.className = "btn btn-ghost btn-xs opacity-70 hover:opacity-100";
      copyBtn.title = "Copy error code";
      copyBtn.textContent = "⎘";
      copyBtn.addEventListener("click", () => {
        navigator.clipboard?.writeText(errorId).catch(() => {});
        copyBtn.textContent = "✓";
        setTimeout(() => (copyBtn.textContent = "⎘"), 1500);
      });

      const label = document.createElement("span");
      label.className = "text-xs opacity-75";
      label.textContent = "Error code:";

      errorRow.append(label, codeSpan, copyBtn);
      toast.appendChild(errorRow);
    }

    const actionsRow = document.createElement("div");
    actionsRow.className = "flex gap-2 mt-1 w-full justify-end";

    let snoozeBtn: HTMLButtonElement | null = null;
    let upgradeBtn: HTMLButtonElement | null = null;

    if (isUpdate) {
      upgradeBtn = document.createElement("button");
      upgradeBtn.className = "btn btn-xs btn-primary";
      upgradeBtn.textContent = "Upgrade";

      const laterBtn = document.createElement("button");
      laterBtn.className = "btn btn-xs btn-ghost";
      laterBtn.textContent = "Later";

      actionsRow.append(upgradeBtn, laterBtn);

      laterBtn.addEventListener("click", () => {
        clearTimeout(timeout);
        activeTimers.delete(toast);
        notificationManager.dismiss(doc.key);
        removeToast(toast);
      });
    } else {
      snoozeBtn = document.createElement("button");
      snoozeBtn.className = "btn btn-xs btn-ghost";
      snoozeBtn.textContent = "Snooze";
      actionsRow.appendChild(snoozeBtn);
    }
    toast.appendChild(actionsRow);

    const isConsolation = message.toLowerCase().includes("consolation") || (details && details.toLowerCase().includes("consolation"));

    if (isUpdate) {
      toast.style.cursor = "pointer";
      toast.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).tagName === "BUTTON") return;
        PWA.getInstance().showUpdatePrompt();
      });
    } else if (isConsolation) {
      toast.style.cursor = "pointer";
      toast.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).tagName === "BUTTON") return;
        window.location.href = "/claims";
      });
    }

    container.hidePopover?.();
    container.appendChild(toast);
    container.showPopover();

    const timeout = setTimeout(() => removeToast(toast), 5000);
    activeTimers.set(toast, timeout);

    dismissBtn.addEventListener("click", () => {
      clearTimeout(timeout);
      activeTimers.delete(toast);
      notificationManager.dismiss(doc.key);
      removeToast(toast);
    });

    snoozeBtn?.addEventListener("click", () => {
      clearTimeout(timeout);
      activeTimers.delete(toast);
      notificationManager.snooze(doc.key);
      removeToast(toast);
    });

    upgradeBtn?.addEventListener("click", () => {
      clearTimeout(timeout);
      activeTimers.delete(toast);
      notificationManager.dismiss(doc.key);
      removeToast(toast);
      PWA.getInstance().applyUpdate();
    });
  }

  onMount(() => {
    window.addEventListener("notification-toast", handleNotificationToast);

    // Attach global helpers only on mount in client
    window.showInfoToast = (message: string, details?: string) => {
      notificationManager.addNotification({ message, urgency: "none", type: "info", details });
    };

    window.showWarningToast = (message: string, details?: string) => {
      notificationManager.addNotification({ message, urgency: "non-urgent", type: "warning", details });
    };

    window.showErrorToast = (message: string, details?: string, errorId?: string) => {
      notificationManager.addNotification({
        message, urgency: "urgent", type: "error", details, errorId
      } as any);
    };
  });

  onDestroy(() => {
    window.removeEventListener("notification-toast", handleNotificationToast);
    for (const timer of activeTimers.values()) {
      clearTimeout(timer);
    }
    activeTimers.clear();
  });
</script>

<div
  bind:this={container}
  class="toast toast-bottom toast-end pointer-events-none fixed inset-0 z-[99999] m-0 bg-transparent p-4"
  popover="manual"
></div>
