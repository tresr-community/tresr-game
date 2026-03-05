/**
 * Blockchain Sync — single source of truth for all on-chain reads.
 *
 * `syncBlockchainData(walletAddress)` reads the wallet balance + all vault
 * stats in one pass and dispatches custom DOM events so UI components can
 * react without hitting the chain themselves.
 *
 * Trigger points (all guarded by the mutex):
 *   • WalletLink "Refresh" button (user-driven)
 *   • Page focus / visibilitychange (passive)
 *   • VaultBalance 60 s poll (interval-driven)
 *   • Claim event detected (post-win immediate refresh)
 *
 * Only runs when a wallet address is provided and the RPC is reachable.
 * Guest / unauthenticated users never trigger this path.
 */

import {
  getTresrBalance,
  getVaultTresrBalance,
  isRpcAvailable,
} from "@/lib/wallet/balance";
import {getReadClient} from "@/lib/wallet/tx";
import {getEnvironmentKey, isVaultDeployed} from "@/lib/wallet/avalanche";
import {VaultAbi} from "@/lib/wallet/abi/vault";
import {config} from "@/lib/config/client";
import {log} from "@/lib/utils/log";

// ── Types ─────────────────────────────────────────────────────────────────

export interface BlockchainSnapshot {
  /** Personal TRESR wallet balance (wei). */
  walletBalance: bigint;
  /** Current vault prize-pool balance (wei). */
  vaultBalance: bigint;
  /** Cumulative entry fees collected by the vault contract (wei). */
  totalFees: bigint;
  /** Cumulative rewards paid out to winners (wei). */
  totalRewarded: bigint;
  /** Cumulative amount sent to the burn address (wei). */
  totalBurned: bigint;
  /** Unix timestamp (ms) of when this snapshot was read. */
  syncedAt: number;
}

// ── Event helpers ─────────────────────────────────────────────────────────

/** Fired before the chain reads begin. Components show spinners. */
export function dispatchSyncing(syncing: boolean): void {
  document.dispatchEvent(
    new CustomEvent("tresr:blockchain-syncing", {detail: {syncing}})
  );
}

/** Fired after a successful sync. Components re-render from the snapshot. */
export function dispatchSynced(snapshot: BlockchainSnapshot): void {
  document.dispatchEvent(
    new CustomEvent<BlockchainSnapshot>("tresr:blockchain-synced", {
      detail: snapshot,
    })
  );
}

// ── Mutex ─────────────────────────────────────────────────────────────────

let syncing = false;

/** True while a sync is in progress. */
export function isSyncing(): boolean {
  return syncing;
}

// ── Core ─────────────────────────────────────────────────────────────────

const COMPONENT_NAME = "BlockchainSync";

/**
 * Read all on-chain data for a connected wallet, write global stats to the
 * Juno cache, and broadcast a `tresr:blockchain-synced` event.
 *
 * @param walletAddress - The connected EVM wallet address (`0x…`).
 * @returns The snapshot on success, or `null` if a sync is already running,
 *   the RPC is down, or the vault is not deployed.
 */
export async function syncBlockchainData(
  walletAddress: string
): Promise<BlockchainSnapshot | null> {
  // Mutex — only one sync at a time
  if (syncing) {
    log.debug(COMPONENT_NAME, "Sync already in progress, skipping");
    return null;
  }

  // RPC guard — don't attempt reads when endpoint is known-down
  if (!isRpcAvailable()) {
    log.debug(COMPONENT_NAME, "RPC unavailable, skipping sync");
    return null;
  }

  syncing = true;
  dispatchSyncing(true);

  try {
    const env = getEnvironmentKey();
    const vaultDeployed = isVaultDeployed(config);
    const vaultAddr = config.blockchain.avalanche[env]
      .vault_contract as `0x${string}`;
    const vaultAddressValid =
      vaultDeployed &&
      vaultAddr &&
      vaultAddr !== "0x0000000000000000000000000000000000000000";

    // ── 1. Read chain ──────────────────────────────────────────────────────
    let walletBalance = 0n;
    let vaultBalance = 0n;
    let totalFees = 0n;
    let totalRewarded = 0n;
    let totalBurned = 0n;

    if (vaultAddressValid) {
      const client = getReadClient();

      [walletBalance, totalFees, totalRewarded, totalBurned, vaultBalance] =
        await Promise.all([
          getTresrBalance(walletAddress, false), // bypass local cache
          client.readContract({
            address: vaultAddr,
            abi: VaultAbi,
            functionName: "totalFeesCollected",
          }) as Promise<bigint>,
          client.readContract({
            address: vaultAddr,
            abi: VaultAbi,
            functionName: "totalRewardsPaid",
          }) as Promise<bigint>,
          client.readContract({
            address: vaultAddr,
            abi: VaultAbi,
            functionName: "totalBurned",
          }) as Promise<bigint>,
          getVaultTresrBalance(false), // bypass local cache
        ]);
    } else {
      // Vault not deployed (e.g. dev without contracts) — still fetch wallet
      walletBalance = await getTresrBalance(walletAddress, false);
    }

    const syncedAt = Date.now();

    // ── 3. Broadcast snapshot ──────────────────────────────────────────────
    const snapshot: BlockchainSnapshot = {
      walletBalance,
      vaultBalance,
      totalFees,
      totalRewarded,
      totalBurned,
      syncedAt,
    };

    dispatchSynced(snapshot);
    return snapshot;
  } catch (err) {
    log.error(
      COMPONENT_NAME,
      "Sync failed:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  } finally {
    syncing = false;
    dispatchSyncing(false);
  }
}
