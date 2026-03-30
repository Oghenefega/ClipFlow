# ClipFlow — Session Handoff
_Last updated: 2026-03-30 (AI Prompt Redesign for Model-Agnostic Reliability)_

## Current State
App builds clean and runs correctly. Both AI prompts (highlight detection + title/caption generation) have been redesigned for model-agnostic reliability. Provider abstraction layer from previous session remains unchanged and working.

## What Was Just Built

### AI Prompt Redesign — Goal A (commit 4eec903)

**Highlight Detection** (`src/main/ai-prompt.js` — full rewrite):
- 7 structured sections with `#` headers instead of prose blobs
- Explicit JSON schema with typed constraints per field (confidence 0.50-1.00 as number, timestamps HH:MM:SS zero-padded, clip duration 30-90s, energy_level must be one of LOW/MED/HIGH/EXPLOSIVE)
- Numbered rules: 7 clip boundary rules, 14 priority-ordered pick criteria, 6 avoid criteria
- `buildPickCriteria()` function reorders selection rules based on creator's `momentPriorities` ranking
- Parameterized creator profile — reads from `creatorProfile` object, falls back to `DEFAULT_CREATOR_PROFILE` (current Fega personality data)
- DO/DO NOT output guardrails near the JSON schema
- Few-shot section annotated with Tier 1/2/3 comments ready for Goal B

**Title/Caption Generation** (`src/main/main.js` handler):
- All 5 title slots and 5 caption slots shown explicitly in schema (no `...5 total` patterns)
- Separated title rules (7 numbered) and caption rules (6 numbered)
- Field constraints inline in schema: `<string, 3-10 words + #gamehashtag>`, `<string, under 15 words, no hashtags>`
- DO NOT guardrails block

**Robust JSON Parsing** (both files):
- New `extractJSON(raw, expectedType)` utility in `ai-prompt.js` — exported for shared use
- Handles: markdown fences, preamble text before JSON, trailing text after JSON
- Finds first `[`/`{` and last `]`/`}` based on expected type — belt-and-suspenders approach
- Used by both `ai-pipeline.js` (highlight detection) and `main.js` (title/caption gen)

### Goal B Spec Written to tasks/todo.md
Full cold-start architecture spec for next session — three-tier example blending, archetype examples file, creator profile data model, Fega migration, verification criteria.

## Key Decisions
- **Prompts are parameterized but default to Fega** — `DEFAULT_CREATOR_PROFILE` object contains all of Fega's personality, phrases, and priorities. Goal B migrates this into electron-store so other users can have their own profiles
- **No adapter changes needed** — the adapter layer (from previous session) handles API format translation; this session was purely prompt content
- **`extractJSON()` is defensive** — we still tell models to return clean JSON, but the parser handles models that don't follow instructions perfectly
- **Moment priorities are a ranked list, not toggles** — `["funny", "emotional", "clutch", "fails"]` determines the order of PICK criteria in the prompt. Goal B will let users customize this
- **No `<reasoning>` blocks** — decided against adding thinking tags; more parsing complexity, more failure modes
- **No per-provider prompt variations** — no "think step by step" for weaker models. Test first, add only if a specific model underperforms

## Next Steps
1. **Goal B: Cold-Start Architecture** (full spec in `tasks/todo.md`) — three-tier example blending, archetype-examples.json, creator profile data model, onboarding data layer
2. Test the redesigned prompts by processing a video end-to-end — verify highlight detection quality is at least as good as before
3. Test title/caption generation in the editor
4. Try swapping to a non-Anthropic provider via dev dashboard to validate model-agnostic prompts work
5. Remaining items from previous session: test publishing pipeline, fix Issue #12 (undo debounce), Meta app review

## Watch Out For
- **`DEFAULT_CREATOR_PROFILE` is in ai-prompt.js** — when Goal B is built, this gets replaced by reading from electron-store. Don't duplicate the personality data
- **`creatorProfile` param on `buildSystemPrompt()`** — currently nothing passes it (falls back to default). Goal B will wire it up from the store
- **`aiPrompt` is now imported in main.js** — added `const aiPrompt = require("./ai-prompt")` for `extractJSON()` access
- **Energy level values changed** — added "EXPLOSIVE" as a fourth level above "HIGH". The pipeline stores whatever the model returns in `clip.energy_level`
- **Game research still hardcoded to claude-opus-4-6** — unchanged from previous session, same caveat applies when using non-Anthropic providers

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/`
- Pipeline logs: `processing/logs/`
- Dev dashboard: Settings > click version 7x > purple card
- To see the actual prompts sent to the model: check pipeline logs, they include the full system prompt
