import {initOrbiter, trackEvent} from "@junobuild/analytics";
import {JUNO_ENVIRONMENT} from "@/lib/utils/log";
import {log} from "@/lib/utils/log";
import {JUNO_EMULATOR_PORT} from "@/lib/config/constants";

const COMPONENT_NAME = "Analytics";

let initialized = false;
let initPromise: Promise<void> | null = null;

/** Ensure analytics is initialized before tracking. */
const ensureInit = async () => {
  if (initialized) return;
  if (initPromise) {
    await initPromise;
    return;
  }
  await initAnalytics();
};

export const initAnalytics = async () => {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    log.debug(COMPONENT_NAME, "Starting initialization...");

    try {
      const satelliteId = import.meta.env.VITE_SATELLITE_ID;
      const orbiterId = import.meta.env.VITE_ORBITER_ID;

      log.debug(COMPONENT_NAME, `VITE_SATELLITE_ID: ${satelliteId}`);
      log.debug(COMPONENT_NAME, `VITE_ORBITER_ID: ${orbiterId}`);

      const config: {
        container?: string;
        satelliteId?: string;
        orbiterId?: string;
        options: {userAgentParser: boolean; performance: boolean};
      } = {
        ...(satelliteId && {satelliteId}),
        ...(orbiterId && {orbiterId}),
        options: {
          userAgentParser: true,
          performance: true,
        },
      };

      if (JUNO_ENVIRONMENT === "development") {
        config.container = `http://localhost:${JUNO_EMULATOR_PORT}`;
      }

      log.debug(COMPONENT_NAME, "initOrbiter config:", config);

      initOrbiter(config);
      initialized = true;
      log.debug(COMPONENT_NAME, "Initialized successfully");
    } catch (e) {
      log.warn(COMPONENT_NAME, "Failed to initialize", e);
    }
  })();

  return initPromise;
};

export const trackLogin = async (method: string) => {
  await ensureInit();
  trackEvent({
    name: "login",
    metadata: {method, environment: JUNO_ENVIRONMENT},
  });
};

export const trackPageView = async (page: string) => {
  await ensureInit();
  trackEvent({
    name: "page_view",
    metadata: {page, environment: JUNO_ENVIRONMENT},
  });
};

export const trackGameStart = async () => {
  await ensureInit();
  trackEvent({
    name: "game_start",
    metadata: {environment: JUNO_ENVIRONMENT},
  });
};

export const trackGameWin = async (
  score: number,
  metadata?: {keysCollected: number; duration: number}
) => {
  await ensureInit();
  trackEvent({
    name: "game_win",
    metadata: {
      score: score.toString(),
      ...(metadata && {
        keys_collected: metadata.keysCollected.toString(),
        duration_s: metadata.duration.toString(),
      }),
      environment: JUNO_ENVIRONMENT,
    },
  });
};

export const trackGameLoss = async (
  reason: string,
  metadata?: {
    score: number;
    phase: string;
    keysCollected: number;
    duration: number;
  }
) => {
  await ensureInit();
  trackEvent({
    name: "game_loss",
    metadata: {
      reason,
      ...(metadata && {
        score: metadata.score.toString(),
        phase: metadata.phase,
        keys_collected: metadata.keysCollected.toString(),
        duration_s: metadata.duration.toString(),
      }),
      environment: JUNO_ENVIRONMENT,
    },
  });
};

export const trackClaim = async (amount: number) => {
  await ensureInit();
  trackEvent({
    name: "claim_reward",
    metadata: {amount: amount.toString(), environment: JUNO_ENVIRONMENT},
  });
};

export const trackFeePaid = async (txHash: string) => {
  await ensureInit();
  trackEvent({
    name: "fee_paid",
    metadata: {tx_hash: txHash, environment: JUNO_ENVIRONMENT},
  });
};

export const trackWalletConnect = async (address: string) => {
  await ensureInit();
  trackEvent({
    name: "wallet_connect",
    metadata: {
      address: address.slice(0, 6) + "..." + address.slice(-4),
      environment: JUNO_ENVIRONMENT,
    },
  });
};

export const trackWalletDisconnect = async () => {
  await ensureInit();
  trackEvent({
    name: "wallet_disconnect",
    metadata: {environment: JUNO_ENVIRONMENT},
  });
};

export const trackBossSpawned = async () => {
  await ensureInit();
  trackEvent({
    name: "boss_spawned",
    metadata: {environment: JUNO_ENVIRONMENT},
  });
};

export const trackBossDefeated = async () => {
  await ensureInit();
  trackEvent({
    name: "boss_defeated",
    metadata: {environment: JUNO_ENVIRONMENT},
  });
};

export const trackPlayerDeath = async (
  score: number,
  phase: string,
  keysCollected: number
) => {
  await ensureInit();
  trackEvent({
    name: "player_death",
    metadata: {
      score: score.toString(),
      phase,
      keys_collected: keysCollected.toString(),
      environment: JUNO_ENVIRONMENT,
    },
  });
};

export const trackLevelComplete = async (
  score: number,
  keysCollected: number
) => {
  await ensureInit();
  trackEvent({
    name: "level_complete",
    metadata: {
      score: score.toString(),
      keys_collected: keysCollected.toString(),
      environment: JUNO_ENVIRONMENT,
    },
  });
};

export const trackFaucetClaim = async (amount: string) => {
  await ensureInit();
  trackEvent({
    name: "faucet_claim",
    metadata: {amount, environment: JUNO_ENVIRONMENT},
  });
};

export const trackModalOpen = async (modal: string) => {
  await ensureInit();
  trackEvent({
    name: "modal_open",
    metadata: {modal, environment: JUNO_ENVIRONMENT},
  });
};

export const trackProfileUpdate = async (field: string) => {
  await ensureInit();
  trackEvent({
    name: "profile_update",
    metadata: {field, environment: JUNO_ENVIRONMENT},
  });
};

export const trackAvatarUpload = async () => {
  await ensureInit();
  trackEvent({
    name: "avatar_upload",
    metadata: {environment: JUNO_ENVIRONMENT},
  });
};

export const trackWalletLink = async () => {
  await ensureInit();
  trackEvent({
    name: "wallet_link",
    metadata: {environment: JUNO_ENVIRONMENT},
  });
};

export const trackWalletUnlink = async () => {
  await ensureInit();
  trackEvent({
    name: "wallet_unlink",
    metadata: {environment: JUNO_ENVIRONMENT},
  });
};

export const trackPwaUpdate = async (action: string) => {
  await ensureInit();
  trackEvent({
    name: "pwa_update",
    metadata: {action, environment: JUNO_ENVIRONMENT},
  });
};

export const trackGamePause = async () => {
  await ensureInit();
  trackEvent({
    name: "game_pause",
    metadata: {environment: JUNO_ENVIRONMENT},
  });
};

export const trackGameResume = async () => {
  await ensureInit();
  trackEvent({
    name: "game_resume",
    metadata: {environment: JUNO_ENVIRONMENT},
  });
};

export const trackPwaInstall = async () => {
  await ensureInit();
  trackEvent({
    name: "pwa_install",
    metadata: {environment: JUNO_ENVIRONMENT},
  });
};

export const trackError = async (
  event: string,
  error: string,
  metadata?: Record<string, string>
) => {
  await ensureInit();
  trackEvent({
    name: "error",
    metadata: {
      event,
      error: error.slice(0, 200),
      ...metadata,
      environment: JUNO_ENVIRONMENT,
    },
  });
};
