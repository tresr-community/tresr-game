<script lang="ts">
  import { initSatellite, setDoc } from "@junobuild/core";
  import { getAuthState } from "@/lib/auth";
  import { connectWallet, getWalletClient } from "@/lib/wallet/connection";
  import { getEnvironmentKey } from "@/lib/blockchain/networks/chain";
  import { getExplorerUrl } from "@/lib/blockchain/networks/display";
  import { VaultAbi } from "@/lib/blockchain/abi/vault";
  import { loadConfigAsync } from "@/lib/config";
  import { trackClaim } from "@/lib/metrics/analytics";
  import { confirmReceipt } from "@/lib/blockchain/tx";
  import { onMount } from "svelte";

  export let gameSessionId: string;
  export let amount: number;
  export let vaultAddress: string | undefined = undefined;

  let statusText = "";
  let isError = false;
  let isSuccess = false;
  let isProcessing = false;

  onMount(() => {
    initSatellite().catch(console.error);
  });

  async function handleClaim() {
    isProcessing = true;
    isError = false;
    isSuccess = false;
    statusText = "Initializing...";

    try {
      const { user } = getAuthState();
      if (!user) throw new Error("User not authenticated.");

      const connection = await connectWallet();
      const walletClient = await getWalletClient();

      let contractAddress = vaultAddress;
      if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
        const config = await loadConfigAsync();
        const env = getEnvironmentKey();
        contractAddress = config.blockchain.avalanche[env].vault_contract as `0x${string}`;
      }

      const principalId = user.key;
      const sigResponse = await fetch("/api/get-claim-sig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: gameSessionId,
          amount,
          principal: principalId,
        }),
      });
      const { signature } = await sigResponse.json();

      statusText = "Confirm in wallet...";
      const hash = await walletClient.writeContract({
        address: contractAddress as `0x${string}`,
        abi: VaultAbi,
        functionName: "claim",
        args: [
          gameSessionId as `0x${string}`,
          BigInt(amount * 10 ** 18),
          BigInt(0),
          signature as `0x${string}`,
        ],
        account: connection.address,
        chain: null,
      });

      statusText = `Confirming on-chain: ${hash.substring(0,10)}...`;

      await confirmReceipt(hash, { component: "ClaimReward" });

      statusText = "Saving claim record...";
      await setDoc({
        collection: "audit",
        doc: {
          key: `claim_${crypto.randomUUID()}`,
          data: {
            amount,
            status: "pending",
            tx_hash: hash,
            tx_url: getExplorerUrl(hash),
            game_session_id: gameSessionId,
          },
        },
      });

      trackClaim(amount);

      statusText = "Claim submitted for verification!";
      isSuccess = true;
    } catch (error) {
      statusText = `Error: ${error instanceof Error ? error.message : String(error)}`;
      isError = true;
    } finally {
      if (!isSuccess) {
        isProcessing = false;
      }
    }
  }
</script>

<div class="card card-bordered bg-base-100 border-primary/20 shadow-xl">
  <div class="card-body">
    <h3 class="card-title text-primary">Claim Your Reward!</h3>
    <div class="text-sm opacity-70">
      <p>Session: <span class="font-mono">{gameSessionId}</span></p>
      <p>Amount: <span class="text-secondary font-bold">{amount} $TRESR</span></p>
    </div>
    <div class="card-actions mt-4 justify-end">
      <button
        on:click={handleClaim}
        disabled={isProcessing || isSuccess}
        class="btn btn-primary"
      >
        {#if isProcessing}
          <span class="loading loading-spinner"></span>
        {/if}
        {isSuccess ? "Claimed" : "Claim Reward"}
      </button>
    </div>
    {#if statusText}
      <p class="mt-2 text-xs" class:text-success={isSuccess} class:text-error={isError}>
        {statusText}
      </p>
    {/if}
  </div>
</div>
