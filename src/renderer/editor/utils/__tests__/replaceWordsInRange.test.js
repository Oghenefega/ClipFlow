// #459: re-transcribing one section puts new words into that stretch of the
// recording and leaves every other subtitle line exactly as it was.
const { replaceWordsInRange, mergeSourceRanges } = require("../replaceWordsInRange");

const w = (word, start, end, extra) => ({ word, start, end, probability: 1, ...extra });
const line = (id, words, extra) => ({
  id,
  text: words.map((x) => x.word).join(" "),
  startSec: words[0].start,
  endSec: words[words.length - 1].end,
  words,
  ...extra,
});
// Stand-in for segmentWords: up to three words a line, in order.
const group = (words) => {
  const out = [];
  for (let i = 0; i < words.length; i += 3) {
    const ws = words.slice(i, i + 3);
    out.push({ text: ws.map((x) => x.word).join(" "), startSec: ws[0].start, endSec: ws[ws.length - 1].end, words: ws, track: "s1" });
  }
  return out;
};
const texts = (lines) => lines.map((l) => l.text);

describe("replaceWordsInRange — only the re-transcribed stretch changes", () => {
  const before = line("a", [w("I", 1, 1.2), w("was", 1.2, 1.5), w("there", 1.5, 2)]);
  const inside = line("b", [w("wrong", 10.2, 10.6), w("words", 10.6, 11)]);
  const after = line("c", [w("see", 20, 20.3), w("you", 20.3, 20.6)], { enabled: false });

  test("lines outside the range come back as the same objects", () => {
    const { untouched } = replaceWordsInRange([before, inside, after], { start: 10, end: 12 }, [w("right", 10.2, 10.6), w("words", 10.6, 11)], group);
    expect(untouched).toEqual([before, after]);
    expect(untouched[0]).toBe(before);
    expect(untouched[1]).toBe(after);
  });

  test("a line inside the range is replaced by the new words", () => {
    const { rebuilt } = replaceWordsInRange([before, inside, after], { start: 10, end: 12 }, [w("right", 10.2, 10.6), w("words", 10.6, 11)], group);
    expect(texts(rebuilt)).toEqual(["right words"]);
    expect(rebuilt[0].words.every((x) => !("_line" in x))).toBe(true);
  });

  test("a line straddling the edge keeps its words outside the range", () => {
    const straddle = line("s", [w("keep", 9.2, 9.6), w("this", 9.6, 9.9), w("gone", 10.1, 10.5)]);
    const { rebuilt, span } = replaceWordsInRange([straddle], { start: 10, end: 12 }, [w("new", 10.1, 10.5), w("bit", 10.5, 11)], group);
    expect(rebuilt.flatMap((l) => l.words.map((x) => x.word))).toEqual(["keep", "this", "new", "bit"]);
    expect(span).toEqual({ start: 10, end: 12 });
  });

  test("a boundary word both transcriptions heard appears once, as the new copy", () => {
    const edge = line("e", [w("go", 9.7, 9.95), w("now", 10.3, 10.6)]);
    const { rebuilt } = replaceWordsInRange([edge], { start: 10, end: 12 }, [w("go", 9.8, 10.1), w("now", 10.3, 10.6)], group);
    const words = rebuilt.flatMap((l) => l.words);
    expect(words.map((x) => x.word)).toEqual(["go", "now"]);
    expect(words[0].start).toBe(9.8);
  });

  test("a new word reaching past the range pulls in the line it overlaps", () => {
    const neighbour = line("n", [w("hey", 8.5, 9), w("there", 9.4, 9.95)]);
    const { untouched, rebuilt, span } = replaceWordsInRange([neighbour], { start: 10, end: 12 }, [w("there", 9.5, 10.2), w("friend", 10.3, 10.8)], group);
    expect(untouched).toEqual([]);
    expect(span.start).toBe(9.5);
    expect(rebuilt.flatMap((l) => l.words.map((x) => x.word))).toEqual(["hey", "there", "friend"]);
  });

  test("line settings ride along: switched off stays off, a moved line keeps its place", () => {
    const off = line("off", [w("quiet", 10.2, 10.5), w("so", 10.5, 10.95)], { enabled: false });
    const moved = line("mv", [w("up", 11, 11.3)], { yPercent: 30 });
    const { rebuilt } = replaceWordsInRange([off, moved], { start: 10, end: 12 },
      [w("quite", 10.2, 10.4), w("so", 10.45, 10.6), w("high", 10.65, 10.9), w("up", 11, 11.3)], group);
    // group() puts the first three words together (all landing in the
    // switched-off line) and "up" on its own line (from the moved one).
    expect(rebuilt[0].enabled).toBe(false);
    expect(rebuilt[1]).toMatchObject({ text: "up", yPercent: 30 });
    expect(rebuilt[1].enabled).toBeUndefined();
  });

  test("ALL CAPS lines are replaced by ALL CAPS lines that remember their spelling", () => {
    const caps = line("k", [w("CRYO", 10.2, 10.6), w("CLUTCH", 10.6, 11)]);
    const { rebuilt } = replaceWordsInRange([before, caps], { start: 10, end: 12 }, [w("Cryo", 10.2, 10.6), w("clutched", 10.6, 11)], group);
    expect(rebuilt[0].text).toBe("CRYO CLUTCHED");
    expect(rebuilt[0].words.map((x) => x.orig)).toEqual(["Cryo", "clutched"]);
  });

  test("lower-case lines stay as the engine spelled them", () => {
    const { rebuilt } = replaceWordsInRange([inside], { start: 10, end: 12 }, [w("Right", 10.2, 10.6), w("words", 10.6, 11)], group);
    expect(rebuilt[0].text).toBe("Right words");
  });

  test("text is the spelling when a line's words and text disagree", () => {
    const typed = { id: "t", text: "fixed by hand", startSec: 9, endSec: 9.9, words: [w("fixd", 9, 9.9)] };
    // Spread evenly: fixed 9–9.3, by 9.3–9.6, hand 9.6–9.9 — only "fixed" is outside.
    const { rebuilt } = replaceWordsInRange([typed], { start: 9.3, end: 12 }, [w("next", 10, 10.4)], group);
    expect(rebuilt.flatMap((l) => l.words.map((x) => x.word))).toEqual(["fixed", "next"]);
  });
});

describe("mergeSourceRanges — the stretches behind the chosen sections", () => {
  test("footage used twice and sections cut from one piece become one stretch", () => {
    expect(mergeSourceRanges([
      { sourceStart: 20, sourceEnd: 30 },
      { sourceStart: 10, sourceEnd: 20 },
      { sourceStart: 12, sourceEnd: 15 },
    ])).toEqual([{ start: 10, end: 30 }]);
  });

  test("separate moments stay separate, in source order", () => {
    expect(mergeSourceRanges([
      { sourceStart: 50, sourceEnd: 55 },
      { sourceStart: 10, sourceEnd: 12 },
    ])).toEqual([{ start: 10, end: 12 }, { start: 50, end: 55 }]);
  });

  test("empty or broken sections are ignored", () => {
    expect(mergeSourceRanges([{ sourceStart: 5, sourceEnd: 5 }, {}])).toEqual([]);
    expect(mergeSourceRanges(null)).toEqual([]);
  });
});
