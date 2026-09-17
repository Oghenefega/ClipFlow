// #433: ALL CAPS is text. The AA switch rewrites the words and remembers the
// spelling they had; nothing stores "is caps" — every switch reads the text.
const {
  isAllCaps, capsWord, capsSegment, capsCaptionText, captionLineIndexes,
  bakeLegacySubtitleCaps, bakeLegacyCaptionCaps,
} = require("../casing");
const { resolveClipSubtitles } = require("../resolveSubtitles");

const word = (w, start, end, extra) => ({ word: w, start, end, probability: 1, ...extra });

describe("isAllCaps — what lights the switch", () => {
  test("typed capitals light it; mixed and lower do not", () => {
    expect(isAllCaps("DUDE")).toBe(true);
    expect(isAllCaps("OUT OF LINE")).toBe(true);
    expect(isAllCaps("I was OUT OF LINE")).toBe(false);
    expect(isAllCaps("dude")).toBe(false);
  });
  test("no cased letter is never caps (#129)", () => {
    expect(isAllCaps("123")).toBe(false);
    expect(isAllCaps("")).toBe(false);
    expect(isAllCaps(undefined)).toBe(false);
  });
});

describe("capsWord — Fega's examples", () => {
  test("Cryo → CRYO → Cryo", () => {
    const on = capsWord("Cryo", undefined, true);
    expect(on).toEqual({ word: "CRYO", orig: "Cryo" });
    expect(capsWord(on.word, on.orig, false)).toEqual({ word: "Cryo", orig: undefined });
  });
  test("oOoOOo → OOOOOO → oOoOOo", () => {
    const on = capsWord("oOoOOo", undefined, true);
    expect(on.word).toBe("OOOOOO");
    expect(capsWord(on.word, on.orig, false).word).toBe("oOoOOo");
  });
  test("typed in capitals: nothing to restore, so off lower-cases", () => {
    expect(capsWord("OUT", undefined, false).word).toBe("out");
    expect(capsWord("DUDE!", undefined, false).word).toBe("dude!");
  });
  test("a standalone I stays capital when lower-casing", () => {
    expect(capsWord("I", undefined, false).word).toBe("I");
    expect(capsWord("I'M", undefined, false).word).toBe("I'm");
    expect(capsWord("I’LL,", undefined, false).word).toBe("I’ll,");
    expect(capsWord("\"I'VE", undefined, false).word).toBe("\"I've");
    expect(capsWord("IT", undefined, false).word).toBe("it");
  });
  test("a stale memory is ignored: the word was retyped while in capitals", () => {
    expect(capsWord("FROST", "Cryo", false).word).toBe("frost");
  });
  test("switching on twice keeps the first spelling", () => {
    expect(capsWord("CRYO", "Cryo", true)).toEqual({ word: "CRYO", orig: "Cryo" });
  });
  test("off on a word that is not in capitals changes nothing", () => {
    expect(capsWord("Cryo", undefined, false)).toEqual({ word: "Cryo", orig: undefined });
  });
  test("digits and punctuation pass through with no memory", () => {
    expect(capsWord("123", undefined, true)).toEqual({ word: "123", orig: undefined });
  });
});

describe("capsSegment — a subtitle line, text and words[] in step", () => {
  const seg = {
    id: 1, text: "I saw Cryo",
    words: [word("I", 0, 0.2), word("saw", 0.2, 0.5), word("Cryo", 0.5, 1, { style: { color: "#f00" } })],
  };

  test("whole line on, then off, is a round trip", () => {
    const on = capsSegment(seg, true);
    expect(on.text).toBe("I SAW CRYO");
    expect(on.words.map((w) => w.word)).toEqual(["I", "SAW", "CRYO"]);
    expect(on.words.map((w) => w.orig)).toEqual([undefined, "saw", "Cryo"]);
    expect(on.words[2].style).toEqual({ color: "#f00" }); // the word's look is untouched
    const off = capsSegment(on, false);
    expect(off.text).toBe("I saw Cryo");
    expect(off.words.map((w) => w.word)).toEqual(["I", "saw", "Cryo"]);
    expect(off.words.some((w) => "orig" in w)).toBe(false);
  });

  test("one word only", () => {
    const on = capsSegment(seg, true, 2);
    expect(on.text).toBe("I saw CRYO");
    expect(on.words.map((w) => w.word)).toEqual(["I", "saw", "CRYO"]);
    expect(capsSegment(on, false, 2).text).toBe("I saw Cryo");
  });

  test("capitalise the line, switch ONE word back — it gets its own spelling", () => {
    const on = capsSegment(seg, true);
    expect(capsSegment(on, false, 2).text).toBe("I SAW Cryo");
  });

  test("text and words[] out of step: both are re-cased, nothing crashes", () => {
    const odd = { text: "two words", words: [word("two", 0, 1)] };
    const on = capsSegment(odd, true);
    expect(on.text).toBe("TWO WORDS");
    expect(on.words[0].word).toBe("TWO");
  });

  test("a manual line with no words", () => {
    expect(capsSegment({ text: "hello there", words: [] }, true).text).toBe("HELLO THERE");
  });
});

describe("capsCaptionText — a caption, line breaks kept", () => {
  const text = "I was OUT OF LINE\n for saying this";

  test("one word", () => {
    const on = capsCaptionText(text, undefined, true, new Set([6]));
    expect(on.text).toBe("I was OUT OF LINE\n for SAYING this");
    expect(on.wordOrig).toEqual({ 6: "saying" });
    const off = capsCaptionText(on.text, on.wordOrig, false, new Set([6]));
    expect(off).toEqual({ text, wordOrig: undefined });
  });

  test("the word he typed in capitals lower-cases — it has no other spelling", () => {
    expect(capsCaptionText(text, undefined, false, new Set([2])).text).toBe("I was out OF LINE\n for saying this");
  });

  test("one typed line", () => {
    expect([...captionLineIndexes(text, 1)]).toEqual([5, 6, 7]);
    const on = capsCaptionText(text, undefined, true, captionLineIndexes(text, 1));
    expect(on.text).toBe("I was OUT OF LINE\n FOR SAYING THIS");
  });

  test("whole caption on, then off: typed capitals lower-case, the rest comes back, I stays", () => {
    const on = capsCaptionText(text, undefined, true, null);
    expect(on.text).toBe("I WAS OUT OF LINE\n FOR SAYING THIS");
    expect(capsCaptionText(on.text, on.wordOrig, false, null).text).toBe("I was out of line\n for saying this");
  });
});

describe("bakeLegacy* — clips saved on 0.5.0-alpha.6, where caps was a drawn flag", () => {
  test("data that never carried a flag is returned as the same array", () => {
    const subs = [{ text: "plain", words: [word("plain", 0, 1)] }];
    const caps = [{ id: "cap-1", text: "plain", wordStyles: { 0: { color: "#f00" } } }];
    expect(bakeLegacySubtitleCaps(subs, undefined)).toBe(subs);
    expect(bakeLegacySubtitleCaps(subs, false)).toBe(subs);
    expect(bakeLegacyCaptionCaps(caps, undefined)).toBe(caps);
  });

  test("subtitles: block flag, a line opting out, a word opting in — innermost wins, flags gone", () => {
    const out = bakeLegacySubtitleCaps([
      { text: "what a play", words: [word("what", 0, 1), word("a", 1, 2), word("play", 2, 3)] },
      { text: "by Asuna", caps: false, words: [word("by", 3, 4), word("Asuna", 4, 5, { style: { caps: true, color: "#0f0" } })] },
    ], true);
    expect(out.map((s) => s.text)).toEqual(["WHAT A PLAY", "by ASUNA"]);
    expect(out[1].words[1]).toMatchObject({ word: "ASUNA", orig: "Asuna", style: { color: "#0f0" } });
    expect(out.some((s) => "caps" in s)).toBe(false);
    // and it is restorable, exactly as if he had pressed the switch himself
    expect(capsSegment(out[1], false, 1).text).toBe("by Asuna");
    // a second pass changes nothing
    expect(bakeLegacySubtitleCaps(out, undefined)).toBe(out);
  });

  test("a casing-only word style disappears entirely", () => {
    const out = bakeLegacySubtitleCaps([{ text: "one", words: [word("one", 0, 1, { style: { caps: true } })] }], false);
    expect(out[0].words[0]).toEqual({ word: "ONE", start: 0, end: 1, probability: 1, orig: "one" });
  });

  test("captions: the screenshot — one word flagged in an as-typed caption", () => {
    const out = bakeLegacyCaptionCaps([
      { id: "cap-1", text: "I was OUT OF LINE\n for saying this", startSec: 0, endSec: null, wordStyles: { 6: { caps: true } } },
    ], false);
    expect(out[0].text).toBe("I was OUT OF LINE\n for SAYING this");
    expect(out[0].wordOrig).toEqual({ 6: "saying" });
    expect("wordStyles" in out[0]).toBe(false);
  });

  test("captions: all-caps block with one line opted out and a coloured word", () => {
    const out = bakeLegacyCaptionCaps([
      { id: "cap-1", text: "Clip 2\nRaor wins", lineStyles: { 1: { caps: false } }, wordStyles: { 0: { color: "#f00" } } },
    ], true);
    expect(out[0].text).toBe("CLIP 2\nRaor wins");
    expect(out[0].wordStyles).toEqual({ 0: { color: "#f00" } });
    expect("lineStyles" in out[0]).toBe(false);
  });
});

describe("through the REAL resolver (editor, Projects preview and render all read here)", () => {
  test("an alpha.6 clip: flags become text, with the spelling remembered", () => {
    const clip = {
      id: "c", startTime: 100, endTime: 110,
      subtitleStyle: { caps: true },
      subtitles: {
        _format: "source-absolute", sub2: [],
        sub1: [
          { id: 1, startSec: 100, endSec: 101, text: "by Asuna", words: [word("by", 100, 100.4), word("Asuna", 100.4, 101)] },
          { id: 2, startSec: 101, endSec: 102, text: "as typed", caps: false, words: [word("as", 101, 101.5), word("typed", 101.5, 102)] },
        ],
      },
    };
    const { segments } = resolveClipSubtitles(clip, {}, { includeExtras: false });
    expect(segments.map((s) => s.text)).toEqual(["BY ASUNA", "as typed"]);
    expect(segments[0].words.map((w) => w.orig)).toEqual(["by", "Asuna"]);
    expect(segments.some((s) => "caps" in s)).toBe(false);
  });
});
