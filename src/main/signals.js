const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

// ─── Archetype-aware composite weights (locked 2026-04-23 — see spec) ───
const ARCHETYPE_WEIGHTS = {
  hype:        { energy: 0.50, yamnet: 0.15, pitch: 0.10, density: 0.05, reaction_words: 0.10, scene_change: 0.05, spike: 0.05 },
  competitive: { energy: 0.40, yamnet: 0.15, pitch: 0.15, density: 0.10, reaction_words: 0.10, scene_change: 0.05, spike: 0.05 },
  chill:       { energy: 0.30, yamnet: 0.10, pitch: 0.20, density: 0.15, reaction_words: 0.15, scene_change: 0.05, spike: 0.05 },
  variety:     { energy: 0.40, yamnet: 0.15, pitch: 0.15, density: 0.10, reaction_words: 0.10, scene_change: 0.05, spike: 0.05 },
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

// ─── Python subprocess runners ───
// Each returns parsed JSON on success or null on any failure (missing script,
// non-zero exit, bad JSON, timeout). Null is the graceful-degradation path —
// composite scoring redistributes weight to surviving signals.

const SIGNALS_SCRIPT_DIR = path.join(__dirname, "..", "..", "tools", "signals");

function runPythonSignal({ scriptName, cliArgs, pythonPath, outPath, timeout, signalName, logger }) {
  return new Promise((resolve) => {
    const scriptPath = path.join(SIGNALS_SCRIPT_DIR, scriptName);
    if (!fs.existsSync(scriptPath)) {
      logger?.info?.(`${signalName} script missing at ${scriptPath}`);
      return resolve(null);
    }
    // -X utf8 forces Python UTF-8 mode (matches energy_scorer spawn pattern).
    const spawnArgs = ["-X", "utf8", scriptPath, ...cliArgs];
    logger?.logCommand?.(pythonPath, spawnArgs);

    let child;
    try {
      child = spawn(pythonPath, spawnArgs, {
        timeout,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      });
    } catch (e) {
      logger?.info?.(`${signalName} spawn threw: ${e.message}`);
      return resolve(null);
    }

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("close", (code) => {
      if (stdout) logger?.logOutput?.(`${signalName} STDOUT`, stdout);
      if (stderr) logger?.logOutput?.(`${signalName} STDERR`, stderr);
      if (code !== 0) {
        logger?.info?.(`${signalName} exited with code ${code}`);
        return resolve(null);
      }
      if (!fs.existsSync(outPath)) {
        logger?.info?.(`${signalName} produced no output file: ${outPath}`);
        return resolve(null);
      }
      try {
        const parsed = JSON.parse(fs.readFileSync(outPath, "utf-8"));
        resolve(parsed);
      } catch (e) {
        logger?.info?.(`${signalName} output parse failed: ${e.message}`);
        resolve(null);
      }
    });

    child.on("error", (err) => {
      logger?.info?.(`${signalName} spawn error: ${err.message}`);
      resolve(null);
    });
  });
}

async function spawnYamnet({ wavPath, outPath, pythonPath, logger }) {
  return runPythonSignal({
    scriptName: "yamnet_events.py",
    cliArgs: ["--audio", wavPath, "--output", outPath],
    pythonPath, outPath, logger,
    timeout: 120000,
    signalName: "yamnet",
  });
}

async function spawnPitchSpike({ wavPath, outPath, pythonPath, logger }) {
  return runPythonSignal({
    scriptName: "pitch_spike.py",
    cliArgs: ["--audio", wavPath, "--output", outPath],
    pythonPath, outPath, logger,
    timeout: 300000,
    signalName: "pitch_spike",
  });
}

async function spawnSceneChange({ videoPath, outPath, pythonPath, logger }) {
  return runPythonSignal({
    scriptName: "scene_change.py",
    cliArgs: ["--video", videoPath, "--output", outPath],
    pythonPath, outPath, logger,
    timeout: 120000,
    signalName: "scene_change",
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
  energyJson, yamnet, pitch, sceneChange,
  density, reactionWords, silenceSpike,
  archetype, videoName, sourceDuration, extraction_ms,
}) {
  const signals_computed = ["energy"];
  const signals_failed = [];
  if (density) signals_computed.push("transcript_density"); else signals_failed.push("transcript_density");
  if (reactionWords) signals_computed.push("reaction_words"); else signals_failed.push("reaction_words");
  if (silenceSpike) signals_computed.push("silence_spike"); else signals_failed.push("silence_spike");
  if (yamnet) signals_computed.push("yamnet"); else signals_failed.push("yamnet");
  if (pitch) signals_computed.push("pitch_spike"); else signals_failed.push("pitch_spike");
  if (sceneChange) signals_computed.push("scene_change"); else signals_failed.push("scene_change");

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

  if (sceneChange && Array.isArray(sceneChange.events)) {
    for (const e of sceneChange.events) {
      events.push({ t_start: e.t, t_end: e.t, signal: "scene_change", score: e.score ?? 1.0, label: "scene_cut", metadata: {} });
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

  // ── Weight redistribution ──
  // The three JS signals never "fail" here — their redistribution is handled
  // only for Python signals. If a JS signal produced no events, its boost is
  // naturally 0 per segment, which is semantically correct.
  const baseWeights = resolveArchetypeWeights(archetype);
  const failedWeightKeys = [];
  if (!yamnet) failedWeightKeys.push("yamnet");
  if (!pitch) failedWeightKeys.push("pitch");
  if (!sceneChange) failedWeightKeys.push("scene_change");
  const weights = redistributeWeights(baseWeights, failedWeightKeys);

  // ── Composite score per energy segment ──
  const segments = [];
  for (const seg of energyJson || []) {
    const segStart = seg.start ?? 0;
    const segEnd = seg.end ?? segStart;
    const segMid = segStart + (segEnd - segStart) / 2;
    const overlaps = (a0, a1) => !(a1 < segStart || a0 > segEnd);

    let yamnet_boost = 0, pitch_boost = 0, density_boost = 0, reaction_boost = 0;
    let scene_boost = 0, spike_boost = 0;

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
        case "scene_change":
          if (Math.abs(e.t_start - segMid) < 2.0) scene_boost = 1.0;
          break;
        case "silence_spike":
          if (overlaps(e.t_start, e.t_end)) spike_boost = 1.0;
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
      weights.scene_change * scene_boost +
      weights.spike * spike_boost;

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
        scene_change: scene_boost,
        density: density_boost,
        reaction_words: reaction_boost,
        spike: spike_boost,
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
 * returns the merged timeline. Never throws — returns null on total failure so
 * the outer pipeline can fall back to peak_energy-based frame selection.
 */
async function runSignalExtraction({
  wavPath, sourceFile, energyJson, transcription,
  processingDir, videoName, pythonPath, archetype,
  logger, isTest = false,
}) {
  try {
    const signalsDir = path.join(processingDir, "signals");
    if (!fs.existsSync(signalsDir)) fs.mkdirSync(signalsDir, { recursive: true });

    const extraction_ms = {};

    let density = null;
    try {
      const t0 = Date.now();
      density = computeTranscriptDensity(transcription);
      extraction_ms.transcript_density = Date.now() - t0;
    } catch (e) {
      logger?.info?.(`transcript_density failed: ${e.message}`);
    }

    let reactionWords = null;
    try {
      const t0 = Date.now();
      reactionWords = computeReactionWords(transcription);
      extraction_ms.reaction_words = Date.now() - t0;
    } catch (e) {
      logger?.info?.(`reaction_words failed: ${e.message}`);
    }

    let silenceSpike = null;
    try {
      const t0 = Date.now();
      silenceSpike = detectSilenceSpike(energyJson);
      extraction_ms.silence_spike = Date.now() - t0;
    } catch (e) {
      logger?.info?.(`silence_spike failed: ${e.message}`);
    }

    const yamnetOut = path.join(signalsDir, `${videoName}.yamnet.json`);
    const pitchOut = path.join(signalsDir, `${videoName}.pitch_spike.json`);
    const sceneOut = path.join(signalsDir, `${videoName}.scene_change.json`);

    const runWithTiming = async (key, fn) => {
      const t0 = Date.now();
      try {
        const result = await fn();
        extraction_ms[key] = Date.now() - t0;
        return result;
      } catch (e) {
        extraction_ms[key] = Date.now() - t0;
        logger?.info?.(`${key} failed: ${e.message}`);
        return null;
      }
    };

    const [yamnet, pitch, sceneChange] = await Promise.all([
      runWithTiming("yamnet", () => spawnYamnet({ wavPath, outPath: yamnetOut, pythonPath, logger })),
      runWithTiming("pitch_spike", () => spawnPitchSpike({ wavPath, outPath: pitchOut, pythonPath, logger })),
      runWithTiming("scene_change", () => spawnSceneChange({ videoPath: sourceFile, outPath: sceneOut, pythonPath, logger })),
    ]);

    let sourceDuration = 0;
    if (Array.isArray(energyJson) && energyJson.length > 0) {
      const last = energyJson[energyJson.length - 1];
      sourceDuration = last.end || last.start || 0;
    }

    const eventTimeline = buildEventTimeline({
      energyJson, yamnet, pitch, sceneChange,
      density, reactionWords, silenceSpike,
      archetype, videoName, sourceDuration, extraction_ms,
    });

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
    logger?.info?.(`runSignalExtraction crashed: ${e.message}`);
    return null;
  }
}

module.exports = {
  ARCHETYPE_WEIGHTS,
  resolveArchetypeWeights,
  computeTranscriptDensity,
  computeReactionWords,
  detectSilenceSpike,
  buildEventTimeline,
  runSignalExtraction,
};
