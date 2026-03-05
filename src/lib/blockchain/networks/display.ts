/**
 * Display utilities for Avalanche wallet data.
 *
 * Pure functions — no async, no external dependencies beyond config.
 * Safe to import in any context (UI components, server-side, etc.).
 */

import {getEnvironmentKey} from "../../config/constants";
import {config} from "../../config/client";

/**
 * Build a block explorer URL for a transaction hash.
 *
 * Reads `explorer_url` from the per-environment config (tresr.yaml).
 * Falls back to Snowtrace mainnet if the config entry is missing.
 *
 * @param txHash - Transaction hash (0x...)
 * @returns Full explorer URL for the transaction
 */
export function getExplorerUrl(txHash: string): string {
  const env = getEnvironmentKey();
  const explorerBase = config.blockchain.avalanche[env]?.explorer_url;
  if (!explorerBase) {
    throw new Error(
      `Missing explorer_url in config for environment "${env}". Check tresr.yaml.`
    );
  }
  return `${explorerBase}${txHash}`;
}

/**
 * Shorten an address for display.
 *
 * @param address - Full address
 * @returns Shortened address (e.g., "0x1234...5678")
 */
export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
