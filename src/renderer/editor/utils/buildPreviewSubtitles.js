/**
 * Build preview-ready subtitle segments from raw clip data + template.
 *
 * Pure function — no React, no Zustand, no side effects.
 * Used by ProjectsView preview cards to render subtitles that match the editor.
 *
 * #110: source selection, extras, cleanup and word repair now live in the shared
 * resolveClipSubtitles core (same code the editor's initSegments runs), so the preview
 * and the editor can't diverge. This file only owns the preview's DISPLAY edge:
 * chunking + clip-relative shift + punctuation stripping.
 */

import { segmentWords } from "./segmentWords";
import { resolveClipSubtitles } from "./resolveSubtitles";

// ── Strip punctuation per template config ──

export function stripPunct(word, punctuationRemove) {
  if (!word) return word;
  const rm = punctuationRemove || {};
  const hasAny = Object.values(rm).some(Boolean);
  if (!hasAny) return word;
  let result = word;
  if (rm.ellipsis) result = result.replace(/\.\.\./g, "");
  if (rm.period) result = result.replace(/\./g, "");
  if (rm.comma) result = result.replace(/,/g, "");
  if (rm.question) result = result.replace(/\?/g, "");
  if (rm.exclamation) result = result.replace(/!/g, "");
  if (rm.semicolon) result = result.replace(/;/g, "");
  if (rm.colon) result = result.replace(/:/g, "");
  return result;
}

// ── Flatten resolved (source-absolute) segments into a word list for re-chunking ──
// Mirrors the editor's setSegmentMode: use a segment's words when present, otherwise
// synthesize evenly-timed words from its text. Without this, a pipeline segment that
// carries text but no words[] would contribute nothing to segmentWords and vanish from
// the preview — a divergence from the editor, which synthesizes the same fallback.
function flattenWordsForChunk(segments) {
  const words = [];
  for (const seg of segments) {
    if (seg.words && seg.words.length > 0) {
      for (const w of seg.words) words.push(w);
    } else {
      const textWords = (seg.text || "").split(/\s+/).filter(Boolean);
      if (textWords.length === 0) continue;
      const dur = (seg.end || 0) - (seg.start || 0);
      const perWord = dur / textWords.length;
      for (let i = 0; i < textWords.length; i++) {
        words.push({
          word: textWords[i],
          start: (seg.start || 0) + i * perWord,
          end: (seg.start || 0) + (i + 1) * perWord,
          probability: 1,
        });
      }
    }
  }
  return words;
}

// ── Resolve preview segments from a clip's full data, via the shared resolver ──
//
// The editor and the preview now share resolveClipSubtitles for source selection +
// cleanup + word repair (#110). The core returns SOURCE-ABSOLUTE segments plus an
// `isPreChunked` flag (true for editor-saved clips, where the user's manual chunking
// IS the final grouping). The preview then:
//   1. Chunks for display — honor pre-chunked boundaries as-is; otherwise re-chunk
//      through the canonical segmentWords (same util the editor's setSegmentMode uses).
//   2. Shifts SOURCE-ABSOLUTE → clip-relative by subtracting the clip origin, because
//      the preview <video> reports clip-relative (0-based) time.
//   3. Strips punctuation per the template.
//
// Extras (source-wide project.transcription for clip *extends*) are editor-only, so the
// preview passes includeExtras:false — it shows the saved clip range, never extends.
//
// @param {Object} clip - the clip object (subtitles, transcription, startTime, duration)
// @param {Object} project - the parent project (project.transcription fallback)
// @param {Object} template - template/style with a .subtitle field
export function resolvePreviewSegments(clip, project, template) {
  if (!clip) return [];

  const tpl = template?.subtitle ? template.subtitle : template || {};
  const punctRm = tpl.punctuationRemove || {};
  const mode = tpl.segmentMode || "3word";
  const clipStart = clip.startTime || 0;

  const { segments, isPreChunked, source } = resolveClipSubtitles(clip, project, {
    includeExtras: false,
  });
  if (source === null || segments.length === 0) return [];

  // Chunk for display. Editor-saved clips carry the user's manual chunking (one core
  // segment = one display line) → honor as-is. Everything else re-chunks through the
  // canonical segmentWords on the repaired, source-absolute words.
  const displaySegs = isPreChunked
    ? segments
    : segmentWords(flattenWordsForChunk(segments), mode);

  // Shift to clip-relative (subtract the clip origin) at the very edge, then strip
  // punctuation per template. Both pre-chunked and re-chunked segments are source-absolute.
  return displaySegs.map((seg) => {
    const strippedWords = (seg.words || []).map((w) => ({
      ...w,
      word: stripPunct(w.word || w.text || "", punctRm),
      start: (w.start ?? w.startSec ?? 0) - clipStart,
      end: (w.end ?? w.endSec ?? 0) - clipStart,
    }));
    return {
      ...seg,
      // Preserve original text for a word-less segment instead of clobbering it to ""
      // (an empty text makes SubtitleOverlay render nothing).
      text: strippedWords.length > 0 ? strippedWords.map((w) => w.word).join(" ") : (seg.text || ""),
      words: strippedWords,
      startSec: (seg.startSec ?? seg.start ?? 0) - clipStart,
      endSec: (seg.endSec ?? seg.end ?? 0) - clipStart,
    };
  });
}
