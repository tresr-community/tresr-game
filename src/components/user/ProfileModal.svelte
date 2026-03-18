<script lang="ts">
  import {onMount, onDestroy} from "svelte";
  import {getAuthState} from "@/lib/auth";
  import {
    getUserProfile,
    saveUserProfile,
    createDefaultProfile,
    genNickName,
    enqueueProfileWrite,
  } from "@/lib/user";
  import {uploadAvatar} from "@/lib/user/avatar";
  import {
    connectWallet,
    getWalletClient,
    disconnectWallet,
  } from "@/lib/wallet/connection";
  import {buildWalletLinkMessage} from "@/lib/wallet/wallet-message";
  import {shortenAddress} from "@/lib/blockchain/networks/display";
  import type {UserProfile} from "@/types/backend";
  import {log} from "@/lib/utils/log";
  import {profileStore} from "@/lib/user/store";
  import {
    trackModalOpen,
    trackProfileUpdate,
    trackAvatarUpload,
    trackWalletLink,
    trackWalletUnlink,
  } from "@/lib/metrics/analytics";

  const COMPONENT_NAME = "ProfileModal";

  let modal: HTMLDialogElement;
  let walletLinkModal: HTMLDialogElement;
  let fileInput: HTMLInputElement;

  let isLoading = true;
  let isSaving = false;
  let isAvatarUploading = false;

  let currentProfile: UserProfile | null = null;
  let currentVersion: bigint | undefined;

  let nickname = "";
  let email = "";
  let principal = "-";

  let isGuest = false;
  let isSiwaLogin = false;
  let hasWallet = false;
  let walletDisplay = "";
  let avatarUrl = "";
  let avatarLetter = "?";

  let stats = {
    high_score: 0n,
    total_games_played: 0n,
    total_games_won: 0n,
    total_games_lost: 0n,
  };

  async function openProfileModal() {
    log.info(COMPONENT_NAME, "Opening modal");
    modal?.showModal();
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
            currentProfile.nickname = genNickName();
            const savedDoc = await saveUserProfile(
              auth.user.key,
              currentProfile,
              currentVersion
            );
            currentVersion = savedDoc.version;
            currentProfile = savedDoc.data;
          }
        } else {
          currentProfile = createDefaultProfile(auth.user.key);
          const savedDoc = await saveUserProfile(
            auth.user.key,
            currentProfile,
            undefined
          );
          currentVersion = savedDoc.version;
          currentProfile = savedDoc.data;
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
      profileStore.set({...currentProfile} as any);

      trackProfileUpdate("nickname");
      window.showInfoToast?.("Profile updated successfully");
      modal?.close();
    } catch (error) {
      log.error(COMPONENT_NAME, "Failed to save profile:", error);
    } finally {
      isSaving = false;
    }
  }

  async function handleLinkWallet() {
    walletLinkModal?.showModal();
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
      walletLinkModal?.close();
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

      profileStore.set({...currentProfile} as any);
      trackAvatarUpload();
      window.showInfoToast?.("Avatar updated!");
    } catch (err) {
      log.error(COMPONENT_NAME, "Avatar upload failed:", err);
      window.showErrorToast?.("Avatar upload failed");
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

<dialog bind:this={modal} class="modal">
  <div class="modal-box border-primary/30 bg-base-200 w-11/12 max-w-lg border">
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-primary text-2xl font-black tracking-widest uppercase">
        Player Profile
      </h2>
      <button
        on:click={() => modal.close()}
        class="btn btn-circle btn-ghost min-h-[44px] min-w-[44px] text-lg"
        >✕</button
      >
    </div>

    {#if isLoading}
      <div class="py-10 text-center">
        <span class="loading loading-spinner loading-lg text-primary"></span>
        <p class="text-primary mt-2 animate-pulse font-mono text-xs">
          SCANNED BIOMETRICS...
        </p>
      </div>
    {:else}
      <div class="space-y-6">
        <!-- Avatar -->
        <div class="flex justify-center">
          <div
            class="group relative cursor-pointer"
            on:click={() => !isGuest && fileInput.click()}
            role="button"
            tabindex="0"
            on:keydown={(e) =>
              e.key === "Enter" && !isGuest && fileInput.click()}
          >
            <div class="avatar placeholder">
              <div
                class="bg-primary/20 text-primary border-primary/30 ring-primary/10 ring-offset-base-200 w-16 overflow-hidden rounded-full border-2 ring ring-offset-2"
              >
                {#if avatarUrl}
                  <img
                    src={avatarUrl}
                    class="h-full w-full object-cover"
                    alt="Avatar"
                  />
                {:else}
                  <span class="text-xl font-black">{avatarLetter}</span>
                {/if}
              </div>
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
                <span class="loading loading-spinner loading-sm text-primary"
                ></span>
              </div>
            {/if}
          </div>
          <input
            bind:this={fileInput}
            on:change={handleAvatarUpload}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="hidden"
            disabled={isGuest}
          />
        </div>

        <!-- Nickname -->
        <div class="form-control w-full">
          <label class="label" for="profile-nickname"
            ><span
              class="label-text text-primary font-bold tracking-widest uppercase"
              >Degen Handle</span
            ></label
          >
          <input
            id="profile-nickname"
            bind:value={nickname}
            disabled={isGuest}
            type="text"
            placeholder="Enter handle..."
            class="input input-bordered input-primary bg-base-300 w-full font-mono"
          />
        </div>

        <!-- Email -->
        <div class="form-control w-full">
          <label class="label" for="profile-email"
            ><span
              class="label-text text-primary font-bold tracking-widest uppercase"
              >Secure Comms (Email)</span
            ></label
          >
          <input
            id="profile-email"
            bind:value={email}
            disabled={isGuest}
            type="email"
            placeholder="spam@tresr.community"
            class="input input-bordered input-primary bg-base-300 w-full font-mono"
          />
        </div>

        <!-- Principal -->
        <div class="form-control w-full">
          <div class="label">
            <span
              class="label-text text-neutral-content/50 font-bold tracking-widest uppercase"
              >Identity (Principal)</span
            >
          </div>
          <div
            class="bg-base-300 truncate rounded-lg p-3 font-mono text-xs break-all opacity-70 select-all"
          >
            {principal}
          </div>
        </div>

        <!-- Wallet -->
        {#if !isGuest}
          <div
            class="collapse-arrow border-base-content/10 bg-base-300 collapse border"
          >
            <input type="checkbox" checked={true} />
            <div
              class="collapse-title text-sm font-bold tracking-tighter uppercase"
            >
              Avalanche Wallet
            </div>
            <div class="collapse-content space-y-4 pt-4">
              {#if isSiwaLogin}
                <div role="alert" class="alert alert-info mb-4 px-3 py-2">
                  <span class="text-[10px] font-bold uppercase"
                    >Primary Identity</span
                  >
                  <span class="ml-auto font-mono text-xs opacity-80"
                    >{walletDisplay}</span
                  >
                </div>
                <p class="text-base-content/50 text-xs italic">
                  This wallet was used to sign in and cannot be unlinked.
                </p>
              {:else if hasWallet}
                <div role="alert" class="alert alert-success mb-4 px-3 py-2">
                  <span class="text-[10px] font-bold uppercase"
                    >Link Established</span
                  >
                  <span class="ml-auto font-mono text-xs opacity-80"
                    >{walletDisplay}</span
                  >
                </div>
                <button
                  on:click={handleUnlinkWallet}
                  class="btn btn-error btn-outline btn-sm w-full"
                  >SEVER LINK</button
                >
              {:else}
                <button
                  on:click={handleLinkWallet}
                  class="btn btn-accent btn-sm w-full gap-2"
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
          class="stats stats-vertical md:stats-horizontal bg-base-200/50 w-full shadow"
        >
          <div class="stat place-items-center py-3">
            <div class="stat-title text-[10px] uppercase">High Score</div>
            <div class="stat-value text-primary font-mono text-xl">
              {stats.high_score.toString()}
            </div>
          </div>
          <div class="stat place-items-center py-3">
            <div class="stat-title text-[10px] uppercase">Played</div>
            <div class="stat-value text-accent font-mono text-xl">
              {stats.total_games_played.toString()}
            </div>
          </div>
          <div class="stat place-items-center py-3">
            <div class="stat-title text-[10px] uppercase">Won</div>
            <div class="stat-value text-success font-mono text-xl">
              {stats.total_games_won.toString()}
            </div>
          </div>
        </div>

        {#if isGuest}
          <div role="alert" class="alert alert-warning text-sm">
            <span>Login to access full profile and link wallet.</span>
          </div>
        {/if}

        <div class="divider"></div>

        <div class="mt-2 flex items-center justify-between">
          <a href="/claims" class="btn btn-warning btn-outline gap-2 px-6">
            <span class="text-lg">🏆</span> Rewards
          </a>
          <button
            on:click={handleSaveProfile}
            disabled={isGuest || isSaving}
            class="btn btn-primary px-8"
            class:loading={isSaving}
          >
            Update Identity
          </button>
        </div>
      </div>
    {/if}
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<dialog bind:this={walletLinkModal} class="modal">
  <div class="modal-box bg-base-100">
    <div class="flex justify-center">
      <div class="loading loading-spinner text-primary"></div>
    </div>
    <p class="mt-2 text-center">Linking wallet...</p>
  </div>
</dialog>
