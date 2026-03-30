# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

## 🔲 In Progress — Remove Legacy Features (OBS Log Parser + Voice Modes)

### Goal
Remove two legacy features that are no longer useful for a commercial product: the OBS log parser (game detection) and the hype/chill voice mode toggle. Both are either dead code or redundant with newer systems.

### Feature 1 — OBS Log Parser Removal

**Status:** Dead code — built but never wired into the UI. Game detection works via filename + manual dropdown.

**What to remove:**
- [ ] `src/main/main.js` lines ~401-442 — `obs:parseLog` IPC handler (reads OBS logs, extracts game .exe names)
- [ ] `src/main/preload.js` line ~28 — `parseOBSLog()` bridge method
- [ ] `src/renderer/views/RenameView.js` line ~313 — "OBS LOG" cyan status badge (decorative, no logic)
- [ ] `src/renderer/views/RenameView.js` line ~297 — subtitle text referencing OBS specifically
- [ ] `.claude/rules/pipeline.md` — OBS log parsing rules (if present)

**What to KEEP:**
- `RAW_OBS_PATTERN` regex and chokidar file watcher — this is active file detection, not log parsing
- Manual game dropdown selector — this is the real game assignment UI
- All game detection logic in RenameView (filename-based, not OBS-dependent)

### Feature 2 — Hype/Chill Voice Mode Removal

**Status:** Redundant — archetype + description + momentPriorities already convey tone more precisely.

**What to remove:**
- [ ] `src/renderer/editor/stores/useAIStore.js` — `voiceMode` state (line ~6), setter (line ~17), prompt injection ternary (line ~45), reset (line ~95)
- [ ] `src/renderer/editor/components/RightPanelNew.js` lines ~632-661 — voice mode toggle UI (fire/chill emoji buttons)
- [ ] `src/renderer/views/OnboardingView.js` — `ARCHETYPE_VOICE` mapping (lines ~31-37), voiceMode state (line ~71, ~92), PersonalityStep voice toggle UI (lines ~317-373), voiceMode in finishOnboarding (line ~105)
- [ ] `src/renderer/views/SettingsView.js` lines ~1074-1089 — "Default Title Style" toggle section, voiceMode in default profile (~947, ~973)
- [ ] `src/main/main.js` lines ~159-165 — `voiceMode` in creatorProfile store defaults

**What to KEEP:**
- `userContext` parameter flow in useAIStore.generate() — just drop the voice ternary, keep `aiContext`
- `archetype` field and all archetype logic — this stays
- `description` field — this stays
- `momentPriorities` — this stays
- `getArchetypePersonality()` in ai-prompt.js — not voice-dependent

### Verification
- [ ] Build succeeds (`npx react-scripts build`)
- [ ] App launches (`npm start`)
- [ ] Rename view works — file watcher active, game dropdown functional, no "OBS LOG" badge
- [ ] Editor AI panel — no voice toggle, title generation still works
- [ ] Onboarding wizard — screen 3 still has description textarea, no voice toggle
- [ ] Settings AI Preferences — no "Default Title Style" section, rest intact
- [ ] No console errors or missing references

---

## 🔲 Paused — Split Instagram & Facebook into Independent Login Flows

> Paused while we clean up legacy features. Plan is still valid — resume after this task.

(See git history commit for full plan, or check previous version of this file)

---

## 🔲 Planned — Backend Infrastructure for Commercial Launch

> All items labeled `milestone: commercial-launch` on GitHub. Build order reflects dependencies.

### Phase 1 — Foundation (must come first)
- [ ] **#20 — Supabase backend: auth, database, Edge Functions**

### Phase 2 — Security (move secrets off-device)
- [ ] **#21 — Migrate OAuth flows to server-side proxy**
- [ ] **#22 — Move Anthropic API key server-side, proxy AI calls**

### Phase 3 — Monetization
- [ ] **#23 — LemonSqueezy payments + license key management**

### Phase 4 — Distribution
- [ ] **#19 — Auto-updates with electron-updater + code signing**

### Phase 5 — Observability
- [ ] **#24 — Sentry crash reporting**
- [ ] **#25 — Product analytics (PostHog)**

---

## ✅ Completed — Previous Tasks
(See git history for details)
