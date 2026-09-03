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

/**
 * #249 Option A: the shared beta gateway token ships IN THE BUILD but stays
 * OUT of git (GitHub push protection rejects committed live tokens — same
 * reasoning as vendor/ffmpeg staying out of the repo). Packaged apps read
 * resources/beta-token.json (extraResources); source runs read the
 * git-ignored vendor/beta-token.json. Missing file → "" → the app falls back
 * to raw API keys / a user-pasted token, so a fresh clone still runs.
 */
function bundledGatewayToken() {
  const tokenFile = _electronApp && _electronApp.isPackaged
    ? path.join(process.resourcesPath, "beta-token.json")
    : path.join(__dirname, "..", "..", "vendor", "beta-token.json");
  try {
    const token = JSON.parse(fs.readFileSync(tokenFile, "utf8")).gatewayAuthToken;
    return typeof token === "string" ? token.trim() : "";
  } catch (_) {
    return "";
  }
}

/**
 * Engine root (#146/#261): the engineRoot setting ("" = default) lets the
 * multi-GB engine + models live off the system drive. Lazy electron access.
 */
function runtimeRoot(store) {
  return store.get("engineRoot") || path.join(require("electron").app.getPath("userData"), "runtime");
}

/**
 * #357: the word-timing voter models Finish Setup installs under the engine
 * root. `dir` is where the model zip unpacks (and where the marker lives);
 * `env` is the variable transcribe.py reads, pointing at `envDir` (defaults
 * to `dir`). HuBERT is fetched by torchaudio through TORCH_HOME/hub/checkpoints,
 * so its zip unpacks two levels down while the env var names the root.
 */
const TIMING_MODELS = {
  hubert:   { dir: path.join("torch_home", "hub", "checkpoints"), envDir: "torch_home", env: "TORCH_HOME" },
  vosk:     { dir: path.join("models", "vosk"), env: "CORVA_VOSK_MODEL" },
  parakeet: { dir: path.join("models", "parakeet"), env: "CORVA_PARAKEET_MODEL" },
};
// Written into a model's dir after a verified unpack: { id, sha256 }. The
// sha256 is the zip's, so a republished model re-downloads by itself.
const MODEL_MARKER = ".corva-model.json";

function timingModelDir(store, id) {
  return path.join(runtimeRoot(store), TIMING_MODELS[id].dir);
}

function installedModelSha(dir) {
  try {
    const sha = JSON.parse(fs.readFileSync(path.join(dir, MODEL_MARKER), "utf8")).sha256;
    return typeof sha === "string" ? sha.toLowerCase() : null;
  } catch (_) {
    return null;
  }
}

/**
 * Env for the transcribe child: one variable per installed voter model.
 * Machines without them (a hand-pointed venv, or Finish Setup not yet run)
 * get nothing, so word_timing.py falls back to its own defaults.
 */
function timingModelEnv(store) {
  const env = {};
  if (!store) return env;
  const root = runtimeRoot(store);
  for (const [id, m] of Object.entries(TIMING_MODELS)) {
    if (installedModelSha(path.join(root, m.dir))) env[m.env] = path.join(root, m.envDir || m.dir);
  }
  return env;
}

module.exports = {
  BUNDLED_FFMPEG_DIR, FFMPEG_BIN, FFPROBE_BIN, envWithBundledFfmpeg, defaultHfHome, bundledGatewayToken,
  runtimeRoot, TIMING_MODELS, MODEL_MARKER, timingModelDir, installedModelSha, timingModelEnv,
};
