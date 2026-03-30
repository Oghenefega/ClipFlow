# ClipFlow — Session Handoff
_Last updated: 2026-03-30 (Onboarding Wizard + AI Preferences UI)_

## Current State
App builds clean and runs correctly. Onboarding wizard and Settings AI Preferences section are live. All 3 onboarding screens render and function. Existing users with configured profiles auto-skip onboarding.

## What Was Just Built

### Onboarding Wizard (commit b3ee2bf)

- **OnboardingView.js** — 3-screen first-launch wizard:
  - Screen 1: "What's your content vibe?" — 4 archetype cards (hype, competitive, chill, variety) with visual selection
  - Screen 2: "What moments matter most?" — 6 moment types with up/down arrow ranking, pre-populated order per archetype
  - Screen 3: "Describe your style" — optional personality textarea + hype/chill voice mode toggle
  - Skip option on every screen, safety fallback if store write fails

- **App.js onboarding gate** — checks `onboardingComplete` flag from store, renders OnboardingView as full-screen overlay when false

- **AI Preferences in Settings** — full editor section with:
  - Compact archetype selector (pill buttons)
  - Moment priority list with up/down arrows + "Reset to default" per archetype
  - Style description textarea (auto-saves on change)
  - Voice mode toggle (Hype/Chill)
  - "Reset AI preferences" with confirmation dialog (preserves feedback.db)
  - "Re-run onboarding" button (sets flag to false + reloads)

- **6 moment types** (expanded from 4):
  - funny, clutch, emotional, fails + NEW: skillful, educational
  - Each has 3 criteria lines in `buildPickCriteria()` in ai-prompt.js
  - Migration expands existing 4-item arrays to 6

- **Migrations:**
  - Removed Fega hardcoded profile migration (onboarding replaces it)
  - Added momentPriorities 4→6 expansion for existing users
  - Added auto-complete onboarding for users with existing non-empty description

## Key Decisions
- **Up/down arrows instead of drag-and-drop** — no DnD library in project, arrows are reliable and simple
- **Pre-populated moment order per archetype** — picking Hype pre-sorts to funny/emotional/fails first, feels smart
- **No creator name collection** — pipeline doesn't use it meaningfully, kept field in data model for future use
- **onboardingComplete boolean as primary gate** — not archetype value, avoids false trigger for genuine "variety" users
- **Store write safety fallback** — wizard tracks completion in React state too, so store failure doesn't trap user
- **Reset preserves feedback.db** — preferences vs. history are separate concerns
- **Settings saves immediately on interaction** — matches existing SettingsView pattern (no explicit Save button)

## Next Steps
1. **Test onboarding with a fresh store** — delete `clipflow-settings.json` from AppData, verify wizard appears and completes correctly
2. **Verify Settings AI Preferences** — open Settings, check that profile data from onboarding shows correctly, test editing and reset
3. **Test the AI pipeline** with the new 6 moment types — process a video, verify "skillful" and "educational" criteria appear in the system prompt
4. **Remaining from previous sessions**: test publishing pipeline, fix Issue #12 (undo debounce), Meta app review, IG/FB OAuth split

## Watch Out For
- **Two ClipFlow electron windows listed** during testing — one is the main window, one may be a ghost from a previous session. Use task manager to kill all electron.exe before relaunching
- **Display scaling affects MCP click coordinates** — the 1920x617 resolution suggests non-standard scaling. Button clicks may need adjustment during automated testing
- **Fega's profile still has old 4-item momentPriorities in store** until migration runs — the migration appends "skillful" and "educational" on next startup
- **`onboardingComplete` defaults to `false`** in store schema — fresh installs will always show onboarding (correct behavior)

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/`
- Pipeline logs: `processing/logs/`
- Dev dashboard: Settings > click version 7x > purple card
- Onboarding migration log: look for "Auto-completed onboarding for existing configured profile" in startup logs
- MomentPriorities migration log: look for "Migrated momentPriorities: added skillful + educational"
- Store file: `%APPDATA%/clipflow-settings/clipflow-settings.json` — check `onboardingComplete` and `creatorProfile` keys
