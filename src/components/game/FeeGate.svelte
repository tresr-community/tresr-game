<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { config } from "@/lib/config/client";
  import { getEnvironmentKey } from "@/lib/blockchain/networks/chain";
  import { getExplorerUrl } from "@/lib/blockchain/networks/display";
  import { payFeeForGame } from "@/lib/blockchain/contracts/vault";
  import { setDoc, getDoc } from "@junobuild/core";
  import { connectWallet, getHydratedAddress } from "@/lib/wallet/connection";
  import { confirmReceipt } from "@/lib/blockchain/tx";
  import { getTresrBalance, formatBalance, parseBalance } from "@/lib/blockchain/balance";
  import { markFeePaid, resolveFeeGate, rejectFeeGate } from "@/lib/game/fee-gate";
  import { log } from "@/lib/utils/log";
  import { trackFeePaid, trackError } from "@/lib/metrics/analytics";
  import { reportError } from "@/lib/utils/error-reporter";

  const COMPONENT_NAME = "FeeGate";
  const PAYMENT_TIMEOUT_MS = 60_000;

  const env = getEnvironmentKey();
  const chainConfig = config.blockchain.avalanche[env];
  const feeAmountStr = chainConfig.fee;
  const ticker = chainConfig.token_ticker;

  let dialog: HTMLDialogElement;
  let isOverlayVisible = false;
  let isProgressVisible = false;
  let isStatusVisible = false;

  let statusMessage = "";
  let isStatusError = false;

  let btnPayDisabled = false;
  let isPaySpinnerVisible = false;
  let payLabelText = "APE IN";
  let isBtnAbortHidden = false;

  let stepWalletState: "none" | "active" | "done" | "error" = "none";
  let stepBalanceState: "none" | "active" | "done" | "error" = "none";
  let stepApproveState: "none" | "active" | "done" | "error" = "none";
  let stepFeeState: "none" | "active" | "done" | "error" = "none";
  let stepConfirmState: "none" | "active" | "done" | "error" = "none";

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
    dialog.showModal();
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
        dialog.close();
        rejectFeeGate();
        window.location.href = "/";
      }, PAYMENT_TIMEOUT_MS);

      markStep("wallet", "active");
      let address: `0x${string}`;

      const connectedAddress = await getHydratedAddress();
      if (connectedAddress) {
        address = (await connectWallet()).address;
        showStatus("Wallet connected ✓");
      } else {
        showStatus("Connecting wallet...");
        isOverlayVisible = true;
        dialog.close();
        const connection = await connectWallet();
        isOverlayVisible = false;
        address = connection.address;
        dialog.showModal();
      }
      markStep("wallet", "done");

      markStep("balance", "active");
      showStatus("Checking balance...");
      const balance = await getTresrBalance(address);
      const feeWei = parseBalance(String(feeAmountStr));

      if (balance < feeWei) {
        const formatted = formatBalance(balance);
        markStep("balance", "error");
        showStatus(`Insufficient balance: ${formatted} $${ticker} (need ${feeAmountStr} $${ticker})`, true);
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
      const randomHex = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      const raw = new TextEncoder().encode(`${address}:${ts}:${randomHex}`);
      const hashBuf = await crypto.subtle.digest("SHA-256", raw);
      const hashArr = new Uint8Array(hashBuf);
      const sessionId = `0x${Array.from(hashArr).map((b) => b.toString(16).padStart(2, "0")).join("")}`;

      markStep("approve", "active");
      showStatus("Checking token approval...");
      const txHash = await payFeeForGame(sessionId, feeWei);
      markStep("approve", "done");
      markStep("fee", "done");

      markStep("confirm", "active");
      await confirmReceipt(txHash, {
        component: "FeeGate",
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
        const docData = feeDoc?.data as {status?: string; error?: string} | undefined;
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
        throw new Error(feeStatus === "failed" ? "satellite:verification_failed" : "satellite:timeout");
      }

      trackFeePaid(txHash);
      showStatus("Verified! Starting mission...");
      await new Promise((r) => setTimeout(r, 600));

      clearPaymentTimeout();
      dialog.close();
      resolveFeeGate();
    } catch (error: unknown) {
      clearPaymentTimeout();
      isOverlayVisible = false;
      const message = error instanceof Error ? error.message : String(error);
      log.error(COMPONENT_NAME, "Fee payment failed:", error);
      trackError("fee_paid", message);

      if (!dialog.open) dialog.showModal();

      if (message === "satellite:verification_failed") {
        showStatus("Failed to verify transaction — please try again.", true);
      } else if (message === "satellite:timeout") {
        showStatus("Verification timed out — please try again.", true);
      } else if (message.includes("User rejected") || message.includes("user rejected") || message.includes("cancelled") || message.includes("denied")) {
        showStatus("Transaction rejected by user.", true);
      } else {
        const errorId = await reportError(COMPONENT_NAME, "Fee payment failed", message);
        showStatus(errorId ? `Payment error – ref: ${errorId}` : `Payment error – contact support`, true);
      }

      paymentInProgress = false;
      btnPayDisabled = false;
      isPaySpinnerVisible = false;
      payLabelText = "APE IN";
      isBtnAbortHidden = false;
    }
  }

  function handleAbortClick() {
    dialog.close();
    rejectFeeGate();
  }

  onMount(() => {
    document.addEventListener("tresr:fee-gate-open", handleFeeGateOpen);
  });

  onDestroy(() => {
    document.removeEventListener("tresr:fee-gate-open", handleFeeGateOpen);
    clearPaymentTimeout();
  });

  function getStepClass(state: string) {
    if (state === "active") return "step-primary";
    if (state === "done") return "step-success";
    if (state === "error") return "step-error";
    return "";
  }
</script>

<dialog bind:this={dialog} class="modal modal-middle" id="modal-fee-gate">
  <div class="modal-box border-primary/30 bg-base-300 max-h-[90vh] overflow-y-auto border p-4 text-center sm:p-6">
    <h3 class="text-primary font-display text-xl font-black tracking-widest uppercase sm:text-3xl">
      Entry Fee Required
    </h3>

    <div class="stats stats-vertical bg-base-200/50 my-2 w-full shadow sm:my-4">
      <div class="stat">
        <div class="stat-title text-xs uppercase">Fee Amount</div>
        <div class="stat-value text-warning font-mono text-lg sm:text-2xl">
          {feeAmountStr} ${ticker}
        </div>
      </div>
    </div>

    <!-- Transaction progress steps -->
    <div class="my-2 sm:my-4" class:hidden={!isProgressVisible}>
      <ul class="steps steps-vertical w-full text-left text-xs sm:text-sm">
        <li class={`step ${getStepClass(stepWalletState)}`}>Connect wallet</li>
        <li class={`step ${getStepClass(stepBalanceState)}`}>Check balance</li>
        <li class={`step ${getStepClass(stepApproveState)}`}>Approve token spend</li>
        <li class={`step ${getStepClass(stepFeeState)}`}>Pay fee to vault</li>
        <li class={`step ${getStepClass(stepConfirmState)}`}>Confirm on-chain</li>
      </ul>
    </div>

    <!-- Status messages -->
    <div
      class="my-1 text-xs sm:my-2 sm:text-sm"
      class:hidden={!isStatusVisible}
      class:text-error={isStatusError}
      class:opacity-70={!isStatusError}
    >
      {statusMessage}
    </div>

    <div class="modal-action flex-col gap-1 sm:gap-2">
      <button on:click={handlePayClick} disabled={btnPayDisabled} class="btn btn-primary btn-block gap-2">
        <span class="loading loading-spinner loading-sm" class:hidden={!isPaySpinnerVisible}></span>
        <span>{payLabelText}</span>
      </button>
      <button on:click={handleAbortClick} class="btn btn-ghost btn-block" class:hidden={isBtnAbortHidden}>
        Abort
      </button>
    </div>
  </div>
</dialog>

<!-- Wallet reconnect overlay -->
<div
  class="bg-base-300/80 pointer-events-none fixed inset-0 z-[99998] items-center justify-center backdrop-blur-sm"
  class:hidden={!isOverlayVisible}
  class:flex={isOverlayVisible}
>
  <div class="flex flex-col items-center gap-4 text-center">
    <span class="loading loading-spinner loading-lg text-primary"></span>
    <p class="text-base font-bold tracking-wide opacity-80">
      Awaiting wallet reconnection…
    </p>
  </div>
</div>
