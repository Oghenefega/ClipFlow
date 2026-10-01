const { computeEditOutcome, wordDistance } = require("../edit-outcome");

// The AI picked 100..110. Per-clip transcription is in seconds from startTime.
function aiClip(over = {}) {
  return {
    id: "clip_1",
    startTime: 100,
    endTime: 110,
    transcription: {
      segments: [
        { start: 1, end: 3, text: "oh my god, bro", words: [
          { word: "oh", start: 1.0, end: 1.2 }, { word: "my", start: 1.3, end: 1.5 },
          { word: "god,", start: 1.6, end: 2.0 }, { word: "bro", start: 2.2, end: 2.6 },
        ] },
        { start: 7, end: 8, text: "no way", words: [
          { word: "no", start: 7.0, end: 7.3 }, { word: "way", start: 7.4, end: 7.8 },
        ] },
      ],
    },
    ...over,
  };
}

// Subtitles as the editor saves them: source-absolute.
const shippedSubs = (lines) => ({
  sub1: lines.map(([text, startSec, endSec, extra]) => ({
    text, startSec, endSec,
    words: text.split(" ").map((w, i, all) => {
      const step = (endSec - startSec) / all.length;
      return { word: w, start: startSec + i * step, end: startSec + (i + 1) * step };
    }),
    ...(extra || {}),
  })),
  sub2: [],
  _format: "source-absolute",
});

describe("computeEditOutcome (#479)", () => {
  test("a clip published as the AI drafted it is untouched", () => {
    const o = computeEditOutcome(aiClip(), []);
    expect(o).toMatchObject({
      aiSeconds: 10, keptSeconds: 10, startMovedS: 0, endMovedS: 0, sections: 1,
      subtitleWordsAi: 6, subtitleWordsChanged: 0, layoutChanged: false, sounds: 0, overlays: 0,
      levelsChanged: false, sessions: 0, activeMs: 0, editsTotal: 0, untouched: true,
    });
  });

  test("opened and saved with no changes: still zero word changes", () => {
    const clip = aiClip({
      nleSegments: [{ id: "a", sourceStart: 100, sourceEnd: 110 }],
      subtitles: shippedSubs([["Oh my god, bro", 101, 102.6], ["No way.", 107, 107.8]]),
    });
    const o = computeEditOutcome(clip, [{ activeMs: 40000, editsTotal: 0, edits: {} }]);
    expect(o.subtitleWordsChanged).toBe(0);
    expect(o.untouched).toBe(true);
    expect(o.activeMs).toBe(40000);
  });

  test("boundary moves, cuts and word fixes are measured; trimmed words are not word fixes", () => {
    const clip = aiClip({
      // started 2 s later, cut out 104..106, extended 3 s past the AI end
      nleSegments: [{ id: "a", sourceStart: 102, sourceEnd: 104 }, { id: "b", sourceStart: 106, sourceEnd: 113 }],
      // "oh my god" is trimmed away (before 102); "bro" kept; "no way" fixed to "no WAY dude"
      subtitles: shippedSubs([["bro", 102.2, 102.6], ["no WAY dude", 107, 107.9], ["extra words", 111, 112]]),
    });
    const o = computeEditOutcome(clip, [
      { activeMs: 60000, editsTotal: 3, edits: { cuts: 2, subtitle_text: 1 } },
      { activeMs: 30000, editsTotal: 1, edits: { cuts: 1 } },
    ]);
    expect(o.startMovedS).toBe(2);
    expect(o.endMovedS).toBe(3);
    expect(o.sections).toBe(2);
    expect(o.keptSeconds).toBe(9);
    expect(o.subtitleWordsAi).toBe(3); // bro, no, way
    expect(o.subtitleWordsChanged).toBe(1); // + "dude" (the extension's words are out of scope)
    expect(o.edits).toEqual({ cuts: 3, subtitle_text: 1 });
    expect(o.sessions).toBe(2);
    expect(o.activeMs).toBe(90000);
    expect(o.untouched).toBe(false);
  });

  test("a hidden subtitle line counts as removed words", () => {
    const clip = aiClip({
      subtitles: shippedSubs([["oh my god bro", 101, 102.6], ["no way", 107, 107.8, { enabled: false }]]),
    });
    expect(computeEditOutcome(clip, []).subtitleWordsChanged).toBe(2);
  });

  test("layout, sounds, overlays and levels each break untouched", () => {
    expect(computeEditOutcome(aiClip({ reframe: null }), []).layoutChanged).toBe(true);
    expect(computeEditOutcome(aiClip({ nleSegments: [{ id: "a", sourceStart: 100, sourceEnd: 110, reframe: {} }] }), []).layoutChanged).toBe(true);
    expect(computeEditOutcome(aiClip({ sfx: [{}] }), []).untouched).toBe(false);
    expect(computeEditOutcome(aiClip({ media: [{}] }), []).untouched).toBe(false);
    expect(computeEditOutcome(aiClip({ audioMix: { 1: -6 } }), []).levelsChanged).toBe(true);
    expect(computeEditOutcome(aiClip({ audioMix: { 1: 0 } }), []).levelsChanged).toBe(false);
    expect(computeEditOutcome(aiClip({ sourceAudioMuted: true }), []).levelsChanged).toBe(true);
  });

  test("no transcription: word fields are null, the rest still computes", () => {
    const o = computeEditOutcome(aiClip({ transcription: null }), []);
    expect(o.subtitleWordsAi).toBeNull();
    expect(o.subtitleWordsChanged).toBeNull();
    expect(o.untouched).toBe(true);
  });

  test("a clip without an AI window has no outcome", () => {
    expect(computeEditOutcome({ id: "x" }, [])).toBeNull();
  });

  test("wordDistance", () => {
    expect(wordDistance(["a", "b", "c"], ["a", "c"])).toBe(1);
    expect(wordDistance(["a", "b"], ["a", "x", "b", "y"])).toBe(2);
    expect(wordDistance([], ["a"])).toBe(1);
  });
});
