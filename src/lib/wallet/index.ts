/**
 * Wallet Module
 *
 * Re-exports all wallet-related utilities for convenient imports.
 */

// Unified wallet connection (primary interface)
export {
  connectWallet,
  cancelConnectWallet,
  getWalletClient,
  isConnected,
  getConnectedAddress,
  disconnectWallet,
  getConfig,
  subscribeToConnection,
  type WalletConnection,
} from "./connection";

// Avalanche utilities (read-only operations and contracts)
export {
  getTargetChain,
  getEnvironmentKey,
  payFeeForGame,
  claimWin,
  getVaultBalance,
  shortenAddress,
} from "./avalanche";

// Balance utilities
export {
  getTresrBalance,
  getTokenBalance,
  getVaultTresrBalance,
  formatBalance,
  parseBalance,
  clearBalanceCache,
  clearCachedBalance,
} from "./balance";

// Faucet utilities
export {
  claimFaucet,
  getFaucetCooldownStatus,
  getFaucetDripAmount,
  isFaucetDeployed,
} from "./faucet";

// ABI definitions
export {VaultAbi, ERC20Abi} from "./abi/vault";
export {FaucetAbi} from "./abi/faucet";
