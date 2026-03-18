<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { gameActions, gameState } from "@/lib/game/state";
  import { config } from "@/lib/config/client";
  import { initSatellite } from "@junobuild/core";
  import { getErrors } from "@/lib/satellite/satellite-api";

  const gp = config.gameplay;
  const thresholds = gp.health_bar.thresholds;
  const maxCharge = gp.entities.player.super.max_charge;
  const playerLives = gp.entities.player.lives;
  const bossHealth = gp.entities.boss.health;

  let hp = gp.entities.player.health;
  let score = 0;
  let keysObj = 0;
  let timerObj = gp.time_limit_seconds;
  let lives = 1;
  let superCharge = 0;

  let phase = "start";
  let curBossHp = 0;
  let curBossMaxHp = 0;

  let isAdmin = false;
  let unsubState: () => void;

  $: pct = Number(superCharge) / Number(maxCharge);
  $: superRingColor = pct < 0.25 ? "text-error" : pct < 0.5 ? "text-warning" : pct < 0.75 ? "text-accent" : pct < 1 ? "text-success" : "text-secondary";
  $: superRingPulse = Number(superCharge) >= Number(maxCharge);

  $: bossHpPercent = curBossMaxHp > 0 ? (curBossHp / curBossMaxHp) * 100 : 0;
  $: bossHpColor = bossHpPercent > thresholds.high * 100 ? "progress-success" : bossHpPercent > thresholds.medium * 100 ? "progress-warning" : bossHpPercent > thresholds.low * 100 ? "progress-accent" : "progress-error";

  onMount(() => {
    initSatellite().then(async () => {
      try {
        const result = await getErrors();
        if ("Ok" in result) isAdmin = true;
      } catch {}
    }).catch(() => {});

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

  function getMin(t: number) { return Math.floor(t / 60).toString().padStart(2, "0"); }
  function getSec(t: number) { return (t % 60).toString().padStart(2, "0"); }
</script>

<div class="hud-desktop:p-4 pointer-events-none absolute inset-0 flex flex-col justify-between p-2" style="padding-top: max(0.5rem, var(--safe-top)); padding-left: max(0.5rem, var(--safe-left)); padding-right: max(0.5rem, var(--safe-right)); padding-bottom: max(0.5rem, var(--safe-bottom));">
  <!-- Top Bar -->
  <div class="hud-desktop:gap-4 grid w-full grid-cols-3 items-start gap-1">
    <!-- Left: Stats -->
    <div class="flex justify-start">
      <div class="stats bg-base-300/80 border-primary/20 pointer-events-auto border shadow-lg backdrop-blur">
        <div class="stat hud-desktop:p-2 hud-desktop:px-4 p-1 px-2">
          <div class="stat-title hud-desktop:text-[10px] text-center text-[8px] uppercase opacity-50">
            <span class="hud-emoji">❤️</span><span class="hud-label">HP</span>
          </div>
          <div class="stat-value text-error hud-desktop:text-xl text-center font-mono text-sm">{hp}</div>
        </div>
        <div class="stat border-primary/10 hud-desktop:p-2 hud-desktop:px-4 border-l p-1 px-2">
          <div class="stat-title hud-desktop:text-[10px] text-center text-[8px] uppercase opacity-50">
            <span class="hud-emoji">⭐</span><span class="hud-label">Score</span>
          </div>
          <div class="stat-value text-primary hud-desktop:text-xl text-center font-mono text-sm">{score}</div>
        </div>
        <div class="stat border-primary/10 hud-desktop:p-2 hud-desktop:px-4 border-l p-1 px-2">
          <div class="stat-title hud-desktop:text-[10px] text-center text-[8px] uppercase opacity-50">
            <span class="hud-emoji">🔑</span><span class="hud-label">Keys</span>
          </div>
          <div class="stat-value text-secondary hud-desktop:text-xl text-center font-mono text-sm">{keysObj}</div>
        </div>
        {#if playerLives > 1}
        <div class="stat border-primary/10 hud-desktop:p-2 hud-desktop:px-4 border-l p-1 px-2">
          <div class="stat-title hud-desktop:text-[10px] text-center text-[8px] uppercase opacity-50">
            <span class="hud-emoji">🛡️</span><span class="hud-label">Lives</span>
          </div>
          <div class="stat-value text-warning hud-desktop:text-xl font-mono text-sm">{lives}</div>
        </div>
        {/if}
        <!-- Super Charge Radial Ring -->
        <div class="stat border-primary/10 hud-desktop:p-2 hud-desktop:px-3 border-l p-1 px-2">
          <div class="stat-title hud-desktop:text-[10px] text-center text-[8px] uppercase opacity-50">
            <span class="hud-emoji">⚡</span><span class="hud-label">Super</span>
          </div>
          <div class="flex items-center justify-center">
            <div class={`radial-progress transition-all duration-200 ${superRingColor} ${superRingPulse ? 'animate-pulse' : ''}`} style={`--value:${pct * 100}; --size:2.25rem; --thickness:3px; ${superRingPulse ? 'filter: drop-shadow(0 0 8px #a855f7);' : ''}`} role="progressbar">
              <span class="text-xs select-none">⚡</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Center: Timer -->
    <div class="flex justify-center">
      <div class="stats bg-base-300/80 border-error/20 pointer-events-auto border shadow-lg backdrop-blur">
        <div class="stat hud-desktop:p-2 hud-desktop:px-6 p-1 px-3">
          <div class="stat-title hud-desktop:text-[10px] text-center text-[8px] uppercase opacity-50">
            <span class="hud-emoji">🕐</span><span class="hud-label">System Clock</span>
          </div>
          <div class={`stat-value hud-desktop:text-lg hud-tall:text-3xl flex items-center justify-center font-mono text-sm ${timerObj <= 3 && timerObj > 0 ? 'animate-pulse text-warning scale-110' : 'text-error'}`}>
            <span class="countdown">
              <span style={`--value:${getMin(timerObj)}; --digits:2;`}></span>
            </span>:
            <span class="countdown">
              <span style={`--value:${getSec(timerObj)}; --digits:2;`}></span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: Admin icon -->
    <div class="flex justify-end">
      {#if isAdmin}
        <a href="/admin" class="btn btn-circle btn-ghost btn-sm pointer-events-auto opacity-70 hover:opacity-100" title="Admin panel" aria-label="Admin panel">🛡️</a>
      {/if}
    </div>
  </div>

  <!-- Bottom HUD Area -->
  <div class="grid w-full grid-cols-3 items-end">
    <div class="min-w-0"></div>

    <!-- Center: Pause Button + Phase Alerts -->
    <div class="hud-desktop:gap-2 hud-desktop:pb-4 flex flex-col items-center gap-1 pb-2">
      <div class={`badge hud-desktop:badge-lg hud-desktop:text-xs text-[10px] font-bold tracking-widest uppercase ${phase === 'boss' ? 'badge-primary' : phase === 'victory' ? 'badge-success' : 'hidden'}`}>
        {phase === 'boss' ? 'BULL MARKET' : phase === 'victory' ? 'VICTORY' : ''}
      </div>
      <button on:click={handlePauseClick} class="btn btn-circle btn-primary btn-sm hud-desktop:btn-md pointer-events-auto min-h-[48px] min-w-[48px] border-2 border-white/10 shadow-xl" title="Pause Mission (ESC)">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
      </button>
    </div>

    <!-- Right: Boss HP Bar -->
    <div class="flex min-w-0 flex-col items-end justify-end gap-2">
      <div class={`bg-base-300/80 border-error/30 hud-desktop:w-40 hud-desktop:p-1.5 hud-tall:w-48 pointer-events-auto w-28 rounded-lg border p-1 shadow-lg backdrop-blur ${phase === 'boss' && curBossHp > 0 && curBossMaxHp > 0 ? '' : 'hidden'}`}>
        <div class="flex items-center justify-between">
          <span class="text-error text-[9px] font-bold uppercase opacity-80">BOSS</span>
          <span class="text-error font-mono text-[10px]">{curBossHp}/{curBossMaxHp}</span>
        </div>
        <progress class={`progress mt-0.5 h-2 w-full ${bossHpColor}`} value={bossHpPercent} max="100"></progress>
      </div>
    </div>
  </div>
</div>

<style>
  .hud-emoji { display: inline; }
  .hud-label { display: none; }

  @media (min-height: 520px) {
    .hud-emoji { display: none; }
    .hud-label { display: inline; }
    .hud-desktop\:p-2 { padding: 0.5rem; }
    .hud-desktop\:p-4 { padding: 1rem; }
    .hud-desktop\:px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
    .hud-desktop\:px-4 { padding-left: 1rem; padding-right: 1rem; }
    .hud-desktop\:px-6 { padding-left: 1.5rem; padding-right: 1.5rem; }
    .hud-desktop\:gap-2 { gap: 0.5rem; }
    .hud-desktop\:gap-4 { gap: 1rem; }
    .hud-desktop\:pb-4 { padding-bottom: 1rem; }
    .hud-desktop\:text-\[10px\] { font-size: 10px; }
    .hud-desktop\:text-xs { font-size: 0.75rem; line-height: 1rem; }
    .hud-desktop\:text-lg { font-size: 1.125rem; line-height: 1.75rem; }
    .hud-desktop\:text-xl { font-size: 1.25rem; line-height: 1.75rem; }
    .hud-desktop\:w-40 { width: 10rem; }
    .hud-desktop\:p-1\.5 { padding: 0.375rem; }
  }

  @media (min-height: 768px) {
    .hud-tall\:text-3xl { font-size: 1.875rem; line-height: 2.25rem; }
    .hud-tall\:w-48 { width: 12rem; }
  }
</style>
