/**
 * Highlight detection engine for ClipFlow.
 *
 * Scoring weights:
 *   Audio energy:     40%  (loud moments = exciting moments)
 *   Transcript feel:  30%  (exclamations, reactions, hype words)
 *   Game keywords:    20%  (game-specific trigger words)
 *   Pacing:           10%  (rapid speech = high energy)
 *
 * Output: ~30 highlight segments per 30-min recording, each 25-60 seconds.
 */

// ============ WORD BANKS ============

const HYPE_WORDS = [
  "oh my god", "omg", "holy", "insane", "crazy", "no way", "what the",
  "let's go", "lets go", "let's gooo", "clutch", "dude", "bro",
  "are you kidding", "actually", "literally", "bruh", "wait what",
  "how did", "did you see", "that was", "yooo", "lmao", "lol",
  "killed", "destroyed", "eliminated", "headshot", "snipe", "one tap",
  "ace", "triple", "quad", "penta", "team wipe", "collateral",
  "gg", "ez", "clapped", "cracked", "beamed", "lazer",
  "oh no", "rip", "dead", "i'm dead", "i died", "trash",
  "toxic", "rage", "ragequit", "tilted",
  "win", "won", "victory", "champion", "first place",
  "nice", "sick", "clean", "smooth", "crispy", "nutty",
  "scared", "jump scare", "horror", "terrifying",
  "funny", "hilarious", "comedy", "joke",
];

const REACTION_PATTERNS = [
  /!{2,}/,         // multiple exclamation marks
  /\?{2,}/,        // multiple question marks
  /[A-Z]{3,}/,     // ALL CAPS words
  /ha(ha)+/i,      // laughter
  /no+o+o+/i,      // extended "nooo"
  /ye+s+/i,        // extended "yesss"
  /go+o+o+/i,      // extended "gooo"
  /wo+w+/i,        // extended "wow"
];

// ============ SCORING FUNCTIONS ============

/**
 * Score a segment based on audio energy (loudness).
 * Normalizes RMS dB values to 0-100 scale.
 * @param {number} rmsDb - RMS level in dB (typically -60 to 0)
 * @param {number} meanDb - Mean RMS across the whole file
 * @returns {number} 0-100 score
 */
function scoreAudioEnergy(rmsDb, meanDb) {
  if (rmsDb === undefined || rmsDb === null) return 50; // neutral if no data

  // How much louder than average (positive = louder)
  const delta = rmsDb - meanDb;

  // Map: -10dB below mean → 0, at mean → 40, +10dB above → 100
  const score = Math.max(0, Math.min(100, 40 + (delta * 6)));
  return Math.round(score);
}

/**
 * Score transcript text for excitement/reaction level.
 * Combines hype words, reaction patterns, and punctuation analysis.
 * @param {string} text - Transcript segment text
 * @param {string[]} [gameKeywords] - Extra game-specific keywords
 * @returns {{ transcriptScore: number, keywordScore: number, reasons: string[] }}
 */
function scoreTranscript(text, gameKeywords = []) {
  if (!text) return { transcriptScore: 0, keywordScore: 0, reasons: [] };

  const lower = text.toLowerCase();
  const reasons = [];
  let transcriptScore = 0;
  let keywordScore = 0;

  // Check hype words (each hit = +8, max 60)
  let hypeHits = 0;
  for (const word of HYPE_WORDS) {
    if (lower.includes(word)) {
      hypeHits++;
      if (hypeHits <= 3) reasons.push(word); // only list first 3
    }
  }
  transcriptScore += Math.min(60, hypeHits * 8);

  // Check reaction patterns (each hit = +12, max 40)
  let reactionHits = 0;
  for (const pattern of REACTION_PATTERNS) {
    if (pattern.test(text)) {
      reactionHits++;
    }
  }
  transcriptScore += Math.min(40, reactionHits * 12);

  // Check game-specific keywords (each hit = +15, max 60)
  if (gameKeywords.length > 0) {
    let kwHits = 0;
    for (const kw of gameKeywords) {
      if (lower.includes(kw.toLowerCase())) {
        kwHits++;
        if (kwHits <= 2) reasons.push(kw);
      }
    }
    keywordScore = Math.min(60, kwHits * 15);
  }

  // Cap scores at 100
  transcriptScore = Math.min(100, transcriptScore);
  keywordScore = Math.min(100, keywordScore);

  return { transcriptScore, keywordScore, reasons };
}

/**
 * Score speech pacing — words per second.
 * Higher WPS = more energy.
 * @param {number} wordCount - Number of words in segment
 * @param {number} durationSec - Segment duration
 * @returns {number} 0-100 score
 */
function scorePacing(wordCount, durationSec) {
  if (durationSec <= 0 || wordCount <= 0) return 0;

  const wps = wordCount / durationSec;
  // Typical conversation: 2-3 WPS
  // Excited speech: 4-5+ WPS
  // Map: 1 WPS → 10, 2.5 WPS → 40, 4 WPS → 80, 5+ WPS → 100
  const score = Math.max(0, Math.min(100, (wps - 1) * 25));
  return Math.round(score);
}

// ============ MAIN DETECTION ============

/**
 * Detect highlight segments from transcription + audio analysis.
 *
 * @param {object} transcription - Whisper output { segments: [{ start, end, text, words }] }
 * @param {object} audioAnalysis - From ffmpeg.analyzeLoudness { segments: [{ start, end, loudness }] }
 * @param {object} [gameContext] - Optional game-specific context
 * @param {string[]} [gameContext.keywords] - Game-specific keywords to boost
 * @param {string} [gameContext.gameName] - Game name
 * @param {number} [gameContext.minClipDuration=15] - Min clip length in seconds
 * @param {number} [gameContext.maxClipDuration=60] - Max clip length in seconds
 * @param {number} [gameContext.targetClipCount=30] - Target number of clips
 * @returns {Array<{ start, end, score, reason, segments }>}
 */
function detectHighlights(transcription, audioAnalysis, gameContext = {}) {
  const minDuration = gameContext.minClipDuration || 25;
  const maxDuration = gameContext.maxClipDuration || 60;
  const targetCount = gameContext.targetClipCount || 30;
  const gameKeywords = gameContext.keywords || [];

  const segments = transcription.segments || [];
  if (segments.length === 0) return [];

  // Calculate mean loudness for normalization
  const audioSegments = audioAnalysis?.segments || [];
  let meanLoudness = -30;
  if (audioSegments.length > 0) {
    const sum = audioSegments.reduce((a, s) => a + s.loudness, 0);
    meanLoudness = sum / audioSegments.length;
  }

  // Score each transcript segment
  const scoredSegments = segments.map((seg) => {
    // Get audio energy for this time range
    const overlappingAudio = audioSegments.filter(
      (a) => a.start < seg.end && a.end > seg.start
    );
    const avgLoudness = overlappingAudio.length > 0
      ? overlappingAudio.reduce((a, s) => a + s.loudness, 0) / overlappingAudio.length
      : meanLoudness;

    const audioScore = scoreAudioEnergy(avgLoudness, meanLoudness);
    const { transcriptScore, keywordScore, reasons } = scoreTranscript(seg.text, gameKeywords);
    const wordCount = (seg.words || seg.text.split(/\s+/)).length;
    const duration = seg.end - seg.start;
    const pacingScore = scorePacing(typeof wordCount === "number" ? wordCount : wordCount.length, duration);

    // Weighted composite: audio 40%, transcript 30%, keywords 20%, pacing 10%
    const composite = Math.round(
      audioScore * 0.4 +
      transcriptScore * 0.3 +
      keywordScore * 0.2 +
      pacingScore * 0.1
    );

    return {
      start: seg.start,
      end: seg.end,
      text: seg.text,
      score: composite,
      audioScore,
      transcriptScore,
      keywordScore,
      pacingScore,
      reasons,
    };
  });

  // Group nearby high-scoring segments into clips
  const clips = groupIntoClips(scoredSegments, minDuration, maxDuration);

  // Sort by score descending, take top N
  clips.sort((a, b) => b.score - a.score);
  const selected = clips.slice(0, targetCount);

  // Re-sort by time for sequential order
  selected.sort((a, b) => a.start - b.start);

  return selected;
}

/**
 * Group scored segments into clip-sized highlight blocks.
 * Uses a sliding window approach to find optimal clip boundaries.
 */
function groupIntoClips(scoredSegments, minDuration, maxDuration) {
  if (scoredSegments.length === 0) return [];

  const clips = [];
  const used = new Set();

  // Sort by score to seed clips from highest-scoring segments
  const byScore = [...scoredSegments].sort((a, b) => b.score - a.score);

  for (const seed of byScore) {
    const seedIdx = scoredSegments.indexOf(seed);
    if (used.has(seedIdx)) continue;
    if (seed.score < 25) continue; // skip low-scoring segments

    // Expand clip around seed segment
    let clipStart = seed.start;
    let clipEnd = seed.end;
    let clipScore = seed.score;
    let clipReasons = [...seed.reasons];
    const includedIdxs = [seedIdx];

    // Expand backward
    for (let i = seedIdx - 1; i >= 0; i--) {
      if (used.has(i)) break;
      const seg = scoredSegments[i];
      const gap = clipStart - seg.end;
      if (gap > 5) break; // more than 5s gap = different moment
      const newDuration = clipEnd - seg.start;
      if (newDuration > maxDuration) break;

      clipStart = seg.start;
      clipScore = Math.max(clipScore, seg.score); // use peak score
      includedIdxs.push(i);
      if (seg.reasons.length > 0) clipReasons.push(...seg.reasons);
    }

    // Expand forward
    for (let i = seedIdx + 1; i < scoredSegments.length; i++) {
      if (used.has(i)) break;
      const seg = scoredSegments[i];
      const gap = seg.start - clipEnd;
      if (gap > 5) break;
      const newDuration = seg.end - clipStart;
      if (newDuration > maxDuration) break;

      clipEnd = seg.end;
      clipScore = Math.max(clipScore, seg.score);
      includedIdxs.push(i);
      if (seg.reasons.length > 0) clipReasons.push(...seg.reasons);
    }

    const duration = clipEnd - clipStart;

    // Pad short clips to minimum duration (add context before/after)
    // Always add 2s context padding for natural clip boundaries
    const contextPad = 2;
    if (duration < minDuration) {
      const padding = (minDuration - duration) / 2 + contextPad;
      clipStart = Math.max(0, clipStart - padding);
      clipEnd = clipEnd + padding;
    } else {
      // Even for long-enough clips, add context padding for natural start/end
      clipStart = Math.max(0, clipStart - contextPad);
      clipEnd = Math.min(clipEnd + contextPad, clipStart + maxDuration);
    }

    // Mark segments as used
    for (const idx of includedIdxs) used.add(idx);

    // Deduplicate reasons
    const uniqueReasons = [...new Set(clipReasons)].slice(0, 4);

    clips.push({
      start: Math.round(clipStart * 100) / 100,
      end: Math.round(clipEnd * 100) / 100,
      score: clipScore,
      reason: uniqueReasons.length > 0
        ? uniqueReasons.join(", ")
        : `High energy segment (score: ${clipScore})`,
      segmentCount: includedIdxs.length,
    });
  }

  return clips;
}

module.exports = {
  detectHighlights,
  scoreAudioEnergy,
  scoreTranscript,
  scorePacing,
  HYPE_WORDS,
};
