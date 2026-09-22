/**
 * #459: put freshly transcribed words into one stretch of the recording and
 * leave every other subtitle line exactly as it was.
 *
 * Everything is in SOURCE seconds, like editSegments. The lines the new words
 * touch are regrouped together with whatever they still hold outside the
 * range, so a line straddling the edge keeps its outside words and nothing
 * overlaps; lines the new words never touch are returned as the same objects.
 *
 * Line settings (switched off #296, own position #431) ride the words through
 * the regroup exactly as they do on a mode switch (`_line` + carryLineExtras).
 * Casing is text (#433): when the lines being replaced were ALL CAPS, the new
 * ones are cased the same way.
 *
 * CJS so jest can require it; the grouping function is passed in because
 * segmentWords is an ES module (the store hands in segmentWords in the
 * clip's current mode).
 */

const { lineExtras, carryLineExtras } = require("./resolveSubtitles");
const { capsSegment, isAllCaps } = require("./casing");

const tokens = (text) => String(text || "").split(/\s+/).filter(Boolean);
const mid = (w) => (w.start + w.end) / 2;
const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9']+/g, "");

// A line's words with the TEXT as the spelling — the same rule a mode switch
// uses (#89): text is ground truth, words[] is timing. When the two disagree
// the timing is spread evenly over the line.
function lineWords(line) {
  const toks = tokens(line.text);
  if (Array.isArray(line.words) && line.words.length === toks.length) {
    return line.words.map((w, i) => ({ ...w, word: toks[i] }));
  }
  const span = Math.max(0, (line.endSec || 0) - (line.startSec || 0));
  const per = toks.length ? span / toks.length : 0;
  return toks.map((t, i) => ({
    word: t,
    start: line.startSec + i * per,
    end: line.startSec + (i + 1) * per,
    probability: 1,
  }));
}

/**
 * @param {Array} lines - subtitle lines ({ startSec, endSec, text, words[] })
 * @param {{start:number, end:number}} range - the stretch that was re-transcribed
 * @param {Array} newWords - its words ({ word, start, end, probability }), source seconds
 * @param {(words:Array) => Array} group - words → lines ({ text, startSec, endSec, words, ... })
 * @returns {{ untouched: Array, rebuilt: Array, span: {start:number, end:number} }}
 *   untouched: the input lines left as they were; rebuilt: new lines without ids;
 *   span: the stretch whose lines were replaced.
 */
function replaceWordsInRange(lines, range, newWords, group) {
  const fresh = (newWords || []).filter((w) => w.end > w.start);
  const span = {
    start: Math.min(range.start, ...fresh.map((w) => w.start)),
    end: Math.max(range.end, ...fresh.map((w) => w.end)),
  };
  const touches = (l) => l.startSec < span.end && l.endSec > span.start;
  const untouched = (lines || []).filter((l) => !touches(l));
  const affected = (lines || []).filter(touches);

  // What the affected lines keep: their words centred outside the range.
  const kept = [];
  for (const line of affected) {
    const _line = lineExtras(line);
    for (const w of lineWords(line)) {
      const m = mid(w);
      if (m < range.start || m >= range.end) kept.push({ ...w, _line });
    }
  }

  // New words take the settings of the line they land in.
  const settingsAt = (t) => {
    const home = affected.find((l) => t >= l.startSec && t < l.endSec);
    return home ? lineExtras(home) : {};
  };
  const added = fresh.map((w) => ({ ...w, _line: settingsAt(mid(w)) }));

  // A boundary word both transcriptions heard: keep the new copy.
  const duplicate = (k) => added.some((a) => norm(a.word) === norm(k.word) && Math.abs(a.start - k.start) < 0.5);
  const stream = [...kept.filter((k) => !duplicate(k)), ...added].sort((a, b) => a.start - b.start);

  const withText = affected.filter((l) => tokens(l.text).length > 0);
  const casedFrom = withText.length > 0 ? withText : untouched.filter((l) => tokens(l.text).length > 0);
  const caps = casedFrom.length > 0 && casedFrom.every((l) => isAllCaps(l.text));

  const rebuilt = (stream.length ? group(stream) : []).map((seg) => {
    const line = {
      ...seg,
      words: seg.words.map(({ _line, ...w }) => w),
      ...carryLineExtras(seg.words),
    };
    return caps ? capsSegment(line, true) : line;
  });

  return { untouched, rebuilt, span };
}

/**
 * The source stretches behind a set of sections, merged: footage used twice
 * (#351) or two sections cut from one piece become one stretch, transcribed once.
 */
function mergeSourceRanges(sections) {
  const sorted = (sections || [])
    .map((s) => ({ start: s.sourceStart, end: s.sourceEnd }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end + 0.05) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

module.exports = { replaceWordsInRange, mergeSourceRanges };
