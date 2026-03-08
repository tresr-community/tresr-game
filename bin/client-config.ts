import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {execSync} from "node:child_process";
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
const serverConfigPath: string = path.join(
  projectRoot,
  "config",
  "config-server.json"
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
const STAGE_MODE = process.argv.includes("--stage");

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
    const writtenPaths: string[] = [];

    function writeOrCollect(filePath: string, content: string): void {
      if (CHECK_MODE) {
        pendingWrites.push({path: filePath, content});
      } else {
        fs.writeFileSync(filePath, content);
        writtenPaths.push(filePath);
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
      const sfxGaps: string[] = [];
      for (const [type, maxNum] of Object.entries(sfxVariants)) {
        for (let i = 1; i <= maxNum; i++) {
          const expected = `${type}_${i}`;
          if (!assets.sfx.includes(expected)) {
            sfxGaps.push(
              `${expected} is missing (${type} has variants up to ${maxNum})`
            );
          }
        }
      }
      if (sfxGaps.length > 0) {
        for (const gap of sfxGaps) {
          log.error(COMPONENT_NAME, `SFX gap detected: ${gap}`);
        }
        log.error(
          COMPONENT_NAME,
          `Build failed: ${sfxGaps.length} SFX variant gap(s) found`
        );
        process.exit(1);
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
        max_keys: gameplay.max_keys,
        walkable_area: gameplay.walkable_area,
        physics: gameplay.physics,
        combat: gameplay.combat,
        audio: gameplay.audio,
        vault: gameplay.vault,
        fee_gate: gameplay.fee_gate,
        difficulty_escalation: gameplay.difficulty_escalation,
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

    // Write server config as JSON so juno.config.mjs (and the Skylab container)
    // can read it without needing the `yaml` npm package.
    const serverSection = (config.server as Record<string, unknown>) || {};
    writeOrCollect(serverConfigPath, JSON.stringify(serverSection, null, 2));

    writeOrCollect(publicConfigPath, JSON.stringify(clientConfig, null, 2));

    // Generate precache manifest for PWA service worker (ticket #169)
    // Config-driven: only include assets the game actually loads (OOM fix)
    const precacheAssets: string[] = [
      "/",
      "/manifest.json",
      "/config-client.json",
    ];

    // Sprite sheets — extract paths from config instead of globbing filesystem
    // This avoids precaching stale/unused sprite directories
    const sprites = clientConfig.sprites as Record<string, unknown> | undefined;
    if (sprites) {
      const precachePaths = new Set<string>();

      // Helper: collect anim paths from a standard entity config
      const collectEntityPaths = (entity: Record<string, unknown>) => {
        const anims = entity.anims as
          | Array<Record<string, unknown>>
          | undefined;
        if (!anims) return;
        for (const anim of anims) {
          if (typeof anim.path === "string") {
            precachePaths.add(anim.path);
          }
        }
      };

      // Hero, boss, super, tresr_bot
      for (const key of ["hero", "boss", "super", "tresr_bot"]) {
        const entity = sprites[key] as Record<string, unknown> | undefined;
        if (entity) collectEntityPaths(entity);
      }

      // Enemies — support both `path` (shared sprite) and `pathTemplate` (per-variant)
      const enemies = sprites.enemies as Record<string, unknown> | undefined;
      if (enemies) {
        const count = (enemies.count as number) || 0;
        const anims = enemies.anims as
          | Array<Record<string, unknown>>
          | undefined;
        if (anims) {
          for (const anim of anims) {
            if (typeof anim.path === "string") {
              // Shared path (same sprite for all variants)
              precachePaths.add(anim.path);
            } else if (typeof anim.pathTemplate === "string") {
              // Per-variant path — expand {i} for 1..count
              for (let i = 1; i <= count; i++) {
                precachePaths.add(anim.pathTemplate.replace("{i}", String(i)));
              }
            }
          }
        }
      }

      // Items (keyed by item name)
      const items = sprites.items as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (items) {
        for (const item of Object.values(items)) {
          collectEntityPaths(item);
        }
      }

      // Static images
      const statics = sprites.statics as
        | Array<Record<string, string>>
        | undefined;
      if (statics) {
        for (const s of statics) {
          if (typeof s.path === "string") precachePaths.add(s.path);
        }
      }

      // Add sorted unique paths to precache
      for (const p of [...precachePaths].sort()) {
        precacheAssets.push(p);
      }
    }

    // Audio: SFX only — music is streamed via HTMLAudioElement, not SW cache (OOM fix)
    if (assets.sfx) {
      for (const s of assets.sfx) {
        precacheAssets.push(`/assets/audio/sfx/${s}.webm`);
      }
    }

    // Wallpapers are NOT precached — Preloader loads a single random wallpaper
    // JIT during the loading screen, so precaching adds unnecessary SW bloat.

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

    // --stage mode: git-add exactly the files this script wrote, plus tresr.yaml.
    // Use this in CI to avoid hardcoding file lists in the workflow.
    if (STAGE_MODE) {
      // Always include the source YAML — it was edited before this script ran.
      const toStage = [
        path.join(projectRoot, "config", "tresr.yaml"),
        ...writtenPaths,
      ].map((p) => path.relative(projectRoot, p));

      log.info(COMPONENT_NAME, `Staging ${toStage.length} file(s) for commit:`);
      for (const f of toStage) {
        log.info(COMPONENT_NAME, `  git add ${f}`);
      }

      // codeql[js/shell-command-constructed-from-input] paths are JSON.stringify'd (shell-quoted)
      // before interpolation; all values are project-relative paths produced internally
      execSync(`git add ${toStage.map((f) => JSON.stringify(f)).join(" ")}`, {
        cwd: projectRoot,
        stdio: "inherit",
      });

      log.info(COMPONENT_NAME, "Staged files ready for commit.");
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
