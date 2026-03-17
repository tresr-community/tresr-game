/**
 * Wallet State Store
 *
 * A nanostore atom that mirrors live wallet connection state from
 * wallet/connection.ts. Updated by a single subscribeToConnection()
 * listener wired up in initWalletReconnect() — do not import from
 * connection.ts here to avoid a circular dependency.
 *
 * Components should subscribe to this store instead of calling
 * subscribeToConnection() directly.
 */

import {atom} from "nanostores";

export interface WalletState {
  connected: boolean;
  address: `0x${string}` | undefined;
}

export const walletStore = atom<WalletState>({
  connected: false,
  address: undefined,
});
