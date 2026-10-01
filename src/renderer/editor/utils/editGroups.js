/**
 * #479: split an editor save payload into the kinds of edit a creator makes,
 * one comparable string per kind. The edit tracker compares these between
 * saves: a kind whose string moved since the last save is one edit of that
 * kind. Comparing saves (instead of hooking every edit action) catches the
 * setters that never push undo, and lets opening a clip count as zero edits.
 *
 * CJS so jest can require it; the renderer imports it as named ESM bindings.
 */

const EDIT_GROUPS = [
  "cuts", "layout", "subtitle_text", "subtitle_timing", "subtitle_style",
  "caption", "sound", "overlay", "levels", "title",
];

// Keys on a subtitle segment that are text, timing or display bookkeeping.
// Everything else on the segment (line/word styles, caps, position) is style.
const SUB_NON_STYLE_KEYS = new Set([
  "id", "text", "words", "start", "end", "dur", "startSec", "endSec",
  "track", "conf", "warning", "enabled",
]);

const r3 = (n) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null);
const r2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

function subStyleRest(seg) {
  const out = {};
  for (const k of Object.keys(seg || {}).sort()) {
    if (!SUB_NON_STYLE_KEYS.has(k)) out[k] = seg[k];
  }
  return out;
}

// Only lines that carry a style of their own, by id: splitting or adding an
// unstyled line must not read as a style edit.
function styledLines(subs) {
  return subs
    .map((s) => [s.id, subStyleRest(s)])
    .filter(([, rest]) => Object.keys(rest).length > 0);
}

/**
 * @param {object} payload  the object _doSilentSave hands to projectUpdateClip
 * @param {object} [extra]
 * @param {*} [extra.clipReframe]  clip.reframe (the clip-wide layout lives outside the payload)
 * @param {Array} [extra.subtitles] the UNFILTERED subtitle segments. The payload's sub1 drops
 *   lines outside the kept sections, so a trim would otherwise also read as a subtitle edit.
 * @returns {Record<string,string>} one string per EDIT_GROUPS entry
 */
function groupFingerprints(payload, { clipReframe, subtitles } = {}) {
  const p = payload || {};
  const nle = Array.isArray(p.nleSegments) ? p.nleSegments : [];
  const subs = Array.isArray(subtitles) ? subtitles
    : Array.isArray(p.subtitles?.sub1) ? p.subtitles.sub1 : [];
  const lanes = p.laneEnabled || {};
  return {
    cuts: JSON.stringify(nle.map((s) => [r3(s.sourceStart), r3(s.sourceEnd)])),
    // Only sections with a layout of their own, by id, so a plain cut is not a layout edit.
    layout: JSON.stringify([
      clipReframe === undefined ? "inherit" : clipReframe,
      nle.filter((s) => s.reframe !== undefined).map((s) => [s.id, s.reframe]),
    ]),
    subtitle_text: JSON.stringify(subs.map((s) => [s.text || "", s.enabled !== false])),
    subtitle_timing: JSON.stringify(subs.map((s) => [
      r2(s.startSec), r2(s.endSec),
      (s.words || []).map((w) => [r2(w.start), r2(w.end)]),
    ])),
    subtitle_style: JSON.stringify([p.subtitleStyle || null, styledLines(subs)]),
    caption: JSON.stringify([p.caption || "", p.captionSegments || null, p.captionStyle || null, lanes.cap !== false]),
    sound: JSON.stringify([p.sfx || [], p.musicTrackCount || 1, p.sfxTrackCount || 1, lanes.music !== false, lanes.sfx !== false]),
    overlay: JSON.stringify([p.media || [], p.mediaTrackCount || 1, lanes.media !== false]),
    levels: JSON.stringify([p.audioMix || null, p.sourceAudioMuted === true]),
    title: p.title || "",
  };
}

/**
 * Kinds whose string differs between two fingerprint sets. Changing a line's
 * words re-times them as a side effect, so a save that changed the text is
 * not also counted as a timing fix.
 */
function changedGroups(prev, next) {
  if (!prev || !next) return [];
  const changed = EDIT_GROUPS.filter((g) => prev[g] !== next[g]);
  return changed.includes("subtitle_text") ? changed.filter((g) => g !== "subtitle_timing") : changed;
}

module.exports = { EDIT_GROUPS, groupFingerprints, changedGroups };
