/**
 * Unit tests for the Gemini full-watch merge (#235) — actor classification
 * (incl. the "opponent's net" possessive regression caught in session 147)
 * and the actor-aware raw-confidence merge.
 *
 * Run: node src/main/gemini-watch.test.js
 */

// gemini-watch requires ai-prompt → game-profiles, which requires electron at
// module top. Stub it so the module is testable under plain node.
const Module = require("module");
const os = require("os");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") {
    return { app: { isPackaged: false, getPath: () => os.tmpdir() } };
  }
  return origLoad.apply(this, arguments);
};

const { classifyActor, mergeVisualEvents } = require("./gemini-watch");

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

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label || "value"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log("\nclassifyActor — v2 actor-first phrasing:");

test("'The player ...' is player", () => {
  assertEqual(classifyActor("The player crashes into the finish line barrier."), "player");
});

test("'Teammate ...' is spectator", () => {
  assertEqual(classifyActor("Teammate Monkey D Fried executes a flashy flip reset goal."), "spectator");
});

test("'Opponent ...' is spectator", () => {
  assertEqual(classifyActor("Opponent scores a long shot from midfield."), "spectator");
});

test("'Unclear actor: ...' is unclear", () => {
  assertEqual(classifyActor("Unclear actor: the ball deflects in off a goalmouth scramble."), "unclear");
});

test("possessive regression: player goal into the opponent's net stays player", () => {
  // Session 147 classifier bug: \bopponent\b matched the possessive in
  // "...into the opponent's net" and dropped a genuine player goal.
  assertEqual(classifyActor("The player scores by shooting the ball into the opponent's net."), "player");
});

console.log("\nclassifyActor — v1-style fallback (no actor-first phrasing):");

test("mid-sentence teammate is spectator", () => {
  assertEqual(classifyActor("A goal is scored by a teammate after a long pass."), "spectator");
});

test("mid-sentence possessive alone does not mean spectator", () => {
  assertEqual(classifyActor("A shot ricochets into the opponent's net for a goal."), "unclear");
});

test("mid-sentence 'the player' is player", () => {
  assertEqual(classifyActor("A wild ragdoll sends the player flying off the track."), "player");
});

test("empty / missing text is unclear", () => {
  assertEqual(classifyActor(""), "unclear");
  assertEqual(classifyActor(undefined), "unclear");
});

console.log("\nmergeVisualEvents — actor-aware raw-confidence merge:");

function makeTimeline() {
  return {
    events: [
      { t_start: 10, t_end: 15, signal: "pitch_spike", score: 1.0, label: "spike" },
      { t_start: 40, t_end: 45, signal: "game_energy", score: 0.73, label: "goal_horn" },
    ],
    signals_computed: ["pitch_spike", "game_energy"],
  };
}

const WATCH_EVENTS = [
  { t_start_s: 331, t_end_s: 360, score: 0.92, label: "own_goal", what: "The player scores an own goal under pressure." },
  { t_start_s: 1109, t_end_s: 1150, score: 0.93, label: "overtime_winner_goal", what: "Teammate scores a flashy overtime winner." },
  { t_start_s: 610, t_end_s: 622, score: 0.72, label: "goalmouth_scramble", what: "Unclear actor: the ball squeaks in off a scramble." },
];

test("spectator events are dropped, player + unclear merge", () => {
  const tl = makeTimeline();
  const counts = mergeVisualEvents(tl, WATCH_EVENTS, null);
  assertEqual({ player: counts.player, spectator: counts.spectator, unclear: counts.unclear }, { player: 1, spectator: 1, unclear: 1 }, "actor counts");
  const gem = tl.events.filter((e) => e.signal === "gemini_visual");
  assertEqual(gem.length, 2, "merged gemini events");
  assertEqual(gem.some((e) => e.label === "overtime_winner_goal"), false, "spectator event absent");
});

test("merged events keep raw confidence and map t_start_s/t_end_s", () => {
  const tl = makeTimeline();
  mergeVisualEvents(tl, WATCH_EVENTS, null);
  const own = tl.events.find((e) => e.label === "own_goal");
  assertEqual(own.score, 0.92, "raw score");
  assertEqual(own.t_start, 331, "t_start");
  assertEqual(own.t_end, 360, "t_end");
});

test("existing timeline events survive and signals_computed gains gemini_visual", () => {
  const tl = makeTimeline();
  mergeVisualEvents(tl, WATCH_EVENTS, null);
  assertEqual(tl.events.filter((e) => e.signal !== "gemini_visual").length, 2, "base events");
  assertEqual(tl.signals_computed, ["pitch_spike", "game_energy", "gemini_visual"], "signals_computed");
});

test("landed counts gemini lines surviving prompt selection", () => {
  const tl = makeTimeline();
  const counts = mergeVisualEvents(tl, WATCH_EVENTS, null);
  // Tiny timeline: both merged events fit under the per-signal cap.
  assertEqual(counts.landed, 2, "landed");
});

test("empty watch output merges nothing but still registers the signal", () => {
  const tl = makeTimeline();
  const counts = mergeVisualEvents(tl, [], null);
  assertEqual(tl.events.length, 2, "no events added");
  assertEqual(tl.signals_computed.includes("gemini_visual"), true, "signal registered");
  assertEqual({ player: counts.player, spectator: counts.spectator, unclear: counts.unclear, landed: counts.landed }, { player: 0, spectator: 0, unclear: 0, landed: 0 }, "counts");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(`  FAILED: ${f.name} — ${f.error}`);
  process.exit(1);
}
