/**
 * audioMix.js — Recording levels (#272): a dB offset per OBS audio track of the
 * source recording, so a too-loud mic or a too-quiet game/browser track can be
 * balanced inside Corva instead of re-exporting the raw file.
 *
 * Shared by the editor (popover + live preview), render.js (the export mixes
 * the same levels) and projects.js (persistence). CJS on purpose: the main
 * process requires it, like timeMapping.js. PURE — no state, no side effects.
 *
 * Shape: { "<0-based audio track index>": <dB> }, e.g. { "1": -3, "3": 18 }.
 * A track absent from the object sits at 0 dB. Two homes:
 *   clip.audioMix    — absent = inherit the recording's; an object (even {})
 *                      = this clip's own levels.
 *   project.audioMix — the recording's default ("Apply to every clip").
 * The full-mix track (label "mix") is never a level: it's the track the mix
 * REPLACES. With every level at 0 dB the export keeps the mix track exactly as
 * today (see isFlat), so untouched clips never pay for the rebuild.
 */

const MIX_DB_MIN = -24;
const MIX_DB_MAX = 24;

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

/** Finite, clamped to the slider range, one decimal. Anything else → 0. */
function clampDb(db) {
  const n = Number(db);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.max(MIX_DB_MIN, Math.min(MIX_DB_MAX, n)) * 10) / 10;
}

/**
 * The saved form: only non-zero levels, keyed by integer index. `{}` survives
 * as `{}` (a clip that explicitly wants the recording flat). Not an object → null.
 */
function normalizeMix(mix) {
  if (!mix || typeof mix !== "object" || Array.isArray(mix)) return null;
  const out = {};
  for (const key of Object.keys(mix)) {
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0) continue;
    const db = clampDb(mix[key]);
    if (db !== 0) out[String(idx)] = db;
  }
  return out;
}

/** True when nothing is turned: no mix, or every level at 0 dB. */
function isFlat(mix) {
  const norm = normalizeMix(mix);
  return !norm || Object.keys(norm).length === 0;
}

/** Return a new mix with one track's level set; 0 dB removes the entry. */
function setLevel(mix, trackIndex, db) {
  const base = normalizeMix(mix) || {};
  return normalizeMix({ ...base, [String(trackIndex)]: db }) || {};
}

/** Clip override > recording default > null. Same precedence as #348 layouts. */
function resolveClipAudioMix(clip, project) {
  if (clip && clip.audioMix && typeof clip.audioMix === "object") return clip.audioMix;
  if (project && project.audioMix && typeof project.audioMix === "object") return project.audioMix;
  return null;
}

/** Every calibrated track except the full mix, in index order. [] without a setup. */
function mixableTracks(audioSetup) {
  if (!audioSetup || !Array.isArray(audioSetup.tracks)) return [];
  return audioSetup.tracks
    .filter((t) => t && Number.isInteger(t.index) && t.index >= 0 && t.label !== "mix")
    .slice()
    .sort((a, b) => a.index - b.index);
}

/**
 * What the export sums: one { index, gain } per mixable track (linear gain,
 * 0 dB → 1). null when the mix can't be built honestly — no calibration, or a
 * calibration for a different track layout than the file in hand — so the
 * caller falls back to the mix track rather than guess which track is which.
 */
function buildSourceMix(audioSetup, mix, fileTrackCount) {
  if (!audioSetup || !Number.isInteger(audioSetup.trackCount)) return null;
  if (Number.isFinite(fileTrackCount) && audioSetup.trackCount !== fileTrackCount) return null;
  const norm = normalizeMix(mix) || {};
  const tracks = mixableTracks(audioSetup).filter(
    (t) => !Number.isFinite(fileTrackCount) || t.index < fileTrackCount
  );
  if (tracks.length === 0) return null;
  return tracks.map((t) => ({ index: t.index, gain: dbToGain(norm[String(t.index)] || 0) }));
}

module.exports = {
  MIX_DB_MIN,
  MIX_DB_MAX,
  dbToGain,
  clampDb,
  normalizeMix,
  isFlat,
  setLevel,
  resolveClipAudioMix,
  mixableTracks,
  buildSourceMix,
};
