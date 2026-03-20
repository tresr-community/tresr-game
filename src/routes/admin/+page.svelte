<script lang="ts">
  import {onMount} from "svelte";
  import {listDocs} from "@junobuild/core";
  import {initializeJunoSatellite} from "@/lib/utils/juno";
  import {
    getErrors,
    deleteErrors,
    resolveError,
    liftBan,
  } from "@/lib/satellite/satellite-api";
  import {Tabs, Dialog} from "bits-ui";

  import type {ErrorRecord} from "@/declarations/satellite/satellite.did";
  import type {UserProfile} from "@/types/backend";
  import {getTresrBalance, formatBalance} from "@/lib/blockchain/balance";
  import {getEnvironmentKey} from "@/lib/blockchain/networks/chain";
  import {
    getTotalFees,
    getTotalRewards,
    getVaultTotalBurned,
    getVaultCurrentBalance,
  } from "@/lib/blockchain/contracts/vault";
  import {config} from "@/lib/config/client";
  import {log} from "@/lib/utils/log";

  // State
  let allErrors: ErrorRecord[] = $state([]);
  let selectedErrors = $state(new Set<string>());
  let isLoading = $state(true);
  let isUnauthorized = $state(false);

  let activeTab = $state("errors");

  // Filter State
  let searchQuery = $state("");
  let filterEnv = $state("");
  let filterResolved = $state("");
  let selectAllHead = $state(false);

  // Economy State
  let econLoading = $state(false);
  let chainFees = $state(0n);
  let chainRewarded = $state(0n);
  let chainBurned = $state(0n);
  let chainVault = $state(0n);
  let chainOnline = $state(false);
  let usersData: {
    principal: string;
    nickname: string;
    onChainBalance: bigint;
  }[] = $state([]);

  // Detail Modal State
  let detailModalOpen = $state(false);
  let detailPrincipal = $state("");
  let detailRawError = $state("");

  // Derived
  let filteredErrors = $derived(
    allErrors.filter((r) => {
      if (filterEnv && r.environment !== filterEnv) return false;
      if (filterResolved === "true" && !r.resolved) return false;
      if (filterResolved === "false" && r.resolved) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !r.error_id.toLowerCase().includes(q) &&
          !r.component.toLowerCase().includes(q) &&
          !r.message.toLowerCase().includes(q) &&
          !r.principal.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    })
  );

  let selectedCount = $derived(selectedErrors.size);

  onMount(async () => {
    await loadErrors();
  });

  async function loadErrors() {
    isLoading = true;
    isUnauthorized = false;
    try {
      const result = await getErrors();
      if ("Err" in result) {
        isLoading = false;
        isUnauthorized = true;
        return;
      }
      allErrors = result.Ok;
      isLoading = false;
    } catch (e) {
      isLoading = false;
      isUnauthorized = true;
      log.error("Admin", "Failed to load error records", e);
    }
  }

  function handleSelectAll() {
    if (selectAllHead) {
      filteredErrors.forEach((r) => selectedErrors.add(r.error_id));
    } else {
      filteredErrors.forEach((r) => selectedErrors.delete(r.error_id));
    }
    selectedErrors = new Set(selectedErrors);
  }

  function toggleSelection(id: string) {
    if (selectedErrors.has(id)) {
      selectedErrors.delete(id);
    } else {
      selectedErrors.add(id);
    }
    selectedErrors = new Set(selectedErrors);
  }

  async function handleResolveToggle(errorId: string, wasResolved: boolean) {
    try {
      const res = await resolveError(errorId, !wasResolved);
      if ("Err" in res) {
        alert(`Failed to update status: ${res.Err}`);
        return;
      }
      const idx = allErrors.findIndex((r) => r.error_id === errorId);
      if (idx !== -1) {
        allErrors[idx] = {...allErrors[idx], resolved: !wasResolved};
      }
    } catch (err) {
      alert(`Failed: ${String(err)}`);
    }
  }

  async function handleDeleteSelected() {
    if (selectedErrors.size === 0) return;
    if (
      !confirm(
        `Delete ${selectedErrors.size} error record(s)? This cannot be undone.`
      )
    )
      return;
    try {
      const result = await deleteErrors([...selectedErrors]);
      if ("Err" in result) {
        alert(`Delete failed: ${result.Err}`);
        return;
      }
      selectedErrors.clear();
      selectedErrors = selectedErrors;
      await loadErrors();
    } catch (e) {
      alert(`Delete failed: ${String(e)}`);
    }
  }

  function openDetailModal(error: ErrorRecord) {
    detailPrincipal = error.principal;
    detailRawError = error.raw_error;
    detailModalOpen = true;
  }

  async function loadEconomy() {
    econLoading = true;
    try {
      const env = getEnvironmentKey();
      const vaultAddr = config.blockchain.avalanche[env]
        .proxy_contract as `0x${string}`;
      if (
        vaultAddr &&
        vaultAddr !== "0x0000000000000000000000000000000000000000"
      ) {
        const [fees, rewarded, burned, vault] = await Promise.all([
          getTotalFees(),
          getTotalRewards(),
          getVaultTotalBurned(),
          getVaultCurrentBalance(),
        ]);
        chainFees = fees as bigint;
        chainRewarded = rewarded as bigint;
        chainBurned = burned as bigint;
        chainVault = vault;
        chainOnline = true;
      }
      const usersResult = await listDocs<UserProfile>({collection: "users"});
      const newUsersData = [];
      for (const doc of usersResult.items) {
        const profile = doc.data;
        const principal = doc.key;
        const nickname = profile.nickname ?? "—";
        let onChainBalance = 0n;
        if (profile.evm_wallet) {
          try {
            onChainBalance = await getTresrBalance(
              profile.evm_wallet as `0x${string}`,
              false
            );
          } catch {
            // RPC unavailable
          }
        }
        newUsersData.push({principal, nickname, onChainBalance});
      }
      usersData = newUsersData;
    } catch (e) {
      log.error("Admin", "Failed to load economy data", e);
    } finally {
      econLoading = false;
    }
  }

  function handleTabChange(value: string | undefined) {
    if (value === "economy" && usersData.length === 0) loadEconomy();
  }
</script>

<svelte:head>
  <title>TRESR Admin</title>
</svelte:head>

<div class="container mx-auto max-w-7xl px-4 py-8">
  <!-- Page header -->
  <div class="mb-6 text-center">
    <h1 class="text-2xl font-bold">🛡 Admin Dashboard</h1>
  </div>

  {#if isLoading}
    <div
      class="flex min-h-screen flex-col items-center justify-center gap-8 px-4 text-center"
    >
      <svg
        class="text-primary h-12 w-12 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        ></circle>
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      <p class="font-mono text-sm opacity-50">Verifying credentials…</p>
      <a
        href="/"
        class="border-primary text-primary hover:bg-primary inline-block rounded-md border px-8 py-3 font-mono text-sm tracking-widest uppercase transition-all hover:text-black hover:shadow-[0_0_15px_var(--color-primary)]"
        >RETURN HOME</a
      >
    </div>
  {:else if isUnauthorized}
    <div
      class="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center"
    >
      <!-- Pulsing skull -->
      <div class="relative">
        <div
          class="bg-error/20 absolute inset-0 animate-ping rounded-full"
        ></div>
        <div
          class="border-error/60 bg-error/10 relative flex h-32 w-32 items-center justify-center rounded-full border-2 text-6xl shadow-[0_0_60px_rgba(239,68,68,0.5)]"
        >
          💀
        </div>
      </div>

      <h1
        class="font-display text-error text-5xl font-black tracking-[0.2em] uppercase drop-shadow-[0_0_25px_rgba(239,68,68,0.9)] sm:text-7xl md:text-8xl"
      >
        ACCESS DENIED
      </h1>

      <div
        class="w-full max-w-sm rounded-xl border border-red-700/40 bg-red-950/30 px-6 py-4 text-center"
      >
        <div class="font-bold text-red-300">Unauthorized territory</div>
        <div class="mt-1 text-xs text-red-400/70">
          This session has been flagged. Admin access only.
        </div>
      </div>

      <div class="mt-6">
        <a
          href="/"
          class="border-primary text-primary hover:bg-primary inline-block rounded-md border px-8 py-3 font-mono text-sm tracking-widest uppercase transition-all hover:text-black hover:shadow-[0_0_15px_var(--color-primary)]"
          >RETURN HOME</a
        >
      </div>
    </div>
  {:else}
    <!-- ─── Authenticated Admin View ─────────────────────────────────── -->
    <Tabs.Root bind:value={activeTab} onValueChange={handleTabChange}>
      <!-- Tab list -->
      <Tabs.List
        class="mb-6 flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1"
      >
        <Tabs.Trigger
          value="errors"
          class="flex-1 rounded-lg px-4 py-2.5 font-mono text-sm font-medium tracking-wide text-white/50 transition-all hover:text-white data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-sm"
        >
          ⚠️ Errors
        </Tabs.Trigger>
        <Tabs.Trigger
          value="economy"
          class="flex-1 rounded-lg px-4 py-2.5 font-mono text-sm font-medium tracking-wide text-white/50 transition-all hover:text-white data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-sm"
        >
          💰 Economy
        </Tabs.Trigger>
        <Tabs.Trigger
          value="anticheat"
          class="flex-1 rounded-lg px-4 py-2.5 font-mono text-sm font-medium tracking-wide text-white/50 transition-all hover:text-white data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-sm"
        >
          🚫 Anti-Cheat
        </Tabs.Trigger>
      </Tabs.List>

      <!-- ─── Errors Tab ─────────────────────────────────────────────── -->
      <Tabs.Content value="errors">
        <div class="mb-6 flex flex-col gap-4">
          <h2 class="text-xl font-bold">
            Error Records ({filteredErrors.length})
          </h2>

          <!-- Filter & Controls Bar -->
          <div
            class="flex flex-wrap items-center justify-between gap-4 rounded-t-xl border border-b-0 border-white/10 bg-white/5 p-3"
          >
            <div class="flex flex-1 flex-wrap items-center gap-3">
              <!-- Search -->
              <div class="relative flex w-full max-w-xs items-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  class="absolute left-2.5 h-4 w-4 fill-current opacity-50"
                >
                  <path
                    fill-rule="evenodd"
                    d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z"
                    clip-rule="evenodd"
                  ></path>
                </svg>
                <input
                  type="text"
                  bind:value={searchQuery}
                  placeholder="Search ID, Component, Message..."
                  class="focus:border-primary w-full rounded border border-white/10 bg-black/30 py-1.5 pr-3 pl-8 text-sm focus:outline-none"
                />
              </div>
              <!-- Env filter -->
              <select
                bind:value={filterEnv}
                class="focus:border-primary rounded border border-white/10 bg-black/50 px-2 py-1.5 text-sm focus:outline-none"
              >
                <option value="">All environments</option>
                <option value="mainnet">mainnet</option>
                <option value="testnet">testnet</option>
                <option value="anvil">anvil</option>
              </select>
              <!-- Status filter -->
              <select
                bind:value={filterResolved}
                class="focus:border-primary rounded border border-white/10 bg-black/50 px-2 py-1.5 text-sm focus:outline-none"
              >
                <option value="">All statuses</option>
                <option value="false">Unresolved</option>
                <option value="true">Resolved</option>
              </select>
            </div>

            <!-- Actions -->
            <div class="flex flex-wrap items-center gap-3">
              {#if selectedCount > 0}
                <div
                  class="flex items-center gap-3 border-r border-white/10 pr-3"
                >
                  <span
                    class="rounded bg-white/10 px-2 py-0.5 font-mono text-xs"
                    >{selectedCount} selected</span
                  >
                </div>
              {/if}
              <div class="flex gap-2">
                {#if selectedCount > 0}
                  <button
                    class="rounded border border-red-500/40 bg-red-500/10 px-3 py-1.5 font-mono text-xs text-red-400 transition-all hover:bg-red-500/20"
                    onclick={handleDeleteSelected}
                  >
                    🗑 Delete
                  </button>
                {/if}
                <button
                  class="rounded border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-white/70 transition-all hover:bg-white/10"
                  onclick={loadErrors}
                >
                  ↺ Refresh
                </button>
              </div>
            </div>
          </div>

          <!-- Table -->
          <div
            class="overflow-x-auto rounded-b-xl border border-t-0 border-white/10"
          >
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-white/10 bg-white/5 text-left">
                  <th class="px-3 py-2"
                    ><input
                      type="checkbox"
                      bind:checked={selectAllHead}
                      onchange={handleSelectAll}
                      class="accent-primary h-3.5 w-3.5 rounded"
                    /></th
                  >
                  <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                    >Error ID</th
                  >
                  <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                    >Component</th
                  >
                  <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                    >Message</th
                  >
                  <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                    >Principal</th
                  >
                  <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                    >Env</th
                  >
                  <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                    >Time</th
                  >
                  <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                    >Status</th
                  >
                  <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                    >Actions</th
                  >
                </tr>
              </thead>
              <tbody>
                {#each filteredErrors as r}
                  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
                  <tr
                    class={`cursor-pointer border-b border-white/5 transition-colors hover:bg-white/5 ${selectedErrors.has(r.error_id) ? "bg-white/[0.03]" : ""}`}
                    onclick={() => openDetailModal(r)}
                  >
                    <td class="px-3 py-2" onclick={(e) => e.stopPropagation()}
                      ><input
                        type="checkbox"
                        checked={selectedErrors.has(r.error_id)}
                        onchange={() => toggleSelection(r.error_id)}
                        class="accent-primary h-3.5 w-3.5 rounded"
                      /></td
                    >
                    <td class="px-3 py-2"
                      ><code class="font-mono text-xs">{r.error_id}</code></td
                    >
                    <td class="px-3 py-2 font-mono text-xs">{r.component}</td>
                    <td
                      class="max-w-xs truncate px-3 py-2 text-xs"
                      title={r.message}>{r.message}</td
                    >
                    <td
                      class="max-w-[120px] truncate px-3 py-2 font-mono text-xs"
                      title={r.principal}>{r.principal.slice(0, 12)}…</td
                    >
                    <td class="px-3 py-2"
                      ><span
                        class={`rounded px-2 py-0.5 font-mono text-xs ${
                          r.environment === "mainnet"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : r.environment === "testnet"
                              ? "bg-sky-500/20 text-sky-400"
                              : "bg-white/10 text-white/60"
                        }`}>{r.environment}</span
                      ></td
                    >
                    <td class="px-3 py-2 text-xs whitespace-nowrap"
                      >{new Date(Number(r.timestamp_ms)).toLocaleString()}</td
                    >
                    <td class="px-3 py-2">
                      {#if r.resolved}
                        <span
                          class="rounded bg-green-500/20 px-2 py-0.5 font-mono text-xs text-green-400"
                          >resolved</span
                        >
                      {:else}
                        <span
                          class="rounded bg-red-500/20 px-2 py-0.5 font-mono text-xs text-red-400"
                          >open</span
                        >
                      {/if}
                    </td>
                    <td class="px-3 py-2" onclick={(e) => e.stopPropagation()}>
                      <button
                        class={`rounded px-2 py-1 font-mono text-xs transition-colors hover:bg-white/5 ${r.resolved ? "text-yellow-400" : "text-green-400"}`}
                        onclick={() =>
                          handleResolveToggle(r.error_id, r.resolved)}
                      >
                        {r.resolved ? "↩ Reopen" : "✓ Resolve"}
                      </button>
                    </td>
                  </tr>
                {:else}
                  <tr
                    ><td colspan="9" class="py-8 text-center opacity-50"
                      >No errors found</td
                    ></tr
                  >
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </Tabs.Content>

      <!-- ─── Economy Tab ─────────────────────────────────────────────── -->
      <Tabs.Content value="economy">
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <h2 class="flex-1 text-xl font-bold">Economy</h2>
          <button
            class="rounded border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-white/70 transition-all hover:bg-white/10"
            onclick={loadEconomy}>↺ Refresh</button
          >
        </div>

        {#if econLoading}
          <div class="flex justify-center py-12">
            <svg
              class="text-primary h-8 w-8 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>
        {:else}
          <!-- Blockchain metrics -->
          <div class="mb-6">
            <div class="mb-3 flex items-center gap-2">
              <span class="font-mono text-xs font-bold uppercase opacity-60"
                >⛓ Blockchain (Live)</span
              >
              <span
                class={`rounded px-2 py-0.5 font-mono text-xs ${chainOnline ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}
                >{chainOnline ? "online" : "offline"}</span
              >
            </div>
            <div class="grid w-full grid-cols-2 gap-3 md:grid-cols-4">
              <div class="rounded-xl border border-white/10 bg-white/5 p-4">
                <div class="font-mono text-xs uppercase opacity-50">Fees</div>
                <div class="mt-1 font-mono text-lg text-sky-400">
                  {chainOnline ? formatBalance(chainFees) : "—"}
                </div>
                <div class="mt-1 font-mono text-xs opacity-30">
                  vault.totalFeesCollected()
                </div>
              </div>
              <div class="rounded-xl border border-white/10 bg-white/5 p-4">
                <div class="font-mono text-xs uppercase opacity-50">
                  Rewards
                </div>
                <div class="mt-1 font-mono text-lg text-green-400">
                  {chainOnline ? formatBalance(chainRewarded) : "—"}
                </div>
                <div class="mt-1 font-mono text-xs opacity-30">
                  vault.totalRewardsPaid()
                </div>
              </div>
              <div class="rounded-xl border border-white/10 bg-white/5 p-4">
                <div class="font-mono text-xs uppercase opacity-50">Burned</div>
                <div class="mt-1 font-mono text-lg text-red-400">
                  {chainOnline ? formatBalance(chainBurned) : "—"}
                </div>
                <div class="mt-1 font-mono text-xs opacity-30">
                  vault.totalBurned()
                </div>
              </div>
              <div class="rounded-xl border border-white/10 bg-white/5 p-4">
                <div class="font-mono text-xs uppercase opacity-50">
                  Vault Balance
                </div>
                <div class="mt-1 font-mono text-lg text-yellow-400">
                  {chainOnline ? formatBalance(chainVault) : "—"}
                </div>
                <div class="mt-1 font-mono text-xs opacity-30">
                  vault.currentBalance()
                </div>
              </div>
            </div>
          </div>

          <!-- Per-user balance -->
          <div class="mb-2 font-mono text-xs font-bold uppercase opacity-60">
            👤 Per-User Balance Audit
          </div>
          <div class="overflow-x-auto rounded-xl border border-white/10">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-white/10 bg-white/5 text-left">
                  <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                    >Principal</th
                  >
                  <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                    >Nickname</th
                  >
                  <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                    >On-Chain Balance</th
                  >
                </tr>
              </thead>
              <tbody>
                {#each usersData as u}
                  <tr class="border-b border-white/5 hover:bg-white/5">
                    <td
                      class="max-w-[120px] truncate px-3 py-2 font-mono text-xs"
                      title={u.principal}>{u.principal.slice(0, 14)}…</td
                    >
                    <td class="px-3 py-2">{u.nickname}</td>
                    <td class="px-3 py-2 font-mono text-xs"
                      >{formatBalance(u.onChainBalance)}</td
                    >
                  </tr>
                {:else}
                  <tr
                    ><td colspan="3" class="py-8 text-center opacity-50"
                      >Click Refresh to load economy data</td
                    ></tr
                  >
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </Tabs.Content>

      <!-- ─── Anti-Cheat Tab ──────────────────────────────────────────── -->
      <Tabs.Content value="anticheat">
        <div class="mb-4 flex items-center gap-3">
          <h2 class="flex-1 text-xl font-bold">Banned Users (0)</h2>
          <button
            class="rounded border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-white/70 transition-all hover:bg-white/10"
            >↺ Refresh</button
          >
        </div>
        <div class="overflow-x-auto rounded-xl border border-white/10">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-white/10 bg-white/5 text-left">
                <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                  >Principal</th
                >
                <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                  >Nickname</th
                >
                <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                  >Offences</th
                >
                <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                  >Reason</th
                >
                <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                  >Banned Until</th
                >
                <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                  >Status</th
                >
                <th class="px-3 py-2 font-mono text-xs uppercase opacity-60"
                  >Action</th
                >
              </tr>
            </thead>
            <tbody>
              <tr
                ><td colspan="7" class="py-8 text-center opacity-50"
                  >Click Refresh to load ban data</td
                ></tr
              >
            </tbody>
          </table>
        </div>
      </Tabs.Content>
    </Tabs.Root>
  {/if}

  <!-- Return Home -->
  <div class="mt-10 mb-8 flex justify-center">
    <a
      href="/"
      class="border-primary text-primary hover:bg-primary inline-block rounded-md border px-8 py-3 font-mono text-sm tracking-widest uppercase transition-all hover:text-black hover:shadow-[0_0_15px_var(--color-primary)]"
    >
      RETURN HOME
    </a>
  </div>
</div>

<!-- ─── Error Detail Modal ─────────────────────────────────────────── -->
<Dialog.Root bind:open={detailModalOpen}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm"
      onclick={() => (detailModalOpen = false)}
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-[60] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-[#0d0d14] p-6 shadow-2xl outline-none"
    >
      <div class="mb-4 flex items-center justify-between">
        <Dialog.Title class="font-display text-lg font-bold tracking-wide">
          Error Detail
        </Dialog.Title>
        <Dialog.Close
          class="flex h-8 w-8 items-center justify-center rounded-full text-sm text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >✕</Dialog.Close
        >
      </div>
      <div class="space-y-3">
        <div>
          <div class="mb-1 text-xs font-bold uppercase opacity-50">
            Principal
          </div>
          <div
            class="rounded bg-white/5 p-2 font-mono text-xs break-all opacity-80"
          >
            {detailPrincipal}
          </div>
        </div>
        <div>
          <div class="mb-1 text-xs font-bold uppercase opacity-50">
            Raw Error
          </div>
          <pre
            class="max-h-64 overflow-y-auto rounded bg-white/5 p-3 font-mono text-xs break-all whitespace-pre-wrap">{detailRawError}</pre>
        </div>
      </div>
      <div class="mt-4 flex justify-end">
        <button
          class="rounded border border-white/10 bg-white/5 px-4 py-1.5 font-mono text-xs text-white/70 transition-all hover:bg-white/10"
          onclick={() => (detailModalOpen = false)}>Close</button
        >
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
