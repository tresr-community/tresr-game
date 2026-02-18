#!/usr/bin/env bun

/**
 * Video Processor — convert MP4 videos to animated WebP.
 *
 * Modes:
 *   --convert  Convert MP4 files to animated WebP via ffmpeg
 *   --help     Show this help message
 *
 * Usage:
 *   bun run bin/videos.ts --convert
 *   bun run bin/videos.ts --help
 *
 * Drop MP4 files into:
 *   assets-source/videos/
 *
 * They will be converted to animated WebP and placed in:
 *   public/videos/
 *
 * Source files are left untouched.
 * Audio is stripped during conversion.
 */

import * as fs from "fs";
import * as path from "path";
import {spawn} from "child_process";
import {promisify} from "util";

const readdir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);

// ── Paths ───────────────────────────────────────────────────────────
const SOURCE_DIR = "assets-source/videos/";
const OUTPUT_DIR = "public/assets/videos/";

const SOURCE_EXT = ".mp4";
const OUTPUT_EXT = ".webp";

// ── WebP Config ─────────────────────────────────────────────────────
// Quality 50 gives a good balance of size and fidelity for UI elements.
// FPS 24 is smooth enough for a loading spinner without bloating frames.
const WEBP_QUALITY = 50;
const WEBP_FPS = 24;
const WEBP_LOOP = 0; // 0 = infinite loop

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

const TAG = `${c.bold}${c.cyan}[Videos]${c.reset}`;
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function convertToWebp(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-i",
      inputPath,
      // Strip audio
      "-an",
      // Video filter: set framerate and enable looping
      "-vf",
      `fps=${WEBP_FPS}`,
      // WebP output settings
      "-vcodec",
      "libwebp",
      "-quality",
      String(WEBP_QUALITY),
      "-loop",
      String(WEBP_LOOP),
      // Lossless 0 = lossy (we want lossy for smaller size)
      "-lossless",
      "0",
      // Compression level (0-6, higher = slower but smaller)
      "-compression_level",
      "6",
      // Overwrite without asking
      "-y",
      outputPath,
    ];

    const ffmpeg = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    ffmpeg.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `FFmpeg exited with code ${code} for ${inputPath}\n${stderr}`
          )
        );
      }
    });

    ffmpeg.on("error", (error) => reject(error));
  });
}

// ── Convert Mode ────────────────────────────────────────────────────
async function runConvert(): Promise<void> {
  console.log();
  info(
    `${c.bold}${c.magenta}Video Converter${c.reset} ${c.dim}(--convert)${c.reset}`
  );
  info(`${c.dim}${"─".repeat(50)}${c.reset}`);
  info(
    `Settings: quality=${WEBP_QUALITY}, fps=${WEBP_FPS}, loop=${WEBP_LOOP === 0 ? "infinite" : WEBP_LOOP}`
  );

  await ensureDirectory(SOURCE_DIR);
  await ensureDirectory(OUTPUT_DIR);

  let allFiles: string[];
  try {
    allFiles = await readdir(SOURCE_DIR);
  } catch {
    fail(`Cannot read source directory: ${SOURCE_DIR}`);
    process.exit(1);
  }

  const sourceFiles = allFiles.filter((file) =>
    file.toLowerCase().endsWith(SOURCE_EXT)
  );

  if (sourceFiles.length === 0) {
    warn("No MP4 files found to convert.");
    info(`  Drop MP4 files into: ${c.dim}${SOURCE_DIR}${c.reset}`);
    return;
  }

  info(`Found ${c.bold}${sourceFiles.length}${c.reset} MP4 file(s)`);
  info(`${c.dim}${"─".repeat(50)}${c.reset}`);

  let converted = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of sourceFiles) {
    const inputPath = path.join(SOURCE_DIR, file);
    const outputFile = file.slice(0, -SOURCE_EXT.length) + OUTPUT_EXT;
    const outputPath = path.join(OUTPUT_DIR, outputFile);

    // Check if output already exists and is newer than source
    if (fs.existsSync(outputPath)) {
      const srcStat = await stat(inputPath);
      const dstStat = await stat(outputPath);
      if (dstStat.mtimeMs >= srcStat.mtimeMs) {
        info(`${c.dim}Skip (up-to-date): ${file}${c.reset}`);
        skipped++;
        continue;
      }
    }

    const srcSize = (await stat(inputPath)).size;
    info(`Converting: ${file} ${c.dim}(${formatSize(srcSize)})${c.reset}`);

    try {
      await convertToWebp(inputPath, outputPath);
      const dstSize = (await stat(outputPath)).size;
      const ratio = ((1 - dstSize / srcSize) * 100).toFixed(1);
      ok(
        `${file} ${c.dim}→${c.reset} ${outputFile} ${c.dim}(${formatSize(dstSize)}, ${ratio}% smaller)${c.reset}`
      );
      converted++;
    } catch (error) {
      fail(`${file}: ${(error as Error).message}`);
      failed++;
    }
  }

  // Summary
  info(`${c.dim}${"─".repeat(50)}${c.reset}`);
  ok(
    `Done: ${c.bold}${converted}${c.reset} converted, ${c.bold}${skipped}${c.reset} skipped${failed > 0 ? `, ${c.red}${failed} failed${c.reset}` : ""}`
  );

  if (failed > 0) process.exit(1);
}

// ── Help ────────────────────────────────────────────────────────────
function showHelp(): void {
  console.log(`
${c.bold}${c.magenta}Video Processor${c.reset}

${c.bold}Usage:${c.reset}
  bun run bin/videos.ts ${c.bold}--convert${c.reset}  Convert MP4 to animated WebP via ffmpeg
  bun run bin/videos.ts ${c.bold}--help${c.reset}     Show this help message

${c.bold}Details:${c.reset}
  Drop MP4 files into:
    ${SOURCE_DIR}

  They will be converted to animated WebP and placed in:
    ${OUTPUT_DIR}

  ${c.bold}Source files are left untouched.${c.reset}
  Audio is stripped during conversion.
  Existing output files are skipped if up-to-date (mtime comparison).
  Uses ffmpeg with libwebp codec, quality ${WEBP_QUALITY}, ${WEBP_FPS} fps, infinite loop.
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
