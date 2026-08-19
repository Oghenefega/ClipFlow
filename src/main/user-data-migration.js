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
 * still-running old ClipFlow, Corva dir already created by a stray boot), the
 * caller is told to keep using the old folder via app.setPath. The app must
 * never boot against an empty userData while the real one still exists.
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

/**
 * @param {object} opts
 * @param {string} opts.appDataDir - app.getPath("appData")
 * @param {string} opts.newUserData - app.getPath("userData") (the Corva default)
 * @param {object} [opts.fsImpl] - fs override for tests
 * @returns {{outcome: "migrated"|"noop"|"use-old", oldDir: string, error?: Error}}
 *   "use-old" → caller must app.setPath("userData", oldDir).
 */
function migrateUserData({ appDataDir, newUserData, fsImpl = require("fs") }) {
  const oldDir = path.join(appDataDir, "clipflow");
  try {
    if (!fsImpl.existsSync(path.join(oldDir, SETTINGS_FILE))) {
      // Fresh install, or migration already ran on a previous boot.
      return { outcome: "noop", oldDir };
    }
    if (fsImpl.existsSync(newUserData)) {
      // Corva dir already exists alongside real old data. If it holds real
      // data too, something split-brained — prefer it (it's the newer writes).
      // If it's a stray shell (Chromium scaffolding, no settings), the old
      // folder is the real one; renameSync onto an existing dir would throw
      // anyway, so keep running on old data.
      const newHasData = fsImpl.existsSync(path.join(newUserData, SETTINGS_FILE));
      return newHasData ? { outcome: "noop", oldDir } : { outcome: "use-old", oldDir };
    }
    fsImpl.renameSync(oldDir, newUserData);
    // Integrity check: the settings store must have arrived with the move.
    if (!fsImpl.existsSync(path.join(newUserData, SETTINGS_FILE))) {
      return { outcome: "use-old", oldDir };
    }
    return { outcome: "migrated", oldDir };
  } catch (error) {
    return { outcome: "use-old", oldDir, error };
  }
}

module.exports = { migrateUserData };
