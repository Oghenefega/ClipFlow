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
 * @param {object} [opts.creatorProfile] - Creator profile (falls back to DEFAULT_CREATOR_PROFILE)
 * @returns {string} Full system prompt
 */
function buildSystemPrompt({ gameTag, gameName, gameContext, entryType, approvedClips, creatorProfile }) {
  const creator = creatorProfile || DEFAULT_CREATOR_PROFILE;
  const sections = [];

  // ── Section 1: Task Definition ──
  sections.push(`# TASK

You are a clip detection AI. You analyze gaming video transcripts and energy data to identify the best moments for short-form content (YouTube Shorts, TikTok, Instagram Reels).

You will receive:
1. A full transcript with per-line energy labels (low / medium / high / explosive)
2. Screenshot frames from peak-energy moments
3. A multi-signal event timeline showing: audio reaction events (cheering, shouting, laughter, gasping via YAMNet), voice pitch spikes above the speaker's baseline, elevated speech rate windows, reaction language clusters, visual scene changes, and silence-then-spike patterns.

Use the event timeline as corroborating evidence. Moments where multiple signals converge are almost always stronger clip candidates than energy alone. Moments with no corroborating signals may still be good clips if the transcript supports it — use your judgment.

You must return: a JSON array of 10-25 clip recommendations, ordered by confidence (highest first).`);

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
    gameSection += `\n\nAbout this ${isContent ? "content type" : "game"}:\n${gameContext}`;
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

1. Every clip MUST be between 30 and 90 seconds long
2. Never start a clip mid-sentence — find a natural speech boundary
3. Never end a clip abruptly — include at least 2-3 seconds of reaction after the peak moment
4. Start clips 3-5 seconds BEFORE the action begins (setup matters for narrative arc)
5. The best clips have a clear structure: setup > escalation > peak moment > reaction
6. If a moment needs more than 90 seconds to land, it is not a good short-form clip — skip it
7. Timestamps must match the transcript — do not invent timestamps that don't appear in the source`);

  // ── Section 6: Output Format (JSON Schema) ──
  sections.push(`# OUTPUT FORMAT

Return ONLY a valid JSON array. Your entire response must be parseable by JSON.parse() with zero modifications.

## Schema — each element in the array:

{
  "clip_number": <integer, sequential starting at 1>,
  "start": <string, format "HH:MM:SS", must exist in transcript>,
  "end": <string, format "HH:MM:SS", must be after start, clip duration 30-90 seconds>,
  "title": <string, 3-8 words, punchy short-form style, capitalize first letter of each major word>,
  "why": <string, 1-2 sentences explaining why this moment works as a clip>,
  "peak_quote": <string, the exact funniest or most hype line from the transcript within this clip's time range>,
  "energy_level": <string, one of: "LOW", "MED", "HIGH", "EXPLOSIVE">,
  "has_frame": <boolean, true if a provided screenshot falls within this clip's time range>,
  "confidence": <number, 0.50 to 1.00, how confident you are this is a great clip>
}

## Constraints:
- Return 10 to 25 clips total
- Order by confidence descending (best clips first)
- clip_number must be sequential: 1, 2, 3, ...
- start must use format HH:MM:SS (zero-padded, e.g. "00:05:30" not "5:30")
- end must use format HH:MM:SS (zero-padded)
- end minus start must be between 30 and 90 seconds
- energy_level must be exactly one of: "LOW", "MED", "HIGH", "EXPLOSIVE"
- confidence must be a decimal number between 0.50 and 1.00
- has_frame must be a boolean (true or false), not a string
- peak_quote must be a direct quote from the transcript, not paraphrased
- No two clips should overlap by more than 50% of their duration

## DO NOT:
- Do not wrap the JSON in markdown code fences
- Do not add any text, explanation, or commentary before or after the JSON array
- Do not use placeholder values like "..." or "etc"
- Do not return confidence as a string (use 0.85 not "0.85" or "high")
- Do not return fewer than 10 clips unless the video genuinely has fewer than 10 interesting moments
- Do not repeat the same title pattern across multiple clips
- Do not use emojis in titles or any text fields — plain text only`);

  // ── Section 7: Few-Shot Examples (Three-Tier Blending) ──
  const fewShotSection = buildFewShotSection(approvedClips, archetype);
  if (fewShotSection) {
    sections.push(fewShotSection);
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
    return formatRealClipsSection(realClips.slice(0, 20));
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
  const staticNeeded = Math.max(0, MIN_EXAMPLES - realCount);
  const staticToUse = staticExamples.slice(0, staticNeeded);

  let section = `# EXAMPLES OF CLIPS THIS CREATOR HAS APPROVED

Use these as calibration for this creator's taste. Prioritize similar moments.\n`;

  // Real clips first (they take priority)
  for (const clip of realClips.slice(0, 20)) {
    section += `\n- Timestamp: ${clip.clip_start} > ${clip.clip_end}`;
    section += `\n  Title: ${clip.title || "(untitled)"}`;
    section += `\n  Why it worked: ${clip.claude_reason || "(no reason logged)"}`;
    section += `\n  Peak quote: ${clip.peak_quote || "(none)"}`;
    section += `\n  Energy: ${clip.energy_level || "unknown"}`;
  }

  // Pad with static examples if needed
  if (staticToUse.length > 0) {
    section += `\n\n## Additional Reference Examples (structural format guides)\n`;
    for (const ex of staticToUse) {
      section += formatStaticExample(ex);
    }
  }

  return section;
}

/**
 * Format a real approved clips section (Tier 3).
 */
function formatRealClipsSection(clips) {
  let section = `# EXAMPLES OF CLIPS THIS CREATOR HAS APPROVED

Use these as calibration for this creator's taste. Prioritize similar moments.\n`;
  for (const clip of clips) {
    section += `\n- Timestamp: ${clip.clip_start} > ${clip.clip_end}`;
    section += `\n  Title: ${clip.title || "(untitled)"}`;
    section += `\n  Why it worked: ${clip.claude_reason || "(no reason logged)"}`;
    section += `\n  Peak quote: ${clip.peak_quote || "(none)"}`;
    section += `\n  Energy: ${clip.energy_level || "unknown"}`;
  }
  return section;
}

/**
 * Format a single static archetype example for the prompt.
 */
function formatStaticExample(ex) {
  let s = `\n- Timestamp: ${ex.start} > ${ex.end}`;
  s += `\n  Title: ${ex.title}`;
  s += `\n  Why it worked: ${ex.why}`;
  s += `\n  Peak quote: ${ex.peak_quote}`;
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

  // Add multi-signal event timeline (top 50 events by score)
  if (eventTimeline && Array.isArray(eventTimeline.events) && eventTimeline.events.length > 0) {
    const top = [...eventTimeline.events]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 50)
      .map((e) => `${formatTimestamp(e.t_start)} [${e.signal}] ${e.label} (${(e.score ?? 0).toFixed(2)})`)
      .join("\n");

    const used = (eventTimeline.signals_computed || []).join(", ");
    const failed = (eventTimeline.signals_failed || []).length
      ? ` | failed: ${eventTimeline.signals_failed.join(", ")}`
      : "";

    content.push({
      type: "text",
      text: `\n## Multi-Signal Event Timeline (${used}${failed}):\n\nTop events by confidence:\n${top}`,
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
};
