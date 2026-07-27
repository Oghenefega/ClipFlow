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
  expect(section.length).toBeLessThan(3500);
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

// ── Summary ──

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
