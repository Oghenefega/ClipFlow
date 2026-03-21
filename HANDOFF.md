# ClipFlow — Session Handoff
_Last updated: 2026-03-21 (debugging session)_

## Current State
App builds and runs. Editor subtitle sync, re-transcribe workflow, and timeline playhead all fixed this session. Three files have pre-existing uncommitted changes (`data/game_profiles.json`, `slider.tsx`, `RightPanelNew.js`).

## What Was Just Built
- **Subtitle karaoke sync**: rAF loop in PreviewPanelNew for 60fps `currentTime` updates (HTML5 `timeupdate` only fires ~4x/sec, caused lag + skipped short words)
- **Timeline playhead**: Split rAF into two effects — playback loop depends only on `[playing]`, paused sync on `[playing, currentTime]`. Prevents 60fps teardown/rebuild
- **Re-transcribe workflow**: Replaced `initFromContext` with direct `useEditorStore.setState()` + `initSegments()` — waveform no longer resets after re-transcribe
- **Transcript duplicate guard**: Safety net overlap guard in `tools/transcribe.py` (50% overlap threshold)
- **VAD reverted to defaults**: Lowering VAD onset caused Whisper hallucination. Back to WhisperX defaults (onset=0.5, offset=0.363)

## Key Decisions
- rAF for playback sync instead of `timeupdate` — necessary for word-level karaoke accuracy
- `initFromContext` is too aggressive for re-transcribe — only subtitle segments need reinit
- VAD must stay at defaults — lowering onset feeds silence to Whisper causing hallucination
- Editor state: 6 isolated Zustand stores — never `getState()` in render paths
- `.claudeignore` excludes node_modules, build/, reference/ from context

## Next Steps (Priority Order)
1. **Missing beginning words in transcript** — Quiet/soft speech at clip start cut by default VAD. Needs research into alternatives (prepend silence, initial_prompt, post-processing)
2. **MCP server token optimization** — Disable unused servers (Gmail, Calendar, Chrome, Windows-MCP, mcp-registry, scheduled-tasks) via Claude Desktop UI > Settings > Integrations
3. **Uncommitted changes** — Review `game_profiles.json`, `slider.tsx`, `RightPanelNew.js`
4. Continue Editor UI Rebuild (Phase 10) — `/reference/vizard-ref/`
5. Platform API integrations (publish.js stubs)

## Watch Out For
- **PreviewPanelNew.js rAF**: if `playing` gets stale or video unmounts during playback, could orphan animation frames
- **TimelinePanelNew.js**: uses `usePlaybackStore.getState().getVideoRef()` inside rAF — direct store access (not subscription) is intentional to avoid re-render loops
- **transcribe.py overlap guard**: 50% threshold — could miss edge cases with very short segments
- **VAD defaults**: may still miss quiet clip beginnings — user aware, needs targeted fix later
- **Zustand selectors**: always subscribe with selectors, never `useStore(state => state)`
- **`isDev` flag**: set to `false` in main.js — rebuild before testing
- **Schema migrations**: any electron-store data change requires migration function first
