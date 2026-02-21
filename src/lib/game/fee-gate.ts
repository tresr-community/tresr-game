/**
 * Fee Gate — module-scoped fee payment state.
 *
 * Replaces window globals (showFeeGate, isFeePaid, clearFeePaid, sessionId)
 * with typed exports that share state via ES module singleton.
 *
 * Fee-paid state is HMAC-signed so sessionStorage can't be trivially
 * spoofed from DevTools (ticket #198).
 */

const SESSION_KEY = "tresr_fee_paid";
const SIG_KEY = "tresr_fee_sig";
const TX_KEY = "tresr_fee_tx";
const SID_KEY = "tresr_fee_sid";

let sessionId: string | null = null;

// In-memory HMAC key — generated per payment, lost on page reload (intentional)
let hmacKey: CryptoKey | null = null;

// Resolve/reject for the current fee gate flow
let feeGateResolve: (() => void) | null = null;
let feeGateReject: ((reason: Error) => void) | null = null;

// Module-level timer ID so all cleanup paths can clear it
let feeGateTimerId: ReturnType<typeof setTimeout> | null = null;

function clearFeeGateTimer(): void {
  if (feeGateTimerId !== null) {
    clearTimeout(feeGateTimerId);
    feeGateTimerId = null;
  }
}

async function generateHmacKey(): Promise<CryptoKey> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return crypto.subtle.importKey(
    "raw",
    raw,
    {name: "HMAC", hash: "SHA-256"},
    false,
    ["sign", "verify"]
  );
}

async function signPayload(key: CryptoKey, payload: string): Promise<string> {
  const data = new TextEncoder().encode(payload);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function isFeePaid(): Promise<boolean> {
  // Without the in-memory HMAC key, the signature can't be verified —
  // this means a page reload correctly invalidates fee-paid state.
  if (!hmacKey) return false;

  const flag = sessionStorage.getItem(SESSION_KEY);
  const sig = sessionStorage.getItem(SIG_KEY);
  const tx = sessionStorage.getItem(TX_KEY);
  const sid = sessionStorage.getItem(SID_KEY);
  if (flag !== "true" || !sig || !tx || !sid) return false;

  // Cryptographically verify the HMAC signature matches stored tx:sid
  const payload = new TextEncoder().encode(`${tx}:${sid}`);
  const hexPairs = sig.match(/.{1,2}/g);
  if (!hexPairs) return false;
  const sigBytes = new Uint8Array(hexPairs.map((byte) => parseInt(byte, 16)));
  return crypto.subtle.verify("HMAC", hmacKey, sigBytes, payload);
}

export function clearFeePaid(): void {
  clearFeeGateTimer();
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SIG_KEY);
  sessionStorage.removeItem(TX_KEY);
  sessionStorage.removeItem(SID_KEY);
  sessionId = null;
  hmacKey = null;
}

export async function markFeePaid(txHash: string, sid: string): Promise<void> {
  hmacKey = await generateHmacKey();
  const payload = `${txHash}:${sid}`;
  const sig = await signPayload(hmacKey, payload);

  sessionStorage.setItem(SESSION_KEY, "true");
  sessionStorage.setItem(TX_KEY, txHash);
  sessionStorage.setItem(SID_KEY, sid);
  sessionStorage.setItem(SIG_KEY, sig);
  sessionId = sid;
}

export function getSessionId(): string | null {
  return sessionId;
}

/**
 * Request the fee gate modal to open.
 * Returns a promise that resolves when fee is paid or rejects on abort.
 * The modal UI listens for the `tresr:fee-gate-open` event.
 * Timeout covers blockchain transaction confirmation, not modal display time.
 */
export function showFeeGate(timeoutMs: number = 60000): Promise<void> {
  // Reject any pending fee gate before starting a new one
  if (feeGateReject) {
    clearFeeGateTimer();
    feeGateReject(new Error("Fee gate superseded by new request"));
    feeGateResolve = null;
    feeGateReject = null;
  }

  return new Promise((resolve, reject) => {
    feeGateTimerId = setTimeout(() => {
      feeGateTimerId = null;
      feeGateResolve = null;
      feeGateReject = null;
      reject(
        new Error("Fee gate timed out — blockchain transaction took too long")
      );
    }, timeoutMs);

    feeGateResolve = () => {
      clearFeeGateTimer();
      resolve();
    };
    feeGateReject = (reason: Error) => {
      clearFeeGateTimer();
      reject(reason);
    };
    document.dispatchEvent(new CustomEvent("tresr:fee-gate-open"));
  });
}

/**
 * Called by the FeeGate UI when payment succeeds.
 */
export function resolveFeeGate(): void {
  if (feeGateResolve) {
    feeGateResolve();
    feeGateResolve = null;
    feeGateReject = null;
  }
}

/**
 * Called by the FeeGate UI when the user aborts.
 */
export function rejectFeeGate(): void {
  if (feeGateReject) {
    feeGateReject(new Error("User aborted fee payment"));
    feeGateResolve = null;
    feeGateReject = null;
  }
}
