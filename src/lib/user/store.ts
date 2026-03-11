import {atom} from "nanostores";
import type {UserProfile} from "../../types/backend";
import {log} from "../utils/log";
import {getUserProfile, enqueueProfileWrite} from "./index";

const COMPONENT_NAME = "ProfileStore";

export const profileStore = atom<UserProfile | null>(null);

/** In-flight load promise — coalesces concurrent loadProfile() calls. */
let loadInFlight: Promise<void> | null = null;
let loadInFlightPrincipal: string | null = null;

/**
 * Load user profile into the store.
 * Juno: getDoc on "users" (read-only, no Rust hooks).
 * If no profile exists, creates one via the centralized write queue.
 *
 * Concurrent calls for the same principal share a single in-flight promise
 * to prevent duplicate Juno reads and version conflicts in the write queue.
 * This guards against Juno firing onAuthStateChange twice during SIWA recovery.
 */
export async function loadProfile(principal: string): Promise<void> {
  // Check the in-memory store first. The SIWA auth path writes the profile
  // and populates the store before calling notifyAuthChange, so loadProfile
  // may be called when the store is already populated (avoids an extra write).
  if (profileStore.get()) {
    log.debug(COMPONENT_NAME, "Profile already in store, skipping Juno read");
    return;
  }

  // Coalesce concurrent calls for the same principal onto one shared promise.
  // Juno can fire onAuthStateChange twice during SIWA recovery (once when IDB
  // is bridged, once after initSatellite), causing two loadProfile() calls
  // before the first one completes — which triggers duplicate writes and
  // version_outdated_or_future conflicts in the write queue.
  if (loadInFlight && loadInFlightPrincipal === principal) {
    log.debug(
      COMPONENT_NAME,
      "Load already in progress for principal, coalescing"
    );
    return loadInFlight;
  }

  loadInFlightPrincipal = principal;
  loadInFlight = doLoadProfile(principal).finally(() => {
    loadInFlight = null;
    loadInFlightPrincipal = null;
  });
  return loadInFlight;
}

async function doLoadProfile(principal: string): Promise<void> {
  try {
    log.info(COMPONENT_NAME, `Loading profile for ${principal}`);

    const doc = await getUserProfile(principal);
    if (doc) {
      // Load existing user profile.
      profileStore.set(doc.data);
    } else {
      // No profile yet — create a default via the write queue.
      // The queue's doWrite handles createDefaultProfile internally.
      await enqueueProfileWrite(principal, (profile) => profile);
      // Read back the saved profile
      const savedDoc = await getUserProfile(principal);
      if (savedDoc) {
        profileStore.set(savedDoc.data);
      }
    }
  } catch (error) {
    log.error(COMPONENT_NAME, "Failed to load profile", error);
  }
}

/**
 * Clear the profile store.
 */
export function clearProfile(): void {
  profileStore.set(null);
}
