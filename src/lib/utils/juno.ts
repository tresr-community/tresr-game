import {initSatellite} from "@junobuild/core";
import {JUNO_EMULATOR_PORT} from "@/lib/config/constants";

/**
 * Universally wraps initSatellite to guarantee `.localhost` container overrides
 * survive SvelteKit's environment compilation stripping, preventing local builds
 * from attempting to query `icp-api.io`.
 */
export async function initializeJunoSatellite() {
  const isLocalEmulator =
    typeof window !== "undefined" &&
    (window.location.hostname.endsWith("localhost") ||
      window.location.hostname === "127.0.0.1");

  return initSatellite({
    satelliteId: __JUNO_SATELLITE_ID__,
    container: isLocalEmulator
      ? `http://localhost:${JUNO_EMULATOR_PORT}`
      : undefined,
  });
}
