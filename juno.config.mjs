import {defineConfig} from "@junobuild/config";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";

const configPath = path.resolve(process.cwd(), "config", "tresr.yaml");
const configContent = fs.readFileSync(configPath, "utf8");
const fullConfig = yaml.parse(configContent);
const junoConfig = fullConfig.server.juno;

// Simple variable substitution for placeholders like ${VAR}
const substitute = (val) => {
  if (typeof val !== "string") return val;
  return val.replace(/\${(\w+)}/g, (_, name) => process.env[name] || "");
};

const satelliteId = substitute(junoConfig.satellite_id);

/** @type {import('@junobuild/config').JunoConfig} */
export default defineConfig(({mode}) => ({
  satellite: {
    ids: {
      local: satelliteId,
      development: satelliteId,
      staging: satelliteId,
      production: satelliteId,
    },
    source: "dist",
    // Pass the mode to Astro so import.meta.env.MODE reflects the deployment target.
    //  --mode development => import.meta.env.DEV = true
    //  --mode production => import.meta.env.PROD = true
    predeploy: [`bun run build -- --mode ${mode}`],
    collections: junoConfig.collections,
  },
  orbiter: {
    ids: {
      development: substitute(junoConfig.orbiter_id),
      staging: substitute(junoConfig.orbiter_id),
      production: substitute(junoConfig.orbiter_id),
    },
  },
  emulator: {
    runner: {
      type: "docker",
      name: "juno-skylab",
      image: "junobuild/skylab:latest",
      volume: "juno-skylab",
      platform: "linux/amd64",
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
