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
    "data.userId:",
    profile.userId
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
  evmWallet?: string;
  /** How the user authenticated */
  loginMethod?: "iid" | "siwa";
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
  const isWalletLinked = Boolean(options?.evmWallet);

  return {
    userId,
    nickname: genNickName(),
    loginMethod: options?.loginMethod,
    stats: {
      highScore: 0n,
      totalGamesPlayed: 0n,
      totalGamesWon: 0n,
      totalGamesLost: 0n,
    },
    wallet: {
      balance: 0n,
      evmWalletLinked: isWalletLinked,
    },
    preferences: {
      theme: "synthwave",
      has_read_instructions: false,
    },
    evmWallet: options?.evmWallet,
  };
}
