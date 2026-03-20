#!/usr/bin/env bun

/**
 * Video Processor — convert MP4 videos to WebM format.
 *
 * Modes:
 *   --convert              Convert all MP4 files to WebM via ffmpeg
 *   --convert-single NAME  Convert a single MP4 file (without extension)
 *   --help                 Show this help message
 *
 * Usage:
 *   bun run bin/videos.ts --convert
 *   bun run bin/videos.ts --convert-single filename
 *   bun run bin/videos.ts --help
 *
 * Drop MP4 files into:
 *   static-source/videos/
 *
 * They will be converted to WebM and placed in:
 *   static/assets/videos/
 *
 * Source files are left untouched.
 * Audio is preserved during conversion.
 */

import * as fs from "fs";
import * as path from "path";
import {spawn} from "child_process";
import {promisify} from "util";

const readdir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);

// ── Paths ───────────────────────────────────────────────────────────
const SOURCE_DIR = "static-source/videos/";
const OUTPUT_DIR = "static/assets/videos/";

const SOURCE_EXT = ".mp4";
const OUTPUT_EXT = ".webm";

// ── WebM Config ──────────────────────────────────────────────────────
// VP8/VP9 codec with Vorbis audio preserves both video and audio.
// Bitrate: 1000k provides good quality while keeping file size reasonable.
const WEBM_BITRATE = "1000k";
const WEBM_AUDIO_BITRATE = "128k";

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

function convertToWebm(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-i",
      inputPath,
      // Video codec: VP8 (or VP9 for better quality but slower)
      "-c:v",
      "libvpx",
      // Video bitrate
      "-b:v",
      WEBM_BITRATE,
      // Audio codec: Vorbis
      "-c:a",
      "libvorbis",
      // Audio bitrate
      "-b:a",
      WEBM_AUDIO_BITRATE,
      // Quality level (0-63, lower is better)
      "-crf",
      "10",
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
  info(`Settings: bitrate=${WEBM_BITRATE}, audio=${WEBM_AUDIO_BITRATE}`);

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
      await convertToWebm(inputPath, outputPath);
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

// ── Convert Single Mode ─────────────────────────────────────────────
async function runConvertSingle(videoName: string): Promise<void> {
  console.log();
  info(
    `${c.bold}${c.magenta}Video Converter${c.reset} ${c.dim}(--convert-single)${c.reset}`
  );
  info(`${c.dim}${"─".repeat(50)}${c.reset}`);
  info(`Settings: bitrate=${WEBM_BITRATE}, audio=${WEBM_AUDIO_BITRATE}`);

  await ensureDirectory(SOURCE_DIR);
  await ensureDirectory(OUTPUT_DIR);

  const inputFile = videoName + SOURCE_EXT;
  const inputPath = path.join(SOURCE_DIR, inputFile);

  // Check if file exists
  if (!fs.existsSync(inputPath)) {
    fail(`Video file not found: ${c.bold}${inputFile}${c.reset}`);
    info(`  Looking in: ${c.dim}${SOURCE_DIR}${c.reset}`);
    info(`  ${c.dim}Tip: Enter the filename without the extension${c.reset}`);
    process.exit(1);
  }

  const outputFile = videoName + OUTPUT_EXT;
  const outputPath = path.join(OUTPUT_DIR, outputFile);

  info(`${c.dim}${"─".repeat(50)}${c.reset}`);

  const srcSize = (await stat(inputPath)).size;
  info(`Converting: ${inputFile} ${c.dim}(${formatSize(srcSize)})${c.reset}`);

  try {
    await convertToWebm(inputPath, outputPath);
    const dstSize = (await stat(outputPath)).size;
    const ratio = ((1 - dstSize / srcSize) * 100).toFixed(1);
    ok(
      `${inputFile} ${c.dim}→${c.reset} ${outputFile} ${c.dim}(${formatSize(dstSize)}, ${ratio}% smaller)${c.reset}`
    );

    // Summary
    info(`${c.dim}${"─".repeat(50)}${c.reset}`);
    ok(`Done: ${c.bold}1${c.reset} video converted`);
  } catch (error) {
    fail(`${inputFile}: ${(error as Error).message}`);
    process.exit(1);
  }
}

// ── Help ────────────────────────────────────────────────────────────
function showHelp(): void {
  console.log(`
${c.bold}${c.magenta}Video Processor${c.reset}

${c.bold}Usage:${c.reset}
  bun run bin/videos.ts ${c.bold}--convert${c.reset}              Convert all MP4 files to WebM
  bun run bin/videos.ts ${c.bold}--convert-single${c.reset} NAME  Convert a single MP4 file (name without extension)
  bun run bin/videos.ts ${c.bold}--help${c.reset}                 Show this help message

${c.bold}Examples:${c.reset}
  bun run bin/videos.ts --convert
  bun run bin/videos.ts --convert-single test-vid

${c.bold}Details:${c.reset}
  Drop MP4 files into:
    ${SOURCE_DIR}

  They will be converted to WebM and placed in:
    ${OUTPUT_DIR}

  ${c.bold}Source files are left untouched.${c.reset}
  Audio is preserved during conversion.
  Existing output files are skipped if up-to-date (mtime comparison).
  Uses ffmpeg with VP8 video codec and Vorbis audio codec.
  Requires ffmpeg to be available in your devenv shell.
`);
}

// ── CLI ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes("--convert")) {
  await runConvert();
} else if (args.includes("--convert-single")) {
  const index = args.indexOf("--convert-single");
  const videoName = args[index + 1];

  if (!videoName) {
    fail("Missing video name argument for --convert-single");
    info(
      `  Usage: bun run bin/videos.ts --convert-single ${c.dim}<name>${c.reset}`
    );
    info(`  Example: bun run bin/videos.ts --convert-single test-vid`);
    process.exit(1);
  }

  await runConvertSingle(videoName);
} else if (args.includes("--help") || args.includes("-h")) {
  showHelp();
} else {
  showHelp();
}
