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
- **A hook is a promise; the clip is the payoff.** Title and caption must OPEN a
  loop the footage has to close — a claim, stakes, or a tease that demands
  resolution. A line that summarizes the moment closes the loop before the
  viewer arrives, and with it the reason to watch.
- **Promise only what the footage delivers.** If the clip can't cash the line,
  the line is banned. No fake bait, ever.`;

// #223: the games DB stores each game's hashtag, but it never reached the
// prompt — the model had to guess, and guessed "#gaming" for any game it
// couldn't infer from context. When we know the tag, state it outright.
function hashtagText(gameHashtag) {
  const clean = String(gameHashtag || "").trim().replace(/^#/, "");
  return clean ? `#${clean}` : "one #gamehashtag";
}

const hardRules = (tag) => `**Titles**
- 3-7 words, then ${tag} at the end.
- Sentence case. Never Title Case.
- **A fragment beats a sentence.** Stop at the interesting part. Do not add a
  second clause that explains or twists it. "NO ONE gets past me" lands — the
  footage supplies the twist. "NO ONE gets past me and then he did" is the
  same hook with the air let out.
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

// The intent-anchor block (#240 imports). Shared by buildUserContent and
// buildImportUserContent so the wording can't drift between the two paths.
function titleAnchorSection(titleAnchor) {
  if (!titleAnchor) return "";
  return `\n\n## The creator's own name for this clip (intent anchor):\n"${String(titleAnchor).trim()}"\nThey named this moment themselves — the name carries their intent and voice. Keep that intent: improve wording, casing, and format only where clearly better. Do not pivot to a different moment or angle than the one they named.`;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Build the system prompt for title/caption generation.
 *
 * @param {object} opts
 * @param {string} [opts.styleGuide]     Creator's free-text style guide.
 * @param {string} [opts.gameContext]    Pre-formatted game context section.
 * @param {string} [opts.styleHistory]   Pre-formatted rejection history section.
 * @param {Array}  [opts.voiceExamples]  Published examples from title-caption-log.
 * @param {string} [opts.gameHashtag]    The game's hashtag from gamesDb (#223).
 * @returns {string}
 */
function buildSystemPrompt({ styleGuide = "", gameContext = "", styleHistory = "", voiceExamples = [], gameHashtag = "" } = {}) {
  const tag = hashtagText(gameHashtag);
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

${hardRules(tag)}

---

# 4. ANTI-PATTERNS

${formatAntiPatterns()}

---

# 5. THE 3-CARD BATCH

**Find the strongest line first** — the single line that opens the loop hardest.
That line is BOTH title #1 and caption #1, reformatted to each surface's rules.
Never split the surfaces: the best line does not get saved for one surface while
a weaker line goes on the other.

The remaining cards are genuinely different angles, not three phrasings of one.
Angles that work on gaming clips: stakes declared before an attempt · an
arguable claim · opening mid-emotion · a comeback · an anomaly the viewer has to
explain. Use only what THIS clip supports. If two cards could swap their chips
without anyone noticing, one of them is wasted.

Each card carries a **chip**: a 2-6 word plain-language label for its angle
("leads with the fail", "asks a question"). Vary the grammatical shape of the
chips — don't start more than one the same way.${styleGuide ? `\n\n---\n\n# CREATOR'S STYLE GUIDE\n\n${styleGuide}` : ""}${gameContext}${styleHistory}

---

# OUTPUT FORMAT

Return ONLY valid JSON. Your entire response must parse with \`JSON.parse()\` with zero modifications.

\`\`\`json
{
  "titles": [
    { "title": "<the strongest line — 3-7 words, sentence case, ends with ${tag}>", "chip": "<2-6 words>" },
    { "title": "...", "chip": "..." },
    { "title": "...", "chip": "..." }
  ],
  "captions": [
    { "caption": "<the SAME strongest line as title 1, reformatted — 4-9 words, first person, no hashtags>", "chip": "<2-6 words>" },
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
 * @param {string} [opts.gameName]      The game's display name (#223).
 * @param {string} [opts.projectName]
 * @param {string} [opts.userContext]
 * @param {string} [opts.energyLevel]   Detection's energy read (LOW|MED|HIGH|EXPLOSIVE).
 * @param {number} [opts.confidence]    Detection confidence 0-1.
 * @param {Array}  [opts.rejectedSuggestions]  Strings or { text|title|caption } objects.
 * @param {Array}  [opts.frames]        [{ base64, label }] stills from the clip (#183 Phase 1).
 * @param {string} [opts.titleAnchor]   The creator's own past name for this clip (#240 imports).
 * @returns {string|Array}
 */
function buildUserContent({ transcript, gameName, projectName, userContext, energyLevel, confidence, rejectedSuggestions, frames, titleAnchor } = {}) {
  let out = `## Clip Transcript:\n${transcript || "(no transcript available)"}`;
  out += formatClipSignals(energyLevel, confidence);
  if (gameName) out += `\n\n## Game: ${gameName}`;
  if (projectName) out += `\n\n## ${gameName ? "Project" : "Project/Game"}: ${projectName}`;
  out += titleAnchorSection(titleAnchor);
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

// ─── Import builders (#240 queue imports) ──────────────────────────
//
// One call per imported clip: ONE title (anchored on the creator's old
// filename) + a game identification from the known games list. Imports have
// no transcript — they never enter the pipeline — so the model watches the
// attached video. No caption: imports get no on-screen text, and the social
// captions come from the per-platform templates once a game is assigned
// (QueueView.resolveCaption, the #223 path).

/**
 * @param {object} opts
 * @param {string} [opts.styleGuide]     Creator's free-text style guide.
 * @param {Array}  [opts.voiceExamples]  Published examples from title-caption-log.
 * @param {Array<{name: string, hashtag: string}>} [opts.games]  Candidates from gamesDb.
 * @returns {string}
 */
function buildImportSystemPrompt({ styleGuide = "", voiceExamples = [], games = [] } = {}) {
  const gameRows = games
    .filter((g) => g && g.name)
    .map((g) => {
      const tag = String(g.hashtag || "").trim().replace(/^#/, "");
      return `- ${g.name}${tag ? `  (hashtag: #${tag})` : ""}`;
    })
    .join("\n");

  return `# TASK

You are handed a FINISHED short-form gaming clip a creator made in the past
with an older editing tool, now being imported to post. Watch the attached
video (with sound) and produce:

1. **One title** for the post.
2. **The game being played.**

---

# 1. FIND THE CLIP TRUTH FIRST

${CLIP_TRUTH}

---

# 2. WRITE THE WAY THIS CREATOR WRITES

${formatVoice(voiceExamples)}

---

# 3. TITLE RULES

- 3-7 words, then the game's hashtag at the end. Use the hashtag from the
  candidates list below; for a game not in the list, use its natural #hashtag;
  if the game is unknown, end with no hashtag at all.
- Sentence case. Never Title Case.
- **A fragment beats a sentence.** Stop at the interesting part. Do not add a
  second clause that explains or twists it.
- One idea. If it needs a comma, it's probably two ideas.
- Plain words. If a word would make someone ask "who talks like that", cut it.

---

# 4. ANTI-PATTERNS

${formatAntiPatterns()}

---

# 5. THE GAME

Games this creator already tracks:

${gameRows || "(none yet)"}

- If the footage matches one of these, return its name EXACTLY as written above.
- If it is clearly some other game, return that game's common name.
- If you cannot tell, return "unknown". Never guess a candidate on a hunch —
  a wrong game poisons hashtags and descriptions; "unknown" is always safer.
- confidence is "high" only when the on-screen evidence is unambiguous (HUD,
  menus, characters, a visible game title). Otherwise "low".${styleGuide ? `\n\n---\n\n# CREATOR'S STYLE GUIDE\n\n${styleGuide}` : ""}

---

# OUTPUT FORMAT

Return ONLY valid JSON. Your entire response must parse with \`JSON.parse()\` with zero modifications.

\`\`\`json
{
  "title": "<3-7 words, sentence case, game hashtag at the end>",
  "game": "<exact candidate name, or the game's common name, or unknown>",
  "confidence": "high | low"
}
\`\`\`

## DO NOT
- Wrap the JSON in code fences, or add any text around it
- Use Title Case or emojis in the title
- Add a second clause to a title that already landed`;
}

/**
 * Per-clip user message for the import pass. The stripped old filename is the
 * anchor (#240) — same wording as the batch path via titleAnchorSection.
 *
 * @param {object} opts
 * @param {string} [opts.titleAnchor]  The creator's old filename, "#N " stripped.
 * @returns {string}
 */
function buildImportUserContent({ titleAnchor } = {}) {
  let out = `## The clip is attached as video, with sound.
Watch it to know what happened — what is on screen, what the moment looks and
sounds like. Do not describe the video; use it to write the title and name the game.
Perspective check: the gameplay is recorded from the creator's own point of view, and any facecam is their reaction. Before writing, decide WHO made the play — the creator, a teammate, or an opponent. Never credit the creator with someone else's play; when it happened to them, the hook is the reaction.
Payoff check: you can SEE how the clip ends — before keeping the line, confirm the footage actually delivers what it promises. A promise the footage doesn't cash is banned.`;
  out += titleAnchorSection(titleAnchor);
  return out;
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
 * @param {string} [opts.gameHashtag]   The game's hashtag from gamesDb (#223).
 * @returns {string}
 */
function buildSingleSystemPrompt({ mode, kind, styleGuide = "", gameContext = "", styleHistory = "", voiceExamples = [], gameHashtag = "" } = {}) {
  const isTitle = kind === "title";
  const outputField = isTitle ? "title" : "caption";
  const tag = hashtagText(gameHashtag);
  const outputDesc = isTitle
    ? `3-7 words, sentence case, ends with ${tag}`
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

${hardRules(tag)}

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
 * @param {string} [opts.gameName]         The game's display name (#223).
 * @param {string} [opts.projectName]
 * @param {string} [opts.userContext]
 * @returns {string}
 */
function buildSingleUserContent({ kind, currentText, otherOptions, transcript, gameName, projectName, userContext } = {}) {
  let out = `## Clip Transcript:\n${transcript || "(no transcript available)"}`;
  if (gameName) out += `\n\n## Game: ${gameName}`;
  if (projectName) out += `\n\n## ${gameName ? "Project" : "Project/Game"}: ${projectName}`;
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
  buildImportSystemPrompt,
  buildImportUserContent,
};
