/**
 * Auth State Store
 *
 * A Svelte 5 reactive object that mirrors the current AuthState from auth/index.ts.
 * Updated by notifyAuthChange() — do not import from auth/index.ts here
 * to avoid a circular dependency.
 */

import type {User} from "@junobuild/core";

export type AuthMode = "guest" | "internet-identity" | "avalanche";

export interface AuthState {
  isAuthenticated: boolean;
  isGuest: boolean;
  user: User | null;
  authMode: AuthMode | null;
  principalId: string | null;
}

export const authStore = $state<{value: AuthState}>({
  value: {
    isAuthenticated: false,
    isGuest: false,
    user: null,
    authMode: null,
    principalId: null,
  },
});
