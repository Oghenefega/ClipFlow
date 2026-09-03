/**
 * AI engine runtime setup (#146).
 *
 * Downloads the pre-built Python runtime ("AI engine") from ClipFlow's R2
 * bucket (engine.flowve.app), unpacks it into userData\runtime, verifies the
 * install with the existing stable-ts importability probe, points
 * whisperPythonPath at the new python.exe, then pre-downloads the Whisper
 * model so the first transcription isn't ambushed by a 1.6 GB fetch, and
 * finally the word-timing voter models (#357: HuBERT, Vosk, Parakeet).
 *
 * Design:
 *  - Offered when whisperPythonPath is unset or dangling, and again when a
 *    managed engine (engineRuntime set) is older than the hosted runtime or
 *    lacks a voter model (#357). Hand-pointed venvs (Fega's #251 D:\ machines,
 *    engineRuntime null) never see this flow.
 *  - Download resumes: partial file kept as <zip>.part, continued with an
 *    HTTP Range request; SHA-256 is re-computed over the existing bytes first
 *    so the final checksum still covers every byte on disk.
 *  - One job at a time; progress streams to the renderer over "setup:progress"
 *    (same throttled webContents.send shape as import:progress).
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const { execFile, spawn } = require("child_process");
const { app } = require("electron");
const logger = require("./logger");
const whisper = require("./whisper");
const {
  defaultHfHome, runtimeRoot, TIMING_MODELS, MODEL_MARKER, timingModelDir, installedModelSha,
} = require("./app-paths");

const MANIFEST_URL = "https://engine.flowve.app/engine/manifest.json";
// Space the model pre-download will need on top of the engine itself, plus a
// safety margin so we never run the disk to zero. Model ~1.6 GB.
const MODEL_RESERVE_BYTES = 1.8e9;
const DISK_MARGIN_BYTES = 0.5e9;

// ── module state: at most one active job ──────────────────────────────────
let job = null; // { phase, cancelRequested, request, child, webContents }

// #261: engineRoot setting ("" = default) lets the multi-GB engine + models
// live off the system drive — runtimeRoot() in app-paths.js, shared with the
// transcribe env since #357. whisperPythonPath is stored absolute, so the
// rest of the pipeline never resolves this again after setup.

// "1.1.0" newer than "1.0.0"? Plain dotted integers — the runtime version is ours.
function isNewerVersion(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

// Voter models the manifest lists that this machine lacks — or holds a
// different build of: the marker carries the zip's sha256 (#357).
function missingTimingModels(store, manifest) {
  return (manifest.models || []).filter((m) =>
    TIMING_MODELS[m.id] && installedModelSha(timingModelDir(store, m.id)) !== String(m.sha256).toLowerCase());
}

// Space the voter models still need: every unpacked tree, plus the largest
// zip (each zip coexists with its files only until its own unpack is done).
function timingReserveBytes(models) {
  return models.reduce((sum, m) => sum + (m.unpackedBytes || 0), 0)
    + models.reduce((max, m) => Math.max(max, m.sizeBytes || 0), 0);
}

/**
 * Persist a user-picked engine location (#261). Called from the
 * setup:chooseLocation IPC with a folder the OS dialog returned. The engine
 * lands in a "Corva AI" subfolder so picking a drive root stays tidy
 * (pre-rename "ClipFlow AI" folders are recognized so re-picking one
 * doesn't nest a second level).
 * Refused mid-job — the running download/unpack writes into the old root.
 */
function setLocation(store, pickedDir) {
  if (job) return { success: false, error: "Setup is already running." };
  const base = path.basename(pickedDir).toLowerCase();
  const newRoot = base === "corva ai" || base === "clipflow ai"
    ? pickedDir
    : path.join(pickedDir, "Corva AI");
  try {
    fs.mkdirSync(newRoot, { recursive: true });
  } catch (err) {
    return { success: false, error: `Can't create a folder there (${err.code || err.message}). Pick a different location.` };
  }
  // A location change strands anything the old root held (.part, staging,
  // broken engine dirs). No verified engine exists — this screen only shows
  // when whisperPythonPath is unset/dangling — so the old root is debris.
  const oldRoot = runtimeRoot(store);
  const pythonPath = store.get("whisperPythonPath");
  if (path.resolve(oldRoot) !== path.resolve(newRoot) && !(pythonPath && fs.existsSync(pythonPath))) {
    try { fs.rmSync(oldRoot, { recursive: true, force: true }); } catch (_) {}
  }
  store.set("engineRoot", newRoot);
  logger.info(logger.MODULES.system, `Engine install location set to ${newRoot}`);
  return { success: true, engineRoot: newRoot };
}

// A retained zip only ever exists checksummed — it's renamed from .part AFTER
// the digest matched — so size-match means it's reusable as-is (#256).
function zipReady(zipPath, sizeBytes) {
  try { return fs.statSync(zipPath).size === sizeBytes; } catch (_) { return false; }
}

/**
 * Clear debris a failed prior attempt left behind (#256): the staging dir, a
 * half-installed engine dir for this exact variant+version, and a wrong-size
 * zip. Without this, up to ~10 GB of leftovers sink the disk preflight and a
 * transient verify failure turns into a bogus "not enough disk space" on
 * retry. Never called while a job is running — unpack writes into these paths.
 */
function reclaimDebris(root, variant, version, zipPath, sizeBytes) {
  try { fs.rmSync(path.join(root, ".staging"), { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(path.join(root, `engine-${variant}-v${version}`), { recursive: true, force: true }); } catch (_) {}
  if (!zipReady(zipPath, sizeBytes)) {
    try { fs.rmSync(zipPath, { force: true }); } catch (_) {}
  }
}

function sendProgress(webContents, data) {
  try {
    if (webContents && !webContents.isDestroyed()) {
      webContents.send("setup:progress", data);
    }
  } catch (_) { /* window gone mid-send */ }
}

// ── GPU probe ──────────────────────────────────────────────────────────────
// nvidia-smi ships with the NVIDIA driver. Bare name first (PATH), then the
// System32 copy the driver installs. Any failure = no NVIDIA = cpu variant.
function detectGpu() {
  const candidates = [
    "nvidia-smi",
    path.join(process.env.SystemRoot || "C:\\Windows", "System32", "nvidia-smi.exe"),
  ];
  return candidates.reduce(
    (prev, bin) =>
      prev.then((found) => {
        if (found) return found;
        return new Promise((resolve) => {
          execFile(bin, ["--query-gpu=name", "--format=csv,noheader"], { timeout: 4000 }, (err, stdout) => {
            if (err || !stdout.trim()) return resolve(null);
            resolve(stdout.trim().split(/\r?\n/)[0].trim());
          });
        });
      }),
    Promise.resolve(null)
  ).then((gpuName) => ({ hasNvidia: !!gpuName, gpuName }));
}

// ── manifest fetch ─────────────────────────────────────────────────────────
async function fetchManifest() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(MANIFEST_URL, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Free space on the drive holding `dir`. The dir itself may not exist yet
// (custom engineRoot before first download) — walk up to the nearest
// existing ancestor so the right drive still gets measured (#261).
function freeDiskBytes(dir) {
  let p = dir;
  for (;;) {
    try {
      const st = fs.statfsSync(p);
      return st.bavail * st.bsize;
    } catch (_) {
      const parent = path.dirname(p);
      if (parent === p) return null; // unknown — preflight becomes advisory only
      p = parent;
    }
  }
}

/**
 * Free bytes the setup still needs at its worst moment (#261). Disk usage
 * peaks either while unpacking (zip + unpacked tree coexist) or during the
 * model downloads (zip already deleted, models landing — `reserveBytes`).
 * The old sum stacked the model on top of a zip that's gone by then —
 * over-asking by ~1.8 GB. `zipOnDiskBytes` (the .part or a complete zip) is
 * already spent, so it offsets the post-delete term.
 */
function requiredFreeBytes(downloadBytes, zipOnDiskBytes, unpackedBytes, reserveBytes) {
  return Math.max(
    downloadBytes + unpackedBytes,
    unpackedBytes - zipOnDiskBytes + reserveBytes
  ) + DISK_MARGIN_BYTES;
}

/**
 * Everything the setup screen needs to render its first frame.
 * Cheap where possible; the manifest fetch is the only network hit and is
 * reported separately so an offline machine still gets a usable answer.
 * `mode`: "fresh" (no engine), "upgrade" (managed engine older than the
 * hosted runtime), "models" (engine current, voter models missing) (#357).
 */
async function getState(store) {
  const pythonPath = store.get("whisperPythonPath");
  const engineValid = !!pythonPath && fs.existsSync(pythonPath);
  const managed = engineValid ? store.get("engineRuntime") : null;
  const active = job ? { phase: job.phase } : null;

  // A hand-pointed engine is never offered anything — and never costs a
  // manifest fetch at boot. (active can outlive needed: whisperPythonPath is
  // set BEFORE the model phases run, so a still-running job must keep
  // reporting itself or the screen closes early — session-168+1 E2E.)
  if (engineValid && !managed) {
    return { needed: false, pythonPath, active };
  }

  const { hasNvidia, gpuName } = await detectGpu();
  const variant = hasNvidia ? "cuda" : "cpu";

  let manifest = null;
  let manifestError = null;
  try {
    manifest = await fetchManifest();
  } catch (err) {
    manifestError = err.message;
  }

  // Managed engine: needed only when the hosted runtime moved past the
  // installed one (v1.1.0 carries the voters) or a voter model is missing.
  let mode = "fresh";
  if (engineValid) {
    if (!manifest) return { needed: false, pythonPath, active };
    const upgrade = isNewerVersion(manifest.version, managed.version);
    if (!upgrade && missingTimingModels(store, manifest).length === 0) {
      return { needed: false, pythonPath, active };
    }
    mode = upgrade ? "upgrade" : "models";
  }

  const root = runtimeRoot(store);
  const freeBytes = freeDiskBytes(root);
  let requiredBytes = null;
  let resumeBytes = 0;
  let timingBytes = 0;
  if (manifest) {
    const timing = missingTimingModels(store, manifest);
    timingBytes = timing.reduce((sum, m) => sum + (m.sizeBytes || 0), 0);
    // an existing engine already holds the speech model; only the voters are still to land
    const reserve = timingReserveBytes(timing) + (mode === "fresh" ? MODEL_RESERVE_BYTES : 0);
    if (mode === "models") {
      requiredBytes = reserve + DISK_MARGIN_BYTES;
    } else if (manifest.variants && manifest.variants[variant]) {
      const v = manifest.variants[variant];
      const partPath = path.join(root, ".download", `${v.file}.part`);
      const zipPath = path.join(root, ".download", v.file);
      // Clear failed-attempt leftovers before measuring (#256) — but never while
      // a job is live (unpack/download write into these paths).
      if (!job) reclaimDebris(root, variant, manifest.version, zipPath, v.sizeBytes);
      try { resumeBytes = fs.statSync(partPath).size; } catch (_) { /* no partial */ }
      // Space still needed FROM HERE: bytes already saved (.part) or a fully
      // downloaded zip don't need downloading again (#256).
      const haveZip = zipReady(zipPath, v.sizeBytes);
      const downloadBytes = haveZip ? 0 : Math.max(0, v.sizeBytes - resumeBytes);
      requiredBytes = requiredFreeBytes(downloadBytes, haveZip ? v.sizeBytes : resumeBytes, v.unpackedBytes, reserve);
    }
  }

  return {
    needed: true,
    mode,
    engineRoot: root,
    variant,
    gpuName,
    manifest,
    manifestError,
    freeBytes,
    requiredBytes,
    resumeBytes,
    timingBytes,
    active,
  };
}

// ── download with resume + streamed sha256 ─────────────────────────────────
function hashExistingPart(partPath, onTick) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(partPath);
    let bytes = 0;
    stream.on("data", (chunk) => {
      if (job && job.cancelRequested) {
        stream.destroy();
        return reject(Object.assign(new Error("cancelled"), { cancelled: true }));
      }
      hash.update(chunk);
      bytes += chunk.length;
      onTick(bytes);
    });
    stream.on("error", reject);
    stream.on("end", () => resolve({ hash, bytes }));
  });
}

// No data for this long → treat as a dead connection. A silent stall (Wi-Fi
// off, airplane mode — no reset packet ever arrives) otherwise freezes the
// progress bar forever, since only real socket errors reject (#258).
const STALL_TIMEOUT_MS = 60000;

// `phase` labels the progress events; `onProgress(bytesDone, speedBps)` takes
// over reporting when the caller folds several files into one bar (#357).
function downloadWithResume({ url, partPath, totalBytes, webContents, phase = "download", onProgress }) {
  return new Promise(async (resolveRaw, rejectRaw) => {
    let stallTimer = null;
    const resolve = (v) => { clearTimeout(stallTimer); resolveRaw(v); };
    const reject = (e) => { clearTimeout(stallTimer); rejectRaw(e); };
    let startAt = 0;
    let hash = crypto.createHash("sha256");
    try {
      if (fs.existsSync(partPath)) {
        const size = fs.statSync(partPath).size;
        if (size > 0 && size <= totalBytes) {
          sendProgress(webContents, { phase, pct: null, message: "Checking saved download..." });
          const res = await hashExistingPart(partPath, () => {});
          hash = res.hash;
          startAt = res.bytes;
        } else {
          fs.rmSync(partPath, { force: true }); // oversized/corrupt partial
        }
      }
    } catch (err) {
      if (err.cancelled) return reject(err);
      try { fs.rmSync(partPath, { force: true }); } catch (_) {}
      startAt = 0;
      hash = crypto.createHash("sha256");
    }

    const headers = startAt > 0 ? { Range: `bytes=${startAt}-` } : {};
    const request = https.get(url, { headers }, (res) => {
      if (startAt > 0 && res.statusCode === 200) {
        // Server ignored the Range — start over so hash and file agree.
        clearTimeout(stallTimer); // the retry runs its own watchdog (#258)
        res.destroy();
        try { fs.rmSync(partPath, { force: true }); } catch (_) {}
        return downloadWithResume({ url, partPath, totalBytes, webContents, phase, onProgress }).then(resolve, reject);
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        res.resume();
        return reject(new Error(`download HTTP ${res.statusCode}`));
      }

      const out = fs.createWriteStream(partPath, { flags: startAt > 0 ? "a" : "w" });
      let done = startAt;
      let lastSent = 0;
      const samples = []; // [t, bytes] rolling window for speed
      res.on("data", (chunk) => {
        if (job && job.cancelRequested) {
          request.destroy();
          out.end();
          return; // close handler rejects below
        }
        hash.update(chunk);
        done += chunk.length;
        const now = Date.now();
        samples.push([now, done]);
        while (samples.length > 2 && now - samples[0][0] > 5000) samples.shift();
        if (now - lastSent > 250) {
          lastSent = now;
          const [t0, b0] = samples[0];
          const speedBps = now > t0 ? ((done - b0) * 1000) / (now - t0) : 0;
          if (onProgress) { onProgress(done, speedBps); return; }
          sendProgress(webContents, {
            phase: "download",
            pct: Math.floor((done / totalBytes) * 100),
            bytesDone: done,
            bytesTotal: totalBytes,
            speedBps,
            etaSec: speedBps > 0 ? Math.round((totalBytes - done) / speedBps) : null,
          });
        }
      });
      armStall(); // response is live — from here, silence means a dead line (#258)
      res.on("data", armStall);
      res.pipe(out);
      out.on("finish", () => {
        if (job && job.cancelRequested) {
          return reject(Object.assign(new Error("cancelled"), { cancelled: true }));
        }
        if (done !== totalBytes) {
          // connection closed early — keep the part for resume
          return reject(Object.assign(new Error("connection lost before the download finished"), { resumable: true }));
        }
        resolve(hash.digest("hex"));
      });
      out.on("error", reject);
      res.on("error", (err) => {
        out.end();
        // Cancel destroys the request, which surfaces here as an "aborted"
        // stream error — without this check it wins the race against the
        // cancelled rejection and the UI shows "connection dropped" (#257).
        if (job && job.cancelRequested) {
          return reject(Object.assign(new Error("cancelled"), { cancelled: true }));
        }
        reject(Object.assign(err, { resumable: true }));
      });
    });
    const armStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        try { request.destroy(); } catch (_) {}
        reject(Object.assign(new Error("connection lost before the download finished"), { resumable: true }));
      }, STALL_TIMEOUT_MS);
    };
    armStall(); // covers a request that never gets a response
    job.request = request;
    request.on("error", (err) => {
      if (job && job.cancelRequested) {
        return reject(Object.assign(new Error("cancelled"), { cancelled: true }));
      }
      reject(Object.assign(err, { resumable: true }));
    });
  });
}

// ── unpack via bsdtar (ships with Windows 10+; zero npm deps) ──────────────
function unpackZip(zipPath, destDir, webContents, phase = "unpack") {
  return new Promise((resolve, reject) => {
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(destDir, { recursive: true });
    const tarExe = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
    sendProgress(webContents, { phase, pct: null, message: "Unpacking files..." });
    const child = spawn(tarExe, ["-xf", zipPath, "-C", destDir]);
    job.child = child;
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      job.child = null;
      if (job.cancelRequested) return reject(Object.assign(new Error("cancelled"), { cancelled: true }));
      if (code !== 0) return reject(new Error(`unpack failed (tar exit ${code}): ${stderr.slice(0, 300)}`));
      resolve();
    });
  });
}

// ── model pre-download via the freshly installed runtime ───────────────────
function downloadModel(pythonExe, store, webContents) {
  return new Promise((resolve, reject) => {
    const scriptPath = app.isPackaged
      ? path.join(process.resourcesPath, "tools", "download_model.py")
      : path.join(__dirname, "..", "..", "tools", "download_model.py");
    const model = store.get("whisperModel") || "large-v3-turbo";
    const hfHome = store.get("hfHome") || defaultHfHome();
    fs.mkdirSync(hfHome, { recursive: true });

    sendProgress(webContents, { phase: "model", pct: 0, message: "Starting speech model download..." });
    const child = spawn(pythonExe, ["-X", "utf8", scriptPath, "--model", model], {
      env: { ...process.env, HF_HOME: hfHome, HF_HUB_DISABLE_PROGRESS_BARS: "1" },
    });
    job.child = child;
    let totalBytes = 0;
    let stderrTail = "";
    child.stdout.on("data", (data) => {
      for (const line of data.toString().split(/\r?\n/)) {
        const t = line.match(/^TOTAL (\d+)/);
        if (t) totalBytes = parseInt(t[1], 10);
        const p = line.match(/^PROGRESS (\d+) (\d+)/);
        if (p) {
          sendProgress(webContents, {
            phase: "model",
            pct: parseInt(p[1], 10),
            bytesDone: parseInt(p[2], 10),
            bytesTotal: totalBytes || null,
          });
        }
      }
    });
    child.stderr.on("data", (d) => { stderrTail = (stderrTail + d.toString()).slice(-500); });
    child.on("error", reject);
    child.on("close", (code) => {
      job.child = null;
      if (job.cancelRequested) return reject(Object.assign(new Error("cancelled"), { cancelled: true }));
      if (code !== 0) return reject(new Error(`model download failed: ${stderrTail.slice(-300) || `exit ${code}`}`));
      resolve();
    });
  });
}

// ── word-timing voter models (#357) ───────────────────────────────────────
// Same download / checksum / unpack path as the engine, one model at a time,
// reported as a single bar across every model still missing. Each zip is
// deleted right after its unpack; the marker makes a rerun skip what landed.
async function downloadTimingModels(store, manifest, webContents) {
  const todo = missingTimingModels(store, manifest);
  const allBytes = todo.reduce((sum, m) => sum + m.sizeBytes, 0);
  const root = runtimeRoot(store);
  let doneBytes = 0;
  for (const m of todo) {
    const zipPath = path.join(root, ".download", m.file);
    const partPath = `${zipPath}.part`;
    fs.mkdirSync(path.dirname(zipPath), { recursive: true });
    if (!zipReady(zipPath, m.sizeBytes)) {
      const digest = await downloadWithResume({
        url: m.url, partPath, totalBytes: m.sizeBytes, webContents, phase: "timing",
        onProgress: (got, speedBps) => sendProgress(webContents, {
          phase: "timing",
          pct: Math.floor(((doneBytes + got) / allBytes) * 100),
          bytesDone: doneBytes + got,
          bytesTotal: allBytes,
          speedBps,
          etaSec: speedBps > 0 ? Math.round((allBytes - doneBytes - got) / speedBps) : null,
        }),
      });
      if (digest !== String(m.sha256).toLowerCase()) {
        try { fs.rmSync(partPath, { force: true }); } catch (_) {}
        throw new Error("A timing model didn't verify — it may have been corrupted in transit. The download was cleared; try again.");
      }
      fs.renameSync(partPath, zipPath);
    }
    const dest = timingModelDir(store, m.id);
    await unpackZip(zipPath, dest, webContents, "timing");
    fs.writeFileSync(path.join(dest, MODEL_MARKER), JSON.stringify({
      id: m.id, sha256: String(m.sha256).toLowerCase(), installedAt: new Date().toISOString(),
    }));
    try { fs.rmSync(zipPath, { force: true }); } catch (_) {}
    doneBytes += m.sizeBytes;
    logger.info(logger.MODULES.system, `Timing model installed: ${m.id}`, { dir: dest });
  }
}

/**
 * Run the whole setup. Progress streams over "setup:progress"; the returned
 * promise is the final word. Retry-friendly: a valid engine that is current
 * (or hand-pointed, no engineRuntime record) skips straight to the model
 * phases — so a model-only failure never re-downloads 2.7 GB. A managed
 * engine older than the hosted runtime is replaced first (#357: v1.1.0
 * carries the voters), then the old engine dir is reclaimed.
 */
async function start(store, webContents) {
  if (job) return { success: false, error: "Setup is already running.", phase: job.phase };
  job = { phase: "starting", cancelRequested: false, request: null, child: null };

  const fail = (phase, err) => {
    const cancelled = !!err.cancelled;
    logger.warn(logger.MODULES.system, `Engine setup ${cancelled ? "cancelled" : "failed"} at ${phase}`, { error: err.message });
    sendProgress(webContents, {
      phase: "error",
      errorPhase: phase,
      cancelled,
      resumable: !!err.resumable || phase === "download",
      message: err.message,
    });
    job = null;
    return { success: false, phase, error: err.message, cancelled };
  };

  try {
    job.phase = "manifest";
    let manifest, variant;
    try {
      const gpu = await detectGpu();
      variant = gpu.hasNvidia ? "cuda" : "cpu";
      manifest = await fetchManifest();
    } catch (err) {
      err.resumable = true;
      return fail("manifest", err);
    }

    const existingPython = store.get("whisperPythonPath");
    const managed = store.get("engineRuntime");
    const engineValid = !!existingPython && fs.existsSync(existingPython);
    const upgrade = engineValid && !!managed && isNewerVersion(manifest.version, managed.version);
    let pythonExe = existingPython;

    if (!engineValid || upgrade) {
      const v = manifest.variants && manifest.variants[variant];
      if (!v) return fail("manifest", new Error(`manifest has no "${variant}" variant`));

      // ── disk preflight ──
      const root = runtimeRoot(store);
      const partPath = path.join(root, ".download", `${v.file}.part`);
      const zipPath = path.join(root, ".download", v.file);
      reclaimDebris(root, variant, manifest.version, zipPath, v.sizeBytes); // failed-attempt leftovers must not sink the preflight (#256)
      const haveZip = zipReady(zipPath, v.sizeBytes);
      const free = freeDiskBytes(root);
      let already = 0;
      try { already = fs.statSync(partPath).size; } catch (_) {}
      // an upgrade already holds the speech model; only the voters are still to land
      const reserve = timingReserveBytes(missingTimingModels(store, manifest)) + (upgrade ? 0 : MODEL_RESERVE_BYTES);
      const required = requiredFreeBytes(haveZip ? 0 : Math.max(0, v.sizeBytes - already), haveZip ? v.sizeBytes : already, v.unpackedBytes, reserve);
      if (free !== null && free < required) {
        const needGb = (required / 1e9).toFixed(1);
        const freeGb = (free / 1e9).toFixed(1);
        return fail("disk", new Error(`Not enough disk space: setup needs about ${needGb} GB free, this drive has ${freeGb} GB.`));
      }

      // ── download + checksum (skipped when a checksummed zip is already on disk, #256) ──
      if (!haveZip) {
        job.phase = "download";
        fs.mkdirSync(path.dirname(partPath), { recursive: true });
        let digest;
        try {
          digest = await downloadWithResume({ url: v.url, partPath, totalBytes: v.sizeBytes, webContents });
        } catch (err) {
          return fail("download", err);
        }
        if (digest !== v.sha256.toLowerCase()) {
          try { fs.rmSync(partPath, { force: true }); } catch (_) {}
          return fail("checksum", new Error("The downloaded file didn't verify — it may have been corrupted in transit. The download was cleared; try again."));
        }
        fs.renameSync(partPath, zipPath);
      }

      // ── unpack to staging, then move into place ──
      job.phase = "unpack";
      const stagingDir = path.join(root, ".staging");
      const finalDir = path.join(root, `engine-${variant}-v${manifest.version}`);
      try {
        await unpackZip(zipPath, stagingDir, webContents);
        fs.rmSync(finalDir, { recursive: true, force: true });
        fs.renameSync(stagingDir, finalDir);
      } catch (err) {
        return fail("unpack", err);
      }

      // ── verify with the existing importability probe ──
      job.phase = "verify";
      sendProgress(webContents, { phase: "verify", pct: null, message: "Checking everything works..." });
      pythonExe = path.join(finalDir, "python.exe");
      // 3-minute budget: the first import runs while Defender scans the freshly
      // unpacked binaries — 30s fails cold machines whose engine is fine (#256).
      const check = await whisper.checkWhisper(pythonExe, { timeoutMs: 180000 });
      if (!check.installed) {
        return fail("verify", new Error(`The engine unpacked but failed its self-check: ${check.error || "unknown"}`));
      }
      logger.info(logger.MODULES.system, "Engine runtime verified", { variant, version: manifest.version, probe: check.version });

      // ── configure + reclaim the zip's disk space before the models land ──
      store.set("whisperPythonPath", pythonExe);
      store.set("engineRuntime", { variant, version: manifest.version, installedAt: new Date().toISOString() });
      // Custom install location → the speech model follows the engine onto the
      // same drive (#261). Only when hfHome was never set: an established cache
      // must not be abandoned and re-downloaded elsewhere.
      if (store.get("engineRoot") && !store.get("hfHome")) {
        store.set("hfHome", path.join(root, "hf_cache"));
      }
      try { fs.rmSync(zipPath, { force: true }); } catch (_) {}
      if (upgrade) {
        // the replaced engine is debris now that the new one is verified and configured
        const oldDir = path.join(root, `engine-${managed.variant}-v${managed.version}`);
        if (path.resolve(oldDir) !== path.resolve(finalDir)) {
          try { fs.rmSync(oldDir, { recursive: true, force: true }); } catch (_) {}
        }
        logger.info(logger.MODULES.system, "Engine runtime upgraded", { from: managed.version, to: manifest.version });
      }
    }

    // ── speech model pre-download ──
    job.phase = "model";
    try {
      await downloadModel(pythonExe, store, webContents);
    } catch (err) {
      // Engine is installed and configured — a model failure is retryable on
      // its own (start() re-enters at the model phase next time).
      return fail("model", err);
    }

    // ── word-timing voter models (#357) ──
    job.phase = "timing";
    try {
      await downloadTimingModels(store, manifest, webContents);
    } catch (err) {
      return fail("timing", err);
    }

    sendProgress(webContents, { phase: "done" });
    logger.info(logger.MODULES.system, "Engine setup complete", { variant, version: manifest.version });
    job = null;
    return { success: true };
  } catch (err) {
    return fail(job ? job.phase : "unknown", err);
  }
}

function cancel() {
  if (!job) return;
  job.cancelRequested = true;
  try { if (job.request) job.request.destroy(); } catch (_) {}
  try { if (job.child) job.child.kill(); } catch (_) {}
}

module.exports = { getState, start, cancel, setLocation, MANIFEST_URL };
