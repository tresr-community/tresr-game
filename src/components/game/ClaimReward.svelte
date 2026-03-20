<script lang="ts">
  import {setDoc} from "@junobuild/core";
  import {initializeJunoSatellite} from "@/lib/utils/juno";
  import {getAuthState} from "@/lib/auth";
  import {connectWallet, getWalletClient} from "@/lib/wallet/connection";
  import {getConnectedAddress, isConnected} from "@/lib/wallet/appkit";
  import {getEnvironmentKey} from "@/lib/blockchain/networks/chain";
  import {getExplorerUrl} from "@/lib/blockchain/networks/display";
  import {VaultAbi} from "@/lib/blockchain/abi/vault";
  import {config} from "@/lib/config/client";
  import {trackClaim} from "@/lib/metrics/analytics";
  import {confirmReceipt} from "@/lib/blockchain/tx";
  import {log} from "@/lib/utils/log";
  import {onMount, onDestroy} from "svelte";
  import Card from "@/components/ui/Card.svelte";
  import Button from "@/components/ui/Button.svelte";

  const COMPONENT_NAME = "ClaimReward";

  let {
    gameSessionId,
    amount,
    vaultAddress = undefined,
  }: {
    gameSessionId: string;
    amount: number;
    vaultAddress?: string;
  } = $props();

  let statusText = $state("");
  let isError = $state(false);
  let isSuccess = $state(false);
  let isProcessing = $state(false);

  let claimAbortController: AbortController | null = null;

  onMount(() => {
    initializeJunoSatellite().catch((err) =>
      log.error(COMPONENT_NAME, "Satellite init failed", err)
    );
  });

  onDestroy(() => {
    claimAbortController?.abort();
    // Defensively reset so any future re-mount starts from a clean state.
    isProcessing = false;
  });

  async function handleClaim() {
    isProcessing = true;
    isError = false;
    isSuccess = false;
    statusText = "Initializing...";

    try {
      const {user} = getAuthState();
      if (!user) throw new Error("User not authenticated.");

      // Use the already-connected wallet if available, otherwise open the modal.
      const address = isConnected()
        ? (getConnectedAddress() as `0x${string}`)
        : ((await connectWallet()) as unknown as `0x${string}`);
      const walletClient = await getWalletClient();

      let contractAddress = vaultAddress;
      if (
        !contractAddress ||
        contractAddress === "0x0000000000000000000000000000000000000000"
      ) {
        const env = getEnvironmentKey();
        contractAddress = config.blockchain.avalanche[env]
          .vault_contract as `0x${string}`;
      }

      const principalId = user.key;
      claimAbortController = new AbortController();
      const sigResponse = await fetch("/api/get-claim-sig", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          sessionId: gameSessionId,
          amount,
          principal: principalId,
        }),
        signal: claimAbortController.signal,
      });
      const {signature} = await sigResponse.json();
      claimAbortController = null;

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
        account: address,
        chain: null,
      });

      statusText = `Confirming on-chain: ${hash.substring(0, 10)}...`;

      await confirmReceipt(hash, {component: "ClaimReward"});

      statusText = "Saving claim record...";
      await setDoc({
        collection: "claims",
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

<Card variant="bordered" class="mt-4">
  <h3 class="text-primary mb-2 text-xl font-bold">Claim Your Reward!</h3>
  <div class="mb-4 flex flex-col gap-1 text-sm opacity-70">
    <p>Session: <span class="font-mono break-all">{gameSessionId}</span></p>
    <p>Amount: <span class="font-bold text-white">{amount} $TRESR</span></p>
  </div>
  <div class="flex justify-end gap-2">
    <Button
      variant="primary"
      onclick={handleClaim}
      disabled={isProcessing || isSuccess}
    >
      {#if isProcessing}
        Claiming...
      {:else}
        {isSuccess ? "Claimed" : "Claim Reward"}
      {/if}
    </Button>
  </div>
  {#if statusText}
    <p
      class="mt-3 text-xs opacity-80"
      class:text-success={isSuccess}
      class:text-error={isError}
    >
      {statusText}
    </p>
  {/if}
</Card>
