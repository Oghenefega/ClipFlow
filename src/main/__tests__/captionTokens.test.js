// #366: per-line caption overrides. buildCaptionTokens is the one token walk
// shared by the editor preview, the Projects preview and the export overlay
// window, so its resolution order (block < line < word) is pinned here.

const { buildCaptionTokens, buildCaptionWordOverrideCss } = require("../../renderer/editor/utils/subtitleStyleEngine");

const words = (tokens) => tokens.filter((t) => !/^\s+$/.test(t.text));

describe("buildCaptionTokens (#366)", () => {
  test("no overrides → every token plain", () => {
    const toks = buildCaptionTokens("one two\nthree", null, null);
    expect(toks.map((t) => t.text)).toEqual(["one", " ", "two", "\n", "three"]);
    expect(toks.every((t) => t.ov === null)).toBe(true);
  });

  test("a line override reaches every word on that line and no other", () => {
    const toks = words(buildCaptionTokens("one two\nthree four\nfive", null, { 1: { color: "#ff0000" } }));
    expect(toks.map((t) => t.ov)).toEqual([null, null, { color: "#ff0000" }, { color: "#ff0000" }, null]);
  });

  test("word beats line, line beats block; untouched keys fall through", () => {
    const toks = words(buildCaptionTokens("one two\nthree", { 1: { color: "#00ff00" } }, { 0: { color: "#ff0000", fontSize: 40 } }));
    expect(toks[0].ov).toEqual({ color: "#ff0000", fontSize: 40 });
    expect(toks[1].ov).toEqual({ color: "#00ff00", fontSize: 40 });
    expect(toks[2].ov).toBeNull();
  });

  test("blank lines still count toward the line index", () => {
    const toks = words(buildCaptionTokens("one\n\nthree", null, { 2: { color: "#0000ff" } }));
    expect(toks[0].ov).toBeNull();
    expect(toks[1].ov).toEqual({ color: "#0000ff" });
  });

  test("word indexes run across the whole block, as the word chips do", () => {
    const toks = words(buildCaptionTokens("a b\nc", { 2: { color: "#123456" } }, null));
    expect(toks[2].ov).toEqual({ color: "#123456" });
  });

  test("a resolved override feeds the same css builder as a word override", () => {
    const [tok] = words(buildCaptionTokens("hi", null, { 0: { color: "#ff0000", fontSize: 20 } }));
    const css = buildCaptionWordOverrideCss({ color: "#ffffff", fontSize: 30 }, tok.ov, 1);
    expect(css.color).toBe("#ff0000");
    expect(css.fontSize).toBe(`${20 * 2.4}px`);
  });
});

// #486: the Numbers font. Digit words without a font of their own get it;
// a font picked by hand (word or line) wins; empty = today's tokens exactly.
describe("Numbers font (#486)", () => {
  const { numbersFontFor } = require("../../renderer/editor/utils/subtitleStyleEngine");

  test("digit words get the numbers font, letter words stay plain", () => {
    const toks = words(buildCaptionTokens("100T CRYO INSANE 3K", null, null, "Montserrat"));
    expect(toks.map((t) => t.ov)).toEqual([
      { fontFamily: "Montserrat" }, null, null, { fontFamily: "Montserrat" },
    ]);
  });

  test("a hand-picked word font wins and the word keeps its other overrides", () => {
    const toks = words(buildCaptionTokens("100T 3K", { 0: { fontFamily: "Impact" }, 1: { color: "#ffff00" } }, null, "Montserrat"));
    expect(toks[0].ov).toEqual({ fontFamily: "Impact" });
    expect(toks[1].ov).toEqual({ color: "#ffff00", fontFamily: "Montserrat" });
  });

  test("a line font wins too", () => {
    const toks = words(buildCaptionTokens("GTA6 now\n#1", null, { 0: { fontFamily: "Oswald" } }, "Montserrat"));
    expect(toks[0].ov).toEqual({ fontFamily: "Oswald" });
    expect(toks[2].ov).toEqual({ fontFamily: "Montserrat" });
  });

  test("empty numbers font gives exactly the tokens it gave before", () => {
    const ws = { 0: { fontFamily: "Montserrat" }, 2: { color: "#ffff00" } };
    expect(buildCaptionTokens("100T Cryo\nINSANE 3K", ws, null, "")).toEqual(buildCaptionTokens("100T Cryo\nINSANE 3K", ws, null));
  });

  test("numbersFontFor (the subtitle path's rule)", () => {
    expect(numbersFontFor("tm8", undefined, "Montserrat")).toBe("Montserrat");
    expect(numbersFontFor("CRYO", undefined, "Montserrat")).toBeNull();
    expect(numbersFontFor("2v1", "Impact", "Montserrat")).toBeNull();
    expect(numbersFontFor("2v1", undefined, "")).toBeNull();
  });
});
