const gameProfiles = require("./game-profiles");

// ── Default Creator Profile (Fega) ──
// Goal B will migrate this into electron-store as `creatorProfile`.
// For now, this is the hardcoded default used when no profile exists.
const DEFAULT_CREATOR_PROFILE = {
  name: "Fega",
  archetype: "hype",
  description: `High energy & hype: Genuinely loud and reactive. Gets excited easily. Celebrations are big and loud.
Fake rage: ALL dramatic negative reactions are for entertainment. "GET HIM OUT OF MY FACE" means he scored or made a great play. He is NEVER actually angry. Interpret aggression as hype.
Self-deprecating: Constantly roasts his own gameplay. Bad aim, wrong decisions, forgetting items — all comedy material he leans into.
Community first: Talks TO chat, not AT them. Reads names, responds mid-game, acknowledges everyone who shows up.
Sarcasm: Delivered dry, often at peak energy. The contrast makes it land.
Always fun: These games are ALWAYS ultimately a fun time. Never interpret his commentary as genuine negativity.`,
  signaturePhrases: [
    "Oh my goodness", "bruh", "lads", "boys", "bro", "man",
    "by fire by force", "oh goodness gracious", "let's freaking go",
    "it's giving", "that is dangerous",
  ],
  momentPriorities: ["funny", "emotional", "clutch", "fails"],
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
function buildSystemPrompt({ gameTag, gameName, gameContext, approvedClips, creatorProfile }) {
  const creator = creatorProfile || DEFAULT_CREATOR_PROFILE;
  const sections = [];

  // ── Section 1: Task Definition ──
  sections.push(`# TASK

You are a clip detection AI. You analyze gaming video transcripts and energy data to identify the best moments for short-form content (YouTube Shorts, TikTok, Instagram Reels).

You will receive:
1. A full transcript with per-line energy labels (low / medium / high / explosive)
2. Screenshot frames from peak-energy moments

You must return: a JSON array of 10-25 clip recommendations, ordered by confidence (highest first).`);

  // ── Section 2: Creator Profile ──
  let creatorSection = `# CREATOR PROFILE

Name: ${creator.name || "Unknown"}
Content archetype: ${creator.archetype || "variety"}`;

  if (creator.description) {
    creatorSection += `\n\nPersonality & style:\n${creator.description}`;
  }

  if (creator.signaturePhrases && creator.signaturePhrases.length > 0) {
    creatorSection += `\n\nSignature phrases: "${creator.signaturePhrases.join('", "')}"`;
  }

  sections.push(creatorSection);

  // ── Section 3: Game Context ──
  const profile = gameProfiles.getProfile(gameTag);
  let gameSection = `# GAME CONTEXT

Game: ${gameName || gameTag}`;
  if (gameContext) {
    gameSection += `\n\nAbout this game:\n${gameContext}`;
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
- Do not repeat the same title pattern across multiple clips`);

  // ── Section 7: Few-Shot Examples ──
  // Three-tier system: archetypes for cold start, real clips when available
  // Goal B will add Tier 1 (archetype examples) and Tier 2 (blending).
  // For now, only Tier 3 (real approved clips) is implemented.
  if (approvedClips && approvedClips.length >= 5) {
    let fewShot = `# EXAMPLES OF CLIPS THIS CREATOR HAS APPROVED

Use these as calibration for this creator's taste. Prioritize similar moments.\n`;
    for (const clip of approvedClips.slice(0, 20)) {
      fewShot += `\n- Timestamp: ${clip.clip_start} > ${clip.clip_end}`;
      fewShot += `\n  Title: ${clip.title || "(untitled)"}`;
      fewShot += `\n  Why it worked: ${clip.claude_reason || "(no reason logged)"}`;
      fewShot += `\n  Peak quote: ${clip.peak_quote || "(none)"}`;
      fewShot += `\n  Energy: ${clip.energy_level || "unknown"}`;
    }
    sections.push(fewShot);
  }

  return sections.join("\n\n---\n\n");
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
 * Includes the full transcript text and frame images.
 *
 * @param {object} opts
 * @param {string} opts.claudeReadyText - Full transcript with energy labels
 * @param {Array<{path: string, timestamp: string}>} opts.frames - Frame image paths + timestamps
 * @returns {Array} Content array for API message
 */
function buildUserContent({ claudeReadyText, frames }) {
  const content = [];

  // Add transcript text
  content.push({
    type: "text",
    text: `## Full Transcript with Energy Labels:\n\n${claudeReadyText}`,
  });

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
