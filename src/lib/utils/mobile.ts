/**
 * Mobile performance detection utilities.
 *
 * Provides device-capability checks that game systems can use to
 * scale effects, pool sizes, and texture quality for lower-end devices.
 */

/** Detect whether the current device is a touch / mobile device. */
export function isMobileDevice(): boolean {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

/**
 * Estimate device performance tier: "low", "mid", or "high".
 *
 * Uses `navigator.hardwareConcurrency` and `navigator.deviceMemory`
 * (the latter is Chromium-only, so we fall back gracefully).
 */
export type PerfTier = "low" | "mid" | "high";

export function getDevicePerfTier(): PerfTier {
  if (!isMobileDevice()) return "high"; // desktops are assumed capable

  const cores = navigator.hardwareConcurrency ?? 4;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memory = (navigator as any).deviceMemory ?? 4; // GB

  if (cores <= 2 || memory <= 2) return "low";
  if (cores <= 4 || memory <= 4) return "mid";
  return "high";
}

/** Get a multiplier (0–1) for particle counts, pool sizes, etc. */
export function getEffectsMultiplier(): number {
  const tier = getDevicePerfTier();
  switch (tier) {
    case "low":
      return 0.4;
    case "mid":
      return 0.7;
    case "high":
      return 1.0;
  }
}

/** Whether to prefer lower-resolution textures (e.g. 256px vs 512px). */
export function shouldUseLowResTextures(): boolean {
  const tier = getDevicePerfTier();
  // Low-DPI mobile devices get lower-res textures
  return tier === "low" || (tier === "mid" && window.devicePixelRatio <= 1);
}
