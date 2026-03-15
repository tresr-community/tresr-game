/**
 * Pre-flight check: verify the deployed satellite's config hash matches
 * the hash baked into this frontend build.
 *
 * Returns true  → satellite is in sync, proceed to fee gate
 * Returns false → hash mismatch or satellite unreachable → show maintenance modal
 *
 * Called from game.astro after the vault-deployed check, before the fee gate.
 * IC queries are free (~100 ms), so this adds negligible latency.
 */
import {SERVER_CONFIG_HASH} from "@/lib/config/server-constants";
import {idlFactory} from "@/declarations/satellite/satellite.factory.did.js";
import {getSatelliteExtendedActor} from "@junobuild/core";
import type {_SERVICE as SatelliteActor} from "@/declarations/satellite/satellite.did";
import {log} from "@/lib/utils/log";
import {maintenanceState} from "@/lib/utils/maintenance-state";

const COMPONENT_NAME = "PreflightCheck";

export async function isSatelliteInSync(
  opts: {quiet?: boolean} = {}
): Promise<boolean> {
  try {
    const {get_config_hash} = await getSatelliteExtendedActor<SatelliteActor>({
      idlFactory,
    });
    const serverHash: string = await get_config_hash();
    if (serverHash !== SERVER_CONFIG_HASH) {
      // Activate before logging so the warn itself doesn't trigger a toast.
      maintenanceState.activate();
      if (!opts.quiet) {
        log.warn(
          COMPONENT_NAME,
          `Config hash mismatch: server=${serverHash.slice(0, 8)}… client=${SERVER_CONFIG_HASH.slice(0, 8)}…`
        );
      }
      return false;
    }
    log.debug(COMPONENT_NAME, `Config hash OK: ${serverHash.slice(0, 8)}…`);
    return true;
  } catch (err) {
    // Satellite unreachable (not deployed, not activated, or network error) → maintenance.
    // Activate before logging so the warn itself doesn't trigger a toast.
    maintenanceState.activate();
    if (!opts.quiet) {
      log.warn(
        COMPONENT_NAME,
        "Satellite unreachable — treating as maintenance",
        err
      );
    }
    return false;
  }
}
