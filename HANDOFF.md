# HANDOFF — Session 256 (2026-09-13)

## Current State

Master is clean at this wrap's commit. **0.5.0-alpha.4 is on the feed** (`98f7cea`), promoting
everything since alpha.3: #406/#407 (fresh-install fixes, s255), #409, and #410–#415. All
seven are closed `status: untested` — verified on the dev build over CDP, not yet confirmed by
Fega on the installed exe. Clear the labels when he says the layouts and the overlay behave.

Two things shipped:

1. **Transparent ProRes overlays show in the preview (#409).** Chromium can't decode ProRes
   and silently plays audio-only; `assets:previewPath` now hands the overlay a cached
   VP9-alpha WebM stand-in (`.clipflow/assets/previews/<hash>.webm`) while the render keeps
   compositing the original.
2. **Layout rework, epic #410 (#411–#415).** Apply is a snapshot onto its target and never
   writes the library; Save as new / Update are explicit; delete / duplicate / visible
   click-to-apply on saved-layout rows; Result preview first in the edit drawer with the
   background sliders folded; Result follows each section's own layout during playback; a
   tighter-crop − / + per box. Plan: `~/.claude/plans/gentle-riding-tiger.md`.

## Key Decisions

- **Snapshots, not links.** A section or clip never changes unless touched. `layoutId` on the
  inline copy is bookkeeping for the "In use" badge only (`sameReframeLook` ignores it).
  This reverses s205's "Apply also saves" (`tasks/todo.md:4909-4922`) — that rule is what
  made Fega see "three slots".
- **Zoom is not a new data concept.** Band height is `1080 × h / w`, so the tighter crop is
  a rect scaled about its centre (`scaleRectAboutCenter`, `reframeStyle.js`). Drag-resize
  stays the "bigger band" zoom. Nothing in `render.js` changed.
- **HEVC counts as undecodable for overlays** (stand-in made) even though the source-recording
  warning list treats it as playable — GPU-only decode isn't a customer guarantee.
- **Result preview is 140px wide** so the box rows fit under it at 1280×860. Legibility over
  size; the boxes on the main preview are what get dragged.
- **alpha.4 was cut on Fega's ask**, three commits after alpha.3 — the batch rule yields to
  an explicit request.

## Next Steps

1. **Fega tests alpha.4** on the installed exe: transparent CTA on the Media track; a
   section tweak + Apply leaves the saved layout untouched; Result switches at cuts during
   playback; − on the Webcam row tightens without moving the game band. Then clear the
   `status: untested` labels on #406, #407, #409–#415.
2. **#265 first-run setup checklist**, still the largest code item.
3. **#408**, **#405**, **#21** — unchanged from s255.
4. Still open from s255: is the Google OAuth consent screen verified or only published?

## Watch Out For

- **Two "Save" buttons in the editor DOM while the drawer's Save-as-new row is open** — the
  top bar's project Save and the drawer's. A first-match text click hits the top bar
  (gotcha 3 again). Scope to `input.parentElement.querySelectorAll('button')`.
- **Two `.click()`s in one JS tick apply one crop step** — the second click sees the same
  `reframeDraft` closure. A human clicking twice gets two steps. Space CDP clicks by a tick.
- **Opening a clip in the editor rewrites its project.json with no edit** (`updatedAt`, and
  two subtitle ids shifted by one in the first clip). Pre-existing. Snapshot before opening.
- **`taskkill //F //IM electron.exe` now kills DaVinci's Epidemic Sound plugin.** Kill by PID,
  filtering `Win32_Process` on a CommandLine containing `Desktop\ClipFlow`; strip `\r`.
- **The dev profile's `projectsRoot` can be repointed at a scratch root** —
  `scratchpad/repoint.js <root>` / `repoint.js restore` (restores the whole settings file
  from `dev-settings-snapshot.json`, library included). `localProjects` is cleared so the
  stale-cache fallback (gotcha 34) can't leak real clips in. Restore before the next dev boot.
- **Media panel thumbnail of a transparent clip shows its first frame** — nearly empty for a
  CTA animation. Not wrong, just uninformative.
- **`previews/` accumulates**; a re-exported file gets a new hash and the old copy stays.

## Logs / Debugging

- **CDP driver:** `scratchpad/cdp.js` — `eval "<js>" | shot <png> | shotclip x y w h [png]
  | click x y`. `shotclip` prints a sha1; compare captures with
  `ffmpeg -i a.png -i b.png -lavfi psnr -f null -` — identical frames land ≥ 60 dB, a real
  layout change ~17 dB. Boot: `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222
  --disable-features=CalculateNativeWinOcclusion --disable-renderer-backgrounding
  --disable-background-timer-throttling` (built renderer, not Vite).
- **Library state lives in the dev settings file** (`%APPDATA%\clipflow-dev\clipflow-settings.json`,
  keys `reframeLayouts` / `reframeLayoutDefaultId`); hash `JSON.stringify(reframeLayouts)`
  before and after an Apply to prove the library was untouched.
- **Alpha proof outside the app:** `scratchpad/alpha-probe.js` (offscreen BrowserWindow,
  WebM over red, pixel read from `capturePage`).
- **Render-side alpha check:** composite over `color=c=red` with the `format=rgba,scale,
  overlay` chain from `render.js:468` and average the frame.
