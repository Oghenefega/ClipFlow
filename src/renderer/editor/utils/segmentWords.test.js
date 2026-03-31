/**
 * Regression tests for segmentWords — per subtitle-segmentation-spec v1.1
 *
 * Run: node src/renderer/editor/utils/segmentWords.test.js
 */

// Simple test runner (no Jest dependency needed)
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  \u2717 ${name}`);
    console.log(`    ${e.message}`);
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual(expected) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) throw new Error(`Expected ${b}, got ${a}`);
    },
    toBeGreaterThanOrEqual(expected) {
      if (actual < expected) throw new Error(`Expected ${actual} >= ${expected}`);
    },
    toBeCloseTo(expected, precision = 4) {
      const diff = Math.abs(actual - expected);
      const tolerance = Math.pow(10, -precision);
      if (diff > tolerance) throw new Error(`Expected ${actual} to be close to ${expected} (diff: ${diff})`);
    },
  };
}

// ── Import (handle both ESM and CJS) ──
// We need to transpile ESM export for Node — use a dynamic approach
const fs = require("fs");
const path = require("path");

// Read the source and eval it as a module (quick hack for testing without build)
const src = fs.readFileSync(path.join(__dirname, "segmentWords.js"), "utf-8");
const transformed = src
  .replace(/^export function /gm, "function ")
  .replace(/^export \{[^}]*\};?$/gm, "")
  .replace(/^export /gm, "");
eval(transformed);

// Constants are now in scope from eval (MAX_WORDS, MAX_CHARS, etc.)

// ── Helper to make word objects ──
function w(word, start, end) {
  return { word, start, end, probability: 1, track: "s1" };
}

/** Extract just the text from segments for easy comparison */
function texts(segments) {
  return segments.map((s) => s.text);
}

// ══════════════════════════════════════════════
console.log("\nSubtitle Segmentation Tests (spec v1.1)");
console.log("═".repeat(50));

// ── Test 1: Sentence Boundary Violation ──
console.log("\nHard Walls:");

test("Test 1: Sentence boundary — never group across periods", () => {
  const words = [
    w("I'm", 0.0, 0.3), w("gonna", 0.3, 0.6), w("win", 0.6, 0.9),
    w("for", 0.95, 1.2), w("sure.", 1.2, 1.5),
    w("I", 1.55, 1.7), w("just", 1.7, 1.9), w("know", 1.9, 2.1),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  // "sure." and "I" must NEVER be in the same segment
  const sureSegIdx = t.findIndex((s) => s.includes("sure"));
  const iSegIdx = t.findIndex((s) => /\bI\b/.test(s) && !s.includes("I'm"));
  expect(sureSegIdx).toBe(sureSegIdx); // exists
  expect(sureSegIdx !== iSegIdx).toBe(true);
  // Verify "sure." is at end of its segment, not grouped with "I"
  expect(t[sureSegIdx].endsWith("sure.")).toBe(true);
});

// ── Test 2: Time Gap Violation ──
test("Test 2: Time gap — never group across 0.7s+ pauses", () => {
  const words = [
    w("I'm", 0.0, 0.3), w("that", 0.3, 0.6), w("guy", 0.6, 0.9),
    w("baby", 2.9, 3.2), // 2.0s gap after "guy"
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  // "guy" and "baby" must NEVER be in the same segment
  for (const seg of t) {
    expect(seg.includes("guy") && seg.includes("baby")).toBe(false);
  }
  // "baby" should be in its own segment (it's isolated by the gap wall)
  expect(t[t.length - 1]).toBe("baby");
});

// ── Test 3: Repeated Phrase Split ──
console.log("\nRepeated Phrases:");

test("Test 3: Repeated phrase — each repetition is its own segment", () => {
  const words = [
    w("let's", 0.0, 0.3), w("go", 0.3, 0.5),
    w("let's", 0.5, 0.8), w("go", 0.8, 1.0),
    w("let's", 1.0, 1.3), w("go", 1.3, 1.5),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  expect(t).toEqual(["let's go", "let's go", "let's go"]);
});

// ── Test 4: Single-Word Repeats ──
test("Test 4: Single-word repeats — each gets own segment", () => {
  const words = [
    w("no", 0.0, 0.2), w("no", 0.2, 0.4),
    w("no", 0.4, 0.6), w("no", 0.6, 0.8),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  expect(t).toEqual(["no", "no", "no", "no"]);
});

test("Test 4b: Single-word repeats — yo yo yo", () => {
  const words = [
    w("yo", 0.0, 0.2), w("yo", 0.2, 0.4), w("yo", 0.4, 0.6),
  ];
  const segs = segmentWords(words, "3word");
  expect(texts(segs)).toEqual(["yo", "yo", "yo"]);
});

// ── Test 5: Filler Word Isolation ──
console.log("\nFiller Words:");

test("Test 5: Filler isolation — um stands alone", () => {
  const words = [
    w("so", 0.0, 0.2), w("I", 0.2, 0.3), w("was", 0.3, 0.5),
    w("um", 0.5, 0.7),
    w("playing", 0.7, 1.0), w("the", 1.0, 1.1), w("game", 1.1, 1.4),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  // "um" must be its own segment — never grouped with adjacent words
  const umSeg = t.find((s) => s.includes("um"));
  expect(umSeg).toBe("um");
  // "um playing" must not exist
  expect(t.some((s) => s.includes("um playing"))).toBe(false);
});

test("Test 5b: Filler — uh isolated", () => {
  const words = [
    w("he", 0.0, 0.2), w("uh", 0.25, 0.4), w("died", 0.45, 0.7),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  expect(t.find((s) => s === "uh")).toBe("uh");
});

// ── Test 6: Character Limit ──
console.log("\nCharacter Limits:");

test("Test 6: 20 chars exactly — no split needed", () => {
  // "unfortunately I died" = 20 chars
  const words = [
    w("unfortunately", 0.0, 0.5), w("I", 0.5, 0.6), w("died", 0.6, 0.9),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  expect(t).toEqual(["unfortunately I died"]);
});

test("Test 6b: Over 20 chars — split 2+1", () => {
  // "unfortunately he disappeared" = 28 chars
  const words = [
    w("unfortunately", 0.0, 0.5), w("he", 0.5, 0.6), w("disappeared", 0.6, 1.0),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  // Front-heavy split: first 2 words + last word
  expect(t).toEqual(["unfortunately he", "disappeared"]);
});

test("Test 6c: 2-word over limit — split 1+1", () => {
  // "Schwarzenegger disappeared" = 26 chars
  const words = [
    w("Schwarzenegger", 0.0, 0.5), w("disappeared", 0.5, 1.0),
  ];
  // These will be in the same partition (no walls), chunked together (2 words < 3),
  // then char limit fires
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  expect(t).toEqual(["Schwarzenegger", "disappeared"]);
});

// ── Test 7: "like" is a regular word ──
console.log("\nConflict Resolution:");

test("Test 7: 'like' is NOT a filler — treated as regular word", () => {
  const words = [
    w("like", 0.0, 0.2), w("I", 0.2, 0.3), w("said", 0.3, 0.5),
    w("before", 0.5, 0.8),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  // "like" must NOT be isolated as a filler
  expect(t[0]).toBe("like I said");
});

// ── Test 8: Hard Wall vs Filler — "you know?" ──
test("Test 8: 'you know?' — hard wall wins over filler", () => {
  const words = [
    w("you", 0.0, 0.2), w("know?", 0.2, 0.5),
    w("that", 0.55, 0.7), w("was", 0.7, 0.9), w("crazy", 0.9, 1.2),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  // "know?" has a ? so it creates a hard wall
  // Partition 1: ["you", "know?"] → "you know?"
  // Partition 2: ["that", "was", "crazy"] → "that was crazy"
  expect(t[0]).toBe("you know?");
  expect(t[1]).toBe("that was crazy");
});

// ── Test 9: Forward Look Within Partition ──
test("Test 9: Forward look — medium pause triggers early flush", () => {
  const words = [
    w("I", 0.0, 0.1), w("was", 0.1, 0.3), w("just", 0.3, 0.5),
    w("chilling", 1.05, 1.4), // 0.55s gap (> 0.5 forward look, < 0.7 hard wall)
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  // "just" and "chilling" should not be in the same segment
  // Forward look should flush before "chilling" since gap > 0.5s
  for (const seg of t) {
    expect(seg.includes("just") && seg.includes("chilling")).toBe(false);
  }
});

// ── Additional edge cases ──
console.log("\nEdge Cases:");

test("1-word mode: every word is its own segment", () => {
  const words = [
    w("let's", 0.0, 0.3), w("go", 0.3, 0.5), w("baby", 0.5, 0.8),
  ];
  const segs = segmentWords(words, "1word");
  expect(texts(segs)).toEqual(["let's", "go", "baby"]);
});

test("Empty input returns empty array", () => {
  expect(segmentWords([], "3word")).toEqual([]);
  expect(segmentWords(null, "3word")).toEqual([]);
  expect(segmentWords(undefined, "3word")).toEqual([]);
});

test("Mixed repeated phrase with non-repeat words", () => {
  const words = [
    w("there", 0.0, 0.2), w("we", 0.2, 0.3), w("go", 0.3, 0.5),
    w("baby", 0.5, 0.7),
    w("there", 0.7, 0.9), w("we", 0.9, 1.0), w("go", 1.0, 1.2),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  expect(t).toEqual(["there we go", "baby", "there we go"]);
});

test("Emphatic periods — each sentence is isolated", () => {
  const words = [
    w("I.", 0.0, 0.2), w("Am.", 0.25, 0.4), w("That.", 0.45, 0.65), w("Guy.", 0.7, 0.9),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  expect(t).toEqual(["I.", "Am.", "That.", "Guy."]);
});

test("Min duration floor — short segments extended", () => {
  const words = [
    w("yo", 0.0, 0.05), // only 0.05s — should be extended to >= 0.3s
    w("what", 0.5, 0.8),
  ];
  const segs = segmentWords(words, "3word");
  expect(segs[0].endSec - segs[0].startSec).toBeGreaterThanOrEqual(0.29); // float tolerance
});

test("Gap closing — tiny gaps < 0.15s are closed", () => {
  const words = [
    w("I'm", 0.0, 0.3), w("that", 0.31, 0.5), w("guy", 0.51, 0.8),
    w("baby", 0.85, 1.1), // 0.05s gap from previous — should be closed
  ];
  const segs = segmentWords(words, "3word");
  // After gap closing, segment 1's end should meet segment 2's start
  if (segs.length >= 2) {
    const gap = segs[1].startSec - segs[0].endSec;
    expect(gap < 0.15).toBe(true); // SILENCE_GAP_THRESHOLD = 0.15
  }
});

test("Never end segment on 'I' — it starts next segment", () => {
  const words = [
    w("doesn't", 0.0, 0.3), w("click,", 0.3, 0.5), w("I", 0.5, 0.6),
    w("don't", 0.6, 0.8), w("know", 0.8, 1.0), w("what's", 1.0, 1.2),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  // "I" must NOT be at the end of any segment (unless it's the only word)
  for (const seg of t) {
    const segWords = seg.split(" ");
    if (segWords.length > 1) {
      expect(segWords[segWords.length - 1]).toBe(segWords[segWords.length - 1] === "I" ? "FAIL" : segWords[segWords.length - 1]);
    }
  }
  // "doesn't click," should be flushed before "I", then "I" starts next segment
  expect(t[0]).toBe("doesn't click,");
  expect(t[1].startsWith("I")).toBe(true);
});

test("Rapid micro-sentences stay separate", () => {
  const words = [
    w("Oh", 0.0, 0.1), w("my", 0.1, 0.2), w("god.", 0.2, 0.4),
    w("Dude.", 0.45, 0.65),
    w("Let's", 0.7, 0.85), w("go.", 0.85, 1.0),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  expect(t).toEqual(["Oh my god.", "Dude.", "Let's go."]);
});

// ── Comma Flush Tests ──
console.log("\nComma Flush:");

test("Comma word ends segment — never starts next one", () => {
  const words = [
    w("gonna", 0.0, 0.2), w("be", 0.2, 0.4), w("playing", 0.4, 0.6),
    w("some,", 0.6, 0.8), w("you", 0.8, 1.0), w("guessed", 1.0, 1.2),
    w("it", 1.2, 1.4),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  // "some," must NOT start a segment — it should end one
  for (const seg of t) {
    const segWords = seg.split(" ");
    if (segWords.length > 1) {
      // First word should not have trailing comma (comma words end segments)
      expect(/[,;]$/.test(segWords[0])).toBe(false);
    }
  }
  // "some," should be at the end of its segment
  const someSeg = t.find(s => s.includes("some,"));
  expect(someSeg.endsWith("some,")).toBe(true);
});

test("Comma flush — comma word after hard wall flushes as pause beat", () => {
  const words = [
    w("yes.", 0.0, 0.3), // sentence ender → hard wall
    w("well,", 0.35, 0.5), w("I", 0.5, 0.6), w("think", 0.6, 0.8),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  expect(t[0]).toBe("yes.");
  // "well," flushes immediately as a comma word — stands alone as a pause beat
  expect(t[1]).toBe("well,");
  expect(t[2]).toBe("I think");
});

// ── Atomic Phrase Tests ──
console.log("\nAtomic Phrases:");

test("Atomic phrase 'as always' stays together", () => {
  const words = [
    w("great", 0.0, 0.2), w("and", 0.2, 0.4), w("awesome", 0.4, 0.6),
    w("as", 0.6, 0.8), w("always", 0.8, 1.0),
    w("today", 1.0, 1.2),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  // "as always" must be in the same segment
  const asAlwaysSeg = t.find(s => s.includes("as") && s.includes("always"));
  expect(asAlwaysSeg != null).toBe(true);
  // "as" must not be the last word of one segment with "always" starting the next
  for (const seg of t) {
    const segWords = seg.split(" ");
    expect(segWords[segWords.length - 1] === "as" && !seg.includes("always")).toBe(false);
  }
});

test("Atomic phrase 'of course' stays together", () => {
  const words = [
    w("well", 0.0, 0.2), w("yeah", 0.2, 0.4), w("of", 0.4, 0.6),
    w("course", 0.6, 0.8), w("dude", 0.8, 1.0),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  const ofCourseSeg = t.find(s => s.includes("of") && s.includes("course"));
  expect(ofCourseSeg != null).toBe(true);
});

test("Atomic phrase 'let's go' stays together even at word boundary", () => {
  const words = [
    w("baby", 0.0, 0.2), w("yeah", 0.2, 0.4), w("let's", 0.4, 0.6),
    w("go", 0.6, 0.8),
  ];
  const segs = segmentWords(words, "3word");
  const t = texts(segs);
  const letsGoSeg = t.find(s => s.includes("let's") && s.includes("go"));
  expect(letsGoSeg != null).toBe(true);
});

// ── Linger Tests ──
console.log("\nLinger Duration:");

test("Linger — segment extends into empty space after last word", () => {
  const words = [
    w("let's", 0.0, 0.3), w("go", 0.3, 0.5), w("baby", 0.5, 0.8),
    // Big gap — next word at 3.0s
    w("yeah", 3.0, 3.2),
  ];
  const segs = segmentWords(words, "3word");
  // First segment ends at 0.8 (word end) + 0.4 linger = 1.2
  // Next segment starts at 3.0, so no clamping needed
  expect(segs[0].endSec).toBeCloseTo(1.2);
});

test("Linger — never encroaches on next segment", () => {
  const words = [
    w("I'm", 0.0, 0.3), w("that", 0.31, 0.5), w("guy", 0.51, 0.8),
    w("baby", 0.85, 1.1), // only 0.05s gap — linger clamped to next start
  ];
  const segs = segmentWords(words, "3word");
  if (segs.length >= 2) {
    // First segment's end must not exceed second segment's start
    expect(segs[0].endSec <= segs[1].startSec).toBe(true);
  }
});

test("Linger — last segment in file gets full linger", () => {
  const words = [
    w("goodbye", 5.0, 5.4),
  ];
  const segs = segmentWords(words, "3word");
  // Should be 5.4 + 0.4 = 5.8 (no next segment to clamp)
  expect(segs[0].endSec).toBeCloseTo(5.8);
});

// ══════════════════════════════════════════════
console.log("\n" + "═".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
}
console.log();
process.exit(failed > 0 ? 1 : 0);
