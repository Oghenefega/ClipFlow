/**
 * reconcile.js — Recordings ↔ disk reconciliation (session 113).
 *
 * The Recordings tab renders file_metadata rows verbatim, so the database and
 * the disk drift apart in both directions: files deleted in Explorer keep
 * their rows (ghost cards), and renamed files whose DB write failed — or that
 * predate the DB in a format the one-time migration didn't recognize — exist
 * on disk with no row (invisible). This module runs both passes every time
 * the Recordings tab loads:
 *
 *  1. Missing: rows whose current_path no longer exists → returned as IDs so
 *     the UI hides them and offers cleanup. Rows are NEVER auto-deleted here;
 *     an unplugged drive must not wipe the library (a row is only flagged
 *     when its drive root is reachable).
 *  2. Adopt: correctly-named videos on disk with no row → inserted as
 *     status "renamed". Recognizes the legacy date-first format and the
 *     current tag-first, date-bearing presets. Label-only names are skipped —
 *     they can't be told apart from arbitrary videos.
 *
 * Afterwards, impossible game day counters are repaired: lastDayDate in the
 * future can only come from test renames having advanced the real counter
 * (#170) — recompute from non-test rows.
 */

const path = require("path");
const fs = require("fs");
const log = require("electron-log/main").scope("reconcile");
const database = require("./database");
const { uuid } = require("./uuid");

// Current date-first shapes: "2026-03-02 RL Day6 Pt1.mp4", "2026-03-15 AR.mp4",
// "2026-03-15 AR Pt2.mp4" (collision part). This is the app-wide convention
// (restored session 115 — the preset engine briefly emitted tag-first).
const DATE_FIRST_PATTERN = /^(\d{4}-\d{2}-\d{2})\s+(\w{1,8})(?:\s+Day(\d+))?(?:\s+Pt(\d+))?\.(mp4|mkv)$/i;
// Legacy tag-first shapes from the 0.2.x drift era: "RL 2026-03-04 Day7 Pt1.mp4",
// "RL 2026-03-04.mp4", "RL 2026-03-04 Pt2.mp4"
const TAG_FIRST_PATTERN = /^(\w{1,8})\s+(\d{4}-\d{2}-\d{2})(?:\s+Day(\d+))?(?:\s+Pt(\d+))?\.(mp4|mkv)$/i;

const MONTH_DIR = /^\d{4}-\d{2}$/;

/** Parse a filename into metadata fields, or null if it isn't a renamed clip. */
function parseRenamedFilename(fileName) {
  let m = fileName.match(DATE_FIRST_PATTERN);
  if (m) {
    const dayNumber = m[3] != null ? parseInt(m[3], 10) : null;
    const partNumber = m[4] != null ? parseInt(m[4], 10) : null;
    return {
      date: m[1], tag: m[2], dayNumber, partNumber,
      namingPreset: dayNumber != null ? "tag-date-day-part" : "tag-date",
    };
  }
  m = fileName.match(TAG_FIRST_PATTERN);
  if (m) {
    const dayNumber = m[3] != null ? parseInt(m[3], 10) : null;
    const partNumber = m[4] != null ? parseInt(m[4], 10) : null;
    return {
      date: m[2], tag: m[1], dayNumber, partNumber,
      namingPreset: dayNumber != null ? "tag-date-day-part" : "tag-date",
    };
  }
  return null;
}

/** Today's date as YYYY-MM-DD in local time (never toISOString — UTC skews the calendar day). */
function localYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Collect scan directories: each root plus subfolders down to two levels (Game\YYYY-MM). */
function collectScanDirs(roots, excludedPrefixes) {
  const dirs = [];
  const seen = new Set();
  const add = (dir) => {
    const key = dir.toLowerCase();
    if (seen.has(key)) return false;
    const excluded = excludedPrefixes.some((p) => key === p || key.startsWith(p + path.sep));
    if (excluded) return false;
    seen.add(key);
    dirs.push(dir);
    return true;
  };

  for (const root of roots) {
    if (!root || !fs.existsSync(root)) continue;
    if (!add(root)) continue;
    let level1;
    try {
      level1 = fs.readdirSync(root, { withFileTypes: true });
    } catch (_) { continue; }
    for (const e1 of level1) {
      if (!e1.isDirectory() || e1.name.startsWith(".")) continue;
      const d1 = path.join(root, e1.name);
      if (!add(d1)) continue;
      let level2;
      try {
        level2 = fs.readdirSync(d1, { withFileTypes: true });
      } catch (_) { continue; }
      for (const e2 of level2) {
        if (!e2.isDirectory() || e2.name.startsWith(".")) continue;
        // Only month folders at the second level — deeper structure isn't ours.
        if (!MONTH_DIR.test(e2.name)) continue;
        add(path.join(d1, e2.name));
      }
    }
  }
  return dirs;
}

/**
 * Run both reconcile passes plus the day-counter repair.
 *
 * @param {object} opts
 * @param {object} opts.store - electron-store instance
 * @param {string[]} opts.roots - folders to scan for untracked files (library root + watch folder)
 * @param {Function} [opts.ffmpegProbe] - async (filePath) => { duration } or null
 * @returns {{ missingIds: string[], adopted: number, errors: string[] }}
 */
async function run({ store, roots, ffmpegProbe }) {
  const db = database.getDb();
  if (!db) return { missingIds: [], adopted: 0, errors: ["Database not initialized"] };

  const errors = [];

  // ── Pass 1: rows whose file is gone ──
  const missingIds = [];
  const rows = database.toRows(db.exec(
    "SELECT id, current_path FROM file_metadata WHERE status != 'pending' AND status != 'split'"
  ));
  const knownFilenames = new Set();
  for (const row of database.toRows(db.exec("SELECT current_filename FROM file_metadata"))) {
    knownFilenames.add(row.current_filename.toLowerCase());
  }
  for (const row of rows) {
    const p = row.current_path;
    if (!p) continue;
    try {
      if (fs.existsSync(p)) continue;
      // Only flag when the drive itself is reachable — otherwise this is an
      // unplugged/offline volume, not a deleted file.
      const driveRoot = path.parse(p).root;
      if (driveRoot && fs.existsSync(driveRoot)) missingIds.push(row.id);
    } catch (_) { /* unreadable path — leave it alone */ }
  }

  // ── Pass 2: adopt untracked renamed files ──
  const gamesDb = store.get("gamesDb") || [];
  const tagToGame = {};
  for (const g of gamesDb) tagToGame[g.tag.toUpperCase()] = g;

  // Never adopt out of test folders — those rows carry is_test and are
  // created through the test rename flow, not this scan.
  const excluded = [];
  const testRoot = store.get("testWatchFolder");
  if (testRoot) excluded.push(testRoot.toLowerCase());
  for (const root of roots) {
    if (root) excluded.push(path.join(root, "Test").toLowerCase(), path.join(root, "Test Footage").toLowerCase());
  }

  let adopted = 0;
  for (const dir of collectScanDirs(roots.filter(Boolean), excluded)) {
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch (_) { continue; }
    for (const fileName of files) {
      const parsed = parseRenamedFilename(fileName);
      if (!parsed) continue;
      if (knownFilenames.has(fileName.toLowerCase())) continue;
      const game = tagToGame[parsed.tag.toUpperCase()];
      if (!game) continue; // unknown tag — not one of ours

      const filePath = path.join(dir, fileName);
      let fileSizeBytes = null;
      try { fileSizeBytes = fs.statSync(filePath).size; } catch (_) {}

      let durationSeconds = null;
      if (ffmpegProbe) {
        try {
          const probe = await ffmpegProbe(filePath);
          if (probe && probe.duration) durationSeconds = probe.duration;
        } catch (_) { /* duration is optional */ }
      }

      try {
        db.run(
          `INSERT INTO file_metadata (id, original_filename, current_filename, original_path, current_path, tag, entry_type, date, day_number, part_number, custom_label, naming_preset, duration_seconds, file_size_bytes, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuid(),
            fileName, // original OBS name is unknowable — use current
            fileName,
            filePath,
            filePath,
            game.tag,
            game.entryType || "game",
            parsed.date,
            parsed.dayNumber,
            parsed.partNumber,
            null,
            parsed.namingPreset,
            durationSeconds,
            fileSizeBytes,
            "renamed",
          ]
        );
        knownFilenames.add(fileName.toLowerCase());
        adopted++;
        log.info(`Adopted untracked file: ${filePath}`);
      } catch (err) {
        errors.push(`Adopt failed: ${fileName} — ${err.message}`);
      }
    }
  }

  // ── Day-counter repair (#170 fallout) ──
  // Runs after adoption so recovered rows (e.g. Day7) count. When it changes
  // the store, the repaired array is returned so main can push it to the
  // renderer — App holds its own gamesDb copy and would otherwise persist the
  // stale counter right back on the next rename.
  let repairedGames = null;
  try {
    repairedGames = repairFutureDayCounters(store, db);
  } catch (err) {
    errors.push(`Day counter repair failed: ${err.message}`);
  }

  if (adopted > 0) database.save();
  if (missingIds.length > 0 || adopted > 0) {
    log.info(`Reconcile: ${missingIds.length} missing, ${adopted} adopted`);
  }
  return { missingIds, adopted, errors, repairedGames };
}

/**
 * A lastDayDate in the future is an impossible state — test renames used to
 * advance the real counter (#170). Recompute that game's counter from its
 * non-test rows. No-op for healthy counters, so safe to run every reconcile.
 * @returns {Array|null} the repaired gamesDb when anything changed, else null
 */
function repairFutureDayCounters(store, db) {
  const today = localYMD();
  const gamesDb = store.get("gamesDb") || [];
  let changed = false;
  for (const g of gamesDb) {
    if (!g.lastDayDate || g.lastDayDate <= today) continue;
    const maxRows = database.toRows(db.exec(
      "SELECT MAX(day_number) AS d FROM file_metadata WHERE tag = ? AND is_test = 0 AND day_number IS NOT NULL",
      [g.tag]
    ));
    const maxDay = maxRows.length > 0 && maxRows[0].d != null ? maxRows[0].d : 0;
    let newDate = null;
    if (maxDay > 0) {
      const dateRows = database.toRows(db.exec(
        "SELECT MAX(date) AS dt FROM file_metadata WHERE tag = ? AND is_test = 0 AND day_number = ?",
        [g.tag, maxDay]
      ));
      newDate = dateRows.length > 0 ? dateRows[0].dt : null;
    }
    log.info(`Repaired impossible day counter for ${g.tag}: dayCount ${g.dayCount}→${maxDay}, lastDayDate ${g.lastDayDate}→${newDate}`);
    g.dayCount = maxDay;
    g.lastDayDate = newDate;
    changed = true;
  }
  if (changed) store.set("gamesDb", gamesDb);
  return changed ? gamesDb : null;
}

/**
 * Delete rows the user confirmed as gone. Each ID is re-verified as still
 * missing (file absent, drive reachable) before deletion — the only place
 * file_metadata rows are ever deleted.
 *
 * @returns {{ removed: number }}
 */
function removeMissing(ids) {
  const db = database.getDb();
  if (!db || !Array.isArray(ids) || ids.length === 0) return { removed: 0 };

  let removed = 0;
  for (const id of ids) {
    const rows = database.toRows(db.exec(
      "SELECT current_path, status FROM file_metadata WHERE id = ?",
      [id]
    ));
    if (rows.length === 0) continue;
    const { current_path: p, status } = rows[0];
    if (status === "processing") continue;
    try {
      if (p && fs.existsSync(p)) continue; // reappeared (drive replugged) — keep
      const driveRoot = p ? path.parse(p).root : null;
      if (driveRoot && !fs.existsSync(driveRoot)) continue; // drive offline — keep
    } catch (_) { continue; }
    db.run("DELETE FROM file_metadata WHERE id = ?", [id]);
    removed++;
  }
  if (removed > 0) {
    database.save();
    log.info(`Removed ${removed} missing-file row(s) from the library`);
  }
  return { removed };
}

module.exports = { run, removeMissing, parseRenamedFilename };
