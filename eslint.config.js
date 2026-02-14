import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "public/workers",
      "src/declarations",
      ".astro",
      "src/env.d.ts",
      "**/lib/openzeppelin-contracts/**",
      "**/lib/openzeppelin-contracts-upgradeable/**",
      "TODO/**",
      "TEMP/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  }
);
