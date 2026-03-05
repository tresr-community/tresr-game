/**
 * Avalanche chain configuration and environment helpers.
 *
 * Provides the target chain definition and deployment checks for the
 * current environment (local/testnet/mainnet).
 */

import {type Chain} from "viem";
import {avalanche} from "viem/chains";
import {JUNO_ENVIRONMENT, getEnvironmentKey} from "../../config/constants";
import {config} from "../../config/client";

// Re-export for consumers that import from ./avalanche
export {getEnvironmentKey};

/**
 * Get the target chain based on environment.
 *
 * Builds the chain definition from config values (chain_id, rpc_urls)
 * so each environment gets exactly the right chain ID and RPC.
 */
export function getTargetChain(rpcUrl?: string): Chain {
  if (JUNO_ENVIRONMENT === "production") return avalanche;

  // Build chain from config — no more spreading avalancheFuji which
  // hardcodes chain ID 43113 and the public Fuji RPC URL.
  const env = JUNO_ENVIRONMENT === "development" ? "anvil" : "testnet";
  const cc = config.blockchain.avalanche[env];
  return {
    id: cc.chain_id,
    name: env === "anvil" ? "Anvil (Local)" : "Avalanche Fuji",
    nativeCurrency: {decimals: 18, name: "Avalanche", symbol: "AVAX"},
    rpcUrls: {default: {http: [rpcUrl ?? cc.rpc_urls[0]]}},
  } as Chain;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Check whether the vault contract is deployed for the current environment.
 * Returns false when vault_contract is the zero address (not yet deployed).
 */
export function isVaultDeployed(cfg: {
  blockchain: {avalanche: Record<string, {vault_contract: string}>};
}): boolean {
  const env = getEnvironmentKey();
  const addr = cfg.blockchain.avalanche[env]?.vault_contract;
  return !!addr && addr !== ZERO_ADDRESS;
}
