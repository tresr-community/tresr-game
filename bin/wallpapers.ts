import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

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

const TAG = `${c.bold}${c.cyan}[WallpaperConvert]${c.reset}`;

const info = (msg: string) => console.log(`${TAG} ${msg}`);
const success = (msg: string) =>
  console.log(`${TAG} ${c.green}✔${c.reset} ${msg}`);
const warn = (msg: string) =>
  console.warn(`${TAG} ${c.yellow}⚠${c.reset} ${msg}`);
const fail = (msg: string) =>
  console.error(`${TAG} ${c.red}✖${c.reset} ${msg}`);
const divider = () => console.log(`${TAG} ${c.dim}${"─".repeat(50)}${c.reset}`);

// ── CLI ─────────────────────────────────────────────────────────────
type Mode = "sync" | "update" | "pending";

function parseMode(): Mode {
  const args = process.argv.slice(2);
  if (args.includes("--sync")) return "sync";
  if (args.includes("--update")) return "update";
  if (args.includes("--pending")) return "pending";
  // No flag = show usage
  console.log();
  info(`${c.bold}${c.magenta}Wallpaper Converter${c.reset}`);
  divider();
  info(`Usage:`);
  info(
    `  bun run bin/wallpapers.ts ${c.bold}--sync${c.reset}     ${c.dim}Full sync: cleanup stale sources, convert, rebuild state${c.reset}`
  );
  info(
    `  bun run bin/wallpapers.ts ${c.bold}--update${c.reset}   ${c.dim}Convert new sources to WebP (no cleanup)${c.reset}`
  );
  info(
    `  bun run bin/wallpapers.ts ${c.bold}--pending${c.reset}  ${c.dim}List keys needing wallpaper generation${c.reset}`
  );
  console.log();
  info(
    `${c.bold}--sync${c.reset}    = Run at the ${c.bold}start${c.reset} of each iteration (before generating)`
  );
  info(
    `          Deletes source JPG/PNG if the WebP was removed, so nano banana regenerates.`
  );
  info(`          Rebuilds .progress.json from disk state.`);
  console.log();
  info(
    `${c.bold}--update${c.reset}  = Run ${c.bold}after${c.reset} generating a new wallpaper JPG`
  );
  info(`          Converts pending JPG/PNG to WebP. Does NOT delete sources.`);
  info(`          Updates .progress.json with new conversions.`);
  console.log();
  info(
    `${c.bold}--pending${c.reset} = List keys that need wallpaper generation`
  );
  info(
    `          Shows key filename, correct wallpaper number, and output path.`
  );
  info(`          Use this to know EXACTLY what to generate next.`);
  console.log();
  process.exit(1);
}

// ── Paths ───────────────────────────────────────────────────────────
const projectRoot = path.resolve(process.cwd());
const sourceDir = path.join(projectRoot, "static-source/images/wallpapers");
const keysDir = path.join(projectRoot, "static-source/images/keys");
const webpDir = path.join(projectRoot, "static/assets/images/wallpapers");
const progressPath = path.join(sourceDir, ".progress.json");

// ── State ───────────────────────────────────────────────────────────
interface ProgressState {
  generated: string[];
  failed: string[];
  completed: string[];
  next_wallpaper_number: number;
  total_keys: number;
  errors: Record<string, string>;
  converted: Record<string, boolean>;
}

function emptyState(): ProgressState {
  return {
    generated: [],
    failed: [],
    completed: [],
    next_wallpaper_number: 1,
    total_keys: 0,
    errors: {},
    converted: {},
  };
}

function readState(): ProgressState {
  if (fs.existsSync(progressPath)) {
    try {
      return JSON.parse(fs.readFileSync(progressPath, "utf8"));
    } catch {
      warn("Corrupt .progress.json — starting fresh");
    }
  }
  return emptyState();
}

function writeState(state: ProgressState) {
  const sort = (arr: string[]) =>
    [...arr].sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
  const sortObj = (obj: Record<string, boolean>) =>
    Object.fromEntries(
      Object.entries(obj).sort(([a], [b]) =>
        a.localeCompare(b, undefined, {numeric: true})
      )
    );

  const sorted: ProgressState = {
    ...state,
    generated: sort(state.generated),
    failed: sort(state.failed),
    completed: sort(state.completed),
    converted: sortObj(state.converted),
  };

  fs.writeFileSync(progressPath, JSON.stringify(sorted, null, 2));
}

// ── Helpers ─────────────────────────────────────────────────────────
function ensureDirs() {
  for (const dir of [sourceDir, keysDir, webpDir]) {
    fs.mkdirSync(dir, {recursive: true});
  }
}

function listFiles(dir: string, exts: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => exts.some((ext) => f.endsWith(`.${ext}`)))
    .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
}

function getKeys(): string[] {
  return listFiles(keysDir, ["jpg", "jpeg", "png"]);
}

function keyToWallpaperNum(keyFile: string): number {
  const match = keyFile.match(/key-(\d+)\./);
  return match ? parseInt(match[1], 10) : 0;
}

async function convertToWebp(
  srcPath: string,
  destPath: string
): Promise<boolean> {
  try {
    await sharp(srcPath).webp({quality: 85}).toFile(destPath);
    return true;
  } catch (err) {
    fail(
      `Convert failed ${c.dim}${path.basename(srcPath)}${c.reset}: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}

function webpName(file: string): string {
  return file.replace(/\.(png|jpg|jpeg)$/i, ".webp");
}

// ── Convert Step (shared by both modes) ─────────────────────────────
async function convertSources(): Promise<{
  converted: number;
  skipped: number;
  failed: number;
}> {
  const pngFiles = listFiles(sourceDir, ["png"]);
  const jpgFiles = listFiles(sourceDir, ["jpg", "jpeg"]);
  const totalSources = pngFiles.length + jpgFiles.length;

  let converted = 0;
  let skipped = 0;
  let failed = 0;

  if (totalSources === 0) return {converted, skipped, failed};

  divider();
  info(`${c.bold}Converting${c.reset} ${c.dim}(source -> WebP)${c.reset}`);

  for (const file of pngFiles) {
    const dest = path.join(webpDir, webpName(file));
    if (fs.existsSync(dest)) {
      skipped++;
      continue;
    }
    info(
      `  ${c.blue}PNG${c.reset} ${file} ${c.dim}->${c.reset} ${webpName(file)}`
    );
    if (await convertToWebp(path.join(sourceDir, file), dest)) {
      success(`  ${webpName(file)}`);
      converted++;
    } else {
      failed++;
    }
  }

  for (const file of jpgFiles) {
    const dest = path.join(webpDir, webpName(file));
    if (fs.existsSync(dest)) {
      skipped++;
      continue;
    }
    info(
      `  ${c.blue}JPG${c.reset} ${file} ${c.dim}->${c.reset} ${webpName(file)}`
    );
    if (await convertToWebp(path.join(sourceDir, file), dest)) {
      success(`  ${webpName(file)}`);
      converted++;
    } else {
      failed++;
    }
  }

  if (converted === 0 && failed === 0) {
    success(`All sources already converted`);
  }

  return {converted, skipped, failed};
}

// ── Integrity Check (shared) ────────────────────────────────────────
function integrityCheck(): {passed: number; failed: number; orphans: string[]} {
  divider();
  info(`${c.bold}Integrity check${c.reset}`);

  const webpsNow = listFiles(webpDir, ["webp"]);
  const webpSetNow = new Set(webpsNow);
  const sourcesNow = [
    ...listFiles(sourceDir, ["png"]),
    ...listFiles(sourceDir, ["jpg", "jpeg"]),
  ];
  const expectedWebps = new Set(sourcesNow.map((f) => webpName(f)));

  let passed = 0;
  let failed = 0;

  for (const src of sourcesNow) {
    const wName = webpName(src);
    const wPath = path.join(webpDir, wName);
    if (webpSetNow.has(wName) && fs.statSync(wPath).size > 0) {
      passed++;
    } else {
      fail(
        `  ${c.bold}MISSING${c.reset} ${wName} ${c.dim}(source: ${src})${c.reset}`
      );
      failed++;
    }
  }

  const orphans = webpsNow.filter((f) => !expectedWebps.has(f));

  if (failed === 0 && sourcesNow.length > 0) {
    success(`All ${c.bold}${passed}${c.reset} source(s) have verified WebP`);
  } else if (sourcesNow.length === 0 && webpsNow.length > 0) {
    info(
      `  ${c.dim}${webpsNow.length} WebP files on disk (sources already cleaned)${c.reset}`
    );
  }

  if (orphans.length > 0) {
    info(
      `  ${c.dim}${orphans.length} WebP file(s) with no source (normal after sync cleanup)${c.reset}`
    );
  }

  return {passed, failed, orphans};
}

// ── State Sync (shared) ─────────────────────────────────────────────
function syncState(state: ProgressState): number {
  const keys = getKeys();
  state.total_keys = keys.length;

  if (keys.length === 0) return 0;

  divider();
  info(`${c.bold}State sync${c.reset} ${c.dim}(keys <-> disk)${c.reset}`);

  const webpsNow = new Set(listFiles(webpDir, ["webp"]));
  const generatedSet = new Set(state.generated);
  let bootstrapCount = 0;

  // Bootstrap: WebP exists for a key but key isn't in generated yet
  for (const keyFile of keys) {
    if (generatedSet.has(keyFile)) continue;
    const num = keyToWallpaperNum(keyFile);
    if (num === 0) continue;
    const wName = `wallpaper_${num}.webp`;
    if (webpsNow.has(wName)) {
      state.generated.push(keyFile);
      generatedSet.add(keyFile);
      if (num >= state.next_wallpaper_number) {
        state.next_wallpaper_number = num + 1;
      }
      info(
        `  ${c.green}Bootstrapped${c.reset} ${keyFile} ${c.dim}(${wName} found on disk)${c.reset}`
      );
      bootstrapCount++;
    }
  }

  // Rebuild converted from actual disk
  state.converted = {};
  for (const webp of webpsNow) {
    state.converted[webp] = true;
  }

  // Rebuild completed: keys that are generated AND have a WebP on disk
  state.completed = state.generated.filter((keyFile) => {
    const num = keyToWallpaperNum(keyFile);
    if (num === 0) return false;
    return webpsNow.has(`wallpaper_${num}.webp`);
  });

  // Advance next_wallpaper_number past all existing wallpapers
  for (const webp of webpsNow) {
    const match = webp.match(/^wallpaper_(\d+)\.webp$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num >= state.next_wallpaper_number) {
        state.next_wallpaper_number = num + 1;
      }
    }
  }

  if (bootstrapCount === 0) {
    success(`State is in sync`);
  } else {
    success(
      `Bootstrapped ${c.bold}${bootstrapCount}${c.reset} key(s) from disk`
    );
  }

  return bootstrapCount;
}

// ── SYNC MODE ───────────────────────────────────────────────────────
// Full sync: reverse cleanup + convert + integrity + state rebuild
// Run at the START of each iteration, BEFORE generating new images.
async function runSync() {
  console.log();
  info(
    `${c.bold}${c.magenta}Wallpaper Converter${c.reset} ${c.dim}(--sync)${c.reset}`
  );
  divider();

  ensureDirs();
  info(`Directories verified`);

  const state = readState();
  const keys = getKeys();
  state.total_keys = keys.length;

  const pngFiles = listFiles(sourceDir, ["png"]);
  const jpgFiles = listFiles(sourceDir, ["jpg", "jpeg"]);
  const existingWebps = new Set(listFiles(webpDir, ["webp"]));

  info(
    `Keys: ${c.bold}${keys.length}${c.reset}  Sources: ${c.bold}${pngFiles.length}${c.reset} PNG, ${c.bold}${jpgFiles.length}${c.reset} JPG  WebP: ${c.bold}${existingWebps.size}${c.reset}`
  );

  if (pngFiles.length === 0 && jpgFiles.length === 0) {
    warn(`${c.bold}No source images found.${c.reset} Nothing to convert.`);
    info(`  Source dir: ${c.dim}${sourceDir}${c.reset}`);
    info(
      `  ${c.dim}Place wallpaper_*.png or wallpaper_*.jpg files in the above directory.${c.reset}`
    );
  }

  if (keys.length === 0) {
    warn(`${c.bold}No key images found.${c.reset}`);
    info(`  Keys dir: ${c.dim}${keysDir}${c.reset}`);
  }

  // ── Reverse cleanup (SYNC ONLY) ────────────────────────────────
  // If a WebP was deleted, delete the corresponding source so nano banana
  // regenerates from scratch on next prompt run.
  divider();
  info(
    `${c.bold}Reverse cleanup${c.reset} ${c.dim}(deleted WebP -> delete source)${c.reset}`
  );

  let cleanedSources = 0;
  let cleanedStateEntries = 0;

  const allSources: string[] = [...pngFiles, ...jpgFiles];

  for (const file of allSources) {
    const expectedWebp = webpName(file);
    if (!existingWebps.has(expectedWebp)) {
      const srcPath = path.join(sourceDir, file);
      fs.unlinkSync(srcPath);
      info(
        `  ${c.red}Deleted${c.reset} ${c.dim}${file}${c.reset} ${c.dim}(WebP missing — will regenerate)${c.reset}`
      );
      cleanedSources++;
    }
  }

  // Remove state entries for keys whose WebP no longer exists
  if (keys.length > 0) {
    const generatedBefore = state.generated.length;
    state.generated = state.generated.filter((keyFile) => {
      const num = keyToWallpaperNum(keyFile);
      if (num === 0) return false;
      const wName = `wallpaper_${num}.webp`;
      if (!existingWebps.has(wName)) {
        info(
          `  ${c.yellow}Untracked${c.reset} ${c.dim}${keyFile}${c.reset} ${c.dim}(${wName} missing)${c.reset}`
        );
        return false;
      }
      return true;
    });
    cleanedStateEntries = generatedBefore - state.generated.length;

    // Also clean failed entries for missing webps so they get retried
    state.failed = state.failed.filter((keyFile) => {
      const num = keyToWallpaperNum(keyFile);
      if (num === 0) return true;
      const wName = `wallpaper_${num}.webp`;
      return existingWebps.has(wName);
    });
  }

  if (cleanedSources === 0 && cleanedStateEntries === 0) {
    success(`No stale files found`);
  } else {
    if (cleanedSources > 0)
      warn(`Deleted ${c.bold}${cleanedSources}${c.reset} stale source file(s)`);
    if (cleanedStateEntries > 0)
      warn(
        `Removed ${c.bold}${cleanedStateEntries}${c.reset} state entry/entries ${c.dim}(will regenerate)${c.reset}`
      );
  }

  // ── Convert remaining sources ─────────────────────────────────
  const {converted, skipped, failed} = await convertSources();

  // ── Integrity check ───────────────────────────────────────────
  const integrity = integrityCheck();

  // ── State sync ────────────────────────────────────────────────
  const bootstrapCount = syncState(state);

  // Write final state
  writeState(state);

  // ── Summary ───────────────────────────────────────────────────
  printSummary(state, {
    converted,
    skipped,
    failed,
    cleanedSources,
    cleanedStateEntries,
    bootstrapCount,
    integrityFailed: integrity.failed,
    orphans: integrity.orphans.length,
  });
}

// ── UPDATE MODE ─────────────────────────────────────────────────────
// Convert only: just convert new sources to WebP + update state.
// NO reverse cleanup. Run AFTER generating a new wallpaper image.
async function runUpdate() {
  console.log();
  info(
    `${c.bold}${c.magenta}Wallpaper Converter${c.reset} ${c.dim}(--update)${c.reset}`
  );
  divider();

  ensureDirs();
  info(`Directories verified`);

  const state = readState();

  const pngFiles = listFiles(sourceDir, ["png"]);
  const jpgFiles = listFiles(sourceDir, ["jpg", "jpeg"]);

  info(
    `Sources: ${c.bold}${pngFiles.length}${c.reset} PNG, ${c.bold}${jpgFiles.length}${c.reset} JPG`
  );

  if (pngFiles.length === 0 && jpgFiles.length === 0) {
    warn(`${c.bold}No source images found.${c.reset} Nothing to convert.`);
  }

  // ── Convert sources (NO cleanup) ──────────────────────────────
  const {converted, skipped, failed} = await convertSources();

  // ── Integrity check ───────────────────────────────────────────
  const integrity = integrityCheck();

  // ── State sync ────────────────────────────────────────────────
  const bootstrapCount = syncState(state);

  // Write final state
  writeState(state);

  // ── Summary ───────────────────────────────────────────────────
  printSummary(state, {
    converted,
    skipped,
    failed,
    cleanedSources: 0,
    cleanedStateEntries: 0,
    bootstrapCount,
    integrityFailed: integrity.failed,
    orphans: integrity.orphans.length,
  });
}

// ── Summary (shared) ────────────────────────────────────────────────
interface SummaryStats {
  converted: number;
  skipped: number;
  failed: number;
  cleanedSources: number;
  cleanedStateEntries: number;
  bootstrapCount: number;
  integrityFailed: number;
  orphans: number;
}

function printSummary(state: ProgressState, s: SummaryStats) {
  const keys = getKeys();
  const pngFiles = listFiles(sourceDir, ["png"]);
  const jpgFiles = listFiles(sourceDir, ["jpg", "jpeg"]);
  const totalSources = pngFiles.length + jpgFiles.length;
  const totalWebp = listFiles(webpDir, ["webp"]).length;

  divider();
  info(`${c.bold}${c.magenta}Summary${c.reset}`);
  console.log();

  info(`  Keys         ${c.bold}${keys.length}${c.reset}`);
  info(
    `  Sources      ${c.bold}${totalSources}${c.reset} ${c.dim}(${pngFiles.length} PNG, ${jpgFiles.length} JPG)${c.reset}`
  );
  info(`  WebP output  ${c.bold}${totalWebp}${c.reset}`);

  if (keys.length > 0) {
    info(
      `  Completed    ${c.bold}${state.completed.length}${c.reset}/${c.bold}${keys.length}${c.reset} keys`
    );
    info(`  Next number  ${c.bold}${state.next_wallpaper_number}${c.reset}`);
    if (state.failed.length > 0) {
      info(`  Failed       ${c.bold}${c.red}${state.failed.length}${c.reset}`);
    }
  }

  console.log();

  if (s.converted > 0)
    success(`Converted    ${c.bold}${s.converted}${c.reset}`);
  if (s.skipped > 0)
    info(`  ${c.dim}Skipped      ${s.skipped} (already exist)${c.reset}`);
  if (s.failed > 0) fail(`Failed       ${c.bold}${s.failed}${c.reset}`);
  if (s.cleanedSources > 0)
    info(
      `  ${c.dim}Cleaned      ${s.cleanedSources} stale source(s)${c.reset}`
    );
  if (s.cleanedStateEntries > 0)
    info(
      `  ${c.dim}Untracked    ${s.cleanedStateEntries} state entry/entries${c.reset}`
    );
  if (s.bootstrapCount > 0)
    info(`  ${c.dim}Bootstrapped ${s.bootstrapCount} key(s)${c.reset}`);

  console.log();

  if (s.failed > 0 || s.integrityFailed > 0) {
    fail(`${c.bgRed}${c.white}${c.bold} ISSUES FOUND ${c.reset}`);
    process.exit(1);
  } else {
    success(`${c.bgGreen}${c.white}${c.bold} ALL GOOD ${c.reset}`);
  }

  console.log();
}

// ── PENDING MODE ────────────────────────────────────────────────────
// List keys that need wallpaper generation with their correct numbers.
// The AI reads this output to know exactly what to generate.
function runPending() {
  ensureDirs();

  const state = readState();
  const keys = getKeys();

  if (keys.length === 0) {
    console.log("PENDING_COUNT=0");
    console.log("NO_KEYS_FOUND");
    return;
  }

  const generatedSet = new Set(state.generated);
  const failedSet = new Set(state.failed);

  const pending: {key: string; wallpaperNum: number}[] = [];

  for (const keyFile of keys) {
    if (generatedSet.has(keyFile) || failedSet.has(keyFile)) continue;
    const num = keyToWallpaperNum(keyFile);
    pending.push({key: keyFile, wallpaperNum: num});
  }

  // Output machine-readable format for the AI
  console.log(`PENDING_COUNT=${pending.length}`);
  console.log(`TOTAL_KEYS=${keys.length}`);
  console.log(`GENERATED=${state.generated.length}`);
  console.log(`FAILED=${state.failed.length}`);
  console.log(`COMPLETED=${state.completed.length}`);

  if (pending.length === 0) {
    console.log("ALL_KEYS_PROCESSED");
    return;
  }

  console.log("---");
  console.log("KEY_FILE|WALLPAPER_NUM|OUTPUT_PATH");
  for (const p of pending) {
    console.log(
      `${p.key}|${p.wallpaperNum}|static-source/images/wallpapers/wallpaper_${p.wallpaperNum}.jpg`
    );
  }
}

// ── Entry ───────────────────────────────────────────────────────────
const mode = parseMode();

const runners: Record<Mode, () => Promise<void> | void> = {
  sync: runSync,
  update: runUpdate,
  pending: runPending,
};

Promise.resolve(runners[mode]()).catch((err) => {
  fail(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
