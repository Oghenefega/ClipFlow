/**
 * Subtitle Segmentation — Pure Function
 *
 * Canonical implementation per subtitle-segmentation-spec v1.2.
 * Input: word[] with timestamps → Output: segment[]
 *
 * No Zustand, no React, no side effects.
 */

// ── Constants (from spec v1.2) ──
const MAX_WORDS = 3;
const MAX_CHARS = 20;
const PAUSE_SPLIT_THRESHOLD = 0.7;   // seconds — hard wall
const FORWARD_LOOK_GAP = 0.5;        // seconds — within partitions only
const SILENCE_GAP_THRESHOLD = 0.15;  // seconds — close tiny gaps
const MIN_DISPLAY_DURATION = 0.3;    // seconds — auto-generated floor
const LINGER_DURATION = 0.4;         // seconds — extend into empty space after last word

// Filler words (exact match only, per spec)
const FILLERS = new Set(["um", "uh", "ah"]);

// Words that connect forward — should never end a segment (they start the next one)
const FORWARD_CONNECTORS = new Set([
  "i", "to", "a", "an", "the", "in", "on", "at", "for", "of",
  "with", "from", "by", "and", "but", "or", "so", "if", "as",
]);

// Common phrases that should never be split across segments (2-word atomic units)
const ATOMIC_PHRASES = new Set([
  "as always", "of course", "by the way", "at least", "right now",
  "let's go", "you know", "I mean", "in fact", "so far",
  "at all", "no way", "oh my", "come on", "for real",
  "hold on", "watch this", "trust me", "believe me", "check this",
]);

// ── Helpers ──

/** Does this word text end a sentence? (.!? optionally followed by closing quote) */
function isSentenceEnder(wordText) {
  if (!wordText) return false;
  const w = wordText.trim();
  return /[.!?]$/.test(w) || /[.!?]['""\u2019]$/.test(w);
}

/** Normalize word for comparison (lowercase, strip trailing punctuation) */
function norm(w) {
  return (w.word || "").toLowerCase().replace(/[.,!?;:'"]+$/, "");
}

/** Is this word a filler? (exact match on normalized form) */
function isFiller(w) {
  return FILLERS.has(norm(w));
}

// ── Phase 0: Input validation ──

function validateAndCleanInput(words) {
  if (!words || !Array.isArray(words) || words.length === 0) return [];

  // Filter out words with missing required fields
  const valid = words.filter(
    (w) => w && w.word != null && w.word !== "" && w.start != null && w.end != null
  );

  // Fix swapped timestamps
  for (const w of valid) {
    if (w.start > w.end) {
      const tmp = w.start;
      w.start = w.end;
      w.end = tmp;
    }
  }

  // Ensure monotonic order
  valid.sort((a, b) => a.start - b.start);

  return valid;
}

// ── Phase 1: Hard wall pre-partitioning ──

/**
 * Partition words into groups separated by hard walls.
 * Hard walls:
 *   1. Sentence enders (.!?) — the word with the ender is the LAST word in its partition
 *   2. Time gaps >= PAUSE_SPLIT_THRESHOLD between consecutive words
 */
function partitionByHardWalls(words) {
  if (words.length === 0) return [];

  const partitions = [];
  let current = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const w = words[i];
    const gap = w.start - prev.end;

    // Wall 1: Previous word ended a sentence
    const prevEndedSentence = isSentenceEnder(prev.word);

    // Wall 2: Time gap >= threshold
    const gapWall = gap >= PAUSE_SPLIT_THRESHOLD;

    if (prevEndedSentence || gapWall) {
      partitions.push(current);
      current = [w];
    } else {
      current.push(w);
    }
  }

  if (current.length > 0) {
    partitions.push(current);
  }

  return partitions;
}

// ── Phase 2: Chunking within partitions (3-word mode) ──

/**
 * Chunk a single partition of words into segments.
 * Rules (priority order per spec):
 *   1. Repeated phrase detection (pre-scan)
 *   2. Filler word isolation (um, uh, ah)
 *   3. Forward look (0.5s gap after word)
 *   4. Max 3 words
 *   5. Character limit (20 chars, front-heavy split)
 */
function chunkPartition(words, knownPhrases) {
  if (words.length === 0) return [];

  const segments = [];

  // Helper: create a segment from a chunk of words
  const pushSeg = (chunk) => {
    if (chunk.length === 0) return;
    segments.push({
      text: chunk.map((cw) => cw.word).join(" "),
      startSec: chunk[0].start,
      endSec: chunk[chunk.length - 1].end,
      words: [...chunk],
      track: chunk[0].track || "s1",
    });
  };

  // Helper: flush chunk with character limit enforcement (Rule 5)
  const flushChunk = (chunk) => {
    if (chunk.length === 0) return;
    const text = chunk.map((cw) => cw.word).join(" ");

    if (text.length > MAX_CHARS) {
      if (chunk.length === 3) {
        // Try 2+1 first
        const first2 = chunk.slice(0, 2).map((cw) => cw.word).join(" ");
        if (first2.length > MAX_CHARS) {
          // Cascade: 1+1+1
          pushSeg([chunk[0]]);
          pushSeg([chunk[1]]);
          pushSeg([chunk[2]]);
        } else {
          pushSeg(chunk.slice(0, 2));
          pushSeg(chunk.slice(2));
        }
      } else if (chunk.length === 2) {
        // 1+1
        pushSeg([chunk[0]]);
        pushSeg([chunk[1]]);
      } else {
        // Single word over limit — keep as-is (let renderer handle)
        pushSeg(chunk);
      }
    } else {
      pushSeg(chunk);
    }
  };

  // Wrap flushChunk to also record known phrases for recall
  const flushAndTrack = (c) => {
    if (c.length === 0) return;
    flushChunk(c);
    if (c.length >= 2 && c.length <= 3) {
      knownPhrases.add(c.map((cw) => norm(cw)).join(" "));
    }
  };

  // ── Rule 1: Pre-scan for adjacent repeated phrases ──
  const phraseAt = new Array(words.length).fill(0);

  // Check 2-3 word repeated phrases first (longer phrases take priority)
  for (let phraseLen = 3; phraseLen >= 2; phraseLen--) {
    for (let i = 0; i <= words.length - phraseLen * 2; i++) {
      // Skip if any word in this range is already claimed
      let claimed = false;
      for (let j = i; j < i + phraseLen; j++) {
        if (phraseAt[j] > 0) { claimed = true; break; }
      }
      if (claimed) continue;

      // Skip 2-word phrases where both words are the same (e.g., "no no") —
      // these should be handled as single-word repeats, not 2-word phrases
      if (phraseLen === 2 && norm(words[i]) === norm(words[i + 1])) continue;

      // Check if phrase at [i, i+phraseLen) matches [i+phraseLen, i+2*phraseLen)
      let match = true;
      for (let j = 0; j < phraseLen; j++) {
        if (norm(words[i + j]) !== norm(words[i + phraseLen + j])) {
          match = false;
          break;
        }
      }
      if (!match) continue;

      // Found adjacent repeat — clear any single-word marks and set multi-word marks
      for (let j = i; j < i + phraseLen; j++) phraseAt[j] = phraseLen;
      let next = i + phraseLen;
      while (next + phraseLen <= words.length) {
        let conflict = false;
        for (let j = next; j < next + phraseLen; j++) {
          if (phraseAt[j] > 1) { conflict = true; break; }
        }
        if (conflict) break;

        let stillMatch = true;
        for (let j = 0; j < phraseLen; j++) {
          if (norm(words[next + j]) !== norm(words[i + j])) {
            stillMatch = false;
            break;
          }
        }
        if (!stillMatch) break;

        for (let j = next; j < next + phraseLen; j++) phraseAt[j] = phraseLen;
        next += phraseLen;
      }
    }
  }

  // Detect single-word repeats (adjacent identical words) — after multi-word to avoid conflicts
  for (let i = 0; i < words.length - 1; i++) {
    if (phraseAt[i] > 0) continue;
    if (norm(words[i]) === norm(words[i + 1])) {
      phraseAt[i] = 1;
      let j = i + 1;
      while (j < words.length && phraseAt[j] === 0 && norm(words[j]) === norm(words[i])) {
        phraseAt[j] = 1;
        j++;
      }
    }
  }

  // ── Main chunking loop ──
  let chunk = [];

  for (let i = 0; i < words.length; i++) {
    // Rule 1: Pre-scanned phrase — flush current chunk, collect phrase, flush it
    if (phraseAt[i] > 0) {
      if (chunk.length > 0) {
        flushAndTrack(chunk);
        chunk = [];
      }
      const pLen = phraseAt[i];
      const phraseChunk = [];
      for (let j = 0; j < pLen && i + j < words.length; j++) {
        phraseChunk.push(words[i + j]);
      }
      flushAndTrack(phraseChunk);
      i += pLen - 1; // -1 because loop will i++
      continue;
    }

    const w = words[i];
    const prevWord = chunk.length > 0 ? chunk[chunk.length - 1] : null;
    const nextWord = i + 1 < words.length ? words[i + 1] : null;
    const gapAfter = nextWord ? nextWord.start - w.end : 0;

    // --- Pre-flush checks (flush BEFORE adding this word) ---

    // Rule 1b: Known phrase recall — upcoming words match a previously-flushed phrase
    if (chunk.length > 0) {
      for (let pLen = 3; pLen >= 2; pLen--) {
        if (i + pLen > words.length) continue;
        const upcoming = [];
        for (let j = 0; j < pLen; j++) upcoming.push(norm(words[i + j]));
        if (knownPhrases.has(upcoming.join(" "))) {
          flushAndTrack(chunk);
          chunk = [];
          break;
        }
      }
    }

    // Rule 1c: Known phrase protection — current chunk IS a known phrase, don't extend
    if (chunk.length >= 2) {
      const chunkPhrase = chunk.map((cw) => norm(cw)).join(" ");
      if (knownPhrases.has(chunkPhrase)) {
        flushAndTrack(chunk);
        chunk = [];
      }
    }

    // Rule 2: Filler word isolation — flush current chunk, this word stands alone
    if (isFiller(w)) {
      if (chunk.length > 0) {
        flushAndTrack(chunk);
        chunk = [];
      }
      flushAndTrack([w]);
      continue;
    }

    // Rule 8: Atomic phrase protection — if this word + next word form a common
    // phrase (e.g., "as always"), and adding this word would fill the chunk to max
    // (pushing the next word to a new segment), flush BEFORE adding so the phrase
    // stays together in the next segment.
    if (nextWord && chunk.length >= MAX_WORDS - 1) {
      const pair = norm(w) + " " + norm(nextWord);
      if (ATOMIC_PHRASES.has(pair)) {
        flushAndTrack(chunk);
        chunk = [];
      }
    }

    // Rule 4: Chunk already full (check before adding)
    if (chunk.length >= MAX_WORDS) {
      flushAndTrack(chunk);
      chunk = [];
    }

    // Rule 6: Never end a segment on forward-connecting words — they start or
    // continue a phrase and look wrong dangling at the end of a subtitle.
    // "I" (pronoun), prepositions (to, in, on, at, for, of, with, from, by),
    // articles (a, an, the), conjunctions (and, but, or, so, if, as).
    // Flush the chunk BEFORE this word so it starts the next segment.
    // Don't flush if the chunk is empty or has only 1 word (let the word join naturally).
    // Don't flush if this is the LAST word in the partition — better to keep "to"
    // with the preceding words than leave it dangling alone (e.g. "I'm going to" before a long pause).
    const isLastInPartition = i === words.length - 1;
    if (chunk.length >= 2 && FORWARD_CONNECTORS.has(norm(w)) && !isLastInPartition) {
      flushAndTrack(chunk);
      chunk = [];
    }

    chunk.push(w);

    // Rule 7: Comma flush — a word ending with comma/semicolon is a natural
    // phrase-ender. Flush so the comma is the LAST word in the segment,
    // never the first word of the next one.
    if (/[,;]$/.test((w.word || "").trim())) {
      flushAndTrack(chunk);
      chunk = [];
      continue;
    }

    // Rule 3: Forward look — after adding this word, if there's a medium gap
    // (>= 0.5s) before the NEXT word, this word is the natural end of the
    // current phrase. Flush now so the next word starts a new group.
    if (chunk.length >= 2 && gapAfter >= FORWARD_LOOK_GAP) {
      flushAndTrack(chunk);
      chunk = [];
      continue; // word already added and flushed
    }
  }

  // Flush remaining words
  if (chunk.length > 0) {
    flushAndTrack(chunk);
  }

  return segments;
}

// ── Phase 3: Timing adjustments ──

function applyTimingRules(segments) {
  if (segments.length === 0) return segments;

  // Gap closing: extend earlier segment forward for tiny gaps (< SILENCE_GAP_THRESHOLD)
  for (let i = 0; i < segments.length - 1; i++) {
    const gap = segments[i + 1].startSec - segments[i].endSec;
    if (gap > 0 && gap < SILENCE_GAP_THRESHOLD) {
      segments[i].endSec = segments[i + 1].startSec;
    }
  }

  // Min duration floor: extend segments shorter than MIN_DISPLAY_DURATION
  for (let i = 0; i < segments.length; i++) {
    const dur = segments[i].endSec - segments[i].startSec;
    if (dur < MIN_DISPLAY_DURATION) {
      // Try extending end forward (up to start of next segment)
      const maxEnd = i + 1 < segments.length ? segments[i + 1].startSec : Infinity;
      const needed = MIN_DISPLAY_DURATION - dur;
      const canExtendForward = maxEnd - segments[i].endSec;

      if (canExtendForward >= needed) {
        segments[i].endSec += needed;
      } else {
        // Extend as much as possible forward
        segments[i].endSec += Math.min(needed, Math.max(0, canExtendForward));
        // Try extending start backward (down to end of previous segment)
        const remaining = MIN_DISPLAY_DURATION - (segments[i].endSec - segments[i].startSec);
        if (remaining > 0 && i > 0) {
          const minStart = segments[i - 1].endSec;
          const canExtendBack = segments[i].startSec - minStart;
          segments[i].startSec -= Math.min(remaining, Math.max(0, canExtendBack));
        }
        // If still under 0.3s after both directions — keep as-is (extremely fast speech)
      }
    }
  }

  // Linger: extend each segment's end into empty space so subtitles don't vanish
  // immediately after the last word. Never overlap the next segment.
  for (let i = 0; i < segments.length; i++) {
    const desiredEnd = segments[i].endSec + LINGER_DURATION;
    const maxEnd = i + 1 < segments.length ? segments[i + 1].startSec : desiredEnd;
    segments[i].endSec = Math.min(desiredEnd, maxEnd);
  }

  return segments;
}

// ── Main entry point ──

/**
 * Segment words into subtitle segments.
 *
 * @param {Array<{word: string, start: number, end: number, probability?: number, track?: string}>} words
 * @param {"1word"|"3word"} mode
 * @returns {Array<{text: string, startSec: number, endSec: number, words: Array, track: string, conf: string, warning: string|null}>}
 */
export function segmentWords(words, mode = "3word") {
  const cleaned = validateAndCleanInput(words);
  if (cleaned.length === 0) return [];

  let rawSegs;

  if (mode === "1word") {
    // 1-word mode: one word per segment, no grouping logic
    rawSegs = cleaned.map((w) => ({
      text: w.word,
      startSec: w.start,
      endSec: w.end,
      words: [w],
      track: w.track || "s1",
    }));
  } else {
    // 3-word mode: hard wall pre-partitioning + smart chunking
    const partitions = partitionByHardWalls(cleaned);
    const knownPhrases = new Set(); // shared across partitions for phrase recall
    rawSegs = [];

    for (const partition of partitions) {
      const chunks = chunkPartition(partition, knownPhrases);
      rawSegs.push(...chunks);
    }
  }

  // Add standard fields
  const segments = rawSegs.map((seg, i) => ({
    ...seg,
    conf: "high",
    warning: (seg.endSec - seg.startSec) > 10 ? "Long segment — consider splitting" : null,
  }));

  // Apply timing rules (gap closing, min duration)
  applyTimingRules(segments);

  return segments;
}

// Export constants for testing
export {
  MAX_WORDS,
  MAX_CHARS,
  PAUSE_SPLIT_THRESHOLD,
  FORWARD_LOOK_GAP,
  SILENCE_GAP_THRESHOLD,
  MIN_DISPLAY_DURATION,
  LINGER_DURATION,
};
