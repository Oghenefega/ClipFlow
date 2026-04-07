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
      // Bisect: left half keeps original ID, right half gets new ID
      result.push(createSegment(seg.sourceStart, sourceTime, seg.id));
      result.push(createSegment(sourceTime, seg.sourceEnd));
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

/**
 * Extend a segment's left edge earlier into the source (move sourceStart backward).
 * Cannot extend past 0 or into the previous segment's source range.
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

  // Floor: can't go below 0
  let clamped = Math.max(0, newSourceStart);

  // Don't overlap with previous segment's source range
  // (In a simple model, segments shouldn't overlap in source time)
  if (idx > 0) {
    const prevEnd = segments[idx - 1].sourceEnd;
    // Allow extending up to the previous segment's end but no further
    // This prevents source-time overlap
    clamped = Math.max(clamped, prevEnd);
  }

  // Can't go past our own end
  clamped = Math.min(clamped, seg.sourceEnd - MIN_SEGMENT_DURATION);

  return segments.map((s, i) =>
    i === idx ? { ...s, sourceStart: clamped } : s
  );
}

/**
 * Extend a segment's right edge later into the source (move sourceEnd forward).
 * Cannot extend past sourceDuration or into the next segment's source range.
 */
function extendSegmentRight(segments, segmentId, newSourceEnd, sourceDuration) {
  const idx = segments.findIndex((s) => s.id === segmentId);
  if (idx === -1) return segments;

  const seg = segments[idx];

  // Ceiling: can't go past source duration
  let clamped = Math.min(sourceDuration, newSourceEnd);

  // Don't overlap with next segment's source range
  if (idx < segments.length - 1) {
    const nextStart = segments[idx + 1].sourceStart;
    clamped = Math.min(clamped, nextStart);
  }

  // Can't go before our own start
  clamped = Math.max(clamped, seg.sourceStart + MIN_SEGMENT_DURATION);

  return segments.map((s, i) =>
    i === idx ? { ...s, sourceEnd: clamped } : s
  );
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
  trimSegmentLeft,
  trimSegmentRight,
  trimSegment,
  extendSegmentLeft,
  extendSegmentRight,
  validateSegments,
  findSegmentAtSource,
  MIN_SEGMENT_DURATION,
};
