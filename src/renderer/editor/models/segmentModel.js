/**
 * segmentModel.js — NLE Segment Data Model
 *
 * Core primitive for non-destructive editing. A segment is a window into
 * the source recording. The timeline is the ordered concatenation of segments.
 *
 * Timeline position is ALWAYS DERIVED from the segment list — never stored.
 *
 * Segment shape:
 *   {
 *     id: string,           // unique identifier, e.g. "seg-<nanoid>"
 *     sourceStart: number,  // seconds into source file where this segment begins
 *     sourceEnd: number,    // seconds into source file where this segment ends
 *   }
 *
 * Subtitle words reference SOURCE TIME directly. Their timeline positions
 * are derived by mapping through the segment list via timeMapping.js.
 */

let _counter = 0;

/**
 * Create a new segment with a unique ID.
 */
function createSegment(sourceStart, sourceEnd, id) {
  return {
    id: id || `seg-${Date.now()}-${++_counter}`,
    sourceStart,
    sourceEnd,
  };
}

/**
 * Create initial segment list for a clip (single segment spanning full range).
 */
function createInitialSegments(sourceStart, sourceEnd) {
  return [createSegment(sourceStart, sourceEnd, "seg-initial")];
}

/**
 * Get duration of a single segment.
 */
function segmentDuration(seg) {
  return seg.sourceEnd - seg.sourceStart;
}

/**
 * Validate a segment (positive duration, valid bounds).
 */
function isValidSegment(seg) {
  if (!seg) return false;
  return (
    typeof seg.sourceStart === "number" &&
    typeof seg.sourceEnd === "number" &&
    seg.sourceEnd > seg.sourceStart &&
    seg.sourceStart >= 0
  );
}

/**
 * Deep clone a segment list (for undo snapshots).
 */
function cloneSegments(segments) {
  return segments.map((s) => ({ ...s }));
}

module.exports = {
  createSegment,
  createInitialSegments,
  segmentDuration,
  isValidSegment,
  cloneSegments,
};
