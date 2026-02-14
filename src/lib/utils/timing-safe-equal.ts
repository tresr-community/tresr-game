/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 * Both strings are compared in full regardless of where they differ.
 * Length mismatch is incorporated into the result without early exit.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let result = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    result |= ca ^ cb;
  }
  return result === 0;
}
