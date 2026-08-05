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
  // 3000 chars of entries + intro framing + group headers (#232)
  expect(section.length).toBeLessThan(3600);
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
    rejectedRow({ reject_reasons: "flat-delivery", transcript_segment: "yeah that happened i guess okay" }),
  ]);
  expect(section).toContain("## Rejected because: stream setup / tech talk, not content");
  expect(section).toContain("## Rejected because: flat delivery — the reaction didn't carry it");
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
  expect(combined.length).toBeLessThan(7000); // 6k entries + headers/framing
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
