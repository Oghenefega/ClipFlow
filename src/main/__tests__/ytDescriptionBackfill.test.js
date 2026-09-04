// #287: entries that reached gamesDb without handleNewGame (the migration-injected
// Just Chatting content type, survivors of the #262 reset) get the starter YouTube
// description once — and only once, so a later Del stays deleted.
const { backfillYtDescriptions, FLAG } = require("../yt-description-backfill");
const { buildStarterYtDescription } = require("../../shared/ytDescriptionTemplate");

function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get: (k) => m.get(k),
    set: (k, v) => m.set(k, v),
    has: (k) => m.has(k),
    writes: () => m,
  };
}

const JC = { name: "Just Chatting", tag: "JC", hashtag: "justchatting", entryType: "content" };
const RL = { name: "Rocket League", tag: "RL", hashtag: "rocketleague", entryType: "game" };
const RL_DESC = { desc: "Fega's real RL description", tags: ["rocket league"] };

describe("backfillYtDescriptions (#287)", () => {
  test("gives a migration-injected entry the starter and leaves real entries verbatim", () => {
    const store = memStore({ gamesDb: [RL, JC], ytDescriptions: { "Rocket League": RL_DESC } });
    const log = jest.fn();
    const { added } = backfillYtDescriptions(store, log);
    expect(added).toEqual(["Just Chatting"]);
    const yt = store.get("ytDescriptions");
    expect(yt["Rocket League"]).toBe(RL_DESC);
    expect(yt["Just Chatting"]).toEqual({ desc: buildStarterYtDescription("Just Chatting", "justchatting"), tags: [] });
    expect(store.get(FLAG)).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(/Just Chatting/);
  });

  test("runs once: a description the user deleted afterwards is not resurrected", () => {
    const store = memStore({ gamesDb: [RL, JC], ytDescriptions: {} });
    backfillYtDescriptions(store);
    expect(Object.keys(store.get("ytDescriptions")).sort()).toEqual(["Just Chatting", "Rocket League"]);
    // User hits Del on Just Chatting.
    const afterDel = { ...store.get("ytDescriptions") };
    delete afterDel["Just Chatting"];
    store.set("ytDescriptions", afterDel);
    const { added } = backfillYtDescriptions(store);
    expect(added).toEqual([]);
    expect(store.get("ytDescriptions")["Just Chatting"]).toBeUndefined();
  });

  test("falls back to the name for the hashtag when the entry has none", () => {
    const store = memStore({ gamesDb: [{ name: "Meccha Chameleon", tag: "MC" }], ytDescriptions: {} });
    backfillYtDescriptions(store);
    expect(store.get("ytDescriptions")["Meccha Chameleon"].desc).toBe(buildStarterYtDescription("Meccha Chameleon", "mecchachameleon"));
  });

  test("nothing to add: sets the flag without touching ytDescriptions, and is silent", () => {
    const yt = { "Rocket League": RL_DESC };
    const store = memStore({ gamesDb: [RL], ytDescriptions: yt });
    const log = jest.fn();
    const { added } = backfillYtDescriptions(store, log);
    expect(added).toEqual([]);
    expect(store.get("ytDescriptions")).toBe(yt);
    expect(store.get(FLAG)).toBe(true);
    expect(log).not.toHaveBeenCalled();
  });

  test("tolerates a missing ytDescriptions store key and junk gamesDb rows", () => {
    const store = memStore({ gamesDb: [null, { tag: "X" }, { name: "  " }, JC] });
    const { added } = backfillYtDescriptions(store);
    expect(added).toEqual(["Just Chatting"]);
    expect(Object.keys(store.get("ytDescriptions"))).toEqual(["Just Chatting"]);
  });
});
