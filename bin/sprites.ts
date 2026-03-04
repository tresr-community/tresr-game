#!/usr/bin/env bun

/**
 * Sprite Processor — unified sprite processing tool.
 *
 * Modes:
 *   --convert    Convert PNG/JPG sprite sheets to WebP
 *   --check      Verify all sources have WebP counterparts
 *   --calc       Analyse sprite sheets and display frame dimensions
 *   --cut        Cut multi-row sprite sheets into per-animation strips
 *   --chromakey  Remove green screen (#00FF00) background → transparent PNG
 *   --repair     Fix transparency holes from aggressive chromakey
 *   --shrink     Downscale oversized sprite sheets to target frame size
 *   --help       Show this help message
 *
 * Usage:
 *   bun run bin/sprites.ts --convert
 *   bun run bin/sprites.ts --check
 *   bun run bin/sprites.ts --calc
 *   bun run bin/sprites.ts --cut
 *   bun run bin/sprites.ts --chromakey
 *   bun run bin/sprites.ts --shrink [--target 512]
 */

import fs from "node:fs";
import path from "node:path";
import {join} from "path";
import sharp from "sharp";
// @ts-expect-error — pngjs has no type declarations
import {PNG} from "pngjs";
import {load} from "js-yaml";

// ── Colors ──────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
  bgGreen: "\x1b[42m",
  bgRed: "\x1b[41m",
};

const TAG = `${c.bold}${c.cyan}[Sprites]${c.reset}`;
const info = (msg: string) => console.log(`${TAG} ${msg}`);
const ok = (msg: string) => console.log(`${TAG} ${c.green}✔${c.reset} ${msg}`);
const warn = (msg: string) =>
  console.warn(`${TAG} ${c.yellow}⚠${c.reset} ${msg}`);
const fail = (msg: string) =>
  console.error(`${TAG} ${c.red}✖${c.reset} ${msg}`);
const divider = () => console.log(`${TAG} ${c.dim}${"─".repeat(50)}${c.reset}`);

// ── Paths ───────────────────────────────────────────────────────────
const projectRoot = path.resolve(process.cwd());
const sourceBase = path.join(projectRoot, "assets-source/images/sprites");
const destBase = path.join(projectRoot, "public/assets/images/sprites");
const SPRITES_DIR = destBase;

const WEBP_QUALITY = 85;

// ── Types ───────────────────────────────────────────────────────────
interface SpriteEntry {
  entity: string;
  action: string;
  sourcePath: string;
  destPath: string;
}

interface AnimResult {
  anim: string;
  frames: number;
  frameWidth: number | string;
  frameHeight: number | string;
  sheetSize: string;
  gridFit: string;
  file: string;
}

interface EntityGroup {
  name: string;
  anims: AnimResult[];
}

// ═════════════════════════════════════════════════════════════════════
// MODE: --convert
// ═════════════════════════════════════════════════════════════════════

function scanSources(): SpriteEntry[] {
  const entries: SpriteEntry[] = [];

  if (!fs.existsSync(sourceBase)) return entries;

  const entities = fs.readdirSync(sourceBase, {withFileTypes: true});
  for (const entity of entities) {
    if (!entity.isDirectory()) continue;
    const entityDir = path.join(sourceBase, entity.name);
    const files = fs.readdirSync(entityDir);

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext !== ".png" && ext !== ".jpg" && ext !== ".jpeg") continue;

      const action = path.basename(file, ext);

      // Skip still images — they're style seeds, not animation sheets
      if (action === "still") continue;

      const destPath = path.join(destBase, entity.name, `${action}.webp`);

      entries.push({
        entity: entity.name,
        action,
        sourcePath: path.join(entityDir, file),
        destPath,
      });
    }
  }

  return entries;
}

async function runConvert() {
  console.log();
  info(
    `${c.bold}${c.magenta}Sprite Converter${c.reset} ${c.dim}(--convert)${c.reset}`
  );
  divider();

  const entries = scanSources();

  if (entries.length === 0) {
    warn("No source sprites found in assets-source/images/sprites/");
    return;
  }

  info(`Found ${entries.length} sprite sheets to convert`);

  let converted = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of entries) {
    if (fs.existsSync(entry.destPath)) {
      const srcStat = fs.statSync(entry.sourcePath);
      const destStat = fs.statSync(entry.destPath);
      if (destStat.mtimeMs >= srcStat.mtimeMs) {
        skipped++;
        continue;
      }
    }

    fs.mkdirSync(path.dirname(entry.destPath), {recursive: true});

    try {
      await sharp(entry.sourcePath)
        .webp({quality: WEBP_QUALITY, alphaQuality: 100, lossless: false})
        .toFile(entry.destPath);

      const srcSize = fs.statSync(entry.sourcePath).size;
      const destSize = fs.statSync(entry.destPath).size;
      const ratio = ((1 - destSize / srcSize) * 100).toFixed(1);
      ok(`${entry.entity}/${entry.action} → WebP (${ratio}% smaller)`);
      converted++;
    } catch (err) {
      fail(
        `${entry.entity}/${entry.action}: ${err instanceof Error ? err.message : String(err)}`
      );
      failed++;
    }
  }

  divider();
  info(
    `Done: ${c.green}${converted} converted${c.reset}, ${skipped} up-to-date${failed > 0 ? `, ${c.red}${failed} failed${c.reset}` : ""}`
  );

  if (failed > 0) process.exit(1);
}

// ═════════════════════════════════════════════════════════════════════
// MODE: --check
// ═════════════════════════════════════════════════════════════════════

function runCheck() {
  console.log();
  info(
    `${c.bold}${c.magenta}Sprite Check${c.reset} ${c.dim}(--check)${c.reset}`
  );
  divider();

  const entries = scanSources();
  let missing = 0;

  for (const entry of entries) {
    if (!fs.existsSync(entry.destPath)) {
      warn(`Missing: ${entry.entity}/${entry.action}.webp`);
      missing++;
    }
  }

  if (missing === 0) {
    ok(`All ${entries.length} sprite sheets have WebP counterparts`);
  } else {
    fail(`${missing} of ${entries.length} sprites missing WebP conversion`);
    process.exit(1);
  }
}

// ═════════════════════════════════════════════════════════════════════
// MODE: --calc
// ═════════════════════════════════════════════════════════════════════

async function analyzeAnim(
  animName: string,
  file: string,
  expectedFrames: number
): Promise<AnimResult> {
  try {
    const metadata = await sharp(file).metadata();
    if (!metadata.width || !metadata.height) {
      return {
        anim: animName,
        frames: expectedFrames,
        frameWidth: "ERR",
        frameHeight: "ERR",
        sheetSize: "no dimensions",
        gridFit: `${c.red}ERROR${c.reset}`,
        file,
      };
    }

    const totalW = metadata.width;
    const totalH = metadata.height;
    const frameW = Math.floor(totalW / expectedFrames);
    const perfect = totalW % expectedFrames === 0;
    const gridDesc = perfect
      ? `${c.green}OK${c.reset}`
      : `${c.yellow}${totalW % expectedFrames}px remainder${c.reset}`;

    return {
      anim: animName,
      frames: expectedFrames,
      frameWidth: frameW,
      frameHeight: totalH,
      sheetSize: `${totalW}x${totalH}`,
      gridFit: gridDesc,
      file,
    };
  } catch {
    return {
      anim: animName,
      frames: expectedFrames,
      frameWidth: "ERR",
      frameHeight: "ERR",
      sheetSize: "missing",
      gridFit: `${c.red}FILE NOT FOUND${c.reset}`,
      file,
    };
  }
}

function printEntityGroup(group: EntityGroup) {
  console.log(`${c.bold}${c.cyan}  ${group.name}${c.reset}`);

  const colAnim = 10;
  const colFrames = 6;
  const colFW = 7;
  const colFH = 7;
  const colSheet = 12;

  const header =
    `  ${"Anim".padEnd(colAnim)} ` +
    `${"Frames".padEnd(colFrames)} ` +
    `${"FrmW".padEnd(colFW)} ` +
    `${"FrmH".padEnd(colFH)} ` +
    `${"Sheet".padEnd(colSheet)} ` +
    `Grid`;
  console.log(`${c.dim}${header}${c.reset}`);
  console.log(
    `${c.dim}  ${"-".repeat(colAnim + colFrames + colFW + colFH + colSheet + 8 + 5)}${c.reset}`
  );

  for (const a of group.anims) {
    const row =
      `  ${String(a.anim).padEnd(colAnim)} ` +
      `${String(a.frames).padEnd(colFrames)} ` +
      `${String(a.frameWidth).padEnd(colFW)} ` +
      `${String(a.frameHeight).padEnd(colFH)} ` +
      `${String(a.sheetSize).padEnd(colSheet)} ` +
      `${a.gridFit}`;
    console.log(row);
  }

  console.log();
}

async function runCalc() {
  console.log();
  info(
    `${c.bold}${c.magenta}Sprite Frame Analyzer${c.reset} ${c.dim}(--calc)${c.reset}`
  );
  divider();

  const configPath = join(projectRoot, "config", "tresr.yaml");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = load(fs.readFileSync(configPath, "utf8")) as any;
  if (!config?.client?.sprites) {
    fail("Sprites configuration not found in config/tresr.yaml");
    process.exit(1);
  }

  const sprites = config.client.sprites;
  const groups: EntityGroup[] = [];
  let totalSheets = 0;

  async function buildEntityGroup(
    name: string,
    anims: {name: string; frames: number; path: string}[]
  ): Promise<EntityGroup> {
    const results = await Promise.all(
      anims.map((a) => analyzeAnim(a.name, `public${a.path}`, a.frames))
    );
    totalSheets += results.length;
    return {name, anims: results};
  }

  if (sprites.hero) {
    groups.push(await buildEntityGroup("Hero", sprites.hero.anims));
  }

  if (sprites.super) {
    groups.push(
      await buildEntityGroup("Super Projectile", sprites.super.anims)
    );
  }

  if (sprites.boss) {
    groups.push(await buildEntityGroup("Boss", sprites.boss.anims));
  }

  if (sprites.tresr_bot) {
    groups.push(await buildEntityGroup("TRESR Bot", sprites.tresr_bot.anims));
  }

  if (sprites.enemies) {
    for (let i = 1; i <= sprites.enemies.count; i++) {
      const resolvedAnims = sprites.enemies.anims.map(
        (a: {
          name: string;
          frames: number;
          path?: string;
          pathTemplate?: string;
        }) => ({
          name: a.name,
          frames: a.frames,
          path: a.pathTemplate
            ? a.pathTemplate.replace("{i}", String(i))
            : a.path,
        })
      );
      groups.push(await buildEntityGroup(`Enemy ${i}`, resolvedAnims));
    }
  }

  if (sprites.items) {
    for (const [key, item] of Object.entries(sprites.items)) {
      const spriteItem = item as {
        anims: {name: string; frames: number; path: string}[];
      };
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      groups.push(await buildEntityGroup(label, spriteItem.anims));
    }
  }

  if (groups.length === 0) {
    warn("No sprites to analyze!");
    return;
  }

  for (const group of groups) {
    printEntityGroup(group);
  }

  const allAnims = groups.flatMap((g) => g.anims);
  const errors = allAnims.filter(
    (a) =>
      String(a.gridFit).includes("ERROR") ||
      String(a.gridFit).includes("remainder")
  );
  const okCount = allAnims.length - errors.length;

  divider();
  info(`${c.bold}Summary${c.reset}`);
  info(`  Entities: ${groups.length}`);
  info(`  Sheets:   ${totalSheets}`);
  info(
    `  ${c.green}OK: ${okCount}${c.reset}  ${errors.length > 0 ? `${c.yellow}Issues: ${errors.length}${c.reset}` : ""}`
  );
  console.log();
}

// ═════════════════════════════════════════════════════════════════════
// MODE: --cut
// ═════════════════════════════════════════════════════════════════════

function extractRow(
  src: typeof PNG.prototype,
  rowIndex: number,
  rowHeight: number
): Buffer {
  const rowWidth = src.width;
  const dst = new PNG({width: rowWidth, height: rowHeight});

  const srcY = rowIndex * rowHeight;
  for (let y = 0; y < rowHeight; y++) {
    const srcRowStart = (srcY + y) * src.width * 4;
    const dstRowStart = y * rowWidth * 4;
    const rowBytes = rowWidth * 4;
    src.data.copy(dst.data, dstRowStart, srcRowStart, srcRowStart + rowBytes);
  }

  return PNG.sync.write(dst);
}

const CUT_OUTPUT_DIR = path.join(
  projectRoot,
  "assets-source",
  "images",
  "sprites",
  "cut"
);

function cutSheet(
  name: string,
  srcPath: string,
  animNames: string[],
  expectedCols: number
): void {
  const fullPath = join(SPRITES_DIR, srcPath);
  if (!fs.existsSync(fullPath)) {
    warn(`SKIP ${srcPath} (file not found)`);
    return;
  }

  const data = fs.readFileSync(fullPath);
  const src = PNG.sync.read(data);
  const expectedRows = animNames.length;
  const frameWidth = Math.floor(src.width / expectedCols);
  const frameHeight = Math.floor(src.height / expectedRows);

  info(
    `${c.blue}CUT${c.reset} ${srcPath} (${src.width}x${src.height}) → ` +
      `${expectedCols} cols x ${expectedRows} rows, ${frameWidth}x${frameHeight} per frame`
  );

  if (src.width % expectedCols !== 0 || src.height % expectedRows !== 0) {
    warn(
      `Image doesn't divide evenly: ` +
        `${src.width}%${expectedCols}=${src.width % expectedCols}, ` +
        `${src.height}%${expectedRows}=${src.height % expectedRows}`
    );
  }

  const outDir = join(CUT_OUTPUT_DIR, name);
  fs.mkdirSync(outDir, {recursive: true});

  for (let row = 0; row < expectedRows; row++) {
    const animName = animNames[row];
    const outPath = join(outDir, `${animName}.png`);
    const strip = extractRow(src, row, frameHeight);
    fs.writeFileSync(outPath, strip);
    ok(
      `${name}/${animName}.png (${src.width}x${frameHeight}, ${expectedCols} frames)`
    );
  }
}

function copySingleRow(name: string, srcPath: string, animName: string): void {
  const fullSrc = join(SPRITES_DIR, srcPath);
  if (!fs.existsSync(fullSrc)) {
    warn(`SKIP ${srcPath} (file not found)`);
    return;
  }

  const outDir = join(CUT_OUTPUT_DIR, name);
  fs.mkdirSync(outDir, {recursive: true});

  const outPath = join(outDir, `${animName}.png`);
  fs.copyFileSync(fullSrc, outPath);

  const data = fs.readFileSync(fullSrc);
  const png = PNG.sync.read(data);
  ok(`${srcPath} → ${name}/${animName}.png (${png.width}x${png.height})`);
}

function runCut() {
  console.log();
  info(
    `${c.bold}${c.magenta}Sprite Sheet Cutter${c.reset} ${c.dim}(--cut)${c.reset}`
  );
  divider();

  const enemyAnims = ["idle", "walk", "jump", "attack", "hurt"];
  const enemyCols = 5;

  info(`${c.bold}Enemies${c.reset}`);
  for (let i = 1; i <= 5; i++) {
    cutSheet(`enemy_${i}`, `enemy_${i}.png`, enemyAnims, enemyCols);
  }

  info(`${c.bold}Chest${c.reset}`);
  cutSheet("chest", "chest.png", ["idle", "open", "close"], 5);

  info(`${c.bold}Single-row items${c.reset}`);
  copySingleRow("super", "super.png", "spin");
  copySingleRow("key", "key.png", "idle");
  copySingleRow("bomb", "candle.png", "idle");
  copySingleRow("loader", "loader.png", "idle");

  divider();
  ok("Done");
  console.log();
}

// ═════════════════════════════════════════════════════════════════════
// MODE: --chromakey
// ═════════════════════════════════════════════════════════════════════

/**
 * Scan assets-source/sprites/<entity>/ directories for PNG/JPG files
 * with green (#00FF00) backgrounds and replace the green with transparency.
 * Outputs transparent PNGs alongside the originals (overwrites if already PNG,
 * or creates .png next to .jpg).
 *
 * Skips still.png/still.jpg files (those are 1:1 stills, not sprite sheets).
 */
async function runChromaKey(): Promise<void> {
  console.log();
  info(
    `${c.bold}${c.magenta}Chroma Key${c.reset} ${c.dim}(--chromakey)${c.reset}`
  );
  divider();

  const spritesRoot = path.join(projectRoot, "assets-source/images/sprites");

  if (!fs.existsSync(spritesRoot)) {
    warn(`Sprites directory not found: ${spritesRoot}`);
    return;
  }

  // Collect all image files in entity subdirectories
  const files: {entity: string; filePath: string; baseName: string}[] = [];
  const entities = fs.readdirSync(spritesRoot, {withFileTypes: true});

  for (const entity of entities) {
    if (!entity.isDirectory()) continue;
    const entityDir = path.join(spritesRoot, entity.name);
    const items = fs.readdirSync(entityDir);

    for (const item of items) {
      const ext = path.extname(item).toLowerCase();
      if (ext !== ".png" && ext !== ".jpg" && ext !== ".jpeg") continue;

      const baseName = path.basename(item, ext);
      // Skip still images — they're style seeds, not sprite sheets
      if (baseName === "still") continue;

      files.push({
        entity: entity.name,
        filePath: path.join(entityDir, item),
        baseName,
      });
    }
  }

  if (files.length === 0) {
    warn("No sprite sheets found in assets-source/images/sprites/<entity>/");
    info(
      "Generate sprites first, then run --chromakey to remove green backgrounds."
    );
    return;
  }

  info(`Found ${files.length} sprite sheet(s) to process`);

  // Green screen color and tolerance thresholds
  const GREEN_R = 0;
  const GREEN_G = 255;
  const GREEN_B = 0;
  const TOLERANCE_INNER = 160; // Below this distance: fully transparent
  const TOLERANCE_OUTER = 220; // Between inner and outer: soft alpha blend

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const label = `${file.entity}/${path.basename(file.filePath)}`;

    try {
      // Read image as raw RGBA pixels
      const image = sharp(file.filePath);
      const {data, info: rawInfo} = await image
        .ensureAlpha()
        .raw()
        .toBuffer({resolveWithObject: true});

      const width = rawInfo.width;
      const height = rawInfo.height;
      const pixels = new Uint8Array(data.buffer, data.byteOffset, data.length);

      let greenPixels = 0;
      const totalPixels = width * height;

      // Process each pixel — replace green with transparent (soft edges)
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];

        // Calculate distance from target green
        const dr = r - GREEN_R;
        const dg = g - GREEN_G;
        const db = b - GREEN_B;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);

        if (dist < TOLERANCE_INNER) {
          // Core green — fully transparent
          pixels[i] = 0;
          pixels[i + 1] = 0;
          pixels[i + 2] = 0;
          pixels[i + 3] = 0;
          greenPixels++;
        } else if (dist < TOLERANCE_OUTER) {
          // Edge zone — soft alpha blend to reduce green fringing
          const alpha = Math.round(
            ((dist - TOLERANCE_INNER) / (TOLERANCE_OUTER - TOLERANCE_INNER)) *
              255
          );
          pixels[i + 3] = alpha;
          // De-spill: reduce green channel contribution on edge pixels
          const spillFactor = 1 - alpha / 255;
          pixels[i + 1] = Math.round(g - (g - Math.max(r, b)) * spillFactor);
          greenPixels++;
        }
        // else: keep pixel as-is (fully opaque, not green)
      }

      const greenPct = ((greenPixels / totalPixels) * 100).toFixed(1);

      if (greenPixels === 0) {
        warn(`${label} — no green pixels found, skipping`);
        skipped++;
        continue;
      }

      // Output as PNG with transparency (same directory, .png extension)
      const outPath = path.join(
        path.dirname(file.filePath),
        `${file.baseName}.png`
      );

      await sharp(Buffer.from(pixels.buffer), {
        raw: {width, height, channels: 4},
      })
        .png({compressionLevel: 9})
        .toFile(outPath + ".tmp");

      // Atomic rename (overwrite original if it was already PNG)
      fs.renameSync(outPath + ".tmp", outPath);

      // If source was JPG, remove it now that we have the PNG
      const srcExt = path.extname(file.filePath).toLowerCase();
      if (
        (srcExt === ".jpg" || srcExt === ".jpeg") &&
        file.filePath !== outPath
      ) {
        fs.unlinkSync(file.filePath);
      }

      const outSize = (fs.statSync(outPath).size / 1024).toFixed(1);
      ok(
        `${label} — ${greenPct}% green removed → ${file.baseName}.png (${outSize}KB)`
      );
      processed++;
    } catch (err) {
      fail(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  divider();
  info(
    `Done: ${c.green}${processed} processed${c.reset}, ${skipped} skipped${failed > 0 ? `, ${c.red}${failed} failed${c.reset}` : ""}`
  );

  if (failed > 0) process.exit(1);
}

// ═════════════════════════════════════════════════════════════════════
// MODE: --shrink
// ═════════════════════════════════════════════════════════════════════

/**
 * Default target frame size. Frames at or below this size are skipped.
 * Override with --target <px>.
 */
const DEFAULT_SHRINK_TARGET = 512;

interface ShrinkEntry {
  label: string;
  filePath: string;
  frames: number;
  oldFW: number;
  oldFH: number;
}

/**
 * Collect every sprite sheet referenced in tresr.yaml that exceeds the target
 * frame dimensions.
 */
function collectShrinkEntries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sprites: any,
  targetSize: number
): ShrinkEntry[] {
  const entries: ShrinkEntry[] = [];

  const addEntity = (
    label: string,
    anims: {
      name: string;
      frames: number;
      path?: string;
      pathTemplate?: string;
      frameWidth: number;
      frameHeight: number;
    }[],
    templateIndex?: number
  ) => {
    for (const anim of anims) {
      if (anim.frameWidth <= targetSize && anim.frameHeight <= targetSize)
        continue;
      const filePath =
        templateIndex !== undefined
          ? `public${anim.pathTemplate!.replace("{i}", String(templateIndex))}`
          : `public${anim.path}`;
      entries.push({
        label: `${label}/${anim.name}`,
        filePath,
        frames: anim.frames,
        oldFW: anim.frameWidth,
        oldFH: anim.frameHeight,
      });
    }
  };

  if (sprites.hero) addEntity("hero", sprites.hero.anims);
  if (sprites.super) addEntity("super", sprites.super.anims);
  if (sprites.boss) addEntity("boss", sprites.boss.anims);
  if (sprites.tresr_bot) addEntity("tresr_bot", sprites.tresr_bot.anims);

  if (sprites.enemies) {
    for (let i = 1; i <= sprites.enemies.count; i++) {
      addEntity(`enemy_${i}`, sprites.enemies.anims, i);
    }
  }

  if (sprites.items) {
    for (const [key, item] of Object.entries(sprites.items)) {
      const spriteItem = item as {
        anims: {
          name: string;
          frames: number;
          path: string;
          frameWidth: number;
          frameHeight: number;
        }[];
      };
      addEntity(key, spriteItem.anims);
    }
  }

  return entries;
}

async function runShrink(targetSize: number) {
  console.log();
  info(
    `${c.bold}${c.magenta}Sprite Shrink${c.reset} ${c.dim}(--shrink, target: ${targetSize}px)${c.reset}`
  );
  divider();

  const configPath = join(projectRoot, "config", "tresr.yaml");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = load(fs.readFileSync(configPath, "utf8")) as any;
  if (!config?.client?.sprites) {
    fail("Sprites configuration not found in config/tresr.yaml");
    process.exit(1);
  }

  const entries = collectShrinkEntries(config.client.sprites, targetSize);

  if (entries.length === 0) {
    ok(`All sprite frames are already ≤ ${targetSize}px — nothing to shrink`);
    return;
  }

  info(`Found ${entries.length} oversized sprite sheet(s) to shrink`);

  let shrunk = 0;
  let skipped = 0;
  let failed = 0;
  let savedBytes = 0;

  for (const entry of entries) {
    if (!fs.existsSync(entry.filePath)) {
      warn(`SKIP ${entry.label} — file not found: ${entry.filePath}`);
      skipped++;
      continue;
    }

    try {
      const metadata = await sharp(entry.filePath).metadata();
      if (!metadata.width || !metadata.height) {
        warn(`SKIP ${entry.label} — cannot read dimensions`);
        skipped++;
        continue;
      }

      const oldW = metadata.width;
      const oldH = metadata.height;
      const oldSize = fs.statSync(entry.filePath).size;

      // Calculate new dimensions: scale frame down to targetSize, preserving aspect
      // The sheet is frames × frameWidth wide, frameHeight tall
      const scaleX = Math.min(1, targetSize / entry.oldFW);
      const scaleY = Math.min(1, targetSize / entry.oldFH);
      const scale = Math.min(scaleX, scaleY);

      if (scale >= 1) {
        skipped++;
        continue;
      }

      const newW = Math.round(oldW * scale);
      const newH = Math.round(oldH * scale);

      // Resize and overwrite
      const tmpPath = entry.filePath + ".tmp";
      await sharp(entry.filePath)
        .resize(newW, newH, {fit: "fill"})
        .webp({quality: WEBP_QUALITY, alphaQuality: 100, lossless: false})
        .toFile(tmpPath);

      fs.renameSync(tmpPath, entry.filePath);

      const newSize = fs.statSync(entry.filePath).size;
      const saved = oldSize - newSize;
      savedBytes += saved;

      const newFW = Math.round(entry.oldFW * scale);
      const newFH = Math.round(entry.oldFH * scale);

      ok(
        `${entry.label}: ${oldW}×${oldH} → ${newW}×${newH} ` +
          `(frame: ${entry.oldFW}×${entry.oldFH} → ${newFW}×${newFH}) ` +
          `${c.dim}saved ${(saved / 1024).toFixed(0)}KB${c.reset}`
      );
      shrunk++;
    } catch (err) {
      fail(
        `${entry.label}: ${err instanceof Error ? err.message : String(err)}`
      );
      failed++;
    }
  }

  divider();
  info(
    `Done: ${c.green}${shrunk} shrunk${c.reset}, ${skipped} skipped` +
      `${failed > 0 ? `, ${c.red}${failed} failed${c.reset}` : ""}` +
      ` — ${c.bold}${(savedBytes / 1048576).toFixed(1)}MB saved on disk${c.reset}`
  );

  if (shrunk > 0) {
    console.log();
    warn(
      `${c.bold}ACTION REQUIRED:${c.reset} Update frameWidth/frameHeight in config/tresr.yaml ` +
        `to match the new frame sizes (e.g., 1000 → ${targetSize}).`
    );
  }

  if (failed > 0) process.exit(1);
}

// ═════════════════════════════════════════════════════════════════════
// MODE: --flatten
// ═════════════════════════════════════════════════════════════════════

async function runFlatten(filePath: string) {
  console.log();
  info(
    `${c.bold}${c.magenta}Flatten Grid${c.reset} ${c.dim}(--flatten ${filePath})${c.reset}`
  );
  divider();

  if (!fs.existsSync(filePath)) {
    fail(`File not found: ${filePath}`);
    process.exit(1);
  }

  // Determine entity and action from path
  const parts = path.resolve(filePath).split(path.sep);
  const fileName = parts.pop() || "";
  const entityDir = parts.pop() || "";
  const ext = path.extname(fileName);
  const action = path.basename(fileName, ext);

  // Load config to find expected frames
  const configPath = join(projectRoot, "config", "tresr.yaml");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = load(fs.readFileSync(configPath, "utf8")) as any;
  if (!config?.client?.sprites) {
    fail("Sprites configuration not found in config/tresr.yaml");
    process.exit(1);
  }

  const sprites = config.client.sprites;
  let expectedFrames = 0;

  const findFrames = (anims: {name: string; frames: number}[] | undefined) => {
    if (!anims) return;
    const a = anims.find((a) => a.name === action);
    if (a) expectedFrames = a.frames;
  };

  if (entityDir === "hero") findFrames(sprites.hero?.anims);
  else if (entityDir === "boss") findFrames(sprites.boss?.anims);
  else if (entityDir === "tresr_bot") findFrames(sprites.tresr_bot?.anims);
  else if (entityDir === "super") findFrames(sprites.super?.anims);
  else if (entityDir.startsWith("enemy_")) findFrames(sprites.enemies?.anims);
  else if (sprites.items && sprites.items[entityDir])
    findFrames(sprites.items[entityDir].anims);

  if (!expectedFrames) {
    fail(
      `Could not determine expected frames for ${entityDir}/${action} in tresr.yaml`
    );
    process.exit(1);
  }

  // Determine grid layout based on frames
  const rows = 2;
  const cols = expectedFrames <= 4 ? 2 : 3;

  try {
    const data = fs.readFileSync(filePath);

    // We might have a JPG or PNG. Sharp is better for converting and resampling
    const image = sharp(data);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      fail(`Could not read dimensions for ${filePath}`);
      return;
    }

    // AI outputs `--aspect 1:1` for sprite sheets (2x2 or 2x3 grids).
    // Flattened sprites will have a very wide aspect ratio (e.g., 4:1, 5:1, 6:1).
    const aspectRatio = metadata.width / metadata.height;
    if (aspectRatio > 3.0) {
      // If wide, it's already a single row
      ok(
        `Image is already flattened (aspect ratio ${aspectRatio.toFixed(2)}). Skipping.`
      );
      return;
    }

    const cellW = Math.floor(metadata.width / cols);
    const cellH = Math.floor(metadata.height / rows);

    info(
      `Flattening ${metadata.width}x${metadata.height} image into 1x${expectedFrames} strip using ${cols}x${rows} grid (${cellW}x${cellH} per cell)`
    );

    // Ensure RGBA PNG buffer for slicing
    const {data: rawData, info: rawInfo} = await image
      .ensureAlpha()
      .raw()
      .toBuffer({resolveWithObject: true});

    const src = new PNG({width: rawInfo.width, height: rawInfo.height});
    rawData.copy(src.data);

    // Create a new wide PNG
    const newW = cellW * expectedFrames;
    const newH = cellH;
    const dst = new PNG({width: newW, height: newH});

    // We fill the new image with solid green background (#00FF00)
    for (let i = 0; i < dst.data.length; i += 4) {
      dst.data[i] = 0;
      dst.data[i + 1] = 255;
      dst.data[i + 2] = 0;
      dst.data[i + 3] = 255;
    }

    let frameIdx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (frameIdx >= expectedFrames) break;

        const srcX = c * cellW;
        const srcY = r * cellH;
        const dstX = frameIdx * cellW;
        const dstY = 0;

        // Copy this cell into the destination strip
        for (let y = 0; y < cellH; y++) {
          for (let x = 0; x < cellW; x++) {
            const actualSrcX = srcX + x;
            const actualSrcY = srcY + y;
            const actualDstX = dstX + x;
            const actualDstY = dstY + y;

            if (actualSrcX < src.width && actualSrcY < src.height) {
              const srcIdx = (src.width * actualSrcY + actualSrcX) << 2;
              const dstIdx = (dst.width * actualDstY + actualDstX) << 2;
              src.data.copy(dst.data, dstIdx, srcIdx, srcIdx + 4);
            }
          }
        }
        frameIdx++;
      }
    }

    // Output flattened PNG back to disk (overwriting), even if original was JPG
    const pngBuffer = PNG.sync.write(dst);

    const targetPath = filePath.replace(/\.jpg|\.jpeg/i, ".png");
    fs.writeFileSync(targetPath + ".tmp", pngBuffer);
    fs.renameSync(targetPath + ".tmp", targetPath);

    if (filePath !== targetPath) {
      fs.unlinkSync(filePath); // delete original JPG
    }

    ok(`Flattened to ${newW}x${newH}`);
  } catch (err) {
    fail(
      `Error flattening: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }
}

// ═════════════════════════════════════════════════════════════════════
// MODE: --repair
// ═════════════════════════════════════════════════════════════════════

/**
 * Repair sprites damaged by overly aggressive chromakey.
 *
 * Pass 1 — Restore semi-transparent pixels: any pixel with 0 < alpha < 255
 *          has its alpha set to 255. These are character pixels (suits, skin)
 *          that got caught in the chromakey edge zone but still retain colour.
 *
 * Pass 2 — Inpaint interior holes: fully transparent pixels (alpha=0) that
 *          are surrounded by enough opaque neighbours get filled by averaging
 *          those neighbours. Runs multiple iterations to close larger gaps.
 *
 * Files are overwritten in-place (assets-source PNGs).
 */
async function runRepair(): Promise<void> {
  console.log();
  info(
    `${c.bold}${c.magenta}Repair Sprites${c.reset} ${c.dim}(--repair)${c.reset}`
  );
  divider();

  const spritesRoot = path.join(projectRoot, "assets-source/images/sprites");

  if (!fs.existsSync(spritesRoot)) {
    warn(`Sprites directory not found: ${spritesRoot}`);
    return;
  }

  // Collect PNG files (same scan as chromakey)
  const files: {entity: string; filePath: string; baseName: string}[] = [];
  const entities = fs.readdirSync(spritesRoot, {withFileTypes: true});

  for (const entity of entities) {
    if (!entity.isDirectory()) continue;
    const entityDir = path.join(spritesRoot, entity.name);
    const items = fs.readdirSync(entityDir);

    for (const item of items) {
      const ext = path.extname(item).toLowerCase();
      if (ext !== ".png") continue;

      const baseName = path.basename(item, ext);
      if (baseName === "still") continue;

      files.push({
        entity: entity.name,
        filePath: path.join(entityDir, item),
        baseName,
      });
    }
  }

  if (files.length === 0) {
    warn("No PNG sprite sheets found to repair.");
    return;
  }

  info(`Found ${files.length} sprite sheet(s) to repair`);

  // Minimum opaque neighbours (out of 8) required to inpaint a hole pixel
  const MIN_OPAQUE_NEIGHBOURS = 3;
  // Number of inpaint iterations (each pass fills one pixel ring inward)
  const INPAINT_PASSES = 6;

  let repaired = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const label = `${file.entity}/${path.basename(file.filePath)}`;

    try {
      const image = sharp(file.filePath);
      const {data, info: rawInfo} = await image
        .ensureAlpha()
        .raw()
        .toBuffer({resolveWithObject: true});

      const width = rawInfo.width;
      const height = rawInfo.height;
      const pixels = new Uint8Array(data.buffer, data.byteOffset, data.length);

      let restoredSemiTransparent = 0;
      let inpaintedHoles = 0;

      // ── Pass 1: Restore semi-transparent pixels ──────────────────
      for (let i = 0; i < pixels.length; i += 4) {
        const a = pixels[i + 3];
        if (a > 0 && a < 255) {
          pixels[i + 3] = 255;
          restoredSemiTransparent++;
        }
      }

      // ── Pass 2: Inpaint interior holes ───────────────────────────
      // Neighbour offsets (8-connected)
      const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
      const dy = [-1, -1, -1, 0, 0, 1, 1, 1];

      for (let pass = 0; pass < INPAINT_PASSES; pass++) {
        let filled = 0;
        // Snapshot alpha so we don't chain-react within a single pass
        const alphaSnap = new Uint8Array(width * height);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            alphaSnap[y * width + x] = pixels[(y * width + x) * 4 + 3];
          }
        }

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (alphaSnap[y * width + x] > 0) continue; // already opaque

            // Count opaque neighbours and accumulate their colours
            let opaqueCount = 0;
            let sumR = 0,
              sumG = 0,
              sumB = 0;

            for (let d = 0; d < 8; d++) {
              const nx = x + dx[d];
              const ny = y + dy[d];
              if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
              if (alphaSnap[ny * width + nx] === 255) {
                const ni = (ny * width + nx) * 4;
                sumR += pixels[ni];
                sumG += pixels[ni + 1];
                sumB += pixels[ni + 2];
                opaqueCount++;
              }
            }

            if (opaqueCount >= MIN_OPAQUE_NEIGHBOURS) {
              pixels[idx] = Math.round(sumR / opaqueCount);
              pixels[idx + 1] = Math.round(sumG / opaqueCount);
              pixels[idx + 2] = Math.round(sumB / opaqueCount);
              pixels[idx + 3] = 255;
              filled++;
            }
          }
        }

        inpaintedHoles += filled;
        if (filled === 0) break; // no more holes to fill
      }

      const totalFixed = restoredSemiTransparent + inpaintedHoles;

      if (totalFixed === 0) {
        info(`${label} — no damage detected, skipping`);
        skipped++;
        continue;
      }

      // Write back in-place
      await sharp(Buffer.from(pixels.buffer), {
        raw: {width, height, channels: 4},
      })
        .png({compressionLevel: 9})
        .toFile(file.filePath + ".tmp");

      fs.renameSync(file.filePath + ".tmp", file.filePath);

      ok(
        `${label} — restored ${restoredSemiTransparent} semi-transparent + inpainted ${inpaintedHoles} holes`
      );
      repaired++;
    } catch (err) {
      fail(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  divider();
  info(
    `Done: ${c.green}${repaired} repaired${c.reset}, ${skipped} skipped${failed > 0 ? `, ${c.red}${failed} failed${c.reset}` : ""}`
  );

  if (failed > 0) process.exit(1);
}

// ═════════════════════════════════════════════════════════════════════
// HELP
// ═════════════════════════════════════════════════════════════════════

function showHelp(): void {
  console.log(`
${c.bold}${c.magenta}Sprite Processor${c.reset}

${c.bold}Usage:${c.reset}
  bun run bin/sprites.ts ${c.bold}--convert${c.reset}    Convert PNG/JPG sprite sheets to WebP
  bun run bin/sprites.ts ${c.bold}--check${c.reset}      Verify all sources have WebP counterparts
  bun run bin/sprites.ts ${c.bold}--calc${c.reset}       Analyse sprite sheets and display frame dimensions
  bun run bin/sprites.ts ${c.bold}--cut${c.reset}        Cut multi-row sheets into per-animation strips
  bun run bin/sprites.ts ${c.bold}--flatten${c.reset}    Restructure a 2x2 or 2x3 grid image into a 1xN strip
  bun run bin/sprites.ts ${c.bold}--chromakey${c.reset}  Remove #00FF00 green background → transparent PNG
  bun run bin/sprites.ts ${c.bold}--repair${c.reset}     Fix transparency holes from aggressive chromakey
  bun run bin/sprites.ts ${c.bold}--shrink${c.reset}     Downscale oversized sprite sheets (default target: 512px)
  bun run bin/sprites.ts ${c.bold}--help${c.reset}       Show this help message

${c.bold}Options:${c.reset}
  ${c.bold}--target${c.reset} <px>   Target frame size for --shrink (default: 512)

${c.bold}Source Paths:${c.reset}
  Sources:        assets-source/images/sprites/{entity}/{action}.png|jpg
  Chromakey src:  assets-source/images/sprites/{entity}/*.png|jpg (skips still.*)

${c.bold}Output:${c.reset}
  WebP sheets:    public/assets/images/sprites/{entity}/{action}.webp
  Chromakey out:  assets-source/images/sprites/{entity}/{action}.png (transparent)
`);
}

// ═════════════════════════════════════════════════════════════════════
// CLI
// ═════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);

if (args.includes("--convert")) {
  await runConvert();
} else if (args.includes("--check")) {
  runCheck();
} else if (args.includes("--calc")) {
  await runCalc();
} else if (args.includes("--cut")) {
  runCut();
} else if (args.includes("--flatten")) {
  const filePath = args[args.indexOf("--flatten") + 1];
  if (!filePath) {
    fail("Missing file path for --flatten");
    process.exit(1);
  }
  await runFlatten(filePath);
} else if (args.includes("--chromakey")) {
  await runChromaKey();
} else if (args.includes("--repair")) {
  await runRepair();
} else if (args.includes("--shrink")) {
  const targetIdx = args.indexOf("--target");
  const target =
    targetIdx >= 0 ? parseInt(args[targetIdx + 1], 10) : DEFAULT_SHRINK_TARGET;
  if (isNaN(target) || target < 32) {
    fail("Invalid --target value. Must be a number >= 32.");
    process.exit(1);
  }
  await runShrink(target);
} else if (args.includes("--help") || args.includes("-h")) {
  showHelp();
} else {
  showHelp();
}
