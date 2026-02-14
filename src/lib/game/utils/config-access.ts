import {config} from "@/lib/config/client";
import type {ConfigTypes} from "@/types/config";

export function getConfig(): ConfigTypes {
  if (!config) {
    throw new Error(
      "[FATAL] Config not loaded. This is an initialization error."
    );
  }
  return config;
}
