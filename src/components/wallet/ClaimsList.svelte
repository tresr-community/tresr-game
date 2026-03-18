<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { listDocs, setDoc } from "@junobuild/core";
  import type { Doc } from "@junobuild/core";
  import { initAuth, subscribeToAuth } from "@/lib/auth";
  import { getConnectedAddress, getWalletClient } from "@/lib/wallet/connection";
  import { VaultAbi } from "@/lib/blockchain/abi/vault";
  import { config } from "@/lib/config/client";
  import { getEnvironmentKey } from "@/lib/blockchain/networks/chain";
  import { log } from "@/lib/utils/log";

  const COMPONENT_NAME = "ClaimsList";

  let currentTab: "pending" | "history" = "pending";
  let isLoading = true;
  let currentUser: any = null;
  let allClaims: Doc<any>[] = [];

  const env = getEnvironmentKey();
  const explorerUrl = config.blockchain.avalanche[env].explorer_url;
  const vaultAddress = config.blockchain.avalanche[env].vault_contract;

  $: pendingClaims = allClaims.filter((c) => c.data.status === "readyforchain");
  $: historicClaims = allClaims.filter((c) => c.data.status === "completed" || c.data.status === "failed");

  let unsubAuth: (() => void) | null = null;
  let disposed = false;

  onMount(() => {
    initAuth().then(() => {
      if (disposed) return;
      unsubAuth = subscribeToAuth(async (user) => {
        currentUser = user;
        if (user && !user.isGuest) {
          await fetchClaims();
        } else {
          isLoading = false;
        }
      });
    });
  });

  onDestroy(() => {
    disposed = true;
    if (unsubAuth) unsubAuth();
  });

  async function fetchClaims() {
    if (!currentUser) return;
    try {
      isLoading = true;
      const { items } = await listDocs({
        collection: "claims",
        filter: { owner: currentUser.key },
      });

      allClaims = items.sort((a, b) => Number(b.updated_at) - Number(a.updated_at));
    } catch (err) {
      log.warn(COMPONENT_NAME, "Failed to fetch claims", err);
      allClaims = [];
    } finally {
      if (!disposed) isLoading = false;
    }
  }

  let processingClaims: Record<string, boolean> = {};

  async function handleClaim(claimId: string) {
    const claimDoc = allClaims.find((c) => c.key === claimId);
    if (!claimDoc) return;

    if (!claimDoc.data.signature) {
      alert("Missing signature. Try again later.");
      return;
    }

    const address = getConnectedAddress();
    if (!address) {
      alert("Please connect your wallet first!");
      return;
    }

    try {
      processingClaims[claimId] = true;
      processingClaims = { ...processingClaims };

      const client = await getWalletClient();
      const formattedSessionId = claimDoc.data.game_session_id.padEnd(66, "0").slice(0, 66);

      log.info(COMPONENT_NAME, "Sending claim tx...");
      const txHash = await client.writeContract({
        address: vaultAddress as `0x${string}`,
        abi: VaultAbi,
        functionName: "claim",
        chain: null,
        account: address as `0x${string}`,
        args: [
          formattedSessionId as `0x${string}`,
          BigInt(claimDoc.data.amount.toString()),
          BigInt(claimDoc.data.keys_collected.toString()),
          claimDoc.data.signature as `0x${string}`,
        ],
      });

      log.info(COMPONENT_NAME, `Tx Hash: ${txHash}`);

      claimDoc.data.status = "processing";
      claimDoc.data.tx_hash = txHash;
      await setDoc({ collection: "claims", doc: claimDoc });

      document.dispatchEvent(
        new CustomEvent("tresr:confetti", {
          detail: { count: 120, colors: ["#facc15", "#f59e0b", "#fbbf24"] },
        })
      );

      setTimeout(() => {
        if (!disposed) fetchClaims();
      }, 3000);
    } catch (err: any) {
      log.error(COMPONENT_NAME, "Claim tx failed", err);
      alert(`Claim failed: ${err.shortMessage || err.message}`);
    } finally {
      processingClaims[claimId] = false;
      processingClaims = { ...processingClaims };
    }
  }
</script>

<div class="space-y-6">
  <!-- Tabs -->
  <div class="tabs tabs-boxed bg-base-300 mx-auto mb-8 w-fit p-1">
    <button on:click={() => currentTab = "pending"} class="tab px-8 font-bold" class:tab-active={currentTab === "pending"}>
      Pending Claims (<span>{pendingClaims.length}</span>)
    </button>
    <button on:click={() => currentTab = "history"} class="tab px-8 font-bold" class:tab-active={currentTab === "history"}>
      History
    </button>
  </div>

  {#if isLoading}
    <div class="flex justify-center p-12">
      <span class="loading loading-spinner text-warning loading-lg"></span>
    </div>
  {:else}
    <!-- Pending -->
    <div class="space-y-4" class:hidden={currentTab !== "pending"}>
      {#if pendingClaims.length === 0}
        <div class="py-12 text-center">
          <div class="mb-4 text-5xl">🌪️</div>
          <h3 class="text-base-content/70 text-xl font-bold">No pending claims</h3>
          <p class="text-base-content/50">Play games to earn on-chain rewards.</p>
        </div>
      {:else}
        <div class="grid gap-4 md:grid-cols-2">
          {#each pendingClaims as claim}
            <div class="card bg-base-100 shadow-lg border border-warning/30 hover:border-warning/60 transition-colors">
              <div class="card-body p-5">
                <h2 class="card-title text-warning">{claim.data.claim_type === "consolation" ? "Consolation Prize" : "Boss Defeated!"}</h2>
                <div class="flex justify-between items-end mt-2">
                  <div>
                    <p class="text-sm text-base-content/60">Reward amount:</p>
                    <p class="text-3xl font-mono font-bold">{(claim.data.amount / 1e18).toFixed(2)} <span class="text-sm">$TRESR</span></p>
                  </div>
                  <button on:click={() => handleClaim(claim.key)} disabled={processingClaims[claim.key]} class="btn btn-warning btn-sm">
                    {#if processingClaims[claim.key]}
                      <span class="loading loading-spinner"></span> Claiming...
                    {:else}
                      Claim Now
                    {/if}
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- History -->
    <div class="space-y-4" class:hidden={currentTab !== "history"}>
      {#if historicClaims.length === 0}
        <div class="py-12 text-center">
          <div class="mb-4 text-5xl">📜</div>
          <h3 class="text-base-content/70 text-xl font-bold">No history yet</h3>
          <p class="text-base-content/50">Your claimed rewards will appear here.</p>
        </div>
      {:else}
        <div class="bg-base-100 rounded-box border-base-300 overflow-x-auto border shadow-sm">
          <table class="table-zebra table-sm md:table-md table w-full">
            <thead>
              <tr class="bg-base-200">
                <th>Date</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {#each historicClaims as claim}
                <tr>
                  <td class="whitespace-nowrap">{new Date(Number(claim.updated_at) / 1000000).toLocaleDateString()}</td>
                  <td>{claim.data.claim_type === "consolation" ? "Consolation" : "Boss Win"}</td>
                  <td class="font-mono">{(claim.data.amount / 1e18).toFixed(2)}</td>
                  <td>
                    {#if claim.data.status === "completed"}
                      <span class="badge badge-success badge-sm">Success</span>
                    {:else}
                      <span class="badge badge-error badge-sm">Failed</span>
                    {/if}
                  </td>
                  <td>
                    {#if claim.data.tx_hash}
                      <a href="{explorerUrl}{claim.data.tx_hash}" target="_blank" class="link link-primary font-mono text-xs">View</a>
                    {:else}
                      -
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
</div>
