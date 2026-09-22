// #459: the words a re-transcribed stretch hands back, and when it counts as
// silence. retranscribe:ranges (main.js) is a thin shell around these.
const { paddedWindow, wordsForRange, isSilenceResult, RANGE_PAD_SEC } = require("../section-retranscribe");

describe("paddedWindow", () => {
  test("pads each side so a word the edge cuts through is heard whole", () => {
    expect(paddedWindow(100, 105, 1800)).toEqual({ extractStart: 100 - RANGE_PAD_SEC, extractEnd: 105 + RANGE_PAD_SEC });
  });
  test("never reaches outside the recording", () => {
    expect(paddedWindow(0.4, 3, 1800).extractStart).toBe(0);
    expect(paddedWindow(1795, 1799.5, 1800).extractEnd).toBe(1800);
    expect(paddedWindow(10, 12, 0).extractEnd).toBe(12 + RANGE_PAD_SEC); // unknown length: pad freely
  });
});

describe("wordsForRange", () => {
  // Audio was extracted from 99 s, so the engine's times are 0-based from there.
  const transcription = {
    segments: [
      { start: 0.2, end: 0.8, text: "before", words: [{ word: "before", start: 0.2, end: 0.8, probability: 0.9 }] },
      {
        start: 1.1, end: 3.0, text: "raiders are here",
        words: [
          { word: "ra", start: 1.1, end: 1.3, probability: 0.9 },
          { word: "iders", start: 1.3, end: 1.6, probability: 0.9 },
          { word: "are", start: 1.7, end: 2.0, probability: 0.9 },
          { word: "here", start: 2.1, end: 3.0, probability: 0.9 },
        ],
      },
      { start: 6.5, end: 6.9, text: "after", words: [{ word: "after", start: 6.5, end: 6.9, probability: 0.9 }] },
    ],
  };

  test("returns source-time words that reach into the range, cleaned like a fresh clip", () => {
    const words = wordsForRange(transcription, 99, 106, 100, 105);
    expect(words.map((w) => w.word)).toEqual(["raiders", "are", "here"]);
    expect(words[0].start).toBeCloseTo(100.1, 5);
    expect(words[words.length - 1].end).toBeCloseTo(102, 5);
  });

  test("a word straddling the range edge is included", () => {
    const words = wordsForRange(transcription, 99, 106, 99.5, 105);
    expect(words.map((w) => w.word)).toContain("before");
  });

  test("an empty transcription yields no words", () => {
    expect(wordsForRange({ segments: [] }, 99, 106, 100, 105)).toEqual([]);
  });
});

describe("isSilenceResult", () => {
  const words = (...ws) => ws.map((word, i) => ({ word, start: i, end: i + 0.5 }));
  test("nothing, or only Whisper's silence words, is silence", () => {
    expect(isSilenceResult([])).toBe(true);
    expect(isSilenceResult(words("you"))).toBe(true);
    expect(isSilenceResult(words("Thank", "you."))).toBe(true);
    expect(isSilenceResult(words("Thanks", "for", "watching!"))).toBe(true);
  });
  test("real speech is not", () => {
    expect(isSilenceResult(words("you", "guys", "are", "crazy"))).toBe(false);
    expect(isSilenceResult(words("go"))).toBe(false);
    expect(isSilenceResult(words("you", "you", "you", "you", "you"))).toBe(false);
  });
});
