/**
 * mediaPlacements.js — the shared model for images/GIFs placed on a clip (#310).
 *
 * Same idea as a sound placement (#202): an anchor at a SOURCE moment plus how
 * long it shows, so an overlay follows its footage through trims and reorders
 * instead of drifting. Position and size are percentages of the OUTPUT frame,
 * so the preview and the render agree without either knowing the other's pixels.
 *
 * The timeline math is NOT re-implemented here — resolvePlacements from
 * audioPlacements.js already does it, and a media placement carries no `kind`,
 * which is exactly the strict behaviour we want: an overlay whose moment was cut
 * away disappears with it (songs are the only thing that clamps forward).
 *
 * Unlike a sound, an overlay has no meaningful window INTO its file: an image
 * has no inside and a GIF just loops. So `trimStart` is always 0 and `trimEnd`
 * is simply how long the overlay is on screen — the field stays in the shape
 * only so the shared helpers keep working.
 *
 * CJS on purpose: src/main/render.js requires this. Renderer code imports the
 * named bindings (Vite handles the interop).
 */

const { resolvePlacements } = require("./audioPlacements");

/** How long a freshly-placed image shows for when nothing else says otherwise. */
const DEFAULT_MEDIA_SEC = 3;
/** Lanes are z-order — three is already more stacking than a short needs. */
const MEDIA_TRACK_CAP = 3;

/**
 * Fill in what a saved placement doesn't carry. Nothing is migrated on disk:
 * every default is derivable, so a clip saved by an older build resolves to the
 * behaviour it had then.
 */
function normalizeMediaPlacements(placements) {
  if (!Array.isArray(placements) || placements.length === 0) return [];
  return placements.map((p) => {
    const out = { ...p };
    if (out.mediaType !== "gif") out.mediaType = "image";
    out.trimStart = 0;
    if (!(out.trimEnd > 0)) {
      out.trimEnd = out.durationSec > 0 ? out.durationSec : DEFAULT_MEDIA_SEC;
    }
    if (!(out.trackIndex >= 0)) out.trackIndex = 0;
    if (out.xPct == null) out.xPct = 50;
    if (out.yPct == null) out.yPct = 50;
    if (out.wPct == null) out.wPct = 40;
    if (out.opacity == null) out.opacity = 1;
    return out;
  });
}

/**
 * Resolve placements to timeline positions (tlStart / tlEnd added), dropping
 * the ones whose footage is gone, sorted so a higher trackIndex comes LAST —
 * i.e. draws on top, in both the preview and the render.
 */
function resolveMediaPlacements(placements, nleSegments) {
  const resolved = resolvePlacements(normalizeMediaPlacements(placements), nleSegments);
  return resolved.sort((a, b) => (a.trackIndex - b.trackIndex) || (a.tlStart - b.tlStart));
}

module.exports = {
  DEFAULT_MEDIA_SEC,
  MEDIA_TRACK_CAP,
  normalizeMediaPlacements,
  resolveMediaPlacements,
};
