# ClipFlow — Session Handoff
_Last updated: 2026-06-18 — Session 85 — **Fixed #144 (fresh clips opened with empty subtitles in the editor) and cut alpha.8; then, at Fega's request, ran a 26-agent packaged-app/fresh-clip/portability audit that found 15 confirmed bugs (deduped to 9). The headline: alpha.8 as built would STILL export blank-subtitle clips (a NEW asar-family bug) — so DO NOT install alpha.8. Full remediation plan saved in `tasks/todo.md` (ACTIVE PLAN, top). Also: a tool on Fega's machine silently gutted `package.json` mid-session — restored from HEAD.**_

---

## One-line TL;DR
#144 fixed + alpha.8 cut, but the audit revealed alpha.8 would still export subtitle-less clips (overlay's cross-tree `require` + fonts aren't packaged). Next session: fix Bucket A (4 packaged/fresh-clip bugs), batch with #144 into ONE installer (alpha.9), then Fega installs once. Plan + all findings are in `tasks/todo.md`.

## Current State
On **0.1.8-alpha.8** in git (committed `34ed5ba`, installer built in `dist/`) — but **Fega has NOT installed it and should NOT**: the audit found exported clips lose all subtitles on the packaged app (Bucket A #1). #144 (fresh-clip empty editor subtitles) is FIXED and pushed but only verifiable once a good installer ships. Schema unchanged, no migrations. Working tree: usual runtime churn (`data/clipflow.db`, `data/game_profiles.json`) + untracked `tasks/mocks/` + this wrap's doc/skill/memory commits.

## What Was Just Built (this session)
1. **#144 FIXED** (`dc8a1d1`) — `setSegmentMode` (`src/renderer/editor/stores/useSubtitleStore.js`) now falls back to `originalSegments` when `editSegments` is empty (fresh/never-saved clip), so freshly generated clips open WITH subtitles in Edit Subtitles + the timeline. Preserves #89 (uses `editSegments` when populated on a live mode switch). Diagnosis re-verified end-to-end on live code before applying. Issue #144 left OPEN (commented, no auto-close) pending in-app verification.
2. **alpha.8 cut** (`34ed5ba`) — version bump + installer `dist/ClipFlow Setup 0.1.8-alpha.8.exe`. **Superseded by the next build; don't install.**
3. **Packaged-app audit** (Workflow `wf_b64b15fe-898`, 26 agents, find→adversarial-verify→synthesize) — 15 confirmed findings, 0 uncertain, 3 rejected. Deduped to 9 distinct problems across 2 buckets. Full results + remediation plan written to `tasks/todo.md` (the ephemeral workflow output file is gone).
4. **Lessons distilled** — extended the asar-family lesson in `clipflow-electron-ipc` (the session-84 sweep missed cross-tree requires, fonts, and unbundled binaries); added memory `project_package_json_strip`.

## Key Decisions
- **DO NOT install alpha.8.** It would still export blank-subtitle clips. Roll Bucket A + #144 into ONE new installer (alpha.9) so Fega reinstalls once — directly addresses his "stop the install-and-discover loop" ask.
- **Two-bucket framing (the answer to "how many more things are broken?").** Bucket A = breaks Fega's installed app NOW (packaged/fresh-clip), finite, fix now. Bucket B = only breaks OTHER machines (ffmpeg/python not bundled, D:\whisper hardcodes), real pre-launch `track: launch-ops` work, NOT urgent for his testing. The "loop" is nearly over for his box, still open for customers.
- **The asar bug class is WIDER than session 84 thought** — not just `__dirname` script paths, but cross-tree `require()`s missing from `build.files` (overlay preload → `editor/utils/*`), fonts loaded by `file://` from `src/fonts`, and bare external-binary spawns (`ffmpeg`). Verify against the real artifact with `npx asar list`, not `build.files` globs.
- **#144 fix targets `setSegmentMode`, not `initSegments`** — confirmed `setSegmentMode("3word")` always fires on open via `applyTemplate` (BUILTIN_TEMPLATE carries `segmentMode:"3word"`), so the fallback lands in the right place.

## Next Steps (prioritized) — full detail in `tasks/todo.md` ACTIVE PLAN
1. **Fix Bucket A + cut alpha.9** (one installer): (#1 CRITICAL) add `src/renderer/editor/utils/**/*` to `package.json build.files`; (#2 HIGH) ship `src/fonts` via `extraResources` + resolve via `process.resourcesPath`; (#8 MEDIUM) route render.js through `resolveClipSubtitles` for word-repair; (#9 LOW) icon path → `build/icon.png`. Verify with `npx asar list`.
2. **File Bucket B as `track: launch-ops` issues** (read `.claude/docs/issue-filing.md` first): ffmpeg-not-bundled, python/whisper-not-bundled, hfHome hardcode; comment on #68 (energy_scorer still present). Fold whisperPythonPath fallback into the Python-bootstrap issue.
3. **Fega verifies on alpha.9:** generate → open (subtitles show, #144) → EXPORT → open the .mp4 and confirm subtitles present AND in Latina Essential. Close #144 + new Bucket A issues.
4. **Still-pending verification pile** (shipped source-only, never confirmed on installed app): #140 cancel-render, #137 timeline split, #138 ALL-CAPS, #99 style-bleed. Roll into the alpha.9 verification pass.
5. **Future audit:** the coverage gaps (publish/OAuth flows are the big one) — see `tasks/todo.md`.

## Watch Out For
- **`package.json` gets silently stripped on Fega's machine.** A formatter/tool removed `scripts`+`build`+`devDependencies` this session (99→51 lines), breaking all builds. Restored from HEAD. If a build breaks for no reason, `wc -l package.json` (should be 99) and `git checkout HEAD -- package.json`. Don't trust a "change was intentional" reminder over a visibly-broken file. Memory: `project_package_json_strip`.
- **alpha.8 installer exists in `dist/` but must not be installed.** The in-app update notifier picks the newest by mtime/filename — cutting alpha.9 supersedes it cleanly.
- **#144 is fixed but UNVERIFIED in-app** — needs a working installer (alpha.9) to test, because the repro requires a freshly generated, never-saved clip on the packaged app.
- **Bucket B = customer-facing, not Fega-facing.** Don't push ffmpeg/python bundling as "urgent" — his machine has them. Per `feedback_prebeta_priorities`, these are launch-hardening, parked under `track: launch-ops`.
- **`data/clipflow.db` + `data/game_profiles.json` always dirty — never commit.** Stage files explicitly; never `git add -A`. `tasks/mocks/` is untracked scratch — leave it.

## Logs / Debugging
- **The audit's verification technique (reuse it):** `npx asar list dist/win-unpacked/resources/app.asar` lists exactly what shipped. This is how Bucket A #1/#2 were confirmed (proved `editor/utils/*` and `src/fonts/*` are ABSENT from the asar — only `editor/models/*` and Vite-hashed `build/assets/*.otf` are present). Do NOT reason from `build.files` globs alone.
- **#144 trace map (verified live):** clip open → `useEditorStore.initFromContext` → `initSegments` (`useSubtitleStore.js:224`, sets `editSegments:[]` for fresh) → `applyMergedTemplate` always fires (`useEditorStore.js:277/281/285`) → `applyTemplate` → `setSegmentMode("3word")` (`templateUtils.js:180`, gated on `segmentMode!==undefined` which BUILTIN_TEMPLATE satisfies) → word loop at `useSubtitleStore.js:1038` (now `wordSourceSegs`, was `editSegments`).
- **Packaged overlay failure (Bucket A #1):** `src/main/subtitle-overlay-preload.js:17-32` require()s `editor/utils/subtitleStyleEngine.js`+`findActiveWord.js`; absent from asar → preload throws → `overlayAPI` undefined → `public/subtitle-overlay/overlay-renderer.js` guards (`:139,:287`) no-op → render SUCCEEDS but burns BLANK overlay frames (silent). Font path: `subtitle-overlay-renderer.js:152` → `src/fonts` (absent) → FontFace 404 → swallowed `console.warn` (`overlay-renderer.js:83-85`) → sans-serif fallback.
- **Pipeline logs:** `%APPDATA%\clipflow\processing\logs\<name>_<ts>.log` (per-video, written on finalize; `Status: SUCCESS|FAILED`). **App log:** `%APPDATA%\clipflow\logs\app.log` (lifecycle/db/preview/waveform; NOT the AI pipeline). Bash tool is Git Bash — resolve `%APPDATA%` via `node -e "console.log(process.env.APPDATA)"`, don't pass `$env:` into a quoted powershell string.
