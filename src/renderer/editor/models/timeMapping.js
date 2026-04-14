/**
 * timeMapping.js — Coordinate conversion between source time and timeline time.
 *
 * The segment list defines which portions of the source file appear on the
 * timeline and in what order. Timeline position is always derived:
 *
 *   timelineStart(seg[i]) = sum of durations of seg[0..i-1]
 *
 * These functions are PURE — no side effects, no state. They take a segment
 * list and a time value, and return the mapped result.
 */

const { segmentDuration } = require("./segmentModel");

// ─── Source Time → Timeline Time ────────────────────────────────────────────

/**
 * Convert a source-file timestamp to a timeline position.
 *
 * Walks the segment list. If sourceTime falls within a segment, returns
 * the corresponding timeline position. If sourceTime is not in any segment
 * (it's in a deleted region), returns { timelineTime: -1, found: false }.
 *
 * @param {number} sourceTime - seconds in the source file
 * @param {Array} segments - ordered NLE segment list
 * @returns {{ timelineTime: number, found: boolean, segmentIndex: number }}
 */
// Floating-point tolerance (1ms) for segment-boundary comparisons. Without
// this, a vid.currentTime that is mathematically exactly at sourceStart can
// read as "outside" the segment due to FP error, producing infinite seek loops.
const BOUNDARY_EPS = 0.001;

function sourceToTimeline(sourceTime, segments) {
  let timelineOffset = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (sourceTime >= seg.sourceStart - BOUNDARY_EPS && sourceTime <= seg.sourceEnd + BOUNDARY_EPS) {
      const clamped = Math.max(seg.sourceStart, Math.min(seg.sourceEnd, sourceTime));
      return {
        timelineTime: timelineOffset + (clamped - seg.sourceStart),
        found: true,
        segmentIndex: i,
      };
    }
    timelineOffset += segmentDuration(seg);
  }

  return { timelineTime: -1, found: false, segmentIndex: -1 };
}

// ─── Timeline Time → Source Time ────────────────────────────────────────────

/**
 * Convert a timeline position back to a source-file timestamp.
 *
 * Accumulates segment durations until the target timeline position is found,
 * then computes sourceTime within that segment.
 *
 * @param {number} timelineTime - seconds on the editor timeline
 * @param {Array} segments - ordered NLE segment list
 * @returns {{ sourceTime: number, found: boolean, segmentIndex: number }}
 */
function timelineToSource(timelineTime, segments) {
  let accumulated = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const dur = segmentDuration(seg);

    if (timelineTime <= accumulated + dur) {
      const offset = timelineTime - accumulated;
      return {
        sourceTime: seg.sourceStart + offset,
        found: true,
        segmentIndex: i,
      };
    }
    accumulated += dur;
  }

  return { sourceTime: -1, found: false, segmentIndex: -1 };
}

// ─── Duration & Range ───────────────────────────────────────────────────────

/**
 * Total timeline duration (sum of all segment durations).
 */
function getTimelineDuration(segments) {
  let total = 0;
  for (let i = 0; i < segments.length; i++) {
    total += segmentDuration(segments[i]);
  }
  return total;
}

/**
 * Get timeline start/end for a specific segment by ID or index.
 *
 * @param {string|number} idOrIndex - segment ID string or numeric index
 * @param {Array} segments - ordered NLE segment list
 * @returns {{ start: number, end: number } | null}
 */
function getSegmentTimelineRange(idOrIndex, segments) {
  let index;
  if (typeof idOrIndex === "number") {
    index = idOrIndex;
  } else {
    // Find by ID
    index = segments.findIndex(s => s.id === idOrIndex);
    if (index === -1) return null;
  }
  let start = 0;
  for (let i = 0; i < index && i < segments.length; i++) {
    start += segmentDuration(segments[i]);
  }
  const seg = segments[index];
  return seg
    ? { start, end: start + segmentDuration(seg) }
    : null;
}

/**
 * Build a lookup array of { segmentIndex, timelineStart, timelineEnd }
 * for all segments. Useful for rendering the timeline.
 */
function buildTimelineLayout(segments) {
  const layout = [];
  let offset = 0;
  for (let i = 0; i < segments.length; i++) {
    const dur = segmentDuration(segments[i]);
    layout.push({
      segmentIndex: i,
      segment: segments[i],
      timelineStart: offset,
      timelineEnd: offset + dur,
    });
    offset += dur;
  }
  return layout;
}

// ─── Subtitle / Word Mapping ────────────────────────────────────────────────

/**
 * Given an array of source-time words, return only those visible on the
 * current timeline (i.e., their time range overlaps at least one segment),
 * augmented with timeline positions.
 *
 * @param {Array} words - [{ word, start, end, probability, ... }] in source time
 * @param {Array} segments - ordered NLE segment list
 * @returns {Array} visible words with added timelineStart / timelineEnd
 */
function visibleWords(words, segments) {
  if (!words || words.length === 0 || segments.length === 0) return [];

  const result = [];
  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    const wStart = word.start;
    const wEnd = word.end;

    let startMap = sourceToTimeline(wStart, segments);
    let endMap = sourceToTimeline(wEnd, segments);

    let effStart = wStart;
    let effEnd = wEnd;

    // Word should disappear only when trim has passed its END, not its START.
    // If start is trimmed away but end is still inside a segment, clamp start.
    if (!startMap.found && endMap.found) {
      const seg = segments[endMap.segmentIndex];
      effStart = seg.sourceStart;
      startMap = sourceToTimeline(effStart, segments);
    } else if (startMap.found && !endMap.found) {
      const seg = segments[startMap.segmentIndex];
      effEnd = seg.sourceEnd;
      endMap = sourceToTimeline(effEnd, segments);
    } else if (!startMap.found && !endMap.found) {
      // Both endpoints in deleted regions — only keep if word fully spans a kept segment
      const spanned = segments.find(
        (s) => s.sourceStart >= wStart && s.sourceEnd <= wEnd
      );
      if (!spanned) continue;
      effStart = spanned.sourceStart;
      effEnd = spanned.sourceEnd;
      startMap = sourceToTimeline(effStart, segments);
      endMap = sourceToTimeline(effEnd, segments);
    }

    if (!startMap.found) continue;

    result.push({
      ...word,
      timelineStart: startMap.timelineTime,
      timelineEnd: endMap.found
        ? endMap.timelineTime
        : startMap.timelineTime + (effEnd - effStart),
    });
  }
  return result;
}

/**
 * Map subtitle segments (with source-time startSec/endSec and words) through
 * the NLE segment list. Returns only visible segments with derived timeline
 * positions and per-word timeline timestamps.
 *
 * @param {Array} subtitleSegs - subtitle segments with source-time coordinates
 * @param {Array} nleSegments - ordered NLE segment list
 * @returns {Array} visible subtitle segments with timelineStartSec, timelineEndSec,
 *                  and per-word timelineStart/timelineEnd
 */
function visibleSubtitleSegments(subtitleSegs, nleSegments) {
  if (!subtitleSegs || subtitleSegs.length === 0 || nleSegments.length === 0) {
    return [];
  }

  const result = [];

  for (let i = 0; i < subtitleSegs.length; i++) {
    const sub = subtitleSegs[i];

    let startMap = sourceToTimeline(sub.startSec, nleSegments);
    let endMap = sourceToTimeline(sub.endSec, nleSegments);

    // Subtitle straddles a trim boundary — clamp to the kept overlap instead
    // of dropping. A subtitle should only disappear when no part of its
    // [startSec, endSec] overlaps any kept segment.
    let effStart = sub.startSec;
    let effEnd = sub.endSec;

    if (!startMap.found && endMap.found) {
      // Start trimmed away — clamp start to the segment that contains end
      const seg = nleSegments[endMap.segmentIndex];
      effStart = seg.sourceStart;
      startMap = sourceToTimeline(effStart, nleSegments);
    } else if (startMap.found && !endMap.found) {
      // End trimmed away — clamp end to the segment that contains start
      const seg = nleSegments[startMap.segmentIndex];
      effEnd = seg.sourceEnd;
      endMap = sourceToTimeline(effEnd, nleSegments);
    } else if (!startMap.found && !endMap.found) {
      // Both endpoints in deleted regions — check if subtitle spans across a
      // kept segment entirely. Find any segment fully inside [startSec, endSec].
      const spanned = nleSegments.find(
        (s) => s.sourceStart >= sub.startSec && s.sourceEnd <= sub.endSec
      );
      if (!spanned) continue; // no overlap — truly gone
      effStart = spanned.sourceStart;
      effEnd = spanned.sourceEnd;
      startMap = sourceToTimeline(effStart, nleSegments);
      endMap = sourceToTimeline(effEnd, nleSegments);
    }

    if (!startMap.found) continue; // safety net

    const timelineEnd = endMap.found
      ? endMap.timelineTime
      : startMap.timelineTime + (effEnd - effStart);

    // Map words (each word filtered individually — partial words drop normally)
    const mappedWords = sub.words
      ? visibleWords(sub.words, nleSegments)
      : [];

    // Include if any words remain, or if the sub has no word-level data
    if (mappedWords.length > 0 || !sub.words || sub.words.length === 0) {
      result.push({
        ...sub,
        timelineStartSec: startMap.timelineTime,
        timelineEndSec: timelineEnd,
        words: mappedWords,
      });
    }
  }

  return result;
}

module.exports = {
  sourceToTimeline,
  timelineToSource,
  getTimelineDuration,
  getSegmentTimelineRange,
  buildTimelineLayout,
  visibleWords,
  visibleSubtitleSegments,
};
