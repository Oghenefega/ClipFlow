const { EDIT_GROUPS, groupFingerprints, changedGroups } = require("../editGroups");

const sub = (text, startSec, endSec, extra = {}) => ({
  id: `s-${startSec}`, text, startSec, endSec, start: "00:00.0", end: "00:01.0", dur: "1s", track: "s1", conf: "high",
  words: text.split(" ").map((w, i) => ({ word: w, start: startSec + i * 0.3, end: startSec + i * 0.3 + 0.25, probability: 0.9 })),
  ...extra,
});

function payload(over = {}) {
  return {
    title: "Clip 1",
    caption: "",
    captionSegments: [],
    subtitles: { sub1: [sub("oh my god", 10, 11), sub("no way", 12, 13)], sub2: [], _format: "source-absolute" },
    nleSegments: [{ id: "a", sourceStart: 10, sourceEnd: 20 }],
    sfx: [], media: [],
    mediaTrackCount: 1, musicTrackCount: 1, sfxTrackCount: 1,
    laneEnabled: { cap: true, music: true, sfx: true, media: true },
    sourceAudioMuted: false,
    audioMix: null,
    subtitleStyle: { fontSize: 40, yPercent: 80 },
    captionStyle: { fontSize: 30 },
    ...over,
  };
}

const diff = (a, b, extraA, extraB) => changedGroups(groupFingerprints(a, extraA), groupFingerprints(b, extraB));

describe("editGroups (#479)", () => {
  test("identical state is zero edits", () => {
    expect(diff(payload(), payload())).toEqual([]);
  });

  test("display-only subtitle strings do not count", () => {
    const p = payload();
    const q = payload();
    q.subtitles.sub1[0] = { ...q.subtitles.sub1[0], start: "00:09.9", dur: "1.1s", conf: "low", warning: "x" };
    q.subtitles.sub1[0].words = q.subtitles.sub1[0].words.map((w) => ({ ...w, probability: 0.1 }));
    expect(diff(p, q)).toEqual([]);
  });

  test("a trim is a cut, not a subtitle edit, when the unfiltered subtitles are passed", () => {
    const all = payload().subtitles.sub1;
    const trimmed = payload({ nleSegments: [{ id: "a", sourceStart: 11.5, sourceEnd: 20 }], subtitles: { sub1: [all[1]] } });
    expect(diff(payload(), trimmed, { subtitles: all }, { subtitles: all })).toEqual(["cuts"]);
  });

  test("typing a word is subtitle_text only", () => {
    const q = payload();
    q.subtitles.sub1[1] = { ...q.subtitles.sub1[1], text: "no wayyy" };
    expect(diff(payload(), q)).toEqual(["subtitle_text"]);
  });

  test("a text edit that re-times words is not also a timing edit", () => {
    const q = payload();
    q.subtitles.sub1[1] = sub("no way bro", 12, 13);
    expect(diff(payload(), q)).toEqual(["subtitle_text"]);
  });

  test("splitting an unstyled line is not a style edit", () => {
    const q = payload();
    const [a, b] = q.subtitles.sub1;
    q.subtitles.sub1 = [a, { ...b, text: "no", endSec: 12.5 }, { ...b, id: "s-new", text: "way", startSec: 12.5 }];
    expect(diff(payload(), q)).toEqual(["subtitle_text"]);
  });

  test("hiding a line is a subtitle_text edit", () => {
    const q = payload();
    q.subtitles.sub1[1] = { ...q.subtitles.sub1[1], enabled: false };
    expect(diff(payload(), q)).toEqual(["subtitle_text"]);
  });

  test("moving a word boundary is subtitle_timing only", () => {
    const q = payload();
    q.subtitles.sub1[0].words = q.subtitles.sub1[0].words.map((w, i) => (i === 1 ? { ...w, start: w.start + 0.1 } : w));
    expect(diff(payload(), q)).toEqual(["subtitle_timing"]);
  });

  test("a per-line style or the block style is subtitle_style", () => {
    const q = payload();
    q.subtitles.sub1[0] = { ...q.subtitles.sub1[0], lineStyles: { 0: { color: "#fff" } } };
    expect(diff(payload(), q)).toEqual(["subtitle_style"]);
    expect(diff(payload(), payload({ subtitleStyle: { fontSize: 44, yPercent: 80 } }))).toEqual(["subtitle_style"]);
  });

  test("a cut that adds a section is not a layout edit", () => {
    const q = payload({ nleSegments: [{ id: "a", sourceStart: 10, sourceEnd: 14 }, { id: "b", sourceStart: 14, sourceEnd: 20 }] });
    expect(diff(payload(), q)).toEqual(["cuts"]);
  });

  test("layout: section reframe and the clip-wide layout", () => {
    const q = payload({ nleSegments: [{ id: "a", sourceStart: 10, sourceEnd: 20, reframe: { camRect: {} } }] });
    expect(diff(payload(), q)).toEqual(["layout"]);
    expect(diff(payload(), payload(), {}, { clipReframe: null })).toEqual(["layout"]);
  });

  test("each remaining kind is reported on its own", () => {
    expect(diff(payload(), payload({ title: "nah bro" }))).toEqual(["title"]);
    expect(diff(payload(), payload({ caption: "WAIT" }))).toEqual(["caption"]);
    expect(diff(payload(), payload({ sfx: [{ id: "x" }] }))).toEqual(["sound"]);
    expect(diff(payload(), payload({ media: [{ id: "m" }] }))).toEqual(["overlay"]);
    expect(diff(payload(), payload({ audioMix: { 1: -6 } }))).toEqual(["levels"]);
    expect(diff(payload(), payload({ sourceAudioMuted: true }))).toEqual(["levels"]);
    expect(diff(payload(), payload({ laneEnabled: { cap: false, music: true, sfx: true, media: true } }))).toEqual(["caption"]);
  });

  test("every group is fingerprinted", () => {
    expect(Object.keys(groupFingerprints(payload())).sort()).toEqual([...EDIT_GROUPS].sort());
  });
});
