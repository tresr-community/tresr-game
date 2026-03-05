import {defineConfig} from "astro/config";
import {execSync} from "node:child_process";
import {createRequire} from "node:module";
import juno from "@junobuild/vite-plugin";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import remarkEmoji from "remark-emoji";
import path from "path";
import {log} from "./src/lib/utils/log";
import swBuilder from "./src/integrations/sw-builder.mjs";

const COMPONENT_NAME = "Astro";
const require = createRequire(import.meta.url);
const PACKAGE_VERSION = require("./package.json").version;

// Build ID: short git hash + timestamp. Frozen at build time.
// Used by the PWA version-poll to detect new deploys.
const gitHash = execSync("git rev-parse --short HEAD", {
  encoding: "utf8",
}).trim();
const BUILD_ID = `${gitHash}-${Date.now()}`;
log.info(COMPONENT_NAME, `version: ${PACKAGE_VERSION}, build_id: ${BUILD_ID}`);

// Logs in the build output window.
log.info(COMPONENT_NAME, "VITE_SATELLITE_ID:", process.env.VITE_SATELLITE_ID);
log.info(COMPONENT_NAME, "VITE_ORBITER_ID:", process.env.VITE_ORBITER_ID);
log.info(
  COMPONENT_NAME,
  "VITE_INTERNET_IDENTITY_ID:",
  process.env.VITE_INTERNET_IDENTITY_ID
);
log.info(
  COMPONENT_NAME,
  "VITE_ASTRO_SITE_URL:",
  process.env.VITE_ASTRO_SITE_URL
);
log.info(
  COMPONENT_NAME,
  "VITE_SIWA_PROVIDER_ID:",
  process.env.VITE_SIWA_PROVIDER_ID
);

// https://astro.build/config
export default defineConfig({
  site: process.env.VITE_ASTRO_SITE_URL,
  integrations: [sitemap(), swBuilder()],
  markdown: {remarkPlugins: [remarkEmoji]},
  vite: {
    plugins: [juno({container: "localhost"}), tailwindcss()],
    define: {
      "import.meta.env.PACKAGE_VERSION": JSON.stringify(PACKAGE_VERSION),
      "import.meta.env.BUILD_ID": JSON.stringify(BUILD_ID),
      "import.meta.env.VITE_SATELLITE_ID": JSON.stringify(
        process.env.VITE_SATELLITE_ID
      ),
      "import.meta.env.VITE_ORBITER_ID": JSON.stringify(
        process.env.VITE_ORBITER_ID
      ),
      "import.meta.env.VITE_INTERNET_IDENTITY_ID": JSON.stringify(
        process.env.VITE_INTERNET_IDENTITY_ID
      ),
      "import.meta.env.VITE_ASTRO_SITE_URL": JSON.stringify(
        process.env.VITE_ASTRO_SITE_URL
      ),
      "import.meta.env.VITE_SIWA_PROVIDER_ID": JSON.stringify(
        process.env.VITE_SIWA_PROVIDER_ID
      ),
    },
    resolve: {
      alias: {
        "@": path.resolve("./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Split heavy async-only bundles into separate chunks.
          // These are only downloaded when first needed (lazy imports, auth, etc.)
          // rather than being bundled into the initial page JS payload.
          manualChunks: {
            // Reown AppKit + Wagmi — only loaded when user clicks Connect Wallet
            "wallet-kit": [
              "@reown/appkit",
              "@reown/appkit-adapter-wagmi",
              "@wagmi/core",
            ],
            // Juno client — loaded during initSatellite (fire-and-forget after P2)
            juno: ["@junobuild/core"],
            // ICP/SIWA stack — needs its own chunk to avoid sharing with Juno
            icp: ["@dfinity/agent", "@dfinity/auth-client", "ic-siwa"],
            // viem — used by wallet-kit but large enough to split
            viem: ["viem"],
          },
        },
      },
    },
  },
  devToolbar: {
    enabled: false,
  },
  output: "static",
});
