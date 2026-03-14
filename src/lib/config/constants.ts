/**
 * Juno Constants
 *
 * Centralized configuration values for Juno integration.
 * All values are environment-aware and set automatically based on build mode.
 *
 * Note: App metadata (name, version, tagline) is defined in public/config.yaml
 * and loaded via src/lib/config.ts for use in Astro pages.
 */

import {JUNO_ENVIRONMENT, log} from "@/lib/utils/log";
export {JUNO_ENVIRONMENT};

const COMPONENT_NAME = "Config";

log.debug(COMPONENT_NAME, `Juno Environment: ${JUNO_ENVIRONMENT}`);

import {config} from "./client.ts";

// The Juno emulator port used for local development.
// Matches emulator.skylab.ports.server in juno.config.mjs.
// Fallback 5987 is the canonical Juno emulator default (ticket #154: accepted deviation).
export const JUNO_EMULATOR_PORT =
  import.meta.env.VITE_JUNO_EMULATOR_PORT ?? 5987;

// Internet Identity provider
//  - Development: localhost
//  - Staging: id.ai
//  - Production: id.ai
export const JUNO_INTERNET_IDENTITY =
  JUNO_ENVIRONMENT === "development"
    ? `http://${import.meta.env.VITE_INTERNET_IDENTITY_ID}.localhost:${JUNO_EMULATOR_PORT}`
    : "id.ai";
log.debug(COMPONENT_NAME, `Juno Internet Identity: ${JUNO_INTERNET_IDENTITY}`);

// SIWA Provider Canister ID (Sign In With Avalanche)
// In development: use local canister if available, or placeholder
// In production: use real canister ID
// Only exported if avalanche auth is enabled in config
export const JUNO_SIWA_PROVIDER = config.auth.avalanche.enabled
  ? (import.meta.env.VITE_SIWA_PROVIDER_ID ?? "")
  : "";
log.debug(COMPONENT_NAME, `Juno SIWA Provider: ${JUNO_SIWA_PROVIDER}`);

// IC Host URL for SIWA client
// In development: use local emulator
// In production: use mainnet
export const IC_HOST =
  JUNO_ENVIRONMENT === "development"
    ? `http://127.0.0.1:${JUNO_EMULATOR_PORT}`
    : "https://ic0.app";

/**
 * Get the environment key for blockchain config lookup.
 */
export function getEnvironmentKey(): "anvil" | "testnet" | "mainnet" {
  return JUNO_ENVIRONMENT === "development"
    ? "anvil"
    : JUNO_ENVIRONMENT === "staging"
      ? "testnet"
      : "mainnet";
}
