/**
 * Gemini full-recording watch (#235) — pipeline signal `gemini_visual`.
 *
 * Watches a downscaled proxy of the whole recording with gemini-3.6-flash and
 * emits "visual moment" events into the existing event timeline. Claude stays
 * the picker (locked shape, tasks/specs/detection-input-science.md §Step 4).
 *
 * Validated as harness variants D2/D3/D4 before integration; the watch prompt
 * below is v2-actor EXACTLY as validated — do not tweak wording without a new
 * harness cell (spec: engine variants are judged by replay scores, not vibes).
 *
 * Also required by tasks/spikes/replay-score/ (CLI + harness merge), so the
 * ablation cells measure this shipped code: keep it main-process-safe under a
 * plain-node electron stub (no top-level electron requires).
 */

const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const aiPrompt = require("./ai-prompt");
const { getCost } = require("./ai/cost-tracker");

const MODEL = "gemini-3.6-flash";
const UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;    // ~140MB proxy over home upstream
const FILE_POLL_TIMEOUT_MS = 10 * 60 * 1000; // 30-min video takes a while to go ACTIVE
const GENERATE_TIMEOUT_MS = 10 * 60 * 1000;  // ~190k video tokens to chew

// v2-actor (#235, validated session 147): Fega's eyeball verdicts showed the
// discriminator is creator AUTHORSHIP — his own crashes/fails keep, teammate/
// opponent spectacle he merely watches rejects, talk-without-action rejects.
const WATCH_PROMPT = `You are a visual-moment scout for a gaming content creator's highlight detection. The recording is captured from the CREATOR's own point of view — exactly one person is playing and recording; call them "the player". They may control a character or vehicle (a car, a truck, an egg); its actions are the player's actions.

TARGET: moments the player AUTHORS — their own plays and especially their own fails. Mark: the player's crashes, falls, deaths, botched jumps, blown leads, and the player's own spectacular goals, saves, aerial shots, clutch kills, wild dodges, funny glitches or ragdolls. A dramatic fail by the player is a top-tier moment.

NOT targets — do not mark:
- Spectator moments: plays performed by a teammate or opponent that the player merely watches (their goals, flip resets, kills, saves), no matter how impressive.
- Talk-without-action: menus, downtime, or stretches where nothing notable happens in the game itself.
- Moments only interesting because of what the player SAYS or how loud they react — commentary and mic audio are scored by other systems. Your job is what the GAME shows the player DOING.

Return ONLY a JSON array (no prose) of at most 25 objects, each:
{"t_start_s": <number, seconds from video start>, "t_end_s": <number>, "score": <0.0-1.0 how strong the moment is>, "label": "<snake_case, 2-4 words, e.g. aerial_double_save>", "what": "<one short sentence of what happens on screen>"}

The "what" sentence MUST begin by naming the actor: start with "The player" for the player's own actions. If you cannot tell who authored the action, start with "Unclear actor:". If a teammate or opponent moment is somehow essential, start with "Teammate" or "Opponent" — never a bare gamertag — so it can be downweighted.

Timestamps must be accurate to within a couple of seconds. Only include moments you actually saw. Fewer, higher-confidence moments beat exhaustive lists.`;
const PROMPT_VERSION = "v2-actor";

/**
 * Classify who authored an event from its `what` sentence.
 * v2 phrasing is actor-first, so the sentence start is authoritative —
 * keyword scan is only a fallback for v1-style files ("opponent's net"
 * mid-sentence is a location, not an actor).
 * @param {string} what
 * @returns {"player"|"spectator"|"unclear"}
 */
function classifyActor(what) {
  const w = String(what || "").toLowerCase().trim();
  if (/^(the player|the creator)\b/.test(w)) return "player";
  if (/^(a |an |the )?(teammate|team-mate|opponent|enemy|another player|other player|rival)\b/.test(w)) return "spectator";
  if (/^unclear actor/.test(w)) return "unclear";
  if (/\b(teammate|team-mate|opponent|enemy|another player|other player|rival)(?!'s)\b/.test(w)) return "spectator";
  if (/\bthe player\b|\bplayer's\b|\bthe creator\b/.test(w)) return "player";
  return "unclear";
}

/**
 * Merge watch events into an event timeline, actor-aware (#235 D3): spectator
 * events are dropped before the merge; player-authored and unclear events
 * merge at their RAW Gemini confidence (no ceiling — #237's per-signal caps
 * keep saturated mic signals from crowding sub-1.0 scores out of the prompt).
 * Mutates eventTimeline (events + signals_computed).
 * @param {object} eventTimeline - { events: [...], signals_computed: [...] }
 * @param {Array} events - visual_events.json events
 * @param {{info: function, warn: function}} logger
 * @returns {{player: number, spectator: number, unclear: number, landed: number}}
 */
function mergeVisualEvents(eventTimeline, events, logger) {
  const byActor = { player: [], spectator: [], unclear: [] };
  for (const e of events || []) byActor[classifyActor(e.what)].push(e);

  eventTimeline.events = [
    ...eventTimeline.events,
    ...[...byActor.player, ...byActor.unclear]
      .map((e) => ({ t_start: e.t_start_s, t_end: e.t_end_s, signal: "gemini_visual", score: e.score, label: e.label })),
  ];
  eventTimeline.signals_computed = [...(eventTimeline.signals_computed || []), "gemini_visual"];

  const landed = aiPrompt.selectTimelineEvents(eventTimeline.events)
    .filter((e) => e.signal === "gemini_visual").length;
  if (logger) {
    logger.info(`Gemini watch merge: ${byActor.player.length} player + ${byActor.unclear.length} unclear merged, ${byActor.spectator.length} spectator dropped, ${landed} land in the prompt's event section (raw scores, no ceiling)`);
    for (const e of byActor.spectator) {
      logger.info(`  dropped: ${aiPrompt.formatTimestamp(e.t_start_s)} ${e.label} — ${e.what}`);
    }
  }
  return { player: byActor.player.length, spectator: byActor.spectator.length, unclear: byActor.unclear.length, landed };
}

/**
 * Transcode the master to a 720p-height H.264 proxy at ~600kbps + 64k mono
 * AAC. Gemini samples ~1fps, so bitrate beyond legibility is wasted; audio
 * stays in for announcer/crowd context. NVDEC + NVENC: software-decoding the
 * 2560×2880 HEVC master runs ~25 min; the GPU does it in a few. Writes to
 * .tmp and renames on success so a killed run never leaves a partial file.
 */
function transcodeProxy(masterPath, proxyPath) {
  const tmpPath = `${proxyPath}.tmp.mp4`;
  const args = [
    "-y", "-hwaccel", "cuda", "-i", masterPath,
    "-vf", "scale=-2:720",
    "-c:v", "h264_nvenc", "-preset", "p4",
    "-b:v", "600k", "-maxrate", "800k", "-bufsize", "1600k",
    "-c:a", "aac", "-b:a", "64k", "-ac", "1",
    "-movflags", "+faststart",
    tmpPath,
  ];
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", args, { timeout: 60 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 }, (err) => {
      if (err) {
        try { fs.unlinkSync(tmpPath); } catch (_) { /* nothing to clean */ }
        return reject(new Error(`Proxy transcode failed: ${err.message}`));
      }
      fs.renameSync(tmpPath, proxyPath);
      resolve();
    });
  });
}

/**
 * Watch a full recording: proxy transcode → Files API upload (long poll) →
 * one generateContent call → validated events + artifact JSON on disk.
 *
 * @param {object} opts
 * @param {string} opts.sourceFile - Master recording path
 * @param {string} opts.videoName - Base video name (artifact naming)
 * @param {string} opts.processingDir - Pipeline processing root
 * @param {object} opts.store - Settings store ({ get })
 * @param {{info: function, warn: function}} opts.logger
 * @param {string} [opts.proxyPath] - Override proxy location (spike cache)
 * @param {string} [opts.outPath] - Override artifact location (spike gemini/)
 * @param {boolean} [opts.keepProxy=false] - Skip proxy cleanup (spike cache)
 * @returns {Promise<{ events: Array, usage: object, cost: number, outPath: string }>}
 */
async function watchRecording({ sourceFile, videoName, processingDir, store, logger, proxyPath, outPath, keepProxy = false }) {
  const apiKey = String(store.get("geminiApiKey") || "").trim();
  if (!apiKey) throw new Error("Gemini API key not configured");
  // Lazy require: pulls in electron-log — kept out of module load so
  // classifyActor/mergeVisualEvents stay requireable in bare-node tests.
  const gemini = require("./ai/providers/gemini");

  const resolvedProxy = proxyPath || path.join(processingDir, "proxy", `${videoName}.proxy.mp4`);
  const resolvedOut = outPath || path.join(processingDir, "signals", `${videoName}.visual_events.json`);
  fs.mkdirSync(path.dirname(resolvedProxy), { recursive: true });
  fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });

  let uploaded = null;
  try {
    if (!fs.existsSync(resolvedProxy)) {
      const t0 = Date.now();
      await transcodeProxy(sourceFile, resolvedProxy);
      logger.info(`Gemini watch: proxy transcoded in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    } else {
      logger.info("Gemini watch: proxy cached, skipping transcode");
    }
    const proxySizeMB = +(fs.statSync(resolvedProxy).size / 1024 / 1024).toFixed(1);
    logger.info(`Gemini watch: uploading proxy (${proxySizeMB}MB) via Files API`);

    uploaded = await gemini.uploadFile(apiKey, resolvedProxy, "video/mp4", {
      uploadTimeoutMs: UPLOAD_TIMEOUT_MS,
      pollTimeoutMs: FILE_POLL_TIMEOUT_MS,
    });

    logger.info("Gemini watch: watching recording (generateContent)");
    const t0 = Date.now();
    const { text, usage } = await gemini.chat({
      model: MODEL,
      system: WATCH_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "video_ref", uri: uploaded.uri, mimeType: "video/mp4" },
          { type: "text", text: "Watch the full recording and return the JSON array of visual moments." },
        ],
      }],
      maxTokens: 8192,
      timeout: GENERATE_TIMEOUT_MS,
    });

    let events;
    try {
      events = JSON.parse(text);
    } catch (e) {
      throw new Error(`Gemini returned non-JSON: ${e.message}`);
    }
    if (!Array.isArray(events)) throw new Error("Gemini output is not an array");
    events = events
      .filter((e) => typeof e.t_start_s === "number" && typeof e.t_end_s === "number")
      .map((e) => ({
        t_start_s: e.t_start_s,
        t_end_s: Math.max(e.t_end_s, e.t_start_s),
        score: Math.max(0, Math.min(1, Number(e.score) || 0)),
        label: String(e.label || "visual_moment").replace(/[^a-z0-9_]/gi, "_").toLowerCase(),
        what: String(e.what || ""),
      }));

    const cost = getCost(MODEL, usage.inputTokens, usage.outputTokens).totalCost;
    logger.info(`Gemini watch: ${events.length} visual moments | in ${usage.inputTokens} tok, out ${usage.outputTokens} tok, $${cost.toFixed(3)} | ${((Date.now() - t0) / 1000).toFixed(0)}s`);

    fs.writeFileSync(resolvedOut, JSON.stringify({
      videoName, model: MODEL, promptVersion: PROMPT_VERSION, usage, cost, events,
      proxy: { sizeMB: proxySizeMB, settings: "720p h264 600k + aac 64k mono" },
      generatedAt: new Date().toISOString(),
    }, null, 2));

    return { events, usage, cost, outPath: resolvedOut };
  } finally {
    if (uploaded) await gemini.deleteFile(apiKey, uploaded.name);
    if (!keepProxy) { try { fs.unlinkSync(resolvedProxy); } catch (_) { /* already gone */ } }
  }
}

module.exports = {
  watchRecording,
  mergeVisualEvents,
  classifyActor,
  transcodeProxy,
  WATCH_PROMPT,
  PROMPT_VERSION,
  MODEL,
};
