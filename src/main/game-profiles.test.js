/**
 * Unit tests for the playstyle-update prompt builder (#192) — kept-clip
 * mining prompt: pattern threshold, aside exclusion, third person, data blocks.
 *
 * Run: node src/main/game-profiles.test.js
 */

// game-profiles requires electron at module top. Stub it for plain node.
const Module = require("module");
const os = require("os");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") {
    return { app: { isPackaged: false, getPath: () => os.tmpdir() } };
  }
  return origLoad.apply(this, arguments);
};

const { buildPlaystylePrompt } = require("./game-profiles");

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
    toBeTruthy() {
      if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
    },
  };
}

// ── Fixtures ──

const APPROVED = [
  { transcript_segment: "what a save what a save what a save calculated", title: "Triple Save Madness", user_note: "" },
  { transcript_segment: "he flew across the whole map for that demo bro", title: "Cross-Map Demo", user_note: "love the chaos ones" },
];

const ROUNDS = [
  { transcript: "did he just air dribble off my head", final_title: "Air Dribble Disrespect", published_at: "2026-07-01" },
  { transcript: null, final_title: "Backfilled Title Only", published_at: "2026-06-20" },
];

function build(overrides = {}) {
  return buildPlaystylePrompt({
    gameName: "Rocket League",
    currentPlayStyle: "Existing profile text.",
    approvedClips: APPROVED,
    publishedRounds: ROUNDS,
    creatorName: "Fega",
    ...overrides,
  });
}

// ── System prompt rules ──

console.log("\nsystem prompt rules:");

test("mines KEPT clips, not raw transcripts", () => {
  const { system } = build();
  expect(system).toContain("KEPT clips");
  expect(system).notToContain("session transcripts");
});

test("pattern threshold: at least 2 kept clips", () => {
  const { system } = build();
  expect(system).toContain("at least 2 kept clips");
});

test("one-off asides are excluded by rule", () => {
  const { system } = build();
  expect(system).toContain("One-off conversational asides are noise");
});

test("third person with the creator's name", () => {
  const { system } = build();
  expect(system).toContain('"Fega does X"');
});

test("creator name falls back to 'the creator'", () => {
  const { system } = build({ creatorName: undefined });
  expect(system).toContain("the creator");
  expect(system).notToContain("Fega");
});

test("length and output-format rules preserved", () => {
  const { system } = build();
  expect(system).toContain("150-300 words");
  expect(system).toContain("Output ONLY the profile text");
});

// ── User message data blocks ──

console.log("\nuser message blocks:");

test("current profile included, with empty fallback", () => {
  expect(build().user).toContain("Existing profile text.");
  expect(build({ currentPlayStyle: "" }).user).toContain("(empty — no profile yet)");
});

test("approved snippets quoted and numbered with clip titles", () => {
  const { user } = build();
  expect(user).toContain('1. "what a save what a save what a save calculated"');
  expect(user).toContain("Clip title: Triple Save Madness");
  expect(user).toContain('2. "he flew across the whole map for that demo bro"');
});

test("approved creator notes included when present", () => {
  const { user } = build();
  expect(user).toContain("Creator's note: love the chaos ones");
});

test("published rounds show final titles as ground truth", () => {
  const { user } = build();
  expect(user).toContain('Published title: "Air Dribble Disrespect"');
  expect(user).toContain('What was said: "did he just air dribble off my head"');
});

test("published round without transcript still contributes its title", () => {
  const { user } = build();
  expect(user).toContain('Published title: "Backfilled Title Only"');
});

test("block counts reflect usable entries", () => {
  const { user } = build();
  expect(user).toContain("APPROVED CLIP SNIPPETS (2 clips");
  expect(user).toContain("PUBLISHED CLIPS (2 clips");
});

test("approved row with no segment and no title is dropped", () => {
  const { user } = build({ approvedClips: [...APPROVED, { transcript_segment: "", title: "", user_note: "" }] });
  expect(user).toContain("APPROVED CLIP SNIPPETS (2 clips");
});

test("empty datasets render placeholders without crashing", () => {
  const { user } = build({ approvedClips: [], publishedRounds: [] });
  expect(user).toContain("APPROVED CLIP SNIPPETS (0 clips");
  expect(user).toContain("(none)");
});

test("long transcripts are excerpted at a word boundary", () => {
  const long = "word ".repeat(200).trim(); // ~1000 chars
  const { user } = build({ publishedRounds: [{ transcript: long, final_title: "Long One", published_at: "2026-07-02" }] });
  const match = user.match(/What was said: "([^"]+)"/);
  expect(match).toBeTruthy();
  expect(match[1].length <= 301).toBeTruthy();
  expect(match[1].endsWith("…")).toBeTruthy();
  expect(match[1]).notToContain("wor…"); // no mid-word cut
});

// ── Summary ──

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
