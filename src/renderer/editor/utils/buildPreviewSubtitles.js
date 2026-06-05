/**
 * Build preview-ready subtitle segments from raw clip data + template.
 *
 * Pure function — no React, no Zustand, no side effects.
 * Used by ProjectsView preview cards to render subtitles that match the editor.
 */

import { segmentWords } from "./segmentWords";

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

// ── Gather all words from clip subtitle data ──

export function gatherWords(clipSubtitles) {
  if (!clipSubtitles) return [];

  // Editor-saved format: flat array of segments with words[]
  if (Array.isArray(clipSubtitles)) {
    // Already segmented — return as-is (words are inside each segment)
    return null; // signal: use segments directly
  }

  // Pipeline format: { sub1: [...] } — paragraph-level with word timestamps
  const sub1 = clipSubtitles.sub1 || [];
  const allWords = [];
  for (const seg of sub1) {
    const words = seg.words || [];
    if (words.length > 0) {
      for (const w of words) {
        allWords.push({
          word: w.word || w.text || "",
          start: w.start ?? w.startSec ?? 0,
          end: w.end ?? w.endSec ?? 0,
        });
      }
    } else {
      // No word data — synthesize with even timing
      const textWords = (seg.text || "").trim().split(/\s+/).filter(Boolean);
      const segDur = (seg.end || 0) - (seg.start || 0);
      for (let i = 0; i < textWords.length; i++) {
        const frac0 = i / textWords.length;
        const frac1 = (i + 1) / textWords.length;
        allWords.push({
          word: textWords[i],
          start: (seg.start || 0) + frac0 * segDur,
          end: (seg.start || 0) + frac1 * segDur,
        });
      }
    }
  }
  return allWords;
}

// ── Main: build display-ready segments ──

/**
 * @param {Object|Array} clipSubtitles - clip.subtitles (pipeline or editor-saved format)
 * @param {Object} template - template object with subtitle/caption fields (or clip.subtitleStyle)
 * @param {number} clipStart - clip's source-absolute origin (clip.startTime). Editor-saved
 *   subtitles (`_format: "source-absolute"`) carry whole-recording times; the preview <video>
 *   reports clip-relative (0-based) time, so we subtract this origin to align the two domains.
 *   Pipeline (no _format) and legacy-array formats are already 0-based → no offset applied.
 * @returns {Array<{text: string, startSec: number, endSec: number, words: Array}>}
 */
export function buildPreviewSegments(clipSubtitles, template, clipStart = 0) {
  if (!clipSubtitles) return [];

  const tpl = template?.subtitle ? template.subtitle : template || {};
  const punctRm = tpl.punctuationRemove || {};

  // Source-absolute editor-saved data must be shifted to clip-relative to match
  // the preview's 0-based currentTime. Other formats are already clip-relative.
  const originOffset =
    !Array.isArray(clipSubtitles) && clipSubtitles._format === "source-absolute"
      ? clipStart || 0
      : 0;

  // Check if already editor-segmented
  const words = gatherWords(clipSubtitles);

  let segments;
  if (words === null) {
    // Editor-saved: already segmented array
    segments = clipSubtitles;
  } else if (words.length === 0) {
    return [];
  } else {
    // Pipeline: run through canonical segmentation
    const mode = tpl.segmentMode || "3word";
    segments = segmentWords(words, mode);
  }

  // Apply punctuation stripping to segment text and words, then shift to
  // clip-relative time (originOffset is 0 for already-relative formats).
  return segments.map((seg) => {
    const strippedWords = (seg.words || []).map((w) => ({
      ...w,
      word: stripPunct(w.word || w.text || "", punctRm),
      start: (w.start ?? w.startSec ?? 0) - originOffset,
      end: (w.end ?? w.endSec ?? 0) - originOffset,
    }));
    return {
      ...seg,
      text: strippedWords.map((w) => w.word).join(" "),
      words: strippedWords,
      startSec: (seg.startSec ?? seg.start ?? 0) - originOffset,
      endSec: (seg.endSec ?? seg.end ?? 0) - originOffset,
    };
  });
}

// ── Stale-transcription guard (mirrors useSubtitleStore.initSegments) ──
// A transcription made before a trim spans far longer than the current clip and
// no longer lines up. Editor skips it at >1.5× clip duration; the preview must too.
function isTranscriptionStale(segments, clipDuration) {
  if (!clipDuration || clipDuration <= 0) return false;
  const lastEnd = Math.max(0, ...segments.map((s) => s.end || 0));
  return lastEnd > clipDuration * 1.5;
}

// ── Resolve preview segments from a clip's full data, with the editor's fallback ──
//
// The editor derives subtitles from a priority chain (useSubtitleStore.initSegments):
// editor-saved sub1 → clip.transcription → pipeline sub1 → legacy array → project.transcription.
// The preview historically read ONLY sub1, so clips whose sub1 was empty showed nothing
// until a manual editor Save copied the derived segments into sub1 (#110/#111).
//
// This resolver gives the preview the same transcription fallback when sub1 is empty,
// so subtitles render automatically — no Save round-trip required.
//   - clip.transcription is clip-relative (0-based) → matches preview time, no offset.
//   - project.transcription is source-absolute → pass clipStart so the origin is subtracted.
//
// @param {Object} clip - the clip object (subtitles, transcription, startTime, duration)
// @param {Object} project - the parent project (project.transcription fallback)
// @param {Object} template - template/style with a .subtitle field
export function resolvePreviewSegments(clip, project, template) {
  if (!clip) return [];
  const clipStart = clip.startTime || 0;
  const subs = clip.subtitles;

  const hasSub1 = subs && !Array.isArray(subs) && Array.isArray(subs.sub1) && subs.sub1.length > 0;
  const hasLegacyArray = Array.isArray(subs) && subs.length > 0;
  if (hasSub1 || hasLegacyArray) {
    return buildPreviewSegments(subs, template, clipStart);
  }

  // sub1 empty → fall back to transcription, same as the editor.
  const clipTx = clip.transcription?.segments;
  if (clipTx && clipTx.length > 0 && !isTranscriptionStale(clipTx, clip.duration)) {
    // Clip-relative — no origin offset needed.
    return buildPreviewSegments({ sub1: clipTx }, template, 0);
  }

  const projTx = project?.transcription?.segments;
  if (projTx && projTx.length > 0) {
    // Source-absolute — subtract clip origin to reach clip-relative.
    return buildPreviewSegments({ sub1: projTx, _format: "source-absolute" }, template, clipStart);
  }

  return [];
}

