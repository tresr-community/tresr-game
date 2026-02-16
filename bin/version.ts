import fs from "node:fs";
import path from "node:path";
import {execSync} from "node:child_process";
import {log} from "../src/lib/utils/log";

const BASE_VERSION = "0.0.0";

const COMPONENT_NAME = "Versioner";

const projectRoot: string = path.resolve(process.cwd());
const filesToUpdate: string[] = [
  path.join(projectRoot, "package.json"),
  path.join(projectRoot, "public", "manifest.json"),
  path.join(projectRoot, "src", "satellite", "Cargo.toml"),
];

function updateFile(file: string, targetVersion: string): void {
  if (!fs.existsSync(file)) {
    log.warn(COMPONENT_NAME, `File not found: ${file}, skipping`);
    return;
  }

  const content: string = fs.readFileSync(file, "utf8");
  const fileName: string = path.basename(file);
  let newContent: string;

  if (fileName === "package.json" || fileName === "manifest.json") {
    newContent = content.replace(
      /"version": "[^"]*"/,
      `"version": "${targetVersion}"`
    );
  } else if (fileName === "Cargo.toml") {
    // Only replace the version in the [package] section (first occurrence)
    let replaced = false;
    newContent = content.replace(
      /^(version\s*=\s*)"[^"]*"/m,
      (_match, prefix) => {
        if (replaced) return _match;
        replaced = true;
        return `${prefix}"${targetVersion}"`;
      }
    );
  } else {
    log.warn(COMPONENT_NAME, `No version pattern for ${fileName}, skipping`);
    return;
  }

  fs.writeFileSync(file, newContent);
  log.info(COMPONENT_NAME, `Updated version to ${targetVersion} in: ${file}`);
}

function setVersion(targetVersion: string): void {
  for (const file of filesToUpdate) {
    updateFile(file, targetVersion);
  }
  log.info(COMPONENT_NAME, `Version set to ${targetVersion}`);
}

const args: string[] = process.argv.slice(2);
const mode: string | undefined = args[0];

if (mode === "--bump") {
  try {
    const nextVersion: string = execSync("convco version --bump", {
      encoding: "utf8",
    }).trim();
    log.info(COMPONENT_NAME, `Next version: ${nextVersion}`);
    setVersion(nextVersion);
  } catch (error) {
    if (error instanceof Error) {
      log.error(COMPONENT_NAME, `Error bumping version: ${error.message}`);
    } else {
      log.error(COMPONENT_NAME, `Unknown error bumping version: ${error}`);
    }
    process.exit(1);
  }
} else if (mode === "--reset") {
  setVersion(BASE_VERSION);
  log.info(COMPONENT_NAME, `Version reset to ${BASE_VERSION}`);
} else if (mode === "--set") {
  const version = args[1];
  if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
    log.error(
      COMPONENT_NAME,
      "Usage: bun run bin/version.ts --set <semver> (e.g. 0.2.1)"
    );
    process.exit(1);
  }
  setVersion(version);
} else if (mode === "--get") {
  try {
    const currentVersion: string = execSync("convco version", {
      encoding: "utf8",
    }).trim();
    console.log(currentVersion);
  } catch (error) {
    if (error instanceof Error) {
      log.error(COMPONENT_NAME, `Error getting version: ${error.message}`);
    } else {
      log.error(COMPONENT_NAME, `Unknown error getting version: ${error}`);
    }
    process.exit(1);
  }
} else {
  log.error(
    COMPONENT_NAME,
    "Usage: bun run bin/version.ts --bump | --reset | --get | --set <version>"
  );
  process.exit(1);
}
