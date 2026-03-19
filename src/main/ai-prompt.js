const gameProfiles = require("./game-profiles");

/**
 * Build the full Claude system prompt for highlight detection.
 * Sections A–F per the ClipFlow AI Spec.
 *
 * @param {object} opts
 * @param {string} opts.gameTag - Game tag (e.g. "AR")
 * @param {string} opts.gameName - Game display name
 * @param {string} opts.gameContext - AI-researched game description (from game library)
 * @param {Array} opts.approvedClips - Last 20 approved clips from feedback.db
 * @returns {string} Full system prompt
 */
function buildSystemPrompt({ gameTag, gameName, gameContext, approvedClips }) {
  const sections = [];

  // Section A — Who Fega Is (Static)
  sections.push(`You are identifying highlights for a gaming content creator named Fega (Oghenefega Ofovwe), a Nigerian-Canadian solo streamer based in Ottawa. His brand is built on high energy, humor, and genuine community connection. He streams Monday–Saturday at 5pm and posts 48 shorts per week. His audience expects entertainment first — not pro-level gameplay.

You are analyzing a transcript from one of his gaming sessions. Your job is to identify 15–20 moments that would make the best short-form clips (30–90 seconds each).`);

  // Section B — Fega's Streaming Personality (Static)
  sections.push(`FEGA'S STREAMING PERSONALITY:

- High energy & hype: Genuinely loud and reactive. Gets excited easily. Celebrations are big and loud.
- Fake rage: ALL dramatic negative reactions are for entertainment. "GET HIM OUT OF MY FACE" means he scored or made a great play. He is NEVER actually angry. Interpret aggression as hype.
- Self-deprecating: Constantly roasts his own gameplay. Bad aim, wrong decisions, forgetting items — all comedy material he leans into.
- Community first: Talks TO chat, not AT them. Reads names, responds mid-game, acknowledges everyone who shows up.
- Sarcasm: Delivered dry, often at peak energy. The contrast makes it land.
- Signature phrases: "Oh my goodness", "bruh", "lads", "boys", "bro", "man", "by fire by force", "oh goodness gracious", "let's freaking go", "it's giving", "that is dangerous"
- Always fun: These games are ALWAYS ultimately a fun time. Never interpret his commentary as genuine negativity.`);

  // Section C — Game Context (Dynamic)
  const profile = gameProfiles.getProfile(gameTag);
  let gameSection = `GAME: ${gameName || gameTag}\n`;
  if (gameContext) {
    gameSection += `\nGAME KNOWLEDGE:\n${gameContext}\n`;
  }
  if (profile && profile.playStyle) {
    gameSection += `\nFEGA'S PLAY STYLE FOR THIS GAME:\n${profile.playStyle}`;
  }
  sections.push(gameSection);

  // Section D — What Makes a Great Clip (Static)
  sections.push(`WHAT MAKES A GREAT CLIP FOR FEGA:

PICK moments that have:
- HIGH energy combined with funny or chaotic context
- A clear narrative arc — buildup → payoff (even if the payoff is failure or embarrassment)
- Self-aware humor about doing something dumb or risky
- Chat interaction that leads to a funny discovery or moment
- Near-death, panic, or impossible situations
- Sarcastic commentary delivered at peak energy
- Genuine disbelief — "wait WHAT?", "since when??", "how??"
- Villainous confidence — "what I had planned for him"
- Teammate moments — dramatic apologies, celebrations, miscommunications
- The contrast between what he says he'll do and what actually happens

AVOID moments that have:
- Quiet looting or exploring with no commentary
- Menu navigation or crafting with no energy or humor
- Generic damage taken with no reaction
- Pure tutorial or explanation segments
- Moments that require 2+ minutes of context to understand why they're funny
- Flat delivery with no arc`);

  // Section E — Output Format (Static)
  sections.push(`Return ONLY a valid JSON array. No preamble, no explanation, no text outside the JSON.
Target 15–20 clips. Order by confidence descending.

Format:
[
  {
    "clip_number": 1,
    "start": "HH:MM:SS",
    "end": "HH:MM:SS",
    "title": "max 8 words, punchy, YouTube Shorts style",
    "why": "1-2 sentences explaining exactly why this works for Fega's audience",
    "peak_quote": "the exact transcript line that is the funniest or most hype moment",
    "energy_level": "HIGH or MED or LOW",
    "has_frame": true or false,
    "confidence": 0.0 to 1.0
  }
]`);

  // Section F — Few-Shot Examples (Dynamic)
  if (approvedClips && approvedClips.length >= 5) {
    let fewShot = `CLIPS FEGA HAS PREVIOUSLY APPROVED FOR ${gameName || gameTag}:\nUse these as calibration for his taste. Prioritize similar moments.\n`;
    for (const clip of approvedClips.slice(0, 20)) {
      fewShot += `\n- Timestamp: ${clip.clip_start} → ${clip.clip_end}`;
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
 * Build the user message content array for the Claude API call.
 * Includes the full transcript text and frame images.
 *
 * @param {object} opts
 * @param {string} opts.claudeReadyText - Full transcript with energy labels
 * @param {Array<{path: string, timestamp: string}>} opts.frames - Frame image paths + timestamps
 * @returns {Array} Content array for Claude API message
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
  parseTimestamp,
  formatTimestamp,
};
