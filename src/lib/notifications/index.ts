import {setDoc, getDoc, type Doc} from "@junobuild/core";
import {
  subscribeToAuth,
  getAuthState,
  type AuthState,
  getSatelliteConfig,
} from "@/lib/auth";
import {log, showToast} from "@/lib/utils/log";
import type {UserProfile, NotificationItem} from "@/types/backend";
import {createDefaultProfile} from "@/lib/user/index";

const COMPONENT_NAME = "NotificationManager";
const MAX_NOTIFICATIONS = 50;

export interface NotificationData {
  type: string;
  message: string;
  details?: string;
  urgency: "none" | "non-urgent" | "urgent";
  timestamp: number;
  snoozeUntil?: number;
}

export type NotificationDoc = Doc<NotificationData>;

type NotificationListener = (notifications: NotificationDoc[]) => void;

class NotificationManager {
  private notifications: NotificationDoc[] = [];
  private listeners: Set<NotificationListener> = new Set();
  private initialized = false;
  private datastoreErrorShown = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    subscribeToAuth((state: AuthState) => {
      if (state.user) {
        this.init();
      } else {
        this.notifications = [];
        this.initialized = false;
        this.notify();
      }
    });
  }

  /**
   * Enqueue a Juno write operation. Writes are serialized so each getDoc
   * always reads the latest version, preventing version_outdated_or_future
   * race conditions.
   */
  private enqueueWrite(fn: () => Promise<void>): void {
    this.writeQueue = this.writeQueue.then(fn, fn);
  }

  private async getUserDoc(principalText: string): Promise<UserProfile | null> {
    try {
      const doc = await getDoc<UserProfile>({
        collection: "users",
        key: principalText,
        ...getSatelliteConfig(),
      });
      return doc?.data || null;
    } catch (e) {
      // Use log.info to avoid recursive loop: log.error -> showErrorToast -> addNotification -> persist -> fail -> log.error
      log.info(
        COMPONENT_NAME,
        "Failed to get user doc",
        e instanceof Error ? e.message : String(e)
      );
      return null;
    }
  }

  private notify() {
    this.listeners.forEach((l) => l([...this.notifications]));
  }

  subscribe(listener: NotificationListener) {
    this.listeners.add(listener);
    listener([...this.notifications]);
    return () => this.listeners.delete(listener);
  }

  async init() {
    if (this.initialized) return;
    try {
      const state = getAuthState();
      const user = state.user;
      if (!user) return;

      const principalText = user.key;
      const userDoc = await this.getUserDoc(principalText);
      this.notifications =
        userDoc?.notifications?.map((n) => ({
          key: n.key,
          data: n.data,
          version: 0n, // Not used for nested
        })) || [];
      this.initialized = true;
      this.notify();
    } catch (e) {
      // Use log.info to avoid recursive loop
      log.info(
        COMPONENT_NAME,
        "Failed to init notifications",
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  async addNotification(data: Omit<NotificationData, "timestamp">) {
    const state = getAuthState();
    const user = state.user;
    const timestamp = Date.now();

    // Build the in-memory notification (always — guest or logged-in)
    const existing = this.notifications.find((n) => n.data.type === data.type);
    const notificationKey = existing?.key || crypto.randomUUID();
    const doc: NotificationDoc = {
      key: notificationKey,
      data: {
        ...data,
        timestamp,
        snoozeUntil: existing?.data.snoozeUntil,
      } as NotificationData,
      version: 0n,
    };

    // Update in-memory list (dedup by type, cap at MAX_NOTIFICATIONS)
    this.notifications = existing
      ? this.notifications.map((n) => (n.key === notificationKey ? doc : n))
      : [doc, ...this.notifications].slice(0, MAX_NOTIFICATIONS);
    this.notify();

    // Show toast if not snoozed
    if (!doc.data.snoozeUntil || doc.data.snoozeUntil < Date.now()) {
      this.triggerToast(doc);
    }

    // Guest — in-memory only, no persistence
    if (!user) return;

    // Logged-in — enqueue persistence to Juno
    this.enqueueWrite(() =>
      this.persistNotification(user.key, doc, notificationKey, !!existing)
    );
  }

  // Juno: getDoc + setDoc on "users" collection →
  //   Rust assert: assert_user_profile() — validates EVM wallet format + signature
  //   Rust hook:   on_set_doc("users") → no-op
  private async persistNotification(
    principalText: string,
    doc: NotificationDoc,
    notificationKey: string,
    isUpdate: boolean
  ): Promise<void> {
    const config = getSatelliteConfig();
    try {
      const userDocFull = await getDoc<UserProfile>({
        collection: "users",
        key: principalText,
        ...config,
      });

      const notificationItem: NotificationItem = {
        key: doc.key,
        data: doc.data,
      };

      let newNotifications: NotificationItem[];
      let updatedUserDoc: UserProfile;
      if (!userDocFull) {
        const defaultProfile = createDefaultProfile(principalText);
        newNotifications = [notificationItem];
        updatedUserDoc = {
          ...defaultProfile,
          notifications: newNotifications,
        };
      } else {
        const existingNotifications = userDocFull.data.notifications || [];
        newNotifications = isUpdate
          ? existingNotifications.map((n) =>
              n.key === notificationKey ? notificationItem : n
            )
          : [notificationItem, ...existingNotifications].slice(
              0,
              MAX_NOTIFICATIONS
            );
        updatedUserDoc = {
          ...userDocFull.data,
          notifications: newNotifications,
        };
      }

      await setDoc<UserProfile>({
        collection: "users",
        doc: {
          key: principalText,
          data: updatedUserDoc,
          version: userDocFull?.version ?? 0n,
        },
        ...config,
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes("cannot_write")) {
        if (!this.datastoreErrorShown) {
          this.datastoreErrorShown = true;
          showToast(
            COMPONENT_NAME,
            "error",
            "Datastore write failed",
            "Unable to save notifications. Please check your connection or try again later."
          );
        }
      } else {
        // Use log.info to avoid recursive loop: log.error -> showErrorToast -> addNotification -> persist -> fail
        log.info(
          COMPONENT_NAME,
          "Failed to persist notification",
          e instanceof Error ? e.message : String(e)
        );
      }
    }
  }

  async dismiss(key: string) {
    // Always update in-memory
    this.notifications = this.notifications.filter((n) => n.key !== key);
    this.notify();

    // Guest — in-memory only
    const principalText = getAuthState().user?.key;
    if (!principalText) return;

    // Logged-in — enqueue persistence to Juno
    this.enqueueWrite(() => this.persistDismiss(principalText, key));
  }

  // Juno: setDoc on "users" → Rust assert_user_profile() then on_set_doc (no-op)
  private async persistDismiss(
    principalText: string,
    key: string
  ): Promise<void> {
    const config = getSatelliteConfig();
    try {
      const userDocFull = await getDoc<UserProfile>({
        collection: "users",
        key: principalText,
        ...config,
      });
      if (!userDocFull) return;

      const newNotifications = (userDocFull.data.notifications || []).filter(
        (n) => n.key !== key
      );

      await setDoc<UserProfile>({
        collection: "users",
        doc: {
          key: principalText,
          data: {...userDocFull.data, notifications: newNotifications},
          version: userDocFull.version,
        },
        ...config,
      });
    } catch (e) {
      // Use log.info to avoid recursive loop
      log.info(
        COMPONENT_NAME,
        "Failed to persist dismiss",
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  async snooze(key: string) {
    // Always update in-memory
    const snoozeUntil = Date.now() + 24 * 60 * 60 * 1000; // 24h
    this.notifications = this.notifications.map((n) =>
      n.key === key ? {...n, data: {...n.data, snoozeUntil}} : n
    );
    this.notify();

    // Guest — in-memory only
    const principalText = getAuthState().user?.key;
    if (!principalText) return;

    // Logged-in — enqueue persistence to Juno
    this.enqueueWrite(() =>
      this.persistSnooze(principalText, key, snoozeUntil)
    );
  }

  // Juno: setDoc on "users" → Rust assert_user_profile() then on_set_doc (no-op)
  private async persistSnooze(
    principalText: string,
    key: string,
    snoozeUntil: number
  ): Promise<void> {
    const config = getSatelliteConfig();
    try {
      const userDocFull = await getDoc<UserProfile>({
        collection: "users",
        key: principalText,
        ...config,
      });
      if (!userDocFull) return;

      const newNotifications = (userDocFull.data.notifications || []).map(
        (n) =>
          n.key === key
            ? {...n, data: {...(n.data as NotificationData), snoozeUntil}}
            : n
      );

      await setDoc<UserProfile>({
        collection: "users",
        doc: {
          key: principalText,
          data: {...userDocFull.data, notifications: newNotifications},
          version: userDocFull.version,
        },
        ...config,
      });
    } catch (e) {
      // Use log.info to avoid recursive loop
      log.info(
        COMPONENT_NAME,
        "Failed to persist snooze",
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  async clearAll() {
    const principalText = getAuthState().user?.key;

    // Guest mode: just clear local state and notify
    if (!principalText) {
      this.notifications = [];
      this.notify();
      return;
    }

    // Clear in-memory immediately
    this.notifications = [];
    this.notify();

    // Logged-in — enqueue persistence to Juno
    this.enqueueWrite(() => this.persistClearAll(principalText));
  }

  // Juno: setDoc on "users" → Rust assert_user_profile() then on_set_doc (no-op)
  private async persistClearAll(principalText: string): Promise<void> {
    const config = getSatelliteConfig();
    try {
      const userDocFull = await getDoc<UserProfile>({
        collection: "users",
        key: principalText,
        ...config,
      });
      if (!userDocFull) return;

      await setDoc<UserProfile>({
        collection: "users",
        doc: {
          key: principalText,
          data: {...userDocFull.data, notifications: []},
          version: userDocFull.version,
        },
        ...config,
      });
    } catch (e) {
      // Use log.info to avoid recursive loop
      log.info(
        COMPONENT_NAME,
        "Failed to clear notifications",
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  public triggerToast(doc: NotificationDoc) {
    window.dispatchEvent(new CustomEvent("notification-toast", {detail: doc}));
  }

  getNotifications(includeSnoozed = true) {
    if (includeSnoozed) return [...this.notifications];
    return this.notifications.filter(
      (n) => !n.data.snoozeUntil || n.data.snoozeUntil < Date.now()
    );
  }

  getHighestUrgency(): "none" | "non-urgent" | "urgent" {
    const active = this.getNotifications(false);
    if (active.some((n) => n.data.urgency === "urgent")) return "urgent";
    if (active.some((n) => n.data.urgency === "non-urgent"))
      return "non-urgent";
    return "none";
  }
}

export const notificationManager = new NotificationManager();
