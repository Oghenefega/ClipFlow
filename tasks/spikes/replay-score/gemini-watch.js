/**
 * Gemini full-recording watch (#235) — prototype, harness variant D input.
 *
 * Watches a downscaled proxy of a past recording with gemini-3.6-flash and
 * emits "visual moment" events. Output feeds harness.js --gemini, which merges
 * the events into the recording's event timeline as signal `gemini_visual`
 * (Claude stays the picker — locked shape in the spec).
 *
 * Standalone Files API + generateContent implementation (NOT the prod gemini
 * provider): the prod provider's 90s file-processing poll is too short for a
 * ~30-min proxy, and its upload helper isn't exported. Logic mirrors
 * src/main/ai/providers/gemini.js with spike-appropriate timeouts.
 *
 * Usage:
 *   node gemini-watch.js "<videoName>" [--force-transcode] [--keep-remote]
 *
 * Steps: find master under watchFolder → transcode proxy (720p, ~600kbps,
 * cached in _tmp/proxy/) → Files API upload → one generateContent call →
 * save gemini/<vid>.visual_events.json.
 */

const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const REPO = path.join(__dirname, "..", "..", "..");
const USER_DATA = path.join(process.env.APPDATA, "clipflow");
const SETTINGS_PATH = path.join(USER_DATA, "clipflow-settings.json");
const PROXY_DIR = path.join(__dirname, "_tmp", "proxy");
const OUT_DIR = path.join(__dirname, "gemini");

const API_BASE = "https://generativelanguage.googleapis.com";
const MODEL = "gemini-3.6-flash";
const RATE_IN = 1.5 / 1e6;   // matches src/main/ai/cost-tracker.js
const RATE_OUT = 7.5 / 1e6;
const UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;   // ~140MB over home upstream
const FILE_POLL_TIMEOUT_MS = 10 * 60 * 1000; // 30-min video takes a while to go ACTIVE
const GENERATE_TIMEOUT_MS = 10 * 60 * 1000;  // ~190k video tokens to chew

const argv = process.argv.slice(2);
const videoName = argv.find((a) => !a.startsWith("--"));
if (!videoName) {
  console.error('Usage: node gemini-watch.js "<videoName>" [--force-transcode] [--keep-remote]');
  process.exit(1);
}
const forceTranscode = argv.includes("--force-transcode");
const keepRemote = argv.includes("--keep-remote");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findMaster(watchFolder, vid) {
  const stack = [watchFolder];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.name === `${vid}.mp4` || entry.name === `${vid}.mkv`) return p;
    }
  }
  return null;
}

function transcodeProxy(masterPath, proxyPath) {
  // 720p-height H.264 at ~600kbps + 64k mono AAC. Gemini samples ~1fps, so
  // bitrate beyond legibility is wasted; audio stays in for announcer/crowd
  // context (the titlegen token math that priced this call included audio).
  // NVDEC + NVENC: software-decoding the 2560×2880 HEVC master runs ~25 min;
  // Fega's 3090 does it in a few. Writes to .tmp and renames on success so a
  // killed run never leaves a partial file the cache check would reuse.
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

async function fetchJson(url, options, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const body = await res.text();
    let json = null;
    try { json = JSON.parse(body); } catch (_) { /* non-JSON error body */ }
    if (!res.ok) throw new Error(`Gemini API error (HTTP ${res.status}): ${json?.error?.message || body.substring(0, 300)}`);
    return json;
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`Gemini API request timed out after ${timeout / 1000}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function uploadFile(apiKey, filePath) {
  const bytes = fs.readFileSync(filePath);
  console.log(`Uploading proxy (${(bytes.length / 1024 / 1024).toFixed(1)}MB) via Files API...`);

  const startRes = await fetch(`${API_BASE}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": "video/mp4",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: path.basename(filePath) } }),
  });
  if (!startRes.ok) throw new Error(`Files API start failed (HTTP ${startRes.status}): ${(await startRes.text()).substring(0, 300)}`);
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Files API start returned no upload URL");

  const upController = new AbortController();
  const upTimer = setTimeout(() => upController.abort(), UPLOAD_TIMEOUT_MS);
  let fileInfo;
  try {
    const upRes = await fetch(uploadUrl, {
      method: "POST",
      signal: upController.signal,
      headers: {
        "Content-Length": String(bytes.length),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: bytes,
    });
    if (!upRes.ok) throw new Error(`Files API upload failed (HTTP ${upRes.status}): ${(await upRes.text()).substring(0, 300)}`);
    fileInfo = (await upRes.json()).file;
  } finally {
    clearTimeout(upTimer);
  }
  if (!fileInfo?.name) throw new Error("Files API upload returned no file name");

  const deadline = Date.now() + FILE_POLL_TIMEOUT_MS;
  while (fileInfo.state === "PROCESSING") {
    if (Date.now() > deadline) throw new Error("Files API processing timed out");
    await sleep(5000);
    fileInfo = await fetchJson(`${API_BASE}/v1beta/${fileInfo.name}`, { headers: { "x-goog-api-key": apiKey } }, 30000);
  }
  if (fileInfo.state !== "ACTIVE") throw new Error(`Files API file ended in state ${fileInfo.state}`);
  return fileInfo;
}

// v2 (actor-aware, #235): Fega's eyeball verdicts on the v1 picks showed the
// discriminator is creator AUTHORSHIP — his own crashes/fails keep, teammate/
// opponent spectacle he merely watches rejects, talk-without-action rejects.
const SYSTEM = `You are a visual-moment scout for a gaming content creator's highlight detection. The recording is captured from the CREATOR's own point of view — exactly one person is playing and recording; call them "the player". They may control a character or vehicle (a car, a truck, an egg); its actions are the player's actions.

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

(async () => {
  const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
  const apiKey = String(settings.geminiApiKey || "").trim();
  if (!apiKey) { console.error("No geminiApiKey in prod settings."); process.exit(1); }
  const watchFolder = settings.watchFolder;

  const master = findMaster(watchFolder, videoName);
  if (!master) { console.error(`Master for "${videoName}" not found under ${watchFolder}`); process.exit(1); }
  console.log(`Master: ${master} (${(fs.statSync(master).size / 1024 / 1024 / 1024).toFixed(2)}GB)`);

  fs.mkdirSync(PROXY_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const proxyPath = path.join(PROXY_DIR, `${videoName}.proxy.mp4`);
  if (forceTranscode || !fs.existsSync(proxyPath)) {
    console.log("Transcoding proxy (720p ~600kbps)...");
    const t0 = Date.now();
    await transcodeProxy(master, proxyPath);
    console.log(`Proxy done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  } else {
    console.log("Proxy cached, skipping transcode.");
  }
  console.log(`Proxy: ${(fs.statSync(proxyPath).size / 1024 / 1024).toFixed(1)}MB`);

  const uploaded = await uploadFile(apiKey, proxyPath);
  console.log(`Uploaded: ${uploaded.name} (${uploaded.state})`);

  try {
    console.log("Watching recording (generateContent)...");
    const t0 = Date.now();
    const result = await fetchJson(
      `${API_BASE}/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{
            role: "user",
            parts: [
              { fileData: { mimeType: "video/mp4", fileUri: uploaded.uri } },
              { text: "Watch the full recording and return the JSON array of visual moments." },
            ],
          }],
          generationConfig: { maxOutputTokens: 8192, responseMimeType: "application/json" },
        }),
      },
      GENERATE_TIMEOUT_MS
    );
    if (result.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request: ${result.promptFeedback.blockReason}`);

    const text = (result.candidates?.[0]?.content?.parts || [])
      .filter((p) => typeof p.text === "string").map((p) => p.text).join("\n");
    const usageMeta = result.usageMetadata || {};
    const usage = {
      inputTokens: usageMeta.promptTokenCount || 0,
      outputTokens: (usageMeta.candidatesTokenCount || 0) + (usageMeta.thoughtsTokenCount || 0),
    };
    const cost = usage.inputTokens * RATE_IN + usage.outputTokens * RATE_OUT;

    let events;
    try {
      events = JSON.parse(text);
    } catch (e) {
      console.error("Unparseable Gemini output:\n", text.substring(0, 2000));
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

    console.log(`\n${events.length} visual moments | in ${usage.inputTokens} tok, out ${usage.outputTokens} tok, $${cost.toFixed(3)} | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    for (const e of events) {
      const mm = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
      console.log(`  ${mm(e.t_start_s)} → ${mm(e.t_end_s)}  (${e.score.toFixed(2)}) ${e.label} — ${e.what}`);
    }

    const outPath = path.join(OUT_DIR, `${videoName}.visual_events.json`);
    fs.writeFileSync(outPath, JSON.stringify({
      videoName, model: MODEL, promptVersion: PROMPT_VERSION, usage, cost, events,
      proxy: { sizeMB: +(fs.statSync(proxyPath).size / 1024 / 1024).toFixed(1), settings: "720p h264 600k + aac 64k mono" },
      generatedAt: new Date().toISOString(),
    }, null, 2));
    console.log(`\nsaved ${path.relative(REPO, outPath)}`);
  } finally {
    if (!keepRemote) {
      try { await fetch(`${API_BASE}/v1beta/${uploaded.name}`, { method: "DELETE", headers: { "x-goog-api-key": apiKey } }); } catch (_) { /* expires in 48h */ }
    }
  }
})().catch((e) => {
  console.error("GEMINI-WATCH FAILED:", e.message);
  process.exit(1);
});
