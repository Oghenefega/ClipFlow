// #426: ALL CAPS is a drawing instruction at three levels — block style, line,
// word — and the innermost level that says anything wins. The editor preview,
// the Projects preview and the export overlay all get their CSS from these
// builders, so this is where "preview == export" for casing is decided.
const {
  buildSubtitleStyle,
  buildCaptionStyle,
  buildSubtitleWordOverrideCss,
  buildCaptionWordOverrideCss,
  buildCaptionTokens,
  capsTransform,
} = require("../subtitleStyleEngine");

describe("capsTransform", () => {
  test("true / false / anything else", () => {
    expect(capsTransform(true)).toBe("uppercase");
    expect(capsTransform(false)).toBe("none");
    expect(capsTransform(undefined)).toBeNull();
    expect(capsTransform(null)).toBeNull();
  });
});

describe("block style", () => {
  test("caps on the style uppercases the whole block; absent leaves it out entirely", () => {
    expect(buildSubtitleStyle({ caps: true }, 1).textTransform).toBe("uppercase");
    expect(buildCaptionStyle({ caps: true }, 1).textTransform).toBe("uppercase");
    expect("textTransform" in buildSubtitleStyle({}, 1)).toBe(false);
    expect("textTransform" in buildCaptionStyle({ caps: false }, 1)).toBe(false);
  });
});

describe("word override", () => {
  test("casing only: no color or shadow, so the word keeps the line's look and its karaoke highlight", () => {
    expect(buildSubtitleWordOverrideCss({ subColor: "#fff" }, { caps: true }, 1)).toEqual({ textTransform: "uppercase" });
    expect(buildCaptionWordOverrideCss({ color: "#fff" }, { caps: false }, 1)).toEqual({ textTransform: "none" });
  });

  test("casing plus a look: both apply", () => {
    const css = buildSubtitleWordOverrideCss({ subColor: "#fff" }, { caps: true, color: "#ff0000" }, 1);
    expect(css.textTransform).toBe("uppercase");
    expect(css.color).toBe("#ff0000");
  });

  test("a look without casing is unchanged from before", () => {
    const css = buildCaptionWordOverrideCss({ color: "#fff" }, { color: "#00ff00" }, 1);
    expect(css.color).toBe("#00ff00");
    expect("textTransform" in css).toBe(false);
  });

  test("nothing to override is still null", () => {
    expect(buildSubtitleWordOverrideCss({}, {}, 1)).toBeNull();
    expect(buildCaptionWordOverrideCss({}, undefined, 1)).toBeNull();
  });
});

describe("caption tokens: word beats line", () => {
  test("one word opts out of an ALL CAPS line", () => {
    const tokens = buildCaptionTokens("Clip 2\nRAOror wins", { 3: { caps: false } }, { 1: { caps: true } });
    const words = tokens.filter((t) => t.text.trim());
    expect(words.map((t) => [t.text, t.ov && t.ov.caps])).toEqual([
      ["Clip", null], ["2", null], ["RAOror", true], ["wins", false],
    ]);
  });
});
