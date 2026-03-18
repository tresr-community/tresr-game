<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { gameState, type GameState } from "@/lib/game/state";
  import { clearFeePaid, getSessionId } from "@/lib/game/fee-gate";
  import { claimWin, getClaimCooldownStatus } from "@/lib/blockchain/contracts/vault";
  import { getConnectedAddress } from "@/lib/wallet/connection";
  import { getAuthState } from "@/lib/auth";
  import { checkBanStatus } from "@/lib/auth/ban";
  import { getUserProfile } from "@/lib/user";
  import { log } from "@/lib/utils/log";

  let modalVictory: HTMLDialogElement;
  let modalLost: HTMLDialogElement;

  let victoryRewardText = "$0 TRESR";
  let score = "0";
  let keys = "0";
  let enemies = "0";
  let _time = "0:00";

  let showVictoryHighScore = false;
  let showLostHighScore = false;

  let isClaimInProgress = false;

  let lastClaimAuth: [bigint, Uint8Array | number[]] | null = null;
  let unsubState: () => void;

  function formatTokenAmount(amount: bigint): string {
    const whole = amount / 10n ** 18n;
    const frac = amount % 10n ** 18n;
    const fracStr = frac.toString().padStart(18, "0").slice(0, 4);
    return `${whole}.${fracStr}`;
  }

  function handleClaimAuth(e: Event) {
    lastClaimAuth = (e as CustomEvent<[bigint, Uint8Array | number[]]>).detail;
    if (lastClaimAuth) {
      victoryRewardText = `${formatTokenAmount(lastClaimAuth[0])} TRESR`;
    }
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  async function populateStats(prefix: string, state: GameState) {
    score = state.score.toString();
    keys = state.keys.toString();
    enemies = state.enemiesKilled.toString();
    _time = formatTime(state.timer);

    const auth = getAuthState();
    if (auth.isAuthenticated && !auth.isGuest && auth.user) {
      try {
        const doc = await getUserProfile(auth.user.key);
        if (doc && BigInt(state.score) > (doc.data.stats.high_score || 0n)) {
          if (prefix === "victory") showVictoryHighScore = true;
          else if (prefix === "lost") showLostHighScore = true;
        }
      } catch {
        // Ignore best-effort
      }
    }
  }

  async function handleClaimClick() {
    if (isClaimInProgress) return;
    const auth = getAuthState();

    if (auth.isGuest) {
      window.showWarningToast?.("Sorry, Normies don't get any rewards");
      return;
    }

    if (auth.isAuthenticated && auth.user) {
      const banInfo = await checkBanStatus(auth.user.key);
      if (banInfo) {
        document.dispatchEvent(
          new CustomEvent("tresr:ban-modal-open", {
            detail: {
              banned_until: banInfo.bannedUntil,
              offence_count: banInfo.offenceCount,
            },
          })
        );
        return;
      }
    }

    const walletAddr = getConnectedAddress();
    if (walletAddr) {
      try {
        const cooldown = await getClaimCooldownStatus(walletAddr);
        if (!cooldown.canClaim) {
          const hours = Math.floor(cooldown.remainingSeconds / 3600);
          const mins = Math.floor((cooldown.remainingSeconds % 3600) / 60);
          window.showWarningToast?.(`Cooldown active: ${hours}h ${mins}m remaining. 1 claim per 24 hours.`);
          return;
        }
      } catch {
        log.warn("GameModals", "Could not check cooldown — proceeding.");
      }
    }

    if (!lastClaimAuth) {
      window.showWarningToast?.("No claim authorization found. Are you trying to cheat Degen?");
      return;
    }

    isClaimInProgress = true;
    try {
      const [amount, sigBytes] = lastClaimAuth;
      const state = gameState.get();
      const sessionId = getSessionId();
      if (!sessionId) {
        window.showErrorToast?.("Session expired. Please restart the game.");
        isClaimInProgress = false;
        return;
      }

      const sigArray = sigBytes instanceof Uint8Array ? sigBytes : new Uint8Array(sigBytes);
      const sigHex = `0x${Array.from(sigArray).map((b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;

      const hash = await claimWin(sessionId, amount, state.keys, sigHex);
      window.showInfoToast?.(`Claim successful! Tx: ${hash}`);
      setTimeout(() => {
        window.location.href = "/";
      }, 3000);
    } catch (e) {
      log.error("GameModals", "Claim failed:", e);
      window.showErrorToast?.("Claim failed. Check console for details.");
      isClaimInProgress = false;
    }
  }

  function handleRetry() {
    clearFeePaid();
    window.location.reload();
  }

  function handleHome() {
    window.location.href = "/";
  }

  onMount(() => {
    document.addEventListener("tresr:claim-auth", handleClaimAuth);

    unsubState = gameState.subscribe((state) => {
      if (state.phase === "victory") {
        if (modalVictory && !modalVictory.open) {
          const auth = getAuthState();
          if (auth.isGuest) {
            victoryRewardText = "No rewards for normies.";
          } else if (lastClaimAuth) {
            victoryRewardText = `${formatTokenAmount(lastClaimAuth[0])} TRESR`;
          } else {
            victoryRewardText = "Calculating...";
          }
          populateStats("victory", state);
          modalVictory.showModal();
        }
      } else if (state.phase === "lost") {
        if (modalLost && !modalLost.open) {
          populateStats("lost", state);
          modalLost.showModal();
        }
      } else {
        if (modalVictory && modalVictory.open) modalVictory.close();
        if (modalLost && modalLost.open) modalLost.close();
      }
    });
  });

  onDestroy(() => {
    document.removeEventListener("tresr:claim-auth", handleClaimAuth);
    if (unsubState) unsubState();
  });
</script>

<dialog bind:this={modalVictory} class="modal modal-middle">
  <div class="modal-box border-success/30 bg-base-300 h-full max-h-full w-full max-w-full border text-center sm:h-auto sm:max-h-[85vh] sm:w-auto sm:max-w-lg sm:rounded-2xl">
    <h3 class="text-success font-display text-2xl font-black tracking-widest uppercase sm:text-4xl">
      Mission Complete
    </h3>
    <p class="py-2 text-sm opacity-70 sm:py-4 sm:text-base">
      The Banker has been regulated. The vault is yours.
    </p>

    <div class="stats stats-vertical bg-base-200/50 my-2 w-full shadow sm:my-4">
      <div class="stat">
        <div class="stat-title text-xs uppercase">Reward</div>
        <div class="stat-value text-primary font-mono">{victoryRewardText}</div>
      </div>
    </div>

    <div class="stats stats-horizontal bg-base-200/50 my-1 w-full shadow sm:my-2">
      <div class="stat place-items-center px-2 py-1 sm:px-4 sm:py-2">
        <div class="stat-title text-xs uppercase">Score</div>
        <div class="stat-value text-primary font-mono text-sm sm:text-lg">{score}</div>
      </div>
      <div class="stat place-items-center px-2 py-1 sm:px-4 sm:py-2">
        <div class="stat-title text-xs uppercase">Keys</div>
        <div class="stat-value text-info font-mono text-sm sm:text-lg">{keys}</div>
      </div>
      <div class="stat place-items-center px-2 py-1 sm:px-4 sm:py-2">
        <div class="stat-title text-xs uppercase">Enemies</div>
        <div class="stat-value text-error font-mono text-sm sm:text-lg">{enemies}</div>
      </div>
      <div class="stat place-items-center px-2 py-1 sm:px-4 sm:py-2">
        <div class="stat-title text-xs uppercase">Time</div>
        <div class="stat-value text-warning font-mono text-sm sm:text-lg">{_time}</div>
      </div>
    </div>

    <div class="text-accent font-display my-1 text-lg font-bold" class:hidden={!showVictoryHighScore}>
      New High Score!
    </div>

    <div class="modal-action flex-col gap-1 sm:gap-2">
      <button on:click={handleClaimClick} class="btn btn-primary btn-block" class:loading={isClaimInProgress} disabled={isClaimInProgress}>
        Claim $TRESR
      </button>
      <button on:click={handleHome} class="btn btn-ghost btn-block">
        Return Home
      </button>
    </div>
  </div>
</dialog>

<dialog bind:this={modalLost} class="modal modal-middle">
  <div class="modal-box border-error/30 bg-base-300 h-full max-h-full w-full max-w-full border text-center sm:h-auto sm:max-h-[85vh] sm:w-auto sm:max-w-lg sm:rounded-2xl">
    <h3 class="text-error font-display text-2xl font-black tracking-widest uppercase sm:text-4xl">
      YOU HAVE BEEN RUGGED
    </h3>
    <p class="py-2 text-sm opacity-70 sm:py-4 sm:text-base">
      Sorry Degen, the Bankers have won this round.
    </p>

    <div class="stats stats-horizontal bg-base-200/50 my-1 w-full shadow sm:my-2">
      <div class="stat place-items-center px-2 py-1 sm:px-4 sm:py-2">
        <div class="stat-title text-xs uppercase">Score</div>
        <div class="stat-value text-primary font-mono text-sm sm:text-lg">{score}</div>
      </div>
      <div class="stat place-items-center px-2 py-1 sm:px-4 sm:py-2">
        <div class="stat-title text-xs uppercase">Keys</div>
        <div class="stat-value text-info font-mono text-sm sm:text-lg">{keys}</div>
      </div>
      <div class="stat place-items-center px-2 py-1 sm:px-4 sm:py-2">
        <div class="stat-title text-xs uppercase">Enemies</div>
        <div class="stat-value text-error font-mono text-sm sm:text-lg">{enemies}</div>
      </div>
      <div class="stat place-items-center px-2 py-1 sm:px-4 sm:py-2">
        <div class="stat-title text-xs uppercase">Time</div>
        <div class="stat-value text-warning font-mono text-sm sm:text-lg">{_time}</div>
      </div>
    </div>

    <div class="text-accent font-display my-1 text-lg font-bold" class:hidden={!showLostHighScore}>
      New High Score!
    </div>

    <div class="modal-action flex-col gap-1 sm:gap-2">
      <button on:click={handleRetry} class="btn btn-error btn-block">
        Retry Mission
      </button>
      <button on:click={handleHome} class="btn btn-ghost btn-block text-error">
        Abort
      </button>
    </div>
  </div>
</dialog>
