import type {ConfigTypes} from "@/types/config";
import {validateConfig} from "./validate";

let cachedConfig: ConfigTypes | null = null;
let inflight: Promise<ConfigTypes> | null = null;

export async function loadConfigAsync(): Promise<ConfigTypes> {
  if (cachedConfig) return cachedConfig;
  if (inflight) return inflight;

  inflight = (async () => {
    const response = await fetch("/config-client.json");
    if (!response.ok) {
      throw new Error(
        `[FATAL] Failed to load config-client.json: ${response.status} ${response.statusText}`
      );
    }
    const json: unknown = await response.json();
    if (!validateConfig(json)) {
      throw new Error(
        "[FATAL] Config validation failed — malformed or tampered config"
      );
    }
    cachedConfig = json;
    return cachedConfig;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export async function loadConfigFromYaml(): Promise<ConfigTypes> {
  return loadConfigAsync();
}

// For compatibility with existing code
export type GameConfig = ConfigTypes;
export type BlockchainConfig = ConfigTypes["blockchain"];

// Re-export the typed config object
export {config} from "./client.ts";
