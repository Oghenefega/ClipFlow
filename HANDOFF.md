# ClipFlow — Session Handoff
_Last updated: 2026-06-09 — Session 74 — **Fix-first batch.** Shipped 5 fixes (#124 logging, #92 false-Applied, #101 punctuation restore, #32 caption-width restore, #106 passive-wheel warning) across 3 commits; all closed `status: untested` pending Fega's in-app checks. Parked the pipeline pair #68/#62 (Fega's call: quick wins first) and corrected its scope after finding the installer bundles no `tools/` Python at all._

---

## One-line TL;DR

Five issues from the triage's fix-first list are fixed, pushed, and closed-as-untested (backlog **41 → 36**). The app is rebuilt and boots clean. Nothing needs your input to be "done" except optional in-app spot-checks (below). The pipeline pair #68/#62 is parked with a corrected scope note on #68.

## Current State

Healthy on `0.1.6-alpha`, schema **v4** — unchanged this session (no migrations). Renderer was rebuilt (`build/` regenerated; it's gitignored, not committed). **4 commits pushed:** `759e7a2` (#124), `1fc5964` (#92), `a197bc3` (#101/#32/#106), + this wrap commit (CHANGELOG + HANDOFF). Working tree clean except the usual runtime churn (`data/clipflow.db`, `data/game_profiles.json` — **DO NOT commit**).

## What Was Built (5 fixes)

1. **#124 — waveform/ffmpeg logs reach `app.log` (`759e7a2`).** Swapped ~12 raw `console.*` calls in `waveform:extractCached` (`main.js`) + `extractWaveformPeaks` (`ffmpeg.js`) to `logger.*(MODULES.videoProcessing, …)`. ffmpeg stderr tail moved into a context object (stays one parseable line). Added `require("./logger")` to `ffmpeg.js` (only ever loaded in-Electron — verified no plain-Node consumer). Logging-only, no behaviour change.
2. **#92 — "Applied" badge gated on a confirmed save (`1fc5964`).** `handleSave` now returns the `_doSilentSave` boolean; `acceptTitle`/`acceptCaption` (now async) mark "Applied" only after the save confirms, else set `aiError`. Left `_doSilentSave` returning `true/false` (did NOT make it throw — the autosave `.finally()` at `useEditorStore.js:825` and flush at `:847` don't handle rejections).
3. **#101 — `punctuationRemove` restored on reopen (`a197bc3`).** Added `punctuationRemove: "punctuationRemove"` to `restoreSavedStyle`'s mapping (`useSubtitleStore.js:275`); the pre-existing deep-copy guard at `:287` now activates. It's an object (`{period,comma,…}`).
4. **#32 — caption width restored on reopen (`a197bc3`).** Added `widthPercent: layState.capWidthPercent ?? 90` to `_doSilentSave`'s `captionStyle` and a `setCapWidthPercent` restore call in `restoreSavedStyles` (`useEditorStore.js`). Old clips lack the field → guard leaves them at template default (no migration).
5. **#106 — passive-wheel console warning killed (`a197bc3`).** Re-bound 3 wheel handlers via `addEventListener("wheel", …, { passive: false })` + cleanup, mirroring the existing pattern at `PreviewPanelNew.js:183`: `RightPanelNew` FontToolbar font-size input, `PreviewPanelNew` zoom-to-cursor (`onWheel`), `TimelinePanelNew` `handleTimelineWheel`. All three were stable callbacks on persistent nodes — pure binding moves, no logic touched.

## Key Decisions

- **#92 pessimistic, not optimistic.** Badge appears only after the save returns `true` (local write, imperceptible delay) rather than showing-then-rolling-back. Honest per Fega's "rather it not work than fake it."
- **#106 fixed all 3 offenders**, including the timeline one — the re-bind doesn't touch the `#57` 60fps/segment logic (it's the outer scroll container), so the "fragile timeline" caution didn't apply.
- **Closed with `status: untested`** (house convention): code fixed + build/boot-verified + evidence comment naming each in-app check. Reopen any that fails.
- **#68/#62 parked + scope-corrected.** The issue's "add energy_scorer.py to extraResources alongside transcribe.py" is based on a false premise — see Watch Out For. Did NOT touch installer config (infra, needs the dashboard).

## Next Steps (prioritized)

1. **Optional in-app spot-checks** (launch from **source** — `npm start` — your installed app doesn't have these yet):
   - **#32:** open a clip → drag the caption box's side handle to change its width → close → reopen → width persists.
   - **#101:** open a clip → toggle punctuation-removal options → close → reopen → toggles persist.
   - **#106:** scroll over the preview to zoom → it zooms without the preview also sliding.
   - Tell me "they're good" → I strip `status: untested`. (#124/#92 have no visible change.)
2. **#87** — the rider the triage grouped with the quick wins (`createSegmentAtTime` min-duration clamp can overlap the next segment). Small subtitle-store fix.
3. **#68 → #62** (pipeline pair) — start with **Part A** (relocate `energy_scorer.py` → `tools/` + de-hardcode `ai-pipeline.js:161`), then #62 silent-audio tolerance. **Needs a silent screen-recording from Fega to verify #62.** Part B (installer bundling) is a separate infra task.
4. **Karaoke fragile zone** (`tasks/backlog-triage.md` Section C): #89 → #131 (+#132) → #95 → #90+#88 — one-per-commit, verified on a GENERATED clip.

## Watch Out For

- **The 5 closed issues are `status: untested`** — NOT user-verified. Each closing comment names its check; reopen if it fails. #124's proof (waveform lines in `app.log`) needs a clip's waveform to load — I'll grab it from the log myself next time that happens.
- **#68 bundling gap is bigger than the issue says (recorded on #68).** `package.json` `build` has **no `extraResources`/`asarUnpack`** and `tools/` is absent from `files` — so a truly packaged install ships **none** of the `tools/` Python (`transcribe.py`, `signals/`, and the to-be-moved `energy_scorer.py`). Both transcription AND energy analysis would fail on a clean machine. Hidden today only because the daily driver runs from source. Pre-launch blocker — split into Part A (in-repo) / Part B (infra).
- **`data/clipflow.db` / `data/game_profiles.json`** = runtime churn (the boot tests wrote to them). Never commit. Stage source explicitly.
- **`_doSilentSave` still returns `false` (doesn't throw) on save failure** — by design (#92 fix relies on the boolean; autosave/flush don't catch rejections). Don't "fix" it into throwing without updating those call sites.

## Logs / Debugging

- **Boot-test pattern used this session:** `npm start` in background → poll the task output file with a bash `until grep -qiE "App started|Cannot find module|Error:|Unhandled|uncaughtException"` loop (background) → read output → stop with `powershell.exe -NoProfile -Command "Stop-Process -Name electron -Force …"`. The source-run uses `electron.exe` (distinct from the installed `ClipFlow.exe`), so killing `electron.exe` never touches the daily app. Booting does NOT mount the editor, so it only proves the bundle loads — editor-component changes need a clip opened to exercise.
- **`gh issue comment` uses `--body` / `--body-file`, NOT `-m`** (that failed this session). Per-issue chain `comment && edit --add-label "status: untested" && close` is the approved one-at-a-time pattern (never bundle multiple closes).
- **Renderer changes need `npm run build:renderer` (vite) before `npm start`** — `npm start` loads from `build/`. Main-process-only changes (`main.js`, `ffmpeg.js`) need no rebuild (Electron runs them from source). The >500 kB chunk warning on every vite build is benign (desktop app, no code-splitting wanted).
- **Prod log:** `%APPDATA%\clipflow\logs\app.log` (electron-log). After #124, waveform diagnostics land here under scope `(video-processing)`.
- **Verification fixtures:** the Recordings list has several ~1804s sources for editor-at-scale tests; #62 needs a **silent** short screen-recording (none confirmed on hand — Fega to provide).
