// #381/#341: the ONE rejection-reason vocabulary. Before this file the keys,
// the UI labels, the prompt's prose labels, the excluded list and the stats
// mirror lived in four hand-synced places (ProjectsView.js, ai-prompt.js twice,
// feedback.js) and adding a chip meant editing all of them. Everything now
// derives from the catalogue below, so they can never drift apart.
//
// CJS `module.exports` so the main process can require() it; the renderer
// imports it as named ESM bindings (Vite handles the interop, same as
// captionResolve / ytDescriptionTemplate).

// ── Tiers: what the engine can actually LEARN from a rejection ────────────
//
// This is the distinction the codebase was missing (#381). It is NOT
// "taste vs mechanical" — it is "can the transcript carry this verdict?".
//
//   bookkeeping — the moment was fine, the bookkeeping was wrong (duplicate of
//                 a kept clip, wrong boundaries, wrong bucket). Teaches nothing.
//   content     — the wrong KIND of moment was picked. The words are evidence,
//                 so the transcript is worth showing as a negative example.
//   delivery    — the right moment and the right words, performed wrong. The
//                 signal is in the AUDIO, not the text. Showing the transcript
//                 teaches a falsehood: measured on the 100T library, the
//                 creator's signature phrases ("let's go", "get him out") are
//                 MORE common in approved clips than rejected ones, so quoting
//                 a delivery reject as "avoid this" points the wrong way.
const BOOKKEEPING = "bookkeeping";
const CONTENT = "content";
const DELIVERY = "delivery";

// ── The catalogue ─────────────────────────────────────────────────────────
//
// `scope` decides whether a chip is offered to a given creator on a given clip:
//   core     — always offered
//   format   — offered for the entry types in `entryTypes`
//   priority — offered only when one of `priorities` is among the creator's top
//              moment priorities (Settings → AI Preferences). A creator who
//              ranked "educational" first is asked whether a clip taught
//              anything; one who ranked "funny" first is asked whether it was
//              funny. The rejection vocabulary mirrors what they asked for.
//
// Order here is the order chips render in — roughly most-reached-for first,
// grouped by tier, with the bookkeeping chips last.
const REJECT_REASONS = [
  // ── Content: always offered ──
  {
    key: "nothing-happens", tier: CONTENT, scope: "core",
    label: "Nothing happens",
    hint: "Energy with no real event behind it — nothing actually happens",
    prose: "nothing happens",
  },
  {
    key: "no-payoff", tier: CONTENT, scope: "core",
    label: "No payoff",
    hint: "It builds, but the ending doesn't land",
    prose: "builds up but the ending doesn't land",
  },
  {
    key: "live-only", tier: CONTENT, scope: "core",
    label: "Didn't stand alone",
    hint: "Worked live in the moment, but doesn't hold up as a standalone short",
    prose: "worked live, but doesn't stand alone as a short",
  },
  {
    key: "needs-context", tier: CONTENT, scope: "core",
    label: "Needs context",
    hint: "A cold viewer wouldn't get it without prior context",
    prose: "needs context a viewer wouldn't have",
  },

  // ── Content: derived from the creator's own moment priorities ──
  {
    key: "not-funny", tier: CONTENT, scope: "priority", priorities: ["funny", "fails"],
    label: "Not funny",
    hint: "The joke or reaction isn't funny on rewatch",
    prose: "not funny",
  },
  {
    key: "no-reaction", tier: CONTENT, scope: "priority", priorities: ["emotional"],
    label: "No real reaction",
    hint: "Nothing genuine — no surprise, shock or celebration",
    prose: "no genuine reaction",
  },
  {
    key: "no-stakes", tier: CONTENT, scope: "priority", priorities: ["clutch"],
    label: "No stakes",
    hint: "Nothing was on the line, so the moment doesn't land",
    prose: "nothing was on the line",
  },
  {
    key: "not-impressive", tier: CONTENT, scope: "priority", priorities: ["skillful"],
    label: "Not impressive",
    hint: "The play isn't good enough to stand out",
    prose: "the play isn't impressive enough to stand out",
  },
  {
    key: "teaches-nothing", tier: CONTENT, scope: "priority", priorities: ["educational"],
    label: "Teaches nothing",
    hint: "No tip, insight or explanation a viewer takes away",
    prose: "no tip or insight a viewer could take away",
  },

  // ── Content: stream-format reasons ──
  {
    key: "chat-banter", tier: CONTENT, scope: "core",
    label: "Chat banter",
    hint: "Only lands if you could see chat — doesn't stand alone",
    prose: "chat banter that doesn't stand alone",
  },
  {
    key: "setup-talk", tier: CONTENT, scope: "core",
    label: "Setup / tech talk",
    hint: "Stream housekeeping or technical trouble — not content",
    prose: "stream setup / tech talk, not content",
  },
  {
    key: "reaction-adds-nothing", tier: CONTENT, scope: "format", entryTypes: ["content"],
    label: "Reaction added nothing",
    hint: "The source moment carried it — my reaction didn't add anything",
    prose: "the source moment carried it — the creator's reaction added nothing",
  },

  // ── Delivery: right moment, wrong performance. Never teaches from words. ──
  {
    key: "flat-delivery", tier: DELIVERY, scope: "core",
    label: "Fell flat",
    hint: "Right moment, but the reaction didn't carry it",
    prose: "the reaction didn't carry it",
  },
  {
    key: "sounds-angry", tier: DELIVERY, scope: "core",
    label: "Just sounded angry",
    hint: "Words I'd normally sell, but it came out genuinely angry instead of entertaining",
    prose: "came out genuinely angry instead of entertaining",
  },

  // ── Bookkeeping: the moment was fine, the filing was wrong. ──
  {
    key: "duplicate", tier: BOOKKEEPING, scope: "core",
    label: "Duplicate",
    hint: "Same or similar moment already kept — the moment itself was good",
    prose: "duplicate of a kept clip",
  },
  {
    key: "bad-cut", tier: BOOKKEEPING, scope: "core",
    label: "Bad cut",
    hint: "Right moment, wrong start or end point",
    prose: "bad cut",
  },
  {
    key: "repetitive", tier: BOOKKEEPING, scope: "core",
    label: "Too similar",
    hint: "Good moment, but too much like clips already kept",
    prose: "too similar to clips already kept",
  },
  {
    key: "wrong-content", tier: BOOKKEEPING, scope: "core",
    label: "Wrong content",
    hint: "Filed under the wrong tag — the hashtags and description won't match",
    prose: "wrong content for this tag",
  },
];

// How many of the creator's ranked moment priorities get their own chip.
// Three keeps the chip row scannable while still covering what they actually
// asked Corva to look for.
const PRIORITY_CHIP_COUNT = 3;

// Mirrors DEFAULT_CREATOR_PROFILE.momentPriorities (ai-prompt.js / main.js).
// Used before the stored profile has loaded and on a fresh install, so the
// chip row never renders without its taste reasons.
const DEFAULT_MOMENT_PRIORITIES = ["funny", "clutch", "emotional", "fails", "skillful", "educational"];

const BY_KEY = new Map(REJECT_REASONS.map((r) => [r.key, r]));

/** Prose label for the prompt. Unknown/future keys pass through verbatim. */
const REJECT_REASON_LABELS = Object.fromEntries(REJECT_REASONS.map((r) => [r.key, r.prose]));

/**
 * Group order for the rejected prompt section — reasons that teach the
 * strongest patterns first. Content tier only: bookkeeping rows never reach the
 * section, and delivery reasons can never be a group key (see groupKeyFor).
 */
const REJECT_GROUP_ORDER = REJECT_REASONS.filter((r) => r.tier === CONTENT).map((r) => r.key);

/**
 * Keys whose presence anywhere on a row kills it as negative calibration.
 * The moment was good (duplicate / too similar) or only the boundaries or the
 * bucket were wrong — so a row tagged "duplicate,not-funny" is contradictory
 * and teaches nothing. Also drives the #194 quality-stat denominator.
 */
const BOOKKEEPING_REJECT_REASONS = REJECT_REASONS.filter((r) => r.tier === BOOKKEEPING).map((r) => r.key);

/** Keys whose verdict lives in the audio, not the transcript (#381). */
const DELIVERY_REJECT_REASONS = REJECT_REASONS.filter((r) => r.tier === DELIVERY).map((r) => r.key);

function tierOf(key) {
  // Unknown keys are treated as content: a future chip should teach by default
  // rather than silently vanish from calibration.
  return BY_KEY.get(key)?.tier || CONTENT;
}

/**
 * Chips to offer for one clip.
 *
 * @param {object} opts
 * @param {string} [opts.entryType] - "game" | "content" (Game Library entry kind)
 * @param {string[]} [opts.momentPriorities] - creator's ranked priorities
 * @param {string[]} [opts.include] - keys already stored on the clip. These are
 *   ALWAYS offered, even when the creator's current priorities or entry type
 *   wouldn't surface them — otherwise reordering priorities in Settings would
 *   hide a reason already tagged on an old clip, leaving it visible in the
 *   prompt but impossible to see or untick in the UI.
 * @returns {Array} catalogue entries, in catalogue order
 */
function getReasonChips({ entryType = "game", momentPriorities = [], include = [] } = {}) {
  const ranked = (momentPriorities || []).length > 0 ? momentPriorities : DEFAULT_MOMENT_PRIORITIES;
  const top = new Set(ranked.slice(0, PRIORITY_CHIP_COUNT));
  const pinned = new Set((include || []).filter(Boolean));
  const chips = REJECT_REASONS.filter((r) => {
    if (pinned.has(r.key)) return true;
    if (r.scope === "format") return (r.entryTypes || []).includes(entryType);
    if (r.scope === "priority") return (r.priorities || []).some((p) => top.has(p));
    return true;
  });
  // A stored key from a future version (or a hand-edited project file) still
  // gets a chip, so it can be read and removed rather than being stuck on.
  for (const key of pinned) {
    if (!BY_KEY.has(key)) chips.push({ key, tier: CONTENT, scope: "core", label: key, hint: "Saved on this clip by another version of Corva", prose: key });
  }
  return chips;
}

/**
 * Does this row's transcript belong in the negative-calibration section?
 *
 * Bookkeeping wins on ANY match (the moment was good). Delivery only wins when
 * it is the WHOLE verdict — a row tagged "nothing-happens,flat-delivery" still
 * carries a real content verdict, and its words are fair evidence for that.
 */
function teachesFromWords(reasons) {
  const keys = (reasons || []).filter(Boolean);
  if (keys.some((k) => tierOf(k) === BOOKKEEPING)) return false;
  if (keys.length > 0 && keys.every((k) => tierOf(k) === DELIVERY)) return false;
  return true;
}

/**
 * Which reason a row is grouped under in the prompt.
 *
 * The first CONTENT reason, not simply reasons[0] — reasons[0] is whichever
 * chip was tapped first, so a row tagged flat-delivery-then-nothing-happens
 * would otherwise be quoted under a delivery header, which is the exact
 * mis-teaching #381 is about.
 */
function groupKeyFor(reasons) {
  const keys = (reasons || []).filter(Boolean);
  return keys.find((k) => tierOf(k) === CONTENT) || keys[0] || null;
}

module.exports = {
  BOOKKEEPING,
  CONTENT,
  DELIVERY,
  REJECT_REASONS,
  REJECT_REASON_LABELS,
  REJECT_GROUP_ORDER,
  BOOKKEEPING_REJECT_REASONS,
  DELIVERY_REJECT_REASONS,
  PRIORITY_CHIP_COUNT,
  DEFAULT_MOMENT_PRIORITIES,
  tierOf,
  getReasonChips,
  teachesFromWords,
  groupKeyFor,
};
