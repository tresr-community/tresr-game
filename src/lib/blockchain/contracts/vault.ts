import {getReadClient} from "@/lib/blockchain/tx";
import {
  getEnvironmentKey,
  isVaultDeployed,
  getTargetChain,
} from "@/lib/blockchain/networks/chain";
import {VaultAbi, ERC20Abi} from "@/lib/blockchain/abi/vault";
import {getWalletClient} from "@/lib/wallet/connection";
import {publicActions, encodeFunctionData, formatUnits} from "viem";
import {config} from "@/lib/config/client";
import {log} from "@/lib/utils/log";

const COMPONENT_NAME = "VaultContract";

function getVaultAddress(
  env: ReturnType<typeof getEnvironmentKey>
): `0x${string}` | null {
  const vaultDeployed = isVaultDeployed(config);
  const vaultAddr = config.blockchain.avalanche[env]
    .vault_contract as `0x${string}`;

  if (
    vaultDeployed &&
    vaultAddr &&
    vaultAddr !== "0x0000000000000000000000000000000000000000"
  ) {
    return vaultAddr;
  }
  return null;
}

/**
 * Validates the vault environment and returns the configured vault address.
 * Throws an error if the vault is not deployed or the address is invalid.
 */
function getValidVaultAddress(): `0x${string}` {
  const env = getEnvironmentKey();
  const address = getVaultAddress(env);
  if (!address) {
    throw new Error("Vault contract is not deployed or invalid address.");
  }
  return address;
}

/**
 * Returns the total amount of entry fees collected by the vault contract (wei).
 */
export async function getTotalFees(): Promise<bigint> {
  try {
    const address = getValidVaultAddress();
    const client = getReadClient();
    return (await client.readContract({
      address,
      abi: VaultAbi,
      functionName: "totalFeesCollected",
    })) as bigint;
  } catch (err) {
    log.error(
      COMPONENT_NAME,
      "Failed to fetch totalFeesCollected",
      String(err)
    );
    return 0n;
  }
}

/**
 * Returns the cumulative rewards paid out to winners (wei).
 */
export async function getTotalRewards(): Promise<bigint> {
  try {
    const address = getValidVaultAddress();
    const client = getReadClient();
    return (await client.readContract({
      address,
      abi: VaultAbi,
      functionName: "totalRewardsPaid",
    })) as bigint;
  } catch (err) {
    log.error(COMPONENT_NAME, "Failed to fetch totalRewardsPaid", String(err));
    return 0n;
  }
}

/**
 * Returns the cumulative amount sent to the burn address (wei).
 */
export async function getVaultTotalBurned(): Promise<bigint> {
  try {
    const address = getValidVaultAddress();
    const client = getReadClient();
    return (await client.readContract({
      address,
      abi: VaultAbi,
      functionName: "totalBurned",
    })) as bigint;
  } catch (err) {
    log.error(COMPONENT_NAME, "Failed to fetch totalBurned", String(err));
    return 0n;
  }
}

import {getVaultTresrBalance} from "../balance";

/**
 * Returns the current vault prize-pool balance (wei).
 */
export async function getVaultCurrentBalance(): Promise<bigint> {
  try {
    // Validate address but actually fetch token balance using the balance module
    getValidVaultAddress();
    return await getVaultTresrBalance(false);
  } catch (err) {
    log.error(COMPONENT_NAME, "Failed to fetch currentBalance", String(err));
    return 0n;
  }
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
  if (accounts.length === 0) {
    throw new Error(
      "No wallet accounts found. Please connect your wallet and try again."
    );
  }
  const env = getEnvironmentKey();
  const chainConfig = config.blockchain.avalanche[env];
  const chain = getTargetChain(chainConfig.rpc_urls[0]);

  // Extend wallet client with publicActions so that submit + receipt polling
  // share the SAME transport.  Pre-flight reads use getReadClient (read-only;
  // transport consistency doesn’t matter there).
  const extendedClient = walletClient.extend(publicActions);
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

    const approveHash = await extendedClient.writeContract({
      account: accounts[0],
      address: tokenAddr,
      abi: ERC20Abi,
      functionName: "approve",
      args: [vaultAddr, amount],
      chain,
      gas: approveGas,
    });

    log.info(
      COMPONENT_NAME,
      `Waiting for approval receipt (${env}): ${approveHash}`
    );
    const approvalReceipt = await extendedClient.waitForTransactionReceipt({
      hash: approveHash,
      confirmations: env === "mainnet" ? 2 : env === "testnet" ? 1 : 0,
      pollingInterval: 500,
      timeout: config.gameplay.fee_gate.transaction_timeout_ms,
    });
    if (approvalReceipt.status !== "success") {
      throw new Error("Approval transaction reverted on-chain");
    }
  } else {
    log.info(
      COMPONENT_NAME,
      `Allowance sufficient (${formatUnits(allowance, 18)}), skipping approval step.`
    );
  }

  // --- Pay fee to the Vault ---
  log.info(COMPONENT_NAME, "Paying fee to vault for session:", sessionId);

  const {request: payFeeRequest} = await extendedClient.simulateContract({
    account: accounts[0],
    address: vaultAddr,
    abi: VaultAbi,
    functionName: "payFee",
    args: [amount, sid],
  });

  const hash = await extendedClient.writeContract({
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
  const env = getEnvironmentKey();
  const chainConfig = config.blockchain.avalanche[env];
  const walletClient = await getWalletClient();

  const accounts = await walletClient.getAddresses();
  if (accounts.length === 0) {
    throw new Error(
      "No wallet accounts found. Please connect your wallet and try again."
    );
  }

  // Extend wallet client with publicActions so that submit + receipt polling
  // share the SAME transport.  simulateContract uses getReadClient (read-only).
  const extendedClient = walletClient.extend(publicActions);
  const publicClient = getReadClient();
  log.info(COMPONENT_NAME, "Claiming win from vault for session:", sessionId);

  const {request: claimRequest} = await publicClient.simulateContract({
    account: accounts[0],
    address: chainConfig.vault_contract as `0x${string}`,
    abi: VaultAbi,
    functionName: "claim",
    args: [sessionId as `0x${string}`, amount, BigInt(keys), signature],
  });

  const hash = await extendedClient.writeContract({
    ...claimRequest,
    chain: getTargetChain(),
  });

  log.info(COMPONENT_NAME, `Waiting for claim receipt (${env}): ${hash}`);
  const claimReceipt = await extendedClient.waitForTransactionReceipt({
    hash,
    confirmations: env === "mainnet" ? 2 : env === "testnet" ? 1 : 0,
    pollingInterval: 500,
    timeout: config.wallet.tx_timeout_ms,
  });
  if (claimReceipt.status !== "success") {
    throw new Error("Claim transaction reverted on-chain");
  }

  return hash;
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
  const env = getEnvironmentKey();
  const chainConfig = config.blockchain.avalanche[env];
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
