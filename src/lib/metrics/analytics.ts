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

export const trackGameWin = async (score: number) => {
  await ensureInit();
  trackEvent({
    name: "game_win",
    metadata: {score: score.toString(), environment: JUNO_ENVIRONMENT},
  });
};

export const trackGameLoss = async (reason: string) => {
  await ensureInit();
  trackEvent({
    name: "game_loss",
    metadata: {reason, environment: JUNO_ENVIRONMENT},
  });
};

export const trackClaim = async (amount: number) => {
  await ensureInit();
  trackEvent({
    name: "claim_reward",
    metadata: {amount: amount.toString(), environment: JUNO_ENVIRONMENT},
  });
};
