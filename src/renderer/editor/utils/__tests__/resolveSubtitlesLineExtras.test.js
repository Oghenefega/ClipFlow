// Per-line settings (#296 enabled, #431 yPercent) must survive the REAL resolver —
// it rebuilds every segment from named fields at three hops, and a setting that
// is not carried at each one is silently dropped between the project file and
// the preview/export. Driven with an editor-saved clip, unmocked, because a
// fixture that hand-carries the field past the resolver assumes the answer (#374).
const { resolveClipSubtitles, lineExtras, carryLineExtras } = require("../resolveSubtitles");

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
    expect(lineExtras({ enabled: true })).toEqual({});
    expect(lineExtras({ enabled: false })).toEqual({ enabled: false });
    // #433: casing is text now — a leftover 0.5.0-alpha.6 flag is not carried
    expect(lineExtras({ caps: true })).toEqual({});
  });

  test("#431: a line's own position rides along; anything that isn't a number does not", () => {
    expect(lineExtras({ yPercent: 42.5 })).toEqual({ yPercent: 42.5 });
    expect(lineExtras({ yPercent: 0 })).toEqual({ yPercent: 0 });
    expect(lineExtras({ yPercent: null })).toEqual({});
    expect(lineExtras({ yPercent: "42" })).toEqual({});
    expect(lineExtras({ yPercent: NaN })).toEqual({});
  });
});

// A grouping change (3 words <-> 1 word) rebuilds every line with a fresh id.
// The settings travel on the words (`_line`) and are read back per new line.
describe("carryLineExtras — settings across a subtitle grouping change", () => {
  const w = (word, _line) => ({ word, start: 0, end: 1, _line });

  test("3 words -> 1 word: every new line keeps its old line's settings", () => {
    const moved = { yPercent: 30 };
    expect(carryLineExtras([w("what", moved)])).toEqual({ yPercent: 30 });
    expect(carryLineExtras([w("plain", {})])).toEqual({});
  });

  test("1 word -> 3 words: position follows the first word", () => {
    const out = carryLineExtras([w("a", { yPercent: 30 }), w("b", {}), w("c", { yPercent: 70 })]);
    expect(out).toEqual({ yPercent: 30 });
  });

  test("a merged line is switched off only when EVERY word came from a switched-off line", () => {
    const off = { enabled: false };
    expect(carryLineExtras([w("a", off), w("b", off)])).toEqual({ enabled: false });
    // merging an off word into a visible line must never hide the visible words
    expect(carryLineExtras([w("a", off), w("b", {})])).toEqual({});
    expect(carryLineExtras([w("a", {}), w("b", off)])).toEqual({});
  });

  test("the old bug: a switched-off line re-chunked on its own stays off", () => {
    expect(carryLineExtras([w("hidden", { enabled: false, yPercent: 12 })])).toEqual({ enabled: false, yPercent: 12 });
  });

  test("words with no tag, and no words at all", () => {
    expect(carryLineExtras([{ word: "x" }])).toEqual({});
    expect(carryLineExtras([])).toEqual({});
    expect(carryLineExtras(undefined)).toEqual({});
  });
});

describe("resolveClipSubtitles keeps per-line settings from an editor-saved clip", () => {
  const clip = savedClip([
    { id: 1, startSec: 100, endSec: 101, text: "what a play", yPercent: 30,
      words: [word("what", 100, 100.3), word("a", 100.3, 100.5), word("play", 100.5, 101)] },
    { id: 2, startSec: 101, endSec: 102, text: "by CRYO",
      words: [word("by", 101, 101.4), { ...word("CRYO", 101.4, 102), orig: "Cryo" }] },
    { id: 3, startSec: 102, endSec: 103, text: "no setting",
      words: [word("no", 102, 102.5), word("setting", 102.5, 103)] },
    { id: 4, startSec: 103, endSec: 104, text: "switched off", enabled: false, yPercent: 12,
      words: [word("switched", 103, 103.5), word("off", 103.5, 104)] },
  ]);

  const { segments, source } = resolveClipSubtitles(clip, {}, { includeExtras: false });

  test("the clip resolved from its saved subtitles", () => {
    expect(source).not.toBeNull();
    expect(segments.map((s) => s.text)).toEqual(["what a play", "by CRYO", "no setting", "switched off"]);
  });

  test("a line's own position comes through as written, and only where it was set", () => {
    expect(segments.map((s) => s.yPercent)).toEqual([30, undefined, undefined, 12]);
    expect("yPercent" in segments[2]).toBe(false);
  });

  test("#433: a word's remembered spelling survives the reopen — the words are rebuilt from named fields here", () => {
    expect(segments[1].words.map((w) => [w.word, w.orig])).toEqual([["by", undefined], ["CRYO", "Cryo"]]);
    expect("orig" in segments[1].words[0]).toBe(false);
  });

  test("a switched-off line keeps both of its settings", () => {
    expect(segments[3].enabled).toBe(false);
    expect(segments[3].yPercent).toBe(12);
  });
});
