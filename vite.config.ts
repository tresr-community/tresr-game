import {defineConfig} from "vite";
import {sveltekit} from "@sveltejs/kit/vite";
import {execSync} from "node:child_process";
import {createRequire} from "node:module";
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

// Vite config
export default defineConfig({
  plugins: [sveltekit(), juno({container: true}), tailwindcss(), swBuilder()],
  define: {
    "import.meta.env.PACKAGE_VERSION": JSON.stringify(PACKAGE_VERSION),
    "import.meta.env.BUILD_ID": JSON.stringify(BUILD_ID),
    "import.meta.env.VITE_INTERNET_IDENTITY_ID": JSON.stringify(
      process.env.VITE_INTERNET_IDENTITY_ID
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
  server: {
    fs: {
      allow: [
        "..", // To allow serving files from the workspace root or devenv node_modules
      ],
    },
  },
  build: {
    target: "esnext",
  },
});
