/**
 * audioPlacements.js — the shared model for sounds placed on a clip (#202).
 *
 * A placement (SFX or song) is an anchor at a SOURCE moment plus the window of
 * its file that plays. Its timeline length is DERIVED (trimEnd - trimStart), so
 * nothing needs to be re-derived when footage is trimmed or reordered.
 *
 * CJS on purpose: the main process requires this from render.js so the editor,
 * the preview and the render all resolve placements the same way. Renderer code
 * imports the named bindings (Vite handles the interop).
 */

const { getTimelineDuration, sourceToTimeline, sourceToTimelineClamped } = require("./timeMapping");

/**
 * How many lanes one kind (Music or SFX) can be split across (#312). Within a
 * lane two overlapping blocks still stack into half-height rows, so three lanes
 * shows six simultaneous sounds — well past the three Fega actually stacks.
 *
 * A sound lane's index is LAYOUT ONLY: unlike a media lane it carries no
 * z-order, and the mix is unaffected by it. See resolvePlacements below.
 */
const SOUND_TRACK_CAP = 3;

/** How long this placement occupies the timeline. */
function placementLength(p) {
  const start = p.trimStart || 0;
  const end = p.trimEnd != null ? p.trimEnd : (p.durationSec || 0);
  return Math.max(0, end - start);
}

/**
 * Fill in the fields older saved clips don't have. Nothing is migrated on
 * disk — the defaults are derivable, so a clip saved before trimming existed
 * resolves to exactly the behaviour it had then:
 *   - no trim window        → the whole file
 *   - no anchor (music bed) → the top of the clip, spanning it
 */
function normalizePlacements(placements, nleSegments) {
  if (!Array.isArray(placements) || placements.length === 0) return [];
  const segs = nleSegments || [];
  const tlDur = getTimelineDuration(segs);
  const firstSource = segs.length > 0 ? segs[0].sourceStart : 0;

  return placements.map((p) => {
    const out = { ...p };
    if (out.sourceTime == null) {
      // Legacy music bed: started at the top of the clip and spanned it.
      out.sourceTime = firstSource;
      if (out.trimEnd == null && tlDur > 0) {
        out.trimEnd = out.durationSec ? Math.min(out.durationSec, tlDur) : tlDur;
      }
    }
    if (out.trimStart == null) out.trimStart = 0;
    if (out.trimEnd == null) out.trimEnd = out.durationSec || 0;
    // #312: which lane of its kind this sits on. Every clip saved before extra
    // lanes existed had exactly one lane per kind, which IS lane 0. Anything
    // that isn't a real lane number resolves to 0 rather than travelling on:
    // `x >= 0` alone lets a null through (null >= 0 is true) and a string past
    // that, and this value indexes a lane array.
    out.trackIndex = Number.isFinite(out.trackIndex) && out.trackIndex > 0
      ? Math.floor(out.trackIndex)
      : 0;
    return out;
  });
}

/**
 * Resolve placements to timeline positions, dropping the ones whose footage is
 * gone. Returns each surviving placement with tlStart / tlEnd added.
 *
 * The two kinds differ ONLY here: a one-shot SFX belongs to an instant, so it
 * disappears with that instant; a song belongs to a stretch of footage, so its
 * anchor clamps forward to whatever footage survived instead of vanishing.
 *
 * `trackIndex` (#312) is deliberately NOT consulted and the input order is
 * deliberately NOT changed: the mix is amix over every placement, so which lane
 * a sound was dragged onto must not alter a single byte of the export. Media
 * placements are the opposite case and sort by lane — that's z-order, which is
 * real. Compare resolveMediaPlacements in mediaPlacements.js.
 */
function resolvePlacements(placements, nleSegments) {
  const segs = nleSegments || [];
  const out = [];
  for (const p of normalizePlacements(placements, segs)) {
    const map = p.kind === "music"
      ? sourceToTimelineClamped(p.sourceTime, segs)
      : sourceToTimeline(p.sourceTime, segs);
    if (!map.found) continue;
    out.push({ ...p, tlStart: map.timelineTime, tlEnd: map.timelineTime + placementLength(p) });
  }
  return out;
}

/**
 * Lane layout: overlapping blocks stack into two half-height rows so neither
 * hides the other. Returns { blocks (sorted, each with .row), rows }.
 * A third simultaneous block reuses the row it overlaps least — which means it
 * DRAWS OVER one of them. That's why extra lanes exist (#312): callers pass one
 * lane's blocks at a time, so the packer never has to make that trade.
 */
function assignRows(blocks) {
  const sorted = [...blocks].sort((a, b) => a.tlStart - b.tlStart);
  const rowEnds = [-Infinity, -Infinity];
  let rows = 1;
  const placed = sorted.map((b) => {
    let row;
    if (b.tlStart >= rowEnds[0] - 0.001) row = 0;
    else if (b.tlStart >= rowEnds[1] - 0.001) row = 1;
    else row = rowEnds[0] <= rowEnds[1] ? 0 : 1;
    if (row === 1) rows = 2;
    rowEnds[row] = Math.max(rowEnds[row], b.tlEnd);
    return { ...b, row };
  });
  return { blocks: placed, rows };
}

/**
 * Which placements are sitting on lane `laneIndex` or beyond (#321).
 *
 * `>=` rather than `===` because the last lane of a kind DISPLAYS everything
 * above it — an undo can put a block back on a lane that has since been
 * removed — so 'is the last lane occupied' has to ask the same question the
 * lane itself does. Runs on RAW placements on purpose: a placement whose
 * footage was cut away is dropped by the resolver but still holds its lane,
 * and the remove-lane button and the store action must agree about that.
 */
function occupantsFromLane(placements, laneIndex) {
  if (!Array.isArray(placements)) return [];
  return placements.filter((p) => {
    // Judge the lane the way normalizePlacements will DRAW it — the same
    // finite guard, not `|| 0` — or a malformed index could hold a lane
    // hostage that its own block will never render on (#320's agreement
    // rule applies here too: this answer and the drawn lane are one fact).
    const lane = Number.isFinite(p.trackIndex) && p.trackIndex > 0 ? Math.floor(p.trackIndex) : 0;
    return lane >= laneIndex;
  });
}

module.exports = {
  SOUND_TRACK_CAP,
  occupantsFromLane,
  placementLength,
  normalizePlacements,
  resolvePlacements,
  assignRows,
};
