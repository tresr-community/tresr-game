declare global {
  interface Window {
    showInfoToast: (message: string, details?: string) => void;
    showWarningToast: (message: string, details?: string) => void;
    showErrorToast: (message: string, details?: string) => void;
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
          window.showWarningToast(`${component}: ${message}`, details || "");
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
      if (typeof window !== "undefined" && window.showErrorToast) {
        try {
          window.showErrorToast(`${component}: ${message}`, details || "");
        } catch (e) {
          console.error(`[${component}] [ERROR] Failed to show error toast`, e);
        }
      }
      break;
  }
}

/**
 * Robust centralized logging utility.
 * Uses showToast for unified behavior.
 */
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
    showToast(component, "error", message, details || undefined);
  },
};
