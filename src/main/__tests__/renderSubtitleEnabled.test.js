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
  });
});
