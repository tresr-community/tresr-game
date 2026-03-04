/**
 * Barrel re-export for lib/wallet/avalanche/
 *
 * All existing callers import from "@/lib/wallet/avalanche" — this index
 * keeps those paths working without any changes to the 10 call sites.
 */

export {getTargetChain, isVaultDeployed, getEnvironmentKey} from "./chain";
export {
  payFeeForGame,
  claimWin,
  getVaultBalance,
  getClaimCooldownStatus,
} from "./vault";
export {getExplorerUrl, shortenAddress} from "./display";
