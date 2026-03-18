#!/usr/bin/env bun

/**
 * Audio Processor — unified audio processing tool.
 *
 * Modes:
 *   --convert  Convert MP3 and OPUS files to WebM via ffmpeg
 *   --help     Show this help message
 *
 * Usage:
 *   bun run bin/audio.ts --convert
 *   bun run bin/audio.ts --help
 *
 * Drop MP3/OPUS files into:
 *   static-source/audio/music/
 *   static-source/audio/narration/
 *   static-source/audio/sfx/
 *
 * They will be converted to WebM and placed in:
 *   static/assets/audio/music/
 *   static/assets/audio/narration/
 *   static/assets/audio/sfx/
 *
 * Source files are deleted after successful conversion.
 */

import * as fs from "fs";
import * as path from "path";
import {spawn} from "child_process";
import {promisify} from "util";

const readdir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);

// ── Paths ───────────────────────────────────────────────────────────
const SOURCE_BASE_DIR = "static-source/audio/";
const OUTPUT_BASE_DIR = "static/assets/audio/";

const CATEGORIES = ["music", "narration", "sfx"] as const;
const SOURCE_EXTS = [".mp3", ".opus", ".wav"] as const;
const WEBM_EXT = ".webm";

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
};

const TAG = `${c.bold}${c.cyan}[Audio]${c.reset}`;
const info = (msg: string) => console.log(`${TAG} ${msg}`);
const ok = (msg: string) => console.log(`${TAG} ${c.green}✔${c.reset} ${msg}`);
const warn = (msg: string) =>
  console.warn(`${TAG} ${c.yellow}⚠${c.reset} ${msg}`);
const fail = (msg: string) =>
  console.error(`${TAG} ${c.red}✖${c.reset} ${msg}`);

// ── Helpers ─────────────────────────────────────────────────────────
async function ensureDirectory(dir: string): Promise<void> {
  if (!fs.existsSync(dir)) {
    await mkdir(dir, {recursive: true});
    info(`Created directory: ${c.dim}${dir}${c.reset}`);
  }
}

function convertToWebm(
  inputPath: string,
  outputPath: string,
  codec: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["-i", inputPath, "-c:a", codec, "-y", outputPath];
    const ffmpeg = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "ignore"],
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code} for ${inputPath}`));
      }
    });

    ffmpeg.on("error", (error) => reject(error));
  });
}

async function processCategory(
  category: string
): Promise<{converted: number; failed: number; deleted: number}> {
  const sourceDir = path.join(SOURCE_BASE_DIR, category);
  const destDir = path.join(OUTPUT_BASE_DIR, category);
  let converted = 0;
  let failed = 0;
  let deleted = 0;

  await ensureDirectory(sourceDir);
  await ensureDirectory(destDir);

  let allFiles: string[];
  try {
    allFiles = await readdir(sourceDir);
  } catch {
    return {converted, failed, deleted};
  }

  const sourceFiles = allFiles.filter((file) =>
    SOURCE_EXTS.some((ext) => file.toLowerCase().endsWith(ext))
  );

  if (sourceFiles.length === 0) return {converted, failed, deleted};

  info(
    `${c.bold}${category.toUpperCase()}${c.reset} — ${sourceFiles.length} file(s)`
  );

  for (const file of sourceFiles) {
    const inputPath = path.join(sourceDir, file);
    const ext = path.extname(file).toLowerCase();
    const outputFile = file.slice(0, -ext.length) + WEBM_EXT;
    const outputPath = path.join(destDir, outputFile);
    const codec = ext === ".opus" ? "copy" : "libopus";

    try {
      await convertToWebm(inputPath, outputPath, codec);
      ok(`${file} ${c.dim}→${c.reset} ${outputFile}`);
      converted++;

      // Delete source after successful conversion
      await unlink(inputPath);
      info(`  ${c.dim}Deleted source: ${file}${c.reset}`);
      deleted++;
    } catch (error) {
      fail(`${file}: ${(error as Error).message}`);
      failed++;
    }
  }

  return {converted, failed, deleted};
}

// ── Convert Mode ────────────────────────────────────────────────────
async function runConvert(): Promise<void> {
  console.log();
  info(
    `${c.bold}${c.magenta}Audio Converter${c.reset} ${c.dim}(--convert)${c.reset}`
  );
  info(`${c.dim}${"─".repeat(50)}${c.reset}`);

  let totalConverted = 0;
  let totalFailed = 0;
  let totalDeleted = 0;

  for (const category of CATEGORIES) {
    const result = await processCategory(category);
    totalConverted += result.converted;
    totalFailed += result.failed;
    totalDeleted += result.deleted;
  }

  // Summary
  info(`${c.dim}${"─".repeat(50)}${c.reset}`);
  if (totalConverted === 0 && totalFailed === 0) {
    warn("No audio files found to convert.");
    info(
      `  Drop MP3/OPUS files into: ${c.dim}${SOURCE_BASE_DIR}{${CATEGORIES.join(",")}}/${c.reset}`
    );
  } else {
    ok(
      `Done: ${c.bold}${totalConverted}${c.reset} converted, ${c.bold}${totalDeleted}${c.reset} sources deleted${totalFailed > 0 ? `, ${c.red}${totalFailed} failed${c.reset}` : ""}`
    );
  }

  if (totalFailed > 0) process.exit(1);
}

// ── Help ────────────────────────────────────────────────────────────
function showHelp(): void {
  console.log(`
${c.bold}${c.magenta}Audio Processor${c.reset}

${c.bold}Usage:${c.reset}
  bun run bin/audio.ts ${c.bold}--convert${c.reset}  Convert MP3/OPUS to WebM via ffmpeg
  bun run bin/audio.ts ${c.bold}--help${c.reset}     Show this help message

${c.bold}Details:${c.reset}
  Drop MP3, OPUS, or WAV files into:
    static-source/audio/music/
    static-source/audio/narration/
    static-source/audio/sfx/

  They will be converted to WebM and placed in:
    static/assets/audio/music/
    static/assets/audio/narration/
    static/assets/audio/sfx/

  Source files are deleted after successful conversion.
  Existing destination files are overwritten if the name matches.
  Uses ffmpeg with libopus codec for MP3/WAV sources and copy for OPUS sources.
  Requires ffmpeg to be available in your devenv shell.
`);
}

// ── CLI ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes("--convert")) {
  await runConvert();
} else if (args.includes("--help") || args.includes("-h")) {
  showHelp();
} else {
  showHelp();
}
