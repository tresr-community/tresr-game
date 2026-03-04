import {atom} from "nanostores";
import type {UserProfile} from "../../types/backend";
import {log} from "../utils/log";

const COMPONENT_NAME = "ProfileStore";

export const profileStore = atom<UserProfile | null>(null);

/**
 * Load user profile into the store.
 * Juno: getDoc on "users" (read-only, no Rust hooks).
 * If no profile exists, creates one via the centralized write queue.
 */
export async function loadProfile(principal: string): Promise<void> {
  try {
    // Dynamic import to break circular dependency (see note at top of file)
    const {getUserProfile, enqueueProfileWrite} = await import("./index");

    log.info(COMPONENT_NAME, `Loading profile for ${principal}`);

    // Check the in-memory store first. The SIWA auth path writes the profile
    // and populates the store before calling notifyAuthChange, so loadProfile
    // may be called when the store is already populated (avoids an extra write).
    const existing = profileStore.get();
    if (existing) {
      log.debug(COMPONENT_NAME, "Profile already in store, skipping Juno read");
      return;
    }

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
