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
