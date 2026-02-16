/**
 * Balance Service
 *
 * Centralized balance queries with optional caching for Avalanche tokens.
 */

import {loadConfigAsync} from "../config";
import {log} from "../utils/log";
import {getEnvironmentKey} from "./avalanche";
import {getReadClient} from "./tx";
import {ERC20Abi} from "./VaultAbi";

const COMPONENT_NAME = "Balance";

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

  // Fetch fresh balance
  try {
    const publicClient = getReadClient();
    const balance = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20Abi,
      functionName: "balanceOf",
      args: [walletAddress as `0x${string}`],
    });

    // Update cache
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
