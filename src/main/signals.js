const path = require("path");
const fs = require("fs");
const readline = require("readline");
const { spawn } = require("child_process");

// Heartbeat protocol v1 (Issue #72 Phase 1). Python signal scripts emit lines
// matching /^PROGRESS\s+([0-9.]+)\s*$/ on stderr. Each line resets the stall
// timer and feeds per-signal progress to the renderer.
const PROGRESS_RE = /^PROGRESS\s+([0-9]*\.?[0-9]+)\s*$/;

// Per-signal stall timer fires this long after the last PROGRESS line (post
// startup grace). Founder-locked at 30s — if any signal goes silent that long,
// the user gets a clear failure instead of a 5-min silent wait.
const STALL_TIMEOUT_MS = 30000;

// ─── Archetype-aware composite weights ───
// scene_change dropped 2026-04-25 — proved low signal density on gaming content
// (6 cuts in 30 min for RL) and lagging vs audio reaction signals; the 0.05
// it held is folded into energy across all archetypes.
// #190: game_energy (0.10) + game_yamnet (0.05) shaved proportionally from the
// mic-side weights (each × 0.85) so every row still sums to 1. When the game
// track isn't configured, redistributeWeights() drops the game keys and the
// division by 0.85 restores the original mic-only split — single-track runs
// score exactly as before (unit-tested in signals.test.js).
const ARCHETYPE_WEIGHTS = {
  hype:        { energy: 0.4675, yamnet: 0.1275, pitch: 0.085,  density: 0.0425, reaction_words: 0.085,  spike: 0.0425, game_energy: 0.10, game_yamnet: 0.05 },
  competitive: { energy: 0.3825, yamnet: 0.1275, pitch: 0.1275, density: 0.085,  reaction_words: 0.085,  spike: 0.0425, game_energy: 0.10, game_yamnet: 0.05 },
  chill:       { energy: 0.2975, yamnet: 0.085,  pitch: 0.17,   density: 0.1275, reaction_words: 0.1275, spike: 0.0425, game_energy: 0.10, game_yamnet: 0.05 },
  variety:     { energy: 0.3825, yamnet: 0.1275, pitch: 0.1275, density: 0.085,  reaction_words: 0.085,  spike: 0.0425, game_energy: 0.10, game_yamnet: 0.05 },
};

function resolveArchetypeWeights(archetype) {
  const key = archetype === "just_chatting" ? "chill" : archetype;
  return ARCHETYPE_WEIGHTS[key] || ARCHETYPE_WEIGHTS.variety;
}

// YAMNet classes that count as reaction events (for yamnet_boost). Must match
// yamnet_events.py's kept-class list.
const YAMNET_REACTION_CLASSES = new Set([
  "Laughter", "Giggle", "Chuckle, chortle",
  "Screaming", "Shout", "Yell", "Whoop",
  "Cheering", "Applause", "Gasp",
]);

// #190: extra AudioSet classes requested from yamnet_events.py for the GAME
// track only ("Speech" on the game track = announcer/character voice lines).
const GAME_YAMNET_EXTRA_CLASSES = ["Speech", "Crowd"];

// #190: game-track YAMNet classes that count as game events. Generic AudioSet
// classes only — game-agnostic by construction, no per-game sound lists.
// Music and Silence are deliberately excluded: most games run continuous
// background music, so it carries no moment-level information.
const GAME_YAMNET_EVENT_CLASSES = new Set([
  "Explosion", "Gunshot, gunfire", "Alarm",
  "Cheering", "Applause", "Crowd",
  "Screaming", "Shout", "Yell", "Whoop",
  "Speech",
]);

// #190 game_energy: RMS loudness of the game track in 1 s windows, scored
// against this recording's own loudness distribution (median baseline + high-
// percentile spike floor). Self-calibrating per game and per session: OBS game
// tracks are often mixed very low (Fega's sits ≈ -52 dBFS) with compressed
// dynamics — measured on a real RL recording, goals peak at only ~2× the
// median, so fixed multipliers and absolute thresholds don't transfer. All
// thresholds derive from the same distribution, making the signal gain-invariant.
const GAME_ENERGY_WINDOW_SEC = 1.0;
const GAME_ENERGY_SPIKE_PCTL = 0.98;   // windows above this percentile are spike candidates
const GAME_ENERGY_MIN_CONTRAST = 1.25; // spike floor must clear baseline by this ratio (flat tracks emit nothing)
const GAME_ENERGY_MIN_FLOOR = 0.001;   // ≈ -60 dBFS — below this the track is effectively silent

// ─── Helpers ───

function flattenWords(transcription) {
  const words = [];
  const segments = transcription?.segments || [];
  for (const seg of segments) {
    if (Array.isArray(seg.words) && seg.words.length > 0) {
      for (const w of seg.words) {
        if (typeof w.start === "number" && (w.word || w.text)) {
          words.push({ t: w.start, text: String(w.word || w.text).trim() });
        }
      }
    } else if (typeof seg.start === "number" && seg.text) {
      const tokens = String(seg.text).trim().split(/\s+/).filter(Boolean);
      const segStart = seg.start;
      const segEnd = typeof seg.end === "number" ? seg.end : segStart;
      const step = tokens.length > 0 ? Math.max(0, (segEnd - segStart)) / tokens.length : 0;
      for (let i = 0; i < tokens.length; i++) {
        words.push({ t: segStart + step * i, text: tokens[i] });
      }
    }
  }
  words.sort((a, b) => a.t - b.t);
  return words;
}

function median(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─── Signal 4: Transcript Density ───
/**
 * Sliding-window words-per-second with elevated-rate flagging.
 * Returns { windows: [{t_start, t_end, wps, baseline_wps, is_elevated}], baseline_wps }
 */
function computeTranscriptDensity(transcription, windowSec = 5) {
  const words = flattenWords(transcription);
  if (words.length === 0) return { windows: [], baseline_wps: 0 };

  const lastT = words[words.length - 1].t;
  const windows = [];
  let cursor = 0;
  for (let t = 0; t <= lastT; t += 1) {
    const tEnd = t + windowSec;
    // Advance cursor to first word >= t
    while (cursor < words.length && words[cursor].t < t) cursor++;
    let count = 0;
    for (let i = cursor; i < words.length && words[i].t < tEnd; i++) count++;
    windows.push({ t_start: t, t_end: tEnd, wps: count / windowSec });
  }

  const baseline = median(windows.map((w) => w.wps));
  for (const w of windows) {
    w.baseline_wps = baseline;
    w.is_elevated = baseline > 0 && w.wps > baseline * 1.75;
  }
  return { windows, baseline_wps: baseline };
}

// ─── Signal 5: Reaction Words ───
const REACTION_PATTERNS = {
  hype:      /\b(LET'?S\s*GO+|LESGO|LFG|POGGERS|POGCHAMP)\b/i,
  shock:     /\b(WHAT(?:\s+THE)?|NO\s+WAY|BRO|WAIT\s+WHAT|OH\s+MY\s+GOD|OMG|WTF|HOW)\b/i,
  fail:      /\b(NO+|WHY|WHAT\s+HAPPENED|I'?M\s+DEAD|I\s+CAN'?T)\b/i,
  clutch:    /\b(ALMOST|SO\s+CLOSE|ONE\s+SHOT|CLUTCH|LAST\s+SECOND)\b/i,
  exclaim:   /!{2,}/,
  questions: /\?{2,}/,
};

function computeReactionWords(transcription, windowSec = 5) {
  const words = flattenWords(transcription);
  if (words.length === 0) return { windows: [] };

  const lastT = words[words.length - 1].t;
  const windows = [];
  let cursor = 0;
  for (let t = 0; t <= lastT; t += 1) {
    const tEnd = t + windowSec;
    while (cursor < words.length && words[cursor].t < t) cursor++;
    const inWin = [];
    for (let i = cursor; i < words.length && words[i].t < tEnd; i++) inWin.push(words[i].text);
    if (inWin.length === 0) continue;
    const text = inWin.join(" ");
    const matches = [];
    for (const re of Object.values(REACTION_PATTERNS)) {
      const m = text.match(re);
      if (m) matches.push(m[0]);
    }
    if (matches.length === 0) continue;
    const score = Math.min(1.0, (matches.length / inWin.length) * 10);
    windows.push({ t_start: t, t_end: tEnd, score, matches, word_count: inWin.length });
  }
  return { windows };
}

// ─── Signal 6: Silence-then-Spike ───
function detectSilenceSpike(energyJson, silenceThresholdSec = 1.0, spikeMultiplier = 2.0) {
  const events = [];
  if (!Array.isArray(energyJson) || energyJson.length === 0) return { events };

  const avgs = energyJson.map((s) => s.avg_energy ?? 0).filter((v) => v != null);
  const baseline = median(avgs);
  if (baseline <= 0) return { events };

  const silenceCeiling = baseline * 0.25;
  const spikeFloor = baseline * spikeMultiplier;

  let runStart = null;
  let runEnd = null;
  for (let i = 0; i < energyJson.length; i++) {
    const seg = energyJson[i];
    const segAvg = seg.avg_energy ?? 0;
    const segPeak = seg.peak_energy ?? 0;

    if (segAvg < silenceCeiling) {
      if (runStart === null) runStart = seg.start ?? 0;
      runEnd = seg.end ?? seg.start ?? 0;
      continue;
    }

    if (runStart !== null && runEnd !== null) {
      const silenceDur = runEnd - runStart;
      if (silenceDur >= silenceThresholdSec && segPeak >= spikeFloor) {
        events.push({
          t_silence_start: runStart,
          t_silence_end: runEnd,
          t_spike: seg.start ?? runEnd,
          silence_duration_sec: silenceDur,
          spike_energy: segPeak,
        });
      }
    }
    runStart = null;
    runEnd = null;
  }
  return { events };
}

// ─── Signal 7 (#190): Game-Track Energy ───

/**
 * Stream a PCM WAV and return per-window RMS values (no full-file buffering —
 * a multi-hour game track never has to fit in memory at once).
 * Only handles 16-bit PCM, which is what ffmpeg.extractAudio always writes.
 */
async function readWavRmsWindows(wavPath, windowSec) {
  const fh = await fs.promises.open(wavPath, "r");
  try {
    const stat = await fh.stat();
    const head = Buffer.alloc(12);
    await fh.read(head, 0, 12, 0);
    if (head.toString("ascii", 0, 4) !== "RIFF" || head.toString("ascii", 8, 12) !== "WAVE") {
      throw new Error("not a RIFF/WAVE file");
    }

    // Walk chunks to find fmt + data (ffmpeg inserts a LIST chunk between them).
    let pos = 12;
    let fmt = null, dataStart = null, dataSize = null;
    const chunkHead = Buffer.alloc(8);
    while (pos + 8 <= stat.size) {
      await fh.read(chunkHead, 0, 8, pos);
      const id = chunkHead.toString("ascii", 0, 4);
      const size = chunkHead.readUInt32LE(4);
      if (id === "fmt ") {
        const fmtBuf = Buffer.alloc(16);
        await fh.read(fmtBuf, 0, 16, pos + 8);
        fmt = {
          audioFormat: fmtBuf.readUInt16LE(0),
          channels: fmtBuf.readUInt16LE(2),
          sampleRate: fmtBuf.readUInt32LE(4),
          bitsPerSample: fmtBuf.readUInt16LE(14),
        };
      } else if (id === "data") {
        dataStart = pos + 8;
        dataSize = Math.min(size, stat.size - dataStart);
        break;
      }
      pos += 8 + size + (size % 2); // chunks are word-aligned
    }
    if (!fmt || dataStart === null) throw new Error("no fmt/data chunk found");
    if (fmt.audioFormat !== 1 || fmt.bitsPerSample !== 16) {
      throw new Error(`unsupported wav format (fmt ${fmt.audioFormat}, ${fmt.bitsPerSample}-bit)`);
    }

    const frameBytes = 2 * fmt.channels;
    const samplesPerWindow = Math.round(fmt.sampleRate * windowSec);
    const windows = [];
    let sumSq = 0, count = 0;
    const buf = Buffer.alloc(1 << 20);
    let leftover = Buffer.alloc(0);
    let offset = dataStart;
    const end = dataStart + dataSize;

    while (offset < end) {
      const toRead = Math.min(buf.length, end - offset);
      const { bytesRead } = await fh.read(buf, 0, toRead, offset);
      if (bytesRead <= 0) break;
      offset += bytesRead;
      let chunk = leftover.length
        ? Buffer.concat([leftover, buf.subarray(0, bytesRead)])
        : buf.subarray(0, bytesRead);
      const usable = chunk.length - (chunk.length % frameBytes);
      leftover = usable < chunk.length ? Buffer.from(chunk.subarray(usable)) : Buffer.alloc(0);
      for (let i = 0; i + frameBytes <= usable; i += frameBytes) {
        let s = 0;
        for (let c = 0; c < fmt.channels; c++) s += chunk.readInt16LE(i + c * 2);
        s = s / fmt.channels / 32768;
        sumSq += s * s;
        count++;
        if (count >= samplesPerWindow) {
          windows.push(Math.sqrt(sumSq / count));
          sumSq = 0;
          count = 0;
        }
      }
    }
    // Keep a trailing partial window if it covers at least half the span.
    if (count > samplesPerWindow / 2) windows.push(Math.sqrt(sumSq / count));
    return windows;
  } finally {
    await fh.close();
  }
}

/**
 * game_energy (#190): loudness spikes on the game-audio track, scored relative
 * to THIS recording's own loudness distribution. Game-agnostic by construction —
 * a quiet game and a loud game both work, because "loud" is always relative to
 * the session's own soundscape (validated on a real RL recording: the two
 * loudest windows were a goal and a save).
 * Returns { signal, window_sec, baseline_rms, spike_floor_rms, windows_total, events }.
 */
async function computeGameEnergy(gameWavPath) {
  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  const windows = await readWavRmsWindows(gameWavPath, GAME_ENERGY_WINDOW_SEC);
  const out = {
    signal: "game_energy",
    window_sec: GAME_ENERGY_WINDOW_SEC,
    baseline_rms: 0,
    spike_floor_rms: 0,
    windows_total: windows.length,
    events: [],
  };
  if (windows.length === 0) return out;

  const baseline = median(windows);
  const sorted = [...windows].sort((a, b) => a - b);
  const spikeFloor = sorted[Math.min(sorted.length - 1, Math.floor(GAME_ENERGY_SPIKE_PCTL * (sorted.length - 1)))];
  const maxRms = sorted[sorted.length - 1];
  out.baseline_rms = r5(baseline);
  out.spike_floor_rms = r5(spikeFloor);

  // Flat or effectively-silent track carries no moment-level information.
  if (spikeFloor < GAME_ENERGY_MIN_FLOOR || spikeFloor < baseline * GAME_ENERGY_MIN_CONTRAST) return out;

  let runStart = -1, runPeak = 0;
  const flush = (endIdx) => {
    // Score = where the run's peak sits between the spike floor and the
    // recording's loudest window, mapped to [0.5, 1.0] — the session's
    // biggest moment always scores 1.0 regardless of absolute mix level.
    const span = Math.max(maxRms - spikeFloor, 1e-9);
    out.events.push({
      t_start: runStart * GAME_ENERGY_WINDOW_SEC,
      t_end: endIdx * GAME_ENERGY_WINDOW_SEC,
      peak_rms: r5(runPeak),
      ratio: Math.round((runPeak / Math.max(baseline, 1e-5)) * 100) / 100,
      score: Math.min(1, 0.5 + 0.5 * ((runPeak - spikeFloor) / span)),
    });
  };
  for (let i = 0; i < windows.length; i++) {
    if (windows[i] >= spikeFloor) {
      if (runStart === -1) { runStart = i; runPeak = 0; }
      if (windows[i] > runPeak) runPeak = windows[i];
    } else if (runStart !== -1) {
      flush(i);
      runStart = -1;
    }
  }
  if (runStart !== -1) flush(windows.length);
  return out;
}

// ─── Python subprocess runners ───
// Each returns { result, failureReason, elapsed_ms }. `result` is the parsed
// JSON output on success or null on failure. `failureReason` is one of:
//   "stall"        — no PROGRESS line for STALL_TIMEOUT_MS post startup grace
//   "backstop"     — overall backstop fired (last-resort cap)
//   "exit-code"    — process exited non-zero
//   "missing-output" — process exited 0 but didn't write output file
//   "parse-error"  — output file present but JSON parse failed
//   "missing-script" — script file not found on disk
//   "spawn-error"  — child_process.spawn threw or emitted "error"
// On success, failureReason is null.

// Packaged app ships tools/ via extraResources (resources/tools/) so the external
// Python can read these scripts + the yamnet model; source stays repo-relative (#143).
// Guarded require so the module loads outside Electron too (#190 unit tests) —
// non-Electron callers get the repo-relative path, same as an unpackaged app.
let _electronApp = null;
try { _electronApp = require("electron").app; } catch (_) { /* not in Electron */ }
const SIGNALS_SCRIPT_DIR = _electronApp && _electronApp.isPackaged
  ? path.join(process.resourcesPath, "tools", "signals")
  : path.join(__dirname, "..", "..", "tools", "signals");

function runPythonSignal({
  scriptName, cliArgs, pythonPath, outPath,
  startupGraceMs, sourceDuration,
  signalName, logger, onProgress,
}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const finish = (result, failureReason) => {
      const elapsed_ms = Date.now() - startedAt;
      resolve({ result, failureReason, elapsed_ms });
    };

    const scriptPath = path.join(SIGNALS_SCRIPT_DIR, scriptName);
    if (!fs.existsSync(scriptPath)) {
      logger?.info?.(`${signalName} script missing at ${scriptPath}`);
      return finish(null, "missing-script");
    }
    // -X utf8 forces Python UTF-8 mode (matches energy_scorer spawn pattern).
    const spawnArgs = ["-X", "utf8", scriptPath, ...cliArgs];
    logger?.logCommand?.(pythonPath, spawnArgs);

    let child;
    try {
      child = spawn(pythonPath, spawnArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      });
    } catch (e) {
      logger?.info?.(`${signalName} spawn threw: ${e.message}`);
      return finish(null, "spawn-error");
    }

    // Backstop cap — scales with source duration. Phase 1 last-resort only;
    // stall detection is the primary failure mechanism.
    const backstopMs = Math.max(60000, (sourceDuration || 0) * 200);

    let stdout = "";
    const stderrLines = [];           // accumulated for end-of-run log dump
    let resolved = false;
    let stallTimer = null;
    let backstopTimer = null;
    let graceTimer = null;
    let graceElapsed = false;

    const cleanup = () => {
      if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
      if (backstopTimer) { clearTimeout(backstopTimer); backstopTimer = null; }
      if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
    };

    const armStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        if (resolved) return;
        const stalledFor = Math.round((Date.now() - startedAt) / 1000);
        logger?.info?.(`${signalName} stalled — no PROGRESS for ${STALL_TIMEOUT_MS / 1000}s (total elapsed ${stalledFor}s); killing`);
        resolved = true;
        try { child.kill("SIGKILL"); } catch (_) { /* already dead */ }
        cleanup();
        if (stderrLines.length) logger?.logOutput?.(`${signalName} STDERR`, stderrLines.join("\n"));
        finish(null, "stall");
      }, STALL_TIMEOUT_MS);
    };

    // Stall timer doesn't arm until startup grace expires — yamnet's 15s model
    // load would false-fire a 30s timer otherwise.
    graceTimer = setTimeout(() => {
      graceElapsed = true;
      if (!resolved) armStallTimer();
    }, startupGraceMs);

    backstopTimer = setTimeout(() => {
      if (resolved) return;
      const totalSec = Math.round((Date.now() - startedAt) / 1000);
      logger?.info?.(`${signalName} backstop fired at ${totalSec}s (cap ${Math.round(backstopMs / 1000)}s); killing`);
      resolved = true;
      try { child.kill("SIGKILL"); } catch (_) { /* already dead */ }
      cleanup();
      if (stderrLines.length) logger?.logOutput?.(`${signalName} STDERR`, stderrLines.join("\n"));
      finish(null, "backstop");
    }, backstopMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));

    // Stream stderr line-by-line. Each line: (1) buffered for end-of-run log,
    // (2) regex-tested for PROGRESS heartbeat which resets the stall timer and
    // feeds the renderer's signal-health UI via onProgress.
    const rl = readline.createInterface({ input: child.stderr, crlfDelay: Infinity });
    rl.on("line", (line) => {
      stderrLines.push(line);
      const m = PROGRESS_RE.exec(line);
      if (m) {
        const p = parseFloat(m[1]);
        if (Number.isFinite(p)) {
          if (graceElapsed) armStallTimer();
          try { onProgress?.(p); } catch (_) { /* never let UI callbacks crash signals */ }
        }
      }
    });

    child.on("close", (code) => {
      if (resolved) return;
      resolved = true;
      cleanup();

      if (stdout) logger?.logOutput?.(`${signalName} STDOUT`, stdout);
      if (stderrLines.length) logger?.logOutput?.(`${signalName} STDERR`, stderrLines.join("\n"));

      if (code !== 0) {
        logger?.info?.(`${signalName} exited with code ${code}`);
        return finish(null, "exit-code");
      }
      if (!fs.existsSync(outPath)) {
        logger?.info?.(`${signalName} produced no output file: ${outPath}`);
        return finish(null, "missing-output");
      }
      try {
        const parsed = JSON.parse(fs.readFileSync(outPath, "utf-8"));
        finish(parsed, null);
      } catch (e) {
        logger?.info?.(`${signalName} output parse failed: ${e.message}`);
        finish(null, "parse-error");
      }
    });

    child.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      logger?.info?.(`${signalName} spawn error: ${err.message}`);
      if (stderrLines.length) logger?.logOutput?.(`${signalName} STDERR`, stderrLines.join("\n"));
      finish(null, "spawn-error");
    });
  });
}

async function spawnYamnet({ wavPath, outPath, pythonPath, sourceDuration, logger, onProgress, silenceSkip = true, extraClasses = null, normalize = false, signalName = "yamnet" }) {
  const cliArgs = ["--audio", wavPath, "--output", outPath];
  if (!silenceSkip) cliArgs.push("--no-rms-skip");
  // #190: game-track run requests extra generic AudioSet classes (Speech, Crowd)
  if (Array.isArray(extraClasses) && extraClasses.length) cliArgs.push("--extra-classes", extraClasses.join(","));
  // #190: game tracks are often mixed very low — measured on a real RL goal,
  // Explosion scored 0.33-0.67 normalized vs ~0.0 raw. Mic runs never pass this.
  if (normalize) cliArgs.push("--normalize");
  return runPythonSignal({
    scriptName: "yamnet_events.py",
    cliArgs,
    pythonPath, outPath, logger, onProgress, sourceDuration,
    startupGraceMs: 15000,   // model load + class-map load
    signalName,
  });
}

async function spawnPitchSpike({ wavPath, outPath, pythonPath, sourceDuration, logger, onProgress }) {
  return runPythonSignal({
    scriptName: "pitch_spike.py",
    cliArgs: ["--audio", wavPath, "--output", outPath],
    pythonPath, outPath, logger, onProgress, sourceDuration,
    startupGraceMs: 5000,    // audio load
    signalName: "pitch_spike",
  });
}

// ─── Event Timeline Builder + Composite Scoring ───

function redistributeWeights(baseWeights, failedKeys) {
  const failedSum = failedKeys.reduce((acc, k) => acc + (baseWeights[k] || 0), 0);
  const weights = {};
  for (const [k, v] of Object.entries(baseWeights)) {
    if (failedKeys.includes(k)) weights[k] = 0;
    else weights[k] = failedSum >= 1.0 ? v : v / (1 - failedSum);
  }
  return weights;
}

/**
 * Merge all per-signal outputs into a unified event timeline + per-segment
 * composite scores. Missing Python signals (null) are tolerated — their weight
 * is redistributed across surviving signals.
 */
function buildEventTimeline({
  energyJson, yamnet, pitch,
  density, reactionWords, silenceSpike,
  gameEnergy = null, gameYamnet = null,
  archetype, videoName, sourceDuration, extraction_ms,
}) {
  const signals_computed = ["energy"];
  const signals_failed = [];
  if (density) signals_computed.push("transcript_density"); else signals_failed.push("transcript_density");
  if (reactionWords) signals_computed.push("reaction_words"); else signals_failed.push("reaction_words");
  if (silenceSpike) signals_computed.push("silence_spike"); else signals_failed.push("silence_spike");
  if (yamnet) signals_computed.push("yamnet"); else signals_failed.push("yamnet");
  if (pitch) signals_computed.push("pitch_spike"); else signals_failed.push("pitch_spike");
  // #190: game signals are additive — listed when they ran, but NEVER pushed
  // into signals_failed. The strict/degrade gate reads signals_failed, and a
  // missing game track (off / single-track / bad index / failed run) must read
  // as not-configured, not as a failed pipeline. Their weight is renormalized
  // away below instead.
  if (gameEnergy) signals_computed.push("game_energy");
  if (gameYamnet) signals_computed.push("game_yamnet");

  const events = [];

  if (yamnet && Array.isArray(yamnet.frames)) {
    for (const f of yamnet.frames) {
      let best = { label: null, score: 0 };
      for (const [label, s] of Object.entries(f.scores || {})) {
        if (YAMNET_REACTION_CLASSES.has(label) && s > best.score) best = { label, score: s };
      }
      if (best.score >= 0.3) {
        events.push({ t_start: f.t_start, t_end: f.t_end, signal: "yamnet", score: best.score, label: best.label, metadata: {} });
      }
    }
  }

  if (pitch && Array.isArray(pitch.windows)) {
    for (const w of pitch.windows) {
      if (w.is_elevated) {
        events.push({
          t_start: w.t_start, t_end: w.t_end, signal: "pitch_spike",
          score: w.score, label: "elevated_f0",
          metadata: { mean_f0_hz: w.mean_f0_hz, baseline_f0_hz: pitch.baseline_f0_hz },
        });
      }
    }
  }

  if (density && Array.isArray(density.windows)) {
    for (const w of density.windows) {
      if (!w.is_elevated || !density.baseline_wps) continue;
      const score = Math.min(1.0, w.wps / (density.baseline_wps * 2));
      events.push({
        t_start: w.t_start, t_end: w.t_end, signal: "transcript_density",
        score, label: "elevated_word_rate",
        metadata: { wps: w.wps, baseline_wps: density.baseline_wps },
      });
    }
  }

  if (reactionWords && Array.isArray(reactionWords.windows)) {
    for (const w of reactionWords.windows) {
      events.push({
        t_start: w.t_start, t_end: w.t_end, signal: "reaction_words",
        score: w.score, label: "hype_language",
        metadata: { matches: w.matches },
      });
    }
  }

  if (silenceSpike && Array.isArray(silenceSpike.events)) {
    for (const e of silenceSpike.events) {
      events.push({
        t_start: e.t_silence_start, t_end: e.t_spike, signal: "silence_spike",
        score: 1.0, label: "silence_then_spike",
        metadata: { silence_duration_sec: e.silence_duration_sec, spike_energy: e.spike_energy },
      });
    }
  }

  // #190: game-track events — the moments the mic-side signals are deaf to.
  if (gameEnergy && Array.isArray(gameEnergy.events)) {
    for (const e of gameEnergy.events) {
      events.push({
        t_start: e.t_start, t_end: e.t_end, signal: "game_energy",
        score: e.score, label: "game_audio_spike",
        metadata: { peak_rms: e.peak_rms, baseline_rms: gameEnergy.baseline_rms, ratio: e.ratio },
      });
    }
  }

  if (gameYamnet && Array.isArray(gameYamnet.frames)) {
    for (const f of gameYamnet.frames) {
      let best = { label: null, score: 0 };
      for (const [label, s] of Object.entries(f.scores || {})) {
        if (GAME_YAMNET_EVENT_CLASSES.has(label) && s > best.score) best = { label, score: s };
      }
      if (best.score >= 0.3) {
        events.push({ t_start: f.t_start, t_end: f.t_end, signal: "game_yamnet", score: best.score, label: best.label, metadata: {} });
      }
    }
  }

  // ── Weight redistribution ──
  // The three JS signals never "fail" here — their redistribution is handled
  // only for Python signals. If a JS signal produced no events, its boost is
  // naturally 0 per segment, which is semantically correct.
  const baseWeights = resolveArchetypeWeights(archetype);
  const failedWeightKeys = [];
  if (!yamnet) failedWeightKeys.push("yamnet");
  if (!pitch) failedWeightKeys.push("pitch");
  // #190: absent game signals (not configured OR failed) just lose their
  // weight — dropping both divides the mic weights by 0.85, which restores
  // the pre-#190 split exactly.
  if (!gameEnergy) failedWeightKeys.push("game_energy");
  if (!gameYamnet) failedWeightKeys.push("game_yamnet");
  const weights = redistributeWeights(baseWeights, failedWeightKeys);

  // ── Composite score per energy segment ──
  const segments = [];
  for (const seg of energyJson || []) {
    const segStart = seg.start ?? 0;
    const segEnd = seg.end ?? segStart;
    const segMid = segStart + (segEnd - segStart) / 2;
    const overlaps = (a0, a1) => !(a1 < segStart || a0 > segEnd);

    let yamnet_boost = 0, pitch_boost = 0, density_boost = 0, reaction_boost = 0;
    let spike_boost = 0;
    let game_energy_boost = 0, game_yamnet_boost = 0;

    for (const e of events) {
      switch (e.signal) {
        case "yamnet":
          if (overlaps(e.t_start, e.t_end) && e.score > yamnet_boost) yamnet_boost = e.score;
          break;
        case "pitch_spike":
          if (overlaps(e.t_start, e.t_end) && e.score > pitch_boost) pitch_boost = e.score;
          break;
        case "transcript_density":
          if (overlaps(e.t_start, e.t_end) && e.score > density_boost) density_boost = e.score;
          break;
        case "reaction_words":
          if (overlaps(e.t_start, e.t_end) && e.score > reaction_boost) reaction_boost = e.score;
          break;
        case "silence_spike":
          if (overlaps(e.t_start, e.t_end)) spike_boost = 1.0;
          break;
        case "game_energy":
          if (overlaps(e.t_start, e.t_end) && e.score > game_energy_boost) game_energy_boost = e.score;
          break;
        case "game_yamnet":
          if (overlaps(e.t_start, e.t_end) && e.score > game_yamnet_boost) game_yamnet_boost = e.score;
          break;
      }
    }

    const energy_boost = Math.max(0, Math.min(1, seg.peak_energy ?? 0));

    const composite =
      weights.energy * energy_boost +
      weights.yamnet * yamnet_boost +
      weights.pitch * pitch_boost +
      weights.density * density_boost +
      weights.reaction_words * reaction_boost +
      weights.spike * spike_boost +
      (weights.game_energy || 0) * game_energy_boost +
      (weights.game_yamnet || 0) * game_yamnet_boost;

    segments.push({
      start: segStart,
      end: segEnd,
      start_timestamp: seg.start_timestamp,
      end_timestamp: seg.end_timestamp,
      text: seg.text,
      avg_energy: seg.avg_energy,
      peak_energy: seg.peak_energy,
      energy_label: seg.energy_label,
      composite_score: composite,
      signal_boosts: {
        yamnet: yamnet_boost,
        pitch_spike: pitch_boost,
        density: density_boost,
        reaction_words: reaction_boost,
        spike: spike_boost,
        game_energy: game_energy_boost,
        game_yamnet: game_yamnet_boost,
      },
    });
  }

  return {
    version: 1,
    video_name: videoName,
    source_duration_seconds: sourceDuration,
    archetype,
    signals_computed,
    signals_failed,
    weights_applied: weights,
    extraction_ms: extraction_ms || {},
    events,
    segments,
  };
}

// ─── Orchestrator ───

/**
 * Top-level Stage 4.5 orchestrator. Runs JS signals synchronously, dispatches
 * Python signals concurrently via Promise.all, writes event_timeline.json, and
 * returns the merged timeline.
 *
 * Phase 1 (Issue #72): never throws into the caller, but the returned shape
 * gained a `failure_details` map so the caller can decide how to react. The
 * caller (ai-pipeline.js) reads `eventTimeline.signals_failed` to gate strict
 * mode vs the non-strict ask-degrade modal.
 *
 * If the orchestrator itself crashes (not a per-signal failure), we still
 * return a timeline-shaped object with `signals_failed: ["extractor"]` so the
 * caller's strict-mode gate fires — no silent degradation at the wrapper level.
 */
async function runSignalExtraction({
  wavPath, sourceFile, energyJson, transcription,
  processingDir, videoName, pythonPath, archetype,
  logger, isTest = false, sendSignalProgress,
  yamnetSilenceSkip = true,
  gameWavPath = null, // #190: game-track wav; null = not configured / skipped upstream
}) {
  // Compute source duration once — used for backstop scaling per-signal.
  let sourceDuration = 0;
  if (Array.isArray(energyJson) && energyJson.length > 0) {
    const last = energyJson[energyJson.length - 1];
    sourceDuration = last.end || last.start || 0;
  }

  // Shape the renderer subscribes to. status: pending|running|done|failed.
  const emit = (signal, payload) => {
    try { sendSignalProgress?.(signal, payload); } catch (_) { /* never propagate UI errors */ }
  };

  try {
    const signalsDir = path.join(processingDir, "signals");
    if (!fs.existsSync(signalsDir)) fs.mkdirSync(signalsDir, { recursive: true });

    const extraction_ms = {};
    const failure_details = {}; // { signalKey: failureReason }

    // ── JS signals (synchronous, fast) ──
    // Emit a single done event apiece — the renderer doesn't need progress for
    // these but should still see them as accounted-for in the 5-row table.
    emit("transcript_density", { status: "running", progress: 0, elapsed_ms: 0 });
    let density = null;
    try {
      const t0 = Date.now();
      density = computeTranscriptDensity(transcription);
      extraction_ms.transcript_density = Date.now() - t0;
      emit("transcript_density", { status: "done", progress: 1, elapsed_ms: extraction_ms.transcript_density });
    } catch (e) {
      logger?.info?.(`transcript_density failed: ${e.message}`);
      failure_details.transcript_density = "exception";
      emit("transcript_density", { status: "failed", progress: 0, elapsed_ms: 0, failureReason: "exception" });
    }

    emit("reaction_words", { status: "running", progress: 0, elapsed_ms: 0 });
    let reactionWords = null;
    try {
      const t0 = Date.now();
      reactionWords = computeReactionWords(transcription);
      extraction_ms.reaction_words = Date.now() - t0;
      emit("reaction_words", { status: "done", progress: 1, elapsed_ms: extraction_ms.reaction_words });
    } catch (e) {
      logger?.info?.(`reaction_words failed: ${e.message}`);
      failure_details.reaction_words = "exception";
      emit("reaction_words", { status: "failed", progress: 0, elapsed_ms: 0, failureReason: "exception" });
    }

    emit("silence_spike", { status: "running", progress: 0, elapsed_ms: 0 });
    let silenceSpike = null;
    try {
      const t0 = Date.now();
      silenceSpike = detectSilenceSpike(energyJson);
      extraction_ms.silence_spike = Date.now() - t0;
      emit("silence_spike", { status: "done", progress: 1, elapsed_ms: extraction_ms.silence_spike });
    } catch (e) {
      logger?.info?.(`silence_spike failed: ${e.message}`);
      failure_details.silence_spike = "exception";
      emit("silence_spike", { status: "failed", progress: 0, elapsed_ms: 0, failureReason: "exception" });
    }

    // ── Python signals (concurrent via Promise.all) ──
    const yamnetOut = path.join(signalsDir, `${videoName}.yamnet.json`);
    const pitchOut = path.join(signalsDir, `${videoName}.pitch_spike.json`);

    const runPy = async (key, spawnFn) => {
      const startAt = Date.now();
      emit(key, { status: "running", progress: 0, elapsed_ms: 0 });
      const onProgress = (p) => {
        emit(key, {
          status: "running",
          progress: Math.max(0, Math.min(1, p)),
          elapsed_ms: Date.now() - startAt,
        });
      };
      try {
        const { result, failureReason, elapsed_ms } = await spawnFn(onProgress);
        extraction_ms[key] = elapsed_ms;
        if (failureReason) {
          failure_details[key] = failureReason;
          emit(key, { status: "failed", progress: 0, elapsed_ms, failureReason });
          logger?.info?.(`${key} failed (${failureReason}) after ${elapsed_ms}ms`);
        } else {
          emit(key, { status: "done", progress: 1, elapsed_ms });
        }
        return result;
      } catch (e) {
        const elapsed_ms = Date.now() - startAt;
        extraction_ms[key] = elapsed_ms;
        failure_details[key] = "exception";
        emit(key, { status: "failed", progress: 0, elapsed_ms, failureReason: "exception" });
        logger?.info?.(`${key} threw: ${e.message}`);
        return null;
      }
    };

    // #190: game-track signals run concurrently with the mic signals when a
    // game wav was extracted. Their failures land in failure_details (greppable)
    // but never in signals_failed — see buildEventTimeline.
    const gameYamnetOut = path.join(signalsDir, `${videoName}.game_yamnet.json`);
    const [yamnet, pitch, gameEnergy, gameYamnet] = await Promise.all([
      runPy("yamnet", (onProgress) => spawnYamnet({ wavPath, outPath: yamnetOut, pythonPath, sourceDuration, logger, onProgress, silenceSkip: yamnetSilenceSkip })),
      runPy("pitch_spike", (onProgress) => spawnPitchSpike({ wavPath, outPath: pitchOut, pythonPath, sourceDuration, logger, onProgress })),
      gameWavPath
        ? runPy("game_energy", async () => {
            const t0 = Date.now();
            const result = await computeGameEnergy(gameWavPath);
            return { result, failureReason: null, elapsed_ms: Date.now() - t0 };
          })
        : Promise.resolve(null),
      gameWavPath
        ? runPy("game_yamnet", (onProgress) => spawnYamnet({
            wavPath: gameWavPath, outPath: gameYamnetOut, pythonPath, sourceDuration, logger, onProgress,
            silenceSkip: yamnetSilenceSkip, extraClasses: GAME_YAMNET_EXTRA_CLASSES, normalize: true, signalName: "game_yamnet",
          }))
        : Promise.resolve(null),
    ]);

    // Persist game_energy alongside the Python signal outputs for debugging.
    if (gameEnergy) {
      try {
        fs.writeFileSync(path.join(signalsDir, `${videoName}.game_energy.json`), JSON.stringify(gameEnergy, null, 2), "utf-8");
      } catch (_) { /* non-critical */ }
    }

    const eventTimeline = buildEventTimeline({
      energyJson, yamnet, pitch,
      density, reactionWords, silenceSpike,
      gameEnergy, gameYamnet,
      archetype, videoName, sourceDuration, extraction_ms,
    });

    // Attach Phase 1 failure details for the strict/degrade gate downstream.
    eventTimeline.failure_details = failure_details;

    // Single-line completion summary in the per-pipeline log so failures and
    // their reasons are always greppable in processing/logs/<videoName>.log.
    const failedSummary = Object.entries(failure_details)
      .map(([k, reason]) => `${k} (${reason}, ${extraction_ms[k] ?? 0}ms)`)
      .join("; ") || "(none)";
    logger?.info?.(`signals_complete: computed=${eventTimeline.signals_computed.join(",")} failed=${failedSummary}`);

    const timelinePath = path.join(signalsDir, `${videoName}.event_timeline.json`);
    try {
      fs.writeFileSync(timelinePath, JSON.stringify(eventTimeline, null, 2), "utf-8");
    } catch (e) {
      logger?.info?.(`Failed to write event_timeline.json: ${e.message}`);
    }

    if (isTest) {
      const top5 = [...eventTimeline.segments]
        .sort((a, b) => b.composite_score - a.composite_score)
        .slice(0, 5)
        .map((s) => `    [${s.start_timestamp || s.start}] score=${s.composite_score.toFixed(3)} "${String(s.text || "").substring(0, 60)}"`)
        .join("\n");
      logger?.info?.(
        `Signal extraction (is_test):\n` +
        `  timeline: ${timelinePath}\n` +
        `  signals_computed: ${eventTimeline.signals_computed.join(", ")}\n` +
        `  signals_failed:   ${eventTimeline.signals_failed.join(", ") || "(none)"}\n` +
        `  events: ${eventTimeline.events.length}\n` +
        `  extraction_ms: ${JSON.stringify(eventTimeline.extraction_ms)}\n` +
        `  weights_applied: ${JSON.stringify(eventTimeline.weights_applied)}\n` +
        `  top-5 segments by composite_score:\n${top5}`
      );
    }

    return eventTimeline;
  } catch (e) {
    // Orchestrator-level crash (NOT a per-signal failure). Per Phase 1 plan
    // resolved-decision #4, treat as if the whole signal layer failed so the
    // strict-mode gate fires — no silent fallback.
    logger?.info?.(`runSignalExtraction crashed: ${e.message}`);
    emit("extractor", { status: "failed", progress: 0, elapsed_ms: 0, failureReason: "exception" });
    return {
      version: 1,
      video_name: videoName,
      source_duration_seconds: sourceDuration,
      archetype,
      signals_computed: [],
      signals_failed: ["extractor"],
      failure_details: { extractor: `exception: ${e.message}` },
      weights_applied: {},
      extraction_ms: {},
      events: [],
      segments: [],
    };
  }
}

module.exports = {
  ARCHETYPE_WEIGHTS,
  resolveArchetypeWeights,
  redistributeWeights,
  computeTranscriptDensity,
  computeReactionWords,
  detectSilenceSpike,
  computeGameEnergy,
  buildEventTimeline,
  runSignalExtraction,
};
