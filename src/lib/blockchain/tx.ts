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

import {createPublicClient, http, fallback} from "viem";
import type {TransactionReceipt, PublicClient} from "viem";
import {getTargetChain, getEnvironmentKey} from "./networks/chain";
import {config} from "../config/client";
import type {ConfigTypes} from "@/types/config";
import {log} from "../utils/log";

const COMPONENT_NAME = "Tx";

// Module-scoped cache for the PublicClient
let cachedClient: PublicClient | null = null;
let cachedEnv: string | null = null;

/**
 * Build a direct viem public client for the configured chain + RPC.
 *
 * This is intentionally NOT wagmi's managed client — it uses `http(rpcUrl)`
 * pointed at the exact RPC from tresr.yaml, so receipt polling always
 * queries the right endpoint regardless of wagmi's internal chain state.
 *
 * The client is cached to prevent leaking connections/memory on repeated calls.
 */
function buildDirectClient(): PublicClient {
  const env = getEnvironmentKey();

  if (cachedClient && cachedEnv === env) {
    return cachedClient;
  }

  const chainConfig =
    config.blockchain.avalanche[
      env as keyof ConfigTypes["blockchain"]["avalanche"]
    ];
  const chain = getTargetChain(chainConfig.rpc_urls[0]);

  const transports = chainConfig.rpc_urls.map((url: string) => http(url));

  cachedClient = createPublicClient({
    chain,
    transport: fallback(transports),
  }) as unknown as PublicClient;
  cachedEnv = env;

  return cachedClient;
}

/**
 * Confirm a transaction receipt with per-confirmation progress reporting.
 *
 * On testnet (Fuji) we wait for 2 confirmations so all EVM RPC providers
 * used by the satellite (DFINITY EVM RPC canister) have time to index the
 * block before we submit to Juno. One confirmation is often enough for the
 * browser's single RPC but other providers can lag 5–15 s.
 *
 * Pass `confirmations: 1` for prerequisite transactions (e.g. ERC20 approve)
 * that don't need satellite-level propagation — this skips both the extra
 * block wait and the 5 s RPC propagation buffer, saving ~10 s per flow.
 *
 * @param onConfirmation - Optional callback invoked after each new confirmation.
 *   Receives (current, total) e.g. (1, 2).
 */
export async function confirmReceipt(
  hash: `0x${string}`,
  options?: {
    timeout?: number;
    component?: string;
    /** Override the default env-based confirmation count. Use 1 for prerequisite
     *  txs (e.g. ERC20 approve) that don't require satellite RPC propagation. */
    confirmations?: number;
    onConfirmation?: (current: number, total: number) => void;
  }
): Promise<TransactionReceipt> {
  if (!config.wallet.tx_timeout_ms) {
    throw new Error("Missing required config value: wallet.tx_timeout_ms");
  }
  const timeout = options?.timeout ?? config.wallet.tx_timeout_ms;
  const component = options?.component ?? COMPONENT_NAME;

  const env = getEnvironmentKey();
  // Default: 0 for Anvil (auto-mine), 2 for Testnet/Mainnet (satellite needs it).
  // Callers can override with confirmations: 1 for prerequisite txs (e.g. ERC20
  // approve) that don't need satellite-level propagation — saves ~10 s per flow.
  const defaultConfirmations = env === "anvil" ? 0 : 2;
  const totalConfirmations = options?.confirmations ?? defaultConfirmations;
  // Only add the RPC propagation buffer when we're doing the full satellite-
  // verified flow (2+ confirmations). For fast-path approval txs it's wasted time.
  const needsPropagationDelay = totalConfirmations >= 2;

  log.info(
    component,
    `Waiting for receipt (${totalConfirmations} confirmations):`,
    hash
  );

  const client = buildDirectClient();

  // Anvil is auto-mine, so we can skip the confirmation wait.
  if (totalConfirmations <= 1) {
    // Fast path for local/single-confirmation environments
    const receipt = await client.waitForTransactionReceipt({
      hash,
      timeout,
      pollingInterval: 100,
      confirmations: totalConfirmations,
    });
    if (receipt.status !== "success") {
      throw new Error("Transaction reverted on-chain");
    }
    log.info(component, "Confirmed in block", receipt.blockNumber);
    return receipt;
  }

  // Multi-confirmation path: poll block-by-block so we can fire progress callbacks.
  // We first get the initial receipt (1 confirmation), then wait for each
  // subsequent block to arrive.
  const receipt = await client.waitForTransactionReceipt({
    hash,
    timeout,
    pollingInterval: 500,
    confirmations: 1,
  });

  if (receipt.status !== "success") {
    throw new Error("Transaction reverted on-chain");
  }

  options?.onConfirmation?.(1, totalConfirmations);
  log.info(
    component,
    `Confirmation 1/${totalConfirmations} (block ${receipt.blockNumber})`
  );

  const confirmedBlock = receipt.blockNumber;

  // Poll block number until we've seen each subsequent confirmation.
  // Using getBlockNumber() avoids the `waitForBlock` API that isn't
  // available on the cast PublicClient type.
  for (let c = 2; c <= totalConfirmations; c++) {
    const targetBlock = confirmedBlock + BigInt(c - 1);
    // Busy-ish poll: check every 2 s until the required block has been mined.
    while (true) {
      const currentBlock = await client.getBlockNumber();
      if (currentBlock >= targetBlock) break;
      await new Promise((r) => setTimeout(r, 2_000));
    }
    options?.onConfirmation?.(c, totalConfirmations);
    log.info(
      component,
      `Confirmation ${c}/${totalConfirmations} (block ${targetBlock})`
    );
  }

  // Extra propagation buffer: give lagging RPC nodes time to index the block
  // before the satellite queries them via the EVM RPC canister.
  // Skip for fast-path flows (confirmations: 1) — not needed for txs the
  // satellite doesn't verify (e.g. ERC20 approve).
  if (needsPropagationDelay) {
    const propagationDelayMs = 5_000;
    log.info(
      component,
      `Waiting ${propagationDelayMs}ms for RPC propagation before satellite query…`
    );
    await new Promise((r) => setTimeout(r, propagationDelayMs));
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
