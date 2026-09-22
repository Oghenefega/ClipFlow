/**
 * #459: re-transcribe a stretch of the recording instead of the whole clip.
 *
 * Pure helpers behind the retranscribe:ranges handler (main.js), kept apart so
 * the word selection and the silence guard can be tested without Python.
 */

const { resolveClipSubtitles } = require("../renderer/editor/utils/resolveSubtitles");

// Audio on each side of the range goes to the transcriber too, so a word the
// range edge cuts through is still heard whole. Only words that reach into
// the range are handed back.
const RANGE_PAD_SEC = 1;

/**
 * The stretch of the recording to extract for a range: the range plus the pad,
 * kept inside the recording.
 */
function paddedWindow(start, end, sourceDuration) {
  const extractStart = Math.max(0, start - RANGE_PAD_SEC);
  const limit = sourceDuration > 0 ? sourceDuration : Infinity;
  const extractEnd = Math.min(limit, end + RANGE_PAD_SEC);
  return { extractStart, extractEnd };
}

/**
 * The words the engine heard in [start, end], in source seconds.
 *
 * `transcription` is what came back for audio extracted from `extractStart`
 * (0-based, like a clip's own transcription), so it goes through the same
 * cleanup a freshly re-transcribed clip gets when the editor opens it —
 * resolveClipSubtitles: token merge, duplicate removal, timestamp repair,
 * casing. A word counts when any part of it falls inside the range; the
 * editor drops the old copy of a boundary word it already had.
 */
function wordsForRange(transcription, extractStart, extractEnd, start, end) {
  const { segments } = resolveClipSubtitles(
    { transcription, startTime: extractStart, endTime: extractEnd, duration: extractEnd - extractStart },
    null
  );
  const words = [];
  for (const seg of segments) {
    for (const w of seg.words || []) {
      if (w.start < end && w.end > start) words.push(w);
    }
  }
  return words.sort((a, b) => a.start - b.start);
}

// Whisper fills pure silence with these instead of returning nothing
// (memory: whisper hallucinates on silence).
const SILENCE_WORDS = new Set(["you", "thank", "thanks", "for", "watching", "bye"]);

/**
 * True when a range came back with no speech: nothing at all, or only a few
 * of Whisper's silence words ("you", "Thank you.", "Thanks for watching!").
 * The editor then leaves that stretch alone instead of writing "you" over it.
 */
function isSilenceResult(words) {
  if (!Array.isArray(words) || words.length === 0) return true;
  if (words.length > 4) return false;
  return words.every((w) => SILENCE_WORDS.has(String(w.word || "").toLowerCase().replace(/[^a-z]/g, "")));
}

module.exports = { RANGE_PAD_SEC, paddedWindow, wordsForRange, isSilenceResult };
