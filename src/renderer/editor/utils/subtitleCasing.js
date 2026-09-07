/**
 * Subtitle casing repair (#368).
 *
 * Whisper copies the style of its prompt and hands back whole segments in
 * lowercase: "did i just hear that", "oh my god", "jesus". The universally
 * expected casing — the pronoun I and the proper nouns God / Jesus / Christ —
 * is restored here, in ONE place, and applied both at birth (main process,
 * right after the transcription JSON is parsed, so project.json is correct on
 * disk) and on read (resolveSubtitles for clips already on disk, the Projects
 * tab transcript rail). Editor-saved edits are never touched: the resolver
 * gates this behind !hasEditorSavedSubs.
 *
 * Idempotent, first-letter only, whole-token matching — "goddamn", "godlike",
 * "christmas" pass through untouched. CJS so the main process can require it.
 */

const I_FORMS = new Set(["i", "i'm", "i'll", "i've", "i'd", "i'd've"]);
const PROPER = new Set([
  "god", "god's", "gods",
  "jesus", "jesus'", "jesus's",
  "christ", "christ's",
]);

const TOKEN_RE = /^([^A-Za-z0-9]*)([A-Za-z0-9'’]+)([^A-Za-z0-9]*)$/;

// Split a token into lead-punct / core / trail-punct so "i'm," → "I'm,".
function splitToken(raw) {
  const m = (raw || "").match(TOKEN_RE);
  return m ? { lead: m[1], core: m[2], trail: m[3] } : { lead: "", core: raw || "", trail: "" };
}

// The corrected core, or null when this token needs no change.
function fixCore(core) {
  const key = core.replace(/’/g, "'").toLowerCase();
  if (I_FORMS.has(key)) {
    const fixed = "I" + core.slice(1);
    return fixed === core ? null : fixed;
  }
  if (PROPER.has(key)) {
    const fixed = core[0].toUpperCase() + core.slice(1);
    return fixed === core ? null : fixed;
  }
  return null;
}

/** A single token ("word" field of a word object, or a whitespace-split piece). */
function fixToken(raw) {
  const { lead, core, trail } = splitToken(raw);
  const fixed = fixCore(core);
  return fixed === null ? raw : lead + fixed + trail;
}

/** Word objects `{ word, start, end, … }` → same array, only changed words are new objects. */
function fixWordCasing(words) {
  if (!Array.isArray(words)) return words;
  let changed = false;
  const out = words.map((w) => {
    const fixed = fixToken(w.word || "");
    if (fixed === (w.word || "")) return w;
    changed = true;
    return { ...w, word: fixed };
  });
  return changed ? out : words;
}

/** Plain text: tokens are whitespace-separated, whitespace is preserved as-is. */
function fixTextCasing(text) {
  if (typeof text !== "string" || !text) return text;
  return text.replace(/\S+/g, (tok) => fixToken(tok));
}

/** A transcription `{ segments: [{ text, words }], text }` → a corrected copy. */
function fixTranscriptionCasing(transcription) {
  if (!transcription || !Array.isArray(transcription.segments)) return transcription;
  const segments = transcription.segments.map((s) => {
    const words = fixWordCasing(s.words);
    const text = fixTextCasing(s.text);
    return words === s.words && text === s.text ? s : { ...s, words, text };
  });
  const out = { ...transcription, segments };
  if (typeof transcription.text === "string") out.text = fixTextCasing(transcription.text);
  return out;
}

module.exports = { fixWordCasing, fixTextCasing, fixTranscriptionCasing };
