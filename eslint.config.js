import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "static/workers",
      "src/declarations",
      ".svelte",
      "src/env.d.ts",
      "**/lib/openzeppelin-contracts/**",
      "**/lib/openzeppelin-contracts-upgradeable/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // Enforce centralized logging in Astro client scripts and TypeScript source.
  // Exceptions per AGENTS.md: log.ts itself, sw.ts (ServiceWorker), integrations/, bin/
  {
    files: ["src/**/*.ts"],
    ignores: [
      "src/lib/utils/log.ts",
      "src/lib/pwa/sw.ts",
      "src/integrations/**",
    ],
    rules: {
      "no-console": "error",
    },
  }
);
