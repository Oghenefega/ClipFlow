const { fixWordCasing, fixTextCasing, fixTranscriptionCasing } = require("../subtitleCasing");

const W = (word, start = 0, end = 1) => ({ word, start, end, probability: 0.9 });
const texts = (words) => words.map((w) => w.word);

describe("fixWordCasing — the pronoun I", () => {
  test("every I-form, with trailing punctuation and curly apostrophes", () => {
    const out = fixWordCasing([W("i"), W("i'm,"), W("i’ll"), W("i've."), W("i'd?"), W("i'd've")]);
    expect(texts(out)).toEqual(["I", "I'm,", "I’ll", "I've.", "I'd?", "I'd've"]);
  });

  test("leading punctuation survives", () => {
    expect(texts(fixWordCasing([W("\"i'm"), W("(i")]))).toEqual(["\"I'm", "(I"]);
  });

  test("words that merely start with i are untouched", () => {
    expect(texts(fixWordCasing([W("in"), W("it's"), W("ice"), W("ii")]))).toEqual(["in", "it's", "ice", "ii"]);
  });
});

describe("fixWordCasing — God / Jesus / Christ", () => {
  test("in every position, not only inside 'oh my god'", () => {
    const out = fixWordCasing([W("god"), W("my"), W("god,"), W("oh"), W("god!"), W("god's"), W("jesus"), W("jesus'"), W("christ."), W("jesus's")]);
    expect(texts(out)).toEqual(["God", "my", "God,", "oh", "God!", "God's", "Jesus", "Jesus'", "Christ.", "Jesus's"]);
  });

  test("compounds and lookalikes are left alone", () => {
    expect(texts(fixWordCasing([W("goddamn"), W("godlike"), W("christmas"), W("godot")])))
      .toEqual(["goddamn", "godlike", "christmas", "godot"]);
  });
});

describe("fixWordCasing — shape", () => {
  test("idempotent, and unchanged words keep their identity", () => {
    const input = [W("I"), W("God"), W("hello"), W("i")];
    const once = fixWordCasing(input);
    expect(once[0]).toBe(input[0]);
    expect(once[1]).toBe(input[1]);
    expect(once[2]).toBe(input[2]);
    expect(once[3]).not.toBe(input[3]);
    expect(fixWordCasing(once)).toEqual(once);
  });

  test("timings and probabilities ride along", () => {
    const out = fixWordCasing([W("i", 3.25, 3.5)]);
    expect(out[0]).toEqual({ word: "I", start: 3.25, end: 3.5, probability: 0.9 });
  });

  test("non-arrays and empty words pass through", () => {
    expect(fixWordCasing(undefined)).toBeUndefined();
    expect(texts(fixWordCasing([W(""), { start: 0, end: 1 }]))).toEqual(["", undefined]);
  });
});

describe("fixTextCasing", () => {
  test("a raw Whisper segment", () => {
    expect(fixTextCasing("did i just hear that, oh my god i think jesus christ is here"))
      .toBe("did I just hear that, oh my God I think Jesus Christ is here");
  });

  test("whitespace is preserved exactly", () => {
    expect(fixTextCasing("  i  said\ti'm\n god ")).toBe("  I  said\tI'm\n God ");
  });

  test("non-strings pass through", () => {
    expect(fixTextCasing(null)).toBeNull();
    expect(fixTextCasing("")).toBe("");
  });
});

describe("fixTranscriptionCasing", () => {
  test("fixes segment text and words, keeps everything else", () => {
    const t = {
      text: "i see god",
      segments: [
        { start: 0, end: 2, text: "i see god", words: [W("i", 0, 0.5), W("see", 0.5, 1), W("god", 1, 2)] },
        { start: 2, end: 3, text: "fine", words: [W("fine", 2, 3)] },
      ],
      language: "en",
    };
    const out = fixTranscriptionCasing(t);
    expect(out.text).toBe("I see God");
    expect(out.language).toBe("en");
    expect(out.segments[0].text).toBe("I see God");
    expect(texts(out.segments[0].words)).toEqual(["I", "see", "God"]);
    expect(out.segments[0].words[2]).toEqual({ word: "God", start: 1, end: 2, probability: 0.9 });
    expect(out.segments[1]).toBe(t.segments[1]);
    // the input is not mutated
    expect(t.segments[0].text).toBe("i see god");
  });

  test("malformed input passes through", () => {
    expect(fixTranscriptionCasing(null)).toBeNull();
    expect(fixTranscriptionCasing({ error: "x" })).toEqual({ error: "x" });
  });
});
