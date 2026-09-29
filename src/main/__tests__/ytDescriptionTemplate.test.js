// s280: a new entry's YouTube description copies the user's own layout (the main
// game's description) and channel tags; a new user still gets the generic starter.
const { buildStarterYtDescription, sharedYtTags, buildGameStarterYt } = require("../../shared/ytDescriptionTemplate");

const LAYOUT = "Valorant ranked, the clutches.\n\n{schedule}\n\nStay connected\nSUBSCRIBE https://example.com/@me\n\n🔽 Watch My Best Videos (Valorant, Fall Guys): https://example.com/list\n\n#valorant #gamingshorts #Me";
const YT = {
  Valorant: { desc: LAYOUT, tags: ["valorant", "valorant shorts", "gaming shorts", "Me", "Me Gaming"] },
  "Rocket League": { desc: "RL.\n\n{schedule}", tags: ["rocket league", "gaming shorts", "Me", "Me Gaming"] },
  "Arc Raiders": { desc: "AR.\n\n{schedule}", tags: ["arc raiders", "gaming shorts", "me", "other"] },
  "Just Chatting": { desc: "JC", tags: [] },
};
const MAIN = { name: "Valorant", hashtag: "valorant" };

describe("sharedYtTags", () => {
  test("tags on at least half the entries that have tags, first spelling kept", () => {
    expect(sharedYtTags(YT)).toEqual(["gaming shorts", "Me", "Me Gaming"]);
  });
  test("nothing for a new user or a single entry", () => {
    expect(sharedYtTags({})).toEqual([]);
    expect(sharedYtTags({ A: { tags: ["x"] } })).toEqual([]);
  });
});

describe("buildGameStarterYt", () => {
  test("copies the main game's layout: new first line, hashtag swapped, the rest kept", () => {
    const yt = buildGameStarterYt({ name: "Fall Guys", hashtag: "fallguys", layoutEntry: MAIN, ytDescriptions: YT });
    expect(yt.desc).toBe(LAYOUT.replace("Valorant ranked, the clutches.", "The best Fall Guys moments from my streams").replace("#valorant ", "#fallguys "));
    // Only the hashtag moved: a game named in a playlist line stays as written.
    expect(yt.desc).toContain("(Valorant, Fall Guys)");
    expect(yt.tags.slice(0, 2)).toEqual(["fall guys", "fallguys"]);
    expect(yt.tags).toEqual(expect.arrayContaining(["gaming shorts", "Me", "Me Gaming"]));
  });

  test("a hashtag that only starts the same word is left alone", () => {
    const yt = buildGameStarterYt({
      name: "Fall Guys", hashtag: "fallguys", layoutEntry: MAIN,
      ytDescriptions: { Valorant: { desc: "x\n\n#valorantclips #valorant", tags: [] } },
    });
    expect(yt.desc).toBe("The best Fall Guys moments from my streams\n\n#valorantclips #fallguys");
  });

  test("no main game, or no description to copy: the generic starter", () => {
    const starter = buildStarterYtDescription("Fall Guys", "fallguys");
    expect(buildGameStarterYt({ name: "Fall Guys", hashtag: "fallguys", layoutEntry: null, ytDescriptions: {} }).desc).toBe(starter);
    expect(buildGameStarterYt({ name: "Fall Guys", hashtag: "fallguys", layoutEntry: MAIN, ytDescriptions: {} }).desc).toBe(starter);
  });

  test("regenerating the main game itself doesn't copy itself", () => {
    expect(buildGameStarterYt({ name: "Valorant", hashtag: "valorant", layoutEntry: MAIN, ytDescriptions: YT }).desc)
      .toBe(buildStarterYtDescription("Valorant", "valorant"));
  });
});
