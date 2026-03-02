/**
 * Unified Wallet Connection Module
 *
 * Single entry point for all wallet connections using Reown AppKit.
 * Works for both SIWA login and wallet linking flows.
 * Replaces custom EIP-6963 discovery and WalletConnect code.
 */

import {
  getConnection,
  getWalletClient as wagmiGetWalletClient,
  reconnect,
  switchChain,
} from "@wagmi/core";
import type {Config} from "@wagmi/core";
import type {WalletClient} from "viem";
import {
  getWagmiConfig,
  connectWallet as appKitConnectWallet,
  cancelConnectWallet,
  disconnect as appKitDisconnect,
  isConnected as appKitIsConnected,
} from "./appkit";

// Re-export for external callers
export {cancelConnectWallet};
import {config as appConfig} from "../config/client";
import {getEnvironmentKey} from "../config/constants";
import {log} from "../utils/log";

const COMPONENT_NAME = "Connection";

/**
 * Result of a wallet connection.
 */
export interface WalletConnection {
  address: `0x${string}`;
  chainId: number;
}

/**
 * Get the target chain ID based on environment.
 */
function getTargetChainId(): number {
  const envKey = getEnvironmentKey();
  return appConfig.blockchain.avalanche[envKey].chain_id;
}

/**
 * Connect wallet via AppKit modal.
 *
 * This is the SINGLE entry point for all wallet connections.
 * Works for both SIWA login AND wallet linking flows.
 * Opens AppKit modal which shows all available options:
 * - Discovered injected wallets (MetaMask, Core, Rabby, etc.)
 * - WalletConnect QR code
 * - Deep links for mobile
 *
 * @returns Connected address and chain ID
 */
export async function connectWallet(): Promise<WalletConnection> {
  const config = getWagmiConfig();

  // Restore connection from localStorage after full page reload.
  // Astro uses full page navigations (no ViewTransitions), so wagmi's
  // in-memory state is lost between pages. reconnect() is idempotent —
  // it's a no-op if the wallet is already connected.
  await reconnect(config);

  // Check if already connected
  let account = getConnection(config);

  if (!account.isConnected) {
    log.info(COMPONENT_NAME, "Opening AppKit connection modal...");

    // Open AppKit modal - shows all wallet options
    const address = await appKitConnectWallet();

    // Verify connection
    account = getConnection(config);
    if (!account.isConnected || !account.address) {
      throw new Error("Wallet connection cancelled or failed");
    }

    log.info(COMPONENT_NAME, `Connected via AppKit: ${address}`);
  } else {
    log.info(COMPONENT_NAME, `Already connected: ${account.address}`);
  }

  // Ensure correct chain
  const targetChainId = getTargetChainId();

  if (account.chainId !== targetChainId) {
    log.info(
      COMPONENT_NAME,
      `Switching chain from ${account.chainId} to ${targetChainId}...`
    );

    try {
      await switchChain(config, {chainId: targetChainId});
    } catch (switchErr: unknown) {
      const err = switchErr as {code?: number; message?: string};
      const env = getEnvironmentKey();
      const chainLabel =
        env === "anvil"
          ? `Anvil local (Chain ID: ${targetChainId})`
          : env === "testnet"
            ? `Avalanche Fuji testnet (Chain ID: ${targetChainId})`
            : `Avalanche mainnet (Chain ID: ${targetChainId})`;

      // 4902 = chain not added; 4200 = unsupported / RPC unreachable
      // Brave Wallet returns 4200 when it cannot reach a localhost RPC.
      if (err.code === 4902 || err.code === 4200) {
        const hint =
          env === "anvil"
            ? " For local development, manually add the Anvil network " +
              `(Chain ID: ${targetChainId}, RPC: ${appConfig.blockchain.avalanche[env].rpc_urls[0]}) ` +
              "in your wallet settings before connecting."
            : "";
        throw new Error(
          `Please add ${chainLabel} to your wallet and try again.${hint}`,
          {cause: switchErr}
        );
      }
      throw new Error(
        `Failed to switch to ${chainLabel}. Please switch manually in your wallet.`,
        {cause: switchErr}
      );
    }

    // Verify switch was successful
    const updatedAccount = getConnection(config);
    if (updatedAccount.chainId !== targetChainId) {
      throw new Error(
        `Wallet is still on chain ${updatedAccount.chainId}. Please switch to chain ${targetChainId}.`
      );
    }
  }

  log.info(
    COMPONENT_NAME,
    `Wallet connected and validated on chain ${targetChainId}`
  );

  return {
    address: account.address as `0x${string}`,
    chainId: targetChainId,
  };
}

/**
 * Get viem WalletClient for the connected wallet.
 *
 * Uses wagmi's getWalletClient which returns a viem-compatible client.
 * Works with any wallet connected via AppKit (injected or WalletConnect).
 */
export async function getWalletClient(): Promise<WalletClient> {
  const config = getWagmiConfig();

  // Rehydrate connector from localStorage after full page reload.
  // Without this, the connector's transport methods (getChainId, etc.)
  // are missing, causing "connector.getChainId is not a function" errors.
  await reconnect(config);

  const account = getConnection(config);

  if (!account.isConnected || !account.address) {
    throw new Error("No wallet connected. Call connectWallet() first.");
  }

  const client = await wagmiGetWalletClient(config);

  if (!client) {
    throw new Error("Failed to get wallet client");
  }

  return client;
}

/**
 * Check if a wallet is currently connected.
 */
export function isConnected(): boolean {
  return appKitIsConnected();
}

/**
 * Get the connected address without connecting.
 * Returns undefined if not connected.
 */
export function getConnectedAddress(): `0x${string}` | undefined {
  const config = getWagmiConfig();
  const account = getConnection(config);
  return account.isConnected ? (account.address as `0x${string}`) : undefined;
}

/**
 * Disconnect the current wallet session.
 */
export async function disconnectWallet(): Promise<void> {
  log.info(COMPONENT_NAME, "Disconnecting wallet...");
  await appKitDisconnect();
}

/**
 * Get the Wagmi config for direct operations if needed.
 */
export function getConfig(): Config {
  return getWagmiConfig();
}

/**
 * Subscribe to connection state changes.
 *
 * @param callback - Called when connection state changes
 * @returns Unsubscribe function
 */
export function subscribeToConnection(
  callback: (connected: boolean, address?: `0x${string}`) => void
): () => void {
  const config = getWagmiConfig();

  // Initial call with current state
  const account = getConnection(config);
  callback(account.isConnected, account.address as `0x${string}` | undefined);

  // Subscribe to wagmi state changes
  return config.subscribe(
    (state: {status: string}) => state.status,
    () => {
      const acc = getConnection(config);
      callback(acc.isConnected, acc.address as `0x${string}` | undefined);
    }
  );
}
