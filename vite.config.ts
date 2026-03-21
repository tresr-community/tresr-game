import {defineConfig, loadEnv} from "vite";
import {sveltekit} from "@sveltejs/kit/vite";
import {execSync} from "node:child_process";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import juno from "@junobuild/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

import swBuilder from "./src/integrations/sw-builder";

const require = createRequire(import.meta.url);
const PACKAGE_VERSION = require("./package.json").version;

// Build ID: short git hash + commit timestamp.
const gitHash = execSync("git rev-parse --short HEAD", {
  encoding: "utf8",
}).trim();
const gitTimestamp = execSync("git log -1 --format=%ct HEAD", {
  encoding: "utf8",
}).trim();
const BUILD_ID = `${gitHash}-${gitTimestamp}`;

// Read Juno environment config from the generated config-server.json.
// This is the single source of truth — values originate in config/tresr.yaml.
const serverConfig = JSON.parse(
  readFileSync("config/config-server.json", "utf8")
);

// Vite config
export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), "");

  // Resolve the Juno environment to use based on build mode.
  // Falls back to "development" for unknown modes (e.g. vite dev default).
  const junoEnvKey =
    mode === "staging" || mode === "production" ? mode : "development";
  const junoEnv = serverConfig.juno[junoEnvKey];

  return {
    plugins: [
      sveltekit(),
      juno({
        container: true,
      }),
      tailwindcss(),
      swBuilder(),
    ],
    define: {
      "import.meta.env.PACKAGE_VERSION": JSON.stringify(PACKAGE_VERSION),
      "import.meta.env.BUILD_ID": JSON.stringify(BUILD_ID),
      // Juno IDs — sourced from tresr.yaml via config-server.json
      __JUNO_SATELLITE_ID__: JSON.stringify(junoEnv.satellite_id),
      __JUNO_ORBITER_ID__: JSON.stringify(junoEnv.orbiter_id),
      __JUNO_SITE_URL__: JSON.stringify(junoEnv.site_url),
      __JUNO_SIWA_ID__: JSON.stringify(junoEnv.siwa_id),
      __JUNO_II_ID__: JSON.stringify(junoEnv.internet_identity_id ?? ""),
      "import.meta.env.PUBLIC_WALLETCONNECT_PROJECT_ID": JSON.stringify(
        env.PUBLIC_WALLETCONNECT_PROJECT_ID ?? ""
      ),
    },
    resolve: {
      alias: {
        "@": path.resolve("./src"),
      },
    },
    server: {
      port: 5174,
      fs: {
        allow: [
          "..", // To allow serving files from the workspace root or devenv node_modules
        ],
      },
    },
    build: {
      target: "esnext",
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Group large dependency trees into stable named chunks to
            // reduce the total number of output files. Fewer files means
            // fewer ICP canister update calls during Juno deploy, which
            // avoids "Call was returned undefined" failures from IC
            // rate-limiting / message limits.

            // Phaser game engine — only loaded on the /game route
            if (id.includes("phaser")) {
              return "vendor-phaser";
            }

            // Wallet / Web3 stack (WalletConnect, wagmi, viem, noble crypto)
            if (
              id.includes("@walletconnect") ||
              id.includes("@reown") ||
              id.includes("wagmi") ||
              id.includes("viem") ||
              id.includes("@noble")
            ) {
              return "vendor-wallet";
            }

            // ICP / Juno stack (dfinity, junobuild, icp-sdk, ic-siwa)
            if (
              id.includes("@dfinity") ||
              id.includes("@junobuild") ||
              id.includes("@icp-sdk") ||
              id.includes("ic-siwa")
            ) {
              return "vendor-icp";
            }
          },
        },
        onwarn(warning, warn) {
          if (warning.code === "CIRCULAR_DEPENDENCY") return;
          // Auto-generated candid IDL file shadows the top-level IDL import with
          // a function parameter of the same name — the import is intentionally
          // redundant in that file. Cannot edit auto-generated code.
          if (
            warning.code === "UNUSED_EXTERNAL_IMPORT" &&
            warning.exporter === "@icp-sdk/core/candid"
          )
            return;
          // Third-party packages like @walletconnect use /*#__PURE__*/ annotations
          // that Rollup warns about. Safe to ignore.
          if (warning.code === "INVALID_ANNOTATION") return;
          // SVG assets in /public are resolved at runtime by the browser, not at
          // build time. Vite warns when it can't find them statically — safe to ignore.
          if (
            warning.code === "UNRESOLVED_IMPORT" &&
            typeof warning.message === "string" &&
            warning.message.includes(".svg")
          )
            return;
          warn(warning);
        },
      },
    },
  };
});
