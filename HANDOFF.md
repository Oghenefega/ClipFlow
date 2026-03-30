# ClipFlow — Session Handoff
_Last updated: 2026-03-30 (Update technical summary)_

## Current State
App unchanged — this was a documentation-only session. No code modified, no builds needed.

## What Was Just Built

### Updated: reference/TECHNICAL_SUMMARY.md
Full update of the technical summary to reflect all changes since 2026-03-26:

- **Section 2 (Architecture)** — Added pluggable LLM provider registry mention, fixed preload API count to ~93
- **Section 3.1 (Pipeline)** — Removed OBS log parsing reference, replaced with chokidar watcher + manual game assignment
- **Section 3.2 (AI Clip Detection)** — Rewrote with current prompt architecture: 7-section prompt, creator profile system, three-tier few-shot blending (cold start → warming → dialed in)
- **Section 3.3 (AI Title/Caption)** — Removed voice mode references, replaced with archetype-driven tone
- **New Section 4 (App Tabs & User Flow)** — Complete walkthrough of onboarding wizard + all 7 tabs with purpose, key UI elements, and connections between tabs. Includes ASCII pipeline flow diagram.
- **Section 7 (What's Built)** — Added: onboarding wizard, provider registry, cold-start system, dev dashboard, batch rendering, store migrations. Removed onboarding from "Planned." Removed OBS log parsing from "Partially Built." Added Supabase + LemonSqueezy as confirmed backend stack.
- **Section 8 (File Structure)** — Added `ai/` provider directory tree, `OnboardingView.js`, updated descriptions
- **Marketing section** — Removed "first-run onboarding" from launch needs (it's built)

## Key Decisions
- Updated the existing `reference/TECHNICAL_SUMMARY.md` rather than creating a new file — this is the canonical onboarding doc for AI assistants
- Deleted a duplicate `docs/technical-summary.md` that was briefly created during the session

## Next Steps
1. **Test onboarding with fresh store** — delete `clipflow-settings.json`, verify wizard works without voice toggle
2. **Test AI title generation** — confirm titles still generate correctly without voice mode injection
3. **Resume IG/FB OAuth split** — plan is in tasks/todo.md under "Paused", ready to pick up
4. **Fix Issue #12** — undo debounce capturing drag intermediates
5. **Meta app review** — submit for production approval

## Watch Out For
- **reference/TECHNICAL_SUMMARY.md** is the source of truth for AI assistants — keep it updated when features change
- **Two Electron windows** during testing — use task manager to kill all electron.exe before relaunching

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/`
- Pipeline logs: `processing/logs/`
- Dev dashboard: Settings > click version 7x > purple card
- Store file: `%APPDATA%/clipflow-settings/clipflow-settings.json`
