/**
 * Centralized Profile Write Queue
 *
 * Serializes all getDoc → mutate → setDoc operations on the "users" collection
 * through a single promise chain. This prevents Juno version_outdated_or_future
 * race conditions that occur when multiple independent code paths (auth,
 * notifications, music, game stats) write concurrently to the same document.
 *
 * Usage:
 *   await enqueueProfileWrite(principal, (profile) => ({
 *     ...profile,
 *     evmWallet: "0x...",
 *   }));
 *
 * The queue guarantees that each operation reads the latest version before
 * writing, even when multiple callers enqueue concurrently.
 */

import {getDoc, setDoc, type Doc} from "@junobuild/core";
import {getSatelliteConfig} from "../auth";
import type {UserProfile} from "../../types/backend";
import {createDefaultProfile} from "./index";
import {log} from "../utils/log";

const COMPONENT_NAME = "ProfileWriteQueue";
const COLLECTION_USERS = "users";

/** Promise chain — writes are serialized through this. */
let writeQueue: Promise<void> = Promise.resolve();

/**
 * Enqueue a profile mutation.
 *
 * The mutator receives the current profile (or a freshly-created default)
 * and must return the updated profile. The queue handles getDoc/setDoc and
 * version management automatically.
 *
 * @param principal  The user's Principal ID (document key)
 * @param mutator    A function that transforms the profile.
 *                   Receives the current profile; must return the updated one.
 */
export function enqueueProfileWrite(
  principal: string,
  mutator: (profile: UserProfile) => UserProfile
): Promise<void> {
  // Create a deferred promise so the caller can await the result.
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const deferred = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  // Chain onto the queue — doWrite() only starts when prior writes finish.
  // Both resolve and reject arms start a fresh operation so a failed write
  // doesn't block subsequent ones.
  writeQueue = writeQueue.then(
    () => doWrite(principal, mutator).then(resolve, reject),
    () => doWrite(principal, mutator).then(resolve, reject)
  );

  return deferred;
}

/** Small async delay helper. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Perform a single read-modify-write cycle.
 * Retries up to MAX_ATTEMPTS on version conflicts with exponential backoff.
 * This handles both "outdated" (concurrent frontend writes) and "future"
 * (stale cache after satellite redeploy) version errors.
 */
async function doWrite(
  principal: string,
  mutator: (profile: UserProfile) => UserProfile
): Promise<void> {
  const MAX_ATTEMPTS = 4;
  const BASE_DELAY_MS = 100;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const config = getSatelliteConfig();

    try {
      const existingDoc: Doc<UserProfile> | undefined =
        (await getDoc<UserProfile>({
          collection: COLLECTION_USERS,
          key: principal,
          ...config,
        })) ?? undefined;

      const currentProfile: UserProfile =
        existingDoc?.data ?? createDefaultProfile(principal);

      const updatedProfile = mutator(currentProfile);

      await setDoc<UserProfile>({
        collection: COLLECTION_USERS,
        doc: {
          key: principal,
          data: updatedProfile,
          version: existingDoc?.version,
        },
        ...config,
      });

      log.debug(COMPONENT_NAME, "Profile write succeeded for", principal);
      return;
    } catch (e) {
      const isVersionConflict =
        e instanceof Error && e.message.includes("version_outdated_or_future");

      if (isVersionConflict && attempt < MAX_ATTEMPTS - 1) {
        const backoff = BASE_DELAY_MS * Math.pow(2, attempt);
        log.warn(
          COMPONENT_NAME,
          `Version conflict (attempt ${attempt + 1}/${MAX_ATTEMPTS}), ` +
            `retrying in ${backoff}ms...`,
          principal,
          e instanceof Error ? e.message : ""
        );
        await delay(backoff);
        continue;
      }
      log.error(COMPONENT_NAME, "Profile write failed for", principal, e);
      throw e;
    }
  }
}

/**
 * Wait for all enqueued profile write operations to complete.
 * Used by applyUpdate() to ensure all profile persistence finishes
 * before sign-out and navigation.
 */
export function flushProfileWrites(): Promise<void> {
  return writeQueue;
}
