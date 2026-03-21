# ClipFlow — Session Handoff
_Last updated: 2026-03-21_

## Current State
The app is fully functional across all 7 views. Active development focus is Phase 10: Editor UI Rebuild — matching the Vizard reference screenshots using shadcn/ui + Tailwind CSS.

## What Was Just Built (Recent Sessions)
- **Right panel text size** — increased from 10px to 12px for readability
- **Timeline track labels** — increased sizes, removed colored letter badges
- **Preview subtitles** — fixed: builds 3-word micro-segments from pipeline data; DEL key cleanup
- **Subtitle preview** — fixed: overlays only show during video playback, not on static thumbnails
- **Per-clip styling persistence** — subtitle/caption styles now saved per clip via IPC
- **Editor subtitle workflow** — create/delete/caps/smart-edit, zoom centering, whisper slang support
- **Timeline playhead** — smooth 60fps via rAF loop, max zoom increased to 20x
- **Clip extension** — drag audio past original end to extend clip duration
- **Visual real-time trim** — subtitles/captions shrink live as audio edge is dragged

## Key Decisions
- Editor state lives in 6 isolated Zustand stores — never use `getState()` in render paths
- Preview subtitle overlays are only active during playback (not on thumbnails) — intentional design
- Subtitle segments are "micro-segments" (3 words) built from whisper pipeline data for karaoke effect
- `.claudeignore` is now in place — node_modules, build/, reference/ screenshots excluded from context

## Next Steps (Priority Order)
1. Continue Editor UI Rebuild (Phase 10) — check `/reference/vizard-ref/` for remaining sections
2. Right panel — verify all drawer panels (Subtitles, Caption, AI Tools, Brand, Media) match reference
3. Timeline — draggable segment handles, context menu for delete
4. Undo/redo stack for timeline edits
5. Draggable subtitle/caption position on preview viewer
6. Platform API integrations (YouTube, TikTok, Instagram, Facebook) — currently stubbed in `publish.js`

## Watch Out For
- **Zustand selectors** — always subscribe with selectors, never `useStore(state => state)` — causes full re-renders
- **Preview overlays** — the subtitle overlay logic checks `isPlaying` — don't break this when touching PreviewPanel
- **Whisper segments** — pipeline data uses word-level timestamps; micro-segment builder in `PreviewPanel.js` depends on this shape
- **IPC save** — per-clip styling is saved via `projectUpdateClip` IPC call on blur/change, not on a timer
- **`isDev` flag** — in `src/main/main.js` is set to `false`; Electron loads from `build/`. Remember to rebuild before testing
- **Schema migrations** — any data structure change to electron-store requires a migration function first (hard rule)
- **RightPanelNew.js** — currently has uncommitted changes (modified, not staged)
- **slider.tsx** — currently has uncommitted changes (modified, not staged)
- **game_profiles.json** — currently has uncommitted changes (modified, not staged)
