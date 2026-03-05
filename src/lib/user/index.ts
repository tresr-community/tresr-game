/**
 * User Profile Service
 *
 * Handles interaction with the Juno Datastore 'users' collection.
 */

import {getDoc, setDoc, type Doc} from "@junobuild/core";
import {getSatelliteConfig} from "../auth";
import type {UserProfile} from "../../types/backend";
import {log} from "../utils/log";

const COLLECTION_USERS = "users";

// Re-export the centralized write queue so consumers can import from "@/lib/user"
export {enqueueProfileWrite, flushProfileWrites} from "./write-queue";

/**
 * Fetch a user profile by their Principal ID (key).
 * Returns null if the profile does not exist.
 *
 * Juno: getDoc on "users" collection — no Rust hooks triggered (read-only).
 */
export async function getUserProfile(
  key: string
): Promise<Doc<UserProfile> | null> {
  try {
    const doc = await getDoc<UserProfile>({
      collection: COLLECTION_USERS,
      key,
      ...getSatelliteConfig(),
    });
    return doc || null;
  } catch {
    // If 404/not found, return null
    return null;
  }
}

/**
 * Create or Update a user profile.
 * @param key The User Principal ID
 * @param profile The profile data
 * @param version The current version (if updating) to prevent race conditions
 *
 * Juno: setDoc on "users" collection →
 *   Rust assert: assert_user_profile() — validates EVM wallet format + signature
 *   Rust hook:   on_set_doc("users") → no-op (returns Ok)
 */
export async function saveUserProfile(
  key: string,
  profile: UserProfile,
  version?: bigint
): Promise<Doc<UserProfile>> {
  log.info(
    "UserProfile",
    "Saving profile for key:",
    key,
    "data.user_id:",
    profile.user_id
  );
  return await setDoc<UserProfile>({
    collection: COLLECTION_USERS,
    doc: {
      key,
      data: profile,
      version,
    },
    ...getSatelliteConfig(),
  });
}

// Re-export profile creation helpers from their own module (breaks the
// circular dependency with write-queue.ts which also needs createDefaultProfile).
export {genNickName, createDefaultProfile} from "./default-profile";
export type {CreateProfileOptions} from "./default-profile";
