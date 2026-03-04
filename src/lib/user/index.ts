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

/**
 * Generate a semi-random friendly nickname.
 * Format: FirstPart + LastPart + 3-digit Number
 */
export function genNickName(): string {
  const firstParts = [
    "Hunter",
    "Cyber",
    "Degen",
    "Crypto",
    "Neon",
    "Grid",
    "Power",
    "Turbo",
    "Retro",
    "Mega",
    "Bit",
    "Giga",
    "Alpha",
    "Omega",
    "Sonic",
  ];
  const lastParts = [
    "Man",
    "Bro",
    "Hero",
    "Ape",
    "Whale",
    "Punk",
    "Runner",
    "Ghost",
    "Phantom",
    "Ninja",
    "Warrior",
    "Sage",
    "Wolf",
    "Dragon",
    "Pineapple",
  ];

  const first = firstParts[Math.floor(Math.random() * firstParts.length)];
  const last = lastParts[Math.floor(Math.random() * lastParts.length)];
  const num = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");

  return `${first}${last}${num}`;
}

/**
 * Options for creating a default profile.
 * Used when creating profiles for different auth methods.
 */
export interface CreateProfileOptions {
  /** The wallet address for SIWA users (already linked via login) */
  evm_wallet?: string;
  /** How the user authenticated */
  login_method?: "iid" | "siwa";
}

/**
 * createDefaultProfile
 * Returns a default profile object for a new user.
 *
 * @param userId The user's principal ID
 * @param options Optional settings for SIWA users who already have a linked wallet
 */
export function createDefaultProfile(
  userId: string,
  options?: CreateProfileOptions
): UserProfile {
  const isWalletLinked = Boolean(options?.evm_wallet);

  return {
    user_id: userId,
    nickname: genNickName(),
    login_method: options?.login_method,
    stats: {
      high_score: 0n,
      total_games_played: 0n,
      total_games_won: 0n,
      total_games_lost: 0n,
    },
    wallet: {
      balance: 0n,
      evm_wallet_linked: isWalletLinked,
    },
    preferences: {
      theme: "synthwave",
      has_read_instructions: false,
    },
    evm_wallet: options?.evm_wallet,
  };
}
