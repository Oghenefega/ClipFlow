# ClipFlow — Session Handoff
_Last updated: 2026-03-21 (debugging session — editor back button)_

## Current State
App builds and runs. Editor back button now correctly navigates to the clip browser instead of the projects list.

## What Was Just Built
- **Editor back button fix**: Changed `onBack` callback in `App.js` line 408 from `setView("projects")` to `setView("clips")` — keeps `selProj` intact so the clip browser renders the correct project

## Key Decisions
- Back button should navigate one step back in the hierarchy (Editor → ClipBrowser), not skip to the top level (Editor → Projects list)

## Next Steps (Priority Order)
1. **Missing beginning words in transcript** — Quiet/soft speech at clip start cut by default VAD. Needs research into alternatives (prepend silence, initial_prompt, post-processing)
2. **Uncommitted changes** — Review `game_profiles.json`, `slider.tsx`, `RightPanelNew.js`
3. Continue Editor UI Rebuild (Phase 10) — `/reference/vizard-ref/`
4. Platform API integrations (publish.js stubs)

## Watch Out For
- **PreviewPanelNew.js rAF**: if `playing` gets stale or video unmounts during playback, could orphan animation frames
- **TimelinePanelNew.js**: uses `usePlaybackStore.getState().getVideoRef()` inside rAF — direct store access (not subscription) is intentional to avoid re-render loops
- **Zustand selectors**: always subscribe with selectors, never `useStore(state => state)`
- **`isDev` flag**: set to `false` in main.js — rebuild before testing
- **Schema migrations**: any electron-store data change requires migration function first
