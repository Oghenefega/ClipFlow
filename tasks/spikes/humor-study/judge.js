/**
 * #483 watch-and-listen judge: Gemini watches one candidate moment WITH audio
 * and scores how likely Fega is to keep it, using the rubric for the clip's
 * kind (hype reaction / comedy) and, in the "judge" arm, Fega's own keeps and
 * rejects of that kind from OTHER recordings (described in text, taken from the
 * #484 humor-study watches).
 *
 * Usage:
 *   node judge.js --arm judge|judge-noex [--limit N] [--keys k1,k2] [--concurrency 6]
 *
 * Output: judge-out/<arm>/<key>.json. Resumable. Prod data read-only.
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
const EXAMPLES_PER_SIDE = 12;
const HYPE = new Set(["100T", "VCT", "RL-R", "VAL-R"]);

const argv = process.argv.slice(2);
const arg = (name, def) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : def);
const ARM = arg("--arm", "judge");
if (!["judge", "judge-noex"].includes(ARM)) { console.error("--arm judge|judge-noex"); process.exit(1); }
const limit = Number(arg("--limit", "0")) || Infinity;
const keys = arg("--keys", null);
const concurrency = Number(arg("--concurrency", "6"));
const OUT_DIR = path.join(__dirname, "judge-out", ARM);
const TMP_DIR = path.join(__dirname, "_tmp");

const RUBRICS = `There are two kinds of clip. Decide which kind this moment is, then judge it by THAT kind's rules only.

KIND "hype_reaction": the creator reacts to pro esports footage (for example 100 Thieves Valorant matches, often with the caster's audio underneath). The audience comes for the play and his hype, not for jokes. A keep needs BOTH:
- a real pro play on screen: a clutch, a multi-kill, an outplay, a disrespectful or absurd moment, a huge throw;
- the creator reacting big and quotably ON that play: yelling, disbelief, mock outrage, a line like "GET HIM OUT OF HERE!" or "What did I just watch?".
It does NOT need to be funny. Rejects: breakdowns and analysis without a big play, calm narration, talk about the team or his feelings with nothing happening on screen, waiting between rounds, a big play with a flat reaction, or something only a viewer of the whole stream would get.

KIND "comedy": the creator plays a game himself, or reacts to non-esports footage (for example humanoid robot videos). Here it must be funny to a stranger. The strongest shape: he says something confident (a boast, a promise, a calm claim), the game immediately does the opposite (a whiff, a fall, a death), he reacts (scream, mock outrage, laughing, or a deadpan beat). Also keeps: self-owns, absurd commentary on absurd footage, a clear surprise with a big reaction. Rejects: nothing happens, narrating or explaining, no payoff, chat banter, setup or tech talk, flat delivery, or it needs too much context.`;

const OUTPUT = `Return ONLY one JSON object:
{
 "kind": "hype_reaction" | "comedy",
 "what": "<one sentence: what happens, including his key line verbatim if there is one>",
 "keep_score": <0-100: how likely the creator keeps this clip, judged by the kind's rules>,
 "payoff_t": <seconds from clip start when the main moment lands, or null>,
 "reaction_end_t": <seconds from clip start when his reaction to it is over, or null>,
 "dead_air": [ [<start s>, <end s>], ... stretches inside the clip a tight edit would cut ],
 "reason": "<one or two sentences, in the kind's terms>"
}`;

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG_BIN, args, { timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 }, (err, _o, stderr) => {
      if (err) return reject(new Error(`ffmpeg: ${String(stderr).slice(-400)}`));
      resolve();
    });
  });
}

function makeProxy(row, outPath) {
  const dur = Math.max(1, row.ai_end - row.ai_start);
  return ffmpeg(["-y", "-hwaccel", "cuda", "-ss", String(row.ai_start), "-i", row.master, "-t", String(dur),
    "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale=-2:720", "-c:v", "h264_nvenc", "-preset", "p4",
    "-b:v", "900k", "-maxrate", "1200k", "-bufsize", "2400k", "-c:a", "aac", "-b:a", "96k", "-ac", "2",
    "-movflags", "+faststart", outPath]);
}

/** Fega's keeps and rejects of one kind, as text, from the #484 study watches. */
function loadExamplePool() {
  const manifest = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf-8")).map((r) => [r.key, r]));
  const pool = [];
  for (const f of fs.readdirSync(path.join(__dirname, "out"))) {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, "out", f), "utf-8"));
    if (d.set === "published_raw") continue; // the rendered version of the same clip already covers it
    const m = manifest[d.key];
    const tag = String(m.game_tag || "").toUpperCase();
    if (tag === "GTA6-R") continue;
    pool.push({
      projectId: m.project_id, kind: HYPE.has(tag) ? "hype" : "comedy", keep: d.set === "published_render",
      game: tag, line: d.watch.key_line, summary: d.watch.summary, reasons: m.reject_reasons || [],
    });
  }
  return pool;
}

/** Deterministic per-clip shuffle so reruns pick the same examples. */
function seeded(list, seedStr) {
  let h = 2166136261;
  for (const ch of seedStr) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function examplesFor(row, pool) {
  const same = pool.filter((p) => p.kind === row.kind && p.projectId !== row.project_id);
  const fmt = (p) => `- [${p.game}] ${p.summary}${p.line ? ` Key line: "${p.line}"` : ""}${!p.keep && p.reasons.length ? ` (rejected: ${p.reasons.join(", ")})` : ""}`;
  const keeps = seeded(same.filter((p) => p.keep), row.key).slice(0, EXAMPLES_PER_SIDE).map(fmt);
  const rejects = seeded(same.filter((p) => !p.keep), row.key).slice(0, EXAMPLES_PER_SIDE).map(fmt);
  return `\n\nThe creator's own past decisions on clips of this kind, from other streams:\n\nKEPT:\n${keeps.join("\n")}\n\nREJECTED:\n${rejects.join("\n")}`;
}

async function judgeOne(row, pool) {
  const outPath = path.join(OUT_DIR, `${row.key}.json`);
  if (fs.existsSync(outPath)) return "skip";
  const proxy = path.join(TMP_DIR, `${ARM}_${row.key}.mp4`);
  try {
    await makeProxy(row, proxy);
    const system = `You judge candidate moments for a gaming streamer ("the creator"), who reviews every clip a detector proposes and keeps about one in three. You will watch ONE candidate with its sound. Listen closely to his voice, his timing and any other audio.\n\n${RUBRICS}${ARM === "judge" ? examplesFor(row, pool) : ""}\n\n${OUTPUT}`;
    const context = `This stream: ${row.game_name}.${row.game_context ? ` In the creator's words: ${row.game_context.slice(0, 600)}` : ""}`;
    const { text, usage } = await gemini.chat({
      model: MODEL,
      system,
      messages: [{ role: "user", content: [
        { type: "video", path: proxy, mimeType: "video/mp4" },
        { type: "text", text: `${context}\n\nWatch and listen to the whole moment, then return the JSON object.` },
      ] }],
      maxTokens: 8192,
      timeout: 5 * 60 * 1000,
    });
    const judged = JSON.parse(text);
    const cost = getCost(MODEL, usage.inputTokens, usage.outputTokens).totalCost;
    fs.writeFileSync(outPath, JSON.stringify({ key: row.key, arm: ARM, model: MODEL, usage, cost, judged }, null, 1));
    return cost;
  } finally {
    try { fs.unlinkSync(proxy); } catch (_) { /* never made */ }
  }
}

(async () => {
  const settings = JSON.parse(fs.readFileSync(path.join(USER_DATA, "clipflow-settings.json"), "utf-8"));
  llmProvider.init({ get: (k, def) => (settings[k] !== undefined ? settings[k] : def) });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const pool = loadExamplePool();

  let rows = JSON.parse(fs.readFileSync(path.join(__dirname, "judge-manifest.json"), "utf-8"));
  if (keys) { const want = new Set(keys.split(",")); rows = rows.filter((r) => want.has(r.key)); }
  rows = rows.filter((r) => !fs.existsSync(path.join(OUT_DIR, `${r.key}.json`))).slice(0, limit);
  console.log(`${ARM}: ${rows.length} to judge, example pool ${pool.length}`);

  let done = 0, failed = 0, spent = 0;
  const queue = [...rows];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const row = queue.shift();
      try {
        const cost = await judgeOne(row, pool);
        if (typeof cost === "number") spent += cost;
        done++;
      } catch (e) {
        failed++;
        console.warn(`FAIL ${row.key}: ${e.message.slice(0, 300)}`);
      }
      if ((done + failed) % 20 === 0) console.log(`${done + failed}/${rows.length}, ${failed} failed, $${spent.toFixed(2)}`);
    }
  }));
  console.log(`${ARM} finished: ${done} ok, ${failed} failed, $${spent.toFixed(2)}`);
})();
