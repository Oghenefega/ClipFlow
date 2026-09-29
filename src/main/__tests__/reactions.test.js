// #474: the React switch — the boot link, the default per game, auto-create,
// relink/unlink, deleting a game, and the picker grouping. Library fixture is
// Fega's real list as of s279 (identity fields only).
const R = require("../../shared/reactions");

const LIBRARY = [
  { name: "Arc Raiders", tag: "AR", hashtag: "arcraiders", color: "#ff6b35", entryType: "game" },
  { name: "Rocket League", tag: "RL", hashtag: "rocketleague", color: "#00b4d8", entryType: "game" },
  { name: "Valorant", tag: "Val", hashtag: "valorant", color: "#ff4655", entryType: "game" },
  { name: "Egging On", tag: "EO", hashtag: "eggingon", color: "#ffd23f", entryType: "game" },
  { name: "Deadline Delivery", tag: "DD", hashtag: "deadlinedelivery", color: "#fca311", entryType: "game" },
  { name: "Prince of Persia", tag: "PoP", hashtag: "princeofpersia", color: "#9b5de5", entryType: "game" },
  { name: "Slackers: Carts of Glory", tag: "SCoG", hashtag: "cartsofglory", color: "#9b5de5", entryType: "game" },
  { name: "Pico Park", tag: "Pico", hashtag: "picopark", color: "#8b5cf6", entryType: "game" },
  { name: "Just Chatting", tag: "JC", hashtag: "justchatting", color: "#9b5de5", entryType: "content" },
  { name: "Meccha Chameleon", tag: "MC", hashtag: "mecchachameleon", color: "#00ff88", entryType: "game" },
  { name: "Bionic Bay", tag: "BB", hashtag: "bionicbay", color: "#abe830", entryType: "game" },
  { name: "GTA 6", tag: "GTA6", hashtag: "gta6", color: "#e830df", entryType: "game" },
  { name: "100T Valorant Reacts", tag: "100T", hashtag: "valorant", color: "#ea3323", entryType: "content" },
  { name: "Robot Olympics Reacts", tag: "ROBOT", hashtag: "humanoidrobots", color: "#8a9bb8", entryType: "content" },
  { name: "GTA6 Reacts", tag: "GTA6-R", hashtag: "gta6", color: "#f042a0", entryType: "content" },
  { name: "Rocket League Reacts", tag: "RL-R", hashtag: "rocketleague", color: "#f7941d", entryType: "content" },
  { name: "Valorant Champions Tour", tag: "VCT", hashtag: "vct", color: "#fca311", entryType: "content" },
  { name: "Valorant Reacts", tag: "Val-R", hashtag: "valorant", color: "#ff5d8f", entryType: "content" },
];
const byName = (list, n) => list.find((g) => g.name === n);
const linkedLib = () => R.linkLegacyReactions(LIBRARY).gamesDb;

describe("boot link (decisions 1 and 3)", () => {
  test("links the five reaction entries; 100T is Valorant's default", () => {
    const { gamesDb, linked } = R.linkLegacyReactions(LIBRARY);
    expect(linked).toHaveLength(5);
    expect(byName(gamesDb, "Rocket League Reacts").reactsTo).toBe("RL");
    expect(byName(gamesDb, "GTA6 Reacts").reactsTo).toBe("GTA6");
    for (const n of ["100T Valorant Reacts", "Valorant Champions Tour", "Valorant Reacts"]) {
      expect(byName(gamesDb, n).reactsTo).toBe("Val");
    }
    expect(R.defaultReactionFor(byName(gamesDb, "Valorant"), gamesDb).name).toBe("100T Valorant Reacts");
    expect(R.reactionsFor(byName(gamesDb, "Valorant"), gamesDb).filter((g) => g.reactsDefault)).toHaveLength(1);
    expect(byName(gamesDb, "Robot Olympics Reacts").reactsTo).toBeUndefined();
    expect(byName(gamesDb, "Just Chatting").reactsTo).toBeUndefined();
  });

  test("never overwrites a link already set, and skips games that don't exist", () => {
    const custom = LIBRARY.map((g) => (g.name === "Valorant Champions Tour" ? { ...g, reactsTo: "RL" } : g))
      .filter((g) => g.name !== "GTA 6");
    const { gamesDb } = R.linkLegacyReactions(custom);
    expect(byName(gamesDb, "Valorant Champions Tour").reactsTo).toBe("RL");
    expect(byName(gamesDb, "GTA6 Reacts").reactsTo).toBeUndefined();
  });

  test("a fresh customer library is untouched", () => {
    const fresh = [{ name: "Fortnite", tag: "FN", entryType: "game" }, { name: "Just Chatting", tag: "JC", entryType: "content" }];
    expect(R.linkLegacyReactions(fresh)).toEqual({ gamesDb: fresh, linked: [] });
  });
});

describe("switch state", () => {
  test("a game is playing, a linked reaction is reacting, standalone content has no switch", () => {
    const db = linkedLib();
    expect(R.switchState(byName(db, "Rocket League"), db)).toEqual({ game: byName(db, "Rocket League"), reacting: false });
    expect(R.switchState(byName(db, "Valorant Champions Tour"), db)).toEqual({ game: byName(db, "Valorant"), reacting: true });
    expect(R.switchState(byName(db, "Just Chatting"), db).game).toBeNull();
    expect(R.switchState(undefined, db).game).toBeNull();
  });
});

describe("auto-create", () => {
  test("Arc Raiders Reacts: AR-R, the game's hashtag, an unused colour, the starter note", () => {
    const db = linkedLib();
    const e = R.buildReactionEntry(byName(db, "Arc Raiders"), db);
    expect(e).toMatchObject({ name: "Arc Raiders Reacts", tag: "AR-R", hashtag: "arcraiders", entryType: "content", dayCount: 0, reactsTo: "AR", reactsDefault: true });
    expect(e.aiContextUser).toBe("I react to Arc Raiders content: news, trailers, esports and clips.");
    expect(db.some((g) => g.color === e.color)).toBe(false);
  });

  test("a taken tag or name moves on to -R2 / Reacts 2; tags stay within 8 characters", () => {
    const db = [...linkedLib(), { name: "Arc Raiders Reacts", tag: "ar-r", entryType: "content" }];
    const e = R.buildReactionEntry(byName(db, "Arc Raiders"), db);
    expect(e.tag).toBe("AR-R2");
    expect(e.name).toBe("Arc Raiders Reacts 2");
    expect(R.freeReactionTag({ tag: "ABCDEFGH" }, [])).toBe("ABCDEF-R");
  });

  test("an old tag still on recordings counts as taken", () => {
    const db = [...linkedLib(), { name: "Old", tag: "X", previousTags: ["AR-R"], entryType: "content" }];
    expect(R.freeReactionTag(byName(db, "Arc Raiders"), db)).toBe("AR-R2");
  });

  test("a similar unlinked entry is offered first; exact-game-name content isn't", () => {
    const db = [...LIBRARY.filter((g) => g.name !== "GTA6 Reacts"), { name: "GTA 6 Reaction", tag: "G6R", entryType: "content" }];
    expect(R.findSimilarUnlinked(byName(db, "GTA 6"), db).name).toBe("GTA 6 Reaction");
    expect(R.findSimilarUnlinked(byName(db, "Arc Raiders"), db)).toBeNull();
    // Linked entries are never offered again.
    expect(R.findSimilarUnlinked(byName(linkedLib(), "Rocket League"), linkedLib())).toBeNull();
  });

  test("YouTube text: a reaction first line in place of the game's, reaction tags first", () => {
    const yt = R.buildReactionYtDescription(
      { name: "Rocket League", hashtag: "rocketleague" },
      { desc: "Rocket League ranked and chaos.\n\nSUBSCRIBE link", tags: ["rocket league", "gaming shorts"] });
    expect(yt.desc).toBe("Reacting to Rocket League news, trailers and clips\n\nSUBSCRIBE link");
    expect(yt.tags[0]).toBe("rocket league reaction");
    expect(yt.tags).toContain("gaming shorts");
    expect(R.buildReactionYtDescription({ name: "Arc Raiders", hashtag: "arcraiders" }, undefined).desc)
      .toBe("Reacting to Arc Raiders news, trailers and clips\n\n#arcraiders #reaction");
  });
});

describe("relink, unlink, default, delete", () => {
  test("unlink then relink; a first link to a game becomes its default", () => {
    let db = R.setReactsTo(linkedLib(), "Rocket League Reacts", "");
    expect(byName(db, "Rocket League Reacts").reactsTo).toBeUndefined();
    expect(R.defaultReactionFor(byName(db, "Rocket League"), db)).toBeNull();
    db = R.setReactsTo(db, "Robot Olympics Reacts", "RL");
    expect(R.defaultReactionFor(byName(db, "Rocket League"), db).name).toBe("Robot Olympics Reacts");
    db = R.setReactsTo(db, "Rocket League Reacts", "RL");
    expect(byName(db, "Rocket League Reacts").reactsDefault).toBeUndefined();
  });

  test("making one default clears the flag on its siblings only", () => {
    const db = R.setDefaultReaction(linkedLib(), "Valorant Champions Tour");
    expect(R.defaultReactionFor(byName(db, "Valorant"), db).name).toBe("Valorant Champions Tour");
    expect(byName(db, "100T Valorant Reacts").reactsDefault).toBeUndefined();
    expect(byName(db, "Rocket League Reacts").reactsDefault).toBe(true);
  });

  test("deleting a game keeps its reactions as plain content types", () => {
    const db = R.dropLinksTo(linkedLib().filter((g) => g.name !== "Valorant"), "Val");
    for (const n of ["100T Valorant Reacts", "Valorant Champions Tour", "Valorant Reacts"]) {
      expect(byName(db, n).reactsTo).toBeUndefined();
      expect(byName(db, n).reactsDefault).toBeUndefined();
    }
    expect(byName(db, "Rocket League Reacts").reactsTo).toBe("RL");
  });
});

describe("picker options", () => {
  test("linked reactions nest under their game, the default first; content keeps the rest", () => {
    const opts = R.groupedEntryOptions(linkedLib(), "name");
    const labels = opts.map((o) => (o.isHeader ? `# ${o.label}` : `${o.nested ? "  " : ""}${o.label}`));
    const val = labels.indexOf("Valorant");
    expect(labels.slice(val, val + 4)).toEqual(["Valorant", "  100T Valorant Reacts", "  Valorant Champions Tour", "  Valorant Reacts"]);
    expect(labels.slice(labels.indexOf("# Content Types"))).toEqual(["# Content Types", "Just Chatting", "Robot Olympics Reacts"]);
    expect(R.groupedEntryOptions(linkedLib(), "tag").find((o) => o.label === "GTA6 Reacts").value).toBe("GTA6-R");
  });
});
