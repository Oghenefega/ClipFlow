/**
 * #472: a Recordings-tab import copies the dropped file into the watch folder.
 * Opening the copy's write stream truncates its target, so a target that is the
 * source itself (a recording already in the watch folder) or any existing file
 * would be wiped. Returns a message saying why the import can't go ahead, or
 * null when every path it would write is free.
 */
const path = require("path");
const fs = require("fs");

const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); // Windows paths ignore case

function importTargetProblem(sourcePath, targets) {
  for (const target of targets) {
    if (same(sourcePath, target)) {
      return "this recording is already in your recordings folder, so there's nothing to import. Rename it from the Rename tab instead";
    }
    if (fs.existsSync(target)) {
      return `a file named "${path.basename(target)}" is already in ${path.basename(path.dirname(target))}. Corva won't overwrite it`;
    }
  }
  return null;
}

module.exports = { importTargetProblem };
