// #480 prompt cells for Sonnet 5.5: text edits applied to the built system prompt,
// so src/main/ai-prompt.js is never touched by an experiment. Each edit asserts
// its anchor exists exactly once and throws otherwise (a missed anchor must fail
// the run, not silently send the unchanged prompt).
//
//   count  - state the clip count as a number for THIS recording, not a rate.
//            Newer models read "aim for roughly one per 90 s" as a soft ceiling.
//   recall - say the pass is the first of two (the creator filters), so a doubtful
//            moment comes back with lower confidence instead of being dropped.

function replaceOnce(text, anchor, replacement, name) {
  const n = text.split(anchor).length - 1;
  if (n !== 1) throw new Error(`prompt variant "${name}": anchor found ${n} times: ${anchor.slice(0, 60)}`);
  return text.replace(anchor, replacement);
}

// The whole rate rule, replaced by a stated number.
const COUNT_ANCHOR = "aim for roughly one clip per 90 seconds of recording, minimum 10, maximum 25. Keep going until the recording's genuine moments are exhausted.";
// One per 80 s matches what Sonnet 4.6 actually returns on the six recordings (21 min -> 16,
// 27 -> 18, 30 -> 20), where Sonnet 5.5 settled near 14 reading "one per 90 seconds"
// literally. Same budget, so the comparison is taste, not pick count.
const COUNT_SECONDS_PER_CLIP = 80;

const RECALL_ANCHOR = "Stay disciplined: pick the moments, no prose.";
const RECALL_TEXT = `${RECALL_ANCHOR}

This is the first of two passes. The creator watches every pick and rejects the ones they don't want, so a good moment you leave out costs far more than a weak one you include. Treat the AVOID list and the rejected examples below as reasons to give a pick a LOWER confidence, and drop a moment only when it clearly matches one of them. Whenever you are unsure whether a moment is good enough, include it with a confidence between 0.50 and 0.65.`;

const REJECTED_ANCHOR = "Treat them as negative calibration — do NOT pick moments like these.";
const REJECTED_TEXT = "Treat them as negative calibration: give a moment like these a lower confidence, and leave it out only when it clearly repeats one of them.";

const VARIANTS = {
  count(prompt) {
    // Shipped in src/main/ai-prompt.js (#480): the built prompt already states the number.
    if (/return at least \d+ clips for this/.test(prompt)) throw new Error('prompt variant "count" shipped in ai-prompt.js; drop it from --prompt-variant');
    const m = prompt.match(/This recording is ~(\d+) minutes? long\./);
    if (!m) throw new Error('prompt variant "count": no recording length line');
    const minutes = parseInt(m[1], 10);
    const target = Math.min(25, Math.round((minutes * 60) / COUNT_SECONDS_PER_CLIP));
    // Too short for 10: the prompt's own "as many as it can physically hold" rule applies.
    if (target < 10) return prompt;
    return replaceOnce(prompt, COUNT_ANCHOR,
      `return at least ${target} clips for this ~${minutes}-minute recording, and more (up to 25) if it holds more genuine moments. Keep going until its genuine moments are exhausted.`,
      "count");
  },
  recall(prompt) {
    const out = replaceOnce(prompt, RECALL_ANCHOR, RECALL_TEXT, "recall");
    // The rejected section's own instruction says the opposite; it only exists when
    // rejected examples are sent, so it is optional here.
    return out.includes(REJECTED_ANCHOR) ? replaceOnce(out, REJECTED_ANCHOR, REJECTED_TEXT, "recall") : out;
  },
};

/** Apply a comma-separated list of variants in order. */
function applyPromptVariants(prompt, list) {
  let out = prompt;
  for (const name of String(list || "").split(",").map((s) => s.trim()).filter(Boolean)) {
    if (!VARIANTS[name]) throw new Error(`unknown prompt variant "${name}" (have: ${Object.keys(VARIANTS).join(", ")})`);
    out = VARIANTS[name](out);
  }
  return out;
}

module.exports = { applyPromptVariants };
