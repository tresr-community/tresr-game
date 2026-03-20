/**
 * Wallet State Store
 *
 * A Svelte 5 reactive object that mirrors live wallet connection state from
 * wallet/connection.ts. Updated by a single subscribeToConnection()
 * listener wired up in initWalletReconnect() — do not import from
 * connection.ts here to avoid a circular dependency.
 */

export interface WalletState {
  connected: boolean;
  address: `0x${string}` | undefined;
}

export const walletStore = $state<{value: WalletState}>({
  value: {
    connected: false,
    address: undefined,
  },
});
