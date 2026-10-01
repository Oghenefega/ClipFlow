/**
 * #484 humor study: Gemini watches each manifest moment WITH audio and returns
 * a structured beat breakdown. Resumable: a moment with out/<key>.json is skipped.
 *
 * Usage:
 *   node watch.js [--only <set>] [--limit N] [--keys k1,k2] [--concurrency 4]
 *
 * Uses the shipped Gemini provider (src/main/ai/providers/gemini.js) under the
 * same plain-node electron stub as tasks/spikes/replay-score/gemini-watch.js.
 * Prod data is read-only; proxies go to _tmp/ and are deleted after each call.
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
const OUT_DIR = path.join(__dirname, "out");
const TMP_DIR = path.join(__dirname, "_tmp");
const COST_LOG = path.join(__dirname, "cost-log.jsonl");

const PROMPT = `You are studying what makes a gaming streamer's short clips funny. The streamer is "the creator": one person, recording his own stream. You will watch ONE short clip with its sound. Listen closely: the creator's voice, his timing, his tone, pauses, laughs, and any other voices (friends in voice chat, teammates, a caster, a video he is watching).

Some clips are the creator playing a game (his point of view). Others are the creator REACTING to footage he is watching (for example a pro esports match): then the on-screen action is not his, and the comedy usually lives in his commentary.

Describe the clip as a comedy editor would. Be concrete and honest: if the clip is not funny, or is hype or skill rather than comedy, say so. Do not invent beats you did not see or hear.

Return ONLY one JSON object with exactly these fields:
{
 "format": "gameplay" | "reaction_to_footage" | "talking" | "other",
 "summary": "<one sentence: what happens>",
 "beats": [ {"t": <seconds from clip start>, "type": "context" | "setup" | "escalation" | "trigger" | "payoff" | "reaction" | "aftermath" | "callback", "what": "<short, concrete>"} ],
 "payoff_t": <seconds from clip start when the main payoff lands, or null if there is none>,
 "hook_t": <seconds from clip start of the first thing that would stop a scroller>,
 "author": "creator" | "teammate" | "opponent" | "pro_player_in_footage" | "game_itself" | "mixed" | "none",
 "mechanisms": [ up to 3 of: "self_own_fail", "hubris_then_fail", "comedic_timing_pause", "overreaction", "deadpan_underreaction", "irony_says_x_then_opposite", "absurd_commentary", "roast_or_banter", "teammate_chaos", "betrayal", "glitch_or_physics", "unexpected_outcome", "rage", "confusion", "running_bit_callback", "jumpscare", "wholesome", "hype_skill_not_comedy", "informational_not_comedy" ],
 "delivery": [ up to 3 of: "yelling", "laughing", "mock_outrage", "disbelief", "deadpan", "narrating", "whisper_or_mutter", "singing_or_voice", "calm_explaining", "silence" ],
 "key_line": "<the single line that carries the clip, verbatim as heard, or null>",
 "key_line_t": <seconds or null>,
 "other_voices": "none" | "friends_or_teammates" | "caster_or_footage_audio" | "game_characters" | "mixed",
 "opens_with": "action" | "context_talk" | "mid_sentence" | "dead_air",
 "ends_with": "on_payoff" | "on_reaction" | "lingers_after_reaction" | "mid_action" | "callback_or_button",
 "edit_traces": [ any of: "jump_cuts", "added_sound_effect", "added_music", "zoom_or_reframe", "text_overlay", "none_visible" ],
 "stranger_funny_1to10": <how funny to a stranger with no context, integer>,
 "needs_context": <true if a stranger would not get it without knowing the stream or the game>,
 "why": "<two sentences max: why this works or does not, in comedy terms>"
}`;

const argv = process.argv.slice(2);
const arg = (name, def) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : def);
const onlySet = arg("--only", null);
const limit = Number(arg("--limit", "0")) || Infinity;
const keys = arg("--keys", null);
const concurrency = Number(arg("--concurrency", "4"));

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG_BIN, args, { timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 }, (err, _o, stderr) => {
      if (err) return reject(new Error(`ffmpeg: ${String(stderr).slice(-400)}`));
      resolve();
    });
  });
}

/** Small 720p-tall proxy with stereo audio, inline-sized for Gemini. */
async function makeProxy(row, outPath) {
  const enc = ["-vf", "scale=-2:720", "-c:v", "h264_nvenc", "-preset", "p4", "-b:v", "900k", "-maxrate", "1200k", "-bufsize", "2400k",
    "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-movflags", "+faststart", outPath];
  if (row.set === "published_render") {
    await ffmpeg(["-y", "-i", row.render, "-map", "0:v:0", "-map", "0:a:0?", ...enc]);
  } else {
    const dur = Math.max(1, row.ai_end - row.ai_start);
    await ffmpeg(["-y", "-hwaccel", "cuda", "-ss", String(row.ai_start), "-i", row.master, "-t", String(dur),
      "-map", "0:v:0", "-map", "0:a:0?", ...enc]);
  }
}

async function watchOne(row) {
  const outPath = path.join(OUT_DIR, `${row.key}.json`);
  if (fs.existsSync(outPath)) return "skip";
  const proxy = path.join(TMP_DIR, `${row.key}.mp4`);
  try {
    await makeProxy(row, proxy);
    const t0 = Date.now();
    const { text, usage } = await gemini.chat({
      model: MODEL,
      system: PROMPT,
      messages: [{ role: "user", content: [
        { type: "video", path: proxy, mimeType: "video/mp4" },
        { type: "text", text: "Watch and listen to the whole clip, then return the JSON object." },
      ] }],
      maxTokens: 8192,
      timeout: 5 * 60 * 1000,
    });
    const watch = JSON.parse(text);
    const cost = getCost(MODEL, usage.inputTokens, usage.outputTokens).totalCost;
    fs.writeFileSync(outPath, JSON.stringify({ key: row.key, set: row.set, clip_id: row.clip_id, model: MODEL, usage, cost, watch }, null, 1));
    fs.appendFileSync(COST_LOG, JSON.stringify({ key: row.key, cost, in: usage.inputTokens, out: usage.outputTokens, s: (Date.now() - t0) / 1000 }) + "\n");
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

  let rows = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf-8"));
  if (onlySet) rows = rows.filter((r) => r.set === onlySet);
  if (keys) { const want = new Set(keys.split(",")); rows = rows.filter((r) => want.has(r.key)); }
  rows = rows.filter((r) => !fs.existsSync(path.join(OUT_DIR, `${r.key}.json`))).slice(0, limit);
  console.log(`${rows.length} to watch`);

  let done = 0, failed = 0, spent = 0;
  const queue = [...rows];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const row = queue.shift();
      try {
        const cost = await watchOne(row);
        if (typeof cost === "number") spent += cost;
        done++;
      } catch (e) {
        failed++;
        console.warn(`FAIL ${row.key}: ${e.message.slice(0, 300)}`);
      }
      if ((done + failed) % 10 === 0) console.log(`${done + failed}/${rows.length} done, ${failed} failed, $${spent.toFixed(2)}`);
    }
  }));
  console.log(`finished: ${done} ok, ${failed} failed, $${spent.toFixed(2)}`);
})();
