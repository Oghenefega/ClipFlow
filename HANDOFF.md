# HANDOFF — Session 200 (2026-08-25)

## Current State

**Media overlays Batch 1 (#309) built, verified, pushed — commit `741d3a8`.** The editor
has a Media tab (replacing Upload) fed by a new watched `mediaFolders` list in Settings;
GIF/video import rejections removed. Verified via dev-profile CDP drive against Fega's
three real V:\ folders (6 images / 55 GIFs / 36 videos): sub-tab counts, star persistence
through a 5-toggle loop, Favorites/Recent chips, video-thumb teardown, import + grid-delete
round-trip, Settings card. #309 left open with a build comment for the review-by-hash pass.

## Key Decisions

1. **Built by Fable, not Opus** — Fega asked this session to build directly; the
   Opus-builds/Fable-reviews split memory was flagged and overridden by his instruction.
   Review of `741d3a8` still pending (fresh-eyes session or Fega's call).
2. **Media folders scan visual kinds only, audio folders audio only** — pointing either
   list at a mixed folder can't flood the other panel. Same root in both lists is scanned
   once per list, deduped by the absorb set.
3. **No "+" add-at-playhead button in this batch** — hidden (not disabled) until #310
   lands the placement model; a no-op control invites dead clicks.
4. **Grid delete only on uploaded one-offs** (`source !== "folder"`) — preserves the
   capability the retired Upload drawer had; watched-folder files stay untouchable.

## Next Steps

1. **Review `741d3a8`** (Fable@xhigh fresh-eyes, per workflow) — then Fega's in-app check:
   open a clip → Media rail → eyeball the grid + physically drag a file onto the drop strip
   (the one path only exercised at the IPC layer).
2. **Build #310** — image/GIF overlays end-to-end (placement model, overlay tracks,
   on-canvas drag/resize, FFmpeg compositing). The core batch.
3. Then #311 (video overlays + audio), #312 (dynamic SFX/Music tracks).
4. #313 (stale ASS-burn-in claim in `clipflow-ffmpeg-media` skill) — cheap doc fix.

## Watch Out For

- **Shared asset index now holds ~97 media entries** (dev run wrote them into the real
  `.clipflow/assets/assets.json`, 763→860). Prod's installed alpha.5 PRUNES them on its
  next Audio-panel open (its `configured` list lacks media folders) — harmless, they
  re-absorb with new ids under new code. Don't treat media-entry ids as stable until an
  installer ships; favorites set on media before then can be silently lost to that prune.
- **Dev profile has the three mediaFolders seeded** (`clipflow-dev\clipflow-settings.json`);
  prod has none until Fega adds them post-installer.
- Timeline container height is still the magic `276` (`EditorLayout.js:1206`) — #310 must
  replace it with a computed height or new lanes clip; verify fit at 1280×860.
- `renderThumbnail` reuses the filter builder with a synthetic 1s segment — #310 must
  pre-filter overlays to the thumbnail's timeline `t` or thumbnails silently lose them.
- AudioPanel's refresh "new tracks" counter now filters media types out; MediaPanel's
  counts only image/gif/video — type `null` means an audio file awaiting duration probe,
  never media (media types are stamped from the extension at absorb time).

## Logs/Debugging

- CDP driving without deps: Node 24's global `WebSocket` works — `npm install ws` into the
  scratchpad silently landed nowhere (cd + install path issue); driver script pattern in
  scratchpad `cdp309.js` (Runtime.evaluate, awaitPromise, returnByValue).
- Main-view nav/tab clicks need `MouseEvent` with `bubbles:true`, walking UP the ancestor
  chain until the screen changes; Settings group headers are CSS-uppercased (match
  `textContent` case-insensitively) and expand via the header's cursor-styled ancestor.
- Dev-profile boot warnings (TikTok TLS, YouTube `invalid_grant`) are stale dev tokens,
  pre-existing, unrelated to editor/asset work.
