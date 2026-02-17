// PWA Utilities: Service Worker Registration and Version Update Handling

import {log, JUNO_ENVIRONMENT} from "../utils/log";
import {trackPwaInstall} from "../metrics/analytics";

const COMPONENT_NAME = "PWA";

// Frozen at Vite startup (dev) or build time (prod).
// Used to detect when a newer deploy is serving different code.
const BUILD_ID = import.meta.env.BUILD_ID || "unknown";

// Delay before notifying the user of an update — allows time for
// asset uploads to complete so the new version is fully available.
const UPDATE_NOTIFY_DELAY_MS = 3 * 60_000; // 3 minutes

class PWA {
  private static instance: PWA;
  private registration: ServiceWorkerRegistration | null = null;
  private updatePending: boolean = false; // true while waiting to notify
  private updateCheckInterval: ReturnType<typeof setInterval> | null = null;
  private updateNotifyTimeout: ReturnType<typeof setTimeout> | null = null;
  private awaitingControllerChange: boolean = false;
  private handleUpdateFound: (() => void) | null = null;
  private handleControllerChange: (() => void) | null = null;

  private constructor() {}

  static getInstance(): PWA {
    if (!PWA.instance) {
      PWA.instance = new PWA();
    }
    return PWA.instance;
  }

  async register(): Promise<void> {
    if ("serviceWorker" in navigator) {
      try {
        this.registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        log.info(COMPONENT_NAME, "SW registered: /sw.js (scope: /)");

        // Listen for updatefound (standard PWA update detection)
        this.handleUpdateFound = () => {
          log.info(COMPONENT_NAME, "Update found: New SW detected");
          const newWorker = this.registration!.installing;
          if (newWorker) {
            log.info(
              COMPONENT_NAME,
              "New worker found, state:",
              newWorker.state
            );
            const handleStateChange = () => {
              log.info(
                COMPONENT_NAME,
                "New worker state changed to:",
                newWorker.state
              );
              if (newWorker.state === "installed") {
                if (navigator.serviceWorker.controller) {
                  log.info(
                    COMPONENT_NAME,
                    "New SW installed while controller exists — update available"
                  );
                  this.scheduleUpdateNotification();
                } else {
                  log.info(
                    COMPONENT_NAME,
                    "No controller, first install - auto-activating"
                  );
                  // First install: auto-activate
                  newWorker.postMessage({action: "skipWaiting"});
                }
              }
              // Remove statechange listener once worker reaches terminal state
              if (
                newWorker.state === "activated" ||
                newWorker.state === "redundant"
              ) {
                newWorker.removeEventListener("statechange", handleStateChange);
              }
            };
            newWorker.addEventListener("statechange", handleStateChange);
          } else {
            log.warn(COMPONENT_NAME, "No installing worker found");
          }
        };
        this.registration.addEventListener(
          "updatefound",
          this.handleUpdateFound
        );
      } catch (error) {
        log.error(COMPONENT_NAME, "SW registration failed:", error);
      }

      // When a new service worker takes control (after skipWaiting),
      // reload the page cleanly. Without this, skipWaiting fires but
      // the old SW might still serve stale assets during navigation.
      this.handleControllerChange = () => {
        if (this.awaitingControllerChange) {
          log.info(COMPONENT_NAME, "New SW controller active — reloading page");
          this.awaitingControllerChange = false;
          window.location.href = "/";
        }
      };
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        this.handleControllerChange
      );
    } else {
      log.warn(COMPONENT_NAME, "SW not supported");
    }

    // Track PWA install prompt
    window.addEventListener("appinstalled", () => {
      log.info(COMPONENT_NAME, "PWA installed");
      trackPwaInstall();
    });

    // Start periodic checks — version poll works even without SW support
    this.startPeriodicUpdateCheck();
  }

  /**
   * Schedule an update notification after a delay.
   * The delay allows time for asset uploads to finish so the new version
   * is fully available when the user clicks "Update Now".
   * While waiting, further update checks are suppressed.
   */
  private scheduleUpdateNotification() {
    if (this.updatePending) {
      log.debug(
        COMPONENT_NAME,
        "Update notification already scheduled, skipping"
      );
      return;
    }
    this.updatePending = true;
    log.info(
      COMPONENT_NAME,
      `Update detected — waiting ${UPDATE_NOTIFY_DELAY_MS / 1000}s for assets to upload before notifying user`
    );
    this.updateNotifyTimeout = setTimeout(() => {
      this.updateNotifyTimeout = null;
      this.notifyUpdateAvailable();
      // Keep updatePending true — cleared only after user acts or dismisses
    }, UPDATE_NOTIFY_DELAY_MS);
  }

  /**
   * Show the update-available notification if one isn't already pending.
   * Checks the notification manager for an existing app_update entry
   * so that dismissing/clearing it allows a fresh notification on the
   * next poll cycle.
   */
  private notifyUpdateAvailable() {
    const notification = {
      type: "app_update",
      message: "Update available",
      urgency: "non-urgent" as const,
      details: "A new version is ready. Click to upgrade.",
    };

    import("../notifications")
      .then(({notificationManager}) => {
        const existing = notificationManager
          .getNotifications()
          .some((n) => n.data.type === "app_update");
        if (existing) {
          log.debug(
            COMPONENT_NAME,
            "app_update notification already pending, skipping"
          );
          return;
        }
        log.info(COMPONENT_NAME, "Dispatching update notification via manager");
        notificationManager.addNotification(notification);
      })
      .catch((err) => {
        log.warn(
          COMPONENT_NAME,
          "NotificationManager import failed, dispatching toast directly:",
          err
        );
        window.dispatchEvent(
          new CustomEvent("notification-toast", {
            detail: {
              key: "pwa-update-fallback",
              data: {...notification, timestamp: Date.now()},
            },
          })
        );
      });
  }

  /**
   * Periodic checks for updates. Two mechanisms run in parallel:
   *
   * 1. SW byte-comparison: re-fetches /sw.js and lets the browser detect
   *    changes (fires updatefound if different).
   *
   * 2. Version polling: fetches /api/version.json and compares the
   *    build_id against this client's BUILD_ID. This catches ALL deploys
   *    regardless of whether the SW source changed.
   *
   * Development: every 60s (fast feedback during juno-dev loop)
   * Other:       every 1hr
   */
  private startPeriodicUpdateCheck() {
    // Clear any existing interval before starting a new one
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
    }

    const isDev = JUNO_ENVIRONMENT === "development";
    const INTERVAL_MS = isDev ? 60_000 : 60 * 60_000;
    log.info(
      COMPONENT_NAME,
      `Update check interval: ${isDev ? "60s (dev)" : "1hr"}, build_id: ${BUILD_ID}`
    );

    this.updateCheckInterval = setInterval(() => {
      // Skip all checks while an update is already pending/scheduled
      if (this.updatePending) {
        log.debug(COMPONENT_NAME, "Update pending, skipping periodic check");
        return;
      }

      // SW byte-comparison check
      if (this.registration) {
        log.debug(COMPONENT_NAME, "Periodic SW update check...");
        this.registration.update().catch((err) => {
          log.warn(COMPONENT_NAME, "SW update check failed:", err);
        });
      }

      // Version-poll check (primary detection — works in dev + prod)
      this.checkVersionEndpoint();
    }, INTERVAL_MS);
  }

  /**
   * Fetch /api/version.json and compare build_id to detect new deploys.
   * Skipped entirely while an update notification is already pending/scheduled.
   */
  private async checkVersionEndpoint() {
    if (this.updatePending) {
      log.debug(
        COMPONENT_NAME,
        "Update already pending, skipping version check"
      );
      return;
    }
    try {
      const response = await fetch("/api/version.json", {cache: "no-store"});
      if (!response.ok) {
        log.debug(COMPONENT_NAME, "Version endpoint returned", response.status);
        return;
      }
      const data = await response.json();
      const serverBuildId = data.build_id;
      log.debug(
        COMPONENT_NAME,
        `Version check: client=${BUILD_ID} server=${serverBuildId}`
      );
      if (serverBuildId && serverBuildId !== BUILD_ID) {
        log.info(
          COMPONENT_NAME,
          `Build mismatch detected: client=${BUILD_ID} server=${serverBuildId}`
        );
        this.scheduleUpdateNotification();
      }
    } catch (err) {
      log.debug(COMPONENT_NAME, "Version poll failed (offline?):", err);
    }
  }

  dismissUpdateNotification() {
    this.updatePending = false;
    log.info(
      COMPONENT_NAME,
      "Update notification dismissed — future checks re-enabled"
    );
  }

  destroy() {
    if (this.updateNotifyTimeout) {
      clearTimeout(this.updateNotifyTimeout);
      this.updateNotifyTimeout = null;
    }
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
    }
    if (this.registration && this.handleUpdateFound) {
      this.registration.removeEventListener(
        "updatefound",
        this.handleUpdateFound
      );
      this.handleUpdateFound = null;
    }
    if (this.handleControllerChange) {
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        this.handleControllerChange
      );
      this.handleControllerChange = null;
    }
  }

  async showUpdatePrompt(): Promise<void> {
    // Fetch actual version from API
    let version = "latest";
    try {
      const response = await fetch("/api/version.json");
      if (response.ok) {
        const data = await response.json();
        log.info(COMPONENT_NAME, "Version fetched:", data.version);
        version = data.version;
      }
    } catch (err) {
      log.warn(COMPONENT_NAME, "Failed to fetch version:", err);
    }

    // Dispatch custom event to trigger UpdatePrompt modal
    window.dispatchEvent(
      new CustomEvent("pwa-update-ready", {
        detail: {version},
      })
    );
  }

  async applyUpdate(): Promise<void> {
    if (window.location.pathname.includes("/game")) {
      log.info(COMPONENT_NAME, "Blocking update application during game");
      alert("Please finish your game before updating!");
      return;
    }

    this.updatePending = false;
    log.info(
      COMPONENT_NAME,
      "Applying update — clearing update notifications..."
    );

    // Dismiss all app_update notifications and wait for Juno persistence
    // before signing out.  Without this the notification reappears after reload.
    try {
      const {notificationManager} = await import("../notifications");
      const {flushProfileWrites} = await import("../user/writeQueue");
      const updateNotifs = notificationManager
        .getNotifications()
        .filter((n) => n.data.type === "app_update");
      for (const n of updateNotifs) {
        notificationManager.dismiss(n.key);
      }
      // Wait for the enqueued write(s) to flush to Juno
      await flushProfileWrites();
    } catch (err) {
      log.warn(COMPONENT_NAME, "Failed to clear update notifications", err);
    }

    log.info(COMPONENT_NAME, "Clearing auth session...");

    // Clear auth session storage to force clean re-authentication
    // after the upgrade. Stale Juno delegation identities in IndexedDB
    // can cause initSatellite() to hang after a SW swap.
    sessionStorage.removeItem("tresr_auth_mode");
    sessionStorage.removeItem("tresr_is_guest");

    // Sign out from Juno to clear IndexedDB delegation identity.
    // Use windowReload: false since we handle navigation ourselves.
    try {
      const {signOut} = await import("@junobuild/core");
      await signOut({windowReload: false});
    } catch (err) {
      log.warn(COMPONENT_NAME, "Juno sign-out during upgrade failed:", err);
    }

    if (this.registration?.waiting) {
      log.info(COMPONENT_NAME, "Sending skipWaiting to waiting worker");
      this.awaitingControllerChange = true;
      this.registration.waiting.postMessage({action: "skipWaiting"});

      // Safety timeout: if controllerchange never fires within 5s,
      // force a reload so the user isn't stuck.
      setTimeout(() => {
        if (this.awaitingControllerChange) {
          log.warn(
            COMPONENT_NAME,
            "controllerchange did not fire within 5s — forcing reload"
          );
          this.awaitingControllerChange = false;
          window.location.href = "/";
        }
      }, 5_000);
    } else {
      // No waiting worker — just navigate
      window.location.href = "/";
    }
  }

  // Manual check for testing (console: PWA.getInstance().checkForUpdates())
  async checkForUpdates(): Promise<void> {
    log.info(COMPONENT_NAME, "Manually checking for updates...");
    if (this.registration) {
      try {
        await this.registration.update();
        log.info(COMPONENT_NAME, "SW update check completed");
      } catch (err) {
        log.error(COMPONENT_NAME, "SW update check failed:", err);
      }
    }
    await this.checkVersionEndpoint();
  }
}

export default PWA;
export {PWA};
