/**
 * Canonical JSON serialization — deterministic key ordering at all depths.
 * Produces identical output on Node.js (build-time) and browser (runtime)
 * so config hashes match regardless of platform.
 */
export function canonicalStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalStringify).join(",") + "]";
  }
  const entries = Object.entries(obj as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const pairs = entries.map(
    ([k, v]) => JSON.stringify(k) + ":" + canonicalStringify(v)
  );
  return "{" + pairs.join(",") + "}";
}
