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
 * @returns {Array<{text: string, startSec: number, endSec: number, words: Array}>}
 */
export function buildPreviewSegments(clipSubtitles, template) {
  if (!clipSubtitles) return [];

  const tpl = template?.subtitle ? template.subtitle : template || {};
  const punctRm = tpl.punctuationRemove || {};

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

  // Apply punctuation stripping to segment text and words
  return segments.map((seg) => {
    const strippedWords = (seg.words || []).map((w) => ({
      ...w,
      word: stripPunct(w.word || w.text || "", punctRm),
      start: w.start ?? w.startSec ?? 0,
      end: w.end ?? w.endSec ?? 0,
    }));
    return {
      ...seg,
      text: strippedWords.map((w) => w.word).join(" "),
      words: strippedWords,
      startSec: seg.startSec ?? seg.start ?? 0,
      endSec: seg.endSec ?? seg.end ?? 0,
    };
  });
}

