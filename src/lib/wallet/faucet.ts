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
import {FaucetAbi} from "./FaucetAbi";
import {getWalletClient} from "./connection";
import {getTargetChain, getEnvironmentKey} from "./avalanche";
import {confirmReceipt, getReadClient} from "./tx";

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
 * Claim tokens from the faucet.
 *
 * @returns Transaction hash
 */
export async function claimFaucet(): Promise<`0x${string}`> {
  const walletClient = await getWalletClient();
  const accounts = await walletClient.getAddresses();
  const config = await loadConfigAsync();
  const env = getEnvironmentKey();
  const chainConfig = config.blockchain.avalanche[env];
  const chain = getTargetChain(chainConfig.rpc_url);

  const faucetAddress = (
    chainConfig as AvalancheEnvConfig & {faucet_contract?: string}
  ).faucet_contract as `0x${string}`;

  // Use wagmi's managed public client — its transport is shared with the
  // wallet provider, avoiding receipt hangs on Anvil.
  const publicClient = getReadClient();

  log.info(COMPONENT_NAME, "Claiming tokens from faucet...");

  const dripData = encodeFunctionData({
    abi: FaucetAbi,
    functionName: "drip",
  });

  const dripGas = await publicClient.estimateGas({
    account: accounts[0],
    to: faucetAddress,
    data: dripData,
  });

  const hash = await walletClient.writeContract({
    account: accounts[0],
    address: faucetAddress,
    abi: FaucetAbi,
    functionName: "drip",
    chain,
    gas: dripGas,
  });

  log.info(COMPONENT_NAME, "Faucet claim tx:", hash);

  // Confirm receipt through wagmi's managed transport (works on Anvil + live)
  await confirmReceipt(hash, {component: COMPONENT_NAME});

  return hash;
}

/**
 * Get the faucet cooldown status for a user.
 *
 * @param userAddress - The user's wallet address
 * @returns Cooldown info: remaining seconds (0 = can claim) and whether they can claim
 */
export async function getFaucetCooldownStatus(
  userAddress: string
): Promise<{remainingSeconds: number; canClaim: boolean}> {
  const cfg = await loadConfigAsync();
  const env = getEnvironmentKey();
  const chainConfig = cfg.blockchain.avalanche[env];
  const faucetAddress = (
    chainConfig as AvalancheEnvConfig & {faucet_contract?: string}
  ).faucet_contract as `0x${string}`;

  const publicClient = getReadClient();

  const lastDripTime = await publicClient.readContract({
    address: faucetAddress,
    abi: FaucetAbi,
    functionName: "lastDripTime",
    args: [userAddress as `0x${string}`],
  });

  if (lastDripTime === 0n) {
    return {remainingSeconds: 0, canClaim: true};
  }

  const cooldownSeconds = Number(
    await publicClient.readContract({
      address: faucetAddress,
      abi: FaucetAbi,
      functionName: "cooldown",
    })
  );

  const nowSeconds = Math.floor(Date.now() / 1000);
  const nextClaimTime = Number(lastDripTime) + cooldownSeconds;
  const remaining = Math.max(0, nextClaimTime - nowSeconds);

  return {remainingSeconds: remaining, canClaim: remaining === 0};
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
  ).faucet_contract as `0x${string}`;

  const publicClient = getReadClient();

  return await publicClient.readContract({
    address: faucetAddress,
    abi: FaucetAbi,
    functionName: "dripAmount",
  });
}
