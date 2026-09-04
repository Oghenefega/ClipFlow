/**
 * #287: a starter YouTube description for every library entry that arrived without one.
 *
 * `handleNewGame` (renderer) writes a starter description for every entry added through
 * the UI. Two paths add entries WITHOUT going through it — the Just Chatting content
 * type that file-migration injects on an install's first boot, and whatever survives the
 * #262 seed reset (which empties ytDescriptions but keeps content entries) — and clips
 * for those entries publish with a bare title (`resolveCaption` falls through to the
 * title when no description matches).
 *
 * One-shot, flag-guarded: it runs once per install and gives every entry with no
 * ytDescriptions key the same starter a newly added game gets. It is deliberately NOT
 * idempotent-by-condition — after it has run, a missing key means the user deleted it
 * with Del, and CaptionsView's Add path is how it comes back.
 */
const { buildStarterYtDescription } = require("../shared/ytDescriptionTemplate");

const FLAG = "ytDescriptionsBackfilled";

/**
 * @param {object} store electron-store (get/set)
 * @param {(msg: string) => void} [log]
 * @returns {{ added: string[] }} entry names that received a starter
 */
function backfillYtDescriptions(store, log) {
  if (store.get(FLAG) === true) return { added: [] };
  const gamesDb = Array.isArray(store.get("gamesDb")) ? store.get("gamesDb") : [];
  const existing = store.get("ytDescriptions");
  const next = existing && typeof existing === "object" ? { ...existing } : {};
  const added = [];
  for (const g of gamesDb) {
    const name = typeof g?.name === "string" ? g.name : "";
    if (!name.trim() || next[name]) continue;
    const hashtag = g.hashtag || name.toLowerCase().replace(/\s+/g, "");
    next[name] = { desc: buildStarterYtDescription(name, hashtag), tags: [] };
    added.push(name);
  }
  if (added.length) store.set("ytDescriptions", next);
  store.set(FLAG, true);
  if (log && added.length) {
    log(`#287 starter YouTube description added for ${added.length} librar${added.length === 1 ? "y entry" : "y entries"} that had none: ${added.join(", ")}`);
  }
  return { added };
}

module.exports = { backfillYtDescriptions, FLAG };
