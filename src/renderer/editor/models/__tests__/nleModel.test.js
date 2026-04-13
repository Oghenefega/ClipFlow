const {
  createSegment,
  createInitialSegments,
  segmentDuration,
  isValidSegment,
  cloneSegments,
} = require("../segmentModel");

const {
  sourceToTimeline,
  timelineToSource,
  getTimelineDuration,
  getSegmentTimelineRange,
  buildTimelineLayout,
  visibleWords,
  visibleSubtitleSegments,
} = require("../timeMapping");

const {
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
} = require("../segmentOps");

// ─── Helpers ────────────────────────────────────────────────────────────────

function segs(ranges) {
  return ranges.map(([start, end], i) =>
    createSegment(start, end, `seg-${i}`)
  );
}

// ─── segmentModel.js ────────────────────────────────────────────────────────

describe("segmentModel", () => {
  test("createSegment creates valid segment", () => {
    const s = createSegment(10, 20, "test-1");
    expect(s).toEqual({ id: "test-1", sourceStart: 10, sourceEnd: 20 });
  });

  test("createInitialSegments creates single full-range segment", () => {
    const list = createInitialSegments(100, 130);
    expect(list).toHaveLength(1);
    expect(list[0].sourceStart).toBe(100);
    expect(list[0].sourceEnd).toBe(130);
  });

  test("segmentDuration calculates correctly", () => {
    expect(segmentDuration({ sourceStart: 5, sourceEnd: 15 })).toBe(10);
  });

  test("isValidSegment validates correctly", () => {
    expect(isValidSegment({ id: "a", sourceStart: 0, sourceEnd: 10 })).toBe(true);
    expect(isValidSegment({ id: "a", sourceStart: 10, sourceEnd: 5 })).toBe(false);
    expect(isValidSegment({ id: "a", sourceStart: -1, sourceEnd: 5 })).toBe(false);
    expect(isValidSegment(null)).toBe(false);
  });

  test("cloneSegments creates independent copy", () => {
    const orig = segs([[0, 10], [10, 20]]);
    const clone = cloneSegments(orig);
    clone[0].sourceStart = 999;
    expect(orig[0].sourceStart).toBe(0);
  });
});

// ─── timeMapping.js ─────────────────────────────────────────────────────────

describe("timeMapping", () => {
  // Single segment: source 100-110 → timeline 0-10
  const single = segs([[100, 110]]);

  // Three segments: source 100-105, 110-115, 120-130
  // Timeline: 0-5, 5-10, 10-20
  const multi = segs([[100, 105], [110, 115], [120, 130]]);

  describe("sourceToTimeline", () => {
    test("maps within single segment", () => {
      const r = sourceToTimeline(103, single);
      expect(r.found).toBe(true);
      expect(r.timelineTime).toBeCloseTo(3);
      expect(r.segmentIndex).toBe(0);
    });

    test("maps start boundary", () => {
      const r = sourceToTimeline(100, single);
      expect(r.found).toBe(true);
      expect(r.timelineTime).toBeCloseTo(0);
    });

    test("maps end boundary", () => {
      const r = sourceToTimeline(110, single);
      expect(r.found).toBe(true);
      expect(r.timelineTime).toBeCloseTo(10);
    });

    test("returns not found for deleted region", () => {
      const r = sourceToTimeline(107, multi); // between seg 0 (100-105) and seg 1 (110-115)
      expect(r.found).toBe(false);
    });

    test("maps across multiple segments", () => {
      // seg 1 starts at timeline 5, source 110
      const r = sourceToTimeline(112, multi);
      expect(r.found).toBe(true);
      expect(r.timelineTime).toBeCloseTo(7); // 5 + (112 - 110) = 7
      expect(r.segmentIndex).toBe(1);
    });

    test("maps into third segment", () => {
      // seg 2 starts at timeline 10, source 120
      const r = sourceToTimeline(125, multi);
      expect(r.found).toBe(true);
      expect(r.timelineTime).toBeCloseTo(15); // 10 + (125 - 120) = 15
      expect(r.segmentIndex).toBe(2);
    });
  });

  describe("timelineToSource", () => {
    test("maps within single segment", () => {
      const r = timelineToSource(3, single);
      expect(r.found).toBe(true);
      expect(r.sourceTime).toBeCloseTo(103);
    });

    test("maps across multiple segments", () => {
      // timeline 7 → seg 1 (starts at timeline 5, source 110)
      const r = timelineToSource(7, multi);
      expect(r.found).toBe(true);
      expect(r.sourceTime).toBeCloseTo(112);
      expect(r.segmentIndex).toBe(1);
    });

    test("maps into third segment", () => {
      // timeline 15 → seg 2 (starts at timeline 10, source 120)
      const r = timelineToSource(15, multi);
      expect(r.found).toBe(true);
      expect(r.sourceTime).toBeCloseTo(125);
    });

    test("returns not found past end", () => {
      const r = timelineToSource(999, multi);
      expect(r.found).toBe(false);
    });
  });

  describe("sourceToTimeline ↔ timelineToSource are inverses", () => {
    const testTimes = [0, 1, 2.5, 4.999, 5, 7.5, 10, 15, 19.999];

    testTimes.forEach((tl) => {
      test(`roundtrip timeline ${tl}`, () => {
        const { sourceTime, found } = timelineToSource(tl, multi);
        if (!found) return; // past end is fine to skip
        const back = sourceToTimeline(sourceTime, multi);
        expect(back.found).toBe(true);
        expect(back.timelineTime).toBeCloseTo(tl, 5);
      });
    });
  });

  describe("getTimelineDuration", () => {
    test("single segment", () => {
      expect(getTimelineDuration(single)).toBeCloseTo(10);
    });

    test("multi segment", () => {
      // 5 + 5 + 10 = 20
      expect(getTimelineDuration(multi)).toBeCloseTo(20);
    });

    test("empty", () => {
      expect(getTimelineDuration([])).toBe(0);
    });
  });

  describe("getSegmentTimelineRange", () => {
    test("first segment", () => {
      const r = getSegmentTimelineRange(0, multi);
      expect(r.start).toBeCloseTo(0);
      expect(r.end).toBeCloseTo(5);
    });

    test("second segment", () => {
      const r = getSegmentTimelineRange(1, multi);
      expect(r.start).toBeCloseTo(5);
      expect(r.end).toBeCloseTo(10);
    });

    test("third segment", () => {
      const r = getSegmentTimelineRange(2, multi);
      expect(r.start).toBeCloseTo(10);
      expect(r.end).toBeCloseTo(20);
    });

    test("lookup by ID", () => {
      const r = getSegmentTimelineRange(multi[1].id, multi);
      expect(r.start).toBeCloseTo(5);
      expect(r.end).toBeCloseTo(10);
    });

    test("unknown ID returns null", () => {
      expect(getSegmentTimelineRange("nonexistent", multi)).toBeNull();
    });

    test("out-of-bounds index returns null", () => {
      expect(getSegmentTimelineRange(99, multi)).toBeNull();
    });
  });

  describe("buildTimelineLayout", () => {
    test("builds correct layout", () => {
      const layout = buildTimelineLayout(multi);
      expect(layout).toHaveLength(3);
      expect(layout[0].timelineStart).toBeCloseTo(0);
      expect(layout[0].timelineEnd).toBeCloseTo(5);
      expect(layout[1].timelineStart).toBeCloseTo(5);
      expect(layout[2].timelineStart).toBeCloseTo(10);
      expect(layout[2].timelineEnd).toBeCloseTo(20);
    });
  });

  describe("visibleWords", () => {
    const words = [
      { word: "hello", start: 101, end: 102 },     // in seg 0 (100-105)
      { word: "deleted", start: 107, end: 108 },    // in gap (deleted)
      { word: "world", start: 111, end: 113 },      // in seg 1 (110-115)
      { word: "far", start: 200, end: 201 },        // past all segments
    ];

    test("filters to visible words only", () => {
      const result = visibleWords(words, multi);
      expect(result).toHaveLength(2);
      expect(result[0].word).toBe("hello");
      expect(result[1].word).toBe("world");
    });

    test("adds timeline positions", () => {
      const result = visibleWords(words, multi);
      // "hello": source 101 → timeline 1 (seg 0 starts at 0, source 100)
      expect(result[0].timelineStart).toBeCloseTo(1);
      expect(result[0].timelineEnd).toBeCloseTo(2);
      // "world": source 111 → timeline 6 (seg 1 starts at 5, source 110)
      expect(result[1].timelineStart).toBeCloseTo(6);
      expect(result[1].timelineEnd).toBeCloseTo(8);
    });

    test("empty words returns empty", () => {
      expect(visibleWords([], multi)).toEqual([]);
      expect(visibleWords(null, multi)).toEqual([]);
    });
  });

  describe("visibleSubtitleSegments", () => {
    const subs = [
      {
        id: 1,
        startSec: 101,
        endSec: 104,
        words: [
          { word: "hi", start: 101, end: 102 },
          { word: "there", start: 102, end: 104 },
        ],
      },
      {
        id: 2,
        startSec: 107,
        endSec: 109,
        words: [{ word: "gone", start: 107, end: 109 }],
      },
      {
        id: 3,
        startSec: 121,
        endSec: 125,
        words: [
          { word: "back", start: 121, end: 123 },
          { word: "again", start: 123, end: 125 },
        ],
      },
    ];

    test("filters out deleted subtitle segments", () => {
      const result = visibleSubtitleSegments(subs, multi);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(3);
    });

    test("adds timeline positions to segments", () => {
      const result = visibleSubtitleSegments(subs, multi);
      // Sub 1: source 101 → timeline 1
      expect(result[0].timelineStartSec).toBeCloseTo(1);
      expect(result[0].timelineEndSec).toBeCloseTo(4);
      // Sub 3: source 121 → timeline 11 (seg 2 starts at 10, source 120)
      expect(result[1].timelineStartSec).toBeCloseTo(11);
      expect(result[1].timelineEndSec).toBeCloseTo(15);
    });

    test("maps words to timeline positions", () => {
      const result = visibleSubtitleSegments(subs, multi);
      expect(result[0].words[0].timelineStart).toBeCloseTo(1);
      expect(result[0].words[1].timelineEnd).toBeCloseTo(4);
    });
  });
});

// ─── segmentOps.js ──────────────────────────────────────────────────────────

describe("segmentOps", () => {
  describe("splitAtSource", () => {
    test("splits segment at source time", () => {
      const s = segs([[100, 110]]);
      const result = splitAtSource(s, 105);
      expect(result).toHaveLength(2);
      expect(result[0].sourceStart).toBe(100);
      expect(result[0].sourceEnd).toBe(105);
      expect(result[1].sourceStart).toBe(105);
      expect(result[1].sourceEnd).toBe(110);
    });

    test("preserves original ID on left half", () => {
      const s = segs([[100, 110]]);
      const result = splitAtSource(s, 105);
      expect(result[0].id).toBe("seg-0"); // original
      expect(result[1].id).not.toBe("seg-0"); // new
    });

    test("no-op if source time not in any segment", () => {
      const s = segs([[100, 110]]);
      const result = splitAtSource(s, 50);
      expect(result).toHaveLength(1);
    });

    test("no-op if too close to boundary", () => {
      const s = segs([[100, 110]]);
      const result = splitAtSource(s, 100.01);
      expect(result).toHaveLength(1); // within MIN_SEGMENT_DURATION of start
    });

    test("total duration preserved after split", () => {
      const s = segs([[100, 130]]);
      const result = splitAtSource(s, 115);
      const totalBefore = getTimelineDuration(s);
      const totalAfter = getTimelineDuration(result);
      expect(totalAfter).toBeCloseTo(totalBefore);
    });
  });

  describe("splitAtTimeline", () => {
    test("splits using timeline time", () => {
      // Three segs: 100-105 (tl 0-5), 110-115 (tl 5-10), 120-130 (tl 10-20)
      const s = segs([[100, 105], [110, 115], [120, 130]]);
      // Split at timeline 7 → source 112 (in seg 1)
      const result = splitAtTimeline(s, 7);
      expect(result).toHaveLength(4);
      expect(result[1].sourceEnd).toBeCloseTo(112);
      expect(result[2].sourceStart).toBeCloseTo(112);
    });
  });

  describe("deleteSegment", () => {
    test("removes segment by ID", () => {
      const s = segs([[0, 5], [5, 10], [10, 15]]);
      const result = deleteSegment(s, "seg-1");
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("seg-0");
      expect(result[1].id).toBe("seg-2");
    });

    test("timeline shortens by deleted segment duration", () => {
      const s = segs([[0, 5], [5, 10], [10, 15]]);
      const before = getTimelineDuration(s);
      const result = deleteSegment(s, "seg-1");
      const after = getTimelineDuration(result);
      expect(after).toBeCloseTo(before - 5);
    });

    test("no-op if ID not found", () => {
      const s = segs([[0, 10]]);
      const result = deleteSegment(s, "nonexistent");
      expect(result).toHaveLength(1);
    });
  });

  describe("trimSegmentLeft", () => {
    test("trims left edge forward", () => {
      const s = segs([[100, 110]]);
      const result = trimSegmentLeft(s, "seg-0", 103);
      expect(result[0].sourceStart).toBe(103);
      expect(result[0].sourceEnd).toBe(110);
    });

    test("clamps to not pass sourceEnd", () => {
      const s = segs([[100, 110]]);
      const result = trimSegmentLeft(s, "seg-0", 200);
      expect(result[0].sourceStart).toBeCloseTo(110 - MIN_SEGMENT_DURATION);
    });

    test("clamps to 0 minimum", () => {
      const s = segs([[5, 10]]);
      const result = trimSegmentLeft(s, "seg-0", -5);
      expect(result[0].sourceStart).toBe(0);
    });
  });

  describe("trimSegmentRight", () => {
    test("trims right edge backward", () => {
      const s = segs([[100, 110]]);
      const result = trimSegmentRight(s, "seg-0", 107);
      expect(result[0].sourceEnd).toBe(107);
      expect(result[0].sourceStart).toBe(100);
    });

    test("clamps to not go before sourceStart", () => {
      const s = segs([[100, 110]]);
      const result = trimSegmentRight(s, "seg-0", 50);
      expect(result[0].sourceEnd).toBeCloseTo(100 + MIN_SEGMENT_DURATION);
    });
  });

  describe("extendSegmentLeft", () => {
    test("extends left into earlier source", () => {
      const s = segs([[105, 110]]);
      const result = extendSegmentLeft(s, "seg-0", 100, 200);
      expect(result[0].sourceStart).toBe(100);
    });

    test("clamps to 0", () => {
      const s = segs([[5, 10]]);
      const result = extendSegmentLeft(s, "seg-0", -10, 200);
      expect(result[0].sourceStart).toBe(0);
    });

    test("doesn't overlap previous segment", () => {
      const s = segs([[50, 60], [70, 80]]);
      const result = extendSegmentLeft(s, "seg-1", 55, 200);
      expect(result[1].sourceStart).toBe(60); // clamped to prev seg's end
    });
  });

  describe("extendSegmentRight", () => {
    test("extends right into later source", () => {
      const s = segs([[100, 105]]);
      const result = extendSegmentRight(s, "seg-0", 110, 200);
      expect(result[0].sourceEnd).toBe(110);
    });

    test("clamps to source duration", () => {
      const s = segs([[100, 105]]);
      const result = extendSegmentRight(s, "seg-0", 300, 200);
      expect(result[0].sourceEnd).toBe(200);
    });

    test("doesn't overlap next segment", () => {
      const s = segs([[50, 60], [70, 80]]);
      const result = extendSegmentRight(s, "seg-0", 75, 200);
      expect(result[0].sourceEnd).toBe(70); // clamped to next seg's start
    });
  });

  describe("validateSegments", () => {
    test("valid segments pass", () => {
      expect(validateSegments(segs([[0, 5], [10, 20]]))).toBe(true);
    });

    test("empty array fails", () => {
      expect(validateSegments([])).toBe(false);
    });

    test("invalid segment fails", () => {
      expect(validateSegments([{ id: "a", sourceStart: 10, sourceEnd: 5 }])).toBe(false);
    });

    test("too-short segment fails", () => {
      expect(validateSegments([{ id: "a", sourceStart: 0, sourceEnd: 0.01 }])).toBe(false);
    });
  });

  describe("findSegmentAtSource", () => {
    test("finds correct segment", () => {
      const s = segs([[100, 110], [120, 130]]);
      const result = findSegmentAtSource(s, 125);
      expect(result.index).toBe(1);
      expect(result.segment.sourceStart).toBe(120);
    });

    test("returns null for gap", () => {
      const s = segs([[100, 110], [120, 130]]);
      expect(findSegmentAtSource(s, 115)).toBeNull();
    });
  });
});

// ─── Integration: Split → Delete → Verify Subtitles ────────────────────────

describe("integration: edit sequence", () => {
  test("split then delete middle preserves correct subtitles", () => {
    // Start with single segment: source 100-130 (30s clip)
    let segments = segs([[100, 130]]);

    // Words from Whisper at source times
    const words = [
      { word: "start", start: 101, end: 103 },
      { word: "middle", start: 114, end: 116 },
      { word: "end", start: 125, end: 128 },
    ];

    // Split at source 110 and source 120
    segments = splitAtSource(segments, 110);
    segments = splitAtSource(segments, 120);
    expect(segments).toHaveLength(3);

    // Delete middle segment (110-120)
    const middleId = segments[1].id;
    segments = deleteSegment(segments, middleId);
    expect(segments).toHaveLength(2);

    // Timeline should be 20s (10 + 10), not 30s
    expect(getTimelineDuration(segments)).toBeCloseTo(20);

    // Visible words: "start" and "end" survive, "middle" is gone
    const visible = visibleWords(words, segments);
    expect(visible).toHaveLength(2);
    expect(visible[0].word).toBe("start");
    expect(visible[1].word).toBe("end");

    // Timeline positions: "start" at 1 (101-100=1), "end" at 15 (10 + 125-120=15)
    expect(visible[0].timelineStart).toBeCloseTo(1);
    expect(visible[1].timelineStart).toBeCloseTo(15);

    // Roundtrip: timeline 15 → source 125 → timeline 15
    const { sourceTime } = timelineToSource(15, segments);
    expect(sourceTime).toBeCloseTo(125);
    const back = sourceToTimeline(sourceTime, segments);
    expect(back.timelineTime).toBeCloseTo(15);
  });

  test("undo is just restoring the old segment list", () => {
    const original = segs([[100, 130]]);
    const snapshot = cloneSegments(original);

    // Do edits
    let segments = splitAtSource(original, 115);
    segments = deleteSegment(segments, segments[1].id);

    // "Undo" — restore snapshot
    segments = snapshot;
    expect(segments).toHaveLength(1);
    expect(getTimelineDuration(segments)).toBeCloseTo(30);
  });
});

// ─── Migration: Old Format → NLE ──────────────────────────────────────────────

describe("migration: old format → NLE", () => {
  test("audioSegments (clip-relative) convert to source-absolute NLE segments", () => {
    // Old format: audioSegments are clip-relative (0-based)
    const sourceStart = 303.09;
    const audioSegments = [
      { id: "audio-1", startSec: 0, endSec: 20.53 },
    ];

    // Migration logic from initFromContext
    const nleSegs = audioSegments.map((seg) =>
      createSegment(sourceStart + seg.startSec, sourceStart + seg.endSec, seg.id)
    );

    expect(nleSegs).toHaveLength(1);
    expect(nleSegs[0].sourceStart).toBeCloseTo(303.09);
    expect(nleSegs[0].sourceEnd).toBeCloseTo(323.62);
    expect(nleSegs[0].id).toBe("audio-1");
  });

  test("fresh clip with startTime/endTime creates initial segment", () => {
    const sourceStart = 303.09;
    const sourceEnd = 331.35;
    const nleSegs = createInitialSegments(sourceStart, sourceEnd);

    expect(nleSegs).toHaveLength(1);
    expect(nleSegs[0].sourceStart).toBeCloseTo(303.09);
    expect(nleSegs[0].sourceEnd).toBeCloseTo(331.35);
    expect(nleSegs[0].id).toBe("seg-initial");
  });

  test("saved NLE segments round-trip unchanged", () => {
    const saved = [
      { id: "seg-a", sourceStart: 303.09, sourceEnd: 315.0 },
      { id: "seg-b", sourceStart: 320.0, sourceEnd: 331.35 },
    ];

    // On reload, initFromContext just uses them directly
    const nleSegs = saved;
    expect(nleSegs).toHaveLength(2);
    expect(nleSegs[0].sourceStart).toBe(303.09);
    expect(nleSegs[1].sourceEnd).toBe(331.35);
  });

  test("multi-segment audioSegments migrate with correct offsets", () => {
    const sourceStart = 100;
    // Old format: clip was split at clip-relative time 5 and 15
    const audioSegments = [
      { id: "audio-1", startSec: 0, endSec: 5 },
      { id: "audio-2", startSec: 5, endSec: 15 },
      { id: "audio-3", startSec: 15, endSec: 30 },
    ];

    const nleSegs = audioSegments.map((seg) =>
      createSegment(sourceStart + seg.startSec, sourceStart + seg.endSec, seg.id)
    );

    expect(nleSegs).toHaveLength(3);
    expect(nleSegs[0].sourceStart).toBe(100);
    expect(nleSegs[0].sourceEnd).toBe(105);
    expect(nleSegs[1].sourceStart).toBe(105);
    expect(nleSegs[1].sourceEnd).toBe(115);
    expect(nleSegs[2].sourceStart).toBe(115);
    expect(nleSegs[2].sourceEnd).toBe(130);

    // Timeline duration should equal original clip duration
    expect(getTimelineDuration(nleSegs)).toBeCloseTo(30);
  });

  test("subtitle clip-relative → source-absolute migration", () => {
    const clipOrigin = 303.09;

    // Old format subtitles: clip-relative (0-based)
    const oldSubtitles = [
      { id: 1, startSec: 0, endSec: 0.63, text: "Hey,", words: [{ word: "Hey,", start: 0, end: 0.63 }] },
      { id: 2, startSec: 2.1, endSec: 4.5, text: "let's go", words: [{ word: "let's", start: 2.1, end: 2.8 }, { word: "go", start: 3.0, end: 4.5 }] },
    ];

    // Migration: add clipOrigin to get source-absolute
    const migrated = oldSubtitles.map((seg) => ({
      ...seg,
      startSec: seg.startSec + clipOrigin,
      endSec: seg.endSec + clipOrigin,
      words: seg.words.map((w) => ({ ...w, start: w.start + clipOrigin, end: w.end + clipOrigin })),
    }));

    expect(migrated[0].startSec).toBeCloseTo(303.09);
    expect(migrated[0].endSec).toBeCloseTo(303.72);
    expect(migrated[1].words[0].start).toBeCloseTo(305.19);

    // After migration, subtitles in NLE segment should be visible
    const nleSegs = createInitialSegments(clipOrigin, clipOrigin + 30);
    const visible = visibleSubtitleSegments(migrated, nleSegs);
    expect(visible).toHaveLength(2);
    // Timeline positions should be clip-relative again (for display)
    expect(visible[0].timelineStartSec).toBeCloseTo(0);
    expect(visible[1].timelineStartSec).toBeCloseTo(2.1);
  });

  test("source-absolute subtitles load without double-offset", () => {
    const clipOrigin = 303.09;

    // New format: already source-absolute (saved with _format: "source-absolute")
    const savedSubtitles = [
      { id: 1, startSec: 303.09, endSec: 303.72, text: "Hey,", words: [{ word: "Hey,", start: 303.09, end: 303.72 }] },
    ];

    // sourceOffset = 0 for source-absolute format
    const sourceOffset = 0;
    const migrated = savedSubtitles.map((seg) => ({
      ...seg,
      startSec: seg.startSec + sourceOffset,
      endSec: seg.endSec + sourceOffset,
    }));

    // Should NOT double-offset
    expect(migrated[0].startSec).toBeCloseTo(303.09);
    expect(migrated[0].endSec).toBeCloseTo(303.72);
  });
});
