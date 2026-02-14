import {atom} from "nanostores";
import type {UserProfile} from "../../types/backend";
import {getUserProfile, createDefaultProfile, saveUserProfile} from "./index";
import {log} from "../utils/log";

const COMPONENT_NAME = "ProfileStore";

export const profileStore = atom<UserProfile | null>(null);

/**
 * Load user profile into the store.
 * Juno: getDoc on "users" (read-only, no Rust hooks).
 * If no profile exists, creates one via setDoc → Rust assert_user_profile().
 */
export async function loadProfile(principal: string): Promise<void> {
  try {
    log.info(COMPONENT_NAME, `Loading profile for ${principal}`);
    const doc = await getUserProfile(principal);
    if (doc) {
      // Load existing user profile.
      profileStore.set(doc.data);
    } else {
      // Create a default profile and save it.
      const defaultProfile = createDefaultProfile(principal);
      await saveUserProfile(principal, defaultProfile);
      profileStore.set(defaultProfile);
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
