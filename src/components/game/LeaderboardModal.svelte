<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { listDocs } from "@junobuild/core";
  import PWA from "@/lib/pwa";
  import { log } from "@/lib/utils/log";
  import { trackModalOpen } from "@/lib/metrics/analytics";

  const COMPONENT_NAME = "LeaderboardModal";
  let dialog: HTMLDialogElement;
  let currentTab: "active" | "alltime" = "active";
  let isLoading = false;
  let activeItems: any[] = [];
  let alltimeItems: any[] = [];
  let isError = false;
  let errorMessage = "";
  let infoMessage = "";

  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let currentTime = Date.now();
  let disposed = false;

  $: {
    if (activeItems.length > 0) {
      // Re-trigger reactions when currentTime updates
      const _ = currentTime;
    }
  }

  function formatCountdown(ms: number): string {
    if (ms <= 0) return "Expired";
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return "<1m";
  }

  async function openLeaderboardModal() {
    dialog?.showModal();
    trackModalOpen("leaderboard");
    currentTab = "active";
    loadActiveLeaderboard();
    PWA.getInstance().checkForUpdates();
  }

  function handleCloseLeaderboard() {
    dialog?.close();
  }

  function setTab(tab: "active" | "alltime") {
    currentTab = tab;
    if (tab === "active") loadActiveLeaderboard();
    else loadAlltimeLeaderboard();
  }

  async function loadActiveLeaderboard() {
    isLoading = true;
    isError = false;
    infoMessage = "";
    activeItems = [];

    if (countdownInterval !== null) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      if (isLoading) {
        isLoading = false;
        isError = true;
        errorMessage = "Connection timed out. Try again.";
        abortController.abort();
      }
    }, 10000);

    try {
      const { items } = await listDocs({
        collection: "scores",
        filter: { order: { desc: true, field: "active_score" as any }, paginate: { limit: 50 } },
      });

      if (disposed) return;
      const now = Date.now();

      const activeFiltered = items.filter((item) => {
        const entry = item.data as any;
        const expiresAt = entry?.expires_at as number | undefined;
        const activeScore = entry?.active_score as number | undefined;
        return expiresAt && expiresAt > now && activeScore && activeScore > 0;
      });

      if (activeFiltered.length === 0) {
        infoMessage = "No active scores. Play to claim #1!";
      } else {
        activeItems = activeFiltered.slice(0, 10);

        countdownInterval = setInterval(() => {
          currentTime = Date.now();
        }, 60000);
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      isError = true;
      if (errMsg.includes("not_found") || errMsg.includes("Datastore")) {
        log.warn(COMPONENT_NAME, "Leaderboard collection not found", err);
        infoMessage = "Leaderboard not available yet. Deploy in progress.";
        isError = false;
      } else {
        log.error(COMPONENT_NAME, "Failed to load active leaderboard", err);
        errorMessage = "Failed to load mainframe data.";
      }
    } finally {
      clearTimeout(timeoutId);
      if (!disposed) isLoading = false;
    }
  }

  async function loadAlltimeLeaderboard() {
    isLoading = true;
    isError = false;
    infoMessage = "";
    alltimeItems = [];

    const timeoutId = setTimeout(() => {
      if (isLoading) {
        isLoading = false;
        isError = true;
        errorMessage = "Connection timed out. Try again.";
      }
    }, 10000);

    try {
      const { items } = await listDocs({
        collection: "scores",
        filter: { order: { desc: true, field: "high_score" as any }, paginate: { limit: 100 } },
      });

      if (disposed) return;

      const validItems = items.filter((item) => item.key !== "top_scorer");

      if (validItems.length === 0) {
        infoMessage = "No scores yet. Be the first!";
      } else {
        alltimeItems = validItems.slice(0, 10);
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      isError = true;
      if (errMsg.includes("not_found") || errMsg.includes("Datastore")) {
        log.warn(COMPONENT_NAME, "Leaderboard collection not found", err);
        infoMessage = "Leaderboard not available yet. Deploy in progress.";
        isError = false;
      } else {
        log.error(COMPONENT_NAME, "Failed to load all-time leaderboard", err);
        errorMessage = "Failed to load mainframe data.";
      }
    } finally {
      clearTimeout(timeoutId);
      if (!disposed) isLoading = false;
    }
  }

  function handleOpenLeaderboard() {
    openLeaderboardModal();
  }

  onMount(() => {
    document.addEventListener("tresr:open-leaderboard", handleOpenLeaderboard);
  });

  onDestroy(() => {
    disposed = true;
    if (countdownInterval !== null) clearInterval(countdownInterval);
    document.removeEventListener("tresr:open-leaderboard", handleOpenLeaderboard);
  });
</script>

<dialog bind:this={dialog} id="leaderboard-modal" class="modal">
  <div class="modal-box bg-base-100 border-primary/30 w-11/12 max-w-2xl border">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-primary flex items-center gap-2 text-2xl font-bold">
        <span>&#x1F3C6;</span> DEGENERATE HALL OF FAME
      </h2>
      <button on:click={handleCloseLeaderboard} class="btn btn-circle btn-ghost min-h-[44px] min-w-[44px] text-lg">
        &#x2715;
      </button>
    </div>

    <div role="tablist" class="tabs tabs-box mb-4">
      <button role="tab" class="tab" class:tab-active={currentTab === 'active'} on:click={() => setTab('active')}>ACTIVE</button>
      <button role="tab" class="tab" class:tab-active={currentTab === 'alltime'} on:click={() => setTab('alltime')}>ALL TIME</button>
    </div>

    {#if isLoading}
      <div class="py-10 text-center">
        <span class="loading loading-spinner loading-lg text-primary"></span>
        <p class="text-primary mt-2 animate-pulse">Accessing Mainframe...</p>
      </div>
    {:else if isError}
      <div class="py-10 text-center text-error">
        <p>{errorMessage}</p>
      </div>
    {:else if infoMessage}
      <div class="py-10 text-center text-info opacity-60">
        <p>{infoMessage}</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="table-zebra table w-full">
          <thead>
            <tr class="text-secondary text-xs uppercase">
              <th>#</th>
              <th>Agent</th>
              <th class="text-right">Score</th>
              {#if currentTab === 'active'}
                <th class="text-right">Expires</th>
              {:else}
                <th class="hidden text-right sm:table-cell">Date</th>
              {/if}
            </tr>
          </thead>
          <tbody>
            {#each currentTab === 'active' ? activeItems : alltimeItems as item, index}
              <tr class="hover:bg-primary/5 transition-colors">
                <td class="font-mono text-xs opacity-50">{index + 1}</td>
                <td>
                  <div class="flex items-center gap-2">
                    <div class="avatar placeholder">
                      <div class="bg-primary/20 text-primary w-8 rounded-full border border-primary/30 overflow-hidden">
                        {#if item.data.avatar_url}
                          <img src={item.data.avatar_url} alt={item.data.nickname} class="h-full w-full object-cover"/>
                        {:else}
                          <span class="text-xs">{(item.data.nickname && typeof item.data.nickname === 'string') ? item.data.nickname[0].toUpperCase() : 'A'}</span>
                        {/if}
                      </div>
                    </div>
                    <div>
                      <div class="font-bold text-sm">{(item.data.nickname && typeof item.data.nickname === 'string') ? item.data.nickname : 'Unknown Agent'}</div>
                    </div>
                  </div>
                </td>
                <td class="text-right font-mono font-bold text-primary">
                  {currentTab === 'active' ? (item.data.active_score || 0) : (item.data.high_score || 0)}
                </td>
                {#if currentTab === 'active'}
                  <td class="text-right font-mono text-[10px] opacity-60 uppercase">
                    {formatCountdown((item.data.expires_at || 0) - currentTime)}
                  </td>
                {:else}
                  <td class="hidden text-right font-mono text-[10px] opacity-40 sm:table-cell uppercase">
                    {item.updated_at ? new Date(Number(item.updated_at / 1000000n)).toLocaleDateString() : 'N/A'}
                  </td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
  <form method="dialog" class="modal-backdrop">
    <button on:click={handleCloseLeaderboard}>close</button>
  </form>
</dialog>
