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
 * An image or a GIF has no meaningful window INTO its file: an image has no
 * inside and a GIF just loops. For those `trimStart` is always 0 and `trimEnd`
 * is simply how long the overlay is on screen — the field stays in the shape
 * only so the shared helpers keep working.
 *
 * A video (#311) DOES have an inside, so there `trimStart`/`trimEnd` mean what
 * they mean for a sound: the window of the file that plays. Dragging the left
 * edge trims into it rather than just delaying it, and neither edge can leave
 * the file — a video, unlike a still, runs out.
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
 * A video overlay's sound is ON by default (#311) — a reaction cam nobody can
 * hear is not a reaction cam — but sits under the clip's own audio rather than
 * on top of it.
 */
const DEFAULT_VIDEO_VOLUME = 0.6;
/** A video can't be trimmed down to nothing. */
const MIN_VIDEO_WINDOW = 0.1;

/**
 * Fill in what a saved placement doesn't carry. Nothing is migrated on disk:
 * every default is derivable, so a clip saved by an older build resolves to the
 * behaviour it had then.
 */
function normalizeMediaPlacements(placements) {
  if (!Array.isArray(placements) || placements.length === 0) return [];
  return placements.map((p) => {
    const out = { ...p };
    if (out.mediaType !== "gif" && out.mediaType !== "video") out.mediaType = "image";
    if (out.mediaType === "video") {
      // The window into the file, clamped to the file. durationSec is probed at
      // add time; when it's missing (an older save, an unprobeable file) the
      // window is left alone rather than guessed at.
      const fileLen = out.durationSec > 0 ? out.durationSec : 0;
      out.trimStart = Math.max(0, out.trimStart || 0);
      if (fileLen) out.trimStart = Math.min(out.trimStart, Math.max(0, fileLen - MIN_VIDEO_WINDOW));
      if (!(out.trimEnd > out.trimStart)) {
        // A fresh video overlay plays the whole file.
        out.trimEnd = fileLen || (out.trimStart + DEFAULT_MEDIA_SEC);
      }
      if (fileLen) out.trimEnd = Math.min(out.trimEnd, fileLen);
      if (out.volume == null) out.volume = DEFAULT_VIDEO_VOLUME;
      if (out.muted == null) out.muted = false;
    } else {
      out.trimStart = 0;
      if (!(out.trimEnd > 0)) {
        out.trimEnd = out.durationSec > 0 ? out.durationSec : DEFAULT_MEDIA_SEC;
      }
    }
    // Which lane (= z-order level) this sits on. Anything that isn't a real
    // lane number resolves to 0 rather than travelling on: `x >= 0` alone lets
    // a null through (null >= 0 is true) and a string past that, and this value
    // both indexes a lane array and drives the draw-order sort. Same guard the
    // sound twin uses (#312) — the two models are meant to agree (#320).
    out.trackIndex = Number.isFinite(out.trackIndex) && out.trackIndex > 0
      ? Math.floor(out.trackIndex)
      : 0;
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
  DEFAULT_VIDEO_VOLUME,
  MEDIA_TRACK_CAP,
  normalizeMediaPlacements,
  resolveMediaPlacements,
};
