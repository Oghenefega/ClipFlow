/**
 * First-run dependency check (#251).
 *
 * Answers one question in plain language BEFORE any pipeline work starts:
 * "can this machine actually run a job, and if not, what exactly is missing
 * and what should the user do about it?"
 *
 * Wired in twice:
 *  - app launch → renderer shows a banner listing the issues (DependencyBanner)
 *  - pipeline start → pipeline:generateClips refuses early with the same
 *    message instead of dying mid-run at a deep stage
 *
 * Checks are cheap by design (file existence + a fast -version spawn); the
 * heavyweight "is stable-ts importable" probe stays in Settings where the
 * user explicitly asks for it.
 *
 * #407: issues carry `blocking`. A blocking issue means a job physically
 * cannot run (no FFmpeg, no Whisper); the pipeline refuses on those. A
 * non-blocking one is a setting the user will need LATER — the banner says so
 * up front instead of letting them discover it at the end of a long run.
 */

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { FFMPEG_BIN, FFPROBE_BIN } = require("./app-paths");

// Bundled tool scripts root — same resolution as transcribe.py (#143) and
// signals/*.py (#190): packaged → extraResources resources/tools/, source →
// repo tools/. Guarded require so the module loads outside Electron.
let _electronApp = null;
try { _electronApp = require("electron").app; } catch (_) { /* not in Electron */ }
const TOOLS_DIR = _electronApp && _electronApp.isPackaged
  ? path.join(process.resourcesPath, "tools")
  : path.join(__dirname, "..", "..", "tools");

// Every script a pipeline run shells out to. A missing one means a broken
// install (or a source tree without the repo files) — worth naming up front.
const REQUIRED_SCRIPTS = [
  "transcribe.py",
  "energy_scorer.py",
  path.join("signals", "yamnet_events.py"),
  path.join("signals", "pitch_spike.py"),
];

/** Fast "does this binary run" probe. */
function binaryWorks(bin) {
  return new Promise((resolve) => {
    execFile(bin, ["-version"], { timeout: 5000 }, (err) => resolve(!err));
  });
}

/**
 * Run all dependency checks.
 * @param {object} store - electron-store instance (whisperPythonPath, outputFolder)
 * @returns {Promise<{ok: boolean, canRunJobs: boolean, issues: Array<{id, blocking, title, detail, fix}>}>}
 *   ok — nothing outstanding at all (drives the banner's visibility)
 *   canRunJobs — nothing BLOCKING outstanding (drives the pipeline's refusal)
 */
async function checkDependencies(store) {
  const issues = [];

  const [ffmpegOk, ffprobeOk] = await Promise.all([
    binaryWorks(FFMPEG_BIN),
    binaryWorks(FFPROBE_BIN),
  ]);
  if (!ffmpegOk || !ffprobeOk) {
    issues.push({
      id: "ffmpeg",
      blocking: true,
      title: "FFmpeg is missing",
      detail: "Corva uses FFmpeg for renaming, clip cutting, subtitles, rendering and audio — most of the app needs it.",
      fix: "Reinstall Corva (the installer includes FFmpeg), or install FFmpeg yourself and add it to PATH, then hit Check again.",
    });
  }

  const pythonPath = store ? store.get("whisperPythonPath") : null;
  if (!pythonPath || !fs.existsSync(pythonPath)) {
    issues.push({
      id: "whisper-python",
      blocking: true,
      title: "Whisper (transcription) isn't set up",
      detail: pythonPath
        ? `The saved Python path no longer exists: ${pythonPath}`
        : "No Python path is set, so clips can't be transcribed or subtitled.",
      fix: "Click Finish Setup to download Corva's AI engine — one download, no manual installs.",
    });
  }

  const missingScripts = REQUIRED_SCRIPTS.filter(
    (rel) => !fs.existsSync(path.join(TOOLS_DIR, rel))
  );
  if (missingScripts.length > 0) {
    issues.push({
      id: "tool-scripts",
      blocking: true,
      title: "Part of Corva's toolkit is missing",
      detail: `These bundled files weren't found: ${missingScripts.join(", ")} (looked in ${TOOLS_DIR}).`,
      fix: "Reinstall Corva — this usually means a broken or incomplete install.",
    });
  }

  // #407: not a machine capability — a setting the user is never asked for and
  // only discovers at Render, after a full pipeline run. Non-blocking on
  // purpose: generating and reviewing clips works fine without it.
  const outputFolder = store ? store.get("outputFolder") : null;
  if (!outputFolder) {
    issues.push({
      id: "output-folder",
      blocking: false,
      title: "No output folder set",
      detail: "Rendered clips need somewhere to land. Nothing stops until you render, and then it fails.",
      fix: "Set an Output Folder in Settings → Files & Folders.",
    });
  }

  return {
    ok: issues.length === 0,
    canRunJobs: issues.every((i) => !i.blocking),
    issues,
  };
}

module.exports = { checkDependencies };
