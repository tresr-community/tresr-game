import {describe, expect, test, beforeEach, mock} from "bun:test";

// Bun's test runner does not expose DOM globals. Polyfill sessionStorage and
// document.dispatchEvent before importing fee-gate (which uses them at module scope).
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
if (typeof globalThis.document === "undefined") {
  (globalThis as Record<string, unknown>).document = {
    dispatchEvent: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

// Mock the log module before importing state modules
mock.module("@/lib/utils/log", () => ({
  log: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
}));

// fee-gate.ts uses ES module singleton state — we reset between tests via clearFeePaid()
import {
  isFeePaid,
  markFeePaid,
  clearFeePaid,
  getSessionId,
  showFeeGate,
  resolveFeeGate,
  rejectFeeGate,
} from "./fee-gate";

describe("fee-gate", () => {
  beforeEach(() => {
    clearFeePaid();
    sessionStorage.clear();
  });

  // ─────────────────────────────────────────────
  // isFeePaid initial state
  // ─────────────────────────────────────────────
  describe("isFeePaid()", () => {
    test("returns false initially (no HMAC key)", async () => {
      expect(await isFeePaid()).toBe(false);
    });

    test("returns false when sessionStorage has values but no in-memory key", async () => {
      // Simulate stale sessionStorage data from a previous page load
      sessionStorage.setItem("tresr_fee_paid", "true");
      sessionStorage.setItem("tresr_fee_tx", "0xabc");
      sessionStorage.setItem("tresr_fee_sid", "sid-001");
      sessionStorage.setItem("tresr_fee_sig", "deadbeef");
      // Reload scenario: HMAC key is in-memory only, cleared on page reload
      expect(await isFeePaid()).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // markFeePaid
  // ─────────────────────────────────────────────
  describe("markFeePaid()", () => {
    test("causes isFeePaid() to return true", async () => {
      await markFeePaid("0xdeadbeef", "session-1");
      expect(await isFeePaid()).toBe(true);
    });

    test("stores tx in sessionStorage", async () => {
      await markFeePaid("0x1234", "sid-abc");
      expect(sessionStorage.getItem("tresr_fee_tx")).toBe("0x1234");
    });

    test("stores sid in sessionStorage", async () => {
      await markFeePaid("0x1234", "sid-abc");
      expect(sessionStorage.getItem("tresr_fee_sid")).toBe("sid-abc");
    });

    test("stores flag as 'true' in sessionStorage", async () => {
      await markFeePaid("0xhash", "sid-xyz");
      expect(sessionStorage.getItem("tresr_fee_paid")).toBe("true");
    });

    test("stores a non-empty signature in sessionStorage", async () => {
      await markFeePaid("0xhash", "sid-xyz");
      const sig = sessionStorage.getItem("tresr_fee_sig");
      expect(sig).not.toBeNull();
      expect(sig!.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────
  // clearFeePaid
  // ─────────────────────────────────────────────
  describe("clearFeePaid()", () => {
    test("isFeePaid() returns false after clear", async () => {
      await markFeePaid("0xhash", "sid-1");
      clearFeePaid();
      expect(await isFeePaid()).toBe(false);
    });

    test("removes all sessionStorage keys", async () => {
      await markFeePaid("0xhash", "sid-1");
      clearFeePaid();
      expect(sessionStorage.getItem("tresr_fee_paid")).toBeNull();
      expect(sessionStorage.getItem("tresr_fee_tx")).toBeNull();
      expect(sessionStorage.getItem("tresr_fee_sid")).toBeNull();
      expect(sessionStorage.getItem("tresr_fee_sig")).toBeNull();
    });

    test("getSessionId() returns null after clear", async () => {
      await markFeePaid("0xhash", "sid-abc");
      clearFeePaid();
      expect(getSessionId()).toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // getSessionId
  // ─────────────────────────────────────────────
  describe("getSessionId()", () => {
    test("returns null before markFeePaid", () => {
      expect(getSessionId()).toBeNull();
    });

    test("returns session id after markFeePaid", async () => {
      await markFeePaid("0xhash", "sid-xyz");
      expect(getSessionId()).toBe("sid-xyz");
    });
  });

  // ─────────────────────────────────────────────
  // showFeeGate / resolveFeeGate / rejectFeeGate
  // ─────────────────────────────────────────────
  describe("showFeeGate()", () => {
    test("returns a Promise", () => {
      const p = showFeeGate(5000);
      expect(p).toBeInstanceOf(Promise);
      // Attach handler BEFORE rejecting so the rejection is not unhandled
      p.catch(() => {});
      rejectFeeGate();
    });

    test("resolves when resolveFeeGate() is called", async () => {
      const p = showFeeGate(5000);
      resolveFeeGate();
      await expect(p).resolves.toBeUndefined();
    });

    test("rejects when rejectFeeGate() is called", async () => {
      const p = showFeeGate(5000);
      rejectFeeGate();
      await expect(p).rejects.toThrow("User aborted fee payment");
    });

    test("supersedes pending gate when called a second time", async () => {
      const first = showFeeGate(5000);
      const second = showFeeGate(5000);
      // Resolve the second gate
      resolveFeeGate();
      // First should have been rejected
      await expect(first).rejects.toThrow("Fee gate superseded");
      await expect(second).resolves.toBeUndefined();
    });

    test("rejects after timeout", async () => {
      const p = showFeeGate(50); // 50 ms
      await expect(p).rejects.toThrow("Fee gate timed out");
    });

    test("resolveFeeGate is no-op after already resolved", async () => {
      const p = showFeeGate(5000);
      resolveFeeGate();
      // Calling again should not throw
      expect(() => resolveFeeGate()).not.toThrow();
      await p; // ensure resolved cleanly
    });

    test("rejectFeeGate is no-op when no pending gate", () => {
      expect(() => rejectFeeGate()).not.toThrow();
    });
  });

  // ─────────────────────────────────────────────
  // HMAC signature tamper detection
  // ─────────────────────────────────────────────
  describe("tamper detection", () => {
    test("isFeePaid() returns false when signature is tampered", async () => {
      await markFeePaid("0xhash", "sid-001");
      sessionStorage.setItem("tresr_fee_sig", "00".repeat(32)); // invalid sig
      expect(await isFeePaid()).toBe(false);
    });

    test("isFeePaid() returns false when tx hash is tampered", async () => {
      await markFeePaid("0xhash", "sid-001");
      sessionStorage.setItem("tresr_fee_tx", "0xtampered");
      expect(await isFeePaid()).toBe(false);
    });

    test("isFeePaid() returns false when session id is tampered", async () => {
      await markFeePaid("0xhash", "sid-001");
      sessionStorage.setItem("tresr_fee_sid", "different-sid");
      expect(await isFeePaid()).toBe(false);
    });

    test("isFeePaid() returns false when flag is missing", async () => {
      await markFeePaid("0xhash", "sid-001");
      sessionStorage.removeItem("tresr_fee_paid");
      expect(await isFeePaid()).toBe(false);
    });
  });
});
