import {defineConfig} from "@junobuild/config";
import fs from "node:fs";
import path from "node:path";

const configPath = path.resolve(process.cwd(), "config", "config-server.json");
const configContent = fs.readFileSync(configPath, "utf8");
const serverConfig = JSON.parse(configContent);
const junoConfig = serverConfig.juno;

// Variable substitution for placeholders like ${VAR}
const substitute = (val) => {
  if (typeof val !== "string") return val;
  return val.replace(/\${(\w+)}/g, (_, name) => process.env[name] || "");
};

const devSatelliteId = substitute(junoConfig.development?.satellite_id);
const stagingSatelliteId = substitute(junoConfig.staging?.satellite_id);
const prodSatelliteId = substitute(junoConfig.production?.satellite_id);

const devOrbiterId = substitute(junoConfig.development?.orbiter_id);
const stagingOrbiterId = substitute(junoConfig.staging?.orbiter_id);
const prodOrbiterId = substitute(junoConfig.production?.orbiter_id);

/** @type {import('@junobuild/config').JunoConfig} */
export default defineConfig(({mode}) => ({
  satellite: {
    ids: {
      local: devSatelliteId,
      development: devSatelliteId,
      staging: stagingSatelliteId || devSatelliteId,
      production: prodSatelliteId || devSatelliteId,
    },
    source: "build",
    storage: {
      headers: [
        // Hashed JS/CSS chunks from Vite — immutable, 1 year
        {
          source: "**/*.{js,css}",
          headers: [["Cache-Control", "public, max-age=31536000, immutable"]],
        },
        // Self-hosted fonts (woff2) in /fonts/ — 1 year, immutable
        {
          source: "fonts/**/*.woff2",
          headers: [["Cache-Control", "public, max-age=31536000, immutable"]],
        },
        // Image assets — 1 year, immutable (Vite hashes filenames)
        {
          source: "assets/images/**",
          headers: [["Cache-Control", "public, max-age=31536000, immutable"]],
        },
        // Icons and static assets
        {
          source: "assets/icons/**",
          headers: [["Cache-Control", "public, max-age=31536000, immutable"]],
        },
        // Service worker — must revalidate quickly so updates propagate
        {
          source: "sw.js",
          headers: [["Cache-Control", "public, max-age=3600, must-revalidate"]],
        },
        // Manifest — short cache so PWA metadata stays fresh
        {
          source: "manifest.json",
          headers: [["Cache-Control", "public, max-age=86400"]],
        },
        // HTML shells — always revalidate so deploys land immediately
        {
          source: "**/*.html",
          headers: [["Cache-Control", "no-cache"]],
        },
      ],
    },
    automation: {
      github: {
        repositories: [
          {
            owner: "tresr-community",
            name: "tresr-game",
            refs: [],
          },
        ],
      },
    },
    // Pass the mode to Astro so import.meta.env.MODE reflects the deployment target.
    //  --mode development => import.meta.env.DEV = true
    //  --mode production => import.meta.env.PROD = true
    // In CI the workflow builds before deploying; locally juno-dev handles it.
    // The juno-action Docker image doesn't ship bun so predeploy must be skipped.
    ...(process.env.CI ? {} : {predeploy: ["bun run build"]}),
    collections: junoConfig.collections,
  },
  orbiter: {
    ids: {
      development: devOrbiterId,
      staging: stagingOrbiterId || devOrbiterId,
      production: prodOrbiterId || devOrbiterId,
    },
  },
  emulator: {
    runner: {
      type: "docker",
      name: "juno-skylab",
      image: "junobuild/skylab:latest",
      volume: "juno-skylab",
      platform: "linux/amd64",
      // Allow the container to reach host-machine services (e.g. Anvil RPC)
      // via the stable hostname host.docker.internal.
      // Requires @junobuild/cli built from the local fork (packages/cli).
      extraHosts: [["host.docker.internal", "host-gateway"]],
    },
    skylab: {
      ports: {
        server: 5987,
        admin: 5999,
        console: 5866,
      },
    },
  },
}));
