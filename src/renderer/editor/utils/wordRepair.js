/**
 * Word-level repair helpers shared by the subtitle resolver.
 *
 * Extracted verbatim from useSubtitleStore.initSegments (#110) so the editor and the
 * Projects preview run the exact same word repair. Pure functions — no React, no Zustand.
 */

// ── Merge whisper subword tokens into real words using segment text as ground truth ──
// Whisper/whisperx tokenizes at subword level: "raiders" → ["ra","iders"],
// "Bioscanner" → ["bios","c","anner"], "Reagents" → ["reag","ents"]
// We use the segment's .text field (which has correct words) to guide merging.
function mergeWordTokens(words, segmentText) {
  if (!words || words.length === 0) return words;
  if (!segmentText) return words;

  // Get the real words from the segment text
  const realWords = segmentText.trim().split(/\s+/).filter(Boolean);
  if (realWords.length === 0) return words;

  const merged = [];
  let tokenIdx = 0;

  for (const realWord of realWords) {
    if (tokenIdx >= words.length) break;

    // Start building the merged word from current token
    const mergedWord = { ...words[tokenIdx] };
    let built = words[tokenIdx].word.trim();
    tokenIdx++;

    // Keep consuming tokens until we've built the full real word
    // Compare case-insensitively and strip punctuation for matching
    const realClean = realWord.replace(/[.,!?;:'"]/g, "").toLowerCase();
    let builtClean = built.replace(/[.,!?;:'"]/g, "").toLowerCase();
    let safety = 0;

    while (builtClean !== realClean && tokenIdx < words.length && safety < 10) {
      const nextToken = words[tokenIdx];
      built += nextToken.word.trim();
      builtClean = built.replace(/[.,!?;:'"]/g, "").toLowerCase();
      mergedWord.end = nextToken.end;
      tokenIdx++;
      safety++;
    }

    // Use the real word text (preserves original casing/punctuation)
    mergedWord.word = realWord;
    merged.push(mergedWord);
  }

  // If there are leftover tokens not matched to any real word, append them
  // (shouldn't happen with correct data, but don't lose anything)
  while (tokenIdx < words.length) {
    merged.push({ ...words[tokenIdx] });
    tokenIdx++;
  }

  return merged;
}

// ── Validate and clamp word timestamps to segment boundaries ──
// Per-clip transcription (WhisperX on short clip audio) produces accurate word
// timestamps. This function just ensures they stay within segment bounds.
function validateWords(words, segStart, segEnd) {
  if (!words || words.length === 0) return words;
  return words.map(w => ({
    ...w,
    start: Math.max(segStart, Math.min(segEnd, w.start)),
    end: Math.max(segStart, Math.min(segEnd, w.end)),
  }));
}

// CJS exports — required by the main-process render path (render.js, #8) AND
// imported as named ESM bindings by renderer code (Vite handles CJS interop,
// same pattern as subtitleStyleEngine.js / findActiveWord.js).
module.exports = { mergeWordTokens, validateWords };
