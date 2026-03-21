<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import {config} from "@/lib/config/client";
  import {getEnvironmentKey} from "@/lib/blockchain/networks/chain";
  import {getExplorerUrl} from "@/lib/blockchain/networks/display";
  import {payFeeForGame} from "@/lib/blockchain/contracts/vault";
  import {setDoc, getDoc} from "@junobuild/core";
  import {connectWallet, getHydratedAddress} from "@/lib/wallet/connection";
  import {confirmReceipt} from "@/lib/blockchain/tx";
  import {
    getTresrBalance,
    formatBalance,
    parseBalance,
  } from "@/lib/blockchain/balance";
  import {
    markFeePaid,
    resolveFeeGate,
    rejectFeeGate,
  } from "@/lib/game/fee-gate";
  import {log} from "@/lib/utils/log";
  import {trackFeePaid, trackError} from "@/lib/metrics/analytics";
  import {reportError} from "@/lib/utils/error-reporter";
  import {profileStore} from "@/lib/user/store.svelte";
  import Modal from "@/components/ui/Modal.svelte";

  const COMPONENT_NAME = "FeeGate";
  // Use the configured fee-gate transaction timeout (default 300 s).
  // This must be long enough to cover wallet signing + 2 on-chain confirmations
  // + the 5 s RPC propagation buffer before satellite verification.
  const PAYMENT_TIMEOUT_MS = config.gameplay.fee_gate.transaction_timeout_ms;

  const env = getEnvironmentKey();
  const chainConfig = config.blockchain.avalanche[env];
  const feeAmountStr = chainConfig.fee;
  const ticker = chainConfig.token_ticker;

  let open = $state(false);
  let isOverlayVisible = $state(false);
  let isProgressVisible = $state(false);
  let isStatusVisible = $state(false);

  let statusMessage = $state("");
  let isStatusError = $state(false);

  let btnPayDisabled = $state(false);
  let isPaySpinnerVisible = $state(false);
  let payLabelText = $state("APE IN");
  let isBtnAbortHidden = $state(false);

  let stepWalletState: "none" | "active" | "done" | "error" = $state("none");
  let stepBalanceState: "none" | "active" | "done" | "error" = $state("none");
  let stepApproveState: "none" | "active" | "done" | "error" = $state("none");
  let stepFeeState: "none" | "active" | "done" | "error" = $state("none");
  let stepConfirmState: "none" | "active" | "done" | "error" = $state("none");

  // Element refs for auto-scroll
  let stepEls: Record<string, HTMLLIElement | null> = {
    wallet: null,
    balance: null,
    approve: null,
    fee: null,
    confirm: null,
  };
  // Status message element — scrolled into view on every status update
  let statusEl: HTMLDivElement | null = null;

  let paymentInProgress = false;
  let paymentTimeoutId: ReturnType<typeof setTimeout> | null = null;

  function clearPaymentTimeout() {
    if (paymentTimeoutId !== null) {
      clearTimeout(paymentTimeoutId);
      paymentTimeoutId = null;
    }
  }

  function showStatus(message: string, isError = false) {
    statusMessage = message;
    isStatusError = isError;
    isStatusVisible = true;
    // Always scroll to the status line so users can see feedback —
    // errors on mobile were invisible without this; on desktop it
    // also helps follow the flow automatically.
    requestAnimationFrame(() => {
      statusEl?.scrollIntoView({behavior: "smooth", block: "nearest"});
    });
  }

  function hideStatus() {
    isStatusVisible = false;
  }

  function handleFeeGateOpen() {
    hideStatus();
    isProgressVisible = false;
    btnPayDisabled = false;
    isPaySpinnerVisible = false;
    payLabelText = "APE IN";
    isBtnAbortHidden = false;
    open = true;
  }

  function showProgress() {
    isProgressVisible = true;
    stepWalletState = "none";
    stepBalanceState = "none";
    stepApproveState = "none";
    stepFeeState = "none";
    stepConfirmState = "none";
  }

  function markStep(step: string, state: "active" | "done" | "error") {
    if (step === "wallet") stepWalletState = state;
    if (step === "balance") stepBalanceState = state;
    if (step === "approve") stepApproveState = state;
    if (step === "fee") stepFeeState = state;
    if (step === "confirm") stepConfirmState = state;

    // Scroll the active/changing step into view (mobile + desktop)
    requestAnimationFrame(() => {
      stepEls[step]?.scrollIntoView({behavior: "smooth", block: "nearest"});
    });
  }

  async function handlePayClick() {
    if (paymentInProgress) return;
    paymentInProgress = true;
    btnPayDisabled = true;
    isPaySpinnerVisible = true;
    payLabelText = "Processing...";
    isBtnAbortHidden = true;
    hideStatus();
    showProgress();

    try {
      paymentTimeoutId = setTimeout(() => {
        clearPaymentTimeout();
        paymentInProgress = false;
        window.showWarningToast?.(
          "Connection timed out",
          "Your wallet took too long to respond — please try again."
        );
        open = false;
        rejectFeeGate();
        window.location.href = "/";
      }, PAYMENT_TIMEOUT_MS);

      markStep("wallet", "active");
      let address: `0x${string}`;

      const connectedAddress = await getHydratedAddress();
      if (connectedAddress) {
        address = connectedAddress;
        showStatus("Wallet connected ✓");
      } else {
        showStatus("Connecting wallet...");
        isOverlayVisible = true;
        open = false;
        const connection = await connectWallet();
        isOverlayVisible = false;
        address = connection.address;
        open = true;
      }
      markStep("wallet", "done");

      // Guard: connected wallet must match the address registered in the user's profile.
      // A mismatch means the user has the wrong wallet active — abort before any spend.
      const profileWallet = profileStore.value?.evm_wallet;
      if (
        profileWallet &&
        address.toLowerCase() !== profileWallet.toLowerCase()
      ) {
        markStep("wallet", "error");
        showStatus(
          `Wrong wallet connected. Expected …${profileWallet.slice(-6)} but got …${address.slice(-6)}. Switch wallets and try again.`,
          true
        );
        paymentInProgress = false;
        btnPayDisabled = false;
        isPaySpinnerVisible = false;
        payLabelText = "APE IN";
        isBtnAbortHidden = false;
        clearPaymentTimeout();
        return;
      }

      markStep("balance", "active");
      showStatus("Checking balance...");
      const balance = await getTresrBalance(address);
      const feeWei = parseBalance(String(feeAmountStr));

      if (balance < feeWei) {
        const formatted = formatBalance(balance);
        markStep("balance", "error");
        showStatus(
          `Insufficient balance: ${formatted} $${ticker} (need ${feeAmountStr} $${ticker})`,
          true
        );
        paymentInProgress = false;
        btnPayDisabled = false;
        isPaySpinnerVisible = false;
        payLabelText = "APE IN";
        isBtnAbortHidden = false;
        return;
      }
      markStep("balance", "done");

      const ts = Date.now().toString();
      const randomBytes = crypto.getRandomValues(new Uint8Array(16));
      const randomHex = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const raw = new TextEncoder().encode(`${address}:${ts}:${randomHex}`);
      const hashBuf = await crypto.subtle.digest("SHA-256", raw);
      const hashArr = new Uint8Array(hashBuf);
      const sessionId = `0x${Array.from(hashArr)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`;

      markStep("approve", "active");
      showStatus("Checking token approval...");
      const txHash = await payFeeForGame(sessionId, feeWei);
      markStep("approve", "done");
      markStep("fee", "done");

      markStep("confirm", "active");
      await confirmReceipt(txHash, {
        component: "FeeGate",
        timeout: config.gameplay.fee_gate.transaction_timeout_ms,
        onConfirmation: (current, total) => {
          showStatus(`Confirming ${current}/${total} on-chain…`);
        },
      });
      markStep("confirm", "done");

      await markFeePaid(txHash, sessionId);

      await setDoc({
        collection: "audit",
        doc: {
          key: `fee_${txHash}`,
          data: {
            tx_hash: txHash,
            tx_url: getExplorerUrl(txHash),
            amount: Number(feeAmountStr),
            status: "pending",
          },
        },
      });

      markStep("confirm", "active");
      showStatus("Verifying transaction on satellite...");

      const POLL_INTERVAL_MS = 1500;
      const POLL_TIMEOUT_MS = 90_000;
      const deadline = Date.now() + POLL_TIMEOUT_MS;

      let feeStatus = "pending";
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const feeDoc = await getDoc({
          collection: "audit",
          key: `fee_${txHash}`,
        });
        const docData = feeDoc?.data as
          | {status?: string; error?: string}
          | undefined;
        feeStatus = docData?.status ?? "pending";
        if (feeStatus === "verified" || feeStatus === "failed") break;
        if (feeStatus === "verifying") {
          const match = (docData?.error ?? "").match(/Attempt (\d+)\/(\d+)/);
          if (match) {
            showStatus(`Verifying on-chain (attempt ${match[1]}/${match[2]})…`);
          } else {
            showStatus("Verifying on-chain…");
          }
        }
      }

      if (feeStatus !== "verified") {
        throw new Error(
          feeStatus === "failed"
            ? "satellite:verification_failed"
            : "satellite:timeout"
        );
      }

      trackFeePaid(txHash);
      showStatus("Verified! Starting mission...");
      await new Promise((r) => setTimeout(r, 600));

      clearPaymentTimeout();
      open = false;
      resolveFeeGate();
    } catch (error: unknown) {
      clearPaymentTimeout();
      isOverlayVisible = false;
      const message = error instanceof Error ? error.message : String(error);
      log.error(COMPONENT_NAME, "Fee payment failed:", error);
      trackError("fee_paid", message);

      if (!open) open = true;

      if (message === "satellite:verification_failed") {
        showStatus("Failed to verify transaction — please try again.", true);
      } else if (message === "satellite:timeout") {
        showStatus("Verification timed out — please try again.", true);
      } else if (
        message.includes("User rejected") ||
        message.includes("user rejected") ||
        message.includes("cancelled") ||
        message.includes("denied")
      ) {
        showStatus("Transaction rejected by user.", true);
      } else {
        const errorId = await reportError(
          COMPONENT_NAME,
          "Fee payment failed",
          message
        );
        showStatus(
          errorId
            ? `Payment error – ref: ${errorId}`
            : `Payment error – contact support`,
          true
        );
      }

      paymentInProgress = false;
      btnPayDisabled = false;
      isPaySpinnerVisible = false;
      payLabelText = "APE IN";
      isBtnAbortHidden = false;
    }
  }

  function handleAbortClick() {
    open = false;
    rejectFeeGate();
  }

  onMount(() => {
    document.addEventListener("tresr:fee-gate-open", handleFeeGateOpen);
  });

  onDestroy(() => {
    document.removeEventListener("tresr:fee-gate-open", handleFeeGateOpen);
    clearPaymentTimeout();
  });

  function getStepColorClass(state: string) {
    if (state === "active") return "text-primary border-primary";
    if (state === "done") return "text-[#10b981] border-[#10b981]";
    if (state === "error") return "text-[#ef4444] border-[#ef4444]";
    return "text-white/30 border-white/10";
  }

  function getStepIcon(state: string) {
    if (state === "done") return "✓";
    if (state === "error") return "✕";
    if (state === "active") return "⋮";
    return "";
  }
</script>

<Modal
  bind:open
  title="Entry Fee Required"
  closeOnEscape={false}
  closeOnOutsideClick={false}
  mobileFull
>
  <div
    class="my-4 flex w-full flex-col gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 shadow-inner"
  >
    <div class="flex flex-col items-center bg-black/40 p-3 text-center">
      <div
        class="text-[10px] font-bold tracking-widest text-[#eab308] uppercase"
      >
        Fee Amount
      </div>
      <div class="font-mono text-sm font-bold text-[#fde047] sm:text-2xl">
        {feeAmountStr} ${ticker}
      </div>
    </div>
  </div>

  <!-- Transaction progress steps -->
  <div class="my-4" class:hidden={!isProgressVisible}>
    <ul
      class="flex w-full flex-col gap-3 text-left font-mono text-xs tracking-tight sm:text-sm"
    >
      <li
        bind:this={stepEls.wallet}
        class={`flex items-center gap-3 ${getStepColorClass(stepWalletState).split(" ")[0]}`}
      >
        <div
          class={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${getStepColorClass(stepWalletState).split(" ")[1]}`}
        >
          {getStepIcon(stepWalletState)}
        </div>
        Connect wallet
      </li>
      <li
        bind:this={stepEls.balance}
        class={`flex items-center gap-3 ${getStepColorClass(stepBalanceState).split(" ")[0]}`}
      >
        <div
          class={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${getStepColorClass(stepBalanceState).split(" ")[1]}`}
        >
          {getStepIcon(stepBalanceState)}
        </div>
        Check balance
      </li>
      <li
        bind:this={stepEls.approve}
        class={`flex items-center gap-3 ${getStepColorClass(stepApproveState).split(" ")[0]}`}
      >
        <div
          class={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${getStepColorClass(stepApproveState).split(" ")[1]}`}
        >
          {getStepIcon(stepApproveState)}
        </div>
        Approve token spend
      </li>
      <li
        bind:this={stepEls.fee}
        class={`flex items-center gap-3 ${getStepColorClass(stepFeeState).split(" ")[0]}`}
      >
        <div
          class={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${getStepColorClass(stepFeeState).split(" ")[1]}`}
        >
          {getStepIcon(stepFeeState)}
        </div>
        Pay fee to vault
      </li>
      <li
        bind:this={stepEls.confirm}
        class={`flex items-center gap-3 ${getStepColorClass(stepConfirmState).split(" ")[0]}`}
      >
        <div
          class={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${getStepColorClass(stepConfirmState).split(" ")[1]}`}
        >
          {getStepIcon(stepConfirmState)}
        </div>
        Confirm on-chain
      </li>
    </ul>
  </div>

  <!-- Status messages -->
  <div
    bind:this={statusEl}
    class="my-2 rounded-md bg-black/30 p-3 text-center font-mono text-xs tracking-wider sm:my-3 sm:text-sm {isStatusError
      ? 'text-[#ef4444]'
      : 'text-white/70'}"
    class:hidden={!isStatusVisible}
  >
    {statusMessage}
  </div>

  {#snippet footer()}
    <div class="flex w-full flex-col gap-2">
      <button
        onclick={handlePayClick}
        disabled={btnPayDisabled}
        class="bg-primary hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 font-bold tracking-widest text-black uppercase shadow-[0_0_15px_var(--color-primary)] transition-all hover:scale-[1.02] active:scale-95 disabled:pointer-events-none disabled:opacity-50"
      >
        {#if isPaySpinnerVisible}
          <div
            class="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent"
          ></div>
        {/if}
        <span>{payLabelText}</span>
      </button>
      <button
        onclick={handleAbortClick}
        class:hidden={isBtnAbortHidden}
        class="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2 font-bold tracking-widest text-white/70 uppercase transition-colors hover:bg-white/10 hover:text-white"
      >
        Abort
      </button>
    </div>
  {/snippet}
</Modal>

<!-- Wallet reconnect overlay -->
<div
  class="pointer-events-none fixed inset-0 z-[99998] items-center justify-center bg-black/80 backdrop-blur-sm"
  class:hidden={!isOverlayVisible}
  class:flex={isOverlayVisible}
>
  <div class="flex flex-col items-center gap-4 text-center">
    <div
      class="border-primary h-12 w-12 animate-spin rounded-full border-4 border-t-transparent"
    ></div>
    <p class="font-mono text-base tracking-widest text-white/80 uppercase">
      Awaiting wallet reconnection…
    </p>
  </div>
</div>
