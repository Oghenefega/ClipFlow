/**
 * ALL CAPS (#433) — casing is TEXT, never a drawn effect.
 *
 * The AA switch rewrites the words themselves, so the text box, the word chips,
 * the subtitle rows, the preview, the Projects preview and the export all print
 * the same string and cannot disagree. Nothing stores "is this caps": every
 * switch reads its state off the text (isAllCaps), which is why a word TYPED in
 * capitals lights the switch by itself.
 *
 * Switching on remembers each word's previous spelling (`orig`); switching off
 * puts it back — "Cryo" → "CRYO" → "Cryo", "oOoOOo" → "OOOOOO" → "oOoOOo". The
 * memory is only trusted while `orig.toUpperCase()` still equals the word on
 * screen, so a word retyped while in capitals, or an index that drifted after
 * an edit, falls through to plain lower-casing instead of restoring the wrong
 * thing. A word with no memory (typed in capitals) lower-cases, keeping a
 * standalone I / I'm / I'll / I've / I'd capital.
 *
 * Where the memory lives: on the word object for subtitles (`words[i].orig` —
 * it rides every split / merge / regroup with the word), and in a `wordOrig`
 * map on the caption segment, keyed by whitespace-token index like wordStyles.
 *
 * CJS: render.js requires this for the legacy bake below.
 */

// A cased letter is required — "123" equals its own toUpperCase() and would
// read as ALL CAPS forever (#129).
const hasCased = (t) => /[a-z]/i.test(t || "");

function isAllCaps(text) {
  return hasCased(text) && text === text.toUpperCase();
}

function lowerKeepI(word) {
  return word.toLowerCase().replace(/^([^a-z]*)i((?:['’](?:m|ll|ve|d))?[^a-z]*)$/, "$1I$2");
}

/** One word through the switch. Returns { word, orig } — orig undefined = no memory. */
function capsWord(word, orig, on) {
  if (!hasCased(word)) return { word, orig: undefined };
  const upper = word.toUpperCase();
  const origValid = typeof orig === "string" && orig.toUpperCase() === upper && orig !== upper;
  if (on) {
    if (word === upper) return { word, orig: origValid ? orig : undefined };
    return { word: upper, orig: word };
  }
  if (word !== upper) return { word, orig: undefined }; // not in capitals — nothing to undo
  return { word: origValid ? orig : lowerKeepI(word), orig: undefined };
}

const _tokens = (text) => (text || "").split(/\s+/).filter(Boolean);

function _withOrig(w, r) {
  const { orig: _drop, ...rest } = w;
  return r.orig ? { ...rest, word: r.word, orig: r.orig } : { ...rest, word: r.word };
}

/**
 * A subtitle segment through the switch — every word, or just `wordIdx` (a
 * text-token index; words[] is parallel to the text tokens). Keeps text and
 * words[] in sync: the preview and the export draw from words[] (#138). When
 * the two lists don't line up (count mismatch) both are still re-cased, but
 * without memory — there is no safe word to hang it on.
 */
function capsSegment(seg, on, wordIdx) {
  const tokens = _tokens(seg.text);
  const one = Number.isInteger(wordIdx);
  const hit = (i) => !one || i === wordIdx;
  const parallel = Array.isArray(seg.words) && seg.words.length === tokens.length;
  if (parallel) {
    const words = seg.words.map((w, i) => {
      if (!hit(i)) return w;
      const r = capsWord(tokens[i], w.orig, on);
      tokens[i] = r.word;
      return _withOrig(w, r);
    });
    return { ...seg, text: tokens.join(" "), words };
  }
  const text = tokens.map((t, i) => (hit(i) ? capsWord(t, undefined, on).word : t)).join(" ");
  const words = (seg.words || []).map((w) => (one ? w : _withOrig(w, capsWord(w.word || "", undefined, on))));
  return { ...seg, text, ...(seg.words ? { words } : {}) };
}

/**
 * Caption text through the switch. `indexes` is a Set of whitespace-token
 * indexes, or null for every word. Whitespace and line breaks are untouched.
 * Returns { text, wordOrig } — wordOrig undefined when no memory is left.
 */
function capsCaptionText(text, wordOrig, on, indexes) {
  const next = { ...(wordOrig || {}) };
  let i = -1;
  const out = (text || "").replace(/\S+/g, (tok) => {
    i++;
    if (indexes && !indexes.has(i)) return tok;
    const r = capsWord(tok, next[i], on);
    if (r.orig) next[i] = r.orig; else delete next[i];
    return r.word;
  });
  return { text: out, wordOrig: Object.keys(next).length > 0 ? next : undefined };
}

/** Token indexes of one Enter-separated caption line. */
function captionLineIndexes(text, lineIdx) {
  const set = new Set();
  let n = 0;
  (text || "").split("\n").forEach((line, li) => {
    const count = _tokens(line).length;
    if (li === lineIdx) for (let k = 0; k < count; k++) set.add(n + k);
    n += count;
  });
  return set;
}

// ── Legacy bake ──
// 0.5.0-alpha.6 shipped casing as a drawn flag (#426): `caps` on the block
// style, on a subtitle line, on a caption line style and on a word style,
// innermost winning, with the text left as typed. These two functions turn such
// data into real text once, wherever saved data is read (the shared subtitle
// resolver, the caption store, the Projects preview, render.js), and strip the
// flags. Data that never carried a flag is returned as the SAME array.

const _flag = (v) => v === true || v === false;

function _stripCaps(style) {
  if (!style || !("caps" in style)) return style;
  const { caps: _drop, ...rest } = style;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function bakeLegacySubtitleCaps(segs, blockCaps) {
  if (!Array.isArray(segs)) return segs;
  const block = blockCaps === true;
  const touched = block || segs.some((s) => _flag(s.caps) || (s.words || []).some((w) => w.style && "caps" in w.style));
  if (!touched) return segs;
  return segs.map((s) => {
    const { caps, ...seg } = s;
    const lineCaps = _flag(caps) ? caps : block;
    const tokens = _tokens(seg.text);
    const parallel = Array.isArray(seg.words) && seg.words.length === tokens.length;
    let out = seg;
    if (parallel) {
      seg.words.forEach((w, i) => {
        const eff = _flag(w.style?.caps) ? w.style.caps : lineCaps;
        if (eff) out = capsSegment(out, true, i);
      });
    } else if (lineCaps) {
      out = capsSegment(out, true);
    }
    if (!out.words) return out;
    return {
      ...out,
      words: out.words.map((w) => {
        if (!w.style || !("caps" in w.style)) return w;
        const { style, ...rest } = w;
        const kept = _stripCaps(style);
        return kept ? { ...rest, style: kept } : rest;
      }),
    };
  });
}

function _stripCapsMap(map) {
  if (!map) return map;
  const next = {};
  for (const [k, v] of Object.entries(map)) {
    const kept = _stripCaps(v);
    if (kept) next[k] = kept;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function bakeLegacyCaptionCaps(segs, blockCaps) {
  if (!Array.isArray(segs)) return segs;
  const block = blockCaps === true;
  const hasFlag = (map) => !!map && Object.values(map).some((v) => v && "caps" in v);
  const touched = block || segs.some((s) => hasFlag(s.wordStyles) || hasFlag(s.lineStyles));
  if (!touched) return segs;
  return segs.map((s) => {
    const on = new Set();
    let n = 0;
    (s.text || "").split("\n").forEach((line, li) => {
      const lineCaps = _flag(s.lineStyles?.[li]?.caps) ? s.lineStyles[li].caps : block;
      _tokens(line).forEach(() => {
        const eff = _flag(s.wordStyles?.[n]?.caps) ? s.wordStyles[n].caps : lineCaps;
        if (eff) on.add(n);
        n++;
      });
    });
    const { wordStyles, lineStyles, ...rest } = s;
    const r = on.size > 0 ? capsCaptionText(s.text, s.wordOrig, true, on) : { text: s.text, wordOrig: s.wordOrig };
    const ws = _stripCapsMap(wordStyles);
    const ls = _stripCapsMap(lineStyles);
    const { wordOrig: _old, ...base } = rest;
    return {
      ...base,
      text: r.text,
      ...(ws ? { wordStyles: ws } : {}),
      ...(ls ? { lineStyles: ls } : {}),
      ...(r.wordOrig ? { wordOrig: r.wordOrig } : {}),
    };
  });
}

module.exports = {
  isAllCaps,
  capsWord,
  capsSegment,
  capsCaptionText,
  captionLineIndexes,
  bakeLegacySubtitleCaps,
  bakeLegacyCaptionCaps,
};
