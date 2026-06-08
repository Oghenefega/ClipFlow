# ClipFlow — Session Handoff
_Last updated: 2026-06-08 — Session 69 — Shipped the #64 waveform-extraction crash fix (committed `92452f2`, awaiting Fega's verification). Designed the Recordings card "(i) info popover" (Spotlight chosen) and wrote the full build plan — **build deferred to next session** (#125). Wrapped at ~200k+ tokens by request._

---

## One-line TL;DR

Two threads: (1) **#64 fixed & pushed** — the timeline waveform no longer hangs on long recordings (root cause was a units bug making FFmpeg pipe ~250 MB to a 50 MB buffer); needs Fega's eyes-on confirm. (2) **Recordings (i) info popover** — designed via 4 HTML prototypes, Fega picked "Spotlight," full plan written to `tasks/todo.md` + issue **#125**; no app code written yet — next session builds it.

## Current State

Healthy on `0.1.6-alpha`. Working tree after this wrap: only `data/clipflow.db` + `data/game_profiles.json` (runtime churn — **DO NOT commit**). The waveform fix is on `master` (`92452f2`). The popover is design + plan only.

## What Was Done This Session

1. **#64 waveform crash — FIXED (`92452f2`, pushed).** `extractWaveformPeaks` set FFmpeg's output sample rate to `-ar peakCount*10`, and `peakCount` scales with duration → a 30-min source piped ~250 MB of raw PCM to stdout, blowing `execFile`'s `maxBuffer` (`ERR_CHILD_PROCESS_STDIO_MAXBUFFER`) → empty peaks → infinite "Extracting waveform…". Short clips fit under the cap (looked intermittent). Fix: fixed **1000 Hz** rate (output ~3.4 MB at 30 min regardless of length, ~250 samples/peak) + `maxBuffer` 50→128 MB. Proven on a real 1804 s file: 248 MB → 3.4 MB. Only `src/main/ffmpeg.js` changed. **Issue #64 left OPEN** with a fix comment — awaiting Fega's verification.
2. **#124 filed** (chore/observability): the `[waveform]` diagnostics use raw `console.log`, which reaches the terminal only — never `app.log` — so they're invisible on the installed build. Out of scope for the crash fix; flagged for later.
3. **Recordings (i) info popover — DESIGNED, NOT BUILT (#125).** Four interactive prototypes in `mockups/recordings-info-*.html`; Fega chose **Spotlight** (`recordings-info-spotlight.html`), hero = "Stats" with **equal-size** Duration/Size values. Full build plan in `tasks/todo.md` and issue **#125**.

## Key Decisions

- **Waveform fix = fixed 1000 Hz**, not `spawn`/streaming. The root cause was a rate-vs-total units error; bounding the rate fixes it surgically with no architecture change.
- **(i) info popover design:** hover-revealed `(i)` (hidden until card hover) LEFT of the green ✓; click opens an interactive popover (filename, Duration + Size stat pair, Play, Open in Explorer, TEST chip). The standalone **TEST pill is removed from the card** — TEST is now the popover's clickable chip (yellow = on / grey = off). Tooltip also gains duration.
- **"Play" = open the raw recording in the REAL editor** (Fega's pick over an OS player / in-app modal). Confirmed ~S effort and **safe** (no project corruption) via a "source-preview" editor mode — see Next Steps.
- Prototypes delivered by **opening them in Fega's browser via `Start-Process`** — chat attachments didn't open for him (saved as memory).

## Next Steps (the #125 build — for next session)

All detail is in `tasks/todo.md` + issue #125. Summary:
1. **`src/renderer/views/UploadView.js`** (primary): add hover-reveal `(i)` (left of ✓), remove the `TestChip` pill from the card render (~:1355), build the Spotlight popover (port CSS/markup from `mockups/recordings-info-spotlight.html`), add duration to the hover tooltip (use `f.duration_seconds` + existing `formatDuration()`; fallback `—` if null), wire actions: Play → `handleOpenSourcePreview`, Open → `window.clipflow.revealInFolder(f.current_path)`, TEST → existing `handleToggleRecordingTest(f.id, next)`.
2. **`src/renderer/editor/stores/useEditorStore.js`**: add a `sourcePreviewPath` branch at the TOP of `initFromContext` (before the `projectLoad` IPC) that synthesizes `{ id:"__source_preview__", sourceFile: path, name: label, clips: [], transcription: null }`, `clip: null`, `nleSegments: []`. `onLoadedMetadata`'s `initNleSegments(videoDur)` self-fills the timeline + waveform. (~20 lines.)
3. **`src/renderer/App.js`**: `handleOpenSourcePreview(path,label)` → `setEditorContext({ sourcePreviewPath, label }); setView("editor")`; make `onBack` return to `recordings` when `sourcePreviewPath` is set; thread the handler into the Recordings view.
4. `EditorLayout` needs **no** changes (save/render/retranscribe/navigator already guard `!clip`).
5. This also unblocks **#64 verification**: Play any ~30-min recording → the waveform should render (was always blank pre-fix).

Other backlog unchanged: subtitle `words[]`/`text` family (#95/#107/#87/#101/#89/#84), #112/#62 (EPIPE/silent audio), #57 (editor lag), #114/#108/#40, commercial-launch (#20–#23, #50–#56, #73/#74, #85). Also #124 (waveform logs→app.log).

## Watch Out For

- **#64 still needs Fega's confirm** before closing. Verify by opening any clip whose SOURCE recording is ~30 min (the editor loads the full source behind a clip), OR — once #125 ships — via the new Play-in-editor. The fix is proven at the FFmpeg layer but not yet eyes-on in the app.
- **Source-preview waveform cache** keys on `project.id` → with id `"__source_preview__"` it makes one cache folder under projectsRoot. Harmless; optionally pass a stable per-file id.
- **Source-preview is watch-only** — no clip exists, so the editor's Save/Render/Re-transcribe do nothing (all guard on `!clip`). That's intended; don't "fix" it by faking a clip (would risk disk writes).
- **`data/clipflow.db` / `data/game_profiles.json`** are runtime churn — never commit. Stage source/docs/mockups explicitly.
- **Losing mockup variants** (`recordings-info-{menu,contextbar,inline}.html`, and the original `recordings-info-popover.html` baseline) are scratch — safe to delete once #125 ships.
- **No single-instance lock in `main.js`** — kill any open ClipFlow Electron before `npm run build`/relaunch: `powershell.exe -NoProfile -Command "Get-Process electron | Where-Object Path -Like '*Desktop\ClipFlow*' | Stop-Process -Force"`.

## Logs / Debugging

- **No build/run performed this session** — the waveform fix is main-process JS verified by `node --check src/main/ffmpeg.js` (SYNTAX OK) + a direct FFmpeg repro (old args 248 MB vs new args 3.4 MB on `2025-12-17 17-52-17-vertical.mp4`). Renderer was NOT rebuilt (no renderer change this session).
- **Prod log:** `%APPDATA%\clipflow\logs\app.log` (electron-log; format `[ts] [level] (scope) [sess_xxx] msg`). NOTE: it only captures the `logger`/electron-log scoped API — **raw `console.log` does NOT land here** (that's #124). The `[waveform]` lines only show in a terminal when running `npm start` from source.
- **To verify #64 manually next session:** `npm start`, open a clip with a ~30-min source, watch the editor timeline → waveform should fill within a few seconds. Or wire #125's Play and use that.
- **Build commands:** renderer = `npm run build:renderer` (Vite); `npm start` launches Electron from `build/`. Daily driver = installed exe from `npm run build` + `dist/ClipFlow Setup *.exe`.
- **Key files for #125:** `src/renderer/views/UploadView.js` (card render ~:1304-1398, TestChip ~:1355, tooltip ~:1463), `src/renderer/editor/stores/useEditorStore.js` (`initFromContext` ~:66-251, autosave guard `:668`, `initNleSegments` ~:275), `src/renderer/App.js` (`handleOpenInEditor` :394, editor render :666), `src/renderer/editor/components/PreviewPanelNew.js` (`videoSrc` :659, `onLoadedMetadata` :855, waveform call :884).
