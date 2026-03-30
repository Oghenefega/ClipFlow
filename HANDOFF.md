# ClipFlow — Session Handoff
_Last updated: 2026-03-30 (Remove legacy features: OBS log parser + voice modes)_

## Current State
App builds clean and runs correctly. Two legacy features removed: OBS log parser (dead code) and hype/chill voice mode (redundant with archetype system). 10 files changed, -356 lines net.

## What Was Just Built

### Removed: OBS Log Parser (Game Detection)
- **main.js** — deleted `obs:parseLog` IPC handler (~40 lines) that parsed OBS log files for game .exe names
- **preload.js** — deleted `parseOBSLog()` bridge method
- **RenameView.js** — removed decorative "OBS LOG" cyan status badge, updated subtitle from "OBS recordings" to "Recordings"
- **pipeline.md** — removed OBS log parsing rules from Claude rules

### Removed: Hype/Chill Voice Modes
- **useAIStore.js** — removed `voiceMode` state, `setVoiceMode` action, voice-based prompt injection ternary, reset default
- **RightPanelNew.js** — removed voice toggle buttons (fire/chill emoji) from editor AI panel
- **OnboardingView.js** — removed `ARCHETYPE_VOICE` mapping, `voiceMode` state, voice toggle from screen 3 (PersonalityStep). Description textarea remains.
- **SettingsView.js** — removed "Default Title Style" toggle section from AI Preferences. Removed `voiceMode` from default profile objects.
- **main.js** — removed `voiceMode: "hype"` from `creatorProfile` store defaults
- **ai-prompt.js** — removed `voiceMode` from `DEFAULT_CREATOR_PROFILE`

### Updated: tasks/todo.md
- Added removal plan with checkboxes (all completed)
- Moved IG/FB OAuth split to "Paused" status
- Kept backend infrastructure plan intact

## Key Decisions
- **OBS log parser was dead code** — fully built IPC handler + preload bridge, but never called from any renderer. Game detection already works via filename date parsing + manual dropdown. Safe full removal.
- **Voice mode redundant** — the archetype + description + momentPriorities system provides more nuanced tone control than a binary hype/chill toggle. The `userContext` parameter still flows through to the API — it just no longer prepends a voice instruction.
- **No migration needed** — existing `voiceMode` in stored `creatorProfile` objects is harmless (ignored). No need to strip it from existing stores.
- **Kept RAW_OBS_PATTERN** — the file watcher regex that matches OBS filename format is still active and useful. Only the log parser was removed.

## Next Steps
1. **Test onboarding with fresh store** — delete `clipflow-settings.json`, verify wizard works without voice toggle
2. **Test AI title generation** — confirm titles still generate correctly without voice mode injection
3. **Resume IG/FB OAuth split** — plan is in tasks/todo.md under "Paused", ready to pick up
4. **Remaining**: test publishing pipeline, fix Issue #12 (undo debounce), Meta app review

## Watch Out For
- **Old `voiceMode` in stored profiles** — existing users will still have `voiceMode: "hype"` in their `creatorProfile` object in electron-store. This is harmless since nothing reads it, but it's there.
- **Two Electron windows** during testing — use task manager to kill all electron.exe before relaunching
- **Onboarding screen 3** is now description-only — simpler but may feel sparse. Consider adding more personality options in a future session.

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/`
- Pipeline logs: `processing/logs/`
- Dev dashboard: Settings > click version 7x > purple card
- Store file: `%APPDATA%/clipflow-settings/clipflow-settings.json` — check `creatorProfile` key (voiceMode may still be present in old stores, that's fine)
