/**
 * Machine-local binary + cache path resolution (#251).
 *
 * ClipFlow must run on machines that aren't Fega's: FFmpeg ships in the
 * installer via extraResources (resources/ffmpeg/), and the model cache
 * defaults to per-user app data instead of a hardcoded drive letter.
 *
 * This module is deliberately dependency-free (no logger, guarded electron
 * require) so it stays loadable under the replay-score harness's plain-node
 * electron stub — same constraint as gemini-watch.js and signals.js.
 */

const path = require("path");
const fs = require("fs");

// Guarded require so the module loads outside Electron too (unit tests,
// replay-score harness) — non-Electron callers resolve repo-relative,
// same as an unpackaged app (pattern from signals.js #190).
let _electronApp = null;
try { _electronApp = require("electron").app; } catch (_) { /* not in Electron */ }

// Bundled FFmpeg lives in resources/ffmpeg/ in the packaged app. From source
// it's vendor/ffmpeg/ (git-ignored — the exes are too big for GitHub; run
// scripts/fetch-ffmpeg.ps1 once to populate it).
const BUNDLED_FFMPEG_DIR = _electronApp && _electronApp.isPackaged
  ? path.join(process.resourcesPath, "ffmpeg")
  : path.join(__dirname, "..", "..", "vendor", "ffmpeg");

// Bundled copy first; bare name (→ PATH lookup) only as fallback, so a
// machine with no FFmpeg installed works out of the box while Fega's own
// PATH install still covers a missing vendor/ dir when running from source.
function resolveFfmpegBin(name) {
  const bundled = path.join(BUNDLED_FFMPEG_DIR, `${name}.exe`);
  return fs.existsSync(bundled) ? bundled : name;
}

const FFMPEG_BIN = resolveFfmpegBin("ffmpeg");
const FFPROBE_BIN = resolveFfmpegBin("ffprobe");

/**
 * Env for child processes that invoke ffmpeg/ffprobe by bare name themselves
 * (energy_scorer.py, WhisperX's audio loader). Prepends the bundled FFmpeg
 * dir to PATH so those lookups hit the shipped copy on machines without a
 * system FFmpeg. No bundle present → env unchanged.
 */
function envWithBundledFfmpeg(baseEnv = process.env) {
  if (!fs.existsSync(path.join(BUNDLED_FFMPEG_DIR, "ffmpeg.exe"))) return { ...baseEnv };
  // Windows env keys are case-insensitive but JS objects aren't — reuse the
  // existing key ("Path"/"PATH") or spawning would pass two conflicting vars.
  const pathKey = Object.keys(baseEnv).find((k) => k.toUpperCase() === "PATH") || "PATH";
  return { ...baseEnv, [pathKey]: `${BUNDLED_FFMPEG_DIR};${baseEnv[pathKey] || ""}` };
}

/**
 * Default HuggingFace model cache when the hfHome setting is empty:
 * per-user app data. Lazy electron access — never touched at require time.
 */
function defaultHfHome() {
  return path.join(require("electron").app.getPath("userData"), "hf_cache");
}

module.exports = { BUNDLED_FFMPEG_DIR, FFMPEG_BIN, FFPROBE_BIN, envWithBundledFfmpeg, defaultHfHome };
