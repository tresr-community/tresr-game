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

// Build ID: short git hash + commit timestamp. Stable for the same commit —
// re-running the build on the same commit produces the same BUILD_ID, which
// keeps Vite chunk hashes stable and avoids uploading unchanged files to Juno.
// The PWA version-poll detects new deploys from the hash changing between commits.
const gitHash = execSync("git rev-parse --short HEAD", {
  encoding: "utf8",
}).trim();
const gitTimestamp = execSync("git log -1 --format=%ct HEAD", {
  encoding: "utf8",
}).trim();
const BUILD_ID = `${gitHash}-${gitTimestamp}`;
log.info(COMPONENT_NAME, `version: ${PACKAGE_VERSION}, build_id: ${BUILD_ID}`);

// Logs in the build output window.
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
            // Phaser — only loaded on /game, large engine gets its own chunk
            phaser: ["phaser"],
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
