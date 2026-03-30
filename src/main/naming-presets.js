const path = require("path");
const fs = require("fs");
const log = require("electron-log/main").scope("naming");
const database = require("./database");

// ── Preset Definitions ──

const PRESETS = {
  "tag-date-day-part": {
    id: "tag-date-day-part",
    displayName: "Tag + Date + Day + Part",
    format: "{tag} {date} Day{N} Pt{N}",
    example: "AR 2026-03-15 Day30 Pt1",
    alwaysShowParts: true,
    usesDayNumber: true,
    usesDate: true,
    usesLabel: false,
    usesOriginal: false,
  },
  "tag-day-part": {
    id: "tag-day-part",
    displayName: "Tag + Day + Part",
    format: "{tag} Day{N} Pt{N}",
    example: "AR Day30 Pt1",
    alwaysShowParts: true,
    usesDayNumber: true,
    usesDate: false,
    usesLabel: false,
    usesOriginal: false,
  },
  "tag-date": {
    id: "tag-date",
    displayName: "Tag + Date",
    format: "{tag} {date}",
    example: "AR 2026-03-15",
    alwaysShowParts: false,
    usesDayNumber: false,
    usesDate: true,
    usesLabel: false,
    usesOriginal: false,
  },
  "tag-label": {
    id: "tag-label",
    displayName: "Tag + Custom Label",
    format: "{tag} {label}",
    example: "AR ranked-grind",
    alwaysShowParts: false,
    usesDayNumber: false,
    usesDate: false,
    usesLabel: true,
    usesOriginal: false,
  },
  "tag-date-label": {
    id: "tag-date-label",
    displayName: "Tag + Date + Custom Label",
    format: "{tag} {date} {label}",
    example: "AR 2026-03-15 ranked-grind",
    alwaysShowParts: false,
    usesDayNumber: false,
    usesDate: true,
    usesLabel: true,
    usesOriginal: false,
  },
  "original-tag": {
    id: "original-tag",
    displayName: "Tag + Original",
    format: "{tag} {original}",
    example: "AR 2026-03-15 14-30-22",
    alwaysShowParts: false,
    usesDayNumber: false,
    usesDate: false,
    usesLabel: false,
    usesOriginal: true,
  },
};

const INVALID_LABEL_CHARS = /[\\/:*?"<>|]/;

// ── Pure Formatting ──

/**
 * Format a filename from metadata fields and a preset ID.
 * Pure function — no DB access.
 *
 * @param {object} meta - { tag, date, dayNumber, partNumber, customLabel, originalFilename }
 * @param {string} presetId - One of the 6 preset IDs
 * @returns {string} Formatted filename with .mp4 extension
 */
function formatFilename(meta, presetId) {
  const preset = PRESETS[presetId];
  if (!preset) throw new Error(`Unknown preset: ${presetId}`);

  const parts = [meta.tag];

  if (preset.usesDate && meta.date) {
    parts.push(meta.date);
  }

  if (preset.usesOriginal && meta.originalFilename) {
    // Strip extension from original filename
    const original = meta.originalFilename.replace(/\.[^.]+$/, "");
    parts.push(original);
  }

  if (preset.usesDayNumber && meta.dayNumber != null) {
    parts.push(`Day${meta.dayNumber}`);
  }

  if (preset.usesLabel && meta.customLabel) {
    parts.push(meta.customLabel);
  }

  // Parts: always shown for presets 1&2, conditional for others
  if (meta.partNumber != null) {
    parts.push(`Pt${meta.partNumber}`);
  }

  return parts.join(" ") + ".mp4";
}

// ── Validation ──

/**
 * Validate a custom label for filename safety.
 * @param {string} label
 * @returns {{ valid: boolean, error?: string }}
 */
function validateLabel(label) {
  if (!label || label.trim().length === 0) {
    return { valid: false, error: "Label cannot be empty" };
  }
  if (INVALID_LABEL_CHARS.test(label)) {
    return { valid: false, error: "Labels can't contain special characters (\\ / : * ? \" < > |)" };
  }
  return { valid: true };
}

// ── Day Number Calculation ──

/**
 * Calculate the day number for a new rename.
 *
 * @param {object} gameEntry - Game Library entry from electron-store (needs dayCount, lastDayDate)
 * @param {string} recordingDate - YYYY-MM-DD date of the recording
 * @returns {{ dayNumber: number, newDayCount: number, newLastDayDate: string }}
 */
function calculateDayNumber(gameEntry, recordingDate) {
  const currentDayCount = gameEntry.dayCount || 0;
  const lastDayDate = gameEntry.lastDayDate || null;

  if (!lastDayDate || lastDayDate !== recordingDate) {
    // Different date → increment day
    const newDayCount = currentDayCount + 1;
    return {
      dayNumber: newDayCount,
      newDayCount,
      newLastDayDate: recordingDate,
    };
  }

  // Same date → same day number, no increment
  return {
    dayNumber: currentDayCount,
    newDayCount: currentDayCount,
    newLastDayDate: lastDayDate,
  };
}

// ── Collision Detection ──

/**
 * Build the collision query for a preset. Returns matching files from file_metadata
 * that would collide with the given metadata (same collision key, no part number).
 *
 * @param {object} meta - { tag, date, customLabel, originalFilename }
 * @param {string} presetId
 * @returns {Array} Matching file_metadata rows (collisions)
 */
function findCollisions(meta, presetId) {
  const db = database.getDb();
  if (!db) return [];

  const preset = PRESETS[presetId];
  if (!preset || preset.alwaysShowParts) return []; // Presets 1&2 always have parts, no collisions

  let sql, params;

  switch (presetId) {
    case "tag-date":
      sql = "SELECT * FROM file_metadata WHERE tag = ? AND date = ? AND part_number IS NULL";
      params = [meta.tag, meta.date];
      break;
    case "tag-label":
      sql = "SELECT * FROM file_metadata WHERE tag = ? AND custom_label = ? AND part_number IS NULL";
      params = [meta.tag, meta.customLabel];
      break;
    case "tag-date-label":
      sql = "SELECT * FROM file_metadata WHERE tag = ? AND date = ? AND custom_label = ? AND part_number IS NULL";
      params = [meta.tag, meta.date, meta.customLabel];
      break;
    case "original-tag":
      sql = "SELECT * FROM file_metadata WHERE tag = ? AND original_filename = ? AND part_number IS NULL";
      params = [meta.tag, meta.originalFilename];
      break;
    default:
      return [];
  }

  const result = db.exec(sql, params);
  return database.toRows(result);
}

/**
 * Get the next available part number for a given collision key.
 *
 * @param {object} meta - { tag, date, customLabel, originalFilename }
 * @param {string} presetId
 * @returns {number} Next part number (1 if no existing parts, max+1 otherwise)
 */
function getNextPartNumber(meta, presetId) {
  const db = database.getDb();
  if (!db) return 1;

  const preset = PRESETS[presetId];
  if (!preset) return 1;

  let sql, params;

  if (preset.alwaysShowParts) {
    // Presets 1&2: parts are per tag+date (preset 1) or per tag+day (preset 2)
    if (presetId === "tag-date-day-part") {
      sql = "SELECT MAX(part_number) as max_part FROM file_metadata WHERE tag = ? AND date = ?";
      params = [meta.tag, meta.date];
    } else {
      // tag-day-part: parts are per tag + day_number
      sql = "SELECT MAX(part_number) as max_part FROM file_metadata WHERE tag = ? AND day_number = ?";
      params = [meta.tag, meta.dayNumber];
    }
  } else {
    // Presets 3-6: parts are per collision key
    switch (presetId) {
      case "tag-date":
        sql = "SELECT MAX(part_number) as max_part FROM file_metadata WHERE tag = ? AND date = ?";
        params = [meta.tag, meta.date];
        break;
      case "tag-label":
        sql = "SELECT MAX(part_number) as max_part FROM file_metadata WHERE tag = ? AND custom_label = ?";
        params = [meta.tag, meta.customLabel];
        break;
      case "tag-date-label":
        sql = "SELECT MAX(part_number) as max_part FROM file_metadata WHERE tag = ? AND date = ? AND custom_label = ?";
        params = [meta.tag, meta.date, meta.customLabel];
        break;
      case "original-tag":
        sql = "SELECT MAX(part_number) as max_part FROM file_metadata WHERE tag = ? AND original_filename = ?";
        params = [meta.tag, meta.originalFilename];
        break;
      default:
        return 1;
    }
  }

  const result = db.exec(sql, params);
  const rows = database.toRows(result);
  const maxPart = rows.length > 0 ? rows[0].max_part : null;
  return maxPart != null ? maxPart + 1 : 1;
}

// ── Retroactive Rename ──

/**
 * Check if a file is currently in use (pipeline processing or editor open).
 * This is a main-process check — the editor state is checked via a flag
 * that the renderer sets via IPC when opening/closing files.
 *
 * @param {string} fileId - file_metadata.id
 * @returns {boolean}
 */
function isFileInUse(fileId) {
  const db = database.getDb();
  if (!db) return false;

  // Check if the file has status "processing" (pipeline is working on it)
  const result = db.exec(
    "SELECT status FROM file_metadata WHERE id = ?",
    [fileId]
  );
  const rows = database.toRows(result);
  if (rows.length > 0 && rows[0].status === "processing") return true;
  // Split parent files are inert — their children may be in use, but the parent itself is not
  if (rows.length > 0 && rows[0].status === "split") return false;

  // TODO: Editor check will be added when editor integration is built (step 4+)
  // For now, pipeline status is the only check.

  return false;
}

/**
 * Execute a retroactive rename on an existing file (add Pt1).
 * Returns the rename_history entry ID for triggered_by linking.
 *
 * If the file is in use, queues the rename instead of executing it.
 *
 * @param {object} existingFile - file_metadata row to retroactively rename
 * @param {string} triggeringHistoryId - rename_history.id of the rename that caused this (for cascading undo)
 * @returns {{ executed: boolean, historyId?: string, queued?: boolean }}
 */
function retroactiveRename(existingFile, triggeringHistoryId) {
  const db = database.getDb();
  if (!db) return { executed: false };

  const pendingData = {
    partNumber: 1,
    triggeringHistoryId,
  };

  // Check if file is in use
  if (isFileInUse(existingFile.id)) {
    log.info(`File ${existingFile.id} is in use — queuing retroactive Pt1 rename`);
    db.run(
      "UPDATE file_metadata SET has_pending_rename = 1, pending_rename_data = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(pendingData), existingFile.id]
    );
    database.save();
    return { executed: false, queued: true };
  }

  // Execute the retroactive rename
  return _executeRetroactiveRename(existingFile, 1, triggeringHistoryId);
}

/**
 * Apply any pending retroactive renames for a file.
 * Called from pipeline completion and editor close handlers.
 *
 * @param {string} fileId
 * @returns {{ applied: boolean, historyId?: string }}
 */
function applyPendingRenames(fileId) {
  const db = database.getDb();
  if (!db) return { applied: false };

  const result = db.exec(
    "SELECT * FROM file_metadata WHERE id = ? AND has_pending_rename = 1",
    [fileId]
  );
  const rows = database.toRows(result);
  if (rows.length === 0) return { applied: false };

  const file = rows[0];
  const pendingData = JSON.parse(file.pending_rename_data);

  // Clear the pending flag first
  db.run(
    "UPDATE file_metadata SET has_pending_rename = 0, pending_rename_data = NULL, updated_at = datetime('now') WHERE id = ?",
    [fileId]
  );

  const result2 = _executeRetroactiveRename(file, pendingData.partNumber, pendingData.triggeringHistoryId);
  return { applied: result2.executed, historyId: result2.historyId };
}

/**
 * Internal: perform the actual retroactive rename (DB update + filesystem rename).
 */
function _executeRetroactiveRename(file, partNumber, triggeringHistoryId) {
  const db = database.getDb();
  if (!db) return { executed: false };

  // Build new filename with part number
  const newFilename = formatFilename({
    tag: file.tag,
    date: file.date,
    dayNumber: file.day_number,
    customLabel: file.custom_label,
    originalFilename: file.original_filename,
    partNumber,
  }, file.naming_preset);

  const dir = path.dirname(file.current_path);
  const newPath = path.join(dir, newFilename);

  // Snapshot metadata before change
  const snapshot = JSON.stringify({
    current_filename: file.current_filename,
    current_path: file.current_path,
    part_number: file.part_number,
  });

  // Rename physical file
  try {
    if (fs.existsSync(file.current_path)) {
      fs.renameSync(file.current_path, newPath);
    } else {
      log.warn(`Retroactive rename: source file not found at ${file.current_path}`);
    }
  } catch (err) {
    log.error(`Retroactive rename failed for ${file.current_path}: ${err.message}`);
    return { executed: false };
  }

  // Update file_metadata
  db.run(
    `UPDATE file_metadata SET
      current_filename = ?, current_path = ?, part_number = ?,
      has_pending_rename = 0, pending_rename_data = NULL, updated_at = datetime('now')
    WHERE id = ?`,
    [newFilename, newPath, partNumber, file.id]
  );

  // Log to rename_history
  const historyId = _uuid();
  db.run(
    `INSERT INTO rename_history (id, file_metadata_id, action, triggered_by, previous_filename, previous_path, new_filename, new_path, metadata_snapshot)
     VALUES (?, ?, 'retroactive_part', ?, ?, ?, ?, ?, ?)`,
    [historyId, file.id, triggeringHistoryId || null, file.current_filename, file.current_path, newFilename, newPath, snapshot]
  );

  database.save();
  log.info(`Retroactive rename: ${file.current_filename} → ${newFilename}`);
  return { executed: true, historyId };
}

// ── Date Extraction ──

/**
 * Extract YYYY-MM-DD date from an OBS filename like "2026-03-15 14-30-22.mp4"
 * Falls back to file creation date if pattern doesn't match.
 *
 * @param {string} filename - OBS output filename
 * @param {string} [filePath] - Full path (for fs.stat fallback)
 * @returns {string} YYYY-MM-DD date string
 */
function extractDateFromFilename(filename, filePath) {
  // Match YYYY-MM-DD at the start of the filename
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  // Fallback: use file creation date
  if (filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.birthtime.toISOString().slice(0, 10);
    } catch (e) {
      // Fallback to today
    }
  }

  return new Date().toISOString().slice(0, 10);
}

// ── Utility ──

function _uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Exports ──

module.exports = {
  PRESETS,
  formatFilename,
  validateLabel,
  calculateDayNumber,
  findCollisions,
  getNextPartNumber,
  isFileInUse,
  retroactiveRename,
  applyPendingRenames,
  extractDateFromFilename,
};
