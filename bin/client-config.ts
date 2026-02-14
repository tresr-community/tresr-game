import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yaml from "yaml";
import {log} from "../src/lib/utils/log";
import {canonicalStringify} from "../src/lib/utils/canonical-stringify";

const COMPONENT_NAME = "ConfigGen";

const projectRoot: string = path.resolve(process.cwd());
const configPath: string = path.join(projectRoot, "config", "tresr.yaml");
const publicConfigPath: string = path.join(
  projectRoot,
  "public",
  "config-client.json"
);
const typeOutputPath: string = path.join(
  projectRoot,
  "src",
  "types",
  "config.ts"
);
const envOutputPath: string = path.join(projectRoot, "src", "env.d.ts");

function generateTypes(
  obj: Record<string, unknown>,
  indent: string = "  "
): string {
  const lines = ["{"];
  for (const [key, value] of Object.entries(obj)) {
    let typeStr = indent + key + ": ";
    if (Array.isArray(value)) {
      if (value.length > 0) {
        if (typeof value[0] === "string") {
          typeStr += "string[];\n";
        } else if (typeof value[0] === "object" && value[0] !== null) {
          const subtype = generateTypes(
            value[0] as Record<string, unknown>,
            indent + "  "
          );
          typeStr += `Array<${subtype}>;\n`;
        } else {
          typeStr += `Array<${typeof value[0]}>;\n`;
        }
      } else {
        typeStr += "unknown[];\n";
      }
    } else if (typeof value === "object" && value !== null) {
      const objVal = value as Record<string, unknown>;
      if (Object.keys(objVal).length === 0) {
        typeStr += "Record<string, never>;\n";
      } else {
        typeStr += generateTypes(objVal, indent + "  ") + ";\n";
      }
    } else if (value === null) {
      typeStr += "null;\n";
    } else {
      typeStr += `${typeof value};\n`;
    }
    lines.push(typeStr);
  }
  lines.push(indent.slice(2) + "}");
  return lines.join("");
}

function generateModuleDeclaration(obj: Record<string, unknown>): string {
  const types = `declare module "/config-client.json" {\n  const value: ${generateTypes(obj, "    ")};\n  export default value;\n}\ndeclare module "../../../public/config-client.json" {\n  const value: ${generateTypes(obj, "    ")};\n  export default value;\n}\n`;
  return types;
}

/**
 * Generate a runtime validation function that checks config shape.
 * Validates all required top-level keys and configHash format.
 */
function generateValidation(config: Record<string, unknown>): string {
  const topLevelKeys = Object.keys(config);
  const keyChecks = topLevelKeys
    .filter((k) => k !== "configHash")
    .map((k) => {
      const val = config[k];
      if (typeof val === "object" && val !== null && !Array.isArray(val)) {
        return `  if (!c.${k} || typeof c.${k} !== "object") return false;`;
      }
      return `  if (c.${k} === undefined) return false;`;
    })
    .join("\n");

  // Build nested path checks for critical boot-time values
  const nestedChecks = [
    {
      path: "gameplay.entities.player.health",
      check: 'typeof gep.health !== "number" || gep.health <= 0',
      setup: [
        "const gp = (c.gameplay as Record<string, unknown>);",
        "const ge = gp?.entities as Record<string, unknown> | undefined;",
        "const gep = ge?.player as Record<string, unknown> | undefined;",
      ],
      guard: "!gp || !ge || !gep",
    },
    {
      path: "gameplay.entities.player.speed",
      check: 'typeof gep.speed !== "number" || gep.speed <= 0',
    },
    {
      path: "gameplay.time_limit_seconds",
      check:
        'typeof gp.time_limit_seconds !== "number" || gp.time_limit_seconds <= 0',
    },
    {
      path: "gameplay.fee_gate.transaction_timeout_ms",
      check:
        'typeof gfg.transaction_timeout_ms !== "number" || gfg.transaction_timeout_ms <= 0',
      setup: [
        "const gfg = gp?.fee_gate as Record<string, unknown> | undefined;",
      ],
      guard: "!gfg",
    },
    {
      path: "auth.avalanche.enabled",
      check: 'typeof aa.enabled !== "boolean"',
      setup: [
        "const au = (c.auth as Record<string, unknown>);",
        "const aa = au?.avalanche as Record<string, unknown> | undefined;",
      ],
      guard: "!au || !aa",
    },
  ];

  // Emit setup variables (deduplicated)
  const emittedSetup = new Set<string>();
  const setupLines: string[] = [];
  const guardChecks: string[] = [];
  const valueChecks: string[] = [];

  for (const nc of nestedChecks) {
    if (nc.setup) {
      for (const s of nc.setup) {
        if (!emittedSetup.has(s)) {
          emittedSetup.add(s);
          setupLines.push(`  ${s}`);
        }
      }
    }
    if (nc.guard && !guardChecks.includes(nc.guard)) {
      guardChecks.push(nc.guard);
    }
    valueChecks.push(`  if (${nc.check}) return false;`);
  }

  const nestedBlock = [
    "  // Validate critical nested paths accessed before hash verification",
    ...setupLines,
    ...(guardChecks.length > 0
      ? [`  if (${guardChecks.join(" || ")}) return false;`]
      : []),
    ...valueChecks,
  ].join("\n");

  return `// AUTO-GENERATED by bin/client-config.ts — DO NOT EDIT
import type { ConfigTypes } from "../../types/config.ts";

export function validateConfig(config: unknown): config is ConfigTypes {
  if (!config || typeof config !== "object") return false;
  const c = config as Record<string, unknown>;
  // Check configHash is 64-char hex
  if (typeof c.configHash !== "string" || !/^[a-f0-9]{64}$/.test(c.configHash))
    return false;
  // Check all required top-level keys
${keyChecks}
${nestedBlock}
  return true;
}
`;
}

const CHECK_MODE = process.argv.includes("--check");

interface PendingWrite {
  path: string;
  content: string;
}

(async (): Promise<void> => {
  try {
    if (!fs.existsSync(configPath)) {
      log.warn(COMPONENT_NAME, "config/tresr.yaml not found; skipping.");
      return;
    }

    const pendingWrites: PendingWrite[] = [];

    function writeOrCollect(filePath: string, content: string): void {
      if (CHECK_MODE) {
        pendingWrites.push({path: filePath, content});
      } else {
        fs.writeFileSync(filePath, content);
      }
    }

    const configContent: string = fs.readFileSync(configPath, "utf8");
    const config = yaml.parse(configContent) as Record<string, unknown>;
    const clientConfig = (config.client as Record<string, unknown>) || {};

    // Inject server.anti_cheat into client config so ban.ts can read
    // ban durations and permanent threshold from config instead of hardcoding.
    const serverConfig = config.server as Record<string, unknown> | undefined;
    if (serverConfig?.anti_cheat) {
      clientConfig.anti_cheat = serverConfig.anti_cheat;
    }

    // Scan for audio files
    const musicDir = path.join(projectRoot, "public/assets/audio/music");
    const sfxDir = path.join(projectRoot, "public/assets/audio/sfx");
    const imagesDir = path.join(projectRoot, "public/assets/images/wallpapers");

    const assets: {music?: string[]; sfx?: string[]; wallpapers?: string[]} =
      {};

    if (fs.existsSync(musicDir)) {
      assets.music = fs
        .readdirSync(musicDir)
        .filter((f) => f.endsWith(".webm"))
        .map((f) => f.replace(".webm", ""))
        .sort();
    }

    if (fs.existsSync(sfxDir)) {
      assets.sfx = fs
        .readdirSync(sfxDir)
        .filter((f) => f.endsWith(".webm"))
        .map((f) => f.replace(".webm", ""))
        .sort();
    }

    if (fs.existsSync(imagesDir)) {
      assets.wallpapers = fs
        .readdirSync(imagesDir)
        .filter((f) => f.startsWith("wallpaper_") && f.endsWith(".webp"))
        .map((f) => f.replace(".webp", ""))
        .sort();
    }

    // Auto-detect SFX variant counts from scanned files.
    // Files follow naming convention: {type}_{number}.webm (e.g. punch_1.webm, game_over_3.webm)
    if (assets.sfx && assets.sfx.length > 0) {
      const sfxVariants: Record<string, number> = {};
      for (const sfxName of assets.sfx) {
        const match = sfxName.match(/^(.+)_(\d+)$/);
        if (match) {
          const type = match[1];
          const num = parseInt(match[2], 10);
          sfxVariants[type] = Math.max(sfxVariants[type] || 0, num);
        }
      }

      // Validate contiguous numbering (1 through N) for each type
      for (const [type, maxNum] of Object.entries(sfxVariants)) {
        for (let i = 1; i <= maxNum; i++) {
          const expected = `${type}_${i}`;
          if (!assets.sfx.includes(expected)) {
            log.warn(
              COMPONENT_NAME,
              `SFX gap detected: ${expected} is missing (${type} has variants up to ${maxNum})`
            );
          }
        }
      }

      // Overwrite sfx_variants in gameplay config with auto-detected counts
      // Sort keys for deterministic output across platforms
      const sortedSfxVariants: Record<string, number> = {};
      for (const key of Object.keys(sfxVariants).sort()) {
        sortedSfxVariants[key] = sfxVariants[key];
      }

      const gameplay = clientConfig.gameplay as
        | Record<string, unknown>
        | undefined;
      if (gameplay) {
        const audio = gameplay.audio as Record<string, unknown> | undefined;
        if (audio) {
          audio.sfx_variants = sortedSfxVariants;
        }
      }

      log.info(
        COMPONENT_NAME,
        `Auto-detected SFX variants: ${Object.entries(sortedSfxVariants)
          .map(([k, v]) => `${k}(${v})`)
          .join(", ")}`
      );
    }

    if (Object.keys(assets).length > 0) {
      clientConfig.assets = assets;
    }

    // Load credits
    const creditsPath: string = path.join(
      projectRoot,
      "config",
      "credits.yaml"
    );
    if (fs.existsSync(creditsPath)) {
      const creditsContent = fs.readFileSync(creditsPath, "utf8");
      const credits = yaml.parse(creditsContent);
      clientConfig.credits = credits;
      log.info(COMPONENT_NAME, "Loaded credits from config/credits.yaml");
    }

    // Load changelog
    const changelogPath: string = path.join(
      projectRoot,
      "config",
      "changelog.yaml"
    );
    if (fs.existsSync(changelogPath)) {
      const changelogContent = fs.readFileSync(changelogPath, "utf8");
      const changelog = yaml.parse(changelogContent);
      clientConfig.changelog = changelog;
      log.info(COMPONENT_NAME, "Loaded changelog from config/changelog.yaml");
    }

    // Generate DaisyUI themes in global.css
    const daisyui = (clientConfig.daisyui as Record<string, unknown>) || {};
    const themes = (daisyui.themes as string[]) || [];
    if (themes.length > 0) {
      const cssPath = path.join(projectRoot, "src", "styles", "global.css");
      let css = fs.readFileSync(cssPath, "utf8");
      const themesStr = "themes:\n    " + themes.join(",\n    ") + ";";
      const regex = /themes:\s*([\s\S]*?);/; // Replace multiline themes block
      css = css.replace(regex, themesStr);
      writeOrCollect(cssPath, css);
      if (!CHECK_MODE) {
        log.info(
          COMPONENT_NAME,
          "Updated src/styles/global.css with DaisyUI themes"
        );
      }
    } else {
      log.warn(
        COMPONENT_NAME,
        "No DaisyUI themes defined in client.daisyui.themes"
      );
    }

    if (Object.keys(clientConfig).length === 0) {
      log.warn(
        COMPONENT_NAME,
        "Warning: client section is empty in config/tresr.yaml"
      );
    }

    // Generate config hash for anti-cheat validation
    // Hash critical gameplay values that affect scoring/rewards
    const gameplay = clientConfig.gameplay as
      | Record<string, unknown>
      | undefined;
    if (gameplay) {
      const criticalValues = {
        entities: gameplay.entities,
        scoring: gameplay.scoring,
        time_limit_seconds: gameplay.time_limit_seconds,
        walkable_area: gameplay.walkable_area,
        physics: gameplay.physics,
        combat: gameplay.combat,
        audio: gameplay.audio,
      };
      const criticalJson = canonicalStringify(criticalValues);
      const configHash = crypto
        .createHash("sha256")
        .update(criticalJson)
        .digest("hex");
      (clientConfig as Record<string, unknown>).configHash = configHash;
      if (!CHECK_MODE) {
        log.info(
          COMPONENT_NAME,
          `Generated config hash: ${configHash.slice(0, 16)}...`
        );
      }

      // Generate server constants file (Task 1.2)
      const serverConstantsPath = path.join(
        projectRoot,
        "src",
        "lib",
        "config",
        "server-constants.ts"
      );
      const serverConstantsContent = `// AUTO-GENERATED by bin/client-config.ts — DO NOT EDIT\n\nexport const SERVER_CONFIG_HASH = "${configHash}" as const;\n\nexport const SERVER_CRITICAL_VALUES = ${JSON.stringify(criticalValues, null, 2)} as const;\n`;
      writeOrCollect(serverConstantsPath, serverConstantsContent);

      // Generate config validation function (Task 1.3)
      const validatePath = path.join(
        projectRoot,
        "src",
        "lib",
        "config",
        "validate.ts"
      );
      const validateContent = generateValidation(clientConfig);
      writeOrCollect(validatePath, validateContent);
    }

    writeOrCollect(publicConfigPath, JSON.stringify(clientConfig, null, 2));

    // Generate precache manifest for PWA service worker (ticket #169)
    const precacheAssets: string[] = [
      "/",
      "/manifest.json",
      "/config-client.json",
    ];

    // Sprite sheets
    const spritesDir = path.join(projectRoot, "public/assets/images/sprites");
    if (fs.existsSync(spritesDir)) {
      const entities = fs
        .readdirSync(spritesDir, {withFileTypes: true})
        .filter((e) => e.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const entity of entities) {
        const entityDir = path.join(spritesDir, entity.name);
        const sheets = fs
          .readdirSync(entityDir)
          .filter((f) => f.endsWith(".webp"))
          .sort();
        for (const sheet of sheets) {
          precacheAssets.push(`/assets/images/sprites/${entity.name}/${sheet}`);
        }
      }
    }

    // Audio: music + SFX (already scanned above)
    if (assets.music) {
      for (const m of assets.music) {
        precacheAssets.push(`/assets/audio/music/${m}.webm`);
      }
    }
    if (assets.sfx) {
      for (const s of assets.sfx) {
        precacheAssets.push(`/assets/audio/sfx/${s}.webm`);
      }
    }

    // Wallpapers — only precache a small subset (first 5) to avoid bloating install
    if (assets.wallpapers) {
      const sorted = [...assets.wallpapers].sort();
      for (const w of sorted.slice(0, 5)) {
        precacheAssets.push(`/assets/images/wallpapers/${w}.webp`);
      }
    }

    writeOrCollect(
      path.join(projectRoot, "public", "precache-manifest.json"),
      JSON.stringify(precacheAssets, null, 2)
    );

    const typeDefinition = `// THIS FILE IS AUTOMATICALLY GENERATED. DO NOT EDIT MANUALLY.\nexport interface ConfigTypes ${generateTypes(clientConfig)}\n`;
    writeOrCollect(typeOutputPath, typeDefinition);

    // Generate src/lib/config/client.ts for typed imports everywhere
    const libConfigPath: string = path.join(
      projectRoot,
      "src",
      "lib",
      "config",
      "client.ts"
    );
    fs.mkdirSync(path.dirname(libConfigPath), {recursive: true});
    const libConfigContent = `// AUTO-GENERATED: Run \`bunx tsx bin/client-config.ts\` to regenerate.\n\nimport type { ConfigTypes } from "../../types/config.ts";\n\nexport const config: ConfigTypes = ${JSON.stringify(clientConfig, null, 2)};\n`;
    writeOrCollect(libConfigPath, libConfigContent);

    // Generate env.d.ts
    const envContent = `/// <reference path="../.astro/types.d.ts" />\n/// <reference types="astro/client" />\n/// <reference lib="webworker" />\n\n// THIS FILE IS AUTOMATICALLY GENERATED BY bin/client-config.ts\n// DO NOT EDIT MANUALLY.\n\n${generateModuleDeclaration(clientConfig)}\n`;
    writeOrCollect(envOutputPath, envContent);

    // --check mode: compare all pending writes against existing files
    if (CHECK_MODE) {
      const staleFiles: string[] = [];
      for (const {path: filePath, content} of pendingWrites) {
        const relativePath = path.relative(projectRoot, filePath);
        if (!fs.existsSync(filePath)) {
          log.error(COMPONENT_NAME, `Missing: ${relativePath}`, "");
          staleFiles.push(relativePath);
          continue;
        }
        const existing = fs.readFileSync(filePath, "utf8");
        if (existing !== content) {
          log.error(COMPONENT_NAME, `Stale: ${relativePath}`, "");
          staleFiles.push(relativePath);
        }
      }
      if (staleFiles.length > 0) {
        log.error(
          COMPONENT_NAME,
          `${staleFiles.length} file(s) are out of date. Run 'bun run client-config' and commit the changes.`,
          ""
        );
        process.exit(1);
      }
      log.info(COMPONENT_NAME, "All generated config files are up to date ✓");
      return;
    }

    // Normal mode: log success
    log.info(
      COMPONENT_NAME,
      "Generated public/config-client.json from config/tresr.yaml client section."
    );
    log.info(COMPONENT_NAME, "Generated src/types/config.ts");
    log.info(COMPONENT_NAME, "Generated src/lib/config/client.ts");
    log.info(COMPONENT_NAME, "Regenerated src/env.d.ts");
    log.info(
      COMPONENT_NAME,
      `Generated precache manifest with ${precacheAssets.length} assets`
    );
    if (gameplay) {
      log.info(COMPONENT_NAME, "Generated src/lib/config/server-constants.ts");
      log.info(COMPONENT_NAME, "Generated src/lib/config/validate.ts");
    }
  } catch (error) {
    if (error instanceof Error) {
      log.error(
        COMPONENT_NAME,
        "Error generating client config:",
        error.message
      );
    } else {
      log.error(
        COMPONENT_NAME,
        "Unknown error generating client config:",
        error
      );
    }
    process.exit(1);
  }
})();
