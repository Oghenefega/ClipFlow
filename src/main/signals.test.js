// #190 unit test: every archetype weight row sums to 1 after the game-audio
// extension, and removing the game keys (feature off / single-track source)
// restores the pre-#190 mic-only split exactly — the "single-track users see
// zero behavior change" invariant.
//
// Run: node src/main/signals.test.js
const assert = require("assert");
const { ARCHETYPE_WEIGHTS, redistributeWeights } = require("./signals");

const EPS = 1e-9;

// The weight tables as they stood before #190 (mic-side signals only).
const PRE_190 = {
  hype:        { energy: 0.55, yamnet: 0.15, pitch: 0.10, density: 0.05, reaction_words: 0.10, spike: 0.05 },
  competitive: { energy: 0.45, yamnet: 0.15, pitch: 0.15, density: 0.10, reaction_words: 0.10, spike: 0.05 },
  chill:       { energy: 0.35, yamnet: 0.10, pitch: 0.20, density: 0.15, reaction_words: 0.15, spike: 0.05 },
  variety:     { energy: 0.45, yamnet: 0.15, pitch: 0.15, density: 0.10, reaction_words: 0.10, spike: 0.05 },
};

let failures = 0;

for (const [archetype, row] of Object.entries(ARCHETYPE_WEIGHTS)) {
  try {
    const sum = Object.values(row).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < EPS, `${archetype}: weights sum to ${sum}, expected 1`);

    assert.ok(row.game_energy > 0, `${archetype}: missing game_energy weight`);
    assert.ok(row.game_yamnet > 0, `${archetype}: missing game_yamnet weight`);

    // Single-track equivalence: dropping the game keys must renormalize back
    // to the pre-#190 table.
    const fallback = redistributeWeights(row, ["game_energy", "game_yamnet"]);
    for (const [key, expected] of Object.entries(PRE_190[archetype])) {
      assert.ok(
        Math.abs(fallback[key] - expected) < EPS,
        `${archetype}.${key}: single-track fallback ${fallback[key]}, expected ${expected}`
      );
    }
    assert.strictEqual(fallback.game_energy, 0, `${archetype}: game_energy weight not zeroed`);
    assert.strictEqual(fallback.game_yamnet, 0, `${archetype}: game_yamnet weight not zeroed`);

    console.log(`ok   ${archetype}: sums to 1, single-track fallback matches pre-#190 weights`);
  } catch (e) {
    console.error(`FAIL ${e.message}`);
    failures++;
  }
}

if (failures) {
  console.error(`\n${failures} archetype(s) failed`);
  process.exit(1);
}
console.log("\nAll archetype weight rows pass.");
