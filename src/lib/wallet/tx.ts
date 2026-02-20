/**
 * Shared Transaction Helpers
 *
 * Provides DRY, reusable helpers for transaction receipt confirmation and
 * read-only public client access.
 *
 * Uses a direct viem public client constructed from the configured RPC URL,
 * bypassing wagmi's chain-routing layer. This avoids receipt polling issues
 * on Anvil where wagmi's internal chain state may route to the wrong
 * transport or where auto-mine means no new blocks arrive after the tx.
 */

import {createPublicClient, http} from "viem";
import type {TransactionReceipt, PublicClient} from "viem";
import {getTargetChain, getEnvironmentKey} from "./avalanche";
import {config} from "../config/client";
import {log} from "../utils/log";

const COMPONENT_NAME = "Tx";

/**
 * Build a direct viem public client for the configured chain + RPC.
 *
 * This is intentionally NOT wagmi's managed client — it uses `http(rpcUrl)`
 * pointed at the exact RPC from tresr.yaml, so receipt polling always
 * queries the right endpoint regardless of wagmi's internal chain state.
 */
function buildDirectClient(): PublicClient {
  const env = getEnvironmentKey();
  const chainConfig = config.blockchain.avalanche[env];
  const chain = getTargetChain(chainConfig.rpc_urls[0]);

  return createPublicClient({
    chain,
    transport: http(chainConfig.rpc_urls[0]),
  }) as PublicClient;
}

/**
 * Confirm a transaction receipt via direct RPC polling.
 *
 * Creates a viem public client pointed at the configured RPC URL and
 * polls for the receipt there. Uses `confirmations: 0` so it resolves
 * as soon as the receipt exists — critical for Anvil's auto-mine mode
 * where no additional blocks are produced after a transaction.
 *
 * Works across Anvil (instant auto-mine), testnet, and mainnet.
 * Throws if the transaction reverts on-chain or if the timeout elapses.
 *
 * @param hash - Transaction hash to confirm
 * @param options.timeout - Timeout in ms (default: 30 000)
 * @param options.component - Component name for log messages
 * @returns The on-chain transaction receipt
 */
export async function confirmReceipt(
  hash: `0x${string}`,
  options?: {timeout?: number; component?: string}
): Promise<TransactionReceipt> {
  const timeout = options?.timeout ?? 30_000;
  const component = options?.component ?? COMPONENT_NAME;

  log.info(component, "Waiting for receipt:", hash);

  const client = buildDirectClient();
  const receipt = await client.waitForTransactionReceipt({
    hash,
    timeout,
    pollingInterval: 1_000,
    confirmations: 0,
  });

  if (receipt.status !== "success") {
    throw new Error("Transaction reverted on-chain");
  }

  log.info(component, "Confirmed in block", receipt.blockNumber);
  return receipt;
}

/**
 * Get a public client for read-only on-chain operations.
 *
 * Returns a direct viem public client constructed from the configured
 * RPC URL, ensuring reads always go to the correct endpoint.
 *
 * @returns PublicClient configured for the target chain
 */
export function getReadClient(): PublicClient {
  return buildDirectClient();
}
