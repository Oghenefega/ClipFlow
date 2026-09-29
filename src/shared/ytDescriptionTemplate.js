// #284: the ONE starter YouTube description generator. Every entry point — adding
// a game (App.js handleNewGame), "Regenerate" / "Create one from the template"
// (CaptionsView) and the main process's one-shot backfill for entries that
// arrived without one (#287, yt-description-backfill.js) — calls this, so they
// can never drift apart.
//
// CJS `module.exports` so the main process can require() it; the renderer imports
// it as a named ESM binding (Vite handles the interop, same as captionResolve).
//
// Deliberately generic: a blurb line, a keyword line and two hashtags. No channel
// name, no social links, no affiliate links, no stream schedule. This is a
// scaffold the user makes theirs in Captions & Descriptions — it is not a
// finished description, and it must never assert anything about whoever is
// running the app.
function buildStarterYtDescription(gameName, hashtag) {
  return `The best ${gameName} moments from my streams

${hashtag} shorts, ${hashtag} funny moments, ${hashtag} gameplay, funny gaming shorts, gaming shorts, funny gaming moments, stream highlights, gaming content

#${hashtag} #gamingshorts`;
}

const lc = (s) => String(s || "").toLowerCase();

/**
 * Tags the user puts on (nearly) every entry, their own channel tags: a tag on
 * at least half the entries that have tags, and on two or more. Empty for a new user.
 */
function sharedYtTags(ytDescriptions) {
  const lists = Object.values(ytDescriptions || {}).map((y) => (Array.isArray(y?.tags) ? y.tags : [])).filter((t) => t.length);
  const counts = new Map();
  for (const list of lists) {
    for (const t of new Set(list.map((x) => String(x).trim()).filter(Boolean))) {
      const k = lc(t);
      const hit = counts.get(k) || { tag: t, n: 0 };
      hit.n++;
      counts.set(k, hit);
    }
  }
  return [...counts.values()].filter((c) => c.n >= 2 && c.n * 2 >= lists.length).map((c) => c.tag);
}

const dedupeTags = (tags) => tags.filter((t, i, a) => t && a.findIndex((u) => lc(u) === lc(t)) === i);

/**
 * s280: a new entry's YouTube description and tags ({ desc, tags }), built from
 * the user's OWN layout: the main game's saved description with its first
 * paragraph replaced by `blurb` and its #hashtag swapped for the new one, so
 * links, {schedule} and the rest carry over. Tags are `tags` plus the ones the
 * user puts on every entry. With no layout to copy (a new user, or the main game
 * is the entry itself), `fallbackDesc` — never anyone else's links.
 *
 * layoutEntry: { name, hashtag } of the main game.
 */
function buildYtFromLayout({ name, hashtag, blurb, tags = [], layoutEntry, ytDescriptions, fallbackDesc }) {
  const layout = layoutEntry && layoutEntry.name !== name ? ytDescriptions?.[layoutEntry.name]?.desc : "";
  let desc = fallbackDesc;
  if (layout && String(layout).trim()) {
    const rest = String(layout).split("\n\n").slice(1).join("\n\n");
    const from = String(layoutEntry.hashtag || "").replace(/[^A-Za-z0-9_]/g, "");
    const swapped = from ? rest.replace(new RegExp(`#${from}(?![A-Za-z0-9_])`, "gi"), `#${hashtag}`) : rest;
    desc = swapped ? `${blurb}\n\n${swapped}` : blurb;
  }
  return { desc, tags: dedupeTags([...tags, ...sharedYtTags(ytDescriptions)]) };
}

/** A new game's starter ({ desc, tags }): the user's layout when there is one, else the generic starter. */
function buildGameStarterYt({ name, hashtag, layoutEntry, ytDescriptions }) {
  const n = lc(name);
  return buildYtFromLayout({
    name, hashtag, layoutEntry, ytDescriptions,
    blurb: `The best ${name} moments from my streams`,
    tags: [n, hashtag, `${n} shorts`, `${n} funny moments`, `${n} gameplay`, `${n} highlights`],
    fallbackDesc: buildStarterYtDescription(name, hashtag),
  });
}

module.exports = { buildStarterYtDescription, sharedYtTags, buildYtFromLayout, buildGameStarterYt };
