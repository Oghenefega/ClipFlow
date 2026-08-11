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
 * @param {object} store - electron-store instance (whisperPythonPath)
 * @returns {Promise<{ok: boolean, issues: Array<{id, title, detail, fix}>}>}
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
      title: "FFmpeg is missing",
      detail: "ClipFlow uses FFmpeg for renaming, clip cutting, subtitles, rendering and audio — most of the app needs it.",
      fix: "Reinstall ClipFlow (the installer includes FFmpeg), or install FFmpeg yourself and add it to PATH, then hit Check again.",
    });
  }

  const pythonPath = store ? store.get("whisperPythonPath") : null;
  if (!pythonPath || !fs.existsSync(pythonPath)) {
    issues.push({
      id: "whisper-python",
      title: "Whisper (transcription) isn't set up",
      detail: pythonPath
        ? `The saved Python path no longer exists: ${pythonPath}`
        : "No Python path is set, so clips can't be transcribed or subtitled.",
      fix: "Open Settings → Tools & Credentials → BetterWhisperX Configuration and set \"Python Path (venv)\" — the Beta Tester Manual has the install steps.",
    });
  }

  const missingScripts = REQUIRED_SCRIPTS.filter(
    (rel) => !fs.existsSync(path.join(TOOLS_DIR, rel))
  );
  if (missingScripts.length > 0) {
    issues.push({
      id: "tool-scripts",
      title: "Part of ClipFlow's toolkit is missing",
      detail: `These bundled files weren't found: ${missingScripts.join(", ")} (looked in ${TOOLS_DIR}).`,
      fix: "Reinstall ClipFlow — this usually means a broken or incomplete install.",
    });
  }

  return { ok: issues.length === 0, issues };
}

module.exports = { checkDependencies };
