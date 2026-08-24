const fs = require("fs");

/**
 * Crash-safe file write (#299).
 *
 * Every writer in the app used to overwrite its file in place, so a process
 * death mid-write left a truncated file behind. For clipflow.db that is fatal —
 * the next launch throws inside database.init() and the app never opens (#298);
 * for project.json it silently drops a project out of the Projects tab.
 *
 * Write to a sibling temp file, flush it to the physical disk, then rename over
 * the target. Rename is atomic on NTFS within a volume, so a reader always sees
 * either the whole old file or the whole new one — never half of either.
 *
 * @param {string} filePath   Destination.
 * @param {string|Buffer} data
 * @param {string} [backupPath]  When given, the file being replaced is renamed
 *   here first, leaving one rolling copy of the last good write. A rename, not
 *   a copy, so the cost does not grow with the file.
 */
function writeFileAtomicSync(filePath, data, backupPath = null) {
  const tmp = `${filePath}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  let demoted = false;
  try {
    if (backupPath && fs.existsSync(filePath)) {
      fs.renameSync(filePath, backupPath);
      demoted = true;
    }
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // A refused swap (read-only file, drive pulled, file locked) must leave the
    // folder exactly as it was: no half-written sibling, and the original still
    // in place — not stranded under the backup name where the next save would
    // overwrite it.
    try { fs.unlinkSync(tmp); } catch (_) {}
    if (demoted) { try { fs.renameSync(backupPath, filePath); } catch (_) {} }
    throw err;
  }
}

module.exports = { writeFileAtomicSync };
