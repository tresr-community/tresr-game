import {execSync} from "node:child_process";
import {createRequire} from "node:module";
import {build} from "vite";

const require = createRequire(import.meta.url);

/**
 * Astro integration: compiles src/lib/pwa/sw.ts into dist/sw.js.
 *
 * Runs a standalone Vite build for the service worker after the main
 * Astro build completes. The output is a stable /sw.js at the site root
 * so the browser can byte-compare it across deployments to detect updates.
 *
 * PACKAGE_VERSION and BUILD_ID are injected so the compiled sw.js
 * content differs between builds, ensuring the browser detects the change.
 */
export default function swBuilder() {
  return {
    name: "sw-builder",
    hooks: {
      "astro:build:done": async ({dir}) => {
        const outDir = dir.pathname;
        const packageVersion = require("../../package.json").version;
        const gitHash = execSync("git rev-parse --short HEAD", {
          encoding: "utf8",
        }).trim();
        const buildId = `${gitHash}-${Date.now()}`;
        console.log(
          `[sw-builder] Building service worker... (v${packageVersion}, build_id: ${buildId})`
        );

        try {
          await build({
            configFile: false,
            define: {
              "import.meta.env.PACKAGE_VERSION": JSON.stringify(packageVersion),
              "import.meta.env.BUILD_ID": JSON.stringify(buildId),
            },
            build: {
              emptyOutDir: false,
              outDir,
              lib: {
                entry: "src/lib/pwa/sw.ts",
                formats: ["es"],
                fileName: () => "sw.js",
              },
              rollupOptions: {
                output: {
                  entryFileNames: "sw.js",
                },
              },
              minify: true,
            },
          });
          console.log("[sw-builder] Built sw.js successfully");
        } catch (err) {
          console.error("[sw-builder] Failed to build sw.js:", err);
        }
      },
    },
  };
}
