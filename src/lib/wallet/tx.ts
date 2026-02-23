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
 * polls for the receipt there. Uses environment-aware confirmation counts:
 * 0 for local/anvil, 1 for testnet/Fuji, and 2 for production/Mainnet.
 * Resolving with 0 confirmations is critical for Anvil's auto-mine mode
 * where no additional blocks are produced after a transaction.
 *
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

  const env = getEnvironmentKey();
  let confirmations = 0; // default for development/anvil
  if (env === "testnet") {
    confirmations = 1;
  } else if (env === "mainnet") {
    confirmations = 2;
  }

  log.info(
    component,
    `Waiting for receipt (${confirmations} confirmations):`,
    hash
  );

  const client = buildDirectClient();
  const receipt = await client.waitForTransactionReceipt({
    hash,
    timeout,
    pollingInterval: 1_000,
    confirmations,
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
