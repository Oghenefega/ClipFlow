const gameProfiles = require("./game-profiles");
const archetypeExamples = require("./data/archetype-examples.json");

// ── Default Creator Profile (generic fallback for fresh installs) ──
// Used when no creatorProfile exists in electron-store (before onboarding).
// Fega's personal data lives in electron-store via migration, not here.
const DEFAULT_CREATOR_PROFILE = {
  name: "",
  archetype: "variety",
  description: "",
  signaturePhrases: [],
  momentPriorities: ["funny", "clutch", "emotional", "fails", "skillful", "educational"],
};

/**
 * Build the full system prompt for highlight detection.
 * Structured for model-agnostic reliability — any LLM should produce
 * clean, parseable, high-quality output from this prompt.
 *
 * @param {object} opts
 * @param {string} opts.gameTag - Game tag (e.g. "AR")
 * @param {string} opts.gameName - Game display name
 * @param {string} opts.gameContext - AI-researched game description
 * @param {Array} opts.approvedClips - Approved clips from feedback.db
 * @param {Array} [opts.rejectedClips] - Rejected clips from feedback.db (negative calibration, #191)
 * @param {object} [opts.creatorProfile] - Creator profile (falls back to DEFAULT_CREATOR_PROFILE)
 * @param {number} [opts.sourceDuration] - Recording length in seconds (#200: lets the model calibrate clip count)
 * @returns {string} Full system prompt
 */
function buildSystemPrompt({ gameTag, gameName, gameContext, entryType, approvedClips, rejectedClips, creatorProfile, sourceDuration }) {
  const creator = creatorProfile || DEFAULT_CREATOR_PROFILE;
  const sections = [];

  // #200: stated so the model can judge how many moments a recording of this
  // length can honestly hold — a 1-min tail clip is not a 30-min session.
  const durationMin = sourceDuration > 0 ? Math.max(1, Math.round(sourceDuration / 60)) : null;
  const durationLine = durationMin
    ? `\n\nThis recording is ~${durationMin} minute${durationMin === 1 ? "" : "s"} long.`
    : "";

  // ── Section 1: Task Definition ──
  sections.push(`# TASK

You are a clip detection AI. You analyze gaming video transcripts and energy data to identify the best moments for short-form content (YouTube Shorts, TikTok, Instagram Reels).

You will receive:
1. A full transcript with per-line energy labels (low / medium / high / explosive)
2. Screenshot frames from peak-energy moments
3. A multi-signal event timeline showing: audio reaction events (cheering, shouting, laughter, gasping via YAMNet), voice pitch spikes above the speaker's baseline, elevated speech rate windows, reaction language clusters, visual scene changes, and silence-then-spike patterns.

Use the event timeline as corroborating evidence. Moments where multiple signals converge are almost always stronger clip candidates than energy alone. Moments with no corroborating signals may still be good clips if the transcript supports it — use your judgment.

You must return: a JSON array of clip recommendations, ordered by confidence (highest first).${durationLine}

Your job is to PICK the moments — the start and end timestamps for each clip, your confidence in each pick, and basic metadata. You are NOT writing titles, descriptions, or narration. A separate downstream stage handles that. Stay disciplined: pick the moments, no prose.`);

  // ── Section 2: Creator Profile ──
  const archetype = creator.archetype || "variety";
  let creatorSection = `# CREATOR PROFILE

Content archetype: ${archetype}`;

  if (creator.name) {
    creatorSection = `# CREATOR PROFILE

Name: ${creator.name}
Content archetype: ${archetype}`;
  }

  if (creator.description) {
    creatorSection += `\n\nPersonality & style:\n${creator.description}`;
  } else {
    // Generic personality from archetype when no description provided (pre-onboarding)
    creatorSection += `\n\nPersonality & style:\n${getArchetypePersonality(archetype)}`;
  }

  if (creator.signaturePhrases && creator.signaturePhrases.length > 0) {
    creatorSection += `\n\nSignature phrases: "${creator.signaturePhrases.join('", "')}"`;
  }

  sections.push(creatorSection);

  // ── Section 3: Game/Content Context ──
  const isContent = entryType === "content";
  const profile = isContent ? null : gameProfiles.getProfile(gameTag);
  const contextLabel = isContent ? "CONTENT CONTEXT" : "GAME CONTEXT";
  const typeLabel = isContent ? "Content type" : "Game";
  let gameSection = `# ${contextLabel}

${typeLabel}: ${gameName || gameTag}`;
  if (gameContext) {
    gameSection += `\n\nAbout this ${isContent ? "content type" : "game"}:\n${capGameContext(gameContext)}`;
  }
  if (profile && profile.playStyle) {
    gameSection += `\n\nHow this creator plays ${gameName || gameTag}:\n${profile.playStyle}`;
  }
  sections.push(gameSection);

  // ── Section 4: Clip Selection Rules ──
  // Order PICK criteria based on creator's momentPriorities
  const pickCriteria = buildPickCriteria(creator.momentPriorities || ["funny", "clutch", "emotional", "fails"]);

  sections.push(`# CLIP SELECTION RULES

## What to PICK (in priority order):
${pickCriteria}

## What to AVOID:
1. Quiet segments with no commentary or energy (looting, menu navigation, loading screens)
2. Moments that require more than 90 seconds of context to understand
3. Pure tutorial or explanation segments with flat delivery
4. Generic damage taken or deaths with no reaction
5. Moments where the creator is AFK, silent, or distracted
6. Duplicate moments — if two clips overlap by more than 50%, keep only the better one`);

  // ── Section 5: Clip Boundary Rules ──
  sections.push(`# CLIP BOUNDARY RULES

1. Every clip MUST be between 7 and 90 seconds long. Match length to the moment: short punchy reactions (7-20s) are great when the joke or peak lands instantly; longer clips (20-90s) suit setups that need narrative buildup
2. Never start a clip mid-sentence — find a natural speech boundary
3. Never end a clip abruptly — include at least 2-3 seconds of reaction after the peak moment
4. Start clips with enough setup that a viewer dropping in cold understands the moment (often 3-5s before the action; less if the moment is self-contained)
5. The best clips have a clear structure: setup > escalation > peak moment > reaction. Shorter clips compress this; don't pad with empty time just to hit a length
6. If a moment needs more than 90 seconds to land, it is not a good short-form clip — skip it
7. Timestamps must match the transcript — do not invent timestamps that don't appear in the source`);

  // ── Section 6: Output Format (JSON Schema) ──
  sections.push(`# OUTPUT FORMAT

Return ONLY a valid JSON array. Your entire response must be parseable by JSON.parse() with zero modifications.

## Schema — each element in the array:

{
  "clip_number": <integer, sequential starting at 1>,
  "start": <string, format "HH:MM:SS", must exist in transcript>,
  "end": <string, format "HH:MM:SS", must be after start, clip duration 7-90 seconds>,
  "energy_level": <string, one of: "LOW", "MED", "HIGH", "EXPLOSIVE">,
  "has_frame": <boolean, true if a provided screenshot falls within this clip's time range>,
  "confidence": <number, 0.50 to 1.00, how confident you are this is a great clip>
}

## Constraints:
- Scale the clip count to the recording: aim for roughly one clip per 90 seconds of recording, minimum 10, maximum 25. A dense 20-30 minute session honestly holds 15-25 clips — do not settle at 14-15 out of habit; keep going until the recording's genuine moments are exhausted. When the recording is too short to hold 10 non-overlapping clips, return as many non-overlapping clips as it can physically hold instead, covering the best moments available — include below-the-bar moments with honest low confidence rather than leaving slots empty. The creator reviews every pick: a weak pick costs one click to reject, but a moment you skip is gone forever. Never return an empty array.
- Order by confidence descending (best clips first)
- clip_number must be sequential: 1, 2, 3, ...
- start must use format HH:MM:SS (zero-padded, e.g. "00:05:30" not "5:30")
- end must use format HH:MM:SS (zero-padded)
- end minus start must be between 7 and 90 seconds
- energy_level must be exactly one of: "LOW", "MED", "HIGH", "EXPLOSIVE"
- confidence must be a decimal number between 0.50 and 1.00
- has_frame must be a boolean (true or false), not a string
- No two clips should overlap by more than 50% of their duration

## DO NOT:
- Do not wrap the JSON in markdown code fences
- Do not add any text, explanation, or commentary before or after the JSON array
- Do not use placeholder values like "..." or "etc"
- Do not return confidence as a string (use 0.85 not "0.85" or "high")
- Do not pad the clip count — never re-slice the same moment into multiple clips, and clip time ranges must not overlap one another
- Do not include any extra fields like "title", "why", "description", or "peak_quote" — those are written by a separate downstream stage`);

  // ── Section 7: Few-Shot Examples (Three-Tier Blending) ──
  const fewShotSection = buildFewShotSection(approvedClips, archetype);
  if (fewShotSection) {
    sections.push(fewShotSection);
  }

  // ── Section 8: Rejected Moments (negative calibration, #191) ──
  const rejectedSection = buildRejectedSection(rejectedClips);
  if (rejectedSection) {
    sections.push(rejectedSection);
  }

  return sections.join("\n\n---\n\n");
}

/**
 * Get a generic personality description based on archetype.
 * Used when the creator hasn't written a custom description yet (pre-onboarding).
 */
function getArchetypePersonality(archetype) {
  const personalities = {
    hype: "High energy gaming content. Big reactions to intense moments, chaos, and unexpected events. Expressive and animated commentary style.",
    competitive: "Skill-focused gaming content. Values clutch plays, strategic reads, and mechanical precision. Commentary centers on decisions, execution, and improvement.",
    chill: "Laid-back gaming content. Conversational tone with storytelling, observations, and relaxed commentary. Moments land through insight and humor rather than volume.",
    variety: "Balanced gaming content mixing action, humor, and commentary. Values both high-energy moments and interesting observations. Adaptable tone that matches the moment.",
  };
  return personalities[archetype] || personalities.variety;
}

// ── Few-shot snippet formatting (#191) ──
// Real clips are shown as quoted transcript snippets — what was actually being
// said is the field that carries taste. Cross-video timestamps taught nothing
// and are gone. Approved + rejected sections share a combined ~6k char budget.
const SNIPPET_MAX_CHARS = 180;
const SECTION_CHAR_BUDGET = 3000; // per section; two sections ≈ 6k combined

// #245: researched game context (aiContextAuto) gets its own cap — one game's
// 8k research dump must not outweigh the few-shot sections (3k each) that the
// taste calibration is built on.
const GAME_CONTEXT_CHAR_BUDGET = 1500;

// ── Rejection reasons (#198, expanded #232) ──
// Reasons that say nothing about taste: the moment was good (duplicate of a
// kept pick, or too similar to clips already kept), or only the
// boundaries/bucket were wrong. Rows carrying any of these never enter the
// negative-calibration set.
const EXCLUDED_REJECT_REASONS = ["duplicate", "bad-cut", "wrong-content", "repetitive"];
const REJECT_REASON_LABELS = {
  duplicate: "duplicate of a kept clip",
  "bad-cut": "bad cut",
  "not-funny": "not funny",
  "nothing-happens": "nothing happens",
  "needs-context": "needs context a viewer wouldn't have",
  "wrong-content": "wrong content for this game",
  "setup-talk": "stream setup / tech talk, not content",
  "chat-banter": "chat banter that doesn't stand alone",
  "flat-delivery": "flat delivery — the reaction didn't carry it",
  repetitive: "too similar to clips already kept",
};

// Canonical group order for the rejected section (#232) — reasons that teach
// the strongest patterns first. Unknown/future keys group after these in
// first-seen order.
const REJECT_GROUP_ORDER = ["nothing-happens", "not-funny", "flat-delivery", "setup-talk", "chat-banter", "needs-context"];

/** Parse the CSV reject_reasons column into an array of keys. */
function parseRejectReasons(row) {
  return String(row?.reject_reasons || "").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Collapse whitespace and truncate at a word boundary — never mid-word.
 */
function truncateSnippet(text, max = SNIPPET_MAX_CHARS) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.lastIndexOf(" ", max);
  return (cut > 0 ? clean.slice(0, cut) : clean.slice(0, max)) + "…";
}

/**
 * Cap researched game context at a word boundary (#245). Unlike
 * truncateSnippet, paragraph structure is preserved when under the cap.
 */
function capGameContext(text) {
  const clean = String(text || "").trim();
  if (clean.length <= GAME_CONTEXT_CHAR_BUDGET) return clean;
  const cut = clean.lastIndexOf(" ", GAME_CONTEXT_CHAR_BUDGET);
  return (cut > 0 ? clean.slice(0, cut) : clean.slice(0, GAME_CONTEXT_CHAR_BUDGET)) + "…";
}

/**
 * Format one real feedback row as a snippet entry. Returns "" when the row
 * has nothing usable (legacy rows with empty transcript_segment and no note).
 */
function formatRealClipEntry(clip, { withNote = false, withReasons = false, skipReason = null } = {}) {
  const snippet = truncateSnippet(clip.transcript_segment);
  const note = withNote ? String(clip.user_note || "").trim() : "";
  if (!snippet && !note) return "";
  let entry = "";
  if (snippet) entry += `\n- "${snippet}"`;
  else entry += `\n- ${clip.title || "(untitled)"}`;
  // #236: approved-but-never-renamed clips carry the auto "Clip N" title —
  // noise presented as signal. Only a real title earns the line.
  const realTitle = String(clip.title || "").trim();
  if (snippet && realTitle && !/^Clip \d+$/.test(realTitle)) entry += `\n  Title: ${realTitle}`;
  entry += `\n  Energy: ${clip.energy_level || "unknown"}`;
  if (withReasons) {
    // #232: inside a grouped section the group header already states the
    // primary reason — skip it and surface only the extra tags.
    const labels = parseRejectReasons(clip)
      .filter((k) => k !== skipReason)
      .map((k) => REJECT_REASON_LABELS[k] || k);
    if (labels.length > 0) entry += `\n  ${skipReason ? "Also tagged" : "Reason"}: ${labels.join(", ")}`;
  }
  if (note) entry += `\n  Creator's note: ${note}`;
  return entry;
}

/**
 * Format rows into entries, stopping when the section budget is spent.
 */
function formatEntriesWithinBudget(clips, opts) {
  const entries = [];
  let used = 0;
  for (const clip of clips) {
    const entry = formatRealClipEntry(clip, opts);
    if (!entry) continue;
    if (used + entry.length > SECTION_CHAR_BUDGET) break;
    entries.push(entry);
    used += entry.length;
  }
  return entries;
}

/**
 * Build the few-shot examples section using three-tier blending.
 *
 * Tier 1 (cold start, 0 approved clips): 5 static archetype examples
 * Tier 2 (warming up, 1-19 approved clips): real clips + static padding to reach 5 minimum
 * Tier 3 (dialed in, 20+ approved clips): only real approved clips, no static examples
 *
 * @param {Array|null} approvedClips - Real approved clips from feedback DB
 * @param {string} archetype - Creator's archetype for selecting static examples
 * @returns {string|null} The few-shot section string, or null if nothing to show
 */
function buildFewShotSection(approvedClips, archetype) {
  const realClips = approvedClips || [];
  const realCount = realClips.length;

  // Tier 3: 20+ real clips — only real data, no static examples
  if (realCount >= 20) {
    const entries = formatEntriesWithinBudget(realClips);
    if (entries.length > 0) return approvedSectionHeader() + entries.join("");
    // All rows unusable (no snippets at all) — fall through to static blending
  }

  // Get static archetype examples for Tier 1 and Tier 2
  const staticExamples = archetypeExamples[archetype] || archetypeExamples.variety || [];

  // Tier 1: 0 real clips — all static archetype examples
  if (realCount === 0) {
    if (staticExamples.length === 0) return null;
    let section = `# EXAMPLE CLIPS (Reference Format)

These examples show the expected output format, timestamp boundaries, and narrative arc structure. Use them as a structural reference.\n`;
    for (const ex of staticExamples) {
      section += formatStaticExample(ex);
    }
    return section;
  }

  // Tier 2: 1-19 real clips — blend real + static to reach minimum 5
  const MIN_EXAMPLES = 5;
  const entries = formatEntriesWithinBudget(realClips);
  const staticNeeded = Math.max(0, MIN_EXAMPLES - entries.length);
  const staticToUse = staticExamples.slice(0, staticNeeded);

  let section = approvedSectionHeader() + entries.join("");

  // Pad with static examples if needed
  if (staticToUse.length > 0) {
    section += `\n\n## Additional Reference Examples (structural format guides)\n`;
    for (const ex of staticToUse) {
      section += formatStaticExample(ex);
    }
  }

  return section;
}

function approvedSectionHeader() {
  return `# EXAMPLES OF CLIPS THIS CREATOR HAS APPROVED

Each example quotes what was being said during a clip this creator approved. Use them as calibration for this creator's taste — prioritize moments with similar energy, humor, and subject matter. The quotes come from other videos; do not look for these exact words or reuse them for this video.\n`;
}

/**
 * Build the rejected-moments section (#191). Negative calibration: moments a
 * previous run clipped and the creator threw away. Returns null when the game
 * has no usable rejections so the section is omitted cleanly.
 *
 * @param {Array|null} rejectedClips - Rejected clips from feedback DB
 * @returns {string|null}
 */
function buildRejectedSection(rejectedClips) {
  // #198: rejections whose reason says nothing about taste (duplicate of a
  // kept clip, bad cut, wrong content, too-similar) are not negative signal —
  // drop them.
  const tasteRejections = (rejectedClips || []).filter(
    (clip) => !parseRejectReasons(clip).some((k) => EXCLUDED_REJECT_REASONS.includes(k))
  );
  if (tasteRejections.length === 0) return null;

  // #232: tagged rows teach the most, so they fill the budget first — grouped
  // by the first reason the creator tapped. Untagged rows (pre-#198 history)
  // come last, only if budget remains.
  const groups = new Map();
  const untagged = [];
  for (const clip of tasteRejections) {
    const reasons = parseRejectReasons(clip);
    if (reasons.length === 0) { untagged.push(clip); continue; }
    const key = reasons[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(clip);
  }

  const orderedKeys = [
    ...REJECT_GROUP_ORDER.filter((k) => groups.has(k)),
    ...[...groups.keys()].filter((k) => !REJECT_GROUP_ORDER.includes(k)),
  ];

  let used = 0;
  let body = "";
  for (const key of orderedKeys) {
    let groupBody = "";
    for (const clip of groups.get(key)) {
      const entry = formatRealClipEntry(clip, { withNote: true, withReasons: true, skipReason: key });
      if (!entry) continue;
      if (used + entry.length > SECTION_CHAR_BUDGET) break;
      groupBody += entry;
      used += entry.length;
    }
    if (groupBody) body += `\n\n## Rejected because: ${REJECT_REASON_LABELS[key] || key}` + groupBody;
  }

  let untaggedBody = "";
  for (const clip of untagged) {
    const entry = formatRealClipEntry(clip, { withNote: true });
    if (!entry) continue;
    if (used + entry.length > SECTION_CHAR_BUDGET) break;
    untaggedBody += entry;
    used += entry.length;
  }
  if (untaggedBody) body += `\n\n## Rejected without a stated reason` + untaggedBody;

  if (!body) return null;
  return `# MOMENTS THIS CREATOR REJECTED

These moments were picked by a previous run and this creator rejected them, grouped by the reason they gave. Treat them as negative calibration — do NOT pick moments like these. Where a creator's note is present, it is the rejection reason in their own words. These examples teach WHICH kinds of moments to skip, not HOW MANY clips to return — they must never push you toward returning fewer moments than the recording genuinely holds.` + body;
}

/**
 * Format a single static archetype example for the prompt.
 */
function formatStaticExample(ex) {
  let s = `\n- Timestamp: ${ex.start} > ${ex.end}`;
  s += `\n  Title: ${ex.title}`;
  s += `\n  Energy: ${ex.energy_level}`;
  s += `\n  Confidence: ${ex.confidence}`;
  return s;
}

/**
 * Build PICK criteria ordered by the creator's moment priorities.
 * Each priority maps to specific selection criteria.
 *
 * @param {string[]} priorities - Ranked list e.g. ["funny", "clutch", "emotional", "fails"]
 * @returns {string} Numbered list of pick criteria
 */
function buildPickCriteria(priorities) {
  const criteriaMap = {
    funny: [
      "HIGH energy combined with humor, sarcasm, or chaotic context",
      "Self-aware comedy — creator roasting their own gameplay, bad decisions, or missed shots",
      "The contrast between what they say they'll do and what actually happens",
    ],
    clutch: [
      "Near-death survival, impossible wins, or comeback moments",
      "Intense focus followed by explosive celebration or disbelief",
      "Villainous confidence — 'watch what I do to this guy' energy",
    ],
    emotional: [
      "Genuine reactions of surprise, shock, or disbelief ('wait WHAT?', 'since when??')",
      "Big celebrations — hype moments where energy peaks",
      "Teammate moments — dramatic apologies, miscommunications, shared victories",
    ],
    fails: [
      "Spectacular failures that the creator reacts to with humor, not genuine frustration",
      "Overconfident predictions followed by immediate punishment",
      "Moments so bad they loop back around to being entertaining",
    ],
    skillful: [
      "Impressive mechanical skill, aim, or movement that stands out",
      "Creative strategies, flanks, or game-sense plays that show mastery",
      "Smooth execution under pressure — the play looks effortless",
    ],
    educational: [
      "Tips, explanations, or strategies delivered with engaging commentary",
      "Moments where the creator breaks down what happened and why it matters",
      "Real-time decision-making narration that teaches while entertaining",
    ],
  };

  const lines = [];
  let num = 1;
  for (const priority of priorities) {
    const criteria = criteriaMap[priority];
    if (criteria) {
      for (const line of criteria) {
        lines.push(`${num}. ${line}`);
        num++;
      }
    }
  }

  // Always include these universal criteria at the end
  lines.push(`${num}. Chat interaction that leads to a funny discovery or moment`);
  num++;
  lines.push(`${num}. A clear narrative arc — buildup followed by payoff (even if the payoff is failure)`);

  return lines.join("\n");
}

/**
 * Select which timeline events render in the prompt's event section (#237).
 *
 * Per-signal score formulas clamp at 1.0 and real recordings blow past the
 * clamp constantly — pitch_spike / transcript_density / reaction_words each
 * pin hundreds of events at exactly 1.0, so a plain top-50 sort degenerates
 * into one signal's earliest windows (tie order = array insertion order) and
 * game / gemini signals (which top out below 1.0 by design) can never render.
 *
 * Selection: walk events best-score-first, cap each signal at `cap` lines and
 * skip events whose signal already has a line within `gapSec` (overlapping
 * windows of the same scream). If caps leave slots open (few signals present),
 * backfill with the best leftovers, still collapsing near-duplicates.
 *
 * @param {Array} events - Timeline events ({t_start, t_end, signal, score, label})
 * @param {object} [opts]
 * @returns {Array} Selected events, sorted by score descending
 */
function selectTimelineEvents(events, { cap = 10, gapSec = 10, limit = 50 } = {}) {
  const sorted = [...events].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const mid = (e) => (e.t_start + (e.t_end ?? e.t_start)) / 2;
  const picked = [];
  const perSignal = {};
  const tooClose = (e) => picked.some((p) => p.signal === e.signal && Math.abs(mid(p) - mid(e)) < gapSec);
  for (const e of sorted) {
    if (picked.length >= limit) break;
    if ((perSignal[e.signal] || 0) >= cap) continue;
    if (tooClose(e)) continue;
    picked.push(e);
    perSignal[e.signal] = (perSignal[e.signal] || 0) + 1;
  }
  if (picked.length < limit) {
    for (const e of sorted) {
      if (picked.length >= limit) break;
      if (picked.includes(e) || tooClose(e)) continue;
      picked.push(e);
    }
  }
  return picked.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/**
 * Build the user message content array for the API call.
 * Includes the full transcript text, multi-signal event timeline, and frame images.
 *
 * @param {object} opts
 * @param {string} opts.claudeReadyText - Full transcript with energy labels
 * @param {Array<{path: string, timestamp: string}>} opts.frames - Frame image paths + timestamps
 * @param {object|null} [opts.eventTimeline] - Lever 1 signal extraction output (optional)
 * @returns {Array} Content array for API message
 */
function buildUserContent({ claudeReadyText, frames, eventTimeline }) {
  const content = [];

  // Add transcript text
  content.push({
    type: "text",
    text: `## Full Transcript with Energy Labels:\n\n${claudeReadyText}`,
  });

  // Add multi-signal event timeline (top 50 events, capped per signal — #237)
  if (eventTimeline && Array.isArray(eventTimeline.events) && eventTimeline.events.length > 0) {
    const top = selectTimelineEvents(eventTimeline.events)
      .map((e) => `${formatTimestamp(e.t_start)} [${e.signal}] ${e.label} (${(e.score ?? 0).toFixed(2)})`)
      .join("\n");

    const used = (eventTimeline.signals_computed || []).join(", ");
    const failed = (eventTimeline.signals_failed || []).length
      ? ` | failed: ${eventTimeline.signals_failed.join(", ")}`
      : "";

    // #190: when game-audio signals contributed, tell the model what they mean.
    // Empty string when absent — mic-only runs keep a byte-identical prompt.
    const hasGameSignals = (eventTimeline.signals_computed || [])
      .some((s) => s === "game_energy" || s === "game_yamnet");
    const gameNote = hasGameSignals
      ? `\ngame_energy and game_yamnet events come from the GAME audio track (announcer, crowd, explosions, goal/kill sounds) — they mark big in-game moments even when the creator's mic is quiet. Clusters of game events are strong clip evidence, especially where the transcript is silent.\n`
      : "";

    content.push({
      type: "text",
      text: `\n## Multi-Signal Event Timeline (${used}${failed}):\n${gameNote}\nTop events by confidence (max 10 per signal, nearby duplicates collapsed):\n${top}`,
    });
  }

  // Add frame images (base64 encoded)
  if (frames && frames.length > 0) {
    content.push({
      type: "text",
      text: `\n## Top ${frames.length} Peak Energy Frames:\nEach frame is labeled with its timestamp in the recording.`,
    });

    const fs = require("fs");
    for (const frame of frames) {
      if (!fs.existsSync(frame.path)) continue;
      const imageData = fs.readFileSync(frame.path);
      const base64 = imageData.toString("base64");
      content.push({
        type: "text",
        text: `Frame at ${frame.timestamp}:`,
      });
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: base64,
        },
      });
    }
  }

  return content;
}

/**
 * Extract valid JSON from an LLM response that may contain extra text,
 * markdown fences, or preamble. Works across all model providers.
 *
 * @param {string} raw - Raw LLM response text
 * @param {"array"|"object"} expectedType - Whether to look for [ ] or { }
 * @returns {any} Parsed JSON
 * @throws {Error} If no valid JSON found
 */
function extractJSON(raw, expectedType = "array") {
  if (!raw || typeof raw !== "string") {
    throw new Error("Empty or non-string response from LLM");
  }

  let text = raw;

  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1];
  }

  text = text.trim();

  // Find the JSON boundaries based on expected type
  const openChar = expectedType === "array" ? "[" : "{";
  const closeChar = expectedType === "array" ? "]" : "}";

  const startIdx = text.indexOf(openChar);
  const endIdx = text.lastIndexOf(closeChar);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(`No valid JSON ${expectedType} found in response. Raw starts with: ${raw.substring(0, 200)}`);
  }

  const jsonStr = text.substring(startIdx, endIdx + 1);

  return JSON.parse(jsonStr);
}

/**
 * Parse a timestamp string "HH:MM:SS" to seconds.
 */
function parseTimestamp(ts) {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseFloat(ts) || 0;
}

/**
 * Format seconds to "HH:MM:SS".
 */
function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

module.exports = {
  buildSystemPrompt,
  buildUserContent,
  extractJSON,
  parseTimestamp,
  formatTimestamp,
  DEFAULT_CREATOR_PROFILE,
  // exported for unit tests (#191) and the replay harness (#237)
  buildFewShotSection,
  buildRejectedSection,
  truncateSnippet,
  selectTimelineEvents,
};
