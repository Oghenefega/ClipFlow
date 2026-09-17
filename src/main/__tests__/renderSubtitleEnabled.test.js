// #374: a subtitle line disabled in the editor must not reach the overlay on
// ANY render path. Before the fix only renderPayload.js (the editor's own
// Render button) filtered `enabled !== false`; resolveTimelineSubtitles carried
// the flag through untouched and the overlay page never checks it, so batch
// renders (Render All from Projects, render:batch) burned disabled lines in.
//
// Both subtitle sources are covered here, because they are separate branches:
//   1. clipData.subtitles as an array — already timeline-time, straight from disk
//   2. resolveClipSubtitles — source-absolute, then NLE-mapped
jest.mock("../subtitle-overlay-renderer", () => ({}));

const mockResolveClipSubtitles = jest.fn();
jest.mock("../../renderer/editor/utils/resolveSubtitles", () => ({
  // lineExtras stays REAL — it is the hop under test for per-line settings.
  ...jest.requireActual("../../renderer/editor/utils/resolveSubtitles"),
  resolveClipSubtitles: (...args) => mockResolveClipSubtitles(...args),
}));

const { resolveTimelineSubtitles } = require("../render");

// One section covering 0-30s, so source time == timeline time and the mapping
// step can't be what drops a segment.
const NLE = [{ id: "s1", sourceStart: 0, sourceEnd: 30 }];

const texts = (segs) => segs.map((s) => s.text);

describe("resolveTimelineSubtitles — #374 disabled lines", () => {
  beforeEach(() => mockResolveClipSubtitles.mockReset());

  describe("clipData.subtitles array (disk / batch path)", () => {
    const clip = {
      subtitles: [
        { startSec: 0, endSec: 1, text: "keep me", words: [] },
        { startSec: 1, endSec: 2, text: "drop me", enabled: false, words: [] },
        { startSec: 2, endSec: 3, text: "keep me too", enabled: true, words: [] },
      ],
    };

    test("drops only the explicitly disabled segment", () => {
      const out = resolveTimelineSubtitles(clip, {}, true, NLE);
      expect(texts(out)).toEqual(["keep me", "keep me too"]);
    });

    test("a missing `enabled` key means enabled — absence is not disable", () => {
      const out = resolveTimelineSubtitles(clip, {}, true, NLE);
      expect(out.find((s) => s.text === "keep me")).toBeDefined();
    });

    test("does not mutate the clip it was handed", () => {
      const before = JSON.stringify(clip.subtitles);
      resolveTimelineSubtitles(clip, {}, true, NLE);
      expect(JSON.stringify(clip.subtitles)).toBe(before);
    });

    test("every segment disabled yields an empty array, not the unfiltered list", () => {
      const allOff = { subtitles: clip.subtitles.map((s) => ({ ...s, enabled: false })) };
      expect(resolveTimelineSubtitles(allOff, {}, true, NLE)).toEqual([]);
    });
  });

  describe("resolveClipSubtitles source (Render All / no editor payload)", () => {
    test("drops the disabled segment before NLE mapping", () => {
      mockResolveClipSubtitles.mockReturnValue({
        source: "test",
        segments: [
          { start: 0, end: 1, text: "keep me", words: [{ word: "keep", start: 0, end: 1 }] },
          { start: 1, end: 2, text: "drop me", enabled: false, words: [{ word: "drop", start: 1, end: 2 }] },
        ],
      });
      const out = resolveTimelineSubtitles({ startTime: 0 }, {}, true, NLE);
      expect(texts(out)).toEqual(["keep me"]);
    });

    test("also drops it on the legacy non-NLE path", () => {
      mockResolveClipSubtitles.mockReturnValue({
        source: "test",
        segments: [
          { start: 10, end: 11, text: "keep me", words: [] },
          { start: 11, end: 12, text: "drop me", enabled: false, words: [] },
        ],
      });
      const out = resolveTimelineSubtitles({ startTime: 10 }, {}, false, null);
      expect(texts(out)).toEqual(["keep me"]);
      // and the legacy path still shifts to clip-relative time
      expect(out[0].startSec).toBe(0);
    });

    // This branch rebuilds segments from named fields, so a per-line setting
    // that isn't carried explicitly never reaches the overlay — Render All would
    // export a moved line (#431) at the shared position while the editor shows
    // it moved.
    test("a line's own position survives to the overlay, on both time paths", () => {
      const segments = [
        { start: 0, end: 1, text: "moved", yPercent: 30, words: [{ word: "moved", start: 0, end: 1 }] },
        { start: 1, end: 2, text: "shared", words: [{ word: "shared", start: 1, end: 2 }] },
      ];
      mockResolveClipSubtitles.mockReturnValue({ source: "test", segments });
      const nle = resolveTimelineSubtitles({ startTime: 0 }, {}, true, NLE);
      expect(nle.map((s) => s.yPercent)).toEqual([30, undefined]);
      expect("yPercent" in nle[1]).toBe(false);
      const legacy = resolveTimelineSubtitles({ startTime: 0 }, {}, false, null);
      expect(legacy.map((s) => s.yPercent)).toEqual([30, undefined]);
    });

    // #435: a section's own subtitle position lives on the section, so on a
    // batch render it only reaches the overlay through the NLE mapping.
    test("a section's subtitle position reaches the lines that show in it", () => {
      const segments = [
        { start: 0, end: 1, text: "first", words: [{ word: "first", start: 0, end: 1 }] },
        { start: 16, end: 17, text: "second", words: [{ word: "second", start: 16, end: 17 }] },
      ];
      mockResolveClipSubtitles.mockReturnValue({ source: "test", segments });
      const twoSections = [
        { id: "s1", sourceStart: 0, sourceEnd: 15 },
        { id: "s2", sourceStart: 15, sourceEnd: 30, subYPercent: 35 },
      ];
      const out = resolveTimelineSubtitles({ startTime: 0 }, {}, true, twoSections);
      expect(out.map((s) => s.sectionYPercent)).toEqual([undefined, 35]);
    });
  });
});
