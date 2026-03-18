<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import {gameActions, gameState} from "@/lib/game/state";
  import {config} from "@/lib/config/client";
  import {initializeJunoSatellite} from "@/lib/utils/juno";
  import {getErrors} from "@/lib/satellite/satellite-api";
  import Badge from "@/components/ui/Badge.svelte";
  import Button from "@/components/ui/Button.svelte";

  const gp = config.gameplay;
  const thresholds = gp.health_bar.thresholds;
  const maxCharge = gp.entities.player.super.max_charge;
  const playerLives = gp.entities.player.lives;
  const bossHealth = gp.entities.boss.health;

  let hp = $state(gp.entities.player.health);
  let score = $state(0);
  let keysObj = $state(0);
  let timerObj = $state(gp.time_limit_seconds);
  let lives = $state(1);
  let superCharge = $state(0);

  let phase = $state("start");
  let curBossHp = $state(0);
  let curBossMaxHp = $state(0);

  let isAdmin = $state(false);
  let unsubState: () => void;

  let pct = $derived(Number(superCharge) / Number(maxCharge));
  let superRingColor = $derived(
    pct < 0.25
      ? "text-error"
      : pct < 0.5
        ? "text-warning"
        : pct < 0.75
          ? "text-accent"
          : pct < 1
            ? "text-success"
            : "text-secondary"
  );
  let superRingPulse = $derived(Number(superCharge) >= Number(maxCharge));

  let bossHpPercent = $derived(
    curBossMaxHp > 0 ? (curBossHp / curBossMaxHp) * 100 : 0
  );

  onMount(() => {
    initializeJunoSatellite()
      .then(async () => {
        try {
          const result = await getErrors();
          if ("Ok" in result) isAdmin = true;
        } catch {}
      })
      .catch(() => {});

    unsubState = gameState.subscribe((state) => {
      hp = state.hp;
      score = state.score;
      keysObj = state.keys;
      lives = state.lives;
      timerObj = state.timer;
      superCharge = state.superCharge;
      phase = state.phase;
      curBossHp = Math.max(0, state.bossHp);
      curBossMaxHp = state.bossMaxHp;
    });
  });

  onDestroy(() => {
    if (unsubState) unsubState();
  });

  function handlePauseClick(e: Event) {
    gameActions.togglePause();
    (e.currentTarget as HTMLElement)?.blur();
  }

  function getMin(t: number) {
    return Math.floor(t / 60)
      .toString()
      .padStart(2, "0");
  }
  function getSec(t: number) {
    return (t % 60).toString().padStart(2, "0");
  }
</script>

<div
  class="hud-desktop:p-4 pointer-events-none absolute inset-0 flex flex-col justify-between p-2"
  style="padding-top: max(0.5rem, var(--safe-top)); padding-left: max(0.5rem, var(--safe-left)); padding-right: max(0.5rem, var(--safe-right)); padding-bottom: max(0.5rem, var(--safe-bottom));"
>
  <!-- Top Bar -->
  <div class="hud-desktop:gap-4 grid w-full grid-cols-3 items-start gap-1">
    <!-- Left: Stats row -->
    <div class="flex justify-start">
      <div
        class="divide-primary/10 border-primary/20 pointer-events-auto flex divide-x overflow-hidden rounded-lg border bg-black/70 shadow-lg backdrop-blur"
      >
        <!-- HP -->
        <div
          class="hud-desktop:p-2 hud-desktop:px-4 flex flex-col items-center p-1 px-2"
        >
          <div
            class="hud-desktop:text-[10px] text-center text-[8px] uppercase opacity-50"
          >
            <span class="hud-emoji">❤️</span><span class="hud-label">HP</span>
          </div>
          <div
            class="hud-desktop:text-xl text-error text-center font-mono text-sm font-bold"
          >
            {hp}
          </div>
        </div>
        <!-- Score -->
        <div
          class="hud-desktop:p-2 hud-desktop:px-4 flex flex-col items-center p-1 px-2"
        >
          <div
            class="hud-desktop:text-[10px] text-center text-[8px] uppercase opacity-50"
          >
            <span class="hud-emoji">⭐</span><span class="hud-label">Score</span
            >
          </div>
          <div
            class="hud-desktop:text-xl text-primary text-center font-mono text-sm font-bold"
          >
            {score}
          </div>
        </div>
        <!-- Keys -->
        <div
          class="hud-desktop:p-2 hud-desktop:px-4 flex flex-col items-center p-1 px-2"
        >
          <div
            class="hud-desktop:text-[10px] text-center text-[8px] uppercase opacity-50"
          >
            <span class="hud-emoji">🔑</span><span class="hud-label">Keys</span>
          </div>
          <div
            class="hud-desktop:text-xl text-secondary text-center font-mono text-sm font-bold"
          >
            {keysObj}
          </div>
        </div>
        {#if playerLives > 1}
          <div
            class="hud-desktop:p-2 hud-desktop:px-4 flex flex-col items-center p-1 px-2"
          >
            <div
              class="hud-desktop:text-[10px] text-center text-[8px] uppercase opacity-50"
            >
              <span class="hud-emoji">🛡️</span><span class="hud-label"
                >Lives</span
              >
            </div>
            <div
              class="hud-desktop:text-xl text-warning font-mono text-sm font-bold"
            >
              {lives}
            </div>
          </div>
        {/if}
        <!-- Super Charge Radial Ring -->
        <div
          class="hud-desktop:p-2 hud-desktop:px-3 flex flex-col items-center p-1 px-2"
        >
          <div
            class="hud-desktop:text-[10px] text-center text-[8px] uppercase opacity-50"
          >
            <span class="hud-emoji">⚡</span><span class="hud-label">Super</span
            >
          </div>
          <div class="flex items-center justify-center">
            <!-- SVG radial super-charge ring -->
            <div
              class={`relative flex items-center justify-center ${superRingPulse ? "animate-pulse" : ""}`}
              style={superRingPulse
                ? "filter: drop-shadow(0 0 8px #a855f7);"
                : ""}
              role="progressbar"
              aria-valuenow={Math.round(pct * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 36 36"
                class="-rotate-90"
              >
                <!-- Track -->
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  stroke-width="3"
                />
                <!-- Fill arc -->
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke={pct < 0.25
                    ? "#ef4444"
                    : pct < 0.5
                      ? "#f59e0b"
                      : pct < 0.75
                        ? "#06b6d4"
                        : pct < 1
                          ? "#22c55e"
                          : "#a855f7"}
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-dasharray={`${pct * 94.25} 94.25`}
                  style="transition: stroke-dasharray 0.2s ease, stroke 0.2s ease;"
                />
              </svg>
              <span class="absolute text-xs select-none">⚡</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Center: Timer -->
    <div class="flex justify-center">
      <div
        class="pointer-events-auto overflow-hidden rounded-lg border border-red-500/20 bg-black/70 shadow-lg backdrop-blur"
      >
        <div
          class="hud-desktop:p-2 hud-desktop:px-6 flex flex-col items-center p-1 px-3"
        >
          <div
            class="hud-desktop:text-[10px] text-center text-[8px] uppercase opacity-50"
          >
            <span class="hud-emoji">🕐</span><span class="hud-label"
              >System Clock</span
            >
          </div>
          <div
            class={`hud-desktop:text-lg hud-tall:text-3xl flex items-center justify-center font-mono text-sm font-bold tabular-nums ${timerObj <= 3 && timerObj > 0 ? "text-warning scale-110 animate-pulse" : "text-red-400"}`}
          >
            {getMin(timerObj)}:{getSec(timerObj)}
          </div>
        </div>
      </div>
    </div>

    <!-- Right: Admin icon -->
    <div class="flex justify-end">
      {#if isAdmin}
        <a
          href="/admin"
          class="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white opacity-70 transition-colors hover:bg-white/20 hover:opacity-100"
          title="Admin panel"
          aria-label="Admin panel">🛡️</a
        >
      {/if}
    </div>
  </div>

  <!-- Bottom HUD Area -->
  <div class="grid w-full grid-cols-3 items-end">
    <div class="min-w-0"></div>

    <!-- Center: Pause Button + Phase Alerts -->
    <div
      class="hud-desktop:gap-2 hud-desktop:pb-4 flex flex-col items-center gap-1 pb-2"
    >
      <div class={phase === "boss" || phase === "victory" ? "" : "hidden"}>
        <Badge
          variant={phase === "boss" ? "primary" : "success"}
          size="md"
          class="hud-desktop:text-xs text-[10px]"
        >
          {phase === "boss" ? "BULL MARKET" : "VICTORY"}
        </Badge>
      </div>
      <Button
        variant="primary"
        size="sm"
        onclick={handlePauseClick}
        class="hud-desktop:w-12 hud-desktop:h-12 hud-desktop:text-xl pointer-events-auto min-h-[48px] min-w-[48px] rounded-full border-2 border-white/10 shadow-xl"
        title="Pause Mission (ESC)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
      </Button>
    </div>

    <!-- Right: Boss HP Bar -->
    <div class="flex min-w-0 flex-col items-end justify-end gap-2">
      <div
        class={`border-error/30 hud-desktop:w-40 hud-desktop:p-1.5 hud-tall:w-48 pointer-events-auto w-28 rounded-lg border bg-black/70 p-1 shadow-lg backdrop-blur ${phase === "boss" && curBossHp > 0 && curBossMaxHp > 0 ? "" : "hidden"}`}
      >
        <div class="flex items-center justify-between">
          <span class="text-error text-[9px] font-bold uppercase opacity-80"
            >BOSS</span
          >
          <span class="text-error font-mono text-[10px]"
            >{curBossHp}/{curBossMaxHp}</span
          >
        </div>
        <progress
          class={`mt-0.5 h-2 w-full overflow-hidden rounded-full bg-white/10`}
          value={bossHpPercent}
          max="100"
          style={`accent-color: ${bossHpPercent > thresholds.high * 100 ? "#22c55e" : bossHpPercent > thresholds.medium * 100 ? "#f59e0b" : bossHpPercent > thresholds.low * 100 ? "#06b6d4" : "#ef4444"}`}
        ></progress>
      </div>
    </div>
  </div>
</div>

<style>
  .hud-emoji {
    display: inline;
  }
  .hud-label {
    display: none;
  }

  @media (min-height: 520px) {
    .hud-emoji {
      display: none;
    }
    .hud-label {
      display: inline;
    }
    .hud-desktop\:p-2 {
      padding: 0.5rem;
    }
    .hud-desktop\:p-4 {
      padding: 1rem;
    }
    .hud-desktop\:px-3 {
      padding-left: 0.75rem;
      padding-right: 0.75rem;
    }
    .hud-desktop\:px-4 {
      padding-left: 1rem;
      padding-right: 1rem;
    }
    .hud-desktop\:px-6 {
      padding-left: 1.5rem;
      padding-right: 1.5rem;
    }
    .hud-desktop\:gap-2 {
      gap: 0.5rem;
    }
    .hud-desktop\:gap-4 {
      gap: 1rem;
    }
    .hud-desktop\:pb-4 {
      padding-bottom: 1rem;
    }
    .hud-desktop\:text-\[10px\] {
      font-size: 10px;
    }
    .hud-desktop\:text-xs {
      font-size: 0.75rem;
      line-height: 1rem;
    }
    .hud-desktop\:text-lg {
      font-size: 1.125rem;
      line-height: 1.75rem;
    }
    .hud-desktop\:text-xl {
      font-size: 1.25rem;
      line-height: 1.75rem;
    }
    .hud-desktop\:w-40 {
      width: 10rem;
    }
    .hud-desktop\:p-1\.5 {
      padding: 0.375rem;
    }
  }

  @media (min-height: 768px) {
    .hud-tall\:text-3xl {
      font-size: 1.875rem;
      line-height: 2.25rem;
    }
    .hud-tall\:w-48 {
      width: 12rem;
    }
  }
</style>
