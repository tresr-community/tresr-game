/**
 * Auth State Store
 *
 * A nanostore atom that mirrors the current AuthState from auth/index.ts.
 * Updated by notifyAuthChange() — do not import from auth/index.ts here
 * to avoid a circular dependency.
 *
 * Components should subscribe to this store instead of calling
 * subscribeToAuth() directly.
 */

import {atom} from "nanostores";
import type {AuthState} from "./index";

export const authStore = atom<AuthState>({
  isAuthenticated: false,
  isGuest: false,
  user: null,
  authMode: null,
  principalId: null,
});
