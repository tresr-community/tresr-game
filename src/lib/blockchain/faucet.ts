/**
 * Faucet Contract Interactions
 *
 * Functions for claiming free test tokens from the TresrFaucet contract.
 * Only available in non-production environments.
 */

import {encodeFunctionData} from "viem";
import type {ConfigTypes} from "@/types/config";
import {loadConfigAsync} from "../config";
import {log} from "../utils/log";
import {FaucetAbi} from "./abi/faucet";
import {getWalletClient} from "../wallet/connection";
import {getTargetChain, getEnvironmentKey} from "./networks/chain";
import {getReadClient} from "./tx";

const COMPONENT_NAME = "Faucet";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type AvalancheEnvConfig =
  ConfigTypes["blockchain"]["avalanche"][keyof ConfigTypes["blockchain"]["avalanche"]];

/**
 * Check whether the faucet contract is deployed for the current environment.
 * Returns false when faucet_contract is missing or the zero address.
 */
export function isFaucetDeployed(cfg: ConfigTypes): boolean {
  const env =
    getEnvironmentKey() as keyof ConfigTypes["blockchain"]["avalanche"];
  const chainConfig = cfg.blockchain.avalanche[env];
  const addr = (chainConfig as Record<string, unknown>)?.faucet_contract as
    | string
    | undefined;
  return !!addr && addr !== ZERO_ADDRESS;
}

/**
 * Verify a submitted transaction actually exists on-chain.
 *
 * After `writeContract()` returns a hash the wallet extension may have created
 * a local "pending" hash without broadcasting to the node (e.g. MetaMask on
 * Anvil silently drops the tx due to fee estimation or nonce conflicts).
 * Polling `waitForTransactionReceipt` for 30 s on a ghost hash wastes time and
 * produces a cryptic timeout error.
 *
 * This helper retries `getTransaction(hash)` up to `maxAttempts` times at
 * `intervalMs` intervals. If the tx never appears it throws a descriptive,
 * user-actionable error immediately so the caller can surface a clear warning
 * instead of waiting for the full receipt timeout.
 *
 * @param getTransaction - Bound `getTransaction` from a viem client
 * @param hash           - The transaction hash returned by `writeContract`
 * @param maxAttempts    - Maximum polling attempts (default: 10 → ~1 s at 100 ms)
 * @param intervalMs     - Delay between attempts in ms (default: 100)
 */
async function verifyTxExists(
  getTransaction: (args: {hash: `0x${string}`}) => Promise<unknown>,
  hash: `0x${string}`,
  maxAttempts = 10,
  intervalMs = 100
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const tx = await getTransaction({hash}).catch(() => null);
    if (tx) return; // found — proceed to waitForTransactionReceipt
    await new Promise<void>((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    "Transaction was not broadcast to the network. " +
      "Your wallet may have rejected it — check your wallet activity and try again."
  );
}

/**
 * Claim tokens from the faucet.
 *
 * Receipt confirmation strategy:
 *  A) Extend the wallet client with publicActions so that gas estimation,
 *     getTransaction, and waitForTransactionReceipt all share the SAME provider
 *     transport that submitted the tx. This avoids the "two clients / ghost hash"
 *     receipt-timeout on Anvil where a separate buildDirectClient() polls a
 *     different connection that never saw the tx.
 *  B) Run a fast verifyTxExists check (~1 s) before the long polling loop so
 *     that a ghost hash surfaces a user-actionable error immediately instead of
 *     waiting the full tx_timeout_ms (default 30 s).
 *
 * @returns Transaction hash
 */
export async function claimFaucet(): Promise<`0x${string}`> {
  const walletClient = await getWalletClient();
  const accounts = await walletClient.getAddresses();
  if (accounts.length === 0) {
    throw new Error(
      "No wallet accounts found. Please connect your wallet and try again."
    );
  }
  const config = await loadConfigAsync();
  const env = getEnvironmentKey();
  const chainConfig = config.blockchain.avalanche[env];
  const chain = getTargetChain(chainConfig.rpc_urls[0]);

  const faucetAddress = (
    chainConfig as AvalancheEnvConfig & {faucet_contract?: string}
  ).faucet_contract as `0x${string}` | undefined;
  if (!faucetAddress || faucetAddress === ZERO_ADDRESS) {
    throw new Error("Faucet contract is not deployed for this environment.");
  }

  // Option A: extend wallet client with publicActions so that gas estimation,
  // getTransaction, and waitForTransactionReceipt all share the same provider
  // transport as writeContract — avoids ghost-hash receipt timeout on Anvil.
  const {publicActions} = await import("viem");
  const extendedClient = walletClient.extend(publicActions);

  log.info(COMPONENT_NAME, "Claiming tokens from faucet...");

  const dripData = encodeFunctionData({
    abi: FaucetAbi,
    functionName: "drip",
  });

  const dripGas = await extendedClient.estimateGas({
    account: accounts[0],
    to: faucetAddress,
    data: dripData,
  });

  const hash = await extendedClient.writeContract({
    account: accounts[0],
    address: faucetAddress,
    abi: FaucetAbi,
    functionName: "drip",
    chain,
    gas: dripGas,
  });

  log.info(COMPONENT_NAME, "Faucet claim tx:", hash);

  // verifyTxExists: only on Anvil where ghost-hashes (silently dropped txs
  // from wallet extensions) are a known issue. On testnet/mainnet MetaMask
  // throws immediately if it can’t broadcast, so the check is unnecessary
  // overhead and risks hitting a different RPC endpoint.
  if (env === "anvil") {
    await verifyTxExists((args) => extendedClient.getTransaction(args), hash);
  }

  log.info(COMPONENT_NAME, `Waiting for receipt (1 confirmation): ${hash}`);

  const receipt = await extendedClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    pollingInterval: 500,
    timeout: config.wallet.tx_timeout_ms,
  });

  if (receipt.status !== "success") {
    throw new Error("Transaction reverted on-chain");
  }

  log.info(COMPONENT_NAME, "Confirmed in block", receipt.blockNumber);

  return hash;
}

/**
 * Get the faucet drip amount per claim.
 *
 * @returns Drip amount in wei
 */
export async function getFaucetDripAmount(): Promise<bigint> {
  const cfg = await loadConfigAsync();
  const env = getEnvironmentKey();
  const chainConfig = cfg.blockchain.avalanche[env];
  const faucetAddress = (
    chainConfig as AvalancheEnvConfig & {faucet_contract?: string}
  ).faucet_contract as `0x${string}` | undefined;
  if (!faucetAddress || faucetAddress === ZERO_ADDRESS) {
    throw new Error("Faucet contract is not deployed for this environment.");
  }

  const publicClient = getReadClient();

  return await publicClient.readContract({
    address: faucetAddress,
    abi: FaucetAbi,
    functionName: "dripAmount",
  });
}
