/**
 * Title & caption prompt builder (#85, rewritten in #183).
 *
 * What changed and why — the previous build injected a 3-pillar / 4-driver /
 * payoff-integrity / worked-example framework that ran ~14,000 characters
 * before the transcript was even read. Measured against the creator's own
 * publishing record, it wasn't working: 28 of 31 published titles were
 * hand-written, and every accepted suggestion was edited down before it
 * shipped — always by cutting the second clause. Stacking that many rules
 * makes a model optimize for not-breaking-them, which reads as slop.
 *
 * This version is ~3k chars and spends its budget on ONE thing: examples of
 * what the creator actually publishes, read live from the title_caption_rounds
 * table (src/main/title-caption-log.js). Rules are the short list that survives
 * contact with real output; everything else is delegated to the examples.
 *
 * Note on "caption": it is the hook text burned ON SCREEN over the clip's
 * opening seconds, not the social post caption (that comes from the per-platform
 * templates in QueueView.resolveCaption). The old prompt never said so, which is
 * why captions read like tweets instead of on-screen text.
 *
 * Output schema (per card): { title|caption, chip }
 */

const kb = require("../data/caption-hook-examples.json");

// ─── Section builders ─────────────────────────────────────────────

function formatAntiPatterns() {
  return kb.anti_patterns.map((p) => `- ${p}`).join("\n");
}

/** Show an on-screen caption's line break inline so the shape is visible. */
function flattenCaption(text) {
  return String(text || "").replace(/\s*\n\s*/g, " / ").trim();
}

/**
 * The voice section — the heart of the prompt.
 *
 * Real published examples when we have them, the static cold-start set when we
 * don't (fresh install, before the creator has shipped anything). Never both:
 * mixing invented examples into real ones dilutes exactly the signal we're
 * trying to concentrate.
 *
 * @param {Array<{title: string, caption: string, game: string}>} voiceExamples
 */
function formatVoice(voiceExamples) {
  const real = (voiceExamples || []).filter((e) => e && e.title);

  if (real.length === 0) {
    const rows = kb.cold_start_examples.map((ex) =>
      `- "${ex.title}"  →  on-screen: "${flattenCaption(ex.caption)}"\n  (${ex.note})`
    );
    return [
      "No published history for this creator yet, so these are reference examples.",
      "Match their LENGTH and PLAINNESS, not their subject matter.",
      "",
      rows.join("\n"),
    ].join("\n");
  }

  const titleRows = real.map((e) => `- "${e.title}"${e.game ? `  [${e.game}]` : ""}`);
  const withCaptions = real.filter((e) => e.caption);
  const captionRows = withCaptions.map((e) => `- "${flattenCaption(e.caption)}"`);

  const out = [
    "These are titles this creator has ACTUALLY PUBLISHED. This is the target.",
    "Study the length, the plainness, the rhythm, where emphasis lands.",
    "Do NOT reuse their subject matter — only their voice.",
    "Older entries may use inconsistent casing; the casing RULE below wins over",
    "anything you see here.",
    "",
    titleRows.join("\n"),
  ];

  if (captionRows.length > 0) {
    out.push(
      "",
      "On-screen captions they've actually used (\" / \" marks the line break):",
      "",
      captionRows.join("\n")
    );
  }

  return out.join("\n");
}

// Detection's read of the clip's intensity (#85 Chunk B). Calibration only —
// these are signals to TONE the wording, never raw material to invent from.
// Returns "" when neither is present (old projects predate the fields).
function formatClipSignals(energyLevel, confidence) {
  const level = (energyLevel || "").trim();
  const pct = Number.isFinite(confidence) && confidence > 0
    ? `${Math.round(confidence * 100)}%`
    : "";
  if (!level && !pct) return "";
  const parts = [];
  if (level) parts.push(`energy ${level}`);
  if (pct) parts.push(`detection confidence ${pct}`);
  return `\n\n## Clip Signals (calibration — match the wording's intensity to this, do NOT invent detail from it):\n${parts.join(", ")}`;
}

// ─── Shared rule blocks ───────────────────────────────────────────

const CLIP_TRUTH = `Read the transcript (and the frames, if given) and work out what actually
happened — the wow, the irony, the specific moment. Everything you write comes
from that.

- Never invent a detail, game term, player name, or event the clip doesn't support.
- If the transcript doesn't tell you what happened, write about the REACTION, not the event.
- The caption opens the loop; the footage closes it. Never put the outcome in the caption.`;

const HARD_RULES = `**Titles**
- 3-7 words, then one #gamehashtag at the end.
- Sentence case. Never Title Case.
- **A fragment beats a sentence.** Stop at the interesting part. Do not add a
  second clause that explains or twists it. "The pass was PERFECT" lands.
  "The pass was PERFECT and I still blew it" is the same hook with the air let out.
- One idea. If it needs a comma, it's probably two ideas.

**Captions — this is text burned ON SCREEN over the opening seconds of the clip.**
The viewer reads it while the footage plays, in roughly two short lines.
- 4-9 words. Write it to break naturally across two lines.
- First person, spoken register — how you'd say it out loud, not how you'd write it.
- No hashtags, no emoji.
- You may put ONE word or short phrase in ALL CAPS for emphasis. At most once.

**Both**
- Plain words. If a word would make someone ask "who talks like that", cut it.
- Never repeat a crutch word across the batch.`;

// ─── Public API ───────────────────────────────────────────────────

/**
 * Build the system prompt for title/caption generation.
 *
 * @param {object} opts
 * @param {string} [opts.styleGuide]     Creator's free-text style guide.
 * @param {string} [opts.gameContext]    Pre-formatted game context section.
 * @param {string} [opts.styleHistory]   Pre-formatted rejection history section.
 * @param {Array}  [opts.voiceExamples]  Published examples from title-caption-log.
 * @returns {string}
 */
function buildSystemPrompt({ styleGuide = "", gameContext = "", styleHistory = "", voiceExamples = [] } = {}) {
  return `# TASK

You write the two pieces of copy that sell a short-form gaming clip:

1. **Title** — the post title (YouTube Shorts, TikTok, Instagram Reels).
2. **Caption** — hook text burned ON SCREEN over the clip's opening seconds.

Produce **3 titles + 3 captions**. Each option is a genuinely different ANGLE on
the same clip — never the same idea reworded.

---

# 1. FIND THE CLIP TRUTH FIRST

${CLIP_TRUTH}

---

# 2. WRITE THE WAY THIS CREATOR WRITES

${formatVoice(voiceExamples)}

---

# 3. HARD RULES

${HARD_RULES}

---

# 4. ANTI-PATTERNS

${formatAntiPatterns()}

---

# 5. THE 3-CARD BATCH

Three genuinely different angles, not three phrasings of one. If two cards could
swap their chips without anyone noticing, one of them is wasted.

Each card carries a **chip**: a 2-6 word plain-language label for its angle
("leads with the fail", "asks a question"). Vary the grammatical shape of the
chips — don't start more than one the same way.${styleGuide ? `\n\n---\n\n# CREATOR'S STYLE GUIDE\n\n${styleGuide}` : ""}${gameContext}${styleHistory}

---

# OUTPUT FORMAT

Return ONLY valid JSON. Your entire response must parse with \`JSON.parse()\` with zero modifications.

\`\`\`json
{
  "titles": [
    { "title": "<3-7 words, sentence case, ends with one #gamehashtag>", "chip": "<2-6 words>" },
    { "title": "...", "chip": "..." },
    { "title": "...", "chip": "..." }
  ],
  "captions": [
    { "caption": "<4-9 words, first person, no hashtags>", "chip": "<2-6 words>" },
    { "caption": "...", "chip": "..." },
    { "caption": "...", "chip": "..." }
  ]
}
\`\`\`

## DO NOT
- Wrap the JSON in code fences, or add any text around it
- Return fewer or more than 3 titles and 3 captions
- Use emojis, Title Case, or hashtags in a caption
- Add a second clause to a title that already landed`;
}

/**
 * Build the per-clip user message.
 *
 * Returns a string when there are no frames, or an Anthropic content-block
 * array when there are — the provider layer accepts either.
 *
 * @param {object} opts
 * @param {string} [opts.transcript]
 * @param {string} [opts.projectName]
 * @param {string} [opts.userContext]
 * @param {string} [opts.energyLevel]   Detection's energy read (LOW|MED|HIGH|EXPLOSIVE).
 * @param {number} [opts.confidence]    Detection confidence 0-1.
 * @param {Array}  [opts.rejectedSuggestions]  Strings or { text|title|caption } objects.
 * @param {Array}  [opts.frames]        [{ base64, label }] stills from the clip (#183 Phase 1).
 * @returns {string|Array}
 */
function buildUserContent({ transcript, projectName, userContext, energyLevel, confidence, rejectedSuggestions, frames } = {}) {
  let out = `## Clip Transcript:\n${transcript || "(no transcript available)"}`;
  out += formatClipSignals(energyLevel, confidence);
  if (projectName) out += `\n\n## Project/Game: ${projectName}`;
  if (userContext) out += `\n\n## Additional Context from Creator:\n${userContext}`;
  if (Array.isArray(rejectedSuggestions) && rejectedSuggestions.length > 0) {
    out += `\n\n## Previously Rejected Suggestions (avoid similar patterns):\n`;
    rejectedSuggestions.forEach((r) => {
      const text = typeof r === "string" ? r : (r.text || r.title || r.caption || "");
      if (text) out += `- "${text}"\n`;
    });
  }

  const stills = (frames || []).filter((f) => f && f.base64);
  if (stills.length === 0) return out;

  // Frames go LAST so the transcript still anchors the read, and each is
  // labelled with its position in the clip so the model can tell setup from
  // payoff rather than treating them as an unordered pile.
  const content = [{ type: "text", text: out }];
  content.push({
    type: "text",
    text: `\n## ${stills.length} stills from this clip, in order:\nUse them to see what the transcript can't say — what is on screen, what the moment looks like. Do not describe the frames; use them to know what happened.`,
  });
  for (const f of stills) {
    content.push({ type: "text", text: f.label || "" });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: f.base64 },
    });
  }
  return content;
}

// ─── Single-card builders (Rephrase / Regenerate, #85 Chunk A) ─────
//
// These act on ONE existing card and return ONE replacement. They carry the
// same rules and voice examples as the batch prompt but drop the batch-variety
// section, which a single-card edit has no use for.

function singleModeInstruction(mode, kind) {
  if (mode === "rephrase") {
    return [
      `# THIS TASK — REPHRASE`,
      ``,
      `You are given ONE existing ${kind}. Keep its hook, its angle, and its meaning EXACTLY the same. Change ONLY the sentence structure and word choice — say the same thing a different way.`,
      ``,
      `Do NOT introduce a new idea, a new angle, or a new detail. This is a rewording, not a new hook.`,
    ].join("\n");
  }
  // regenerate
  return [
    `# THIS TASK — REGENERATE`,
    ``,
    `You are given ONE existing ${kind} and the other current options. Produce a genuinely DIFFERENT angle on the SAME clip.`,
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
 * @param {Array}  [opts.voiceExamples]
 * @returns {string}
 */
function buildSingleSystemPrompt({ mode, kind, styleGuide = "", gameContext = "", styleHistory = "", voiceExamples = [] } = {}) {
  const isTitle = kind === "title";
  const outputField = isTitle ? "title" : "caption";
  const outputDesc = isTitle
    ? "3-7 words, sentence case, ends with one #gamehashtag"
    : "4-9 words, first person, no hashtags";

  return `# ROLE

You write copy for short-form gaming clips. Titles are post titles; captions are
hook text burned ON SCREEN over the clip's opening seconds.

${singleModeInstruction(mode, kind)}

Return exactly ONE ${kind}.

---

# THE CLIP TRUTH

${CLIP_TRUTH}

---

# WRITE THE WAY THIS CREATOR WRITES

${formatVoice(voiceExamples)}

---

# HARD RULES

${HARD_RULES}

---

# ANTI-PATTERNS

${formatAntiPatterns()}${styleGuide ? `\n\n---\n\n# CREATOR'S STYLE GUIDE\n\n${styleGuide}` : ""}${gameContext}${styleHistory}

---

# OUTPUT FORMAT

Return ONLY valid JSON parseable by \`JSON.parse()\` with zero modifications:

\`\`\`json
{ "${outputField}": "<${outputDesc}>", "chip": "<2-6 words, plain-language angle>" }
\`\`\`

## DO NOT
- Wrap the JSON in code fences, or add any text around it
- Use emojis, Title Case, or hashtags in a caption
- Add a second clause to a ${kind} that already landed`;
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
