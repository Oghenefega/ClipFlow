/**
 * file-migration.js — One-time migration of existing renamed files into SQLite.
 *
 * Runs on first launch after the rename redesign update.
 * Scans watch folder monthly subfolders for files matching the old naming pattern
 * (TAG YYYY-MM-DD DayN PtN.mp4), parses metadata, and inserts file_metadata records.
 *
 * Also migrates electron-store: adds entryType to games, adds JC content type,
 * sets default naming preset for existing users.
 */

const path = require("path");
const fs = require("fs");
const log = require("electron-log/main").scope("migration");
const database = require("./database");
const { uuid } = require("./uuid");

// Pattern: "2026-03-03 AR Day25 Pt1.mp4" or "2026-03-03 AR Day25 Pt1.mkv"
const RENAMED_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\s+(\w+)\s+Day(\d+)\s+Pt(\d+)\.(mp4|mkv)$/i;

// Month folder pattern: "2026-03"
const MONTH_FOLDER_PATTERN = /^\d{4}-\d{2}$/;

/**
 * Run the full file metadata migration.
 *
 * @param {string} watchFolder - Absolute path to the watch folder
 * @param {object} store - electron-store instance
 * @param {Function} ffmpegProbe - async function(filePath) => { duration } or null
 * @returns {{ migrated: number, skipped: number, errors: string[] }}
 */
async function runFileMigration(watchFolder, store, ffmpegProbe) {
  const db = database.getDb();
  if (!db) {
    log.error("Cannot run migration — database not initialized");
    return { migrated: 0, skipped: 0, errors: ["Database not initialized"] };
  }

  // Check if migration already ran
  if (store.get("fileMigrationComplete")) {
    log.info("File migration already complete — skipping");
    return { migrated: 0, skipped: 0, errors: [] };
  }

  log.info("Starting file metadata migration...");

  const gamesDb = store.get("gamesDb") || [];
  const errors = [];
  let migrated = 0;
  let skipped = 0;

  // Build a tag→game lookup
  const tagToGame = {};
  for (const g of gamesDb) {
    tagToGame[g.tag.toUpperCase()] = g;
  }

  // Load existing projects to determine status
  const projectSourceFiles = await loadProjectSourceFiles(watchFolder);

  // Scan monthly subfolders
  const monthFolders = [];
  try {
    const entries = fs.readdirSync(watchFolder, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && MONTH_FOLDER_PATTERN.test(entry.name)) {
        monthFolders.push(entry.name);
      }
    }
  } catch (err) {
    log.error(`Failed to scan watch folder: ${err.message}`);
    errors.push(`Failed to scan watch folder: ${err.message}`);
  }

  // Also check root of watch folder (files might not be in subfolders)
  monthFolders.push(""); // Empty string = root

  for (const folder of monthFolders) {
    const folderPath = folder ? path.join(watchFolder, folder) : watchFolder;

    let files;
    try {
      files = fs.readdirSync(folderPath);
    } catch (err) {
      continue; // Folder doesn't exist or can't be read
    }

    for (const fileName of files) {
      const match = fileName.match(RENAMED_FILE_PATTERN);
      if (!match) continue;

      const [, date, tag, dayStr, partStr, ext] = match;
      const dayNumber = parseInt(dayStr, 10);
      const partNumber = parseInt(partStr, 10);
      const tagUpper = tag.toUpperCase();

      // Check if already migrated (by current_filename match)
      const existing = db.exec(
        "SELECT id FROM file_metadata WHERE current_filename = ?",
        [fileName]
      );
      if (database.toRows(existing).length > 0) {
        skipped++;
        continue;
      }

      // Match to game
      const game = tagToGame[tagUpper];
      if (!game) {
        log.warn(`No game found for tag "${tag}" in file "${fileName}" — skipping`);
        errors.push(`No game for tag "${tag}": ${fileName}`);
        skipped++;
        continue;
      }

      const filePath = path.join(folderPath, fileName);

      // Get file size
      let fileSizeBytes = null;
      try {
        const stats = fs.statSync(filePath);
        fileSizeBytes = stats.size;
      } catch (e) {
        log.warn(`Could not stat file: ${filePath}`);
      }

      // Get duration via FFmpeg probe (if available)
      let durationSeconds = null;
      if (ffmpegProbe) {
        try {
          const probe = await ffmpegProbe(filePath);
          if (probe && probe.duration) {
            durationSeconds = probe.duration;
          }
        } catch (e) {
          // Non-fatal — duration is optional
        }
      }

      // Determine status: "done" if a project references this file, else "renamed"
      const status = projectSourceFiles.has(filePath.toLowerCase()) ? "done" : "renamed";

      // Insert into file_metadata
      const id = uuid();
      try {
        db.run(
          `INSERT INTO file_metadata (id, original_filename, current_filename, original_path, current_path, tag, entry_type, date, day_number, part_number, custom_label, naming_preset, duration_seconds, file_size_bytes, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            fileName, // Original OBS name is lost — use current filename
            fileName,
            filePath,
            filePath,
            game.tag,
            game.entryType || "game",
            date,
            dayNumber,
            partNumber,
            null, // No custom labels in old format
            "tag-date-day-part", // All existing files use this format
            durationSeconds,
            fileSizeBytes,
            status,
          ]
        );
        migrated++;
      } catch (err) {
        log.error(`Failed to insert metadata for ${fileName}: ${err.message}`);
        errors.push(`Insert failed: ${fileName} — ${err.message}`);
      }
    }
  }

  // Save database
  if (migrated > 0) {
    database.save();
  }

  // Mark migration as complete
  store.set("fileMigrationComplete", true);

  log.info(`File migration complete: ${migrated} migrated, ${skipped} skipped, ${errors.length} errors`);
  return { migrated, skipped, errors };
}

/**
 * Load all project source file paths for status detection.
 * Returns a Set of lowercase absolute paths.
 */
async function loadProjectSourceFiles(watchFolder) {
  const sourceFiles = new Set();
  const projectsDir = path.join(watchFolder, ".clipflow", "projects");

  try {
    if (!fs.existsSync(projectsDir)) return sourceFiles;

    const projectFolders = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of projectFolders) {
      if (!entry.isDirectory()) continue;

      const projectJsonPath = path.join(projectsDir, entry.name, "project.json");
      try {
        if (!fs.existsSync(projectJsonPath)) continue;
        const raw = fs.readFileSync(projectJsonPath, "utf-8");
        const project = JSON.parse(raw);
        if (project.sourceFile) {
          sourceFiles.add(project.sourceFile.toLowerCase());
        }
      } catch (e) {
        // Skip unreadable projects
      }
    }
  } catch (e) {
    log.warn(`Could not scan projects directory: ${e.message}`);
  }

  return sourceFiles;
}

/**
 * Migrate electron-store data for the rename redesign:
 * - Add entryType: "game" to all existing Game Library entries
 * - Add JC (Just Chatting) as a content type
 * - Set default naming preset for existing users
 *
 * @param {object} store - electron-store instance
 */
function migrateStoreData(store) {
  if (store.get("renameDesignMigrated")) return;

  log.info("Running electron-store migration for rename redesign...");

  // 1. Add entryType to all existing games
  const gamesDb = store.get("gamesDb") || [];
  let modified = false;

  for (const game of gamesDb) {
    if (!game.entryType) {
      game.entryType = "game";
      modified = true;
    }
  }

  // 2. Add JC (Just Chatting) if not already present
  const hasJC = gamesDb.some((g) => g.tag === "JC");
  if (!hasJC) {
    gamesDb.push({
      name: "Just Chatting",
      tag: "JC",
      exe: [],
      color: "#9b5de5",
      hashtag: "justchatting",
      entryType: "content",
      dayCount: 0,
      lastDayDate: null,
    });
    modified = true;
    log.info("Added JC (Just Chatting) content type");
  }

  if (modified) {
    store.set("gamesDb", gamesDb);
  }

  // 3. Set default naming preset for existing users (matches current behavior)
  if (!store.get("namingPreset")) {
    store.set("namingPreset", "tag-date-day-part");
    log.info("Set default naming preset: tag-date-day-part");
  }

  // Mark migration complete
  store.set("renameDesignMigrated", true);
  log.info("Electron-store migration complete");
}

module.exports = {
  runFileMigration,
  migrateStoreData,
};
