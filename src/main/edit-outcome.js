/**
 * #479: the finished clip compared with the AI's draft. Pure, so it is tested
 * without a database or a publish.
 *
 * The draft is still on the clip after editing, so nothing extra is stored at
 * detection time:
 *   clip.startTime / endTime   the AI's window (after the 7 s minimum)
 *   subtitles                  what the editor first showed: the shared resolver
 *                              run as if nothing had been saved (clip.transcription,
 *                              which the editor never writes, plus the same
 *                              cleanup), so an untouched clip compares equal
 *   project / clip reframe     a clip with no layout of its own inherits the default
 *
 * Subtitle words are compared only inside the AI window AND the kept sections:
 * trimming footage or extending past the window is counted by the boundary
 * fields, not as subtitle fixes.
 */

const { resolveClipSubtitles } = require("../renderer/editor/utils/resolveSubtitles");

const UNTOUCHED_SLACK_S = 0.5;

const normWord = (w) => String(w || "").toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

/** Token edit distance (insert / delete / substitute = 1). */
function wordDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function keptSections(clip) {
  const segs = Array.isArray(clip.nleSegments) ? clip.nleSegments : [];
  const valid = segs.filter((s) => Number.isFinite(s?.sourceStart) && Number.isFinite(s?.sourceEnd) && s.sourceEnd > s.sourceStart);
  if (valid.length > 0) return valid;
  return [{ sourceStart: clip.startTime, sourceEnd: clip.endTime }];
}

/** Words the AI wrote and words that shipped, both as normalized tokens in source order. */
function subtitleWords(clip, project, inScope) {
  const draft = resolveClipSubtitles({ ...clip, subtitles: undefined }, project);
  if (!draft.source) return null;
  const ai = draft.segments.flatMap((sg) => sg.words || [])
    .map((w) => ({ t: (w.start + w.end) / 2, w: normWord(w.word) }))
    .filter((x) => x.w && inScope(x.t));

  // A clip never opened in the editor still carries the sliced pipeline
  // subtitles (no _format): nothing was typed, so the words are the AI's.
  const sub = clip.subtitles;
  if (sub?._format !== "source-absolute" || !Array.isArray(sub.sub1)) return { ai, shipped: ai };
  const shipped = sub.sub1
    .filter((s) => s && s.enabled !== false)
    .flatMap((s) => (Array.isArray(s.words) && s.words.length > 0
      ? s.words.map((w) => ({ t: (w.start + w.end) / 2, w: normWord(w.word) }))
      : String(s.text || "").split(/\s+/).map((w) => ({ t: (s.startSec + s.endSec) / 2, w: normWord(w) }))))
    .filter((x) => x.w && inScope(x.t))
    .sort((a, b) => a.t - b.t);
  return { ai, shipped };
}

function sumSessions(sessions) {
  const edits = {};
  let activeMs = 0;
  let editsTotal = 0;
  for (const s of sessions || []) {
    activeMs += s.activeMs || 0;
    editsTotal += s.editsTotal || 0;
    for (const [k, v] of Object.entries(s.edits || {})) edits[k] = (edits[k] || 0) + (v || 0);
  }
  return { sessions: (sessions || []).length, activeMs, editsTotal, edits };
}

/**
 * @param {object} clip       the clip as saved at publish time
 * @param {Array}  sessions   its edit_sessions rows, as { activeMs, editsTotal, edits }
 * @param {object} [project]  its project (the resolver's fallback transcription)
 */
function computeEditOutcome(clip, sessions, project) {
  const aiStart = clip?.startTime;
  const aiEnd = clip?.endTime;
  if (!Number.isFinite(aiStart) || !Number.isFinite(aiEnd) || aiEnd <= aiStart) return null;
  const kept = keptSections(clip);
  const keptStart = Math.min(...kept.map((s) => s.sourceStart));
  const keptEnd = Math.max(...kept.map((s) => s.sourceEnd));
  const inScope = (t) => t >= aiStart && t <= aiEnd && kept.some((s) => t >= s.sourceStart && t <= s.sourceEnd);

  const words = subtitleWords(clip, project, inScope);
  const wordsChanged = words ? wordDistance(words.ai.map((x) => x.w), words.shipped.map((x) => x.w)) : null;

  const layoutChanged = clip.reframe !== undefined || kept.some((s) => s.reframe !== undefined);
  const mix = clip.audioMix && typeof clip.audioMix === "object" ? clip.audioMix : null;
  const levelsChanged = clip.sourceAudioMuted === true || (mix ? Object.values(mix).some((db) => Number(db) !== 0) : false);
  const sounds = Array.isArray(clip.sfx) ? clip.sfx.length : 0;
  const overlays = Array.isArray(clip.media) ? clip.media.length : 0;
  const startMoved = keptStart - aiStart;
  const endMoved = keptEnd - aiEnd;
  const totals = sumSessions(sessions);

  const untouched = totals.editsTotal === 0
    && kept.length === 1
    && Math.abs(startMoved) < UNTOUCHED_SLACK_S
    && Math.abs(endMoved) < UNTOUCHED_SLACK_S
    && !wordsChanged
    && !layoutChanged && !levelsChanged
    && sounds === 0 && overlays === 0;

  const round = (n) => Math.round(n * 100) / 100;
  return {
    aiSeconds: round(aiEnd - aiStart),
    keptSeconds: round(kept.reduce((a, s) => a + (s.sourceEnd - s.sourceStart), 0)),
    startMovedS: round(startMoved),
    endMovedS: round(endMoved),
    sections: kept.length,
    subtitleWordsAi: words ? words.ai.length : null,
    subtitleWordsChanged: wordsChanged,
    layoutChanged,
    sounds,
    overlays,
    levelsChanged,
    ...totals,
    untouched,
  };
}

module.exports = { computeEditOutcome, wordDistance, normWord };
