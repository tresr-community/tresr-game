/**
 * Reown AppKit Configuration
 *
 * This module initializes Reown AppKit with Wagmi adapter for WalletConnect support.
 * AppKit provides a modal for connecting wallets via QR code, deep links, and injected providers.
 *
 * Documentation: https://docs.reown.com/appkit/javascript/core/installation
 */

import {createAppKit, type AppKit} from "@reown/appkit";
import {WagmiAdapter} from "@reown/appkit-adapter-wagmi";
import {defineChain} from "@reown/appkit/networks";
import {http, fallback} from "viem";
import type {Config} from "@wagmi/core";
import {config} from "../config/client";
import {getEnvironmentKey} from "../config/constants";
import {trackWalletConnect, trackWalletDisconnect} from "../metrics/analytics";
import {log} from "../utils/log";

const COMPONENT_NAME = "AppKit";

// WalletConnect Cloud Project ID (set via secretspec)
const WALLETCONNECT_PROJECT_ID = import.meta.env
  .PUBLIC_WALLETCONNECT_PROJECT_ID;

// Singleton instances
let appKitInstance: AppKit | null = null;
let wagmiAdapterInstance: WagmiAdapter | null = null;

/**
 * Build the target network from config using defineChain.
 */
function getTargetNetwork() {
  const env = getEnvironmentKey();
  const chainConfig = config.blockchain.avalanche[env];

  return defineChain({
    id: chainConfig.chain_id,
    caipNetworkId: `eip155:${chainConfig.chain_id}`,
    chainNamespace: "eip155",
    name:
      env === "anvil"
        ? "Anvil (Local)"
        : env === "testnet"
          ? "Avalanche Fuji"
          : "Avalanche",
    nativeCurrency: {
      decimals: 18,
      name: "Avalanche",
      symbol: "AVAX",
    },
    rpcUrls: {
      default: {http: [...chainConfig.rpc_urls]},
    },
  });
}

/**
 * Initialize and get the AppKit instance.
 *
 * This creates a singleton AppKit instance with Wagmi adapter configured
 * for Avalanche networks. The modal can be opened programmatically.
 */
export function getAppKit(): AppKit {
  if (appKitInstance) {
    return appKitInstance;
  }

  if (!WALLETCONNECT_PROJECT_ID) {
    throw new Error(
      "WalletConnect Project ID not configured. Set PUBLIC_WALLETCONNECT_PROJECT_ID via secretspec."
    );
  }

  const targetNetwork = getTargetNetwork();
  const networks = [targetNetwork] as [typeof targetNetwork];

  log.info(COMPONENT_NAME, `Initializing for chain ${targetNetwork.id}...`);

  const env = getEnvironmentKey();
  const chainConfig = config.blockchain.avalanche[env];

  // Create Wagmi adapter
  wagmiAdapterInstance = new WagmiAdapter({
    projectId: WALLETCONNECT_PROJECT_ID,
    networks,
    transports: {
      [targetNetwork.id]: fallback(
        chainConfig.rpc_urls.map((url) => http(url))
      ),
    },
  });

  // Application metadata — URL must come from per-environment blockchain config
  // so that WalletConnect metadata.url matches the actual page origin.
  const appUrl = chainConfig.url;
  if (!appUrl) {
    throw new Error(
      `Missing blockchain.avalanche.${env}.url in config. ` +
        "Each environment must specify its dApp URL for WalletConnect metadata."
    );
  }

  if (!config.app.name) {
    throw new Error("Missing required config value: app.name");
  }
  if (!config.app.description) {
    throw new Error("Missing required config value: app.description");
  }

  const metadata = {
    name: config.app.name,
    description: config.app.description,
    url: appUrl,
    icons: [`${appUrl}/favicon.ico`],
  };

  // Create AppKit instance
  // Type assertion needed: WagmiAdapter is compatible but types drift between versions
  appKitInstance = createAppKit({
    adapters: [wagmiAdapterInstance as unknown as object],
    networks,
    defaultNetwork: targetNetwork,
    projectId: WALLETCONNECT_PROJECT_ID,
    metadata,
    // Render modal fullscreen on mobile devices (landscape-friendly)
    enableMobileFullScreen: true,
    features: {
      analytics: true,
      // Disable email/social login - we only want wallet connections
      email: false,
      socials: [],
    },
    themeMode: "dark",
    themeVariables: {
      "--w3m-z-index": 99999,
    },
  });

  log.info(COMPONENT_NAME, "Initialized successfully");

  // Remove unused font preload links injected by Reown SDK (suppresses
  // "preloaded but not used" console warnings for KHTeka-Medium.woff2) // cspell:disable-line
  if (typeof document !== "undefined") {
    document
      .querySelectorAll('link[rel="preload"][href*="fonts.reown.com"]')
      .forEach((el) => el.remove());
  }

  return appKitInstance;
}

/**
 * Get the Wagmi adapter instance.
 * Must call getAppKit() first to initialize.
 */
export function getWagmiAdapter(): WagmiAdapter {
  if (!wagmiAdapterInstance) {
    getAppKit(); // Initialize if not already done
  }
  return wagmiAdapterInstance!;
}

/**
 * Get the Wagmi config from the adapter.
 * Useful for direct wagmi/viem operations.
 */
export function getWagmiConfig(): Config {
  const adapter = getWagmiAdapter();
  return adapter.wagmiConfig;
}

/**
 * Open the AppKit connect modal.
 *
 * This displays the WalletConnect QR code modal and handles
 * connection with various wallets (mobile, browser extension, etc.)
 */
export async function openConnectModal(): Promise<void> {
  const appKit = getAppKit();
  log.info(COMPONENT_NAME, "Opening connect modal...");
  await appKit.open();
}

/**
 * Open the AppKit modal to a specific view.
 */
export async function openModal(
  view?: "Connect" | "Networks" | "Account"
): Promise<void> {
  const appKit = getAppKit();
  if (view) {
    await appKit.open({view});
  } else {
    await appKit.open();
  }
}

/**
 * Close the AppKit modal.
 */
export async function closeModal(): Promise<void> {
  const appKit = getAppKit();
  await appKit.close();
}

/**
 * Get the currently connected address.
 * Returns undefined if not connected.
 */
export function getConnectedAddress(): string | undefined {
  const appKit = getAppKit();
  return appKit.getAddressByChainNamespace("eip155");
}

/**
 * Check if a wallet is currently connected.
 */
export function isConnected(): boolean {
  const appKit = getAppKit();
  return appKit.getIsConnectedState();
}

/**
 * Disconnect the current wallet session.
 */
export async function disconnect(): Promise<void> {
  const appKit = getAppKit();
  log.info(COMPONENT_NAME, "Disconnecting...");
  await appKit.disconnect();
  trackWalletDisconnect();
}

/**
 * Subscribe to connection state changes.
 *
 * @param callback - Function called when connection state changes
 * @returns Unsubscribe function
 */
export function subscribeToState(
  callback: (state: {isConnected: boolean; address?: string}) => void
): () => void {
  const appKit = getAppKit();

  return appKit.subscribeState((state) => {
    const address = appKit.getAddressByChainNamespace("eip155");
    callback({
      isConnected: state.open === false && !!address,
      address,
    });
  });
}

/**
 * Subscribe to provider events.
 * Useful for detecting when user connects/disconnects.
 */
export function subscribeToProvider(
  callback: (event: {type: string; data?: unknown}) => void
): () => void {
  const appKit = getAppKit();

  return appKit.subscribeEvents((event) => {
    log.debug(COMPONENT_NAME, "Event:", event);
    callback({
      type: event.data.event,
      data: (event.data as Record<string, unknown>).properties,
    });
  });
}

// Track the active connection attempt for external cancellation.
// Only one connection attempt can be active at a time.
let pendingConnect: {
  timeoutId: ReturnType<typeof setTimeout>;
  unsubscribe: () => void;
  reject: (reason: Error) => void;
  navigationCleanup: (() => void) | null;
} | null = null;

/**
 * Cancel any pending connectWallet() attempt.
 *
 * Clears the timeout, unsubscribes from AppKit events, removes the
 * navigation listener, and rejects the pending Promise.
 * Safe to call even if no connection is pending (no-op).
 */
export function cancelConnectWallet(): void {
  if (!pendingConnect) return;
  const {timeoutId, unsubscribe, reject, navigationCleanup} = pendingConnect;
  pendingConnect = null;
  clearTimeout(timeoutId);
  unsubscribe();
  if (navigationCleanup) navigationCleanup();
  reject(new Error("Connection cancelled"));
}

/**
 * Clear the pendingConnect tracker without rejecting.
 * Used internally when the Promise resolves or rejects normally.
 */
function clearPendingConnect(): void {
  if (!pendingConnect) return;
  const {timeoutId, unsubscribe, navigationCleanup} = pendingConnect;
  pendingConnect = null;
  clearTimeout(timeoutId);
  unsubscribe();
  if (navigationCleanup) navigationCleanup();
}

/**
 * Wait for the user to connect a wallet.
 *
 * Opens the modal and returns a promise that resolves when connected
 * or rejects if the user cancels or navigates away.
 */
export function connectWallet(): Promise<string> {
  // Cancel any previous pending attempt
  cancelConnectWallet();

  return new Promise((resolve, reject) => {
    const appKit = getAppKit();

    // Timeout — always reject to avoid hanging forever
    if (!config.wallet?.connect_timeout_ms) {
      throw new Error(
        "Missing required config value: wallet.connect_timeout_ms"
      );
    }
    const timeoutMs = config.wallet.connect_timeout_ms;
    const timeoutId = setTimeout(() => {
      clearPendingConnect();
      reject(new Error("Connection timeout"));
    }, timeoutMs);

    // Subscribe to events to detect connection
    const unsubscribe = appKit.subscribeEvents((event) => {
      log.debug(COMPONENT_NAME, "Connection event:", event);

      if (event.data.event === "CONNECT_SUCCESS") {
        const address = appKit.getAddressByChainNamespace("eip155");
        clearPendingConnect();
        if (address) {
          log.info(COMPONENT_NAME, `Connected: ${address}`);
          trackWalletConnect(address);
          resolve(address);
        } else {
          reject(new Error("Connected but no address available"));
        }
      } else if (event.data.event === "MODAL_CLOSE") {
        // Check if we're connected after modal closes
        const address = appKit.getAddressByChainNamespace("eip155");
        clearPendingConnect();
        if (address) {
          log.info(COMPONENT_NAME, `Connected: ${address}`);
          resolve(address);
        } else {
          reject(new Error("Wallet modal closed without connecting"));
        }
      }
    });

    // Register self-cleaning navigation listener so Astro page transitions
    // automatically cancel the pending connection attempt.
    let navigationCleanup: (() => void) | null = null;
    if (typeof document !== "undefined") {
      const onNavigate = () => cancelConnectWallet();
      document.addEventListener("astro:before-preparation", onNavigate, {
        once: true,
      });
      navigationCleanup = () =>
        document.removeEventListener("astro:before-preparation", onNavigate);
    }

    // Store handles for external cancellation
    pendingConnect = {timeoutId, unsubscribe, reject, navigationCleanup};

    // Open the modal
    appKit.open().catch((err) => {
      clearPendingConnect();
      reject(err);
    });
  });
}
