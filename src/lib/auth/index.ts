/**
 * Juno Authentication Service
 *
 * Provides unified authentication via Internet Identity 2.0 (id.ai):
 * - Supports Internet Identity, Passkeys, Google, Apple, Microsoft
 * - Anonymous/Normie mode (no persistent identity)
 * - Avalanche (EVM) Wallet via SIWA (Sign In With Avalanche)
 */

import {
  initSatellite,
  signIn,
  signUp,
  signOut as junoSignOut,
  onAuthStateChange,
  isWebAuthnAvailable,
  getDoc,
  setDoc,
  type User,
} from "@junobuild/core";
import {SiwaClient, type SiwaIdentity} from "ic-siwa";
import type {Identity} from "@dfinity/agent";
import {
  IdbStorage,
  KEY_STORAGE_KEY,
  KEY_STORAGE_DELEGATION,
} from "@dfinity/auth-client";
import {JUNO_ENVIRONMENT, log} from "@/lib/utils/log";
import {
  JUNO_INTERNET_IDENTITY,
  JUNO_SIWA_PROVIDER,
  IC_HOST,
} from "@/lib/config/constants";
import {
  connectWallet,
  getWalletClient,
  disconnectWallet,
} from "@/lib/wallet/connection";
import {config} from "@/lib/config/client";
import {loadProfile, clearProfile, profileStore} from "@/lib/user/store";
import {getUserProfile, enqueueProfileWrite} from "@/lib/user";

const COMPONENT_NAME = "Auth";

export type AuthMode = "guest" | "internet-identity" | "avalanche";

export interface AuthState {
  isAuthenticated: boolean;
  isGuest: boolean;
  user: User | null;
  authMode: AuthMode | null;
  principalId: string | null;
}

// Auth state storage keys
const STORAGE_KEY_AUTH_MODE = "tresr_auth_mode";
const STORAGE_KEY_GUEST = "tresr_is_guest";

// SIWA identity storage
let siwaIdentity: SiwaIdentity | null = null;

// Named handler for junoSignOutAuthTimer (ticket #271: removable reference)
let signOutTimerHandler: (() => void) | null = null;

export function getIdentity(): Identity | null {
  if (!siwaIdentity) return null;
  // Get the delegation identity from SIWA identity for use with Juno
  return siwaIdentity.getDelegationIdentity() as unknown as Identity;
}

/**
 * Helper to get the satellite configuration for Juno calls.
 * Bridges the type gap between @dfinity/agent Identity and Juno's expected type.
 * Returns 'any' to bypass strict type checking at call sites due to package mismatch.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSatelliteConfig(): any {
  const identity = getIdentity();
  if (!identity) return {};
  return {satellite: {identity}};
}

// SIWA Client singleton
let siwaClient: SiwaClient | null = null;

function getSiwaClient(): SiwaClient {
  if (!siwaClient) {
    siwaClient = new SiwaClient({
      canisterId: JUNO_SIWA_PROVIDER,
      host: IC_HOST,
      autoRefresh: true,
      onRefresh: (refreshedIdentity) => {
        // Re-bridge the refreshed delegation to IDB so Juno sees it
        siwaIdentity = refreshedIdentity;
        bridgeSiwaToIdb(refreshedIdentity)
          .then(() => {
            log.info(
              COMPONENT_NAME,
              "Re-bridged refreshed SIWA identity to IDB"
            );
          })
          .catch((err) => {
            log.warn(
              COMPONENT_NAME,
              "Failed to re-bridge refreshed identity:",
              err
            );
          });
      },
    });
  }
  log.debug(COMPONENT_NAME, "Juno SIWA Provider:", JUNO_SIWA_PROVIDER);
  return siwaClient;
}

/**
 * Bridge SIWA identity into IndexedDB so initSatellite() recognizes the session.
 * Writes the Ed25519 base key and delegation chain into the auth-client IDB store.
 */
async function bridgeSiwaToIdb(identity: SiwaIdentity): Promise<void> {
  const serialized = identity.serialize();
  const idbStorage = new IdbStorage();
  await idbStorage.set(KEY_STORAGE_KEY, serialized.baseKey);
  await idbStorage.set(KEY_STORAGE_DELEGATION, serialized.delegationChain);
  log.debug(COMPONENT_NAME, "Bridged SIWA identity to IDB");
}

// Singleton state
let authState: AuthState = {
  isAuthenticated: false,
  isGuest: false,
  user: null,
  authMode: null,
  principalId: null,
};

let initPromise: Promise<void> | null = null;
let authChangeCallbacks: Array<(state: AuthState) => void> = [];

/**
 * Notify all subscribers of auth state change.
 */
function notifyAuthChange(): void {
  const stateCopy = {...authState};
  for (const callback of authChangeCallbacks) {
    try {
      callback(stateCopy);
    } catch (error) {
      log.error(COMPONENT_NAME, "Error in auth change callback:", error);
    }
  }
}

/**
 * Sign out the current user.
 */
export async function handleSignOut(): Promise<void> {
  log.info(COMPONENT_NAME, "Signing out...");

  // Clear session storage - AGGRESSIVELY
  sessionStorage.removeItem(STORAGE_KEY_AUTH_MODE);
  sessionStorage.removeItem(STORAGE_KEY_GUEST);

  // Reset state
  authState = {
    isAuthenticated: false,
    isGuest: false,
    user: null,
    authMode: null,
    principalId: null,
  };

  // Remove session expiration listener to prevent stale closure firing
  if (signOutTimerHandler) {
    document.removeEventListener("junoSignOutAuthTimer", signOutTimerHandler);
    signOutTimerHandler = null;
  }

  siwaIdentity = null;
  if (siwaClient) {
    await siwaClient.logout();
  }

  // Clear SIWA identity from IDB (defense-in-depth before junoSignOut)
  try {
    const idbStorage = new IdbStorage();
    await idbStorage.remove(KEY_STORAGE_KEY);
    await idbStorage.remove(KEY_STORAGE_DELEGATION);
  } catch (err) {
    log.warn(COMPONENT_NAME, "IDB cleanup failed (non-fatal):", err);
  }

  // Disconnect wallet so AppKit/Wagmi state is clean (ticket #205)
  try {
    await disconnectWallet();
  } catch (err) {
    log.warn(COMPONENT_NAME, "Wallet disconnect failed (non-fatal):", err);
  }

  // Always sign out from Juno (which will trigger the auth state change)
  try {
    await junoSignOut({windowReload: true});
  } catch (error) {
    log.error(COMPONENT_NAME, "Error signing out from Juno:", error);
    // Fallback if juno fails
    window.location.reload();
  }

  notifyAuthChange();
  log.info(COMPONENT_NAME, "Signed out complete.");
}

/**
 * Initialize the Juno satellite and set up auth state monitoring.
 * Must be called once before any auth operations.
 */
export function initAuth(): Promise<void> {
  // Deduplicate concurrent calls — Header.astro and game.astro both call
  // initAuth() on page load; the promise ensures only one init runs.
  if (initPromise) return initPromise;
  initPromise = doInitAuth();
  return initPromise;
}

async function doInitAuth(): Promise<void> {
  log.info(COMPONENT_NAME, "Initializing...");

  // Try to recover SIWA identity if it exists
  const storedMode = sessionStorage.getItem(STORAGE_KEY_AUTH_MODE);
  if (storedMode === "avalanche") {
    try {
      // ic-siwa has built-in storage recovery
      const client = getSiwaClient();
      const identity = await client.getIdentity();
      if (identity && !identity.isExpired()) {
        siwaIdentity = identity;
        await bridgeSiwaToIdb(identity);
        log.info(COMPONENT_NAME, "Recovered Avalanche identity");
      }
    } catch (e) {
      log.warn(COMPONENT_NAME, "Failed to recover Avalanche identity", e);
    }
  }

  await initSatellite();

  // Listen for auth state changes from Juno
  onAuthStateChange((user: User | null) => {
    log.info(
      COMPONENT_NAME,
      "onAuthStateChange",
      user ? "User detected" : "No user"
    );

    if (user) {
      // A stale Juno delegation in IndexedDB (e.g. after `juno hosting clear`)
      // can fire onAuthStateChange(user) even when the current session is guest.
      // If the auth mode is "guest", the user intentionally logged in as guest —
      // ignore the stale delegation and preserve guest state.
      const currentMode = sessionStorage.getItem(STORAGE_KEY_AUTH_MODE);
      if (currentMode === "guest") {
        log.info(
          COMPONENT_NAME,
          "Stale Juno delegation detected during guest session — ignoring"
        );
        authState = {
          isAuthenticated: true,
          isGuest: true,
          user: null,
          authMode: "guest",
          principalId: null,
        };
        notifyAuthChange();
        return;
      }

      // If we have a user, we are definitely NOT a guest.
      // Ensure we wipe any guest residue.
      sessionStorage.removeItem(STORAGE_KEY_GUEST);

      // Determine auth mode from storage if possible
      const storedMode = currentMode;

      authState = {
        isAuthenticated: true,
        isGuest: false,
        user,
        authMode: (storedMode as AuthMode) || "internet-identity",
        principalId: user.key,
      };

      // Load profile asynchronously
      loadProfile(user.key)
        .then(() => {
          notifyAuthChange();
        })
        .catch((err) => {
          log.info(COMPONENT_NAME, "Failed to load profile:", err);
          notifyAuthChange();
        });
    } else {
      // Check if we have a guest session
      const isGuest = sessionStorage.getItem(STORAGE_KEY_GUEST) === "true";
      log.info(COMPONENT_NAME, "Normie check:", isGuest);

      if (isGuest) {
        authState = {
          isAuthenticated: true,
          isGuest: true,
          user: null,
          authMode: "guest",
          principalId: null,
        };
      } else {
        authState = {
          isAuthenticated: false,
          isGuest: false,
          user: null,
          authMode: null,
          principalId: null,
        };
        clearProfile();
      }
    }

    // Notify all subscribers
    notifyAuthChange();
  });

  // Listen for session expiration from Juno (delegation identity expired)
  // Guests don't use Juno delegations — ignore the timer if guest session is active.
  // Stale delegations in IndexedDB (e.g. after `juno hosting clear`) would otherwise
  // trigger a sign-out + reload loop that boots guests back to the menu.
  signOutTimerHandler = () => {
    const guestInStorage = sessionStorage.getItem(STORAGE_KEY_GUEST) === "true";
    if (authState.isGuest || guestInStorage) {
      log.info(
        COMPONENT_NAME,
        "Session timer fired but user is guest — ignoring"
      );
      return;
    }
    log.info(COMPONENT_NAME, "Session expired, signing out...");
    handleSignOut();
  };
  document.addEventListener("junoSignOutAuthTimer", signOutTimerHandler);

  // Clean up auth timer listener and stale subscribers on Astro page navigation
  document.addEventListener("astro:before-preparation", () => {
    if (signOutTimerHandler) {
      document.removeEventListener("junoSignOutAuthTimer", signOutTimerHandler);
      signOutTimerHandler = null;
    }
    // Clear stale auth change callbacks from previous page components
    authChangeCallbacks = [];
  });

  // Restore guest session if present (initial load sync check)
  const isGuest = sessionStorage.getItem(STORAGE_KEY_GUEST) === "true";
  if (isGuest) {
    log.info(COMPONENT_NAME, "Restoring guest session from storage");
    authState = {
      isAuthenticated: true,
      isGuest: true,
      user: null,
      authMode: "guest",
      principalId: null,
    };
    notifyAuthChange();
  }
}

/**
 * Subscribe to auth state changes.
 * Returns an unsubscribe function.
 */
export function subscribeToAuth(
  callback: (state: AuthState) => void
): () => void {
  authChangeCallbacks.push(callback);
  // Immediately call with current state
  callback(authState);
  return () => {
    authChangeCallbacks = authChangeCallbacks.filter((cb) => cb !== callback);
  };
}

/**
 * Get the current auth state.
 */
export function getAuthState(): AuthState {
  return {...authState};
}

/**
 * Sign in as a guest (anonymous mode).
 * Guest sessions are not persisted to the blockchain.
 */
export async function signInAsGuest(): Promise<void> {
  log.info(COMPONENT_NAME, "Signing in as a Normie");

  // Clear any stale Juno delegation from IndexedDB so getSatelliteConfig()
  // cannot inadvertently return a previous user's identity during guest mode.
  try {
    const idbStorage = new IdbStorage();
    await idbStorage.remove(KEY_STORAGE_KEY);
    await idbStorage.remove(KEY_STORAGE_DELEGATION);
  } catch (err) {
    log.warn(COMPONENT_NAME, "IDB cleanup before guest login failed:", err);
  }
  siwaIdentity = null;

  sessionStorage.setItem(STORAGE_KEY_AUTH_MODE, "guest");
  sessionStorage.setItem(STORAGE_KEY_GUEST, "true");

  authState = {
    isAuthenticated: true,
    isGuest: true,
    user: null,
    authMode: "guest",
    principalId: null,
  };

  notifyAuthChange();
}

/**
 * Register with Internet Identity 2.0.
 * For Internet Identity, registration and sign-in follow the same flow.
 */
export async function registerWithInternetIdentity(): Promise<void> {
  log.info(COMPONENT_NAME, "Registering with Internet Identity");
  return signInWithInternetIdentity();
}

/**
 * Sign in with Internet Identity 2.0.
 * In production, this uses 'id.ai' which supports Internet Identity, Passkeys, and OAuth providers like Google, Apple, Microsoft.
 * In development, this uses the local emulator.
 */
export async function signInWithInternetIdentity(): Promise<void> {
  log.info(COMPONENT_NAME, "Signing in with Internet Identity");

  // Explicitly clear guest state before starting flow
  sessionStorage.setItem(STORAGE_KEY_AUTH_MODE, "internet-identity");
  sessionStorage.removeItem(STORAGE_KEY_GUEST);

  // Reset local state temporarily to avoid "Guest" flicker
  authState.isGuest = false;

  try {
    // Config for Internet Identity
    // In development: identityProvider URL to local emulator
    // In production: domain for id.ai
    const options =
      JUNO_ENVIRONMENT === "development"
        ? {identityProvider: JUNO_INTERNET_IDENTITY}
        : {domain: JUNO_INTERNET_IDENTITY};

    await signIn({
      internet_identity: {
        // @ts-expect-error - Mismatch between build-time environment variables and Juno options
        options,
      },
    });
  } catch (error) {
    // Check if user cancelled the auth flow
    if (error instanceof Error && error.name === "SignInUserInterruptError") {
      log.info(COMPONENT_NAME, "User cancelled Internet Identity sign-in");
      return;
    }
    throw error;
  }
}

/**
 * Sign in with Avalanche Wallet (SIWA).
 *
 * Uses unified wallet connection via AppKit which handles:
 * - Injected wallets (MetaMask, Core, Rabby, etc.)
 * - WalletConnect (QR code, deep links)
 * - Chain validation and switching
 *
 * One method for all wallet types - no more separate flows.
 */
export async function signInWithAvalanche(): Promise<void> {
  log.info(COMPONENT_NAME, "Signing in with Avalanche");

  // Connect wallet via AppKit (opens modal with all options)
  const {address, chainId} = await connectWallet();
  log.debug(COMPONENT_NAME, `Wallet connected: ${address} on chain ${chainId}`);

  // Notify overlay of progress
  const emitProgress = (step: string) =>
    window.dispatchEvent(
      new CustomEvent("tresr:auth-progress", {detail: {step}})
    );

  // Get wallet client for signing
  const walletClient = await getWalletClient();

  // Clear guest state
  sessionStorage.setItem(STORAGE_KEY_AUTH_MODE, "avalanche");
  sessionStorage.removeItem(STORAGE_KEY_GUEST);
  authState.isGuest = false;

  try {
    const siwa = getSiwaClient();

    // Prepare login message
    log.debug(COMPONENT_NAME, "Preparing SIWA login...");
    emitProgress("Preparing sign-in...");
    const prepared = await siwa.prepareLogin(address);

    // Sign the message using the wallet client
    log.debug(COMPONENT_NAME, "Requesting signature...");
    emitProgress("Approve sign-in in your wallet...");
    const signature = await walletClient.signMessage({
      account: address,
      message: prepared.message,
    });

    // Complete SIWA login
    log.debug(COMPONENT_NAME, "Completing SIWA login...");
    emitProgress("Completing sign-in...");
    const result = await siwa.login(signature, address);

    // Store the identity
    siwaIdentity = await siwa.getIdentity();
    if (!siwaIdentity) {
      throw new Error("SIWA login succeeded but identity is null");
    }

    // Bridge SIWA identity to IDB so initSatellite() recognizes the session
    await bridgeSiwaToIdb(siwaIdentity);

    // Use the DelegationIdentity principal — this is the self-authenticating
    // principal the IC sees as caller(), NOT the opaque keccak-derived one
    // from result.principal (which is only for SIWA internal address mapping).
    const principal = siwaIdentity.getPrincipal().toText();
    log.info(COMPONENT_NAME, `SIWA delegation Principal: ${principal}`);
    log.debug(
      COMPONENT_NAME,
      `SIWA canister Principal (unused): ${result.principal.toText()}`
    );

    // Pass identity to Juno
    await initSatellite();

    // Register in Juno's #user system collection so getDoc/setDoc are authorized
    try {
      const existingUser = await getDoc({collection: "#user", key: principal});
      if (!existingUser) {
        await setDoc({
          collection: "#user",
          doc: {
            key: principal,
            data: {provider: "internet_identity"},
          },
        });
        log.debug(COMPONENT_NAME, "Created #user document for SIWA principal");
      }
    } catch (userDocError) {
      log.warn(
        COMPONENT_NAME,
        "Failed to create #user document (non-fatal):",
        userDocError
      );
    }

    authState = {
      isAuthenticated: true,
      isGuest: false,
      user: {key: principal} as unknown as User,
      authMode: "avalanche",
      principalId: principal,
    };

    // Create or update user profile with wallet automatically linked
    // Uses centralized write queue to prevent version races with concurrent
    // notification/music writes that fire on the same auth event.
    try {
      log.debug(COMPONENT_NAME, "Creating/updating profile for SIWA user...");
      emitProgress("Loading profile...");

      await enqueueProfileWrite(principal, (profile) => ({
        ...profile,
        evm_wallet: address,
        wallet: {...profile.wallet, evm_wallet_linked: true},
        login_method: "siwa" as const,
      }));

      // Read back the profile to populate the store
      const savedDoc = await getUserProfile(principal);
      if (savedDoc) {
        profileStore.set(savedDoc.data);
      }
      log.info(COMPONENT_NAME, "Profile created/updated with SIWA wallet link");
    } catch (profileError) {
      // Profile save failure during SIWA login can corrupt the wallet link.
      // Disconnect and fail auth so the user retries cleanly.
      log.error(
        COMPONENT_NAME,
        "Failed to save profile during SIWA login — disconnecting",
        profileError
      );
      await disconnectWallet();
      throw new Error("Failed to link wallet to profile. Please try again.", {
        cause: profileError,
      });
    }

    notifyAuthChange();
    log.info(COMPONENT_NAME, "Avalanche SIWA successful");
  } catch (error: unknown) {
    // Disconnect wallet on auth failure
    await disconnectWallet();

    log.error(COMPONENT_NAME, "Avalanche login failed", error);
    const message = error instanceof Error ? error.message : String(error);

    // Provide user-friendly error messages
    if (message.includes("not found") && message.includes("Canister")) {
      throw new Error(
        "SIWA service unavailable. Check if the IC-SIWA canister is running.",
        {cause: error}
      );
    }
    if (message.includes("IC0301") || message.includes("rejection error")) {
      throw new Error(
        "Unable to connect to SIWA service. Check network connection.",
        {cause: error}
      );
    }
    if (
      message.includes("chainId") &&
      message.includes("not current network")
    ) {
      const targetChainId =
        config.blockchain.avalanche[
          JUNO_ENVIRONMENT === "development"
            ? "anvil"
            : JUNO_ENVIRONMENT === "staging"
              ? "testnet"
              : "mainnet"
        ].chain_id;
      throw new Error(
        `Network mismatch: Please switch to chain ${targetChainId} in your wallet.`,
        {cause: error}
      );
    }
    if (message.includes("Not connected") || message.includes("RPC")) {
      throw new Error("Wallet disconnected. Please try again.", {cause: error});
    }
    if (/reject|cancel|denied|declined/i.test(message)) {
      throw new Error("Signature rejected. Approve SIWA message to login.", {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Register with Avalanche (SIWA).
 * SIWA registration is identical to sign-in.
 */
export async function registerWithAvalanche(): Promise<void> {
  return signInWithAvalanche();
}

/**
 * Sign in with WebAuthn (Passkey).
 * Uses native biometric authentication without redirecting to Internet Identity.
 */
export async function signInWithPasskey(
  sessionTTL?: number,
  onProgress?: (step: string, state: string) => void
): Promise<void> {
  log.info(COMPONENT_NAME, "Signing in with Passkey");

  // Set auth mode
  sessionStorage.setItem(STORAGE_KEY_AUTH_MODE, "internet-identity");
  sessionStorage.removeItem(STORAGE_KEY_GUEST);

  // Reset local state
  authState.isGuest = false;

  try {
    const options = {
      ...(sessionTTL && {maxTimeToLiveInMilliseconds: sessionTTL}),
      ...(onProgress && {
        onProgress: (progress: {state: string}) => {
          onProgress("connecting", progress.state);
        },
      }),
    };
    await signIn({
      webauthn: {
        options,
      },
    });
  } catch (error) {
    // Check if user cancelled the auth flow
    if (error instanceof Error && error.name === "SignInUserInterruptError") {
      log.info(COMPONENT_NAME, "User cancelled Passkey sign-in");
      return;
    }
    throw error;
  }
}

/**
 * Sign up with WebAuthn (Passkey).
 * Creates a new account using native biometric authentication.
 */
export async function signUpWithPasskey(
  nickname: string,
  sessionTTL?: number,
  onProgress?: (step: string, state: string) => void
): Promise<void> {
  log.info(COMPONENT_NAME, "Signing up with Passkey");

  // Set auth mode
  sessionStorage.setItem(STORAGE_KEY_AUTH_MODE, "internet-identity");
  sessionStorage.removeItem(STORAGE_KEY_GUEST);

  // Reset local state
  authState.isGuest = false;

  try {
    const options = {
      passkey: {
        user: {
          displayName: nickname,
        },
      },
      ...(sessionTTL && {maxTimeToLiveInMilliseconds: sessionTTL}),
      ...(onProgress && {
        onProgress: (progress: {state: string}) => {
          onProgress("connecting", progress.state);
        },
      }),
    };
    await signUp({
      webauthn: {
        options,
      },
    });
  } catch (error) {
    // Check if user cancelled the auth flow
    if (error instanceof Error && error.name === "SignInUserInterruptError") {
      log.info(COMPONENT_NAME, "User cancelled Passkey sign-up");
      return;
    }
    throw error;
  }
}

/**
 * Check if WebAuthn (Passkeys) is available on this device.
 */
export async function checkPasskeyAvailability(): Promise<boolean> {
  return await isWebAuthnAvailable();
}

/**
 * Get a display name for the current user.
 */
export function getDisplayName(): string {
  if (authState.isGuest) {
    return "Guest";
  }

  // Try to get nickname from profile store
  const profile = profileStore.get();
  if (profile?.nickname) {
    return profile.nickname;
  }

  if (authState.user) {
    // Truncate principal ID for display
    const principal = authState.user.key;
    if (principal.length > 16) {
      return `${principal.substring(0, 8)}...${principal.substring(principal.length - 4)}`;
    }
    return principal;
  }
  return "Unknown";
}
