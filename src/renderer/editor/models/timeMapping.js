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
function sourceToTimeline(sourceTime, segments) {
  let timelineOffset = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (sourceTime >= seg.sourceStart && sourceTime <= seg.sourceEnd) {
      return {
        timelineTime: timelineOffset + (sourceTime - seg.sourceStart),
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
 * Get timeline start/end for a specific segment by index.
 */
function getSegmentTimelineRange(segments, index) {
  let start = 0;
  for (let i = 0; i < index && i < segments.length; i++) {
    start += segmentDuration(segments[i]);
  }
  const seg = segments[index];
  return seg
    ? { start, end: start + segmentDuration(seg) }
    : { start: 0, end: 0 };
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

    // Check if this word overlaps any segment
    const mapped = sourceToTimeline(wStart, segments);
    if (mapped.found) {
      const mappedEnd = sourceToTimeline(wEnd, segments);
      result.push({
        ...word,
        timelineStart: mapped.timelineTime,
        timelineEnd: mappedEnd.found
          ? mappedEnd.timelineTime
          : mapped.timelineTime + (wEnd - wStart), // fallback: preserve duration
      });
    }
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

    // Map the segment's start to timeline
    const startMap = sourceToTimeline(sub.startSec, nleSegments);
    if (!startMap.found) continue; // entire segment is in a deleted region

    const endMap = sourceToTimeline(sub.endSec, nleSegments);
    const timelineEnd = endMap.found
      ? endMap.timelineTime
      : startMap.timelineTime + (sub.endSec - sub.startSec);

    // Map words
    const mappedWords = sub.words
      ? visibleWords(sub.words, nleSegments)
      : [];

    // Only include if at least one word is visible (or no words to check)
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
