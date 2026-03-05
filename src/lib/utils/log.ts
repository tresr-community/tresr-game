declare global {
  interface Window {
    showInfoToast: (message: string, details?: string) => void;
    showWarningToast: (message: string, details?: string) => void;
    // errorId is the short code shown to users so they can quote it to devs.
    showErrorToast: (
      message: string,
      details?: string,
      errorId?: string
    ) => void;
  }
}

export const JUNO_ENVIRONMENT =
  typeof import.meta.env !== "undefined" && import.meta.env.MODE
    ? import.meta.env.MODE
    : process.env.NODE_ENV || "development";

// Browser console color styles per log level
const LOG_STYLES = {
  debug: "color: #3b82f6; font-weight: bold;", // blue
  info: "color: #22c55e; font-weight: bold;", // green
  warn: "color: #f97316; font-weight: bold;", // orange
  error: "color: #ef4444; font-weight: bold;", // red
} as const;

// Whether we're in a browser context that supports %c formatting
const isBrowser =
  typeof window !== "undefined" && typeof window.document !== "undefined";

/**
 * Unified function for toasts and logging.
 * Logs based on level, shows toast for warnings and errors.
 * Uses %c CSS formatting in browser consoles for colored output.
 */
export function showToast(
  component: string,
  level: "debug" | "info" | "warn" | "error",
  message: string,
  details?: string
) {
  const tag = `[${component}] [${level.toUpperCase()}]`;
  const style = LOG_STYLES[level];

  switch (level) {
    case "debug":
      if (JUNO_ENVIRONMENT === "development") {
        if (isBrowser) {
          console.debug(`%c${tag}`, style, message, details || "");
        } else {
          console.debug(`${tag} ${message}`, details || "");
        }
      }
      break;
    case "info":
      if (isBrowser) {
        console.info(`%c${tag}`, style, message, details || "");
      } else {
        console.info(`${tag} ${message}`, details || "");
      }
      break;
    case "warn":
      if (isBrowser) {
        console.warn(`%c${tag}`, style, message, details || "");
      } else {
        console.warn(`${tag} ${message}`, details || "");
      }
      if (typeof window !== "undefined" && window.showWarningToast) {
        try {
          // Never pass raw technical details to the notification bell.
          // Warning labels are enough for users; details stay in the console.
          window.showWarningToast(`${component}: ${message}`);
        } catch (e) {
          console.error(
            `[${component}] [ERROR] Failed to show warning toast`,
            e
          );
        }
      }
      break;
    case "error":
      if (isBrowser) {
        console.error(`%c${tag}`, style, message, details || "");
      } else {
        console.error(`${tag} ${message}`, details || "");
      }
      // Error toast is shown asynchronously after we have the error_id from the canister.
      // If reportError fails or is unavailable, we fall back to showing the toast without an id.
      break;
  }
}

/**
 * Robust centralized logging utility.
 * Uses showToast for unified behavior.
 */
// Reentrancy guard: prevents infinite loops when trackError() itself
// encounters an error and calls log.error() internally.
let _trackingError = false;

export const log = {
  debug: (component: string, message: string, ...args: unknown[]) => {
    showToast(component, "debug", message, args.join(" "));
  },
  info: (component: string, message: string, ...args: unknown[]) => {
    showToast(component, "info", message, args.join(" "));
  },
  warn: (component: string, message: string, ...args: unknown[]) => {
    showToast(component, "warn", message, args.join(" "));
  },
  error: (
    component: string,
    message: string,
    error?: unknown,
    ...args: unknown[]
  ) => {
    const errorStr =
      error instanceof Error
        ? error.message
        : error != null
          ? String(error)
          : "Unknown error";
    const details = `${errorStr} ${args.join(" ")}`.trim();

    // Log to console immediately
    const tag = `[${component}] [ERROR]`;
    const style = LOG_STYLES["error"];
    if (isBrowser) {
      console.error(`%c${tag}`, style, message, details || "");
    } else {
      console.error(`${tag} ${message}`, details || "");
    }

    // Fire-and-forget: report to canister, then show toast with error_id.
    // Falls back to showing toast without error_id if canister call fails.
    if (isBrowser) {
      import("@/lib/utils/error-reporter")
        .then(({reportError}) => reportError(component, message, details || ""))
        .catch(() => null)
        .then((errorId) => {
          if (typeof window !== "undefined" && window.showErrorToast) {
            try {
              window.showErrorToast(
                `${component}: ${message}`,
                // Never expose raw technical details in the notification bell —
                // users quote the errorId to devs; devs read the console/canister.
                errorId ? undefined : "Contact support for assistance.",
                errorId ?? undefined
              );
            } catch (toastErr) {
              console.error(
                `[${component}] [ERROR] Failed to show error toast`,
                toastErr
              );
            }
          }
        });
    }

    // Fire-and-forget analytics tracking for every log.error() call.
    // Uses dynamic import to break circular dependency (analytics → log → analytics).
    if (!_trackingError && isBrowser) {
      _trackingError = true;
      import("@/lib/metrics/analytics")
        .then(({trackError}) =>
          trackError(component, `${message} ${details}`.trim())
        )
        .catch(() => {
          // Best-effort — analytics may not be initialized yet
        })
        .finally(() => {
          _trackingError = false;
        });
    }
  },
};
