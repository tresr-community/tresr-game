<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import {gameState, type GameState} from "@/lib/game/state";
  import {clearFeePaid, getSessionId} from "@/lib/game/fee-gate";
  import {
    claimWin,
    getClaimCooldownStatus,
  } from "@/lib/blockchain/contracts/vault";
  import {getConnectedAddress} from "@/lib/wallet/connection";
  import {getAuthState} from "@/lib/auth";
  import {checkBanStatus} from "@/lib/auth/ban";
  import {getUserProfile} from "@/lib/user";
  import {log} from "@/lib/utils/log";
  import Modal from "@/components/ui/Modal.svelte";
  import {banModal} from "@/lib/stores/ui.svelte";

  let openVictory = $state(false);
  let openLost = $state(false);

  let victoryRewardText = $state("$0 TRESR");
  let score = $state("0");
  let keys = $state("0");
  let enemies = $state("0");
  let _time = $state("0:00");

  let showVictoryHighScore = $state(false);
  let showLostHighScore = $state(false);

  let isClaimInProgress = $state(false);

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
        banModal.set({
          banned_until: banInfo.bannedUntil,
          offence_count: banInfo.offenceCount,
        });
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
          window.showWarningToast?.(
            `Cooldown active: ${hours}h ${mins}m remaining. 1 claim per 24 hours.`
          );
          return;
        }
      } catch {
        log.warn("GameModals", "Could not check cooldown — proceeding.");
      }
    }

    if (!lastClaimAuth) {
      window.showWarningToast?.(
        "No claim authorization found. Are you trying to cheat Degen?"
      );
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

      const sigArray =
        sigBytes instanceof Uint8Array ? sigBytes : new Uint8Array(sigBytes);
      const sigHex = `0x${Array.from(sigArray)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}` as `0x${string}`;

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
        if (!openVictory) {
          const auth = getAuthState();
          if (auth.isGuest) {
            victoryRewardText = "No rewards for normies.";
          } else if (lastClaimAuth) {
            victoryRewardText = `${formatTokenAmount(lastClaimAuth[0])} TRESR`;
          } else {
            victoryRewardText = "Calculating...";
          }
          populateStats("victory", state);
          openVictory = true;
        }
      } else if (state.phase === "lost") {
        if (!openLost) {
          populateStats("lost", state);
          openLost = true;
        }
      } else {
        if (openVictory) openVictory = false;
        if (openLost) openLost = false;
      }
    });
  });

  onDestroy(() => {
    document.removeEventListener("tresr:claim-auth", handleClaimAuth);
    if (unsubState) unsubState();
  });
</script>

<Modal
  bind:open={openVictory}
  title="Mission Complete"
  closeOnEscape={false}
  closeOnOutsideClick={false}
>
  <p class="py-2 text-center text-sm opacity-70 sm:py-4 sm:text-base">
    The Banker has been regulated. The vault is yours.
  </p>

  <div
    class="my-4 flex w-full flex-col gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 shadow-inner"
  >
    <div class="flex flex-col items-center bg-black/40 p-3">
      <div
        class="text-[10px] font-bold tracking-widest text-[#10b981] uppercase"
      >
        Reward
      </div>
      <div class="text-primary mt-1 font-mono text-sm font-bold sm:text-2xl">
        {victoryRewardText}
      </div>
    </div>
  </div>

  <div
    class="mb-4 grid w-full grid-cols-4 gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 shadow-inner"
  >
    <div class="flex flex-col items-center bg-black/40 p-2 sm:p-3">
      <div
        class="text-[10px] font-bold tracking-widest text-white/50 uppercase"
      >
        Score
      </div>
      <div class="text-primary font-mono text-sm font-bold sm:text-lg">
        {score}
      </div>
    </div>
    <div class="flex flex-col items-center bg-black/40 p-2 sm:p-3">
      <div
        class="text-[10px] font-bold tracking-widest text-white/50 uppercase"
      >
        Keys
      </div>
      <div class="font-mono text-sm font-bold text-[#38bdf8] sm:text-lg">
        {keys}
      </div>
    </div>
    <div class="flex flex-col items-center bg-black/40 p-2 sm:p-3">
      <div
        class="text-[10px] font-bold tracking-widest text-white/50 uppercase"
      >
        Enemies
      </div>
      <div class="font-mono text-sm font-bold text-[#f87171] sm:text-lg">
        {enemies}
      </div>
    </div>
    <div class="flex flex-col items-center bg-black/40 p-2 sm:p-3">
      <div
        class="text-[10px] font-bold tracking-widest text-white/50 uppercase"
      >
        Time
      </div>
      <div class="font-mono text-sm font-bold text-[#facc15] sm:text-lg">
        {_time}
      </div>
    </div>
  </div>

  <div
    class="font-display my-2 text-center text-lg font-bold text-[#a78bfa] {showVictoryHighScore
      ? ''
      : 'hidden'}"
  >
    New High Score!
  </div>

  {#snippet footer()}
    <div class="flex w-full flex-col gap-2">
      <button
        onclick={handleClaimClick}
        disabled={isClaimInProgress}
        class="bg-primary hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 font-bold tracking-widest text-black uppercase shadow-[0_0_15px_var(--color-primary)] transition-all hover:scale-[1.02] active:scale-95 disabled:pointer-events-none disabled:opacity-50"
      >
        {#if isClaimInProgress}
          <div
            class="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent"
          ></div>
        {/if}
        Claim $TRESR
      </button>
      <button
        onclick={handleHome}
        class="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2 font-bold tracking-widest text-white/70 uppercase transition-colors hover:bg-white/10 hover:text-white"
      >
        Return Home
      </button>
    </div>
  {/snippet}
</Modal>

<Modal
  bind:open={openLost}
  title="YOU HAVE BEEN RUGGED"
  closeOnEscape={false}
  closeOnOutsideClick={false}
>
  <p class="py-2 text-center text-sm opacity-70 sm:py-4 sm:text-base">
    Sorry Degen, the Bankers have won this round.
  </p>

  <div
    class="mt-2 mb-4 grid w-full grid-cols-4 gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 shadow-inner"
  >
    <div class="flex flex-col items-center bg-black/40 p-2 sm:p-3">
      <div
        class="text-[10px] font-bold tracking-widest text-white/50 uppercase"
      >
        Score
      </div>
      <div class="text-primary font-mono text-sm font-bold sm:text-lg">
        {score}
      </div>
    </div>
    <div class="flex flex-col items-center bg-black/40 p-2 sm:p-3">
      <div
        class="text-[10px] font-bold tracking-widest text-white/50 uppercase"
      >
        Keys
      </div>
      <div class="font-mono text-sm font-bold text-[#38bdf8] sm:text-lg">
        {keys}
      </div>
    </div>
    <div class="flex flex-col items-center bg-black/40 p-2 sm:p-3">
      <div
        class="text-[10px] font-bold tracking-widest text-white/50 uppercase"
      >
        Enemies
      </div>
      <div class="font-mono text-sm font-bold text-[#f87171] sm:text-lg">
        {enemies}
      </div>
    </div>
    <div class="flex flex-col items-center bg-black/40 p-2 sm:p-3">
      <div
        class="text-[10px] font-bold tracking-widest text-white/50 uppercase"
      >
        Time
      </div>
      <div class="font-mono text-sm font-bold text-[#facc15] sm:text-lg">
        {_time}
      </div>
    </div>
  </div>

  <div
    class="font-display my-2 text-center text-lg font-bold text-[#a78bfa] {showLostHighScore
      ? ''
      : 'hidden'}"
  >
    New High Score!
  </div>

  {#snippet footer()}
    <div class="flex w-full flex-col gap-2">
      <button
        onclick={handleRetry}
        class="flex w-full items-center justify-center gap-2 rounded-md bg-[#ef4444] px-4 py-2 font-bold tracking-widest text-white uppercase shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all hover:scale-[1.02] hover:bg-[#dc2626] active:scale-95 disabled:pointer-events-none disabled:opacity-50"
      >
        Retry Mission
      </button>
      <button
        onclick={handleHome}
        class="w-full rounded-md border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-2 font-bold tracking-widest text-[#fca5a5] uppercase transition-colors hover:bg-[#ef4444]/20"
      >
        Abort
      </button>
    </div>
  {/snippet}
</Modal>
