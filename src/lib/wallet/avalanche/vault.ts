/**
 * Vault contract interactions on Avalanche C-Chain.
 *
 * Handles all write operations against the Tresr Vault:
 * - payFeeForGame(): Approve + pay entry fee for a game session
 * - claimWin():     Claim rewards after winning (oracle-signed)
 * - getVaultBalance():        Read the vault's TRESR token balance
 * - getClaimCooldownStatus(): Check per-user claim cooldown
 */

import {encodeFunctionData, formatUnits} from "viem";
import {loadConfigAsync} from "../../config";
import {getEnvironmentKey} from "../../config/constants";
import {log} from "../../utils/log";
import {VaultAbi, ERC20Abi} from "../abi/vault";
import {getWalletClient} from "../connection";
import {confirmReceipt, getReadClient} from "../tx";
import {getTargetChain} from "./chain";

const COMPONENT_NAME = "Avalanche";

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
  if (accounts.length === 0) {
    throw new Error(
      "No wallet accounts found. Please connect your wallet and try again."
    );
  }
  const cfg = await loadConfigAsync();
  const env = getEnvironmentKey();
  const chainConfig = cfg.blockchain.avalanche[env];
  const chain = getTargetChain(chainConfig.rpc_urls[0]);

  const publicClient = getReadClient();

  const vaultAddr = chainConfig.vault_contract as `0x${string}`;
  const tokenAddr = chainConfig.tresr_token_contract as `0x${string}`;
  const sid = sessionId as `0x${string}`;

  // --- Pre-flight checks (fail fast before any wallet prompts) ---
  const [balance, allowance, alreadyPaid] = await Promise.all([
    publicClient.readContract({
      address: tokenAddr,
      abi: ERC20Abi,
      functionName: "balanceOf",
      args: [accounts[0]],
    }),
    publicClient.readContract({
      address: tokenAddr,
      abi: ERC20Abi,
      functionName: "allowance",
      args: [accounts[0], vaultAddr],
    }),
    publicClient.readContract({
      address: vaultAddr,
      abi: VaultAbi,
      functionName: "paidSessions",
      args: [sid],
    }),
  ]);

  log.info(
    COMPONENT_NAME,
    `payFee pre-flight — user: ${accounts[0]}, session: ${sid}, amount: ${formatUnits(amount, 18)}, balance: ${formatUnits(balance, 18)}, allowance: ${formatUnits(allowance, 18)}, alreadyPaid: ${alreadyPaid}`
  );

  if (alreadyPaid) {
    throw new Error(
      "This session has already been paid for. Please start a new game."
    );
  }
  if (balance < amount) {
    throw new Error(
      `Insufficient token balance: have ${formatUnits(balance, 18)} but need ${formatUnits(amount, 18)} TRESR.`
    );
  }

  // --- Approve only if current allowance is insufficient ---
  // On repeat plays the allowance is still zero (payFee fully consumes it),
  // but we at least avoid the popup when the user has a pre-existing allowance
  // (e.g. from a failed/cancelled previous attempt that mined the approve tx).
  if (allowance < amount) {
    log.info(
      COMPONENT_NAME,
      `Allowance insufficient (${formatUnits(allowance, 18)} < ${formatUnits(amount, 18)}), requesting approval...`
    );

    const approveData = encodeFunctionData({
      abi: ERC20Abi,
      functionName: "approve",
      args: [vaultAddr, amount],
    });

    const approveGas = await publicClient.estimateGas({
      account: accounts[0],
      to: tokenAddr,
      data: approveData,
    });

    const approveHash = await walletClient.writeContract({
      account: accounts[0],
      address: tokenAddr,
      abi: ERC20Abi,
      functionName: "approve",
      args: [vaultAddr, amount],
      chain,
      gas: approveGas,
    });

    // Wait for approval to be mined before proceeding — otherwise the vault
    // will see allowance=0 and revert with ERC20InsufficientAllowance.
    await confirmReceipt(approveHash, {component: COMPONENT_NAME});
  } else {
    log.info(
      COMPONENT_NAME,
      `Allowance sufficient (${formatUnits(allowance, 18)}), skipping approval step.`
    );
  }

  // --- Pay fee to the Vault ---
  log.info(COMPONENT_NAME, "Paying fee to vault for session:", sessionId);

  // simulateContract decodes Solidity revert reasons (unlike raw estimateGas)
  const {request: payFeeRequest} = await publicClient.simulateContract({
    account: accounts[0],
    address: vaultAddr,
    abi: VaultAbi,
    functionName: "payFee",
    args: [amount, sid],
  });

  const hash = await walletClient.writeContract({
    ...payFeeRequest,
    chain,
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
  if (accounts.length === 0) {
    throw new Error(
      "No wallet accounts found. Please connect your wallet and try again."
    );
  }

  const publicClient = getReadClient();
  log.info(COMPONENT_NAME, "Claiming win from vault for session:", sessionId);

  // simulateContract decodes Solidity revert reasons (unlike raw estimateGas)
  const {request: claimRequest} = await publicClient.simulateContract({
    account: accounts[0],
    address: chainConfig.vault_contract as `0x${string}`,
    abi: VaultAbi,
    functionName: "claim",
    args: [sessionId as `0x${string}`, amount, BigInt(keys), signature],
  });

  const hash = await walletClient.writeContract({
    ...claimRequest,
    chain: getTargetChain(), // Chain is already configured in the wallet client
  });

  await confirmReceipt(hash, {component: COMPONENT_NAME});

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
  const publicClient = getReadClient();

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
  const publicClient = getReadClient();

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
