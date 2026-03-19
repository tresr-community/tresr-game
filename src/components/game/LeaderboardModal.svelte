<script lang="ts">
  import {onDestroy} from "svelte";
  import {listDocs} from "@junobuild/core";
  import PWA from "@/lib/pwa";
  import {log} from "@/lib/utils/log";
  import {trackModalOpen} from "@/lib/metrics/analytics";
  import Modal from "@/components/ui/Modal.svelte";
  import {openLeaderboard} from "@/lib/stores/ui.svelte";

  const COMPONENT_NAME = "LeaderboardModal";
  let open = $state(false);

  // Capture the tick at mount so stale ticks from prior page visits don't
  // re-open the modal when this component mounts on a fresh navigation.
  const mountTick = openLeaderboard.current;

  // Open only when the tick increments *after* this component was mounted
  $effect(() => {
    if (openLeaderboard.current > mountTick) openLeaderboardModal();
  });
  let currentTab: "active" | "alltime" = $state("active");
  let isLoading = $state(false);
  let activeItems: any[] = $state([]);
  let alltimeItems: any[] = $state([]);
  let isError = $state(false);
  let errorMessage = $state("");
  let infoMessage = $state("");

  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let currentTime = $state(Date.now());
  let disposed = false;

  $effect(() => {
    if (activeItems.length > 0) {
      // Re-trigger reactions when currentTime updates
      const _ = currentTime;
    }
  });

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
    open = true;
    trackModalOpen("leaderboard");
    currentTab = "active";
    loadActiveLeaderboard();
    PWA.getInstance().checkForUpdates();
  }

  function handleCloseLeaderboard() {
    open = false;
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
      const {items} = await listDocs({
        collection: "scores",
        filter: {
          order: {desc: true, field: "active_score" as any},
          paginate: {limit: 50},
        },
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
      if (
        errMsg.includes("not_found") ||
        errMsg.includes("Datastore") ||
        errMsg.includes("index") ||
        errMsg.includes("FailedPrecondition")
      ) {
        log.warn(COMPONENT_NAME, "Leaderboard collection/index not ready", err);
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
      const {items} = await listDocs({
        collection: "scores",
        filter: {
          order: {desc: true, field: "high_score" as any},
          paginate: {limit: 100},
        },
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
      if (
        errMsg.includes("not_found") ||
        errMsg.includes("Datastore") ||
        errMsg.includes("index") ||
        errMsg.includes("FailedPrecondition")
      ) {
        log.warn(COMPONENT_NAME, "Leaderboard collection/index not ready", err);
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

  onDestroy(() => {
    disposed = true;
    if (countdownInterval !== null) clearInterval(countdownInterval);
  });
</script>

<Modal bind:open title="🏆 DEGENERATE HALL OF FAME" maxWidth="max-w-2xl">
  <div
    class="mb-4 flex w-full rounded-md border border-white/10 bg-black/40 p-1"
  >
    <button
      class="flex-1 rounded py-2 text-center text-sm font-bold tracking-widest transition-colors {currentTab ===
      'active'
        ? 'bg-primary text-black'
        : 'text-white/50 hover:bg-white/5 hover:text-white'} uppercase"
      onclick={() => setTab("active")}
    >
      ACTIVE
    </button>
    <button
      class="flex-1 rounded py-2 text-center text-sm font-bold tracking-widest transition-colors {currentTab ===
      'alltime'
        ? 'bg-primary text-black'
        : 'text-white/50 hover:bg-white/5 hover:text-white'} uppercase"
      onclick={() => setTab("alltime")}
    >
      ALL TIME
    </button>
  </div>

  {#if isLoading}
    <div class="flex flex-col items-center justify-center py-10">
      <div
        class="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"
      ></div>
      <p
        class="text-primary mt-4 animate-pulse font-mono text-xs tracking-widest uppercase"
      >
        Accessing Mainframe...
      </p>
    </div>
  {:else if isError}
    <div
      class="py-10 text-center font-mono text-sm tracking-widest text-[#ef4444] uppercase"
    >
      <p>{errorMessage}</p>
    </div>
  {:else if infoMessage}
    <div
      class="py-10 text-center font-mono text-sm tracking-widest text-[#38bdf8] uppercase opacity-60"
    >
      <p>{infoMessage}</p>
    </div>
  {:else}
    <div class="overflow-x-auto rounded-md border border-white/10 bg-black/40">
      <table class="w-full text-left">
        <thead
          class="text-primary border-b border-white/5 bg-white/5 text-[10px] font-bold tracking-widest uppercase"
        >
          <tr>
            <th class="px-3 py-2.5">#</th>
            <th class="px-3 py-2.5">Agent</th>
            <th class="px-3 py-2.5 text-right">Score</th>
            {#if currentTab === "active"}
              <th class="px-3 py-2.5 text-right">Expires</th>
            {:else}
              <th class="hidden px-3 py-2.5 text-right sm:table-cell">Date</th>
            {/if}
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5">
          {#each currentTab === "active" ? activeItems : alltimeItems as item, index}
            <tr class="hover:bg-primary/5 transition-colors">
              <td class="px-3 py-3 font-mono text-xs opacity-50">{index + 1}</td
              >
              <td class="px-3 py-3">
                <div class="flex items-center gap-3">
                  <div
                    class="border-primary/30 bg-primary/20 text-primary flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border text-sm font-bold"
                  >
                    {#if item.data.avatar_url}
                      <img
                        src={item.data.avatar_url}
                        alt={item.data.nickname}
                        class="h-full w-full object-cover"
                      />
                    {:else}
                      <span
                        >{item.data.nickname &&
                        typeof item.data.nickname === "string"
                          ? item.data.nickname[0].toUpperCase()
                          : "A"}</span
                      >
                    {/if}
                  </div>
                  <div class="text-base font-bold tracking-wide">
                    {item.data.nickname &&
                    typeof item.data.nickname === "string"
                      ? item.data.nickname
                      : "Unknown Agent"}
                  </div>
                </div>
              </td>
              <td
                class="text-primary px-3 py-3 text-right font-mono text-base font-bold"
              >
                {currentTab === "active"
                  ? item.data.active_score || 0
                  : item.data.high_score || 0}
              </td>
              {#if currentTab === "active"}
                <td
                  class="px-3 py-3 text-right font-mono text-xs text-white/60 uppercase"
                >
                  {formatCountdown((item.data.expires_at || 0) - currentTime)}
                </td>
              {:else}
                <td
                  class="hidden px-3 py-3 text-right font-mono text-xs text-white/40 uppercase sm:table-cell"
                >
                  {item.updated_at
                    ? new Date(
                        Number(item.updated_at / 1000000n)
                      ).toLocaleDateString()
                    : "N/A"}
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</Modal>
