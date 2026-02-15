/**
 * Avalanche Wallet Utilities
 *
 * Read-only client creation and contract interactions for Avalanche C-Chain.
 * Connection handling is done via connection.ts (uses Wagmi/AppKit).
 */

import {createPublicClient, http, type PublicClient, type Chain} from "viem";
import {avalanche, avalancheFuji} from "viem/chains";
import {loadConfigAsync} from "../config";
import {JUNO_ENVIRONMENT} from "../config/constants";
import {log} from "../utils/log";
import {VaultAbi, ERC20Abi} from "./VaultAbi";
import {getWalletClient} from "./connection";

const COMPONENT_NAME = "Avalanche";

/**
 * Get the target chain based on environment.
 */
export function getTargetChain(): Chain {
  return JUNO_ENVIRONMENT === "production" ? avalanche : avalancheFuji;
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

/**
 * Get the environment key for config lookup.
 */
export function getEnvironmentKey(): "anvil" | "testnet" | "mainnet" {
  return JUNO_ENVIRONMENT === "development"
    ? "anvil"
    : JUNO_ENVIRONMENT === "staging"
      ? "testnet"
      : "mainnet";
}

/**
 * Create a public client for read-only operations.
 *
 * @returns PublicClient configured for the target chain
 */
export async function getPublicClient(): Promise<PublicClient> {
  const config = await loadConfigAsync();
  const env = getEnvironmentKey();
  const chainConfig = config.blockchain.avalanche[env];

  return createPublicClient({
    chain: getTargetChain(),
    transport: http(chainConfig.rpc_url),
  });
}

/**
 * Pay fee to start a game session.
 *
 * @param sessionId - Game session identifier
 * @param amount - Fee amount in wei
 * @returns Transaction hash
 */
export async function payFeeForGame(
  sessionId: string,
  amount: bigint
): Promise<`0x${string}`> {
  const walletClient = await getWalletClient();
  const accounts = await walletClient.getAddresses();
  const config = await loadConfigAsync();
  const env = getEnvironmentKey();
  const chainConfig = config.blockchain.avalanche[env];

  // Approve the Vault to spend TRESR tokens
  log.info(COMPONENT_NAME, "Approving TRESR spend for vault fee...");
  await walletClient.writeContract({
    account: accounts[0],
    address: chainConfig.tresr_token_contract as `0x${string}`,
    abi: ERC20Abi,
    functionName: "approve",
    args: [chainConfig.vault_contract as `0x${string}`, amount],
    chain: null,
  });

  // Pay fee to the Vault
  log.info(COMPONENT_NAME, "Paying fee to vault for session:", sessionId);
  const hash = await walletClient.writeContract({
    account: accounts[0],
    address: chainConfig.vault_contract as `0x${string}`,
    abi: VaultAbi,
    functionName: "payFee",
    args: [amount, sessionId as `0x${string}`],
    chain: null,
  });

  return hash;
}

/**
 * Claim rewards after winning a game.
 *
 * @param sessionId - Game session identifier
 * @param amount - Amount to claim in wei
 * @param keys - Number of keys collected
 * @param signature - Oracle signature authorizing the claim
 * @returns Transaction hash
 */
export async function claimWin(
  sessionId: string,
  amount: bigint,
  keys: number,
  signature: `0x${string}`
): Promise<`0x${string}`> {
  const config = await loadConfigAsync();
  const env = getEnvironmentKey();
  const chainConfig = config.blockchain.avalanche[env];
  const walletClient = await getWalletClient();

  const accounts = await walletClient.getAddresses();
  const hash = await walletClient.writeContract({
    account: accounts[0],
    address: chainConfig.vault_contract as `0x${string}`,
    abi: VaultAbi,
    functionName: "claim",
    args: [sessionId as `0x${string}`, amount, BigInt(keys), signature],
    chain: null, // Chain is already configured in the wallet client
  });

  return hash;
}

/**
 * Get the vault's TRESR token balance.
 *
 * @returns Vault balance in wei
 */
export async function getVaultBalance(): Promise<bigint> {
  const config = await loadConfigAsync();
  const env = getEnvironmentKey();
  const chainConfig = config.blockchain.avalanche[env];
  const publicClient = await getPublicClient();

  // Query the token contract for vault's balance
  return await publicClient.readContract({
    address: chainConfig.tresr_token_contract as `0x${string}`,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [chainConfig.vault_contract as `0x${string}`],
  });
}

/**
 * Get the claim cooldown status for a user.
 *
 * @param userAddress - The user's wallet address
 * @returns Cooldown info: remaining seconds (0 = can claim), last claim timestamp
 */
export async function getClaimCooldownStatus(
  userAddress: string
): Promise<{remainingSeconds: number; canClaim: boolean}> {
  const cfg = await loadConfigAsync();
  const env = getEnvironmentKey();
  const chainConfig = cfg.blockchain.avalanche[env];
  const publicClient = await getPublicClient();

  const lastClaimTime = await publicClient.readContract({
    address: chainConfig.vault_contract as `0x${string}`,
    abi: VaultAbi,
    functionName: "lastClaimTime",
    args: [userAddress as `0x${string}`],
  });

  if (lastClaimTime === 0n) {
    return {remainingSeconds: 0, canClaim: true};
  }

  // Read the actual cooldown from the contract (it's a configurable variable)
  const cooldownSeconds = Number(
    await publicClient.readContract({
      address: chainConfig.vault_contract as `0x${string}`,
      abi: VaultAbi,
      functionName: "claimCooldown",
    })
  );

  const nowSeconds = Math.floor(Date.now() / 1000);
  const nextClaimTime = Number(lastClaimTime) + cooldownSeconds;
  const remaining = Math.max(0, nextClaimTime - nowSeconds);

  return {remainingSeconds: remaining, canClaim: remaining === 0};
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
