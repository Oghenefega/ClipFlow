/**
 * segmentOps.js — Pure edit operations on the NLE segment list.
 *
 * Every function takes a segment array and returns a NEW segment array.
 * No mutations, no side effects, no FFmpeg, no async.
 *
 * These are the building blocks for split, delete, trim, and extend.
 * The editor store calls these, snapshots the result for undo, and sets state.
 */

const { createSegment, segmentDuration, isValidSegment } = require("./segmentModel");
const { timelineToSource } = require("./timeMapping");

const MIN_SEGMENT_DURATION = 0.05; // 50ms — minimum viable segment

// ─── Split ──────────────────────────────────────────────────────────────────

/**
 * Split a segment at a source-time position. The segment containing
 * sourceTime is bisected into two segments.
 *
 * @param {Array} segments - current segment list
 * @param {number} sourceTime - source-file time to split at
 * @returns {Array} new segment list with the split applied
 */
function splitAtSource(segments, sourceTime) {
  const result = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Check if split point is inside this segment (with boundary guards)
    if (
      sourceTime > seg.sourceStart + MIN_SEGMENT_DURATION &&
      sourceTime < seg.sourceEnd - MIN_SEGMENT_DURATION
    ) {
      // Bisect: left half keeps original ID, right half gets new ID. Both
      // halves inherit every other field of the parent (#349: a section's
      // own layout must survive being cut in two) — createSegment only mints
      // the new id.
      result.push({ ...seg, sourceEnd: sourceTime });
      result.push({ ...seg, id: createSegment(sourceTime, seg.sourceEnd).id, sourceStart: sourceTime });
    } else {
      result.push(seg);
    }
  }

  return result;
}

/**
 * Split at a timeline position (converts to source time first).
 *
 * @param {Array} segments - current segment list
 * @param {number} timelineTime - timeline position to split at
 * @returns {Array} new segment list
 */
function splitAtTimeline(segments, timelineTime) {
  const { sourceTime, found } = timelineToSource(timelineTime, segments);
  if (!found) return segments;
  return splitAtSource(segments, sourceTime);
}

// ─── Delete ─────────────────────────────────────────────────────────────────

/**
 * Delete a segment by ID. Since timeline position is derived from the
 * ordered concatenation, removing a segment automatically "ripples" —
 * all subsequent content shifts left.
 *
 * @param {Array} segments - current segment list
 * @param {string} segmentId - ID of segment to remove
 * @returns {Array} new segment list without the deleted segment
 */
function deleteSegment(segments, segmentId) {
  return segments.filter((seg) => seg.id !== segmentId);
}

// ─── Move (reorder) ─────────────────────────────────────────────────────────

/**
 * Move a segment to a different slot in the list. Since timeline position is
 * derived from array order, reordering the array IS reordering the timeline —
 * no source times change, so subtitles (which are source-timed and projected
 * through this list) follow the segment automatically.
 *
 * @param {Array} segments - current segment list
 * @param {string} segmentId - ID of segment to move
 * @param {number} toIndex - destination slot, counted AFTER the segment is
 *                           lifted out of the list (0 = first). Clamped.
 * @returns {Array} new segment list, or the input unchanged if it's a no-op
 */
function moveSegment(segments, segmentId, toIndex) {
  const from = segments.findIndex((s) => s.id === segmentId);
  if (from === -1) return segments;

  const result = segments.slice();
  const [seg] = result.splice(from, 1);
  const to = Math.max(0, Math.min(toIndex, result.length));
  // Same slot — return the original array so React/Zustand skip the re-render
  if (to === from) return segments;

  result.splice(to, 0, seg);
  return result;
}

// ─── Trim ───────────────────────────────────────────────────────────────────

/**
 * Trim a segment's left edge (move sourceStart forward, shrinking it).
 *
 * @param {Array} segments - current segment list
 * @param {string} segmentId - ID of segment to trim
 * @param {number} newSourceStart - new source start time
 * @returns {Array} new segment list
 */
function trimSegmentLeft(segments, segmentId, newSourceStart) {
  return segments.map((seg) => {
    if (seg.id !== segmentId) return seg;

    // Clamp: can't go past sourceEnd minus minimum duration
    const clamped = Math.max(0, Math.min(newSourceStart, seg.sourceEnd - MIN_SEGMENT_DURATION));
    return { ...seg, sourceStart: clamped };
  });
}

/**
 * Trim a segment's right edge (move sourceEnd backward, shrinking it).
 *
 * @param {Array} segments - current segment list
 * @param {string} segmentId - ID of segment to trim
 * @param {number} newSourceEnd - new source end time
 * @returns {Array} new segment list
 */
function trimSegmentRight(segments, segmentId, newSourceEnd) {
  return segments.map((seg) => {
    if (seg.id !== segmentId) return seg;

    // Clamp: can't go before sourceStart plus minimum duration
    const clamped = Math.max(seg.sourceStart + MIN_SEGMENT_DURATION, newSourceEnd);
    return { ...seg, sourceEnd: clamped };
  });
}

/**
 * Trim both edges of a segment at once.
 */
function trimSegment(segments, segmentId, newSourceStart, newSourceEnd) {
  return segments.map((seg) => {
    if (seg.id !== segmentId) return seg;

    const clampedStart = Math.max(0, Math.min(newSourceStart, newSourceEnd - MIN_SEGMENT_DURATION));
    const clampedEnd = Math.max(clampedStart + MIN_SEGMENT_DURATION, newSourceEnd);
    return { ...seg, sourceStart: clampedStart, sourceEnd: clampedEnd };
  });
}

// ─── Extend ─────────────────────────────────────────────────────────────────

// Nearest segment boundary in SOURCE order — not array order. Once the list can
// be reordered, segment idx-1 / idx+1 is no longer necessarily the neighbouring
// stretch of footage, so clamping against it would either stop an extend early
// or let one segment eat into another's source range.
function _sourceBoundBefore(segments, idx) {
  const start = segments[idx].sourceStart;
  let bound = 0;
  for (let i = 0; i < segments.length; i++) {
    if (i === idx) continue;
    const end = segments[i].sourceEnd;
    if (end <= start && end > bound) bound = end;
  }
  return bound;
}

function _sourceBoundAfter(segments, idx) {
  const end = segments[idx].sourceEnd;
  let bound = Infinity;
  for (let i = 0; i < segments.length; i++) {
    if (i === idx) continue;
    const start = segments[i].sourceStart;
    if (start >= end && start < bound) bound = start;
  }
  return bound;
}

/**
 * Extend a segment's left edge earlier into the source (move sourceStart backward).
 * Cannot extend past 0 or into another segment's source range.
 *
 * @param {Array} segments - current segment list
 * @param {string} segmentId - ID of segment to extend
 * @param {number} newSourceStart - desired new source start
 * @param {number} sourceDuration - total source file duration (upper bound)
 * @returns {Array} new segment list
 */
function extendSegmentLeft(segments, segmentId, newSourceStart, sourceDuration) {
  const idx = segments.findIndex((s) => s.id === segmentId);
  if (idx === -1) return segments;

  const seg = segments[idx];

  // Floor: can't go below 0, or into the nearest earlier segment's footage
  let clamped = Math.max(0, newSourceStart, _sourceBoundBefore(segments, idx));

  // Can't go past our own end
  clamped = Math.min(clamped, seg.sourceEnd - MIN_SEGMENT_DURATION);

  return segments.map((s, i) =>
    i === idx ? { ...s, sourceStart: clamped } : s
  );
}

/**
 * Extend a segment's right edge later into the source (move sourceEnd forward).
 * Cannot extend past sourceDuration or into another segment's source range.
 */
function extendSegmentRight(segments, segmentId, newSourceEnd, sourceDuration) {
  const idx = segments.findIndex((s) => s.id === segmentId);
  if (idx === -1) return segments;

  const seg = segments[idx];

  // Ceiling: source duration, or the nearest later segment's footage
  let clamped = Math.min(sourceDuration, newSourceEnd, _sourceBoundAfter(segments, idx));

  // Can't go before our own start
  clamped = Math.max(clamped, seg.sourceStart + MIN_SEGMENT_DURATION);

  return segments.map((s, i) =>
    i === idx ? { ...s, sourceEnd: clamped } : s
  );
}

// ─── Roll (move a cut) ──────────────────────────────────────────────────────

/**
 * Move the cut between a section and the one after it on the timeline (#352).
 * The left section's end and the right section's start shift by the SAME
 * amount, so the timeline keeps its total length and any gap between the two
 * in the source is preserved — the cut simply slides. Works whether or not the
 * two are continuous footage.
 *
 * Bounds: each side keeps MIN_SEGMENT_DURATION, the right start can't go below
 * 0, the left end can't pass the recording length. Deliberately NO clamp
 * against other sections' footage — repeating a moment is allowed (#351/#353).
 *
 * @param {Array} segments - current segment list
 * @param {string} leftId - the section BEFORE the cut
 * @param {number} deltaSec - how far to move the cut (+ later, − earlier)
 * @param {number} sourceDuration - recording length (upper bound); non-finite = unbounded
 * @returns {Array} new list, or the input unchanged when nothing moves
 */
function rollCut(segments, leftId, deltaSec, sourceDuration) {
  const i = segments.findIndex((s) => s.id === leftId);
  if (i === -1 || i + 1 >= segments.length) return segments;
  const left = segments[i];
  const right = segments[i + 1];

  const ceiling = Number.isFinite(sourceDuration) && sourceDuration > 0 ? sourceDuration : Infinity;
  const lo = Math.max(left.sourceStart + MIN_SEGMENT_DURATION - left.sourceEnd, -right.sourceStart);
  const hi = Math.min(right.sourceEnd - MIN_SEGMENT_DURATION - right.sourceStart, ceiling - left.sourceEnd);
  const dt = Math.max(lo, Math.min(hi, deltaSec));
  if (dt === 0) return segments;

  return segments.map((s, k) => {
    if (k === i) return { ...s, sourceEnd: left.sourceEnd + dt };
    if (k === i + 1) return { ...s, sourceStart: right.sourceStart + dt };
    return s;
  });
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Validate an entire segment list.
 * Returns true if all segments are valid and non-overlapping in source time.
 */
function validateSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return false;

  for (let i = 0; i < segments.length; i++) {
    if (!isValidSegment(segments[i])) return false;
    if (segmentDuration(segments[i]) < MIN_SEGMENT_DURATION) return false;
  }

  return true;
}

/**
 * Find which segment contains a given source time.
 * Returns the segment and its index, or null.
 */
function findSegmentAtSource(segments, sourceTime) {
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (sourceTime >= seg.sourceStart && sourceTime <= seg.sourceEnd) {
      return { segment: seg, index: i };
    }
  }
  return null;
}

module.exports = {
  splitAtSource,
  splitAtTimeline,
  deleteSegment,
  moveSegment,
  trimSegmentLeft,
  trimSegmentRight,
  trimSegment,
  extendSegmentLeft,
  extendSegmentRight,
  rollCut,
  validateSegments,
  findSegmentAtSource,
  MIN_SEGMENT_DURATION,
};
