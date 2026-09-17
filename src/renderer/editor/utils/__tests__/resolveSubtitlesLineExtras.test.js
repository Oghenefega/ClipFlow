// Per-line settings (#296 enabled, #426 caps) must survive the REAL resolver —
// it rebuilds every segment from named fields at three hops, and a setting that
// is not carried at each one is silently dropped between the project file and
// the preview/export. Driven with an editor-saved clip, unmocked, because a
// fixture that hand-carries the field past the resolver assumes the answer (#374).
const { resolveClipSubtitles, lineExtras } = require("../resolveSubtitles");

const word = (w, start, end) => ({ word: w, start, end, probability: 1 });

function savedClip(sub1) {
  return {
    id: "clip_test",
    startTime: 100,
    endTime: 110,
    subtitles: { sub1, sub2: [], _format: "source-absolute" },
  };
}

describe("lineExtras", () => {
  test("carries only what the line actually set", () => {
    expect(lineExtras({ text: "x" })).toEqual({});
    expect(lineExtras({ enabled: true, caps: undefined })).toEqual({});
    expect(lineExtras({ enabled: false })).toEqual({ enabled: false });
    expect(lineExtras({ caps: true })).toEqual({ caps: true });
    // false is a real setting: "as typed" inside an ALL CAPS subtitle style
    expect(lineExtras({ caps: false })).toEqual({ caps: false });
  });
});

describe("resolveClipSubtitles keeps per-line settings from an editor-saved clip", () => {
  const clip = savedClip([
    { id: 1, startSec: 100, endSec: 101, text: "what a play", caps: true,
      words: [word("what", 100, 100.3), word("a", 100.3, 100.5), word("play", 100.5, 101)] },
    { id: 2, startSec: 101, endSec: 102, text: "by Asuna", caps: false,
      words: [word("by", 101, 101.4), word("Asuna", 101.4, 102)] },
    { id: 3, startSec: 102, endSec: 103, text: "no setting",
      words: [word("no", 102, 102.5), word("setting", 102.5, 103)] },
    { id: 4, startSec: 103, endSec: 104, text: "switched off", enabled: false, caps: true,
      words: [word("switched", 103, 103.5), word("off", 103.5, 104)] },
  ]);

  const { segments, source } = resolveClipSubtitles(clip, {}, { includeExtras: false });

  test("the clip resolved from its saved subtitles", () => {
    expect(source).not.toBeNull();
    expect(segments.map((s) => s.text)).toEqual(["what a play", "by Asuna", "no setting", "switched off"]);
  });

  test("caps: true, false and absent all come through as written", () => {
    expect(segments.map((s) => s.caps)).toEqual([true, false, undefined, true]);
    expect("caps" in segments[2]).toBe(false);
  });

  test("the spelling is untouched — caps are drawn, not typed", () => {
    expect(segments[0].words.map((w) => w.word)).toEqual(["what", "a", "play"]);
    expect(segments[1].words.map((w) => w.word)).toEqual(["by", "Asuna"]);
  });

  test("a switched-off line keeps both of its settings", () => {
    expect(segments[3].enabled).toBe(false);
    expect(segments[3].caps).toBe(true);
  });
});
