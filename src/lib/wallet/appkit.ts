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
      default: {http: [chainConfig.rpc_url]},
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

  // Create Wagmi adapter
  wagmiAdapterInstance = new WagmiAdapter({
    projectId: WALLETCONNECT_PROJECT_ID,
    networks,
  });

  // Application metadata
  const metadata = {
    name: "TRESR Game",
    description: "Decentralized treasure hunting game on Avalanche",
    url:
      typeof window !== "undefined"
        ? window.location.origin
        : "https://tresr.game",
    icons: [
      typeof window !== "undefined"
        ? `${window.location.origin}/favicon.ico`
        : "https://tresr.game/favicon.ico",
    ],
  };

  // Create AppKit instance
  // Type assertion needed: WagmiAdapter is compatible but types drift between versions
  appKitInstance = createAppKit({
    adapters: [wagmiAdapterInstance as unknown as object],
    networks,
    defaultNetwork: targetNetwork,
    projectId: WALLETCONNECT_PROJECT_ID,
    metadata,
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

/**
 * Wait for the user to connect a wallet.
 *
 * Opens the modal and returns a promise that resolves when connected
 * or rejects if the user cancels.
 */
export function connectWallet(): Promise<string> {
  return new Promise((resolve, reject) => {
    const appKit = getAppKit();

    // Timeout after 5 minutes — always reject to avoid hanging forever
    const timeoutId = setTimeout(
      () => {
        unsubscribe();
        reject(new Error("Connection timeout"));
      },
      5 * 60 * 1000
    );

    // Subscribe to events to detect connection
    const unsubscribe = appKit.subscribeEvents((event) => {
      log.debug(COMPONENT_NAME, "Connection event:", event);

      if (event.data.event === "CONNECT_SUCCESS") {
        clearTimeout(timeoutId);
        unsubscribe();
        const address = appKit.getAddressByChainNamespace("eip155");
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
        clearTimeout(timeoutId);
        unsubscribe();
        if (address) {
          log.info(COMPONENT_NAME, `Connected: ${address}`);
          resolve(address);
        } else {
          reject(new Error("Wallet modal closed without connecting"));
        }
      }
    });

    // Open the modal
    appKit.open().catch((err) => {
      clearTimeout(timeoutId);
      unsubscribe();
      reject(err);
    });
  });
}
