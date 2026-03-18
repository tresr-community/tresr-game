<script lang="ts">
  import {onMount} from "svelte";
  import {initSatellite, listDocs} from "@junobuild/core";
  import {
    getErrors,
    deleteErrors,
    resolveError,
    liftBan,
  } from "@/lib/satellite/satellite-api";

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
  let allErrors: ErrorRecord[] = [];
  let selectedErrors = new Set<string>();
  let isLoading = true;
  let isUnauthorized = false;

  let activeTab = "errors"; // errors, economy, anticheat

  // Filter State
  let searchQuery = "";
  let filterEnv = "";
  let filterResolved = "";
  let selectAllHead = false;

  // Economy State
  let econLoading = false;
  let chainFees = 0n;
  let chainRewarded = 0n;
  let chainBurned = 0n;
  let chainVault = 0n;
  let chainOnline = false;
  let usersData: {
    principal: string;
    nickname: string;
    onChainBalance: bigint;
  }[] = [];

  // Detail Modal State
  let detailModalOpen = false;
  let detailPrincipal = "";
  let detailRawError = "";

  // Derived State
  $: filteredErrors = allErrors.filter((r) => {
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
  });

  $: selectedCount = selectedErrors.size;

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
    selectedErrors = selectedErrors; // trigger reactivity
  }

  function toggleSelection(id: string) {
    if (selectedErrors.has(id)) {
      selectedErrors.delete(id);
    } else {
      selectedErrors.add(id);
    }
    selectedErrors = selectedErrors; // trigger reactivity
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
        .vault_contract as `0x${string}`;

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
    <div class="flex justify-center py-20">
      <span class="loading loading-ring loading-lg"></span>
    </div>
  {:else if isUnauthorized}
    <div class="hero min-h-[80vh]">
      <div class="hero-content flex-col text-center">
        <!-- Pulsing skull -->
        <div class="relative mb-4">
          <div
            class="bg-error/20 absolute inset-0 animate-ping rounded-full"
          ></div>
          <div
            class="border-error/60 bg-error/10 relative flex h-28 w-28 items-center justify-center rounded-full border-2 text-6xl shadow-[0_0_40px_rgba(239,68,68,0.4)]"
          >
            💀
          </div>
        </div>

        <h2
          class="font-display text-error text-5xl font-black tracking-[0.2em] uppercase drop-shadow-[0_0_20px_rgba(239,68,68,0.8)] sm:text-7xl"
        >
          Access Denied
        </h2>

        <div
          role="alert"
          class="alert alert-error alert-vertical sm:alert-horizontal mt-6 max-w-sm"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 shrink-0 stroke-current"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
          <div>
            <h3 class="font-bold">Unauthorized territory</h3>
            <div class="text-xs opacity-80">
              This session has been flagged. Admin access only.
            </div>
          </div>
        </div>

        <a
          href="/"
          class="btn btn-error btn-lg mt-8 gap-2 shadow-[0_0_20px_rgba(239,68,68,0.5)]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            ></path>
          </svg>
          Return Home
        </a>
      </div>
    </div>
  {:else}
    <!-- Tab panel -->
    <div>
      <!-- Tabs -->
      <div role="tablist" class="tabs tabs-box mb-6">
        <input
          type="radio"
          name="admin-tabs"
          role="tab"
          class="tab"
          aria-label="⚠️ Errors"
          id="tab-errors"
          checked={activeTab === "errors"}
          on:change={() => (activeTab = "errors")}
        />
        <div
          role="tabpanel"
          class="tab-content bg-base-100 border-base-300 rounded-box p-4"
        >
          <!-- ─── Errors Tab ─────────────────────────────────────────────── -->
          <div class="mb-6 flex flex-col gap-4">
            <h2 class="text-xl font-bold">
              Error Records ({filteredErrors.length})
            </h2>

            <!-- Filter & Controls Bar -->
            <div
              class="bg-base-200 border-base-300 rounded-t-box flex flex-wrap items-center justify-between gap-4 border border-b-0 p-3"
            >
              <div class="flex flex-1 flex-wrap items-center gap-3">
                <label
                  class="input input-bordered input-sm flex w-full max-w-xs items-center gap-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    class="h-4 w-4 opacity-70"
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
                    class="grow"
                  />
                </label>
                <select
                  bind:value={filterEnv}
                  class="select select-bordered select-sm"
                >
                  <option value="">All environments</option>
                  <option value="mainnet">mainnet</option>
                  <option value="testnet">testnet</option>
                  <option value="anvil">anvil</option>
                </select>
                <select
                  bind:value={filterResolved}
                  class="select select-bordered select-sm"
                >
                  <option value="">All statuses</option>
                  <option value="false">Unresolved</option>
                  <option value="true">Resolved</option>
                </select>
              </div>

              <!-- Actions & Selection (Right) -->
              <div class="flex flex-wrap items-center gap-3">
                {#if selectedCount > 0}
                  <div
                    class="border-base-300 flex items-center gap-3 border-r pr-3"
                  >
                    <span class="badge badge-neutral badge-sm"
                      >{selectedCount} selected</span
                    >
                  </div>
                {/if}

                <div class="flex gap-2">
                  {#if selectedCount > 0}
                    <button
                      class="btn btn-error btn-sm"
                      on:click={handleDeleteSelected}
                    >
                      🗑 Delete
                    </button>
                  {/if}
                  <button class="btn btn-ghost btn-sm" on:click={loadErrors}>
                    ↺ Refresh
                  </button>
                </div>
              </div>
            </div>

            <div
              class="border-base-300 rounded-b-box overflow-x-auto border border-t-0"
            >
              <table class="table-sm table">
                <thead>
                  <tr>
                    <th
                      ><input
                        type="checkbox"
                        bind:checked={selectAllHead}
                        on:change={handleSelectAll}
                        class="checkbox checkbox-xs"
                      /></th
                    >
                    <th>Error ID</th>
                    <th>Component</th>
                    <th>Message</th>
                    <th>Principal</th>
                    <th>Env</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {#each filteredErrors as r}
                    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
                    <tr
                      class={`hover ${selectedErrors.has(r.error_id) ? "bg-base-300" : "cursor-pointer"}`}
                      on:click={() => openDetailModal(r)}
                    >
                      <td on:click|stopPropagation
                        ><input
                          type="checkbox"
                          checked={selectedErrors.has(r.error_id)}
                          on:change={() => toggleSelection(r.error_id)}
                          class="checkbox checkbox-xs row-check"
                        /></td
                      >
                      <td
                        ><code class="text-xs font-mono">{r.error_id}</code></td
                      >
                      <td class="text-xs font-mono">{r.component}</td>
                      <td class="max-w-xs truncate text-xs" title={r.message}
                        >{r.message}</td
                      >
                      <td
                        class="text-xs font-mono truncate max-w-[120px]"
                        title={r.principal}>{r.principal.slice(0, 12)}…</td
                      >
                      <td
                        ><span
                          class={`badge badge-xs ${r.environment === "mainnet" ? "badge-warning" : r.environment === "testnet" ? "badge-info" : "badge-ghost"}`}
                          >{r.environment}</span
                        ></td
                      >
                      <td class="text-xs whitespace-nowrap"
                        >{new Date(Number(r.timestamp_ms)).toLocaleString()}</td
                      >
                      <td>
                        {#if r.resolved}
                          <span class="badge badge-success badge-xs"
                            >resolved</span
                          >
                        {:else}
                          <span class="badge badge-error badge-xs">open</span>
                        {/if}
                      </td>
                      <td on:click|stopPropagation>
                        <button
                          class={`btn btn-xs btn-ghost ${r.resolved ? "text-warning" : "text-success"}`}
                          on:click={() =>
                            handleResolveToggle(r.error_id, r.resolved)}
                        >
                          {r.resolved ? "↩ Reopen" : "✓ Resolve"}
                        </button>
                      </td>
                    </tr>
                  {:else}
                    <tr
                      ><td colspan="9" class="text-center opacity-50 py-8"
                        >No errors found</td
                      ></tr
                    >
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <input
          type="radio"
          name="admin-tabs"
          role="tab"
          class="tab"
          aria-label="💰 Economy"
          id="tab-economy"
          checked={activeTab === "economy"}
          on:change={() => {
            activeTab = "economy";
            if (usersData.length === 0) loadEconomy();
          }}
        />
        <div
          role="tabpanel"
          class="tab-content bg-base-100 border-base-300 rounded-box p-4"
        >
          <!-- ─── Economy Tab ─────────────────────────────────────────────── -->
          <div class="mb-4 flex flex-wrap items-center gap-3">
            <h2 class="flex-1 text-xl font-bold">Economy</h2>
            <button class="btn btn-ghost btn-sm" on:click={loadEconomy}
              >↺ Refresh</button
            >
          </div>

          {#if econLoading}
            <div class="flex justify-center py-12">
              <span class="loading loading-dots loading-md"></span>
            </div>
          {:else}
            <div>
              <!-- Blockchain -->
              <div class="mb-4">
                <div class="mb-2 flex items-center gap-2">
                  <span class="font-mono text-xs font-bold uppercase opacity-60"
                    >⛓ Blockchain (Live)</span
                  >
                  <span
                    class={`badge badge-xs ${chainOnline ? "badge-success" : "badge-error"}`}
                    >{chainOnline ? "online" : "offline"}</span
                  >
                </div>
                <div
                  class="stats stats-vertical bg-base-200 md:stats-horizontal w-full shadow"
                >
                  <div class="stat">
                    <div class="stat-title">Fees</div>
                    <div class="stat-value text-info text-lg">
                      {chainOnline ? formatBalance(chainFees) : "—"}
                    </div>
                    <div class="stat-desc">vault.totalFeesCollected()</div>
                  </div>
                  <div class="stat">
                    <div class="stat-title">Rewards</div>
                    <div class="stat-value text-success text-lg">
                      {chainOnline ? formatBalance(chainRewarded) : "—"}
                    </div>
                    <div class="stat-desc">vault.totalRewardsPaid()</div>
                  </div>
                  <div class="stat">
                    <div class="stat-title">Burned</div>
                    <div class="stat-value text-error text-lg">
                      {chainOnline ? formatBalance(chainBurned) : "—"}
                    </div>
                    <div class="stat-desc">vault.totalBurned()</div>
                  </div>
                  <div class="stat">
                    <div class="stat-title">Vault Balance</div>
                    <div class="stat-value text-warning text-lg">
                      {chainOnline ? formatBalance(chainVault) : "—"}
                    </div>
                    <div class="stat-desc">vault.currentBalance()</div>
                  </div>
                </div>
              </div>

              <!-- Per-user balance table -->
              <div
                class="mb-2 font-mono text-xs font-bold uppercase opacity-60"
              >
                👤 Per-User Balance Audit
              </div>
              <div class="rounded-box border-base-300 overflow-x-auto border">
                <table class="table-sm table">
                  <thead>
                    <tr>
                      <th>Principal</th>
                      <th>Nickname</th>
                      <th>On-Chain Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each usersData as u}
                      <tr>
                        <td
                          class="text-xs font-mono truncate max-w-[120px]"
                          title={u.principal}>{u.principal.slice(0, 14)}…</td
                        >
                        <td>{u.nickname}</td>
                        <td class="font-mono text-xs"
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
            </div>
          {/if}
        </div>

        <input
          type="radio"
          name="admin-tabs"
          role="tab"
          class="tab"
          aria-label="🚫 Anti-Cheat"
          id="tab-anticheat"
          checked={activeTab === "anticheat"}
          on:change={() => (activeTab = "anticheat")}
        />
        <div
          role="tabpanel"
          class="tab-content bg-base-100 border-base-300 rounded-box p-4"
        >
          <!-- ─── Anti-Cheat Tab ──────────────────────────────────────────── -->
          <div class="mb-4 flex items-center gap-3">
            <h2 class="flex-1 text-xl font-bold">Banned Users (0)</h2>
            <button class="btn btn-ghost btn-sm">↺ Refresh</button>
          </div>

          <div class="rounded-box border-base-300 overflow-x-auto border">
            <table class="table-sm table">
              <thead>
                <tr>
                  <th>Principal</th>
                  <th>Nickname</th>
                  <th>Offences</th>
                  <th>Reason</th>
                  <th>Banned Until</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colspan="7" class="py-8 text-center opacity-50"
                    >Click Refresh to load ban data</td
                  >
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Return Home & Calculator -->
  <div class="mt-10 mb-8 flex justify-center gap-4">
    <a
      href="/"
      class="btn btn-outline btn-primary btn-sm font-mono tracking-widest"
    >
      ← RETURN HOME
    </a>
    <a
      href="/calc"
      class="btn btn-outline btn-secondary btn-sm font-mono tracking-widest"
      title="Secret Prize Calculator"
    >
      🧮 CALCULATOR
    </a>
  </div>
</div>

<!-- Modal -->
{#if detailModalOpen}
  <div class="modal modal-middle modal-open">
    <div class="modal-box border-base-content/10 bg-base-300 max-w-2xl border">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="font-display text-lg font-bold tracking-wide">
          Error Detail
        </h3>
        <button
          class="btn btn-circle btn-ghost btn-sm"
          on:click={() => (detailModalOpen = false)}>✕</button
        >
      </div>
      <div class="space-y-3">
        <div>
          <div class="mb-1 text-xs font-bold uppercase opacity-50">
            Principal
          </div>
          <div
            class="bg-base-200 rounded p-2 font-mono text-xs break-all opacity-80"
          >
            {detailPrincipal}
          </div>
        </div>
        <div>
          <div class="mb-1 text-xs font-bold uppercase opacity-50">
            Raw Error
          </div>
          <pre
            class="bg-base-200 max-h-64 overflow-y-auto rounded p-3 font-mono text-xs break-all whitespace-pre-wrap">{detailRawError}</pre>
        </div>
      </div>
      <div class="modal-action">
        <button
          class="btn btn-ghost btn-sm"
          on:click={() => (detailModalOpen = false)}>Close</button
        >
      </div>
    </div>
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
    <div
      class="modal-backdrop"
      on:click={() => (detailModalOpen = false)}
    ></div>
  </div>
{/if}
