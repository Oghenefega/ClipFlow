/**
 * Unit tests for the detection prompt builder (#191) — approved snippets,
 * rejected negative-calibration section, word-boundary truncation, budget.
 *
 * Run: node src/main/ai-prompt.test.js
 */

// ai-prompt requires game-profiles, which requires electron at module top.
// Stub it so the builder is testable under plain node.
const Module = require("module");
const os = require("os");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") {
    return { app: { isPackaged: false, getPath: () => os.tmpdir() } };
  }
  return origLoad.apply(this, arguments);
};

const aiPrompt = require("./ai-prompt");
const { buildSystemPrompt, buildFewShotSection, buildRejectedSection, truncateSnippet } = aiPrompt;
const {
  REJECT_REASONS,
  REJECT_REASON_LABELS,
  REJECT_GROUP_ORDER,
  BOOKKEEPING_REJECT_REASONS,
  DELIVERY_REJECT_REASONS,
  tierOf,
  getReasonChips,
  teachesFromWords,
  groupKeyFor,
} = require("../shared/rejectReasons");

// Simple test runner (no Jest dependency needed)
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toContain(sub) {
      if (typeof actual !== "string" || !actual.includes(sub)) {
        throw new Error(`Expected string to contain ${JSON.stringify(sub)}\n    in: ${JSON.stringify(String(actual).slice(0, 300))}`);
      }
    },
    notToContain(sub) {
      if (typeof actual === "string" && actual.includes(sub)) {
        throw new Error(`Expected string NOT to contain ${JSON.stringify(sub)}`);
      }
    },
    toBeNull() {
      if (actual !== null) throw new Error(`Expected null, got ${JSON.stringify(String(actual).slice(0, 120))}`);
    },
    toBeLessThan(n) {
      if (!(actual < n)) throw new Error(`Expected ${actual} < ${n}`);
    },
    toBeTruthy() {
      if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
    },
  };
}

// ── Fixtures ──

function approvedRow(overrides = {}) {
  return {
    clip_start: "00:41:12",
    clip_end: "00:42:03",
    title: "He Really Did That",
    transcript_segment: "oh my god did you see that save bro that was actually insane no way he pulled that off",
    energy_level: "HIGH",
    user_note: "",
    decision: "approved",
    ...overrides,
  };
}

function rejectedRow(overrides = {}) {
  return {
    clip_start: "01:02:00",
    clip_end: "01:02:40",
    title: "Random Chat Moment",
    transcript_segment: "so anyway like i was telling chat earlier about the thing that happened at the store yesterday",
    energy_level: "MED",
    user_note: "",
    decision: "rejected",
    ...overrides,
  };
}

const LONG_TEXT =
  "this is a very long transcript segment that keeps going and going because the creator was mid rant about the ranked system and how the teammates keep leaving the play and rotating badly and never touching the ball when it matters most in overtime";

// ── truncateSnippet ──

console.log("\ntruncateSnippet:");

test("short text passes through unchanged", () => {
  expect(truncateSnippet("hello world")).toBe("hello world");
});

test("collapses whitespace and newlines", () => {
  expect(truncateSnippet("  hello \n\n  world\t again ")).toBe("hello world again");
});

test("empty / null / undefined return empty string", () => {
  expect(truncateSnippet("")).toBe("");
  expect(truncateSnippet(null)).toBe("");
  expect(truncateSnippet(undefined)).toBe("");
});

test("long text is truncated to at most 181 chars including ellipsis", () => {
  const out = truncateSnippet(LONG_TEXT);
  expect(out.length <= 181).toBeTruthy();
  expect(out.endsWith("…")).toBeTruthy();
});

test("truncation never cuts mid-word", () => {
  const out = truncateSnippet(LONG_TEXT);
  const kept = out.slice(0, -1); // strip ellipsis
  // the kept text must be a prefix of the source ending exactly at a word boundary
  expect(LONG_TEXT.startsWith(kept)).toBeTruthy();
  expect(LONG_TEXT[kept.length]).toBe(" ");
});

test("text exactly at the limit is not truncated", () => {
  const exact = "a".repeat(90) + " " + "b".repeat(89); // 180 chars
  expect(truncateSnippet(exact)).toBe(exact);
});

// ── buildFewShotSection: tiers ──

console.log("\nbuildFewShotSection tiers:");

test("Tier 1 (0 approved): static archetype examples with format reference", () => {
  const section = buildFewShotSection([], "variety");
  expect(section).toContain("# EXAMPLE CLIPS (Reference Format)");
  expect(section).toContain("Timestamp:"); // static structural refs keep timestamps
});

test("Tier 1: null approvedClips treated as empty", () => {
  const section = buildFewShotSection(null, "variety");
  expect(section).toContain("# EXAMPLE CLIPS (Reference Format)");
});

test("Tier 2 (2 approved): real snippets quoted, static padding to 5", () => {
  const section = buildFewShotSection([approvedRow(), approvedRow({ title: "Second Clip" })], "variety");
  expect(section).toContain("# EXAMPLES OF CLIPS THIS CREATOR HAS APPROVED");
  expect(section).toContain('"oh my god did you see that save');
  expect(section).toContain("Title: Second Clip");
  expect(section).toContain("## Additional Reference Examples");
});

test("Tier 2: real-clip entries carry no cross-video timestamps", () => {
  const section = buildFewShotSection([approvedRow()], "variety");
  const realPart = section.split("## Additional Reference Examples")[0];
  expect(realPart).notToContain("Timestamp:");
  expect(realPart).notToContain("00:41:12");
});

test("Tier 2 (5+ approved): no static padding", () => {
  const clips = Array.from({ length: 6 }, (_, i) => approvedRow({ title: `Clip ${i}` }));
  const section = buildFewShotSection(clips, "variety");
  expect(section).notToContain("Additional Reference Examples");
});

test("Tier 3 (20 approved): snippets only, no static examples, no timestamps", () => {
  const clips = Array.from({ length: 20 }, (_, i) => approvedRow({ title: `Clip ${i}` }));
  const section = buildFewShotSection(clips, "variety");
  expect(section).toContain("# EXAMPLES OF CLIPS THIS CREATOR HAS APPROVED");
  expect(section).notToContain("Additional Reference Examples");
  expect(section).notToContain("Timestamp:");
});

test("energy level shown per entry", () => {
  const section = buildFewShotSection([approvedRow({ energy_level: "EXPLOSIVE" })], "variety");
  expect(section).toContain("Energy: EXPLOSIVE");
});

test("#236: placeholder 'Clip N' titles suppressed, real titles kept", () => {
  const section = buildFewShotSection(
    [approvedRow({ title: "Clip 15" }), approvedRow({ title: "Actual Banger" })],
    "variety"
  );
  expect(section).notToContain("Title: Clip 15");
  expect(section).toContain("Title: Actual Banger");
});

test("#236: empty title emits no Title line when snippet exists", () => {
  const section = buildFewShotSection([approvedRow({ title: "" })], "variety");
  const realPart = section.split("## Additional Reference Examples")[0];
  expect(realPart).notToContain("Title:");
});

// ── buildFewShotSection: legacy rows & budget ──

console.log("\nbuildFewShotSection edge cases:");

test("approved row with empty transcript_segment is skipped without crashing", () => {
  const section = buildFewShotSection(
    [approvedRow({ transcript_segment: "", title: "Legacy Row" }), approvedRow({ title: "Good Row" })],
    "variety"
  );
  expect(section).notToContain("Legacy Row");
  expect(section).toContain("Title: Good Row");
});

test("all rows empty falls back to static padding, no crash", () => {
  const clips = Array.from({ length: 20 }, () => approvedRow({ transcript_segment: "" }));
  const section = buildFewShotSection(clips, "variety");
  expect(section).toContain("Additional Reference Examples");
});

test("approved section respects its character budget", () => {
  const clips = Array.from({ length: 40 }, (_, i) => approvedRow({ transcript_segment: LONG_TEXT, title: `Clip ${i}` }));
  const section = buildFewShotSection(clips, "variety");
  // budget is 3000 chars of entries + ~350 char header
  expect(section.length).toBeLessThan(3500);
});

// ── buildRejectedSection ──

console.log("\nbuildRejectedSection:");

test("null / undefined / empty list omit the section cleanly", () => {
  expect(buildRejectedSection(null)).toBeNull();
  expect(buildRejectedSection(undefined)).toBeNull();
  expect(buildRejectedSection([])).toBeNull();
});

test("rejected clips render header, framing, and quoted snippets", () => {
  const section = buildRejectedSection([rejectedRow()]);
  expect(section).toContain("# MOMENTS THIS CREATOR REJECTED");
  expect(section).toContain("do NOT pick moments like these");
  expect(section).toContain('"so anyway like i was telling chat');
});

test("user_note appears verbatim when present", () => {
  const section = buildRejectedSection([rejectedRow({ user_note: "just me talking to chat, not a highlight" })]);
  expect(section).toContain("Creator's note: just me talking to chat, not a highlight");
});

test("no note line when user_note is empty", () => {
  const section = buildRejectedSection([rejectedRow({ user_note: "" })]);
  expect(section).notToContain("Creator's note:");
});

test("rejected entries carry no cross-video timestamps", () => {
  const section = buildRejectedSection([rejectedRow()]);
  expect(section).notToContain("Timestamp:");
  expect(section).notToContain("01:02:00");
});

test("legacy row with empty segment and no note is skipped; all-empty yields null", () => {
  const section = buildRejectedSection([rejectedRow({ transcript_segment: "", user_note: "" })]);
  expect(section).toBeNull();
});

test("row with empty segment but a note is still included", () => {
  const section = buildRejectedSection([rejectedRow({ transcript_segment: "", user_note: "boring" })]);
  expect(section).toContain("Creator's note: boring");
});

test("rejected section respects its character budget", () => {
  const clips = Array.from({ length: 40 }, (_, i) => rejectedRow({ transcript_segment: LONG_TEXT, title: `Rej ${i}` }));
  const section = buildRejectedSection(clips);
  // 3000 chars of entries + intro framing + group headers (#232). The ceiling
  // rose 3600 → 3850 for #381's "these are moments, not banned words" framing —
  // fixed header prose, not history growth. SECTION_CHAR_BUDGET still caps the
  // only part that scales with how much feedback exists.
  expect(section.length).toBeLessThan(3850);
});

// ── buildRejectedSection: reason filtering (#198) ──

console.log("\nbuildRejectedSection reason filtering:");

test("duplicate rejections are excluded from the negative set", () => {
  expect(buildRejectedSection([rejectedRow({ reject_reasons: "duplicate" })])).toBeNull();
});

test("bad-cut and wrong-content rejections are excluded too", () => {
  expect(buildRejectedSection([rejectedRow({ reject_reasons: "bad-cut" })])).toBeNull();
  expect(buildRejectedSection([rejectedRow({ reject_reasons: "wrong-content" })])).toBeNull();
});

test("any excluded reason wins over a taste reason on the same row", () => {
  expect(buildRejectedSection([rejectedRow({ reject_reasons: "duplicate,not-funny" })])).toBeNull();
});

test("taste rejections land under a reason group header (#232)", () => {
  const section = buildRejectedSection([rejectedRow({ reject_reasons: "not-funny" })]);
  expect(section).toContain("## Rejected because: not funny");
});

test("extra reasons beyond the group's own render as Also tagged (#232)", () => {
  const section = buildRejectedSection([rejectedRow({ reject_reasons: "nothing-happens,needs-context" })]);
  expect(section).toContain("## Rejected because: nothing happens");
  expect(section).toContain("Also tagged: needs context a viewer wouldn't have");
});

test("single-reason rows carry no redundant reason line inside their group (#232)", () => {
  const section = buildRejectedSection([rejectedRow({ reject_reasons: "not-funny" })]);
  expect(section).notToContain("Also tagged:");
  expect(section).notToContain("Reason:");
});

test("reason-less rows group under the no-stated-reason header (#232)", () => {
  const section = buildRejectedSection([rejectedRow()]);
  expect(section).toContain("# MOMENTS THIS CREATOR REJECTED");
  expect(section).toContain("## Rejected without a stated reason");
  expect(section).notToContain("Reason:");
});

test("excluded rows are filtered while taste rows survive in the same batch", () => {
  const section = buildRejectedSection([
    rejectedRow({ reject_reasons: "duplicate", title: "Dupe Row", transcript_segment: "the duplicate moment snippet here" }),
    rejectedRow({ reject_reasons: "not-funny", title: "Unfunny Row", transcript_segment: "the unfunny moment snippet here" }),
  ]);
  expect(section).notToContain("the duplicate moment snippet");
  expect(section).toContain("the unfunny moment snippet");
});

test("unknown reason keys pass through as a raw group header", () => {
  const section = buildRejectedSection([rejectedRow({ reject_reasons: "some-future-reason" })]);
  expect(section).toContain("## Rejected because: some-future-reason");
});

// ── #232: new chips, tagged-first ordering, grouping ──

console.log("\nbuildRejectedSection #232 grouping:");

test("repetitive (too similar) is excluded as mechanical, like duplicate", () => {
  expect(buildRejectedSection([rejectedRow({ reject_reasons: "repetitive" })])).toBeNull();
});

test("new taste chips render their own groups", () => {
  const section = buildRejectedSection([
    rejectedRow({ reject_reasons: "setup-talk", transcript_segment: "my headphones are not working today bro" }),
    rejectedRow({ reject_reasons: "live-only", transcript_segment: "one more tomorrow ladies and gentlemen" }),
  ]);
  expect(section).toContain("## Rejected because: stream setup / tech talk, not content");
  expect(section).toContain("## Rejected because: worked live, but doesn't stand alone as a short");
});

// ── buildRejectedSection: delivery tier never teaches from words (#381) ──

console.log("\nbuildRejectedSection delivery tier (#381):");

test("a delivery-only rejection is dropped — its words were never the problem", () => {
  expect(buildRejectedSection([rejectedRow({ reject_reasons: "flat-delivery" })])).toBeNull();
  expect(buildRejectedSection([rejectedRow({ reject_reasons: "sounds-angry" })])).toBeNull();
  expect(buildRejectedSection([rejectedRow({ reject_reasons: "flat-delivery,sounds-angry" })])).toBeNull();
});

test("delivery alongside a content reason keeps the row — the content verdict is real", () => {
  const section = buildRejectedSection([rejectedRow({
    reject_reasons: "nothing-happens,flat-delivery",
    transcript_segment: "lets go lets go for two no way okay bro",
  })]);
  expect(section).toContain("lets go lets go for two");
  expect(section).toContain("## Rejected because: nothing happens");
  expect(section).toContain("Also tagged: the reaction didn't carry it");
});

test("a quote never lands under a delivery header, whichever chip was tapped first", () => {
  // reasons[0] is the first chip TAPPED — grouping must skip it and use the
  // content reason, or the words get filed under "fell flat".
  const section = buildRejectedSection([rejectedRow({
    reject_reasons: "flat-delivery,nothing-happens",
    transcript_segment: "get him out of my face lets go",
  })]);
  expect(section).toContain("## Rejected because: nothing happens");
  expect(section).notToContain("## Rejected because: the reaction didn't carry it");
});

test("delivery-only rows are dropped while content rows survive the same batch", () => {
  const section = buildRejectedSection([
    rejectedRow({ reject_reasons: "sounds-angry", transcript_segment: "the angry delivery snippet here" }),
    rejectedRow({ reject_reasons: "no-payoff", transcript_segment: "the no payoff snippet here" }),
  ]);
  expect(section).notToContain("the angry delivery snippet");
  expect(section).toContain("the no payoff snippet");
});

test("the section tells the model quotes are moments, not banned words (#381)", () => {
  const section = buildRejectedSection([rejectedRow({ reject_reasons: "not-funny" })]);
  expect(section).toContain("NOT words to avoid");
  expect(section).toContain("never disqualifies a moment");
});

// ── Shared vocabulary catalogue (#381) ──
// These are the anti-drift guards. The keys, UI labels, prompt prose and the
// excluded lists used to live in four hand-synced places; a chip added to one
// and forgotten in another rendered as a raw key in the prompt.

console.log("\nshared reject-reason catalogue (#381):");

test("every chip carries exactly one tier and appears in exactly one tier list", () => {
  for (const r of REJECT_REASONS) {
    const inLists = [
      BOOKKEEPING_REJECT_REASONS.includes(r.key),
      DELIVERY_REJECT_REASONS.includes(r.key),
      REJECT_GROUP_ORDER.includes(r.key),
    ].filter(Boolean).length;
    if (inLists !== 1) throw new Error(`${r.key} appears in ${inLists} tier lists, expected 1`);
    if (tierOf(r.key) !== r.tier) throw new Error(`${r.key} tierOf disagrees with catalogue`);
  }
});

test("every chip has prompt prose — none can render as a raw key", () => {
  for (const r of REJECT_REASONS) {
    if (!REJECT_REASON_LABELS[r.key]) throw new Error(`${r.key} has no prose label`);
    if (!r.label || !r.hint) throw new Error(`${r.key} is missing a UI label or hint`);
  }
});

test("chip keys are unique", () => {
  const keys = REJECT_REASONS.map((r) => r.key);
  expect(new Set(keys).size).toBe(keys.length);
});

// The runner's toContain is string-only and notToContain passes silently on a
// non-string — so compare delimited key lists, not raw arrays.
const keyList = (opts) => "," + getReasonChips(opts).map((r) => r.key).join(",") + ",";

test("taste chips follow the creator's ranked priorities", () => {
  const hype = keyList({ momentPriorities: ["funny", "emotional", "clutch", "fails", "skillful", "educational"] });
  expect(hype).toContain(",not-funny,");
  expect(hype).toContain(",no-reaction,");
  expect(hype).toContain(",no-stakes,");
  expect(hype).notToContain(",teaches-nothing,");
  expect(hype).notToContain(",not-impressive,");

  const teacher = keyList({ momentPriorities: ["educational", "skillful", "clutch", "funny", "emotional", "fails"] });
  expect(teacher).toContain(",teaches-nothing,");
  expect(teacher).toContain(",not-impressive,");
  expect(teacher).toContain(",no-stakes,");
  expect(teacher).notToContain(",not-funny,");
});

test("fails shares the not-funny chip — a fail that isn't entertaining is just unfunny", () => {
  const fails = keyList({ momentPriorities: ["fails", "skillful", "educational"] });
  expect(fails).toContain(",not-funny,");
});

test("no stored profile falls back to the default priority order (#381)", () => {
  // A fresh install, or the tick before the store read resolves, must still
  // offer taste chips — not a row of bookkeeping reasons only.
  const bare = keyList({});
  expect(bare).toContain(",not-funny,");
  expect(bare).toContain(",no-stakes,");
  expect(bare).toContain(",no-reaction,");
  expect(bare).notToContain(",teaches-nothing,");
});

test("react shows get the reaction chip, gameplay does not", () => {
  expect(keyList({ entryType: "content" })).toContain(",reaction-adds-nothing,");
  expect(keyList({ entryType: "game" })).notToContain(",reaction-adds-nothing,");
});

test("a reason already stored on the clip is always offered back (#381)", () => {
  // Reordering priorities in Settings must never hide a reason an old clip
  // already carries — it would stay in the prompt but vanish from the UI.
  const teacher = { momentPriorities: ["educational", "skillful", "clutch"] };
  expect(keyList(teacher)).notToContain(",not-funny,");
  expect(keyList({ ...teacher, include: ["not-funny"] })).toContain(",not-funny,");
  expect(keyList({ entryType: "game", include: ["reaction-adds-nothing"] })).toContain(",reaction-adds-nothing,");
});

test("an unknown stored key still gets a chip so it can be removed", () => {
  const chips = getReasonChips({ include: ["some-legacy-key"] });
  const found = chips.find((r) => r.key === "some-legacy-key");
  expect(Boolean(found)).toBe(true);
  expect(found.label).toBe("some-legacy-key");
});

test("core chips are offered whatever the creator ranked or the entry type", () => {
  for (const opts of [{}, { entryType: "content" }, { momentPriorities: ["educational"] }]) {
    const keys = getReasonChips(opts).map((r) => r.key);
    for (const core of ["nothing-happens", "live-only", "no-payoff", "needs-context", "flat-delivery", "sounds-angry", "duplicate", "bad-cut"]) {
      if (!keys.includes(core)) throw new Error(`core chip ${core} missing for ${JSON.stringify(opts)}`);
    }
  }
});

test("an unknown future key still teaches and can head a group", () => {
  expect(tierOf("some-future-reason")).toBe("content");
  expect(teachesFromWords(["some-future-reason"])).toBe(true);
  expect(groupKeyFor(["flat-delivery", "some-future-reason"])).toBe("some-future-reason");
});

test("an untagged row still teaches (pre-#198 history)", () => {
  expect(teachesFromWords([])).toBe(true);
  expect(groupKeyFor([])).toBeNull();
});

test("tagged rows outrank more-recent untagged rows for the budget (#232)", () => {
  // Untagged row listed first = more recent in the DB fetch, but the tagged
  // row must appear first in the section.
  const section = buildRejectedSection([
    rejectedRow({ transcript_segment: "untagged recent moment snippet" }),
    rejectedRow({ reject_reasons: "not-funny", transcript_segment: "tagged older moment snippet" }),
  ]);
  const taggedIdx = section.indexOf("tagged older moment snippet");
  const untaggedIdx = section.indexOf("untagged recent moment snippet");
  expect(taggedIdx >= 0).toBeTruthy();
  expect(untaggedIdx >= 0).toBeTruthy();
  expect(taggedIdx < untaggedIdx).toBeTruthy();
});

test("untagged rows are dropped when tagged rows exhaust the budget (#232)", () => {
  const tagged = Array.from({ length: 40 }, (_, i) =>
    rejectedRow({ reject_reasons: "not-funny", transcript_segment: LONG_TEXT, title: `Tagged ${i}` })
  );
  // Straggler is full-length too, so the leftover budget genuinely can't fit it.
  const section = buildRejectedSection([rejectedRow({ transcript_segment: LONG_TEXT }), ...tagged]);
  expect(section).notToContain("## Rejected without a stated reason");
});

test("rows sharing a first reason collapse into one group", () => {
  const section = buildRejectedSection([
    rejectedRow({ reject_reasons: "not-funny", transcript_segment: "first unfunny snippet" }),
    rejectedRow({ reject_reasons: "not-funny,needs-context", transcript_segment: "second unfunny snippet" }),
  ]);
  const occurrences = section.split("## Rejected because: not funny").length - 1;
  expect(occurrences).toBe(1);
  expect(section).toContain("first unfunny snippet");
  expect(section).toContain("second unfunny snippet");
});

// ── buildSystemPrompt end-to-end ──

console.log("\nbuildSystemPrompt:");

function buildFullPrompt({ approved = [], rejected = [] } = {}) {
  return buildSystemPrompt({
    gameTag: "ZZTEST",
    gameName: "Test Game",
    gameContext: "A test game about testing.",
    entryType: "game",
    approvedClips: approved,
    rejectedClips: rejected,
    creatorProfile: null,
  });
}

test("core sections always present", () => {
  const prompt = buildFullPrompt();
  expect(prompt).toContain("# TASK");
  expect(prompt).toContain("# CREATOR PROFILE");
  expect(prompt).toContain("# GAME CONTEXT");
  expect(prompt).toContain("# CLIP SELECTION RULES");
  expect(prompt).toContain("# OUTPUT FORMAT");
});

test("game context under the cap passes through with structure intact (#245)", () => {
  const prompt = buildSystemPrompt({
    gameTag: "ZZTEST", gameName: "Test Game", entryType: "game",
    gameContext: "First paragraph.\n\nSecond paragraph.",
    approvedClips: [], creatorProfile: null,
  });
  expect(prompt).toContain("About this game:\nFirst paragraph.\n\nSecond paragraph.");
});

test("game context over 1,500 chars is capped at a word boundary (#245)", () => {
  const long = ("word ".repeat(400)).trim() + " FINALMARKER"; // ~2,012 chars
  const prompt = buildSystemPrompt({
    gameTag: "ZZTEST", gameName: "Test Game", entryType: "game",
    gameContext: long,
    approvedClips: [], creatorProfile: null,
  });
  expect(prompt).notToContain("FINALMARKER");
  const injected = prompt.split("About this game:\n")[1].split("\n\n")[0];
  expect(injected.length).toBeLessThan(1502); // 1,500 + ellipsis
  expect(injected.endsWith("…")).toBeTruthy();
  expect(injected).notToContain("wor…"); // never mid-word
});

test("both feedback sections present when both datasets exist", () => {
  const prompt = buildFullPrompt({ approved: [approvedRow()], rejected: [rejectedRow()] });
  expect(prompt).toContain("# EXAMPLES OF CLIPS THIS CREATOR HAS APPROVED");
  expect(prompt).toContain("# MOMENTS THIS CREATOR REJECTED");
});

test("approved section comes before rejected section", () => {
  const prompt = buildFullPrompt({ approved: [approvedRow()], rejected: [rejectedRow()] });
  const approvedIdx = prompt.indexOf("# EXAMPLES OF CLIPS THIS CREATOR HAS APPROVED");
  const rejectedIdx = prompt.indexOf("# MOMENTS THIS CREATOR REJECTED");
  expect(approvedIdx < rejectedIdx).toBeTruthy();
});

test("rejected section absent when the game has no rejections", () => {
  const prompt = buildFullPrompt({ approved: [approvedRow()] });
  expect(prompt).notToContain("# MOMENTS THIS CREATOR REJECTED");
});

test("rejectedClips param optional — omitting it does not crash", () => {
  const prompt = buildSystemPrompt({
    gameTag: "ZZTEST",
    gameName: "Test Game",
    gameContext: "",
    entryType: "game",
    approvedClips: [approvedRow()],
    creatorProfile: null,
  });
  expect(prompt).toContain("# EXAMPLES OF CLIPS THIS CREATOR HAS APPROVED");
  expect(prompt).notToContain("# MOMENTS THIS CREATOR REJECTED");
});

// ── #200: clip count calibrates to source duration, no fixed minimum ──

test("short recording states its length; floor fills with distinct clips, never duplicates (#200)", () => {
  const prompt = buildSystemPrompt({
    gameTag: "ZZTEST", gameName: "Test Game", gameContext: "", entryType: "game",
    approvedClips: [], creatorProfile: null, sourceDuration: 69,
  });
  expect(prompt).toContain("This recording is ~1 minute long.");
  expect(prompt).toContain("one clip per 90 seconds of recording, minimum 10, maximum 25");
  expect(prompt).toContain("as many non-overlapping clips as it can physically hold");
  expect(prompt).notToContain("10-20 clip recommendations");
  expect(prompt).notToContain("Do not return fewer than 10");
});

test("long recording rounds to minutes and keeps the overlap ban (#200)", () => {
  const prompt = buildSystemPrompt({
    gameTag: "ZZTEST", gameName: "Test Game", gameContext: "", entryType: "game",
    approvedClips: [], creatorProfile: null, sourceDuration: 1800,
  });
  expect(prompt).toContain("This recording is ~30 minutes long.");
  expect(prompt).toContain("must not overlap");
});

test("sourceDuration omitted — no length line, floor still present (#200)", () => {
  const prompt = buildFullPrompt();
  expect(prompt).notToContain("This recording is ~");
  expect(prompt).toContain("one clip per 90 seconds of recording, minimum 10, maximum 25");
});

test("borderline moments fill slots at low confidence; empty array banned (#200)", () => {
  const prompt = buildFullPrompt();
  expect(prompt).toContain("honest low confidence");
  expect(prompt).toContain("Never return an empty array");
});

test("rejected section fences taste from volume (#200)", () => {
  const section = buildRejectedSection([rejectedRow()]);
  expect(section).toContain("not HOW MANY clips to return");
});

test("combined approved + rejected content stays within ~6k budget", () => {
  const approved = Array.from({ length: 40 }, () => approvedRow({ transcript_segment: LONG_TEXT }));
  const rejected = Array.from({ length: 40 }, () => rejectedRow({ transcript_segment: LONG_TEXT }));
  const prompt = buildFullPrompt({ approved, rejected });
  const start = prompt.indexOf("# EXAMPLES OF CLIPS THIS CREATOR HAS APPROVED");
  const combined = prompt.slice(start);
  expect(combined.length).toBeLessThan(7150); // 6k entries + headers/framing (+#381 framing)
});

test("real snippets from both sections appear with no timestamps anywhere in them", () => {
  // 5 approved → no static padding, so the feedback part is purely real clips
  const approved = Array.from({ length: 5 }, (_, i) => approvedRow({ title: `Clip ${i}` }));
  const prompt = buildFullPrompt({ approved, rejected: [rejectedRow()] });
  const start = prompt.indexOf("# EXAMPLES OF CLIPS THIS CREATOR HAS APPROVED");
  const feedbackPart = prompt.slice(start);
  expect(feedbackPart).notToContain("Timestamp:");
  expect(feedbackPart).notToContain("00:41:12");
  expect(feedbackPart).notToContain("01:02:00");
});

// ── selectTimelineEvents (#237) ──

// n same-signal events tied at `score`, spaced 60s apart (no gap collapsing)
function evts(signal, n, score, { t0 = 0, step = 60 } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    t_start: t0 + i * step, t_end: t0 + i * step + 3, signal, score, label: signal,
  }));
}

test("saturated signal is capped while slots contend (#237)", () => {
  const events = [...evts("pitch_spike", 200, 1.0), ...evts("game_energy", 8, 0.6)];
  const picked = aiPrompt.selectTimelineEvents(events, { limit: 18 });
  expect(picked.filter((e) => e.signal === "pitch_spike").length).toBe(10);
  expect(picked.filter((e) => e.signal === "game_energy").length).toBe(8);
});

test("sub-1.0 signals land despite hundreds of 1.0 ties (#237)", () => {
  const events = [
    ...evts("pitch_spike", 200, 1.0),
    ...evts("transcript_density", 200, 1.0),
    ...evts("reaction_words", 200, 1.0),
    ...evts("gemini_visual", 9, 0.75),
  ];
  const picked = aiPrompt.selectTimelineEvents(events);
  expect(picked.filter((e) => e.signal === "gemini_visual").length).toBe(9);
});

test("same-signal events within 10s collapse to one line (#237)", () => {
  // 10 overlapping windows of one scream (1s apart, midpoints span 9s) + one distinct burst later
  const events = [...evts("pitch_spike", 10, 1.0, { step: 1 }), ...evts("pitch_spike", 1, 0.9, { t0: 300 })];
  const picked = aiPrompt.selectTimelineEvents(events);
  expect(picked.length).toBe(2);
  expect(picked[0].t_start).toBe(0);
  expect(picked[1].t_start).toBe(300);
});

test("near-duplicates of DIFFERENT signals both keep their line (#237)", () => {
  const events = [...evts("pitch_spike", 1, 1.0), ...evts("reaction_words", 1, 0.9)];
  expect(aiPrompt.selectTimelineEvents(events).length).toBe(2);
});

test("backfill past the cap when few signals are present (#237)", () => {
  const events = [...evts("pitch_spike", 100, 1.0), ...evts("reaction_words", 20, 0.8)];
  const picked = aiPrompt.selectTimelineEvents(events);
  expect(picked.length).toBe(50);
  // capped pass: 10 + 10; backfill fills the rest best-score-first (pitch 1.0 > reaction 0.8)
  expect(picked.filter((e) => e.signal === "pitch_spike").length).toBe(40);
  expect(picked.filter((e) => e.signal === "reaction_words").length).toBe(10);
});

test("fewer events than the limit — all render, none invented (#237)", () => {
  const picked = aiPrompt.selectTimelineEvents(evts("pitch_spike", 5, 0.7));
  expect(picked.length).toBe(5);
});

test("result is sorted by score descending (#237)", () => {
  const events = [...evts("game_energy", 3, 0.5), ...evts("gemini_visual", 3, 0.9), ...evts("pitch_spike", 3, 1.0)];
  const picked = aiPrompt.selectTimelineEvents(events);
  const scores = picked.map((e) => e.score);
  expect(scores.every((s, i) => i === 0 || s <= scores[i - 1])).toBe(true);
});

test("buildUserContent timeline section shows a signal mix, not one signal (#237)", () => {
  // 5 signals x 10+ events fill the 50 slots exactly — no backfill, caps visible
  const eventTimeline = {
    events: [
      ...evts("pitch_spike", 200, 1.0),
      ...evts("transcript_density", 200, 1.0),
      ...evts("reaction_words", 200, 1.0),
      ...evts("game_energy", 10, 0.6),
      ...evts("game_yamnet", 10, 0.5),
    ],
    signals_computed: ["pitch_spike", "transcript_density", "reaction_words", "game_energy", "game_yamnet"],
    signals_failed: [],
  };
  const content = aiPrompt.buildUserContent({ claudeReadyText: "transcript", frames: [], eventTimeline });
  const section = content.find((c) => c.text && c.text.includes("Multi-Signal Event Timeline")).text;
  expect((section.match(/\[pitch_spike\]/g) || []).length).toBe(10);
  expect((section.match(/\[game_energy\]/g) || []).length).toBe(10);
  expect((section.match(/\[game_yamnet\]/g) || []).length).toBe(10);
  expect(section).toContain("max 10 per signal");
});

// ── Summary ──

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
