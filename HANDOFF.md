# ClipFlow — Session Handoff
_Last updated: 2026-03-30 (Goal B: Cold-Start Architecture + Creator Profile System)_

## Current State
App builds clean and runs correctly. Three-tier few-shot blending system is live, creator profile migrated from hardcoded default to electron-store, archetype examples file created.

## What Was Just Built

### Goal B: Cold-Start Architecture (commit 32c6c85)

- **Three-tier few-shot blending** in `ai-prompt.js`:
  - Tier 1 (0 approved clips): 5 static archetype examples labeled as "Reference Format"
  - Tier 2 (1-19 clips): real approved clips first + static padding to reach minimum 5
  - Tier 3 (20+ clips): only real approved clips, no static examples
  - Gradual transition — static examples phase out naturally as real clips accumulate

- **Archetype examples file** (`src/main/data/archetype-examples.json`):
  - 20 examples total: 5 per archetype (hype, competitive, chill, variety)
  - Structure-focused: proper timestamps, narrative arcs, JSON format, confidence scoring
  - Personality-neutral — archetypes vary moment TYPE, not creator voice

- **Creator profile data model** in electron-store:
  - Fields: `archetype`, `description`, `signaturePhrases`, `momentPriorities`, `voiceMode`
  - Generic defaults: archetype "variety", empty description, standard priority order
  - Migration detects empty description and populates Fega's personality data

- **Prompt builder integration**:
  - `buildSystemPrompt()` reads `creatorProfile` from store (passed by ai-pipeline.js)
  - Empty description falls back to `getArchetypePersonality()` generic blurb
  - `DEFAULT_CREATOR_PROFILE` is now a generic fallback, not Fega-specific

- **Fega migration**:
  - Hardcoded Fega personality moved from `DEFAULT_CREATOR_PROFILE` to electron-store
  - Migration runs on startup if `creatorProfile.description` is empty
  - Pipeline output should be identical to pre-migration behavior

## Key Decisions
- **Archetype examples teach structure, not style** — they show proper clip boundaries, narrative arcs, and JSON format. Creator personality comes from real approved clips, not static examples
- **momentPriorities is a ranked list, not toggles** — AI always looks for ALL moment types, ranking determines emphasis order in PICK criteria
- **Migration detects empty description** — `store.has()` always returns true when key is in defaults, so we check `!existingProfile.description` instead
- **No onboarding UI in Goal B** — data layer only. Fega's profile populated via migration; fresh installs get "variety" defaults until onboarding is built
- **One-time onboarding philosophy** — competitive differentiator vs Opus Clip's per-video genre selection. ClipFlow already knows it's gaming content

## Next Steps
1. **Test the three-tier system end-to-end** — process a video and verify prompt includes archetype examples (cold start) or real clips (if Fega has approved clips in feedback.db)
2. **Review archetype examples** — Fega should read `src/main/data/archetype-examples.json` and verify quality of all 20 examples
3. **Test title/caption generation** in the editor with the new profile system
4. **Onboarding UI** (separate task) — archetype picker, priority ranker, optional personality description
5. **Remaining from previous sessions**: test publishing pipeline, fix Issue #12 (undo debounce), Meta app review, swap to non-Anthropic provider for testing

## Watch Out For
- **Fega migration runs every startup while description is empty** — once Fega's profile is populated (which it is now), the `!existingProfile.description` check prevents re-migration. But if someone manually clears the description, migration will re-run and overwrite with Fega's data. This is fine for now (single user) but needs revisiting before multi-user launch
- **`creatorProfile` in store defaults vs migration** — the defaults have generic "variety" archetype, but migration immediately overwrites with Fega's "hype" data. For a fresh install that ISN'T Fega, the migration would still set Fega's personality. Remove the Fega migration before public release
- **`archetype` variable scoped in buildSystemPrompt** — extracted early (line 45) and passed to `buildFewShotSection()`. If you refactor the prompt builder, keep this variable available for both Section 2 and Section 7
- **Game research still hardcoded to claude-opus-4-6** — unchanged from previous sessions

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/`
- Pipeline logs: `processing/logs/`
- Dev dashboard: Settings > click version 7x > purple card
- Migration log: look for "Migrated Fega creatorProfile into electron-store" in startup logs
- To verify tier selection: check pipeline logs for the system prompt — Section 7 header will say "EXAMPLE CLIPS (Reference Format)" for Tier 1, "EXAMPLES OF CLIPS THIS CREATOR HAS APPROVED" for Tier 2/3
