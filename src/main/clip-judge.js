/**
 * Clip judge (#483): after detection, Gemini watches each candidate clip WITH
 * its sound and scores how likely the creator is to keep it, with a one-line
 * reason. The review list sorts by that score; nothing is hidden or rejected.
 *
 * Validated in tasks/spikes/humor-study/ (spec: tasks/specs/detection-input-
 * science.md Step 7): the judge ranks keeps above rejects clearly better than
 * detection confidence. The rubric is generic on purpose: the model decides
 * which kind of clip it is watching, and the creator's own game description
 * (gamesDb aiContextUser) supplies the specifics — never hardcode one
 * creator's teams or catchphrases here.
 *
 * Main-process safe under a plain-node electron stub: everything that pulls in
 * electron (provider, ffmpeg, ai-call-log) is required lazily, so the prompt
 * and parse helpers are testable bare and the spike harness can run judgeOne.
 */

const path = require("path");
const fs = require("fs");
const { getCost } = require("./ai/cost-tracker");

const MODEL = "gemini-3.6-flash";
const RUBRIC_VERSION = "v4";
const CONCURRENCY = 3;
// A normal call takes 7-20 s. About 2% of calls hang until the timeout and most
// succeed on a second try (770-clip gate, s283), so wait 60 s and retry once
// rather than letting one hung call hold the recording up for minutes.
const CALL_TIMEOUT_MS = 60 * 1000;

const RUBRIC = `There are two kinds of clip. Decide which kind this moment is, then judge it by THAT kind's rules only.

KIND "hype_reaction": the creator watches pro esports or other competitive footage and reacts, often with the commentators' audio underneath. The audience comes for the play and his reaction, not for jokes.
- The QUALITY of the play decides. A multi-kill (triple or more), a clutch (1 vs 2 or more), a clean outplay, an impossible shot, a round- or match-winning moment: highlight. A routine single kill or a messy trade is not, even when he shouts the same thing. A creator's signature lines fire on many plays, so the line alone means little; judge what happened on screen.
- His reaction must match the play: big, quotable, on the moment.
- A play AGAINST the team he roots for counts only when it is an ace or a clutch AND he reacts hard. A routine kill or round win by the other side is not a highlight.
- Prefer the live moment when his reaction is bigger. A replay is better when it condenses a multi-kill that took a whole round live.
- Moments without a play can be highlights when they stand out: an over-the-top taunt at the opponents, a moment that genuinely gets to him, a genuinely funny observation. Plain story talk is not: it only made sense in the moment when the stakes were high.
- Not highlights: routine kills with his usual hype, analysis or narration with nothing happening, waiting between rounds, chatting with his stream chat, moments that were only funny if you were in chat, long build-ups, anything a stranger could not follow later.

KIND "comedy": the creator plays a game himself, or reacts to footage that is not competitive play. It must be funny to a stranger.
- The strongest shape: he says something confident, the game immediately does the opposite, he reacts (scream, mock outrage, laughing, or a deadpan beat).
- Also keeps: self-owns, absurd commentary on absurd footage, a clear surprise with a big reaction, a friend or teammate landing a genuinely funny joke while he laughs.
- A moment with no words from him rarely works.
- Rejects: nothing happens, narrating or explaining, no payoff, chat banter, setup or tech talk, flat delivery, too much context needed.`;

const OUTPUT = `Return ONLY one JSON object:
{
 "kind": "hype_reaction" | "comedy",
 "what": "<one sentence: what happens, including his key line verbatim if there is one>",
 "play_quality": <0-10 for hype_reaction (how good the play is), null for comedy>,
 "reaction_size": <0-10: how big and quotable his reaction is>,
 "keep_score": <0-100: how likely the creator keeps this clip, judged by the kind's rules>,
 "payoff_t": <seconds from clip start when the main moment lands, or null>,
 "reaction_end_t": <seconds from clip start when his reaction to it is over, or null>,
 "reason": "<one short sentence for the creator: why this is or is not a keeper, in the kind's terms>"
}`;

const SYSTEM = `You judge candidate moments for a streamer ("the creator"), who reviews every clip a detector proposes and keeps only the best. You will watch ONE candidate with its sound. Listen closely to his voice, his timing and any other audio.

${RUBRIC}

${OUTPUT}`;

/**
 * The user turn's text: which stream this is, in the creator's own words.
 * @param {{gameName?: string, gameContext?: string, watchedGameName?: string}} ctx
 */
function buildContextText({ gameName, gameContext, watchedGameName } = {}) {
  const parts = [];
  if (gameName) parts.push(`This stream: ${gameName}.`);
  if (watchedGameName) parts.push(`The game being watched: ${watchedGameName}.`);
  const ctx = String(gameContext || "").trim();
  if (ctx) parts.push(`In the creator's words: ${ctx.slice(0, 1200)}`);
  parts.push("Watch and listen to the whole moment, then return the JSON object.");
  return parts.join("\n\n");
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Parse and normalize the model's JSON. Null when unusable (bad JSON or no score).
 * @param {string} text
 */
function parseJudgeResult(text) {
  let j;
  try { j = JSON.parse(text); } catch (_) { return null; }
  if (!j || typeof j !== "object") return null;
  const score = num(j.keep_score);
  if (score === null) return null;
  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    kind: j.kind === "hype_reaction" || j.kind === "comedy" ? j.kind : null,
    reason: String(j.reason || "").trim().slice(0, 300),
    what: String(j.what || "").trim().slice(0, 300),
    playQuality: num(j.play_quality),
    reactionSize: num(j.reaction_size),
    payoffT: num(j.payoff_t),
    reactionEndT: num(j.reaction_end_t),
  };
}

/**
 * Judge one moment of a recording. Cuts a small preview (the same cutter
 * title/caption generation uses), sends it with its sound, deletes the preview.
 * @returns {Promise<{ judge: object|null, usage: object, costUsd: number, durationMs: number, rawText: string }>}
 */
async function judgeOne({ sourceFile, start, end, context, previewPath }) {
  const ffmpeg = require("./ffmpeg");
  const gemini = require("./ai/providers/gemini");
  const t0 = Date.now();
  fs.mkdirSync(path.dirname(previewPath), { recursive: true });
  try {
    await ffmpeg.cutTitlePreview(sourceFile, previewPath, { start, duration: Math.max(1, end - start) });
    const { text, usage } = await gemini.chat({
      model: MODEL,
      system: SYSTEM,
      messages: [{ role: "user", content: [
        { type: "video", path: previewPath, mimeType: "video/mp4" },
        { type: "text", text: buildContextText(context) },
      ] }],
      maxTokens: 8192,
      timeout: CALL_TIMEOUT_MS,
    });
    const judge = parseJudgeResult(text);
    return { judge, usage, costUsd: getCost(MODEL, usage.inputTokens, usage.outputTokens).totalCost, durationMs: Date.now() - t0, rawText: text };
  } finally {
    try { fs.unlinkSync(previewPath); } catch (_) { /* never made */ }
  }
}

/**
 * Judge every clip of a freshly detected project, CONCURRENCY at a time.
 * Mutates each clip with `judge` on success. A failed clip keeps no score and
 * never stops the others. Every call is logged to ai_calls (kind "clip_judge").
 *
 * @param {object} opts
 * @param {object} opts.project       - { id, sourceFile }
 * @param {Array}  opts.clips         - clip objects (startTime/endTime)
 * @param {object} opts.context       - { gameName, gameContext, watchedGameName }
 * @param {string} opts.previewDir    - where previews are cut (deleted after each call)
 * @param {object} opts.logger        - pipeline logger ({ info, warn, logApiUsage })
 * @param {function} [opts.judgeFn]   - injectable for tests (defaults to judgeOne)
 * @param {function} [opts.recordCall]- injectable for tests (defaults to ai-call-log record)
 * @returns {Promise<{ judged: number, failed: number, costUsd: number }>}
 */
async function judgeClips({ project, clips, context, previewDir, logger, judgeFn = judgeOne, recordCall }) {
  const record = recordCall || require("./ai/ai-call-log").record;
  const queue = [...clips];
  let judged = 0, failed = 0, costUsd = 0;

  async function worker() {
    while (queue.length) {
      const clip = queue.shift();
      const t0 = Date.now();
      const args = {
        sourceFile: project.sourceFile, start: clip.startTime, end: clip.endTime, context,
        previewPath: path.join(previewDir, `${clip.id}.mp4`),
      };
      try {
        let r;
        try {
          r = await judgeFn(args);
        } catch (e) {
          if (!/timed out/i.test(String(e.message))) throw e;
          logger?.warn?.(`Clip judge: ${clip.id} timed out, retrying once`);
          r = await judgeFn(args);
        }
        costUsd += r.costUsd || 0;
        if (logger?.logApiUsage && r.usage) logger.logApiUsage(r.usage.inputTokens || 0, r.usage.outputTokens || 0, MODEL, r.usage.thoughtTokens || 0);
        if (r.judge) {
          clip.judge = { ...r.judge, model: MODEL, rubric: RUBRIC_VERSION, at: new Date().toISOString() };
          judged++;
        } else {
          failed++;
          logger?.warn?.(`Clip judge: unusable answer for ${clip.id}`);
        }
        record({ kind: "clip_judge", clipId: clip.id, projectId: project.id, provider: "gemini", model: MODEL,
          path: "video", usage: r.usage, costUsd: r.costUsd, durationMs: r.durationMs, ok: Boolean(r.judge),
          error: r.judge ? null : "unparseable answer" });
      } catch (e) {
        failed++;
        logger?.warn?.(`Clip judge: ${clip.id} failed: ${e.message}`);
        record({ kind: "clip_judge", clipId: clip.id, projectId: project.id, provider: "gemini", model: MODEL,
          path: "video", durationMs: Date.now() - t0, ok: false, error: String(e.message || e).slice(0, 500) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, clips.length) }, worker));
  return { judged, failed, costUsd };
}

module.exports = {
  judgeClips,
  judgeOne,
  parseJudgeResult,
  buildContextText,
  SYSTEM,
  MODEL,
  RUBRIC_VERSION,
};
