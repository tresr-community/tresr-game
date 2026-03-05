/**
 * Balance Service
 *
 * Centralized balance queries with optional caching for Avalanche tokens.
 */

import {loadConfigAsync} from "../config";
import {log} from "../utils/log";
import {getEnvironmentKey} from "./networks/chain";
import {getReadClient} from "./tx";
import {ERC20Abi} from "./abi/vault";

const COMPONENT_NAME = "Balance";

// ── RPC availability tracking ──────────────────────────────────────────
// Prevents error spam when the blockchain backend (e.g. anvil) is down.
// After the first connection-level failure, subsequent calls short-circuit
// and return 0n. The flag auto-resets after RPC_REPROBE_MS so the next
// poll naturally re-probes the endpoint without manual intervention.

const RPC_REPROBE_MS = 30_000; // Re-probe RPC every 30s while offline

let rpcAvailable: boolean | null = null; // null = untested
let rpcUnavailableSince = 0;
let rpcUnavailableLoggedOnce = false;

/** Detect errors that indicate the RPC endpoint itself is unreachable. */
function isRpcUnavailableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("ECONNREFUSED") ||
    msg.includes("fetch failed") ||
    msg.includes("Failed to fetch") ||
    msg.includes("Could not connect")
  );
}

/**
 * Detect errors that indicate the contract is not deployed.
 * `returned no data ("0x")` means the RPC is fine but there's no code at
 * the contract address — e.g. anvil is running but contracts haven't been
 * deployed yet. This is NOT an RPC availability issue.
 */
function isContractNotDeployedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('returned no data ("0x")');
}

/** Whether the RPC endpoint is currently believed to be reachable. */
export function isRpcAvailable(): boolean {
  return rpcAvailable !== false;
}

/** Reset the availability flag so the next call re-probes the RPC. */
export function resetRpcAvailability(): void {
  rpcAvailable = null;
  rpcUnavailableSince = 0;
  rpcUnavailableLoggedOnce = false;
}

// Cache configuration
const CACHE_TTL_MS = 60_000; // 60 seconds

interface CachedBalance {
  value: bigint;
  timestamp: number;
}

// Balance cache
const balanceCache = new Map<string, CachedBalance>();

/**
 * Get a cache key for balance lookups.
 */
function getCacheKey(address: string, tokenAddress: string): string {
  return `${address.toLowerCase()}-${tokenAddress.toLowerCase()}`;
}

/**
 * Check if a cached value is still valid.
 */
function isCacheValid(cached: CachedBalance | undefined): boolean {
  if (!cached) return false;
  return Date.now() - cached.timestamp < CACHE_TTL_MS;
}

/**
 * Get TRESR token balance for an address.
 *
 * @param address - Wallet address to query
 * @param useCache - Whether to use cached value if available (default: true)
 * @returns Balance in wei
 */
export async function getTresrBalance(
  address: string,
  useCache = true
): Promise<bigint> {
  const config = await loadConfigAsync();
  const env = getEnvironmentKey();
  const tokenAddress = config.blockchain.avalanche[env].tresr_token_contract;

  return getTokenBalance(address, tokenAddress, useCache);
}

/**
 * Get any ERC20 token balance for an address.
 *
 * @param walletAddress - Wallet address to query
 * @param tokenAddress - Token contract address
 * @param useCache - Whether to use cached value if available (default: true)
 * @returns Balance in wei
 */
export async function getTokenBalance(
  walletAddress: string,
  tokenAddress: string,
  useCache = true
): Promise<bigint> {
  const cacheKey = getCacheKey(walletAddress, tokenAddress);

  // Check cache
  if (useCache) {
    const cached = balanceCache.get(cacheKey);
    if (isCacheValid(cached)) {
      log.debug(COMPONENT_NAME, `Cache hit for ${cacheKey}`);
      return cached!.value;
    }
  }

  // Short-circuit when RPC is known to be down, but allow periodic re-probe
  if (rpcAvailable === false) {
    if (Date.now() - rpcUnavailableSince < RPC_REPROBE_MS) {
      log.debug(COMPONENT_NAME, "RPC unavailable, returning 0n");
      return 0n;
    }
    // Cooldown expired — allow one re-probe attempt
    log.debug(COMPONENT_NAME, "Re-probing RPC availability...");
  }

  // Fetch fresh balance
  try {
    const publicClient = getReadClient();
    const balance = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20Abi,
      functionName: "balanceOf",
      args: [walletAddress as `0x${string}`],
    });

    // RPC is reachable — mark available and update cache
    if (rpcAvailable === false) {
      log.info(COMPONENT_NAME, "Blockchain RPC recovered");
    }
    rpcAvailable = true;
    rpcUnavailableSince = 0;
    rpcUnavailableLoggedOnce = false;
    balanceCache.set(cacheKey, {
      value: balance,
      timestamp: Date.now(),
    });

    log.debug(
      COMPONENT_NAME,
      `Fetched balance for ${walletAddress}: ${balance}`
    );
    return balance;
  } catch (error) {
    if (isRpcUnavailableError(error)) {
      rpcAvailable = false;
      rpcUnavailableSince = Date.now();
      if (!rpcUnavailableLoggedOnce) {
        rpcUnavailableLoggedOnce = true;
        log.info(
          COMPONENT_NAME,
          "Blockchain RPC unreachable — will re-probe automatically"
        );
      }
      return 0n;
    }
    // Contract not deployed — RPC is fine, just no code at the address.
    // Return 0n without marking RPC as down, so other queries still work.
    if (isContractNotDeployedError(error)) {
      // Mark RPC as available since the endpoint responded
      if (rpcAvailable === false) {
        log.info(COMPONENT_NAME, "Blockchain RPC recovered");
      }
      rpcAvailable = true;
      rpcUnavailableSince = 0;
      log.debug(COMPONENT_NAME, "Contract not deployed — returning 0n");
      return 0n;
    }
    // Non-connectivity error — propagate normally
    log.error(
      COMPONENT_NAME,
      `Failed to fetch balance for ${walletAddress}:`,
      error
    );
    throw error;
  }
}

/**
 * Get vault's total TRESR balance.
 *
 * @param useCache - Whether to use cached value if available (default: true)
 * @returns Vault balance in wei
 */
export async function getVaultTresrBalance(useCache = true): Promise<bigint> {
  const config = await loadConfigAsync();
  const env = getEnvironmentKey();
  const vaultAddress = config.blockchain.avalanche[env].vault_contract;
  const tokenAddress = config.blockchain.avalanche[env].tresr_token_contract;

  return getTokenBalance(vaultAddress, tokenAddress, useCache);
}

/**
 * Format a balance for display.
 *
 * @param balance - Balance in wei
 * @param decimals - Token decimals (default: 18)
 * @param maxDecimals - Maximum display decimals (default: 2)
 * @returns Formatted balance string
 */
export function formatBalance(
  balance: bigint,
  decimals = 18,
  maxDecimals = 2
): string {
  const divisor = BigInt(10 ** decimals);
  const whole = balance / divisor;
  const remainder = balance % divisor;

  // Calculate fractional part
  const fractionStr = remainder.toString().padStart(decimals, "0");
  const displayFraction = fractionStr.slice(0, maxDecimals);

  // Remove trailing zeros
  const trimmedFraction = displayFraction.replace(/0+$/, "");

  if (trimmedFraction) {
    return `${whole}.${trimmedFraction}`;
  }
  return whole.toString();
}

/**
 * Parse a formatted balance back to wei.
 *
 * @param balanceStr - Formatted balance string (e.g., "10.5")
 * @param decimals - Token decimals (default: 18)
 * @returns Balance in wei
 */
export function parseBalance(balanceStr: string, decimals = 18): bigint {
  if (!/^\d+(\.\d+)?$/.test(balanceStr)) {
    throw new Error(
      `Invalid balance format: "${balanceStr}". Expected digits with optional single decimal point.`
    );
  }
  const [whole, fraction = ""] = balanceStr.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + paddedFraction);
}

/**
 * Clear the balance cache.
 */
export function clearBalanceCache(): void {
  balanceCache.clear();
  log.debug(COMPONENT_NAME, "Balance cache cleared");
}

/**
 * Clear cached balance for a specific address.
 */
export function clearCachedBalance(
  address: string,
  tokenAddress?: string
): void {
  if (tokenAddress) {
    const cacheKey = getCacheKey(address, tokenAddress);
    balanceCache.delete(cacheKey);
  } else {
    // Clear all entries for this address
    for (const key of balanceCache.keys()) {
      if (key.startsWith(address.toLowerCase())) {
        balanceCache.delete(key);
      }
    }
  }
}
