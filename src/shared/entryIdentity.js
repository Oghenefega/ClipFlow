/**
 * #475: the settings side of changing a game or content type's name, tag or
 * type. Pure — App.js applies the result to its state, and its persist effects
 * save it. (The disk and database side is src/main/entry-identity.js.)
 *
 * change: { oldName, newName, oldTag, newTag, oldType, newType, hasRecordings }
 */
const lc = (s) => String(s || "").toLowerCase();

/** Which parts of the identity change. A case-only tag edit ("Val"→"VAL") counts. */
function describe(change) {
  const { oldName, newName, oldTag, newTag, oldType, newType } = change;
  return {
    tagChanged: !!newTag && newTag !== oldTag,
    nameChanged: !!newName && newName !== oldName,
    typeChanged: !!newType && (newType || "game") !== (oldType || "game"),
  };
}

/**
 * A stored tag that matches the old one (case-insensitively) becomes the new
 * tag; a value stored lowercased (imports, tracker rows) stays lowercased.
 */
function mapTag(value, oldTag, newTag) {
  if (typeof value !== "string" || lc(value) !== lc(oldTag)) return value;
  if (value === oldTag) return newTag;
  return value === value.toLowerCase() ? newTag.toLowerCase() : newTag;
}

/**
 * The edited entry with its new identity. Old tags are remembered so recordings
 * still named with one keep resolving (reconcile, file-migration). With no
 * recordings yet, a type switch restarts the Day counter at that type's start.
 */
function rewriteEntry(entry, change) {
  const flags = describe(change);
  const next = { ...entry };
  if (flags.nameChanged) next.name = change.newName;
  if (flags.tagChanged) {
    next.tag = change.newTag;
    const prev = [...(entry.previousTags || []), change.oldTag]
      .filter((t) => t && lc(t) !== lc(change.newTag));
    next.previousTags = prev.filter((t, i) => prev.findIndex((u) => lc(u) === lc(t)) === i);
  }
  if (flags.typeChanged) {
    next.entryType = change.newType;
    if (!change.hasRecordings) {
      next.dayCount = change.newType === "content" ? 0 : 1;
      next.lastDayDate = null;
    }
  }
  return next;
}

/**
 * slices: { gamesDb, ytDescriptions, mainGame, mainPool, trackerData, weekMeta,
 * mediaFolders, renameHistory, pendingRenames, mainGameHistory } — any may be omitted. `updated` is the entry as saved from the edit
 * window (colour, note…), still under its OLD identity. Returns every slice.
 */
function rewriteSettingsForIdentity(slices, change, updated) {
  const flags = describe(change);
  const { oldName, newName, oldTag, newTag } = change;
  const name = (v) => (flags.nameChanged && v === oldName ? newName : v);
  const tag = (v) => (flags.tagChanged ? mapTag(v, oldTag, newTag) : v);

  const gamesDb = (slices.gamesDb || []).map((g) => {
    if (g.name === oldName) return rewriteEntry({ ...g, ...updated, name: oldName, tag: oldTag }, change);
    if (flags.tagChanged && g.reactsTo && lc(g.reactsTo) === lc(oldTag)) return { ...g, reactsTo: newTag };
    return g;
  });

  let ytDescriptions = slices.ytDescriptions || {};
  if (flags.nameChanged && Object.prototype.hasOwnProperty.call(ytDescriptions, oldName)) {
    ytDescriptions = Object.fromEntries(Object.entries(ytDescriptions).map(([k, v]) => [k === oldName ? newName : k, v]));
  }

  const trackerData = (slices.trackerData || []).map((r) => {
    if (!r) return r;
    const game = tag(r.game);
    const mainGameAtTime = name(r.mainGameAtTime);
    return game === r.game && mainGameAtTime === r.mainGameAtTime ? r : { ...r, game, mainGameAtTime };
  });

  const weekMeta = Object.fromEntries(Object.entries(slices.weekMeta || {}).map(([wk, m]) =>
    [wk, m && m.nowPlaying === oldName && flags.nameChanged ? { ...m, nowPlaying: newName } : m]));

  const mediaFolders = (slices.mediaFolders || []).map((f) => {
    if (!f) return f;
    const gameTag = tag(f.gameTag);
    return gameTag === f.gameTag ? f : { ...f, gameTag };
  });

  // Rename history rows and the Rename tab's waiting rows carry { game, tag }.
  const nameTagRow = (h) => {
    if (!h) return h;
    const game = name(h.game);
    const t = tag(h.tag);
    return game === h.game && t === h.tag ? h : { ...h, game, tag: t };
  };
  const renameHistory = (slices.renameHistory || []).map(nameTagRow);
  const pendingRenames = (slices.pendingRenames || []).map(nameTagRow);
  const mainGameHistory = (slices.mainGameHistory || []).map((h) => {
    if (!h) return h;
    const from = name(h.from);
    const to = name(h.to);
    return from === h.from && to === h.to ? h : { ...h, from, to };
  });

  return {
    gamesDb,
    ytDescriptions,
    mainGame: name(slices.mainGame),
    mainPool: (slices.mainPool || []).map(name),
    trackerData,
    weekMeta,
    mediaFolders,
    renameHistory,
    pendingRenames,
    mainGameHistory,
  };
}

module.exports = { describe, mapTag, rewriteEntry, rewriteSettingsForIdentity };
