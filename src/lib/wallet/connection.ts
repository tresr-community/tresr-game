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

// ── Singleton reconnect ───────────────────────────────────────────────────
// wagmi's reconnect() iterates stored connectors and performs async
// handshakes with injected wallets and WalletConnect relay servers.
// Calling it on every user click blocks the modal from opening for up to
// 15 s on testnet.  Instead we fire it once per page-load and share the
// resulting promise across all callers.
let _reconnectPromise: Promise<unknown> | null = null;

function ensureReconnected(config: Config): Promise<unknown> {
  if (!_reconnectPromise) {
    _reconnectPromise = reconnect(config).catch(() => {
      // Allow retry on next call if the first attempt failed
      _reconnectPromise = null;
    });
  }
  return _reconnectPromise;
}

/**
 * Eagerly warm the wagmi connection during auth init so that when the
 * user clicks "Sign in" the reconnect handshake is already complete and
 * the wallet modal opens instantly.
 *
 * Call this once from the auth module during page load.
 */
export function initWalletReconnect(): void {
  const config = getWagmiConfig();
  void ensureReconnected(config);
}

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
  // in-memory state is lost between pages. ensureReconnected() is a singleton
  // — the first call fires the handshake; every subsequent call returns the
  // already-resolved promise instantly, eliminating per-click delay.
  await ensureReconnected(config);

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
      const activeConnector =
        config.connectors.find((c) => c.uid === account.connector?.uid) ||
        account.connector;
      await switchChain(config, {
        chainId: targetChainId,
        connector: activeConnector,
      });
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
 * Wait for wagmi to leave the "reconnecting" state.
 *
 * After `reconnect()` is called, injected wallets (e.g. Brave Wallet) go
 * through an async handshake. During this window wagmi's status is
 * "reconnecting" and most connector methods are unavailable — any call to
 * getWalletClient will throw "Connector unavailable while reconnecting".
 *
 * This helper subscribes to the wagmi state store and resolves once the
 * status reaches "connected" or "disconnected". It times out after
 * `timeoutMs` ms to avoid hanging indefinitely if reconnection stalls.
 */
async function waitForReconnect(
  config: Config,
  timeoutMs = 5_000
): Promise<void> {
  const currentStatus = (config.state as {status?: string}).status;
  if (currentStatus !== "reconnecting") return;

  return new Promise<void>((resolve) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsub();
      // Resolve rather than reject — let the caller try anyway; it may
      // succeed if the connector restored just-in-time, or fail with a
      // clearer downstream error.
      resolve();
    }, timeoutMs);

    const unsub = config.subscribe(
      (state: {status?: string}) => state.status,
      (status) => {
        if (settled) return;
        if (status !== "reconnecting") {
          settled = true;
          clearTimeout(timeoutId);
          unsub();
          resolve();
        }
      }
    );
  });
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
  //
  // IMPORTANT: We capture the reconnect result to extract the live connector
  // object. Passing it explicitly to getWalletClient bypasses wagmi's fallback
  // to the serialized (un-hydrated) connector from its internal state store.
  const reconnected = (await ensureReconnected(config)) as Awaited<
    ReturnType<typeof reconnect>
  >;

  // Wait for the reconnection handshake to finish before touching the
  // connector. Injected wallets (Brave, MetaMask) initialise asynchronously;
  // during this window wagmi status is "reconnecting" and calling
  // getWalletClient throws "Connector unavailable while reconnecting".
  await waitForReconnect(config);

  const account = getConnection(config);

  if (!account.isConnected || !account.address) {
    throw new Error("No wallet connected. Call connectWallet() first.");
  }

  // Use the live connector from reconnect if available, or fall back to
  // searching the config.connectors array which holds the hydrated class
  // instances. Avoids "connector.getChainId is not a function" error.
  const liveConnector =
    reconnected[0]?.connector ||
    config.connectors.find((c) => c.uid === account.connector?.uid) ||
    account.connector;
  const client = liveConnector
    ? await wagmiGetWalletClient(config, {connector: liveConnector})
    : await wagmiGetWalletClient(config);

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
