#!/usr/bin/env node
/**
 * Seed the dev profile with a snapshot of prod data.
 *
 * Copies:
 *   %APPDATA%\clipflow\         →  %APPDATA%\clipflow-dev\
 *   <repo>/data/                →  %APPDATA%\clipflow-dev\data\
 *
 * Idempotent: refuses to overwrite an existing dev profile unless --force.
 *
 * Skips Chromium cache dirs (huge, regenerated on launch) and electron-log
 * sessions (not portable). Skips files locked by a running app instance.
 *
 * Usage:
 *   node scripts/seed-dev-profile.js          # first-time seed
 *   node scripts/seed-dev-profile.js --force  # re-seed, blowing away current dev profile
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const APPDATA = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
const PROD_USERDATA = path.join(APPDATA, "clipflow");
const DEV_USERDATA = path.join(APPDATA, "clipflow-dev");
const REPO_DATA = path.join(__dirname, "..", "data");
const DEV_DATA = path.join(DEV_USERDATA, "data");

const SKIP_DIRS = new Set([
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "Local Storage",
  "Session Storage",
  "IndexedDB",
  "Service Worker",
  "logs",
  "blob_storage",
  "Crashpad",
  "Dictionaries",
  "Network",
  "Shared Dictionary",
]);

const force = process.argv.includes("--force");

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (SKIP_DIRS.has(entry)) continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    try {
      fs.copyFileSync(src, dest);
    } catch (err) {
      if (err.code === "EBUSY" || err.code === "EPERM") {
        console.warn(`  skipped (locked): ${src}`);
        return;
      }
      throw err;
    }
  }
}

function main() {
  if (!fs.existsSync(PROD_USERDATA)) {
    console.error(`Prod userData not found: ${PROD_USERDATA}`);
    console.error("Nothing to seed from. Run the prod app at least once first.");
    process.exit(1);
  }

  if (fs.existsSync(DEV_USERDATA) && !force) {
    console.error(`Dev profile already exists: ${DEV_USERDATA}`);
    console.error("Pass --force to overwrite.");
    process.exit(1);
  }

  if (force && fs.existsSync(DEV_USERDATA)) {
    console.log(`Removing existing dev profile: ${DEV_USERDATA}`);
    fs.rmSync(DEV_USERDATA, { recursive: true, force: true });
  }

  console.log(`Seeding dev userData from ${PROD_USERDATA}`);
  copyRecursive(PROD_USERDATA, DEV_USERDATA);

  if (fs.existsSync(REPO_DATA)) {
    console.log(`Seeding dev DB from ${REPO_DATA}`);
    copyRecursive(REPO_DATA, DEV_DATA);
  } else {
    console.log(`No repo data/ folder found — skipping DB seed.`);
  }

  console.log(`\nDone. Dev profile ready at:\n  ${DEV_USERDATA}\n`);
  console.log(`Run with:  npm run dev`);
}

main();
