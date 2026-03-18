<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import {config} from "@/lib/config/client";
  import {JUNO_ENVIRONMENT} from "@/lib/config/constants";
  import {DropdownMenu} from "bits-ui";

  import {getAuthState, type AuthState} from "@/lib/auth";
  import {authStore} from "@/lib/auth/store.svelte";
  import {profileStore} from "@/lib/user/store.svelte";
  import {
    getUserProfile,
    saveUserProfile,
    createDefaultProfile,
  } from "@/lib/user";

  import {connectWallet, getWalletClient} from "@/lib/wallet/connection";
  import {buildWalletLinkMessage} from "@/lib/wallet/wallet-message";

  import {
    getTresrBalance,
    formatBalance,
    isRpcAvailable,
    resetRpcAvailability,
  } from "@/lib/blockchain/balance";
  import {shortenAddress} from "@/lib/blockchain/networks/display";
  import {log} from "@/lib/utils/log";

  const COMPONENT_NAME = "WalletLink";
  const COOLDOWN_MS = config.wallet.balance_refresh_cooldown_ms;

  const envKey =
    JUNO_ENVIRONMENT === "development"
      ? "anvil"
      : JUNO_ENVIRONMENT === "staging"
        ? "testnet"
        : "mainnet";
  const tokenSymbol = `$${config.blockchain.avalanche[envKey].token_ticker}`;

  // State flags for UI View
  let currentState:
    | "unauthenticated"
    | "guest"
    | "unlinked"
    | "linked"
    | "connect" = $state("unauthenticated");
  let dropdownOpen = $state(false);

  let balanceDisplay = $state("0.00");
  let addressDisplay = $state("");
  let connectStatusMsg = $state("Not connected");

  let isBalanceLoading = $state(false);
  let hasBalanceError = $state(false);
  let isRefreshing = $state(false);

  let cooldownRemaining = $state(0);
  let lastRefreshTime = 0;
  let cooldownTimer: ReturnType<typeof setInterval> | null = null;
  let currentAddress: string | null = null;
  let updateGeneration = 0;
  let disposed = false;

  const AUTH_HINT_KEY = "tresr-auth-hint";

  function startCooldownTimer() {
    if (disposed) return;
    if (cooldownTimer) clearInterval(cooldownTimer);

    cooldownRemaining = Math.max(
      0,
      Math.ceil((COOLDOWN_MS - (Date.now() - lastRefreshTime)) / 1000)
    );

    cooldownTimer = setInterval(() => {
      if (disposed) {
        clearInterval(cooldownTimer!);
        cooldownTimer = null;
        return;
      }

      const remaining = Math.max(
        0,
        COOLDOWN_MS - (Date.now() - lastRefreshTime)
      );
      cooldownRemaining = Math.ceil(remaining / 1000);

      if (remaining <= 0) {
        if (cooldownTimer) clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
    }, 1000);
  }

  function canRefresh(): boolean {
    return Date.now() - lastRefreshTime >= COOLDOWN_MS;
  }

  async function handleRefresh() {
    if (!canRefresh() || !currentAddress) return;

    resetRpcAvailability();
    lastRefreshTime = Date.now();
    startCooldownTimer();
    isBalanceLoading = true;
    hasBalanceError = false;
    isRefreshing = true;

    try {
      const balance = await getTresrBalance(currentAddress, false);
      if (isRpcAvailable()) {
        balanceDisplay = formatBalance(balance);
        addressDisplay = shortenAddress(currentAddress);

        const {getVaultCurrentBalance} = await import(
          "@/lib/blockchain/contracts/vault"
        );
        const vaultBal = await getVaultCurrentBalance();
        document.dispatchEvent(
          new CustomEvent("tresr:blockchain-synced", {
            detail: {vaultBalance: vaultBal},
          })
        );
      } else {
        hasBalanceError = true;
      }
    } catch {
      hasBalanceError = true;
    } finally {
      isBalanceLoading = false;
      isRefreshing = false;
    }
  }

  async function showLinkedState(address: string) {
    if (currentAddress === address && currentState === "linked") return;
    currentAddress = address;
    currentState = "linked";
    addressDisplay = shortenAddress(address);
    isBalanceLoading = true;
    hasBalanceError = false;

    try {
      const balance = await getTresrBalance(address, false);
      balanceDisplay = formatBalance(balance);

      const {getVaultCurrentBalance} = await import(
        "@/lib/blockchain/contracts/vault"
      );
      const vaultBal = await getVaultCurrentBalance();
      document.dispatchEvent(
        new CustomEvent("tresr:blockchain-synced", {
          detail: {vaultBalance: vaultBal},
        })
      );
    } catch {
      hasBalanceError = true;
    } finally {
      isBalanceLoading = false;
    }
  }

  async function updateUI(state: AuthState) {
    const gen = ++updateGeneration;

    if (!state.isAuthenticated) {
      localStorage.removeItem(AUTH_HINT_KEY);
      currentState = "unauthenticated";
      currentAddress = null;
      return;
    }

    localStorage.setItem(AUTH_HINT_KEY, "1");

    if (state.isGuest) {
      currentState = "guest";
      currentAddress = null;
      return;
    }

    // Check store first
    if (profileStore.value?.evm_wallet) {
      await showLinkedState(profileStore.value.evm_wallet);
      return;
    }

    // Store miss, fetch Juno
    if (state.user) {
      try {
        const doc = await getUserProfile(state.user.key);
        if (gen !== updateGeneration) return;
        if (doc?.data?.evm_wallet) {
          await showLinkedState(doc.data.evm_wallet);
          return;
        }
      } catch (e) {
        log.error(COMPONENT_NAME, "Failed to check profile", e);
      }
    }

    if (gen !== updateGeneration) return;

    currentState = "unlinked";
    currentAddress = null;
  }

  $effect(() => {
    updateUI(authStore.value);
  });

  $effect(() => {
    if (profileStore.value?.evm_wallet) {
      const auth = getAuthState();
      if (auth.isAuthenticated && !auth.isGuest) {
        if (currentAddress !== profileStore.value.evm_wallet) {
          showLinkedState(profileStore.value.evm_wallet);
        }
      }
    }
  });

  function handleOpenProfile(e?: Event) {
    document.dispatchEvent(new CustomEvent("tresr:open-profile"));
    dropdownOpen = false;
  }

  async function handleConnect() {
    try {
      const connection = await connectWallet();
      const address = connection.address;
      connectStatusMsg = `Connected: ${shortenAddress(address)}`;

      const auth = getAuthState();
      if (auth.user) {
        const doc = await getUserProfile(auth.user.key);
        if (doc?.data?.evm_wallet?.toLowerCase() === address.toLowerCase()) {
          await showLinkedState(address);
        } else {
          currentState = "connect"; // Link ready
        }
      }
    } catch (error: any) {
      connectStatusMsg = `Error: ${error?.message || String(error)}`;
    }
  }

  async function handleLink() {
    const address = connectStatusMsg.match(/0x[a-fA-F0-9]+/)?.[0];
    if (!address) return;

    try {
      const walletClient = await getWalletClient();
      const auth = getAuthState();
      if (!auth.user) throw new Error("Sign in with IID first.");

      const principal = auth.user.key;
      const message = buildWalletLinkMessage(
        principal,
        address as `0x${string}`
      );
      const signature = await walletClient.signMessage({
        account: address as `0x${string}`,
        message,
      });

      const existingProfile = await getUserProfile(principal);
      const profileInfo = {
        ...(existingProfile?.data || createDefaultProfile(principal)),
        evm_wallet: address,
        verification_signature: signature,
        verification_message: message,
      };

      await saveUserProfile(principal, profileInfo, existingProfile?.version);
      profileStore.value = profileInfo as any;

      await showLinkedState(address);
    } catch (error: any) {
      connectStatusMsg = `Error: ${error?.message || String(error)}`;
    }
  }

  function handleBlockchainSyncing(e: Event) {
    const {syncing} = (e as CustomEvent<{syncing: boolean}>).detail;
    isRefreshing = syncing;
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible" && currentAddress) {
      void getTresrBalance(currentAddress, false).then((balance) => {
        balanceDisplay = formatBalance(balance);
      });
    }
  }

  onMount(() => {
    // Try to get auth hint locally to stop flashing
    const hint = localStorage.getItem(AUTH_HINT_KEY);
    if (!hint) currentState = "unauthenticated";

    document.addEventListener(
      "tresr:blockchain-syncing",
      handleBlockchainSyncing
    );
    document.addEventListener("visibilitychange", handleVisibilityChange);
  });

  onDestroy(() => {
    disposed = true;
    if (cooldownTimer) clearInterval(cooldownTimer);
    document.removeEventListener(
      "tresr:blockchain-syncing",
      handleBlockchainSyncing
    );
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });
</script>

<DropdownMenu.Root bind:open={dropdownOpen}>
  <DropdownMenu.Trigger
    class="flex h-12 w-12 items-center justify-center rounded-full text-xl transition-colors hover:bg-white/10"
    title="Wallet"
    id="wallet-bell"
  >
    💰
  </DropdownMenu.Trigger>
  <DropdownMenu.Content
    class="border-primary/20 z-50 mt-2 w-72 rounded-xl border bg-black/80 p-4 shadow-xl backdrop-blur-md outline-none"
    sideOffset={8}
    align="end"
  >
    {#if currentState === "unauthenticated"}
      <div>
        <h3 class="text-lg font-bold text-white">Wallet</h3>
        <p class="text-sm text-white/70">
          Please sign in to access wallet features.
        </p>
      </div>
    {:else if currentState === "guest"}
      <div>
        <h3 class="text-lg font-bold text-white">Wallet</h3>
        <p class="text-sm text-white/70">
          Guests cannot connect a wallet. Sign in as a degen to link your
          wallet.
        </p>
      </div>
    {:else if currentState === "unlinked"}
      <div>
        <h3 class="text-lg font-bold text-white">No Wallet Linked</h3>
        <p class="mt-1 text-sm text-white/70">
          Link your wallet in the Player Profile to view your balance.
        </p>
        <button
          onclick={handleOpenProfile}
          class="bg-primary hover:bg-primary/80 mt-3 w-full rounded px-4 py-2 text-sm font-bold text-black uppercase transition-colors"
        >
          Open Profile
        </button>
      </div>
    {:else if currentState === "linked"}
      <div>
        <h3 class="text-lg font-bold text-white">Wallet Balance</h3>

        <div class="mt-2 rounded bg-white/5 p-3">
          {#if isBalanceLoading}
            <div class="flex items-center gap-2">
              <div
                class="border-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
              ></div>
              <span class="text-sm text-white/70">Fetching balance...</span>
            </div>
          {:else if hasBalanceError}
            <div>
              <span class="text-sm text-[#ef4444]">Failed to fetch balance</span
              >
            </div>
          {:else}
            <div>
              <div class="flex items-center justify-between">
                <span class="font-mono text-xl font-bold text-[#facc15]"
                  >{balanceDisplay}</span
                >
                <span class="text-sm font-semibold text-[#facc15]"
                  >{tokenSymbol}</span
                >
              </div>
            </div>
          {/if}
        </div>

        <div class="mt-2 text-center font-mono text-xs text-white/50">
          {addressDisplay}
        </div>

        <div class="mt-2 flex justify-end">
          <button
            onclick={handleRefresh}
            disabled={cooldownRemaining > 0}
            class="flex items-center gap-1 rounded px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-50"
            title="Refresh balance"
          >
            <span class:animate-spin={isRefreshing}>♻️</span>
            <span>{cooldownRemaining > 0 ? "Wait..." : "Refresh"}</span>
          </button>
        </div>

        {#if cooldownRemaining > 0}
          <div class="mt-1 text-right">
            <span class="text-xs text-white/50"
              >Wait <span>{cooldownRemaining}</span>s</span
            >
          </div>
        {/if}
      </div>
    {:else if currentState === "connect"}
      <div>
        <h3 class="text-lg font-bold text-white">Wallet</h3>
        <div class="mb-2 text-xs text-white/70">{connectStatusMsg}</div>
        <button
          onclick={handleConnect}
          class="bg-primary hover:bg-primary/80 w-full rounded px-4 py-2 text-sm font-bold text-black uppercase transition-colors"
          class:hidden={connectStatusMsg.startsWith("Connected")}
        >
          Connect Wallet
        </button>
        {#if connectStatusMsg.startsWith("Connected")}
          <button
            onclick={handleLink}
            class="mt-2 w-full rounded bg-[#a78bfa] px-4 py-2 text-sm font-bold text-black uppercase transition-colors hover:bg-[#a78bfa]/80"
          >
            Link to Account
          </button>
        {/if}
      </div>
    {/if}
  </DropdownMenu.Content>
</DropdownMenu.Root>
