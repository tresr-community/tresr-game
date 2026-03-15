/**
 * maintenance-state.ts
 *
 * Single-flag module that tracks whether maintenance mode is active for this
 * page session. Once set, the log utility stops showing user-visible toasts so
 * the maintenance modal can communicate on its own without noise.
 *
 * Usage:
 *   import {maintenanceState} from "@/lib/utils/maintenance-state";
 *   maintenanceState.activate();   // call before logging when maintenance detected
 *   maintenanceState.isActive();   // check in log utility before showing toasts
 */

let _inMaintenance = false;

export const maintenanceState = {
  /** Mark maintenance mode as active for this session. */
  activate: () => {
    _inMaintenance = true;
  },
  /** Clear maintenance mode (satellite is back in sync). */
  deactivate: () => {
    _inMaintenance = false;
  },
  /** Returns true once activate() has been called (and deactivate() has not). */
  isActive: () => _inMaintenance,
};
