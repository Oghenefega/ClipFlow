# HANDOFF — Session 199 (2026-08-25)

> Pending session title (set automatically at next session start): S199 · Media overlays planned (#308-#312), mock approved

## Current State

**Media overlays (images/GIFs/videos on the timeline) fully planned and approved; mockup
signed off after two revisions. No app code changed.** Epic #308 + batch issues #309–#312
carry the complete build specs (architecture, exact file/line insertion points, locked
product decisions) — a build session can start from #309 alone. Mock: `tasks/mocks/media-overlays.html`.

Commits: `3e87fd4` (plan + mock), `c674258` (category labels), `54e5d35` (favorites/recent).

## Key Decisions

1. **Copy the `audioPlacements` pattern wholesale** for media placements: source-anchored,
   SFX-strict cut survival, CJS resolver in `editor/models/` shared by timeline/preview/render.
   Position is percent-of-output-canvas (aspect-agnostic).
2. **GIF/video composite through the FFmpeg graph, never the offscreen subtitle window**
   (30fps cap + same-frame-skip would break on animation). Slot: between reframe output and
   the subtitle composite. Media inputs append AFTER audio inputs (index-shift trap; tests
   assert byte-identical-when-absent).
3. **NLE-style overlay tracks** (higher track draws on top, base clip always background);
   the lane-descriptor refactor built for them is reused by #312's extra SFX/Music tracks.
4. **Media tab speaks in categories only** — Images/GIFs/Videos with All/Favorites/Recent
   chips; folder names live in Settings. Favorites/Recent reuse the existing asset index
   (`favorite` + `lastUsedAt`, `assets.js:617` / `:459`) — no new storage.
5. **Video overlay sound on by default** (reaction cams are the use case), per-overlay
   volume + mute.

## Next Steps

1. **Build #309** (Media library: watched `mediaFolders`, GIF/video extensions, MediaPanel
   replacing Upload) — Opus@high in its own session, then Fable review by commit hash.
2. Then #310 (image/GIF overlays end-to-end — the core batch), #311 (video overlays), #312
   (dynamic SFX/Music tracks).
3. #313 (stale ASS-burn-in claim in `clipflow-ffmpeg-media` skill) — cheap doc fix, any session.

## Watch Out For

- **Timeline container height is a magic `276`** (`EditorLayout.js:1206`) — any new lane is
  clipped until #310 replaces it with a computed height; verify fit at 1280×860.
- `renderThumbnail` reuses the filter builder with a synthetic 1s segment — overlays must be
  pre-filtered to the thumbnail's timeline `t` or thumbnails silently lose them (in #310 spec).
- Accepted v1 limit: GIF frames don't scrub-sync in preview (playback + render are exact).
  Fega knows; don't re-litigate in review.
- The mock loads real files via `file:///V:/...` — it breaks if V:\ is unmounted; that's
  expected, not a bug.

## Logs/Debugging

- None this session — planning only. Exploration agents' full findings are distilled into
  the issue bodies (#308–#312), including the render filter-graph map and preview
  coordinate-space notes.
