<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import {getAuthState} from "@/lib/auth";
  import {getUserProfile, genNickName, enqueueProfileWrite} from "@/lib/user";
  import {uploadAvatar} from "@/lib/user/avatar";
  import Modal from "@/components/ui/Modal.svelte";
  import {
    connectWallet,
    getWalletClient,
    disconnectWallet,
  } from "@/lib/wallet/connection";
  import {buildWalletLinkMessage} from "@/lib/wallet/wallet-message";
  import {shortenAddress} from "@/lib/blockchain/networks/display";
  import type {UserProfile} from "@/types/backend";
  import {log} from "@/lib/utils/log";
  import {profileStore} from "@/lib/user/store.svelte";
  import {claimsStore} from "@/lib/user/claimsStore.svelte";
  import {
    trackModalOpen,
    trackProfileUpdate,
    trackAvatarUpload,
    trackWalletLink,
    trackWalletUnlink,
  } from "@/lib/metrics/analytics";

  const COMPONENT_NAME = "ProfileModal";

  let open = $state(false);
  let walletLinkOpen = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  let isLoading = $state(true);
  let isSaving = $state(false);
  let isAvatarUploading = $state(false);

  let currentProfile: UserProfile | null = $state(null);
  let currentVersion: bigint | undefined = $state(undefined);

  let nickname = $state("");
  let email = $state("");
  let principal = $state("-");

  let isGuest = $state(false);
  let isSiwaLogin = $state(false);
  let hasWallet = $state(false);
  let walletDisplay = $state("");
  let avatarUrl = $state("");
  let avatarLetter = $state("?");

  let stats = $state({
    high_score: 0n,
    total_games_played: 0n,
    total_games_won: 0n,
    total_games_lost: 0n,
  });

  async function openProfileModal() {
    log.info(COMPONENT_NAME, "Opening modal");
    open = true;
    trackModalOpen("profile");
    await loadProfile();
  }

  async function loadProfile() {
    const auth = getAuthState();
    if (!auth.isAuthenticated) return;

    isLoading = true;
    isGuest = auth.isGuest;
    principal = auth.isGuest ? "Guest Session" : auth.user?.key || "-";

    try {
      if (auth.isGuest) {
        currentProfile = {
          user_id: "guest",
          nickname: "Guest Agent",
          email: "",
          evm_wallet: undefined,
          preferences: {theme: "synthwave", has_read_instructions: false},
          stats: {
            high_score: 0n,
            total_games_played: 0n,
            total_games_won: 0n,
            total_games_lost: 0n,
          },
        } as any;
        currentVersion = undefined;
      } else if (auth.user) {
        const doc = await getUserProfile(auth.user.key);
        if (doc) {
          currentProfile = doc.data;
          currentVersion = doc.version;
          if (!currentProfile.nickname) {
            await enqueueProfileWrite(auth.user.key, (profile) => ({
              ...profile,
              nickname: genNickName(),
            }));
            const refreshed = await getUserProfile(auth.user.key);
            if (refreshed) {
              currentProfile = refreshed.data;
              currentVersion = refreshed.version;
            }
          }
        } else {
          // Create default profile via the write queue (prevents race with store.svelte.ts)
          await enqueueProfileWrite(auth.user.key, (profile) => profile);
          const refreshed = await getUserProfile(auth.user.key);
          if (refreshed) {
            currentProfile = refreshed.data;
            currentVersion = refreshed.version;
          }
        }
      }

      if (currentProfile) {
        nickname = currentProfile.nickname || "";
        email = currentProfile.email || "";
        stats = currentProfile.stats;
        avatarUrl = currentProfile.preferences?.avatar_url || "";
        avatarLetter =
          (currentProfile.nickname || "?")[0]?.toUpperCase() || "?";

        isSiwaLogin =
          auth.authMode === "avalanche" ||
          currentProfile.login_method === "siwa";
        hasWallet = !!currentProfile.evm_wallet;
        walletDisplay = hasWallet
          ? shortenAddress(currentProfile.evm_wallet!)
          : "";
      }
    } catch (err) {
      log.error(COMPONENT_NAME, "Load failed", err);
    } finally {
      isLoading = false;
    }
  }

  async function handleSaveProfile() {
    const auth = getAuthState();
    if (!auth.user || !currentProfile || isGuest) return;

    const newNickname = nickname.trim();
    if (!newNickname) {
      window.showErrorToast?.("Nickname cannot be empty");
      return;
    }

    isSaving = true;
    try {
      await enqueueProfileWrite(auth.user.key, (profile) => ({
        ...profile,
        nickname: newNickname,
        email: email.trim(),
      }));

      currentProfile.nickname = newNickname;
      currentProfile.email = email.trim();

      window.dispatchEvent(
        new CustomEvent("tresr:profile-updated", {
          detail: {nickname: newNickname},
        })
      );
      profileStore.value = {...currentProfile} as any;

      trackProfileUpdate("nickname");
      window.showInfoToast?.("Profile updated successfully");
      open = false;
    } catch (error) {
      log.error(COMPONENT_NAME, "Failed to save profile:", error);
    } finally {
      isSaving = false;
    }
  }

  async function handleLinkWallet() {
    walletLinkOpen = true;
    try {
      const {address} = await connectWallet();
      const walletClient = await getWalletClient();
      const auth = getAuthState();
      if (!auth.user) throw new Error("Not authenticated");

      const message = buildWalletLinkMessage(auth.user.key, address);
      const sig = await walletClient.signMessage({account: address, message});

      if (currentProfile && auth.user) {
        await enqueueProfileWrite(auth.user.key, (profile) => ({
          ...profile,
          evm_wallet: address,
          verification_signature: sig,
          verification_message: message,
        }));

        currentProfile.evm_wallet = address as any;
        hasWallet = true;
        walletDisplay = shortenAddress(address);

        trackWalletLink();
        window.showInfoToast?.("Avalanche Wallet link established");
      }
    } catch (err: any) {
      if (
        err?.message?.includes("rejected") ||
        err?.code === 4001 ||
        err?.message?.includes("cancelled")
      ) {
        window.showWarningToast?.("Wallet connection cancelled or rejected");
      } else if (err?.message?.includes("switch") || err?.code === 4902) {
        log.error(COMPONENT_NAME, "Wrong network — please switch chain", err);
      } else {
        log.error(COMPONENT_NAME, "Wallet link failed", err);
      }
    } finally {
      walletLinkOpen = false;
    }
  }

  async function handleUnlinkWallet() {
    if (!confirm("Remove Avalanche Wallet?")) return;
    try {
      await disconnectWallet();
      const auth = getAuthState();
      if (currentProfile && auth.user) {
        await enqueueProfileWrite(auth.user.key, (profile) => ({
          ...profile,
          evm_wallet: undefined,
          wallet_proof: undefined,
        }));
        currentProfile.evm_wallet = undefined;
        hasWallet = false;
        trackWalletUnlink();
        window.showInfoToast?.("Avalanche Wallet link severed");
      }
    } catch (err) {
      log.error(COMPONENT_NAME, "Wallet unlink failed", err);
      window.showErrorToast?.("Failed to sever Avalanche Wallet link");
    }
  }

  async function handleAvatarUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const auth = getAuthState();
    if (!auth.user || !currentProfile) return;

    isAvatarUploading = true;
    try {
      const url = await uploadAvatar(file, auth.user.key);
      await enqueueProfileWrite(auth.user.key, (profile) => ({
        ...profile,
        preferences: {...profile.preferences, avatar_url: url},
      }));

      if (!currentProfile.preferences)
        currentProfile.preferences = {
          theme: "synthwave",
          has_read_instructions: false,
        };
      currentProfile.preferences.avatar_url = url;
      avatarUrl = url;

      profileStore.value = {...currentProfile} as any;
      trackAvatarUpload();
      window.showInfoToast?.("Avatar updated!");
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(COMPONENT_NAME, `Avatar upload failed: ${msg}`, err);
    } finally {
      isAvatarUploading = false;
      if (fileInput) fileInput.value = "";
    }
  }

  onMount(() => {
    window.addEventListener("tresr:open-profile", openProfileModal);
  });

  onDestroy(() => {
    window.removeEventListener("tresr:open-profile", openProfileModal);
  });
</script>

<Modal bind:open title="Player Profile" mobileFull>
  {#if isLoading}
    <div class="py-10 text-center">
      <div
        class="border-primary mx-auto h-10 w-10 animate-spin rounded-full border-4 border-t-transparent"
      ></div>
      <p
        class="text-primary mt-4 animate-pulse font-mono text-xs tracking-widest"
      >
        SCANNED BIOMETRICS...
      </p>
    </div>
  {:else}
    <div class="space-y-6 pt-2">
      <!-- Avatar -->
      <div class="flex justify-center">
        <div
          class="group relative cursor-pointer"
          onclick={() => !isGuest && fileInput?.click()}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === "Enter" && !isGuest && fileInput?.click()}
        >
          <div
            class="border-primary/30 bg-primary/10 text-primary ring-primary/10 ring-offset-background flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 shadow-[0_0_15px_var(--color-primary)] ring-2 ring-offset-2 transition-all hover:scale-105"
          >
            {#if avatarUrl}
              <img
                src={avatarUrl}
                class="h-full w-full object-cover"
                alt="Avatar"
              />
            {:else}
              <span class="text-3xl font-black">{avatarLetter}</span>
            {/if}
          </div>
          {#if !isGuest}
            <div
              class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <span
                class="text-[10px] font-bold tracking-wider text-white uppercase"
                >Change</span
              >
            </div>
          {/if}
          {#if isAvatarUploading}
            <div
              class="absolute inset-0 flex items-center justify-center rounded-full bg-black/70"
            >
              <div
                class="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
              ></div>
            </div>
          {/if}
        </div>
        <input
          bind:this={fileInput}
          onchange={handleAvatarUpload}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          class="hidden"
          disabled={isGuest}
        />
      </div>

      <!-- Nickname -->
      <div class="flex w-full flex-col gap-1">
        <label
          class="px-1 text-xs font-bold tracking-widest text-[#a855f7] uppercase"
          for="profile-nickname">Degen Handle</label
        >
        <input
          id="profile-nickname"
          bind:value={nickname}
          disabled={isGuest}
          type="text"
          placeholder="Enter handle..."
          class="border-primary/20 focus:border-primary focus:ring-primary w-full rounded-md border bg-black/40 px-4 py-3 font-mono text-white placeholder-white/30 transition-colors focus:ring-1 focus:outline-none disabled:opacity-50"
        />
      </div>

      <!-- Email -->
      <div class="flex w-full flex-col gap-1">
        <label
          class="px-1 text-xs font-bold tracking-widest text-[#a855f7] uppercase"
          for="profile-email">Secure Comms (Email)</label
        >
        <input
          id="profile-email"
          bind:value={email}
          disabled={isGuest}
          type="email"
          placeholder="spam@tresr.community"
          class="border-primary/20 focus:border-primary focus:ring-primary w-full rounded-md border bg-black/40 px-4 py-3 font-mono text-white placeholder-white/30 transition-colors focus:ring-1 focus:outline-none disabled:opacity-50"
        />
      </div>

      <!-- Principal -->
      <div class="flex w-full flex-col gap-1">
        <div class="flex items-center justify-between px-1">
          <div
            class="text-xs font-bold tracking-widest text-white/50 uppercase"
          >
            Identity (Principal)
          </div>
          <button
            onclick={() => {
              navigator.clipboard.writeText(principal);
              window.showInfoToast?.("Principal copied to clipboard");
            }}
            class="text-white/40 transition-colors hover:text-white"
            title="Copy Principal"
            aria-label="Copy Principal"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
              ></path>
            </svg>
          </button>
        </div>
        <div
          class="w-full truncate rounded-md border border-white/5 bg-black/20 p-3 font-mono text-xs tracking-wider text-white/70 opacity-70 select-all"
        >
          {principal}
        </div>
      </div>

      <!-- Wallet -->
      {#if !isGuest}
        <div
          class="flex w-full flex-col gap-3 rounded-md border border-white/10 bg-white/5 p-4"
        >
          <div class="text-sm font-bold tracking-widest text-white uppercase">
            Avalanche Wallet
          </div>
          <div class="space-y-4">
            {#if isSiwaLogin}
              <div
                role="alert"
                class="flex items-center gap-2 rounded-md border border-[#0284c7]/50 bg-[#0284c7]/20 px-3 py-2 text-[#e0f2fe]"
              >
                <span class="text-[10px] font-bold uppercase"
                  >Primary Identity</span
                >
                <span class="ml-auto font-mono text-xs opacity-80"
                  >{walletDisplay}</span
                >
              </div>
              <p class="text-xs text-white/40 italic">
                This wallet was used to sign in and cannot be unlinked.
              </p>
            {:else if hasWallet}
              <div
                role="alert"
                class="flex items-center gap-2 rounded-md border border-[#16a34a]/50 bg-[#16a34a]/20 px-3 py-2 text-[#dcfce7]"
              >
                <span class="text-[10px] font-bold uppercase"
                  >Link Established</span
                >
                <span class="ml-auto font-mono text-xs opacity-80"
                  >{walletDisplay}</span
                >
              </div>
              <button
                onclick={handleUnlinkWallet}
                class="w-full rounded-md border border-[#dc2626]/50 bg-[#dc2626]/10 py-2 text-xs font-bold tracking-widest text-[#f87171] uppercase transition-colors hover:bg-[#dc2626]/20"
                >Sever Link</button
              >
            {:else}
              <button
                onclick={handleLinkWallet}
                class="flex w-full items-center justify-center gap-2 rounded-md bg-[#06b6d4] py-2 text-sm font-bold tracking-widest text-black uppercase shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all hover:scale-[1.02] hover:bg-[#0891b2] active:scale-95"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  class="h-5 w-5"
                  ><path
                    d="M2.273 5.625A4.483 4.483 0 015.25 4.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 3H5.25a3 3 0 00-2.977 2.625zM2.273 8.625A4.483 4.483 0 015.25 7.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 6H5.25a3 3 0 00-2.977 2.625zM5.25 9a3 3 0 00-3 3v6a3 3 0 003 3h13.5a3 3 0 003-3v-6a3 3 0 00-3-3H15a.75.75 0 00-.75.75 2.25 2.25 0 01-4.5 0A.75.75 0 009 9H5.25z"
                  ></path></svg
                >
                Link Wallet
              </button>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Stats -->
      <div
        class="flex w-full flex-col overflow-hidden rounded-md border border-white/5 bg-black/40 shadow-inner md:flex-row"
      >
        <div
          class="flex flex-1 flex-col items-center justify-center border-b border-white/5 p-4 md:border-r md:border-b-0"
        >
          <div
            class="text-[10px] font-bold tracking-widest text-white/40 uppercase"
          >
            High Score
          </div>
          <div
            class="text-primary font-mono text-2xl font-bold drop-shadow-[0_0_8px_var(--color-primary)]"
          >
            {stats.high_score.toString()}
          </div>
        </div>
        <div
          class="flex flex-1 flex-col items-center justify-center border-b border-white/5 p-4 md:border-r md:border-b-0"
        >
          <div
            class="text-[10px] font-bold tracking-widest text-white/40 uppercase"
          >
            Played
          </div>
          <div class="font-mono text-2xl font-bold text-[#06b6d4]">
            {stats.total_games_played.toString()}
          </div>
        </div>
        <div class="flex flex-1 flex-col items-center justify-center p-4">
          <div
            class="text-[10px] font-bold tracking-widest text-white/40 uppercase"
          >
            Won
          </div>
          <div class="font-mono text-2xl font-bold text-[#10b981]">
            {stats.total_games_won.toString()}
          </div>
        </div>
      </div>

      {#if isGuest}
        <div
          role="alert"
          class="rounded-md border border-[#eab308]/50 bg-[#eab308]/10 p-3 text-sm text-[#fef08a]"
        >
          <span>Login to access full profile and link wallet.</span>
        </div>
      {/if}

      <div class="h-px w-full bg-white/10"></div>

      <div
        class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <a
          href="/claims"
          onclick={() => (open = false)}
          class="flex w-full items-center justify-center gap-2 rounded-md border {claimsStore.hasUrgentClaims
            ? 'animate-pulse border-[#eab308] bg-[#eab308]/20 text-white hover:bg-[#eab308]/30'
            : 'border-[#eab308] px-6 py-2 font-bold tracking-widest text-[#eab308] hover:bg-[#eab308]/10'} px-6 py-2 font-bold tracking-widest uppercase transition-colors sm:w-auto"
        >
          <span class="text-lg">🏆</span>
          {claimsStore.hasUrgentClaims ? "Claim Prize!" : "Rewards"}
        </a>
        <button
          onclick={handleSaveProfile}
          disabled={isGuest || isSaving}
          class="bg-primary hover:bg-primary/90 flex w-full items-center justify-center rounded-md px-8 py-2 font-bold tracking-widest text-black uppercase shadow-[0_0_15px_var(--color-primary)] transition-all hover:scale-[1.02] active:scale-95 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
        >
          {#if isSaving}
            <div
              class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent"
            ></div>
          {/if}
          Update Identity
        </button>
      </div>
    </div>
  {/if}
</Modal>

<Modal
  bind:open={walletLinkOpen}
  closeOnOutsideClick={false}
  closeOnEscape={false}
  mobileFull
>
  <div
    class="flex min-h-[50vh] flex-1 flex-col items-center justify-center py-8"
  >
    <div
      class="border-primary h-12 w-12 animate-spin rounded-full border-4 border-t-transparent"
    ></div>
    <p
      class="mt-6 animate-pulse font-mono text-sm tracking-widest text-white/70 uppercase"
    >
      Establishing Link...
    </p>
  </div>
</Modal>
