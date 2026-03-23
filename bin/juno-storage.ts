/**
 * juno-storage.ts — Standalone storage deploy / prune / clear for Juno satellites.
 *
 * Executed via `juno run`:
 *   juno run --src bin/juno-storage.ts --mode development -- deploy
 *   juno run --src bin/juno-storage.ts --mode development -- prune
 *   juno run --src bin/juno-storage.ts --mode development -- clear
 *   juno run --src bin/juno-storage.ts --mode development -- clear --collection audio --fullPath /audio/bgm.webm
 *
 * The CLI provides authenticated context (identity, satelliteId, container).
 */

import {defineRun, type OnRunContext} from "@junobuild/config";
import {
  deleteAsset,
  deleteFilteredAssets,
  listAssets,
  uploadBlob,
} from "@junobuild/core";
import type {Asset} from "@junobuild/storage";
import crypto from "node:crypto";
import {existsSync, lstatSync, readdirSync, readFileSync} from "node:fs";
import {basename, extname, join, relative, resolve} from "node:path";

// Inline MIME lookup to avoid @types/mime-types dependency.
// Covers all file types found in storage/ (audio, images, videos).
const MIME_MAP: Record<string, string> = {
  ".webm": "audio/webm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

function mimeLookup(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] ?? "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeployMapping {
  collection: string;
  source: string;
}

interface SatelliteParams {
  satelliteId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  identity: any; // Identity from OnRunContext — use `any` to avoid cross-package private type mismatch
  container?: string;
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

/**
 * Read deploy mappings from config/config-server.json.
 * Only storage collections with a `source` field are deployable.
 */
function loadDeployMappings(): DeployMapping[] {
  const configPath = resolve(process.cwd(), "config", "config-server.json");
  const raw = readFileSync(configPath, "utf8");
  const config = JSON.parse(raw);
  const storageCollections: Array<{
    collection: string;
    source?: string;
  }> = config?.juno?.collections?.storage ?? [];

  return storageCollections
    .filter(
      (c): c is {collection: string; source: string} =>
        typeof c.source === "string" && c.source.length > 0
    )
    .map(({collection, source}) => ({collection, source}));
}

// ---------------------------------------------------------------------------
// Satellite options helper
// ---------------------------------------------------------------------------

function satelliteOptions(satellite: SatelliteParams) {
  return {
    satelliteId: satellite.satelliteId,
    identity: satellite.identity,
    ...(satellite.container && {container: satellite.container}),
  };
}

// ---------------------------------------------------------------------------
// Asset listing (paginated)
// ---------------------------------------------------------------------------

const LIST_PAGE_SIZE = 500;

async function listAllAssets(
  satellite: SatelliteParams,
  collection: string,
  startAfter?: string
): Promise<Asset[]> {
  const {items, items_page, matches_pages} = await listAssets({
    collection,
    satellite: satelliteOptions(satellite),
    filter: {
      order: {desc: true, field: "keys"},
      paginate: {startAfter, limit: LIST_PAGE_SIZE},
    },
  });

  if ((items_page ?? 0n) < (matches_pages ?? 0n)) {
    const last = items[items.length - 1];
    const nextItems = await listAllAssets(
      satellite,
      collection,
      last?.fullPath
    );
    return [...items, ...nextItems];
  }

  return items;
}

// ---------------------------------------------------------------------------
// Local file helpers
// ---------------------------------------------------------------------------

function walkDir(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, {withFileTypes: true});
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function sha256(filePath: string): string {
  const buffer = readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("base64");
}

function collectLocalFullPaths(
  sourceDir: string,
  collection: string
): Set<string> {
  const paths = new Set<string>();
  if (!existsSync(sourceDir)) return paths;

  const files = walkDir(sourceDir);
  for (const file of files) {
    const rel = relative(sourceDir, file).replace(/\\/g, "/");
    paths.add(`/${collection}/${rel}`);
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

async function deployStorage(
  satellite: SatelliteParams,
  mappings: DeployMapping[]
): Promise<void> {
  for (const mapping of mappings) {
    await deployCollection(satellite, mapping);
  }
  console.log("");
  console.log("✔ Storage deploy complete.");
}

async function deployCollection(
  satellite: SatelliteParams,
  {source, collection}: DeployMapping
): Promise<void> {
  console.log(`\n📦 ${source} → collection "${collection}"`);

  // Validate source directory
  try {
    lstatSync(source);
  } catch {
    console.error(
      `Cannot proceed with storage deploy. Source directory "${source}" does not exist.`
    );
    process.exit(1);
  }

  // List remote assets
  const remoteAssets = await listAllAssets(satellite, collection);

  // Build a map of remote fullPath → sha256 (identity encoding)
  const remoteSha256 = new Map<string, string>();
  for (const asset of remoteAssets) {
    const identitySha = asset.encodings?.identity?.sha256;
    if (identitySha) {
      remoteSha256.set(asset.fullPath, identitySha);
    }
  }

  // Walk local files
  const sourceAbsPath = resolve(process.cwd(), source);
  const localFiles = walkDir(sourceAbsPath);

  let uploaded = 0;
  let skipped = 0;

  for (const localFile of localFiles) {
    const rel = relative(sourceAbsPath, localFile).replace(/\\/g, "/");
    const fullPath = `/${collection}/${rel}`;

    // Immutability check: compare SHA-256
    const localSha = sha256(localFile);
    const existingSha = remoteSha256.get(fullPath);

    if (existingSha === localSha) {
      skipped++;
      continue;
    }

    // Determine MIME type
    const mimeType = mimeLookup(localFile);

    // Read file data
    const buffer = readFileSync(localFile);
    const data = new Blob([buffer], {type: mimeType});

    const filename = basename(localFile);

    console.log(`  ↑ ${fullPath} (${formatBytes(buffer.length)})`);

    await uploadBlob({
      satellite: satelliteOptions(satellite),
      filename,
      fullPath,
      data,
      collection,
      headers: [["Content-Type", mimeType]],
    });

    uploaded++;
  }

  if (uploaded === 0 && skipped > 0) {
    console.log(
      `  ⚠️  No file changes detected (${skipped} up-to-date). Upload skipped.`
    );
  } else if (uploaded > 0) {
    console.log(
      `  ✔ ${uploaded} file${uploaded > 1 ? "s" : ""} uploaded, ${skipped} skipped.`
    );
  } else {
    console.log("  ⚠️  No files found in source directory.");
  }
}

// ---------------------------------------------------------------------------
// Prune
// ---------------------------------------------------------------------------

async function pruneStorage(
  satellite: SatelliteParams,
  mappings: DeployMapping[]
): Promise<void> {
  let totalPruned = 0;

  for (const {source, collection} of mappings) {
    const remoteAssets = await listAllAssets(satellite, collection);
    if (remoteAssets.length === 0) continue;

    const sourceAbsPath = resolve(process.cwd(), source);
    const localPaths = collectLocalFullPaths(sourceAbsPath, collection);
    const stale = remoteAssets.filter((a) => !localPaths.has(a.fullPath));

    if (stale.length === 0) continue;

    console.log(
      `Pruning ${stale.length} stale storage asset${stale.length > 1 ? "s" : ""} from "${collection}"...`
    );

    for (const asset of stale) {
      console.log(`  ✗ ${asset.fullPath}`);
      await deleteAsset({
        satellite: satelliteOptions(satellite),
        collection,
        fullPath: asset.fullPath,
      });
    }

    totalPruned += stale.length;
    console.log(
      `✔ Pruned ${stale.length} storage asset${stale.length > 1 ? "s" : ""} from "${collection}".`
    );
  }

  console.log("");
  if (totalPruned === 0) {
    console.log("✔ No stale storage assets found. Nothing to prune.");
  } else {
    console.log(
      `✔ Pruned ${totalPruned} stale storage asset${totalPruned > 1 ? "s" : ""}.`
    );
  }
}

// ---------------------------------------------------------------------------
// Clear
// ---------------------------------------------------------------------------

async function clearStorage(
  satellite: SatelliteParams,
  mappings: DeployMapping[],
  specificCollection?: string,
  specificFullPath?: string
): Promise<void> {
  // Single-file mode
  if (specificCollection && specificFullPath) {
    const cleanPath = specificFullPath.replace(/\\/g, "/");
    const normalizedPath = cleanPath.startsWith("/")
      ? cleanPath
      : `/${cleanPath}`;

    console.log(
      `Clearing ${normalizedPath} from collection "${specificCollection}"...`
    );

    await deleteAsset({
      satellite: satelliteOptions(satellite),
      collection: specificCollection,
      fullPath: normalizedPath,
    });

    console.log(`✔ ${normalizedPath} cleared from "${specificCollection}".`);
    return;
  }

  // Bulk clear all deploy-mapped collections
  for (const {collection} of mappings) {
    console.log(`Clearing collection "${collection}"...`);

    await deleteFilteredAssets({
      satellite: satelliteOptions(satellite),
      collection,
    });

    console.log(`✔ Collection "${collection}" cleared.`);
  }

  console.log("");
  console.log("✔ All storage collections cleared.");
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): {
  subcommand: string;
  collection?: string;
  fullPath?: string;
} {
  // process.argv after `--` in `juno run --src ... -- deploy`
  const args = process.argv;
  const dashDashIdx = args.indexOf("--");
  const tail = dashDashIdx >= 0 ? args.slice(dashDashIdx + 1) : [];

  const subcommand = tail[0] ?? "help";

  // Parse --collection and --fullPath from remaining args
  let collection: string | undefined;
  let fullPath: string | undefined;

  for (let i = 1; i < tail.length; i++) {
    if ((tail[i] === "--collection" || tail[i] === "-c") && tail[i + 1]) {
      collection = tail[++i];
    } else if (
      (tail[i] === "--fullPath" ||
        tail[i] === "--fullpath" ||
        tail[i] === "-f") &&
      tail[i + 1]
    ) {
      fullPath = tail[++i];
    }
  }

  return {subcommand, collection, fullPath};
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`
juno-storage — Deploy and manage assets in Juno satellite storage collections.

Usage:
  juno run --src bin/juno-storage.ts --mode <mode> -- <subcommand> [options]

Subcommands:
  deploy              Deploy files to satellite storage collections.
  prune               Remove stale remote assets not in local source.
  clear               Remove all assets from storage collections.

Clear options:
  --collection, -c    Target a specific collection.
  --fullPath, -f      Target a specific asset path (requires --collection).

Examples:
  juno run --src bin/juno-storage.ts --mode development -- deploy
  juno run --src bin/juno-storage.ts --mode development -- prune
  juno run --src bin/juno-storage.ts --mode development -- clear
  juno run --src bin/juno-storage.ts --mode development -- clear -c audio -f /audio/bgm.webm
`);
}

// ---------------------------------------------------------------------------
// Entry point — exported for juno run
// ---------------------------------------------------------------------------

export const onRun = defineRun({
  run: async (context: OnRunContext) => {
    const {subcommand, collection, fullPath} = parseArgs();

    const satellite: SatelliteParams = {
      satelliteId: context.satelliteId.toText(),
      identity: context.identity,
      container: context.container,
    };

    const mappings = loadDeployMappings();

    if (mappings.length === 0 && subcommand !== "help") {
      console.log(
        "No storage deploy mappings found. Add collections with a 'source' field to config/config-server.json."
      );
      return;
    }

    switch (subcommand) {
      case "deploy":
        await deployStorage(satellite, mappings);
        break;
      case "prune":
        await pruneStorage(satellite, mappings);
        break;
      case "clear":
        await clearStorage(satellite, mappings, collection, fullPath);
        break;
      case "help":
      case "--help":
      case "-h":
        printHelp();
        break;
      default:
        console.error(`Unknown subcommand: ${subcommand}`);
        printHelp();
        process.exit(1);
    }
  },
});
