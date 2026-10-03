/**
 * Colour marks for on-screen captions (#487).
 *
 * The title/caption model reads and writes plain JSON text, but a creator's
 * captions carry per-word and per-line colours (wordStyles / lineStyles on a
 * caption block, see useCaptionStore.js). This module turns those styles into
 * inline marks the model can see in the examples and copy:
 *
 *   "100T Cryo\n[#ffff00]INSANE CLUTCH[/]"
 *
 * and turns the marks the model writes back into styles. Indexing matches the
 * editor: words by whitespace token across the whole block, lines by "\n".
 *
 * Nothing about colours is hardcoded: the palette is learned from the
 * creator's own styled captions. A colour counts once it appears in
 * MIN_CAPTIONS captions, and each one carries the glow the creator most often
 * pairs with it. No styled history, no palette, and every mark is dropped.
 *
 * Pure functions, no electron — main-process and jest safe.
 */

const MIN_CAPTIONS = 3;
const MARK_RE = /\[(#[0-9a-fA-F]{6})\]([\s\S]*?)\[\/\]/g;
const STRAY_RE = /\[(#[0-9a-fA-F]{3,8}|\/)\]/g;

const words = (text) => String(text || "").split(/\s+/).filter(Boolean);
const lc = (c) => (typeof c === "string" ? c.toLowerCase() : null);

/**
 * The colour of every word in a block, positionally: a word style beats its
 * line's style, the same layering the renderer uses (buildCaptionTokens).
 * @returns {Array<{word: string, line: number, color: string|null}>}
 */
function wordColors(text, { wordStyles, lineStyles } = {}) {
  const out = [];
  String(text || "").split("\n").forEach((line, li) => {
    for (const w of words(line)) {
      const wi = out.length;
      out.push({ word: w, line: li, color: lc(wordStyles?.[wi]?.color) || lc(lineStyles?.[li]?.color) || null });
    }
  });
  return out;
}

/**
 * Learn the creator's caption colours.
 * @param {Array<{wordStyles?: object, lineStyles?: object, baseColor?: string}>} rows  one per published caption
 * @returns {Array<{color: string, captions: number, patch: object}>}  most used first
 */
function learnPalette(rows) {
  const captions = new Map();   // color -> number of captions using it
  const companions = new Map(); // color -> Map(json patch -> count)
  for (const r of rows || []) {
    if (!r) continue;
    const base = lc(r.baseColor);
    const seen = new Set();
    for (const st of [...Object.values(r.wordStyles || {}), ...Object.values(r.lineStyles || {})]) {
      const color = lc(st?.color);
      if (!color || color === base) continue;
      seen.add(color);
      const patch = { color };
      if (typeof st.glowOn === "boolean") patch.glowOn = st.glowOn;
      if (typeof st.glowColor === "string") patch.glowColor = lc(st.glowColor);
      const key = JSON.stringify(patch);
      if (!companions.has(color)) companions.set(color, new Map());
      companions.get(color).set(key, (companions.get(color).get(key) || 0) + 1);
    }
    for (const c of seen) captions.set(c, (captions.get(c) || 0) + 1);
  }
  return [...captions.entries()]
    .filter(([, n]) => n >= MIN_CAPTIONS)
    .sort((a, b) => b[1] - a[1])
    .map(([color, n]) => {
      const best = [...companions.get(color).entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { color, captions: n, patch: JSON.parse(best) };
    });
}

/**
 * A styled caption as marked text, for the prompt's examples. Only palette
 * colours are marked; consecutive same-colour words on a line share a mark.
 * Keeps the "\n" line breaks.
 */
function toMarked(text, styles, palette) {
  const allowed = new Set((palette || []).map((p) => p.color));
  const toks = wordColors(text, styles);
  const lines = String(text || "").split("\n").map(() => []);
  let i = 0;
  while (i < toks.length) {
    const { line, color } = toks[i];
    const c = allowed.has(color) ? color : null;
    let j = i;
    while (j + 1 < toks.length && toks[j + 1].line === line && (allowed.has(toks[j + 1].color) ? toks[j + 1].color : null) === c) j++;
    const run = toks.slice(i, j + 1).map((t) => t.word).join(" ");
    lines[line].push(c ? `[${c}]${run}[/]` : run);
    i = j + 1;
  }
  return lines.map((parts) => parts.join(" ")).join("\n");
}

/**
 * Parse a marked caption from the model into plain text plus styles. A line
 * whose every word carries one colour becomes a line style; otherwise each
 * coloured word gets a word style. Colours outside the palette, malformed and
 * unclosed marks are dropped — never an invented colour.
 * @returns {{ text: string, wordStyles?: object, lineStyles?: object }}
 */
function parseMarked(marked, palette) {
  const patchFor = new Map((palette || []).map((p) => [p.color, p.patch]));
  const wordStyles = {};
  const lineStyles = {};
  let wi = 0;
  const plainLines = String(marked || "").trim().split("\n").map((raw, li) => {
    // Per-character colour of the plain line, then each word takes the colour
    // of its first character.
    let plain = "";
    const colorAt = [];
    let last = 0;
    const push = (s, color) => {
      const clean = s.replace(STRAY_RE, "");
      plain += clean;
      for (let k = 0; k < clean.length; k++) colorAt.push(color);
    };
    for (const m of raw.matchAll(MARK_RE)) {
      push(raw.slice(last, m.index), null);
      push(m[2], lc(m[1]));
      last = m.index + m[0].length;
    }
    push(raw.slice(last), null);

    const lineWords = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(plain))) lineWords.push(patchFor.has(colorAt[m.index]) ? colorAt[m.index] : null);
    if (lineWords.length > 0 && lineWords[0] && lineWords.every((c) => c === lineWords[0])) {
      lineStyles[li] = { ...patchFor.get(lineWords[0]) };
    } else {
      lineWords.forEach((c, k) => { if (c) wordStyles[wi + k] = { ...patchFor.get(c) }; });
    }
    wi += lineWords.length;
    return plain.replace(/[ \t]+/g, " ").trim();
  });
  const out = { text: plainLines.join("\n") };
  if (Object.keys(wordStyles).length) out.wordStyles = wordStyles;
  if (Object.keys(lineStyles).length) out.lineStyles = lineStyles;
  return out;
}

module.exports = { learnPalette, toMarked, parseMarked, wordColors, MIN_CAPTIONS };
