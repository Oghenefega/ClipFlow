# HANDOFF — Session 256 (2026-09-13)

## Current State

Master is clean at this wrap's commit. **No installer was cut** — two commits since alpha.3,
short of the batch rule. #409 is closed `status: untested`: the fix is verified on the dev
build against Fega's real clip, but Fega tests on the installed exe and hasn't seen it.

**What shipped:** transparent ProRes 4444 overlays (DaVinci exports) now show in the editor
preview. Chromium can't decode ProRes and silently plays audio-only, so `assets:previewPath`
hands the overlay a cached VP9-alpha WebM stand-in (`.clipflow/assets/previews/<hash>.webm`)
while the render keeps compositing the original. See CHANGELOG for the full account.

## Key Decisions

- **Lazy stand-in, not import-time transcode.** `getPreviewPath` resolves on demand, like
  `getPeaks`, keyed on path + mtime + size. One IPC covers library uploads, watched-folder
  files and placements saved before this session, with no index schema change or migration.
- **HEVC is treated as undecodable for overlays** even though the source-recording warning
  list counts it as playable. It only plays where the GPU decodes it; a customer machine may
  not, and the stand-in is cheap.
- **Always `yuva420p`.** An opaque source just gets a solid alpha plane; the cost is small and
  it can never drop transparency by misreading a pixel format.

## Next Steps

1. **Cut an installer when the batch fills** — #406/#407/#409 all wait on it.
2. **#265 — first-run setup checklist**, still the largest code item (see s255 handoff).
3. **#408**, **#405**, **#21** — unchanged from s255.
4. **Open question from s255 still open:** is the Google OAuth consent screen verified or
   only published? Five minutes in the Cloud console; changes YouTube's launch sequencing.

## Watch Out For

- **Opening a clip in the editor rewrites its project.json even with no edit.** Observed on
  the approved "Vora ALMOST Clutched" clip: `updatedAt` moved and two subtitle ids in the
  first clip shifted by one (408→407, 409→408). Content otherwise identical. Pre-existing,
  not from this session's change; restored from snapshot. Worth a look if subtitle ids are
  ever used as stable references.
- **`taskkill //F //IM electron.exe` is no longer safe on this machine.** DaVinci Resolve's
  Epidemic Sound plugin runs as `electron.exe` (five processes, `D:\DaVinci Resolve\Electron\`).
  Kill the dev app by PID, filtering `Win32_Process` on a command line containing
  `Desktop\ClipFlow`. PowerShell output carries `\r` — `tr -d '\r'` before looping.
- **The Media panel thumbnail of a transparent clip shows its first frame**, which for a
  CTA animation is nearly empty (a dot on the cell background). Not wrong, just uninformative.
- **`previews/` accumulates.** A re-exported file gets a new hash; the old copy is never
  pruned. Fine for now, worth a sweep if the folder ever matters.

## Logs / Debugging

- **CDP driver this session:** `scratchpad/cdp.js` — `node cdp.js eval "<js>" | shot <png> |
  click <x> <y>`, global `WebSocket`, exits after each command. Boot with
  `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222
  --disable-features=CalculateNativeWinOcclusion --disable-renderer-backgrounding
  --disable-background-timer-throttling`. Runs the **built** renderer from `build/`.
- **Alpha proof outside the app:** `scratchpad/alpha-probe.js` loads a page with the WebM over
  a red body in an offscreen BrowserWindow and reads pixels from `capturePage` — red at the
  corners, white on the text. Faster than driving the editor when the question is "does
  Chromium keep the alpha".
- **Render-side alpha check:** composite the file over `color=c=red` with the exact
  `format=rgba,scale,overlay` chain from `render.js:468` and average the frame; red means
  the alpha survived.
- **Snapshot-before-open** (gotcha 32) held: `project.json` copied to the scratchpad before
  the editor opened, field-diffed after, restored by copy once the dev app was dead.
