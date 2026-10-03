const { learnPalette, toMarked, parseMarked } = require("../ai/caption-marks");

const Y = { color: "#ffff00", glowOn: true, glowColor: "#ffff00" };
const R = { color: "#ff0000", glowOn: true, glowColor: "#ff0000" };

describe("learnPalette", () => {
  test("keeps colours used in 3+ captions, with their usual glow, most used first", () => {
    const rows = [
      { wordStyles: { 2: Y, 3: Y }, baseColor: "#ffffff" },
      { lineStyles: { 1: { color: "#FFFF00", glowColor: "#ffff00" } } },
      { wordStyles: { 0: Y, 4: R } },
      { wordStyles: { 1: R } },
      { wordStyles: { 0: R } },
      { wordStyles: { 0: { color: "#ffff00", glowOn: true, glowColor: "#ffff00" } } },
      { wordStyles: { 0: { color: "#a3ff00" } } }, // once: below the bar
    ];
    const p = learnPalette(rows);
    expect(p.map((c) => c.color)).toEqual(["#ffff00", "#ff0000"]);
    expect(p[0].patch).toEqual(Y);
  });

  test("a colour equal to the caption's base colour is not a highlight", () => {
    const rows = [1, 2, 3].map(() => ({ wordStyles: { 0: { color: "#ffffff" } }, baseColor: "#FFFFFF" }));
    expect(learnPalette(rows)).toEqual([]);
  });

  test("no styled history, no palette", () => {
    expect(learnPalette([])).toEqual([]);
    expect(learnPalette([{}, { wordStyles: {} }])).toEqual([]);
  });
});

describe("toMarked / parseMarked", () => {
  const palette = [{ color: "#ffff00", patch: Y }, { color: "#ff0000", patch: R }];

  test("word colours become one mark per run, and parse back to the same styles", () => {
    const text = "100T Cryo\nINSANE CLUTCH round";
    const styles = { wordStyles: { 2: Y, 3: Y } };
    const marked = toMarked(text, styles, palette);
    expect(marked).toBe("100T Cryo\n[#ffff00]INSANE CLUTCH[/] round");
    expect(parseMarked(marked, palette)).toEqual({ text, wordStyles: { 2: Y, 3: Y } });
  });

  test("a whole coloured line parses to a line style", () => {
    const r = parseMarked("I KEEP JINXING\n[#ffff00]MY TEAM[/]", palette);
    expect(r).toEqual({ text: "I KEEP JINXING\nMY TEAM", lineStyles: { 1: Y } });
  });

  test("line styles render as marks over the whole line", () => {
    expect(toMarked("A B\nC D", { lineStyles: { 1: Y } }, palette)).toBe("A B\n[#ffff00]C D[/]");
  });

  test("colours outside the palette and stray marks are dropped", () => {
    const r = parseMarked("[#00ff00]WON[/] it [#ff0000]all\nnext [/]line", palette);
    expect(r).toEqual({ text: "WON it all\nnext line" });
  });

  test("no palette: plain text, no styles", () => {
    expect(parseMarked("THE [#ffff00]WORST[/] PUSH", [])).toEqual({ text: "THE WORST PUSH" });
  });

  test("word indexes run across lines and skip blank lines like the editor", () => {
    const r = parseMarked("ONE TWO\n\nTHREE [#ff0000]FOUR[/]", palette);
    expect(r).toEqual({ text: "ONE TWO\n\nTHREE FOUR", wordStyles: { 3: R } });
  });
});
