/**
 * #483 cell 2: 100T hype judge, one clip at a time vs a whole recording at once.
 *
 * Both modes use rubric v2 (Fega, s283): the QUALITY of the play decides. His
 * signature lines ("get him out of here") fire on many kills; a triple kill or a
 * clutch is a highlight, a shabby single kill with the same line is not. Taunts
 * and story beats that stand out also count.
 *
 *   --mode single  each candidate judged alone
 *   --mode stream  every candidate of one recording in ONE call, in stream order,
 *                  so the judge can see what repeats and what stands out
 *
 * Set: every reviewed 100T clip whose reject is not mechanical (291 over 19
 * recordings). Output: stream-out/<mode>/<projectId>.json. Resumable per recording.
 *
 * Usage: node stream-judge.js --mode single|stream [--projects id1,id2] [--concurrency 3]
 */

const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const USER_DATA = path.join(process.env.APPDATA, "Corva");
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request) {
  if (request === "electron") return { app: { isPackaged: false, getPath: () => USER_DATA } };
  if (request === "electron-log") return { info: () => {}, warn: console.warn, error: console.error };
  return origLoad.apply(this, arguments);
};

const REPO = path.join(__dirname, "..", "..", "..");
const llmProvider = require(path.join(REPO, "src", "main", "ai", "llm-provider"));
const gemini = require(path.join(REPO, "src", "main", "ai", "providers", "gemini"));
const { getCost } = require(path.join(REPO, "src", "main", "ai", "cost-tracker"));
const { FFMPEG_BIN } = require(path.join(REPO, "src", "main", "app-paths"));

const MODEL = "gemini-3.6-flash";
const MECHANICAL = new Set(["duplicate", "bad-cut", "wrong-content", "repetitive"]);

const argv = process.argv.slice(2);
const arg = (name, def) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : def);
const MODE = arg("--mode", "stream");
if (!["single", "stream"].includes(MODE)) { console.error("--mode single|stream"); process.exit(1); }
const onlyProjects = arg("--projects", null);
const concurrency = Number(arg("--concurrency", "3"));
const OUT_DIR = path.join(__dirname, "stream-out", MODE);
const TMP_DIR = path.join(__dirname, "_tmp");

const RUBRIC = `The creator watches pro Valorant matches (VCT) and roots for his team, 100 Thieves, reacting live with the caster audio underneath. His audience comes for the plays and his hype.

What makes a highlight:
- The QUALITY of the play decides. A multi-kill (triple or more), a clutch (1 vs 2 or more), a clean outplay, an impossible shot, a round- or match-winning moment: highlight. A routine single kill or a messy trade is not, even when he shouts the same thing. His signature lines ("GET HIM OUT OF HERE!", "Oh my goodness!") fire on many kills, so the line alone means little; judge what happened on screen.
- His reaction must match the play: big, quotable, on the moment.
- Moments without a play can also be highlights when they stand out: a taunt at the opponents, a story beat (the other team burning timeouts, a trophy lift that gets to him), a genuinely funny observation.

Not highlights: routine kills with his usual hype, analysis or narration with nothing happening, waiting between rounds, chatting with his stream chat, moments a stranger could not follow, or energy that only works if you were watching live.`;

const SINGLE_OUT = `Return ONLY one JSON object:
{"play": "<what happens on screen, concretely: kills, situation>", "play_quality": <0-10>, "line": "<his key line verbatim or null>", "keep_score": <0-100: how likely he keeps this as a highlight>, "reason": "<one sentence>"}`;

const STREAM_OUT = `Return ONLY one JSON object:
{"clips": [ {"id": "<the clip id>", "play": "<what happens on screen, concretely>", "play_quality": <0-10>, "line": "<his key line verbatim or null>", "keep_score": <0-100>, "stands_out": <true if it stands out from the rest of THIS stream>, "reason": "<one sentence, comparing to the others where it matters>"} ]}
One entry per clip, every clip id exactly once.`;

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG_BIN, args, { timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 }, (err, _o, stderr) => {
      if (err) return reject(new Error(`ffmpeg: ${String(stderr).slice(-400)}`));
      resolve();
    });
  });
}

function makeProxy(master, start, end, outPath) {
  return ffmpeg(["-y", "-hwaccel", "cuda", "-ss", String(start), "-i", master, "-t", String(Math.max(1, end - start)),
    "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale=-2:720", "-c:v", "h264_nvenc", "-preset", "p4",
    "-b:v", "900k", "-maxrate", "1200k", "-bufsize", "2400k", "-c:a", "aac", "-b:a", "96k", "-ac", "2",
    "-movflags", "+faststart", outPath]);
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function loadRecordings() {
  const settings = JSON.parse(fs.readFileSync(path.join(USER_DATA, "clipflow-settings.json"), "utf-8"));
  const root = path.join(settings.projectsRoot, ".clipflow", "projects");
  const recs = [];
  for (const dir of fs.readdirSync(root)) {
    const f = path.join(root, dir, "project.json");
    if (!fs.existsSync(f)) continue;
    const p = JSON.parse(fs.readFileSync(f, "utf-8"));
    if (String(p.gameTag || "").toUpperCase() !== "100T" || !p.sourceFile || !fs.existsSync(p.sourceFile)) continue;
    const clips = (p.clips || [])
      .filter((c) => (c.status === "approved" || c.status === "rejected") && Number.isFinite(c.startTime))
      .filter((c) => !(c.status === "rejected" && (c.rejectReasons || []).some((r) => MECHANICAL.has(r))))
      .sort((a, b) => a.startTime - b.startTime)
      .map((c, i) => ({ id: `c${String(i + 1).padStart(2, "0")}`, clipId: c.id, decision: c.status, reasons: c.rejectReasons || [],
        confidence: c.confidence, start: c.startTime, end: c.endTime }));
    if (clips.length >= 2) recs.push({ projectId: p.id, name: p.name, master: p.sourceFile, clips });
  }
  return recs;
}

async function withUploads(rec, fn) {
  const uploads = [];
  try {
    for (const c of rec.clips) {
      const proxy = path.join(TMP_DIR, `${MODE}_${c.clipId}.mp4`);
      await makeProxy(rec.master, c.start, c.end, proxy);
      const up = await gemini.uploadFile(String(llmProvider.getStore().get("geminiApiKey")), proxy, "video/mp4", { pollTimeoutMs: 5 * 60 * 1000 });
      try { fs.unlinkSync(proxy); } catch (_) { /* gone */ }
      uploads.push({ clip: c, up });
    }
    return await fn(uploads);
  } finally {
    const key = String(llmProvider.getStore().get("geminiApiKey"));
    for (const { up } of uploads) await gemini.deleteFile(key, up.name).catch(() => {});
  }
}

async function judgeRecording(rec) {
  const outPath = path.join(OUT_DIR, `${rec.projectId}.json`);
  if (fs.existsSync(outPath)) return 0;
  return withUploads(rec, async (uploads) => {
    let cost = 0;
    const results = {};
    if (MODE === "stream") {
      const content = [{ type: "text", text: `All ${uploads.length} candidate moments the detector proposed from ONE stream ("${rec.name}"), in stream order. Watch and listen to every one, compare them, then score each.` }];
      for (const { clip, up } of uploads) {
        content.push({ type: "text", text: `Clip ${clip.id} (stream time ${mmss(clip.start)}, ${Math.round(clip.end - clip.start)} s):` });
        content.push({ type: "video_ref", uri: up.uri, mimeType: "video/mp4" });
      }
      const { text, usage } = await gemini.chat({
        model: MODEL, system: `You judge candidate highlights for a streamer ("the creator").\n\n${RUBRIC}\n\nThe same kind of hype moment repeats many times in a stream. Score each clip against the others: the ones worth keeping are the ones that stand out from the rest of this stream.\n\n${STREAM_OUT}`,
        messages: [{ role: "user", content }], maxTokens: 32768, timeout: 15 * 60 * 1000,
      });
      cost += getCost(MODEL, usage.inputTokens, usage.outputTokens).totalCost;
      for (const j of JSON.parse(text).clips || []) results[j.id] = j;
      results._usage = usage;
    } else {
      for (const { clip, up } of uploads) {
        const { text, usage } = await gemini.chat({
          model: MODEL, system: `You judge candidate highlights for a streamer ("the creator"). You will watch ONE candidate with its sound.\n\n${RUBRIC}\n\n${SINGLE_OUT}`,
          messages: [{ role: "user", content: [{ type: "video_ref", uri: up.uri, mimeType: "video/mp4" }, { type: "text", text: "Watch and listen to the whole moment, then return the JSON object." }] }],
          maxTokens: 8192, timeout: 5 * 60 * 1000,
        });
        cost += getCost(MODEL, usage.inputTokens, usage.outputTokens).totalCost;
        results[clip.id] = JSON.parse(text);
      }
    }
    const missing = rec.clips.filter((c) => !results[c.id]).map((c) => c.id);
    fs.writeFileSync(outPath, JSON.stringify({ projectId: rec.projectId, name: rec.name, mode: MODE, cost, missing,
      clips: rec.clips.map((c) => ({ ...c, judged: results[c.id] || null })) }, null, 1));
    return cost;
  });
}

(async () => {
  const settings = JSON.parse(fs.readFileSync(path.join(USER_DATA, "clipflow-settings.json"), "utf-8"));
  llmProvider.init({ get: (k, def) => (settings[k] !== undefined ? settings[k] : def) });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  let recs = loadRecordings();
  if (onlyProjects) { const want = new Set(onlyProjects.split(",")); recs = recs.filter((r) => want.has(r.projectId)); }
  recs = recs.filter((r) => !fs.existsSync(path.join(OUT_DIR, `${r.projectId}.json`)));
  console.log(`${MODE}: ${recs.length} recordings, ${recs.reduce((a, r) => a + r.clips.length, 0)} clips`);
  let spent = 0;
  const queue = [...recs];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const rec = queue.shift();
      try {
        spent += await judgeRecording(rec);
        console.log(`done ${rec.name}, $${spent.toFixed(2)} so far`);
      } catch (e) {
        console.warn(`FAIL ${rec.name}: ${e.message.slice(0, 300)}`);
      }
    }
  }));
  console.log(`${MODE} finished, $${spent.toFixed(2)}`);
})();
