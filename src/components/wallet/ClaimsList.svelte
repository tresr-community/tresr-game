<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import {listDocs, setDoc} from "@junobuild/core";
  import type {Doc} from "@junobuild/core";
  import {initAuth, subscribeToAuth} from "@/lib/auth";
  import {getConnectedAddress, getWalletClient} from "@/lib/wallet/connection";
  import {VaultAbi} from "@/lib/blockchain/abi/vault";
  import {config} from "@/lib/config/client";
  import {getEnvironmentKey} from "@/lib/blockchain/networks/chain";
  import {confirmReceipt} from "@/lib/blockchain/tx";
  import {log} from "@/lib/utils/log";
  import Card from "@/components/ui/Card.svelte";
  import Button from "@/components/ui/Button.svelte";
  import Badge from "@/components/ui/Badge.svelte";

  const COMPONENT_NAME = "ClaimsList";

  let currentTab: "pending" | "history" = $state("pending");
  let isLoading = $state(true);
  let currentUser: any = $state(null);
  let allClaims: Doc<any>[] = $state([]);
  let now = $state(Date.now());

  const env = getEnvironmentKey();
  const explorerUrl = config.blockchain.avalanche[env].explorer_url;
  const vaultAddress = config.blockchain.avalanche[env].proxy_contract;

  let pendingClaims = $derived(
    allClaims.filter((c) => c.data.status === "readyforchain")
  );
  let historicClaims = $derived(
    allClaims.filter(
      (c) => c.data.status === "completed" || c.data.status === "failed"
    )
  );

  let unsubAuth: (() => void) | null = null;
  let disposed = false;

  let timerInterval: number;

  onMount(() => {
    timerInterval = window.setInterval(() => {
      now = Date.now();
    }, 1000);

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
    window.clearInterval(timerInterval);
    if (unsubAuth) unsubAuth();
  });

  async function fetchClaims() {
    if (!currentUser) return;
    try {
      isLoading = true;
      const {items} = await listDocs({
        collection: "claims",
        filter: {owner: currentUser.key},
      });

      allClaims = items.sort(
        (a, b) => Number(b.updated_at) - Number(a.updated_at)
      );
    } catch (err) {
      log.warn(COMPONENT_NAME, "Failed to fetch claims", err);
      allClaims = [];
    } finally {
      if (!disposed) isLoading = false;
    }
  }

  let processingClaims: Record<string, boolean> = $state({});

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
      processingClaims = {...processingClaims};

      const client = await getWalletClient();
      const formattedSessionId = claimDoc.data.game_session_id
        .padEnd(66, "0")
        .slice(0, 66);

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

      // Wait for on-chain confirmation BEFORE celebrating — the toast was
      // appearing as soon as the tx was submitted (not confirmed).
      log.info(COMPONENT_NAME, "Awaiting on-chain confirmation...");
      await confirmReceipt(txHash, {component: COMPONENT_NAME});

      claimDoc.data.status = "processing";
      claimDoc.data.tx_hash = txHash;
      await setDoc({collection: "claims", doc: claimDoc});

      document.dispatchEvent(
        new CustomEvent("tresr:confetti", {
          detail: {count: 120, colors: ["#facc15", "#f59e0b", "#fbbf24"]},
        })
      );

      setTimeout(() => {
        if (!disposed) fetchClaims();
      }, 3000);
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? (err as any).shortMessage || err.message
          : String(err);
      log.error(COMPONENT_NAME, "Claim tx failed", err);
      alert(`Claim failed: ${errMsg}`);
    } finally {
      processingClaims[claimId] = false;
      processingClaims = {...processingClaims};
    }
  }
</script>

<div class="space-y-6">
  <!-- Tabs -->
  <div
    class="mx-auto mb-8 flex w-fit items-center gap-2 rounded-lg bg-black/40 p-1"
  >
    <button
      onclick={() => (currentTab = "pending")}
      class="rounded-md px-8 py-2 font-bold transition-colors {currentTab ===
      'pending'
        ? 'bg-primary text-black'
        : 'text-white/60 hover:text-white'}"
    >
      Pending Claims (<span>{pendingClaims.length}</span>)
    </button>
    <button
      onclick={() => (currentTab = "history")}
      class="rounded-md px-8 py-2 font-bold transition-colors {currentTab ===
      'history'
        ? 'bg-primary text-black'
        : 'text-white/60 hover:text-white'}"
    >
      History
    </button>
  </div>

  {#if isLoading}
    <div class="flex justify-center p-12">
      <svg
        class="text-warning h-10 w-10 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </div>
  {:else}
    <!-- Pending -->
    <div class="space-y-4" class:hidden={currentTab !== "pending"}>
      {#if pendingClaims.length === 0}
        <div class="py-12 text-center">
          <div class="mb-4 text-5xl">🌪️</div>
          <h3 class="text-xl font-bold text-white/70">No pending claims</h3>
          <p class="text-white/50">Play games to earn on-chain rewards.</p>
        </div>
      {:else}
        <div class="grid gap-4 md:grid-cols-2">
          {#each pendingClaims as claim}
            <Card
              variant="bordered"
              class="hover:border-warning/60 transition-colors"
            >
              <h2
                class="text-warning mb-4 flex items-center justify-between font-mono text-xl font-bold tracking-wide"
              >
                <span
                  >{claim.data.claim_type === "consolation"
                    ? "Consolation Prize"
                    : "Boss Defeated!"}</span
                >
                {#if claim.data.expires_at}
                  {@const remaining = Number(claim.data.expires_at) - now}
                  {#if remaining > 0}
                    {@const d = Math.floor(remaining / 86400000)}
                    {@const h = Math.floor((remaining % 86400000) / 3600000)}
                    {@const m = Math.floor((remaining % 3600000) / 60000)}
                    {@const s = Math.floor((remaining % 60000) / 1000)}
                    <span
                      class="bg-warning/20 text-warning rounded px-2 py-1 font-mono text-xs"
                    >
                      Expires in: {d}d {h}h {m}m {s}s
                    </span>
                  {:else}
                    <span
                      class="bg-error/20 text-error rounded px-2 py-1 font-mono text-xs"
                    >
                      Expired
                    </span>
                  {/if}
                {/if}
              </h2>
              <div class="mt-2 flex items-end justify-between">
                <div>
                  <p
                    class="mb-1 font-mono text-sm tracking-widest text-white/60 uppercase"
                  >
                    Reward amount
                  </p>
                  <p
                    class="font-mono text-3xl font-bold {claim.data
                      .expires_at && Number(claim.data.expires_at) - now <= 0
                      ? 'text-white/40'
                      : ''}"
                  >
                    {(claim.data.amount / 1e18).toFixed(2)}
                    <span class="text-primary text-sm">$TRESR</span>
                  </p>
                </div>
                <Button
                  variant="warning"
                  size="sm"
                  onclick={() => handleClaim(claim.key)}
                  disabled={processingClaims[claim.key] ||
                    (claim.data.expires_at &&
                      Number(claim.data.expires_at) - now <= 0)}
                >
                  {#if processingClaims[claim.key]}
                    Claiming...
                  {:else if claim.data.expires_at && Number(claim.data.expires_at) - now <= 0}
                    Expired
                  {:else}
                    Claim Now
                  {/if}
                </Button>
              </div>
            </Card>
          {/each}
        </div>
      {/if}
    </div>

    <!-- History -->
    <div class="space-y-4" class:hidden={currentTab !== "history"}>
      {#if historicClaims.length === 0}
        <div class="py-12 text-center">
          <div class="mb-4 text-5xl">📜</div>
          <h3 class="text-xl font-bold text-white/70">No history yet</h3>
          <p class="text-white/50">Your claimed rewards will appear here.</p>
        </div>
      {:else}
        <Card variant="default" padding="none" class="overflow-x-auto">
          <table
            class="w-full table-auto border-collapse text-left font-mono text-sm"
          >
            <thead>
              <tr class="border-b border-white/10 bg-white/5">
                <th class="p-4 font-bold opacity-70">Date</th>
                <th class="p-4 font-bold opacity-70">Type</th>
                <th class="p-4 font-bold opacity-70">Amount</th>
                <th class="p-4 font-bold opacity-70">Status</th>
                <th class="p-4 font-bold opacity-70">Tx</th>
              </tr>
            </thead>
            <tbody>
              {#each historicClaims as claim}
                <tr
                  class="border-b border-white/5 transition-colors hover:bg-white/5"
                >
                  <td class="p-4 whitespace-nowrap"
                    >{new Date(
                      Number(claim.updated_at) / 1000000
                    ).toLocaleDateString()}</td
                  >
                  <td class="p-4 text-white/90"
                    >{claim.data.claim_type === "consolation"
                      ? "Consolation"
                      : "Boss Win"}</td
                  >
                  <td class="p-4 font-bold"
                    >{(claim.data.amount / 1e18).toFixed(2)}</td
                  >
                  <td class="p-4">
                    {#if claim.data.status === "completed"}
                      <Badge variant="success" size="sm">Success</Badge>
                    {:else}
                      <Badge variant="error" size="sm">Failed</Badge>
                    {/if}
                  </td>
                  <td class="p-4">
                    {#if claim.data.tx_hash}
                      <a
                        href="{explorerUrl}{claim.data.tx_hash}"
                        target="_blank"
                        class="text-primary decoration-primary/30 underline underline-offset-4 transition-colors hover:text-white"
                        >View</a
                      >
                    {:else}
                      -
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </Card>
      {/if}
    </div>
  {/if}
</div>
