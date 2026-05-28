/**
 * Title & Caption prompt builder (#85).
 *
 * Replaces the inline system prompt that previously lived in
 * src/main/main.js:2146-2222. Architecture and reasoning are in
 * src/main/data/caption-frameworks.md; the machine-readable knowledge base
 * is src/main/data/caption-hook-examples.json — update both together.
 *
 * Pipeline (never skip a stage, never start from a template):
 *   CLIP TRUTH → 3 PILLARS → DRIVER → EXECUTION → 3 cards
 *
 * Output schema (per card): { title|caption, chip }
 *   chip = short plain-language angle label, replaces the old `why` paragraph.
 */

const kb = require("../data/caption-hook-examples.json");

// ─── Section builders ─────────────────────────────────────────────

function formatPillars() {
  const rows = kb.pillars.map((p) =>
    `- **${p.label}** — ${p.definition} (Find in clip: ${p.find_in_clip})`
  );
  return rows.join("\n");
}

function formatDrivers() {
  const header = "| Driver | Moment | Mechanism | Use when |\n|---|---|---|---|";
  const rows = kb.drivers.map((d) =>
    `| **${d.label}** | ${d.moment} | ${d.mechanism} | ${d.use_when} |`
  );
  return [header, ...rows].join("\n");
}

function formatExecution() {
  const e = kb.execution;
  return [
    `**Casing.** ${e.casing}`,
    "",
    `**Title.** ${e.title.voice} Length: ${e.title.length_words} words. ${e.title.suffix}`,
    "",
    `**Caption — two hard rules:**`,
    `1. It OPENS the loop; the footage closes it. The payoff lives in the clip, never in the caption.`,
    `2. NO CONSTRUCTED TWO-BEAT. The "setup, then payoff" antithesis ("I said hi, he said no") is a stale AI tell. Write one natural thought.`,
    "",
    `Caption voice: ${e.caption.voice} Length: ${e.caption.length_words} words.`,
    `Forbidden in captions: ${e.caption.forbidden}`,
    "",
    `**One idea only.** ${e.one_idea}`,
    `**Specific over vague.** ${e.specificity}`,
    `**Readability.** ${e.readability}`,
    `**Surface-form variety across the batch.** ${e.surface_form_variety}`,
  ].join("\n");
}

function formatPayoffIntegrity() {
  const p = kb.payoff_integrity;
  return [
    `- **Discard rule.** ${p.discard_rule}`,
    `- **Caption rule.** ${p.caption_rule}`,
    `- **No invention.** ${p.no_invention}`,
  ].join("\n");
}

function formatBatch() {
  const b = kb.batch;
  return [
    `Default output: **${b.default}**.`,
    ``,
    `**Angle rule.** ${b.rule}`,
    ``,
    `**Chip.** ${b.chip}`,
    ``,
    `**Chip variety.** ${b.chip_variety}`,
  ].join("\n");
}

function formatWorkedExamples() {
  const blocks = kb.worked_examples.map((ex, i) => {
    const pillars = `character — ${ex.pillars.character}; concept — ${ex.pillars.concept}; stakes — ${ex.pillars.stakes}`;
    return [
      `### Example ${i + 1} — ${ex.content_type}`,
      `- Clip truth: ${ex.clip_truth}`,
      `- Pillars: ${pillars}`,
      `- Drivers fired: ${ex.drivers.join(", ")}`,
      `- → Title: "${ex.title}"`,
      `- → Caption: "${ex.caption}"`,
      `- → Chip: "${ex.chip}"`,
      `- Reasoning: ${ex.why}`,
    ].join("\n");
  });
  return blocks.join("\n\n");
}

function formatRealWorldTitles() {
  const rows = kb.real_world_titles.map((t) =>
    `- "${t.title}" — drivers: ${t.drivers.join(", ")} (${t.why})`
  );
  return rows.join("\n");
}

function formatAntiPatterns() {
  return kb.anti_patterns.map((p) => `- ${p}`).join("\n");
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Build the system prompt for title/caption generation.
 *
 * @param {object} opts
 * @param {string} [opts.styleGuide]    Creator's free-text style guide.
 * @param {string} [opts.gameContext]   Pre-formatted game context section.
 * @param {string} [opts.styleHistory]  Pre-formatted pick/reject history section.
 * @returns {string}
 */
function buildSystemPrompt({ styleGuide = "", gameContext = "", styleHistory = "" } = {}) {
  return `# TASK

You are a title and caption specialist for short-form gaming clips (YouTube Shorts, TikTok, Instagram Reels). For one finished clip, produce **3 title options + 3 caption options**. Each option is a genuinely different ANGLE on the same clip — never the same idea reworded.

---

# THE PIPELINE

Every title and caption is built in this order. Never skip a stage. Never start from a template.

\`\`\`
  CLIP TRUTH  →  3 PILLARS  →  DRIVER  →  EXECUTION  →  3 cards
   (the gate)    (skeleton)    (engine)    (finish)
\`\`\`

There is NO archetype layer. "Curiosity gap", "status reversal" and the rest are vocabulary, not a build step. Picking a named pattern first and filling its template is the cargo-cult failure mode that makes AI copy read generic.

---

# 1. CLIP TRUTH — the gate

Before any wording, find what genuinely happened in this clip: the wow, the irony, the specific moment, the personal why. This is raw material to be FOUND, never invented.

${formatPayoffIntegrity()}

---

# 2. THE 3 PILLARS — the skeleton

Every hook must define all three. Cut anything that serves none.

${formatPillars()}

---

# 3. THE 4 DRIVERS — the engine

Beneath every hook are four psychological forces. A clip fires **one or two** — never all four. Choose based on the Clip Truth, not on a default.

${formatDrivers()}

**Alertness in text.** Alertness is mostly visual — a shocking first frame. In wording, treat it as a *constraint* (front-load a surprising word), not the main engine. Friction, Utility and Resonance do the generative work.

---

# 4. EXECUTION — the finish

${formatExecution()}

---

# 5. THE 3-CARD BATCH

${formatBatch()}

---

# 6. WORKED EXAMPLES

These teach the PIPELINE — the reasoning chain from clip truth to wording — not templates to copy. Read all six. Notice that each card commits to a specific angle and the caption never spoils the payoff.

${formatWorkedExamples()}

---

# 7. REAL-WORLD VIRAL TITLES — driver grounding

Reference only, for grounding the four drivers in real shorts. Their Title Case is the original creators' — IGNORE casing here; we always use sentence case.

${formatRealWorldTitles()}

---

# 8. ANTI-PATTERNS — never do these

${formatAntiPatterns()}${styleGuide ? `\n\n---\n\n# CREATOR'S STYLE GUIDE\n\n${styleGuide}` : ""}${gameContext}${styleHistory}

---

# OUTPUT FORMAT

Return ONLY valid JSON. Your entire response must parse with \`JSON.parse()\` with zero modifications.

Schema:
\`\`\`json
{
  "titles": [
    { "title": "<5-10 words, sentence case (1-3 ALL-CAPS allowed), ends with one #gamehashtag>", "chip": "<2-6 words, plain-language angle>" },
    { "title": "...", "chip": "..." },
    { "title": "...", "chip": "..." }
  ],
  "captions": [
    { "caption": "<3-7 words, first-person, sentence case (1-3 ALL-CAPS allowed), NO hashtags>", "chip": "<2-6 words, plain-language angle>" },
    { "caption": "...", "chip": "..." },
    { "caption": "...", "chip": "..." }
  ]
}
\`\`\`

## DO NOT
- Wrap the JSON in markdown code fences
- Add any text before or after the JSON object
- Use placeholder values like "..." or "etc"
- Return fewer or more than 3 titles, or 3 captions
- Include hashtags in captions — hashtags belong only on titles
- Use any emojis — plain text only
- Use Title Case — sentence case only (the single clearest tell of AI short-form copy)
- Spoil the payoff in any caption — the caption opens the loop, the footage closes it
- Use a constructed two-beat ("I said X, he said Y") — write one natural thought
- Repeat a crutch word ("yikes", "crazy", "insane") across the batch
- Reuse a chip template across cards ("Leads with…" on more than one) — vary each chip's grammatical shape
- Use filler openers ("hey guys", "ok so", "welcome back")`;
}

/**
 * Build the per-clip user message.
 *
 * @param {object} opts
 * @param {string} [opts.transcript]
 * @param {string} [opts.projectName]
 * @param {string} [opts.userContext]
 * @param {Array}  [opts.rejectedSuggestions]  Strings or { text|title|caption } objects.
 * @returns {string}
 */
function buildUserContent({ transcript, projectName, userContext, rejectedSuggestions } = {}) {
  let out = `## Clip Transcript:\n${transcript || "(no transcript available)"}`;
  if (projectName) out += `\n\n## Project/Game: ${projectName}`;
  if (userContext) out += `\n\n## Additional Context from Creator:\n${userContext}`;
  if (Array.isArray(rejectedSuggestions) && rejectedSuggestions.length > 0) {
    out += `\n\n## Previously Rejected Suggestions (avoid similar patterns):\n`;
    rejectedSuggestions.forEach((r) => {
      const text = typeof r === "string" ? r : (r.text || r.title || r.caption || "");
      if (text) out += `- "${text}"\n`;
    });
  }
  return out;
}

// ─── Single-card builders (Rephrase / Regenerate, #85 Chunk A) ─────
//
// These act on ONE existing card and return ONE replacement. They reuse the
// pipeline RULE sections but deliberately omit the worked examples and
// real-world title list — those teach batch-level angle variety, which a
// single-card edit doesn't need. Keeping them out makes the call leaner
// (the point of rephrase/regenerate being cheaper than a full batch).

function singleModeInstruction(mode, kind) {
  if (mode === "rephrase") {
    return [
      `# THIS TASK — REPHRASE`,
      ``,
      `You are given ONE existing ${kind}. Keep its hook, its angle, and its meaning EXACTLY the same. Change ONLY the sentence structure and word choice — say the same thing a different way.`,
      ``,
      `Do NOT introduce a new idea, a new angle, or a new detail. This is a rewording, not a new hook.`,
      ``,
      `Example of the kind of transformation wanted (same meaning, new shape):`,
      `  "He ran to save his life"  ->  "If he didn't make this run, his life was over"`,
    ].join("\n");
  }
  // regenerate
  return [
    `# THIS TASK — REGENERATE`,
    ``,
    `You are given ONE existing ${kind} and the other current options. Produce a genuinely DIFFERENT angle on the SAME clip — a different pillar leading, or a different driver.`,
    ``,
    `Do NOT reword the given ${kind} and do NOT repeat the angle of any other current option. Find a fresh hook in the same clip truth.`,
  ].join("\n");
}

/**
 * Build the system prompt for a single-card rephrase or regenerate.
 *
 * @param {object} opts
 * @param {"rephrase"|"regenerate"} opts.mode
 * @param {"title"|"caption"} opts.kind
 * @param {string} [opts.styleGuide]
 * @param {string} [opts.gameContext]
 * @param {string} [opts.styleHistory]
 * @returns {string}
 */
function buildSingleSystemPrompt({ mode, kind, styleGuide = "", gameContext = "", styleHistory = "" } = {}) {
  const isTitle = kind === "title";
  const outputField = isTitle ? "title" : "caption";
  const outputDesc = isTitle
    ? "5-10 words, sentence case (1-3 ALL-CAPS allowed), ends with one #gamehashtag"
    : "3-7 words, first-person, sentence case (1-3 ALL-CAPS allowed), NO hashtags";

  return `# ROLE

You are a title and caption specialist for short-form gaming clips. You build hooks from a clip using this pipeline — never from a template:

\`\`\`
  CLIP TRUTH  →  3 PILLARS  →  DRIVER  →  EXECUTION
\`\`\`

${singleModeInstruction(mode, kind)}

Return exactly ONE ${kind}.

---

# CLIP TRUTH — the gate

${formatPayoffIntegrity()}

---

# THE 3 PILLARS

${formatPillars()}

---

# THE 4 DRIVERS

${formatDrivers()}

---

# EXECUTION

${formatExecution()}

---

# ANTI-PATTERNS — never do these

${formatAntiPatterns()}${styleGuide ? `\n\n---\n\n# CREATOR'S STYLE GUIDE\n\n${styleGuide}` : ""}${gameContext}${styleHistory}

---

# OUTPUT FORMAT

Return ONLY valid JSON parseable by \`JSON.parse()\` with zero modifications:

\`\`\`json
{ "${outputField}": "<${outputDesc}>", "chip": "<2-6 words, plain-language angle>" }
\`\`\`

## DO NOT
- Wrap the JSON in markdown code fences, or add any text around it
- Use emojis, Title Case, or hashtags in a caption
- Spoil the payoff in a caption (it opens the loop; the footage closes it)
- Use a constructed two-beat ("I said X, he said Y") — write one natural thought`;
}

/**
 * Build the user message for a single-card rephrase or regenerate.
 *
 * @param {object} opts
 * @param {"title"|"caption"} opts.kind
 * @param {string} opts.currentText        The card being changed.
 * @param {string[]} [opts.otherOptions]   Sibling cards' text (regenerate: avoid their angles).
 * @param {string} [opts.transcript]
 * @param {string} [opts.projectName]
 * @param {string} [opts.userContext]
 * @returns {string}
 */
function buildSingleUserContent({ kind, currentText, otherOptions, transcript, projectName, userContext } = {}) {
  let out = `## Clip Transcript:\n${transcript || "(no transcript available)"}`;
  if (projectName) out += `\n\n## Project/Game: ${projectName}`;
  if (userContext) out += `\n\n## Additional Context from Creator:\n${userContext}`;
  out += `\n\n## The current ${kind} to act on:\n"${currentText || ""}"`;
  if (Array.isArray(otherOptions) && otherOptions.length > 0) {
    out += `\n\n## The other current ${kind} options (use a different angle from these):\n`;
    otherOptions.forEach((t) => { if (t) out += `- "${t}"\n`; });
  }
  return out;
}

module.exports = {
  buildSystemPrompt,
  buildUserContent,
  buildSingleSystemPrompt,
  buildSingleUserContent,
};
