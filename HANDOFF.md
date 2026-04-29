# ClipFlow — Session Handoff
_Last updated: 2026-04-29 — Session 34 — Small-wins sweep: 8 issues closed, 2 follow-ups filed_

---

## One-line TL;DR

**Eight-issue small-wins session.** Closed #67, #44, #33, #61, #8, #16, #30, #79 — six tested live, two (#61, #16) untested-by-Fega and labeled accordingly. Filed two follow-ups: #78 (deeper bug surfaced by #44 — saved subtitle edits get silently lost on reopen because `clip.transcription` wins over `clip.subtitles.sub1`) and #79 (progress-bar bugs that we then went ahead and fixed in the same session). Introduced a new GitHub label convention `status: untested` for closed-but-not-user-verified issues, with project memory saved so it persists across future sessions.

---

## What just shipped (session 34)

### #67 — Timeline zoom slider full range (commit `bc68205`, ✅ tested)

Slider 0-100 now spans zoom [0.2x, 20x] log scale end-to-end via `0.2 * 100^(v/100)`. Previously v=0..35 all clamped to 0.2x leaving a ~23% dead zone on the left. Midpoint shifts from 1x to 2x — accepted tradeoff per issue. Single-file change in [TimelinePanelNew.js](src/renderer/editor/components/TimelinePanelNew.js).

### #44 — Single setSegmentMode call per clip open (commit `9d1e144`, ✅ tested)

The duplicate `setSegmentMode` call (initSegments→default + applyTemplate→saved) was wasted work. Cleanest fix: make `applyTemplate` the single source of truth for chunking on clip open.

- `initSegments` no longer triggers segmentation; it just sets `originalSegments` and clears `editSegments`.
- `BUILTIN_TEMPLATE.subtitle` now carries `segmentMode: "3word"` explicitly so `applyTemplate` always has a defined mode.
- `useEditorStore.openClip` merges per-clip saved `segmentMode` into the template up front, so editSegments build at the final mode in one pass (no rebuild for saved-mode-different-from-template case).
- `restoreSavedStyle` no longer touches segmentMode (handled at merge time).
- Retranscribe path explicitly calls `setSegmentMode(currentMode)` after initSegments to preserve the user's mode.

**Surfaced #78** (see below) — pre-existing bug where saved edits are lost on reopen. Was masked because chunking always defaulted to "3word"; now that we honor saved segmentMode, the re-chunked output can look visibly different from what was saved.

### #33 — Scroll position preserved per persistent tab (commit `b107ca5`, ✅ tested)

Each persistent tab (Rename, Recordings, Queue, Tracker, Settings, Projects list) is now always-mounted with its own scroll container. ScrollTop preserved per-tab independently across switches, including round-trips through Editor.

Two layered bugs in the previous structure:
1. Single shared scroll container — switching to a shorter-content tab clamped scrollTop to fit the new content height.
2. Editor's `height: 100%` override on the shared inner div forced the container's content to fit exactly, clamping scrollTop to 0 on editor activation. Coming back from editor: every tab reset.

Fix: editor pulled out as a sibling of the scroll container; scroll container always-mounted with `display: none` toggle when editor is active. Then each persistent tab got its own independent scroll container so they don't share scrollTop.

ClipBrowser stays conditional (per-project, fresh each entry). Editor stays conditional (heavy, per-clip).

### #61 — Drag-drop imports bucket by recording date (commit `86c1f22`, 🟡 untested)

`import:externalFile` handler was using `new Date()` for the YYYY-MM monthly subfolder. A March recording dropped in April landed in `2026-04/`. Now parses the OBS filename prefix (YYYY-MM-DD followed by space or underscore) and uses that. Falls back to file `birthtime`, then today, for non-OBS filenames.

Existing misfiled archive is not touched — house-cleaning migration deferred to its own session.

### #8 — AI title/caption persistence + suggestion cache (commits `90c2b71`, `c0a36a1`, ✅ tested)

**Part A:** `acceptTitle`/`acceptCaption` fire `useEditorStore.handleSave()` immediately after updating the editor state, so an accepted choice persists without depending on autosave or editor unmount.

**Part B:** `useAIStore` now caches suggestions/context/rejections/accepted indices per-clip in `_perClipCache`. `useEditorStore.openClip` calls `swapToClip(oldId, newId)` instead of `reset()`. Cache is in-memory only (dies on app close) per the issue spec; permanent learning data via `anthropic:logHistory` is a separate persistent store, untouched. `clearCacheForClip(clipId)` action exists ready for a future publish-success hook.

### #16 — 7s clip floor + safety net (commit `c5f9404`, 🟡 untested)

User chose option C: lower the AI prompt floor AND add a safety net.

- AI prompt's clip-duration range: `30-90s` → `7-90s` in three places ([ai-prompt.js](src/main/ai-prompt.js)). New guidance encourages short punchy reactions where the moment lands instantly.
- Safety net in [ai-pipeline.js](src/main/ai-pipeline.js) `buildOneClip`: if AI returns a clip <7s, extend with 60/40 lead-in/tail bias clamped to source bounds. Logs `[clip N] extended Xs → Ys (#16 safety net)` if it fires.

7s is a starting point. Fega will tune in real use.

### #30 — Auto-pause other video previews (no commit, ✅ already-fixed)

Confirmed working via screenshots. The fix was already shipped 2026-04-02 in commit `427d2e6` — module-level `_activeVideoRef` tracks the playing preview, dispatches a `clipflow-paused` custom event when displaced. Issue was just stale.

### #79 — Projects preview progress bar (commit `2289784`, ✅ tested)

Filed mid-session after #30 testing exposed the bugs. Three changes:

1. **Real-time update:** removed `transition: width 0.1s linear` on the fill. At 60Hz rAF cadence the 100ms ease was getting interrupted every 16ms — bar appeared to lag/stick during playback and only updated on pause. Now the fill animates frame-by-frame.
2. **UI polish:** 12px hover zone with 4px pill-shaped track centered inside (grows to 6px on hover/seek), accent gradient on fill with subtle glow, 12px white playhead knob with accent glow appears on hover/seek.
3. **Pre-existing drag-seek crash:** `handleSeek` used `e.currentTarget.getBoundingClientRect()` which crashed when called from a window-level mousemove during drag (currentTarget = window). Switched to a `seekbarRef`. Pre-existing bug, exposed by the new draggable knob inviting users to actually drag.

---

## New convention introduced this session — `status: untested` label

GitHub label `status: untested` (yellow `#fbca04`) created on `Oghenefega/ClipFlow`. Convention:

- Close issues clean (no label) when the user has tested and confirmed.
- Apply `status: untested` when closing an issue the user hasn't yet verified in the running app (e.g. they say "commit now, I'll test later").
- Remove the label once the user confirms it works.
- List pending verification: `gh issue list --repo Oghenefega/ClipFlow --state closed --label "status: untested"`.

Project memory saved at `~/.claude/projects/.../ClipFlow/memory/feedback_untested_label.md` so the convention persists across future sessions.

**Currently untested from this session:** #61 (recording-date import), #16 (7s clip floor + safety net).

---

## Filed for follow-up

### #78 — Saved subtitle edits silently lost on clip reopen (filed)

**Surfaced while testing #44.** `clip.transcription.segments` wins over `clip.subtitles.sub1` in [useSubtitleStore.js:355-410](src/renderer/editor/stores/useSubtitleStore.js#L355-L410)'s `initSegments` priority order. Save path is correct (writes editSegments to `clip.subtitles.sub1` and styling to `clip.subtitleStyle`); load path discards the edited segments and re-segments raw transcription.

Was previously masked because chunking always defaulted to "3word" — re-chunking raw transcription produced output that often *looked similar* to what was saved. Now that #44 honors per-clip `segmentMode`, the chunking can produce visibly different output → users see drift.

**Investigation needed before fix:** why is `clip.transcription` prioritized? Is it legacy or does retranscribe / dictionary integration depend on it? What about the dedup + word repair pipeline that currently runs on raw transcription? Should retranscribe explicitly clear `clip.subtitles.sub1`?

This is its own scoped session — too large for a small-win pass. Needs a written plan + approval before code per CLAUDE.md plan-before-code rule.

---

## Pre-launch issue list snapshot

Open issues that didn't move this session, broken into product vs. infra/launch.

**Product bugs (in-app, can be done as small wins):**
- [#77](https://github.com/Oghenefega/ClipFlow/issues/77) Editor transcript panel highlights wrong segment during playback
- [#66](https://github.com/Oghenefega/ClipFlow/issues/66) Editor transcript panel shows full source audio, not clip range (likely related to #77/#78 plumbing)
- [#64](https://github.com/Oghenefega/ClipFlow/issues/64) Waveform extraction silently returns empty
- [#62](https://github.com/Oghenefega/ClipFlow/issues/62) Pipeline fails on clips with silent/near-silent audio (energy_scorer.py exit 1)
- [#57](https://github.com/Oghenefega/ClipFlow/issues/57) Editor lag on 30min+ source — 60fps re-render storm
- [#37](https://github.com/Oghenefega/ClipFlow/issues/37) Subtitle mismatch regression — awaiting repro
- [#32](https://github.com/Oghenefega/ClipFlow/issues/32) Editor position changes revert to template default on clip reopen (closely related to #78)
- [#10](https://github.com/Oghenefega/ClipFlow/issues/10) Timeline waveform doesn't redraw after segment trim

**Product features / improvements:**
- [#74](https://github.com/Oghenefega/ClipFlow/issues/74) Hide pipeline internals from end users (UX hardening for launch)
- [#70](https://github.com/Oghenefega/ClipFlow/issues/70) Rename watcher only detects rigid OBS pattern
- [#69](https://github.com/Oghenefega/ClipFlow/issues/69) User-facing trim toggle in editor
- [#26](https://github.com/Oghenefega/ClipFlow/issues/26) Multiple accounts per platform
- [#15](https://github.com/Oghenefega/ClipFlow/issues/15) Learned game/creator-specific subtitle dictionary
- [#14](https://github.com/Oghenefega/ClipFlow/issues/14) Play Style update card inline editing
- [#13](https://github.com/Oghenefega/ClipFlow/issues/13) User-controlled file naming style
- [#9](https://github.com/Oghenefega/ClipFlow/issues/9) AI Pop "learning your style" affirmation
- [#7](https://github.com/Oghenefega/ClipFlow/issues/7) Search function in projects tab
- [#6](https://github.com/Oghenefega/ClipFlow/issues/6) Publish/Schedule button within the editor
- [#5](https://github.com/Oghenefega/ClipFlow/issues/5) Auto-move clips to approved/published tab after editing
- [#4](https://github.com/Oghenefega/ClipFlow/issues/4) Schedule/Published tab in Projects view
- [#1](https://github.com/Oghenefega/ClipFlow/issues/1) Render and queue from Approved folder

**Pre-launch / infra (out of small-wins scope):**
- [#73](https://github.com/Oghenefega/ClipFlow/issues/73) Cold-start UX — branded splash + bundle code-splitting
- [#54](https://github.com/Oghenefega/ClipFlow/issues/54) electron-builder v24 → v26
- [#51](https://github.com/Oghenefega/ClipFlow/issues/51) Windows code-signing certificate
- [#50](https://github.com/Oghenefega/ClipFlow/issues/50) Auto-updater research
- [#43](https://github.com/Oghenefega/ClipFlow/issues/43) Sentry pre-launch backlog (7 deferred items)
- [#23](https://github.com/Oghenefega/ClipFlow/issues/23) LemonSqueezy payments + license keys
- [#22](https://github.com/Oghenefega/ClipFlow/issues/22) Move Anthropic API key server-side
- [#21](https://github.com/Oghenefega/ClipFlow/issues/21) OAuth flows server-side proxy
- [#20](https://github.com/Oghenefega/ClipFlow/issues/20) Supabase backend setup
- [#19](https://github.com/Oghenefega/ClipFlow/issues/19) electron-updater + code signing
- [#56](https://github.com/Oghenefega/ClipFlow/issues/56) Cloudflare AI Gateway hardening
- [#68](https://github.com/Oghenefega/ClipFlow/issues/68) Move `energy_scorer.py` from hardcoded `D:\whisper\` path
- [#63](https://github.com/Oghenefega/ClipFlow/issues/63) Sandbox offscreen subtitle BrowserWindow

---

## Next steps for next session — candidate priorities

**Untested verifications (cheap):** test #61 (drop a March-recorded file in April, verify it lands in `2026-03/`) and #16 (run a fresh pipeline, verify clip lengths can now be <30s; watch app.log for `(#16 safety net)` lines). If both pass, remove `status: untested` labels.

**The big one — #78** is the most consequential next move. The "what I save is what loads" architecture is foundational for the editor experience and Fega flagged it explicitly during this session. Needs its own dedicated session with a written plan first. Will likely also subsume #66 (transcript panel shows full source, not clip range) and possibly #32 (editor position reverts on reopen) since they share the same load-time semantic confusion.

**Other strong small-win candidates remaining on the shortlist:**
- #10 — Timeline waveform doesn't redraw after segment trim (could be small or could touch deeper waveform-cache plumbing — would need scoping before committing)
- #77 — Editor transcript panel highlights wrong segment during playback (related to lazy-cut time mapping)

**Larger product work that's overdue for a session:**
- #74 — Hide pipeline internals (UX hardening) — pre-launch blocker, visible competitive moat exposure
- #57 — Editor lag on 30min+ source (60fps re-render storm) — perf, will benefit from profiling

---

## Watch out for

- **Untested labels stay until Fega tests.** Don't blanket-remove on next session start; only remove when Fega explicitly confirms a specific issue. The label mechanism is opt-in for good reason.
- **#78 will likely require an architectural decision:** prefer `clip.subtitles.sub1` over `clip.transcription`, OR clear `clip.subtitles.sub1` on retranscribe (so transcription stays canonical). Both have implications for the dedup pipeline. Don't pick silently — surface the tradeoff and ask.
- **The `status: untested` label is a session-34 invention.** It exists on the GitHub repo and in user memory. Don't recreate; do use.
- **Subtitle work is fragile.** Memory note `feedback_subtitle_segmentation.md` flags subtitle segmentation as a recurring regression source. The #44 fix touched the chunking flow; if subtitle weirdness shows up next session, suspect the merge-into-template path first, then the saved-edits-loss path (#78).
- **Per-tab scroll containers add a bit of memory overhead** — every persistent tab's component is mounted on app launch, not on first activation. Memory cost is small (these are all UI-only components consuming props), but if startup time degrades visibly in profiling, this is one place to look (lazy-mount with display preserved).

---

## Logs / debugging

- **App log:** `%APPDATA%\clipflow\logs\app.log` — main process events, IPC errors, store mutations. New log line introduced this session: `[clip N] extended Xs → Ys (#16 safety net)` — fires only if Claude returns a clip shorter than 7s (against the prompt). If you ever see this line in production logs, that's an AI prompt violation worth investigating.
- **Pipeline logs:** `processing/logs/<videoName>_<ts>.log` — per-pipeline-run stdout/stderr. Not exercised this session.
- **Build artifacts:** `build/index-*.js` is ~1.87 MB minified, ~545 KB gzipped (2728 modules). Pre-existing > 500 kB warning still tracked under #73.
- **Tests:** `node src/renderer/editor/utils/segmentWords.test.js` — 29 passing. Not run this session (no segmentation logic touched, only call-site dedup).
- **Untested issues filter:** `gh issue list --repo Oghenefega/ClipFlow --state closed --label "status: untested"` — currently shows #61 and #16.

---

## Session model + cost

- **Model:** Sonnet throughout (one issue at a time, surgical changes, no deep architecture).
- **Files committed this session:** 8 commits on master (`bc68205`, `9d1e144`, `b107ca5`, `86c1f22`, `90c2b71`, `c0a36a1`, `c5f9404`, `2289784`) plus the wrap-up commit (HANDOFF + CHANGELOG).
- **Issues closed:** 8 (#67, #44, #33, #61, #8, #16, #30, #79). #30 closed as already-fixed (no commit).
- **Issues filed:** 2 (#78, #79 — the latter then closed in same session).
- **Labels created:** 1 (`status: untested`).
- **Project memory entries added:** 1 (`feedback_untested_label.md`).
