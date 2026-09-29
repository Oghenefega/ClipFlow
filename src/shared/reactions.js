/**
 * #474: the React switch. A reaction entry is an ordinary content type
 * (entryType "content") with `reactsTo: "<game tag>"`; one reaction per game
 * carries `reactsDefault: true` and is what the switch picks. Pure — the
 * renderer applies results to its state; main uses linkLegacyReactions at boot.
 *
 * CJS `module.exports` so the main process can require() it; the renderer
 * imports named ESM bindings (Vite handles the interop, same as captionResolve).
 */
const lc = (s) => String(s || "").toLowerCase();
const { buildYtFromLayout } = require("./ytDescriptionTemplate");
const isGame = (g) => !!g && (!g.entryType || g.entryType === "game");

/** The game a linked reaction entry reacts to, or null (unlinked, or the game is gone). */
function linkedGame(entry, gamesDb) {
  if (!entry || entry.entryType !== "content" || !entry.reactsTo) return null;
  return (gamesDb || []).find((g) => isGame(g) && lc(g.tag) === lc(entry.reactsTo)) || null;
}

/** Every reaction entry linked to a game, the default first. */
function reactionsFor(game, gamesDb) {
  if (!isGame(game)) return [];
  const list = (gamesDb || []).filter((g) => g.entryType === "content" && g.reactsTo && lc(g.reactsTo) === lc(game.tag));
  return [...list.filter((g) => g.reactsDefault), ...list.filter((g) => !g.reactsDefault)];
}

/** The reaction the switch picks for a game: the flagged default, else the first linked one. */
function defaultReactionFor(game, gamesDb) {
  return reactionsFor(game, gamesDb)[0] || null;
}

/**
 * The switch's view of an entry: { game, reacting }. game is null when the
 * entry is neither a game nor a linked reaction (Just Chatting) — no switch then.
 */
function switchState(entry, gamesDb) {
  if (isGame(entry)) return { game: entry, reacting: false };
  const game = linkedGame(entry, gamesDb);
  return game ? { game, reacting: true } : { game: null, reacting: false };
}

// Letters and digits only, and a trailing "react/reacts/reaction/reactions" word dropped:
// "GTA 6 Reacts" and "GTA6 Reaction" are the same bucket.
const bucketKey = (name) => lc(name).replace(/[^a-z0-9]/g, "").replace(/react(ion)?s?$/, "");

/**
 * An unlinked content type that looks like this game's reaction bucket
 * ("GTA 6 Reacts" for GTA 6). Auto-create offers it before making a new entry,
 * so a similar name never becomes a silent duplicate.
 */
function findSimilarUnlinked(game, gamesDb) {
  const key = bucketKey(game.name);
  if (!key) return null;
  return (gamesDb || []).find((g) =>
    g.entryType === "content" && !linkedGame(g, gamesDb)
    && bucketKey(g.name) === key && bucketKey(g.name) !== lc(g.name).replace(/[^a-z0-9]/g, "")) || null;
}

// The entry colour presets (ColorPicker in components/shared.js). A new reaction
// takes the first one no entry uses yet, never its game's (decision 2).
const PALETTE = ["#ff6b35", "#00b4d8", "#ff4655", "#ffd23f", "#fca311", "#06d6a0", "#9b5de5", "#ef476f", "#00ff88", "#e0e0e0"];

/** `<TAG>-R`, then `-R2`, `-R3`… — inside the 8-character tag limit, free case-insensitively. */
function freeReactionTag(game, gamesDb) {
  const taken = new Set((gamesDb || []).flatMap((g) => [g.tag, ...(g.previousTags || [])]).map(lc));
  for (let n = 1; n < 100; n++) {
    const suffix = n === 1 ? "-R" : `-R${n}`;
    const tag = `${String(game.tag).slice(0, 8 - suffix.length)}${suffix}`;
    if (!taken.has(lc(tag))) return tag;
  }
  return null;
}

function freeReactionName(game, gamesDb) {
  const taken = new Set((gamesDb || []).map((g) => lc(g.name)));
  for (let n = 1; n < 100; n++) {
    const name = n === 1 ? `${game.name} Reacts` : `${game.name} Reacts ${n}`;
    if (!taken.has(lc(name))) return name;
  }
  return null;
}

/** The entry auto-create adds the first time Reacting is flipped for a game. */
function buildReactionEntry(game, gamesDb) {
  const used = new Set((gamesDb || []).map((g) => lc(g.color)));
  const color = PALETTE.find((c) => !used.has(c) && c !== lc(game.color))
    || PALETTE.find((c) => c !== lc(game.color));
  return {
    name: freeReactionName(game, gamesDb),
    tag: freeReactionTag(game, gamesDb),
    hashtag: game.hashtag || "",
    color,
    entryType: "content",
    exe: [],
    aiContextUser: `I react to ${game.name} content: news, trailers, esports and clips.`,
    captionTags: game.captionTags || "",
    dayCount: 0,
    previousTags: [],
    reactsTo: game.tag,
    reactsDefault: true,
  };
}

/**
 * A reaction's YouTube description and tags ({ desc, tags }). s280: built from
 * the user's own layout (the main game's description, see buildYtFromLayout)
 * with a reaction first line; reaction tags, then the game's, then the user's
 * channel tags. With no layout to copy, a short generic one.
 * layoutEntry: { name, hashtag } of the main game.
 */
function buildReactionYtDescription(game, { layoutEntry, ytDescriptions } = {}) {
  const hashtag = game.hashtag || lc(game.name).replace(/\s+/g, "");
  const blurb = `Reacting to ${game.name} news, trailers and clips`;
  const gameTags = Array.isArray(ytDescriptions?.[game.name]?.tags) ? ytDescriptions[game.name].tags : [];
  const own = [`${lc(game.name)} reaction`, `${hashtag} reaction`, `${lc(game.name)} news`, `${lc(game.name)} trailer reaction`, "gaming reaction"];
  return buildYtFromLayout({
    name: `${game.name} Reacts`, hashtag, blurb, layoutEntry, ytDescriptions,
    tags: [...own, ...gameTags],
    fallbackDesc: `${blurb}\n\n#${hashtag} #reaction`,
  });
}

/** Mark one reaction as its game's default; its siblings lose the flag. */
function setDefaultReaction(gamesDb, entryName) {
  const entry = (gamesDb || []).find((g) => g.name === entryName);
  if (!entry || !entry.reactsTo) return gamesDb;
  return gamesDb.map((g) => {
    if (g.name === entryName) return g.reactsDefault ? g : { ...g, reactsDefault: true };
    if (g.reactsTo && lc(g.reactsTo) === lc(entry.reactsTo) && g.reactsDefault) {
      const { reactsDefault, ...rest } = g;
      return rest;
    }
    return g;
  });
}

/** Link (or with a falsy gameTag, unlink) an entry. A first link to a game becomes its default. */
function setReactsTo(gamesDb, entryName, gameTag) {
  const hasDefault = gameTag && (gamesDb || []).some((g) =>
    g.name !== entryName && g.reactsDefault && lc(g.reactsTo) === lc(gameTag));
  return (gamesDb || []).map((g) => {
    if (g.name !== entryName) return g;
    const { reactsTo, reactsDefault, ...rest } = g;
    return gameTag ? { ...rest, reactsTo: gameTag, ...(hasDefault ? {} : { reactsDefault: true }) } : rest;
  });
}

/** Deleting a game keeps its reactions as plain content types, link dropped. */
function dropLinksTo(gamesDb, gameTag) {
  return (gamesDb || []).map((g) => {
    if (!g.reactsTo || lc(g.reactsTo) !== lc(gameTag)) return g;
    const { reactsTo, reactsDefault, ...rest } = g;
    return rest;
  });
}

/**
 * Picker options: each game followed by its linked reactions (nested: true),
 * then the content types that aren't about a game. `key` is "name" or "tag" —
 * the value each picker stores.
 */
function groupedEntryOptions(gamesDb, key = "name") {
  const list = gamesDb || [];
  const opt = (g, nested) => ({ value: g[key], label: g.name, tag: g.tag, color: g.color, ...(nested ? { nested: true } : {}) });
  const games = list.filter(isGame);
  const linked = new Set();
  const options = [];
  if (games.length) {
    options.push({ value: "__header_games__", label: "Games", isHeader: true });
    for (const g of games) {
      options.push(opt(g, false));
      for (const r of reactionsFor(g, list)) { linked.add(r.name); options.push(opt(r, true)); }
    }
  }
  const content = list.filter((g) => g.entryType === "content" && !linked.has(g.name));
  if (content.length) {
    options.push({ value: "__header_content__", label: "Content Types", isHeader: true });
    content.forEach((g) => options.push(opt(g, false)));
  }
  return options;
}

// The reaction entries that existed before the switch (s279 library), linked
// once at boot by name. Only a game that exists is linked to.
const LEGACY_LINKS = [
  { name: "rocket league reacts", game: "RL", isDefault: true },
  { name: "gta6 reacts", game: "GTA6", isDefault: true },
  { name: "100t valorant reacts", game: "Val", isDefault: true },
  { name: "valorant champions tour", game: "Val" },
  { name: "valorant reacts", game: "Val" },
];

/** Boot migration: returns { gamesDb, linked } — never overwrites a link already set. */
function linkLegacyReactions(gamesDb) {
  let list = gamesDb || [];
  const linked = [];
  for (const l of LEGACY_LINKS) {
    const entry = list.find((g) => g.entryType === "content" && lc(g.name) === l.name);
    const game = list.find((g) => isGame(g) && lc(g.tag) === lc(l.game));
    if (!entry || !game || entry.reactsTo) continue;
    const hasDefault = list.some((g) => g.reactsDefault && lc(g.reactsTo) === lc(game.tag));
    list = list.map((g) => (g === entry
      ? { ...g, reactsTo: game.tag, ...(l.isDefault || !hasDefault ? { reactsDefault: true } : {}) }
      : g));
    if (l.isDefault && hasDefault) list = setDefaultReaction(list, entry.name);
    linked.push(`${entry.name} -> ${game.name}`);
  }
  return { gamesDb: list, linked };
}

module.exports = {
  linkedGame,
  reactionsFor,
  defaultReactionFor,
  switchState,
  findSimilarUnlinked,
  freeReactionTag,
  buildReactionEntry,
  buildReactionYtDescription,
  setDefaultReaction,
  setReactsTo,
  dropLinksTo,
  groupedEntryOptions,
  linkLegacyReactions,
};
