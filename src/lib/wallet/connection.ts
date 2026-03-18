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
import {walletStore} from "./store.svelte";

const COMPONENT_NAME = "Connection";

/**
 * Eagerly warm the wagmi connection during auth init so that when the
 * user clicks "Sign in" the reconnect handshake is already complete and
 * the wallet modal opens instantly.
 *
 * Also wires a single subscribeToConnection() listener to keep walletStore
 * in sync for the lifetime of the page. Components should subscribe to
 * walletStore instead of calling subscribeToConnection() directly.
 *
 * Call this once from the auth module during page load.
 */
export function initWalletReconnect(): void {
  try {
    const config = getWagmiConfig();
    reconnect(config);
    setupLockDetection();

    // One listener for the whole app — keeps walletStore in sync.
    subscribeToConnection((connected, address) => {
      walletStore.value = {connected, address};
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.warn(COMPONENT_NAME, `Failed to initialize wallet reconnect: ${msg}`);
  }
}

/**
 * Returns the currently connected address using live wagmi state (not
 * cached AppKit localStorage state). Returns undefined if no wallet is
 * connected or if the connection is stale.
 *
 * Use this instead of isConnected() when you need the actual address and
 * want to avoid the false-positive that AppKit's cached state can produce.
 */
export function getConnectedAddress(): `0x${string}` | undefined {
  const config = getWagmiConfig();
  const account = getConnection(config);
  return account.isConnected ? (account.address as `0x${string}`) : undefined;
}

/**
 * Safely returns the hydrated connected address, awaiting reconnection if necessary.
 *
 * During page load, wagmi's synchronous state drops but AppKit's localStorage
 * survives. This means \`getConnectedAddress()\` may return undefined while wagmi
 * is still handshaking. This async variant waits for wagmi to settle and then
 * returns the address if genuinely connected (and unlocked), or undefined.
 */
export async function getHydratedAddress(): Promise<`0x${string}` | undefined> {
  const config = getWagmiConfig();

  await reconnect(config).catch(() => {});

  let account = getConnection(config);
  if (!account.isConnected && appKitIsConnected()) {
    log.debug(
      COMPONENT_NAME,
      "AppKit connected but wagmi not yet hydrated (getHydratedAddress) — waiting for reconnect..."
    );
    account = getConnection(config);
  }

  if (account.isConnected) {
    const alive = await probeConnectorLiveness(config);
    if (!alive) {
      return undefined;
    }
    return account.address as `0x${string}`;
  }

  return undefined;
}

/**
 * Set up a listener on the injected provider for the `accountsChanged`
 * event. An empty accounts array means the wallet has auto-locked.
 * When that happens we reset the reconnect singleton so the next
 * connectWallet() call opens a fresh AppKit modal instead of returning
 * stale cached state.
 */
function setupLockDetection(): void {
  const provider = (
    window as {
      ethereum?: {
        on?: (event: string, handler: (accounts: string[]) => void) => void;
      };
    }
  ).ethereum;
  if (!provider?.on) return;

  provider.on("accountsChanged", (accounts: string[]) => {
    if (accounts.length === 0) {
      log.info(COMPONENT_NAME, "Wallet locked — reconnect state reset");
      // Clear the store immediately so components react without waiting
      // for the next wagmi status transition.
      walletStore.value = {connected: false, address: undefined};
      document.dispatchEvent(new CustomEvent("tresr:wallet-locked"));
    }
  });
}

/**
 * Probe whether the currently connected wallet connector is actually live
 * (i.e. not locked/disconnected under the hood).
 *
 * Brave Wallet and MetaMask can auto-lock without emitting a disconnect
 * event, leaving wagmi in a stale "connected" state. A quick getChainId
 * call against the connector surfaces the failure immediately.
 *
 * Returns true if the connector responds within the timeout, false if it
 * throws or times out (indicating the wallet is locked or unavailable).
 */
async function probeConnectorLiveness(
  config: Config,
  timeoutMs = 5_000
): Promise<boolean> {
  const account = getConnection(config);
  if (!account.isConnected || !account.connector) return false;

  // Only probe against the *hydrated* live connector from config.connectors.
  // account.connector is a serialized snapshot from the wagmi store — calling
  // getChainId() on it throws even when the wallet is healthy, because the
  // unhydrated copy lacks the provider binding. If we can't find the live
  // instance, treat as NOT live (can't confirm the wallet is reachable).
  const liveConnector =
    config.connectors.find((c) => c.uid === account.connector?.uid) ||
    account.connector; // Fallback to account.connector if not in connectors array
  if (!liveConnector) return false;

  // Skip the liveness probe for WalletConnect and AppKit.
  // These connectors do not "auto-lock" in the browser like injected extensions
  // (MetaMask, Brave), and pinging them can cause multi-second RPC timeouts that
  // incorrectly flag the wallet as disconnected, forcing a second modal.
  if (liveConnector.id === "walletConnect" || liveConnector.id === "appKit") {
    return true;
  }

  try {
    await Promise.race([
      // getChainId is a lightweight call that requires the wallet to be unlocked.
      // It throws immediately if the extension is locked.
      (liveConnector as {getChainId?: () => Promise<number>}).getChainId?.() ??
        Promise.resolve(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Liveness probe timeout")), timeoutMs)
      ),
    ]);
    return true;
  } catch {
    return false;
  }
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

  // Check if already connected — prefer wagmi truth, fall back to AppKit.
  // In an SPA, wagmi state almost always persists, so we rarely need delays here.
  let account = getConnection(config);
  if (!account.isConnected && appKitIsConnected()) {
    log.debug(
      COMPONENT_NAME,
      "AppKit connected but wagmi not yet hydrated — connecting..."
    );
    await reconnect(config).catch(() => {});
    account = getConnection(config);
  }

  // ── Liveness probe ─────────────────────────────────────────────────────
  // Even when wagmi reports "connected", the wallet extension may have
  // auto-locked in the background (Brave Wallet, MetaMask). A quick
  // getChainId probe surfaces this immediately. If the probe fails we reset
  // the reconnect singleton and treat it as not connected — the AppKit modal
  // will open and ask the user to unlock/reconnect.
  let walletNeedsReconnect = !account.isConnected;
  if (account.isConnected) {
    const alive = await probeConnectorLiveness(config);
    if (!alive) {
      log.info(
        COMPONENT_NAME,
        "Wallet appears locked or unresponsive — requesting reconnect..."
      );
      walletNeedsReconnect = true;
    } else {
      log.info(COMPONENT_NAME, `Already connected: ${account.address}`);
    }
  }

  if (walletNeedsReconnect) {
    log.info(COMPONENT_NAME, "Opening AppKit connection modal...");

    // Open AppKit modal - shows all wallet options
    const address = await appKitConnectWallet();

    // Verify connection
    account = getConnection(config);
    if (!account.isConnected || !account.address) {
      throw new Error("Wallet connection cancelled or failed");
    }

    log.info(COMPONENT_NAME, `Connected via AppKit: ${address}`);
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
 * Get viem WalletClient for the connected wallet.
 *
 * Uses wagmi's getWalletClient which returns a viem-compatible client.
 * Works with any wallet connected via AppKit (injected or WalletConnect).
 */
export async function getWalletClient(): Promise<WalletClient> {
  const config = getWagmiConfig();

  const reconnected = await reconnect(config).catch(() => []);

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

// getConnectedAddress is exported near the top of this module (uses live wagmi state)

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
 * If wagmi is still in the "reconnecting" phase when this is called (e.g.
 * right after login, when the injected wallet extension is completing its
 * async handshake), we defer the initial callback until the status settles.
 * This prevents the faucet button from getting stuck in "Connecting wallet…"
 * even after the wallet is already connected.
 *
 * @param callback - Called when connection state changes
 * @returns Unsubscribe function
 */
export function subscribeToConnection(
  callback: (connected: boolean, address?: `0x${string}`) => void
): () => void {
  const config = getWagmiConfig();
  let disposed = false;

  // Subscribe to wagmi state changes (runs on every status transition)
  const unsub = config.subscribe(
    (state: {status: string}) => state.status,
    () => {
      if (disposed) return;
      const acc = getConnection(config);
      callback(acc.isConnected, acc.address as `0x${string}` | undefined);
    }
  );

  // Fire immediately with current state since SPA doesn't suffer from missing state transitions.
  const account = getConnection(config);
  callback(account.isConnected, account.address as `0x${string}` | undefined);

  return () => {
    disposed = true;
    unsub();
  };
}
