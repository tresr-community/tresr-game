import {describe, expect, test, beforeEach, mock} from "bun:test";

// Bun's test runner does not provide DOM globals. Polyfill sessionStorage
// and window.(location|history) before importing url-params.
if (typeof globalThis.sessionStorage === "undefined") {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
  };
}
mock.module("@/lib/utils/log", () => ({
  log: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
}));

// Bun provides sessionStorage globally, but we need to reset it between tests
// and stub window.location which Bun doesn't populate.

// Patch window.location per-test using the global
function setWindowLocation(search: string, hash: string): void {
  Object.defineProperty(globalThis, "window", {
    writable: true,
    value: {
      location: {
        search,
        hash,
        pathname: "/",
        href: `http://localhost/${search}${hash}`,
      },
      history: {
        replaceState: (_s: unknown, _t: unknown, url: string) => {
          // Track the last replaceState call for assertions
          (globalThis as Record<string, unknown>)._lastReplaceUrl = url;
        },
      },
    },
  });
}

import {
  getUrlParameter,
  storeSessionParameter,
  getSessionParameter,
  getPersistedUrlParameter,
  clearSessionParameter,
  getSecretFromHash,
  getSecretParameter,
} from "./url-params";

describe("url-params", () => {
  beforeEach(() => {
    sessionStorage.clear();
    (globalThis as Record<string, unknown>)._lastReplaceUrl = null;
  });

  // ─────────────────────────────────────────────
  // getUrlParameter
  // ─────────────────────────────────────────────
  describe("getUrlParameter", () => {
    test("returns value from query string", () => {
      setWindowLocation("?foo=bar&baz=qux", "");
      expect(getUrlParameter("foo")).toBe("bar");
      expect(getUrlParameter("baz")).toBe("qux");
    });

    test("returns null when param not in query string or hash", () => {
      setWindowLocation("?other=1", "");
      expect(getUrlParameter("missing")).toBeNull();
    });

    test("returns value from hash query string", () => {
      setWindowLocation("", "#/dashboard?token=abc&page=2");
      expect(getUrlParameter("token")).toBe("abc");
      expect(getUrlParameter("page")).toBe("2");
    });

    test("query string takes precedence over hash", () => {
      setWindowLocation("?key=fromQuery", "#/?key=fromHash");
      expect(getUrlParameter("key")).toBe("fromQuery");
    });

    test("returns null when hash has no query string", () => {
      setWindowLocation("", "#/dashboard");
      expect(getUrlParameter("any")).toBeNull();
    });

    test("returns null when both search and hash are empty", () => {
      setWindowLocation("", "");
      expect(getUrlParameter("param")).toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // storeSessionParameter / getSessionParameter
  // ─────────────────────────────────────────────
  describe("storeSessionParameter / getSessionParameter", () => {
    test("stores and retrieves a value", () => {
      storeSessionParameter("myKey", "myValue");
      expect(getSessionParameter("myKey")).toBe("myValue");
    });

    test("returns null if key was never stored", () => {
      expect(getSessionParameter("nonexistent")).toBeNull();
    });

    test("overwrites existing value", () => {
      storeSessionParameter("k", "v1");
      storeSessionParameter("k", "v2");
      expect(getSessionParameter("k")).toBe("v2");
    });

    test("stores empty string", () => {
      storeSessionParameter("empty", "");
      expect(getSessionParameter("empty")).toBe("");
    });
  });

  // ─────────────────────────────────────────────
  // clearSessionParameter
  // ─────────────────────────────────────────────
  describe("clearSessionParameter", () => {
    test("removes a stored parameter", () => {
      storeSessionParameter("toDelete", "value");
      clearSessionParameter("toDelete");
      expect(getSessionParameter("toDelete")).toBeNull();
    });

    test("no-ops when key does not exist", () => {
      expect(() => clearSessionParameter("ghost")).not.toThrow();
    });
  });

  // ─────────────────────────────────────────────
  // getPersistedUrlParameter
  // ─────────────────────────────────────────────
  describe("getPersistedUrlParameter", () => {
    test("returns URL value and stores it in session", () => {
      setWindowLocation("?admin=secret", "");
      const result = getPersistedUrlParameter("admin");
      expect(result).toBe("secret");
      expect(getSessionParameter("admin")).toBe("secret");
    });

    test("falls back to session storage when not in URL", () => {
      setWindowLocation("", "");
      sessionStorage.setItem("persisted", "cached");
      expect(getPersistedUrlParameter("persisted")).toBe("cached");
    });

    test("uses custom storageKey when provided", () => {
      setWindowLocation("?token=xyz", "");
      getPersistedUrlParameter("token", "myStorageKey");
      expect(getSessionParameter("myStorageKey")).toBe("xyz");
    });

    test("URL value overwrites stale session value", () => {
      sessionStorage.setItem("key", "stale");
      setWindowLocation("?key=fresh", "");
      expect(getPersistedUrlParameter("key")).toBe("fresh");
      expect(getSessionParameter("key")).toBe("fresh");
    });

    test("returns null when neither URL nor session has it", () => {
      setWindowLocation("", "");
      expect(getPersistedUrlParameter("nope")).toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // getSecretFromHash
  // ─────────────────────────────────────────────
  describe("getSecretFromHash", () => {
    test("returns secret stored in session (skips URL manipulation)", () => {
      sessionStorage.setItem("secret", "cached-secret");
      setWindowLocation("", "");
      expect(getSecretFromHash("secret")).toBe("cached-secret");
    });

    test("extracts secret from hash and stores in session", () => {
      setWindowLocation("", "#secret=mysecrettoken");
      const result = getSecretFromHash("secret");
      expect(result).toBe("mysecrettoken");
      expect(getSessionParameter("secret")).toBe("mysecrettoken");
    });

    test("returns null when hash is empty", () => {
      setWindowLocation("", "");
      expect(getSecretFromHash("any")).toBeNull();
    });

    test("returns null when secret not in hash", () => {
      setWindowLocation("", "#otherparam=val");
      expect(getSecretFromHash("secret")).toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // getSecretParameter
  // ─────────────────────────────────────────────
  describe("getSecretParameter", () => {
    test("delegates to getSecretFromHash", () => {
      sessionStorage.setItem("mySecret", "value123");
      setWindowLocation("", "");
      expect(getSecretParameter("mySecret")).toBe("value123");
    });
  });
});
