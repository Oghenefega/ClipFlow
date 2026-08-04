/**
 * Replay-and-score harness (#233) — re-run clip detection on a past recording
 * and score the picks against Fega's historical approve/reject decisions.
 *
 * Rebuilds the detection LLM call from saved pipeline artifacts (no
 * transcription/energy/signal re-compute, no GPU):
 *   processing/claude/<vid>.claude_ready.txt   — transcript w/ energy labels
 *   processing/energy/<vid>.energy.json        — energy segments
 *   processing/signals/<vid>.event_timeline.json — Lever-1 timeline
 *   processing/frames/<vid>_frame_NN.jpg       — frames from the last real run
 * plus CURRENT prompt code (src/main/ai-prompt.js), prod settings, prod game
 * profiles, and a read-only COPY of the prod feedback DB.
 *
 * Fidelity notes:
 * - Few-shot feedback rows EXCLUDE the replayed video (no leakage — the
 *   original run predated those rows).
 * - Frame timestamps are re-derived with the same ordering logic as
 *   extractTopFrames (composite sort + #190 game-event reservation) and paired
 *   with the jpgs on disk by index. If ordering code changed since the run
 *   that wrote the jpgs, pairing can drift — acceptable for variant
 *   comparison since all variants share the same frames.
 * - READ-ONLY against prod: DB is copied to _tmp/ first; settings/profiles
 *   are only read.
 *
 * Usage:
 *   node harness.js "<videoName>" [--frames N] [--no-rejected] [--no-approved]
 *                   [--no-playstyle] [--runs N] [--label name] [--dry]
 *
 * Scoring (per run):
 *   approved recall  — approved rows matched by any pick / approved rows
 *   rejected hits    — picks matching only rejected rows / total picks
 *   unreviewed picks — picks matching no historical row (listed for eyeball)
 *   Match rule: row midpoint inside pick OR pick midpoint inside row.
 */

const path = require("path");
const os = require("os");
const fs = require("fs");

// ── Electron stub (must precede any src/main require) ──
// CLIPFLOW_PROFILE=dev + userData=%APPDATA%\clipflow makes game-profiles.js
// resolve DATA_DIR to the PROD data dir (repo data/ is stale).
process.env.CLIPFLOW_PROFILE = "dev";
const USER_DATA = path.join(process.env.APPDATA, "clipflow");
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") {
    return { app: { isPackaged: false, getPath: () => USER_DATA } };
  }
  return origLoad.apply(this, arguments);
};

const REPO = path.join(__dirname, "..", "..", "..");
const aiPrompt = require(path.join(REPO, "src", "main", "ai-prompt"));
const geminiWatchProd = require(path.join(REPO, "src", "main", "gemini-watch"));
const gameProfiles = require(path.join(REPO, "src", "main", "game-profiles"));
const llmProvider = require(path.join(REPO, "src", "main", "ai", "llm-provider"));
require(path.join(REPO, "src", "main", "ai", "providers", "anthropic")); // self-registers

const PROCESSING = path.join(USER_DATA, "processing");
const SETTINGS_PATH = path.join(USER_DATA, "clipflow-settings.json");
const DB_PATH = path.join(USER_DATA, "data", "clipflow.db");
const TMP_DIR = path.join(__dirname, "_tmp");
const RESULTS_DIR = path.join(__dirname, "results");

// Sonnet 4.6 rates used by pipeline-logger (matches logged $ figures)
const RATE_IN = 3.0 / 1e6;
const RATE_OUT = 15.0 / 1e6;

// ── args ──
const argv = process.argv.slice(2);
const videoName = argv.find((a) => !a.startsWith("--"));
if (!videoName) {
  console.error('Usage: node harness.js "<videoName>" [--frames N] [--no-rejected] [--no-approved] [--no-playstyle] [--runs N] [--label name] [--dry]');
  process.exit(1);
}
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const variant = {
  frames: parseInt(opt("frames", "20"), 10),
  rejected: !flag("no-rejected"),
  approved: !flag("no-approved"),
  playstyle: !flag("no-playstyle"),
  gemini: flag("gemini"), // #235 variant D: merge gemini-watch.js visual events
};
const runs = parseInt(opt("runs", "1"), 10);
const label = opt("label", [
  `f${variant.frames}`,
  variant.approved ? "" : "noappr",
  variant.rejected ? "" : "norej",
  variant.playstyle ? "" : "nops",
  variant.gemini ? "gemD" : "",
].filter(Boolean).join("-") || "baseline");
const dry = flag("dry");

// ── artifact loading ──
function loadArtifacts(vid) {
  const claudeReadyText = fs.readFileSync(path.join(PROCESSING, "claude", `${vid}.claude_ready.txt`), "utf-8");
  const energyJson = JSON.parse(fs.readFileSync(path.join(PROCESSING, "energy", `${vid}.energy.json`), "utf-8"));
  const eventTimeline = JSON.parse(fs.readFileSync(path.join(PROCESSING, "signals", `${vid}.event_timeline.json`), "utf-8"));
  return { claudeReadyText, energyJson, eventTimeline };
}

// Mirror of extractTopFrames ordering (ai-pipeline.js) — selection only.
// Rebuilds the disk-order list at the topN the original run used (auto-detected
// from the jpg count), then RE-SELECTS as the current pipeline would at the
// requested topN: top (topN − R) composite + the same #190 reserved game
// events. So --frames 10 now includes reserved frames, matching the shipped
// 20 → 10 default. (Pre-2026-08-04 f10 cells were top-10 composite only.)
function deriveFrames(vid, energyJson, eventTimeline, topN) {
  const diskN = fs.readdirSync(path.join(PROCESSING, "frames"))
    .filter((f) => f.startsWith(`${vid}_frame_`) && f.endsWith(".jpg")).length || 20;
  let selection; // [{seg, idx}] — idx pairs with the jpg written at that disk position
  if (eventTimeline && Array.isArray(eventTimeline.segments) && eventTimeline.segments.length > 0) {
    const composite = [...eventTimeline.segments]
      .filter((seg) => typeof seg.composite_score === "number")
      .sort((a, b) => b.composite_score - a.composite_score)
      .slice(0, diskN);
    const gameEvents = (eventTimeline.events || [])
      .filter((e) => e.signal === "game_energy" || e.signal === "game_yamnet")
      .filter((e) => !eventTimeline.segments.some((s) => !(s.end < e.t_start - 1 || s.start > e.t_end + 1)))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const reserved = [];
    for (const e of gameEvents) {
      if (reserved.length >= Math.min(4, diskN)) break;
      const mid = e.t_start + (e.t_end - e.t_start) / 2;
      if (reserved.some((r) => Math.abs((r.start + (r.end - r.start) / 2) - mid) < 10)) continue;
      reserved.push({ start: e.t_start, end: e.t_end });
    }
    const diskList = reserved.length > 0
      ? [...composite.slice(0, diskN - reserved.length), ...reserved]
      : composite;
    const disk = diskList.map((seg, i) => ({ seg, idx: i + 1 }));
    const nReserved = Math.min(reserved.length, Math.min(4, topN));
    const nComposite = Math.max(0, topN - nReserved);
    selection = [
      ...disk.slice(0, Math.min(nComposite, diskList.length - reserved.length)),
      ...disk.slice(diskList.length - reserved.length).slice(0, nReserved),
    ];
  } else {
    selection = [...energyJson].filter((s) => s.peak_energy != null)
      .sort((a, b) => b.peak_energy - a.peak_energy).slice(0, diskN)
      .map((seg, i) => ({ seg, idx: i + 1 })).slice(0, topN);
  }
  const frames = [];
  for (const { seg, idx } of selection) {
    if (frames.length >= topN) break;
    const mid = (seg.start || 0) + ((seg.end || seg.start || 0) - (seg.start || 0)) / 2;
    const p = path.join(PROCESSING, "frames", `${vid}_frame_${String(idx).padStart(2, "0")}.jpg`);
    if (!fs.existsSync(p)) continue;
    frames.push({ path: p, timestamp: seg.start_timestamp || aiPrompt.formatTimestamp(mid) });
  }
  return frames;
}

// ── feedback DB (read-only copy) ──
async function loadFeedback(vid, gameTag) {
  const initSqlJs = require(path.join(REPO, "node_modules", "sql.js"));
  const SQL = await initSqlJs();
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const copyPath = path.join(TMP_DIR, "clipflow-copy.db");
  fs.copyFileSync(DB_PATH, copyPath);
  const db = new SQL.Database(fs.readFileSync(copyPath));
  const query = (sql, params) => {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  };
  // Few-shot pools mirror ai-pipeline.js fetches, minus the replayed video (no leakage)
  const fewShotApproved = query(
    "SELECT * FROM feedback WHERE game_tag = ? AND decision = 'approved' AND video_id != ? ORDER BY timestamp DESC LIMIT 20",
    [gameTag, vid]
  );
  const fewShotRejected = query(
    "SELECT * FROM feedback WHERE game_tag = ? AND decision = 'rejected' AND video_id != ? ORDER BY timestamp DESC LIMIT 50",
    [gameTag, vid]
  );
  // Ground truth: every decision on THIS video, deduped by (start, end, decision)
  const truthRows = query("SELECT * FROM feedback WHERE video_id = ?", [vid]);
  const seen = new Set();
  const truth = [];
  for (const r of truthRows) {
    const k = `${r.clip_start}|${r.clip_end}|${r.decision}`;
    if (seen.has(k)) continue;
    seen.add(k);
    truth.push(r);
  }
  db.close();
  return { fewShotApproved, fewShotRejected, truth };
}

// ── scoring ──
const toSec = (ts) => aiPrompt.parseTimestamp(String(ts || "0"));
const overlaps = (aS, aE, bS, bE) => {
  const aMid = (aS + aE) / 2;
  const bMid = (bS + bE) / 2;
  return (aMid >= bS && aMid <= bE) || (bMid >= aS && bMid <= aE);
};

function score(picks, truth) {
  const approved = truth.filter((r) => r.decision === "approved");
  const rejected = truth.filter((r) => r.decision === "rejected");
  // A range approved anywhere wins over a rejected duplicate of the same range
  const rejectedOnly = rejected.filter(
    (r) => !approved.some((a) => overlaps(toSec(a.clip_start), toSec(a.clip_end), toSec(r.clip_start), toSec(r.clip_end)))
  );
  const pickRanges = picks.map((p) => ({ start: toSec(p.start), end: toSec(p.end), confidence: p.confidence }));

  const approvedMatched = approved.filter((a) =>
    pickRanges.some((p) => overlaps(p.start, p.end, toSec(a.clip_start), toSec(a.clip_end)))
  );
  const perPick = pickRanges.map((p) => {
    const hitApproved = approved.some((a) => overlaps(p.start, p.end, toSec(a.clip_start), toSec(a.clip_end)));
    const hitRejected = rejectedOnly.some((r) => overlaps(p.start, p.end, toSec(r.clip_start), toSec(r.clip_end)));
    return { ...p, verdict: hitApproved ? "approved" : hitRejected ? "rejected" : "unreviewed" };
  });

  return {
    approvedTotal: approved.length,
    approvedMatched: approvedMatched.length,
    approvedRecall: approved.length ? approvedMatched.length / approved.length : null,
    rejectedHits: perPick.filter((p) => p.verdict === "rejected").length,
    rejectedHitRate: perPick.length ? perPick.filter((p) => p.verdict === "rejected").length / perPick.length : null,
    unreviewed: perPick.filter((p) => p.verdict === "unreviewed").length,
    perPick,
  };
}

// ── main ──
(async () => {
  const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
  const store = { get: (k, def) => (settings[k] !== undefined ? settings[k] : def) };
  llmProvider.init(store);

  const { claudeReadyText, energyJson, eventTimeline } = loadArtifacts(videoName);

  // #235: merge Gemini full-watch visual events into the timeline via the
  // PROD merge code (src/main/gemini-watch.js) — actor classification,
  // spectator-drop, and raw-confidence merge are the shipped implementation,
  // so integration cells measure exactly what the pipeline runs. Signal name
  // `gemini_visual` doesn't touch deriveFrames (only game_energy /
  // game_yamnet reserve slots), so frames stay identical across the ablation.
  let geminiActors = null;
  if (variant.gemini) {
    // Spike gemini/ dir first (validated cell inputs); prod artifact location
    // second (recordings processed by the integrated pipeline).
    const gvPath = [
      path.join(__dirname, "gemini", `${videoName}.visual_events.json`),
      path.join(PROCESSING, "signals", `${videoName}.visual_events.json`),
    ].find((p) => fs.existsSync(p));
    if (!gvPath) {
      console.error(`--gemini: no visual events for "${videoName}" — run gemini-watch.js first.`);
      process.exit(1);
    }
    const gv = JSON.parse(fs.readFileSync(gvPath, "utf-8"));
    geminiActors = geminiWatchProd.mergeVisualEvents(eventTimeline, gv.events, { info: console.log, warn: console.warn });
  }

  // Game identity from the timeline's video name prefix is unreliable — pull
  // the tag from the feedback rows themselves (every scored video has rows).
  const gamesDbRaw = settings.gamesDb || [];
  const gamesDb = Array.isArray(gamesDbRaw) ? gamesDbRaw : Object.values(gamesDbRaw);

  const initialTruth = await loadFeedback(videoName, "?" /* placeholder */);
  if (initialTruth.truth.length === 0) {
    console.error(`No feedback rows for "${videoName}" — nothing to score against.`);
    process.exit(1);
  }
  const gameTag = initialTruth.truth[0].game_tag;
  const gameEntry = gamesDb.find((g) => g.tag === gameTag) || {};
  const { fewShotApproved, fewShotRejected, truth } = await loadFeedback(videoName, gameTag);

  if (!variant.playstyle) gameProfiles.getProfile = () => null;

  const systemPrompt = aiPrompt.buildSystemPrompt({
    gameTag,
    gameName: gameEntry.name || gameTag,
    gameContext: gameEntry.aiContext || "",
    entryType: gameEntry.entryType || "game",
    approvedClips: variant.approved ? fewShotApproved : [],
    rejectedClips: variant.rejected ? fewShotRejected : [],
    creatorProfile: settings.creatorProfile,
    sourceDuration: eventTimeline.source_duration_seconds || Math.max(...energyJson.map((s) => s.end || 0)),
  });

  const frames = deriveFrames(videoName, energyJson, eventTimeline, variant.frames);
  const userContent = aiPrompt.buildUserContent({ claudeReadyText, frames, eventTimeline });

  console.log(`\n=== ${videoName} | variant=${label} | game=${gameTag} ===`);
  console.log(`system prompt: ${systemPrompt.length} chars | transcript: ${claudeReadyText.length} chars | frames: ${frames.length}`);
  console.log(`truth: ${truth.filter((r) => r.decision === "approved").length} approved, ${truth.filter((r) => r.decision === "rejected").length} rejected rows`);

  if (dry) {
    console.log("\n--dry: prompt assembled, no API call. Sections:");
    for (const s of systemPrompt.split("\n\n---\n\n")) console.log(`  ${String(s.trim().split("\n")[0]).padEnd(50)} ${s.length} chars`);
    return;
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const provider = llmProvider.getProvider();

  for (let run = 1; run <= runs; run++) {
    const t0 = Date.now();
    const { text, usage } = await provider.chat({
      model: provider.defaultModel,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      maxTokens: 8192,
      timeout: 120000,
    });
    const picks = aiPrompt.extractJSON(text, "array");
    const s = score(picks, truth);
    const cost = usage.inputTokens * RATE_IN + usage.outputTokens * RATE_OUT;

    const recallStr = s.approvedRecall === null ? "n/a (0 approved)" : `${s.approvedMatched}/${s.approvedTotal} = ${(s.approvedRecall * 100).toFixed(0)}%`;
    console.log(`\nrun ${run}/${runs}: ${picks.length} picks | in ${usage.inputTokens} tok, out ${usage.outputTokens} tok, $${cost.toFixed(3)} | ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`  approved recall : ${recallStr}`);
    console.log(`  rejected hits   : ${s.rejectedHits}/${s.perPick.length} picks (${s.rejectedHitRate === null ? "n/a" : (s.rejectedHitRate * 100).toFixed(0) + "%"})`);
    console.log(`  unreviewed picks: ${s.unreviewed}`);
    for (const p of s.perPick.filter((x) => x.verdict === "unreviewed")) {
      console.log(`    - ${aiPrompt.formatTimestamp(p.start)} → ${aiPrompt.formatTimestamp(p.end)} (conf ${p.confidence})`);
    }

    const outPath = path.join(RESULTS_DIR, `${videoName}__${label}__run${run}.json`);
    fs.writeFileSync(outPath, JSON.stringify({
      videoName, gameTag, label, variant, geminiActors, run,
      promptChars: systemPrompt.length, transcriptChars: claudeReadyText.length, frameCount: frames.length,
      usage, cost, picks, score: s,
      scoredAt: new Date().toISOString(),
    }, null, 2));
    console.log(`  saved ${path.relative(REPO, outPath)}`);
  }
})().catch((e) => {
  console.error("HARNESS FAILED:", e.message);
  process.exit(1);
});
