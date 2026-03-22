# ClipFlow — Session Handoff
_Last updated: 2026-03-21_

## Current State
App builds and runs. Left-extend clip feature is complete with undo, extension counter, subtitle trimming, and timeline snap effects. Editor navigation is solid.

## What Was Recently Built (last ~10 commits)
- **Left-extend clip feature**: Drag audio left edge to reveal earlier content in clips
  - Undo support for clip extensions
  - Extension counter badge on timeline
  - Timeline snap effect animation
  - Subtitle trimming when clips are shrunk back
  - EBUSY fix for video file reload during extension
  - Caption handling during extend operations
- **Extension counter fixes**: Visibility and duration display after cuts
- **Editor back button fix**: Navigate to clip browser (not projects list) — one step back in hierarchy
- **Timeline playhead fix**: Split rAF loop from paused sync to prevent drift
- **Re-transcribe fix**: Update clip data without full editor reinit
- **VAD tuning**: Disabled VAD filtering (Fega uses dedicated mic-only audio track, so VAD was cutting beginning words)

## Uncommitted Changes
- `data/game_profiles.json` — minor edits (3 lines changed)
- `src/components/ui/slider.tsx` — minor edits (2 lines changed)
- `src/renderer/editor/components/RightPanelNew.js` — minor edits (4 lines changed)

These were not committed — review before next session.

## Key Decisions
- VAD is effectively disabled (`vad_onset=0.001`) because Fega records with a dedicated mic track — no background game audio to filter
- Back button follows hierarchy: Editor → ClipBrowser → Projects list
- Extension counter shows how many seconds a clip was extended from its original boundaries

## Next Steps (Priority Order)
1. **Review & commit uncommitted changes** — 3 files with minor edits sitting in working tree
2. **Missing beginning words in transcript** — VAD is disabled but may need further work (prepend silence, initial_prompt, post-processing)
3. **Continue Editor UI Rebuild (Phase 10)** — reference screenshots in `/reference/vizard-ref/`
4. **Platform API integrations** — publish.js stubs need real implementations

## Watch Out For
- **PreviewPanelNew.js rAF**: if `playing` gets stale or video unmounts during playback, could orphan animation frames
- **TimelinePanelNew.js**: uses `usePlaybackStore.getState().getVideoRef()` inside rAF — direct store access (not subscription) is intentional to avoid re-render loops
- **Zustand selectors**: always subscribe with selectors, never `useStore(state => state)`
- **`isDev` flag**: set to `false` in main.js — must rebuild (`npx react-scripts build`) before testing
- **Schema migrations**: any electron-store data change requires migration function first
- **EBUSY errors**: Windows file locking can cause EBUSY when overwriting video files that are loaded in the player — the extend feature handles this but watch for it in similar operations

## Logs / Debugging
- Electron main process logs go to the terminal where `npm start` was run
- Pipeline progress events: listen via `window.clipflow.onPipelineProgress(callback)`
- Render progress: `window.clipflow.onRenderProgress(callback)`
- FFmpeg errors surface through IPC rejection — check main process console
- Whisper transcription streams progress via IPC events
- Browser DevTools console (Ctrl+Shift+I in the Electron window) shows renderer-side errors
