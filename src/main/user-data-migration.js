/**
 * ClipFlow → Corva userData migration (#268).
 *
 * The packaged app's default userData folder follows productName, so renaming
 * the product to Corva makes a fresh boot point at an empty %APPDATA%\Corva —
 * orphaning every existing install's settings, tracker history (XP/rank/
 * streak), OAuth tokens and detection DB. This renames the legacy folder into
 * place ONCE. Same-volume renameSync is atomic on NTFS: it either moves the
 * whole tree (byte-for-byte, no copy) or throws with the old folder intact —
 * there is no partial state to repair.
 *
 * Failure never strands data: if the rename can't happen (folder locked by a
 * still-running old ClipFlow, a Corva dir holding something that looks like
 * data), the caller is told to keep using the old folder via app.setPath. The
 * app must never boot against an empty userData while the real one still
 * exists.
 *
 * #288: an existing %APPDATA%\Corva with no data in it is the DEFAULT on a real
 * install, not an edge case — Electron creates the shell before this check can
 * run, and a headless harness booted under the Corva name leaves logs/ in it.
 * Treating that shell as a reason to stay on the old folder latched every boot
 * in use-old forever. A stray shell is now moved aside (never deleted) so the
 * rename can land.
 *
 * MUST run before require("@sentry/electron/main") — sentry-electron caches
 * userData at require time (getsentry/sentry-electron#796) — and before the
 * single-instance lock, which is scoped to the userData directory.
 *
 * Dependency-free + injected fs so the logic is testable under plain node.
 */
const path = require("path");

// A real ClipFlow data folder always has the settings store; its presence is
// what distinguishes user data from a stray empty directory.
const SETTINGS_FILE = "clipflow-settings.json";

// #288: what makes a directory "someone's data" rather than a stray shell —
// ours: the settings store and its backups, tokens, publish log, the DB folder,
// processing scratch, the managed engine. Chromium's scaffolding (Cache,
// GPUCache, Local Storage, ...), logs/ and sentry/ are regenerable and don't
// count. Anything matching here means: not ours to judge, keep the old folder.
const DATA_MARKERS = /^(clipflow-|data$|backups$|processing$|runtime$)/i;

function isStrayShell(dir, fsImpl) {
  return !fsImpl.readdirSync(dir).some((name) => DATA_MARKERS.test(name));
}

/**
 * @param {object} opts
 * @param {string} opts.appDataDir - app.getPath("appData")
 * @param {string} opts.newUserData - app.getPath("userData") (the Corva default)
 * @param {object} [opts.fsImpl] - fs override for tests
 * @returns {{outcome: "migrated"|"noop"|"use-old", oldDir: string, parked?: string, reason?: string, error?: Error}}
 *   "use-old" → caller must app.setPath("userData", oldDir).
 *   "parked"  → where a stray Corva shell was moved before the rename (#288).
 */
function migrateUserData({ appDataDir, newUserData, fsImpl = require("fs") }) {
  const oldDir = path.join(appDataDir, "clipflow");
  let parked;
  try {
    if (!fsImpl.existsSync(path.join(oldDir, SETTINGS_FILE))) {
      // Fresh install, or migration already ran on a previous boot.
      return { outcome: "noop", oldDir };
    }
    if (fsImpl.existsSync(newUserData)) {
      if (fsImpl.existsSync(path.join(newUserData, SETTINGS_FILE))) {
        // Real data on both sides — something split-brained. Prefer the new
        // folder (it's the newer writes); never touch either.
        return { outcome: "noop", oldDir };
      }
      if (!isStrayShell(newUserData, fsImpl)) {
        // No settings store, but something that looks like data. Keep running
        // on the old folder and say why in the log.
        return { outcome: "use-old", oldDir, reason: "Corva dir holds unrecognised data" };
      }
      // #288: park the shell — never delete it — so the rename below can land.
      parked = `${newUserData}.stray-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      fsImpl.renameSync(newUserData, parked);
    }
    fsImpl.renameSync(oldDir, newUserData);
    // Integrity check: the settings store must have arrived with the move.
    if (!fsImpl.existsSync(path.join(newUserData, SETTINGS_FILE))) {
      return { outcome: "use-old", oldDir, parked };
    }
    return { outcome: "migrated", oldDir, parked };
  } catch (error) {
    return { outcome: "use-old", oldDir, parked, error };
  }
}

module.exports = { migrateUserData };
