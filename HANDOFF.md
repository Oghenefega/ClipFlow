# HANDOFF — Session 181 (2026-08-21)

## Current State
**One issue shipped: #283 — the editor colour picker now opens with a Recent
row over a palette that leads with true red/green/blue/yellow.** On master in
`d640563`, `status: untested` — **not in any installer yet.**

The s180 question is **still open and now applies to three issues**: #281, #282
and #283 are all on master and all invisible to Fega until a build ships (he
tests on the installed exe). He was asked at the end of s180 and again at the
end of s181; both times he wrapped without deciding. 0.4.0-alpha.1 (cut s179) is
still the newest published build.

Still awaiting Fega's in-app pass from earlier sessions: #263/#269, #270, #271,
#275, #276, #278, #279, #280, plus #281/#282.

## What Was Built
Fega's report: the quick swatches are "always bland and pale", with no actual
red/green/blue/yellow, four shades of grey and a peach he'd never use. Measured
against the old 40-colour list: **no `#ff0000`, `#00ff00`, `#0000ff` or
`#ffff00` anywhere**, 7 flat greys, 6 muddy olives, and `#f87171` present twice.

Three files:

- **New `src/renderer/editor/utils/recentColors.js`** — renderer-only ESM.
  Exports `PALETTE_COLORS` (24), `getRecentColors()`, `pushRecentColor(hex)` and
  `needsOutline(hex)`. Recents persist to
  `localStorage["clipflow-editor-recent-colors"]` (same pattern as the drawer
  width), cap **16**, newest first, lowercase dedupe, `try/catch` so a storage
  failure never blocks the pick.
- **`RightPanelNew.js`** — the picker from Fega's screenshot (subtitle colour,
  highlight swatches, glow, stroke, shadow all route through it). Local
  `PALETTE_COLORS` deleted in favour of the shared one; `handleOpenChange`
  replaces the bare `setOpen` on `<Popover>` and does the recents work; a local
  `swatch(c, key)` render fn (deliberately a function, not a nested component —
  a nested one would remount 40 buttons every render).
- **`PreviewPanelNew.js`** — `InlineColorPicker`, the small picker under a
  selected caption on the preview canvas. Dropped its own separate 18-colour
  `SWATCHES` list; 6-col grid → 8-col to match the other picker.

Palette is 3 rows of 8: neutrals + true primaries/secondaries, then vivids, then
pops plus three dark tones (`#6b7280`, `#3a3a3a`, `#101010`) kept **on purpose**
because this same picker sets stroke and shadow colours.

## Key Decisions
- **Mock-first, as usual.** `scratchpad/color-picker-mock.html` — three panels
  (today / proposed / fresh-install empty state) opened in Fega's browser and
  signed off before any app code.
- **Recent = 16, two rows.** Proposed 8; Fega asked for 16 in his approval.
- **Write on close, not on change.** The gradient fires `onChange` continuously;
  recording each one would bury the list in near-identical smears. One entry per
  picking session. Opening and closing without changing anything records
  nothing (guarded by an `openedWith` ref captured at open).
- **Recents hidden until non-empty**, so a fresh install renders a *shorter*
  panel than before (318px vs the old 372px), not a taller one.
- **One shared history across both editor pickers**, since Fega explicitly
  wondered whether the picker "works the same way across the whole application".
  It didn't — the canvas one had a different palette entirely.
- **Left alone deliberately:** `ColorPicker` in `components/shared.js:301`
  (game-tag accents) and `FOLDER_COLORS` in `views/ProjectsView.js:1104`.
  Different job, both already tidy; mixing caption history into them would be
  noise.
- **No migration.** Colours already saved on clips are untouched — this only
  changes what's *offered*. Existing clips still carry old-palette values
  (e.g. `highlightColor: #a3e635`), which is correct.

## Next Steps
1. **Decide the installer question — now covering #281, #282 and #283.** Three
   shipped issues are invisible to Fega until a build goes out.
2. **Fega's in-app pass** on #283, then clear `status: untested`.
3. **#272 → #273** (approved batch order from s178): mic/game balance first,
   then volume ramps — mock the ramp interaction before code.
4. #277 premium design pass epic — Tracker done, remaining scope is other tabs.

## Watch Out For
- **A component that unmounts inside the same handler that changed its value
  never re-renders — so an unmount-cleanup ref still holds the PRE-change
  value.** This was a real bug in the first version of `InlineColorPicker`: its
  swatch did `onChange(c); onClose();`, React batched both, the component
  unmounted before re-rendering, and the cleanup read the old colour, so the
  pick was silently never recorded. **The swatch now calls `pushRecentColor(c)`
  itself.** The unmount effect is still there and still needed — it covers the
  native colour input and the hex field, which leave the component mounted while
  their value changes. Don't "simplify" either half away.
- **The two pickers write their recents by different mechanics on purpose.**
  RightPanel's popover stays mounted and closes separately from the pick, so
  reading `hex` state in `handleOpenChange` is safe. The canvas one closes in
  the same handler as the pick, so it can't. Same rule, different plumbing.
- **`recent` in `InlineColorPicker` is a `useState(getRecentColors)` snapshot**,
  not live — the row deliberately doesn't reshuffle under the cursor while the
  picker is open. It refreshes next open. Same for RightPanel, which reloads in
  `handleOpenChange` on the way in.
- **Never fake a `pointerdown` on a preview overlay with `new MouseEvent(...)`.**
  `DraggableOverlay.onPointerDown` calls `setPointerCapture(e.pointerId)`; a
  synthetic event has no `pointerId`, so it throws `NotFoundError` and the error
  boundary shows "Corva crashed". That happened once this session and cost a
  restart. Real users can never hit it (a genuine pointerdown always has an
  active pointer) — **not a bug worth filing**. Use CDP `Input.dispatchMouseEvent`.
- **Dev-profile localStorage is separate from prod**, so nothing tested here can
  leak into Fega's daily driver. Test recents were cleared at session end
  regardless.

## Logs / Debugging
- Session scratchpad `9954a421…/scratchpad` holds the harness:
  **`cdp.js`** (one-shot `Runtime.evaluate` from a file — note it requires `ws`
  from `C:\Users\IAmAbsolute\node_modules\ws`, NOT the repo's `node_modules`),
  **`click.js`** (real `Input.dispatchMouseEvent` click at x/y — the only way to
  select a canvas overlay), **`shot.js`** (`Page.captureScreenshot` → png),
  `color-picker-mock.html`, `picker-after.png`, and the `e1..e34.js` probes.
- **Launch for verification** (`npm start` dies on the daily driver's
  single-instance lock, and `isDev` is hardcoded `false` so this loads the built
  renderer from `build/`, not Vite):
  `CLIPFLOW_PROFILE=dev ./node_modules/.bin/electron . --remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion`
  Kill with `taskkill //F //IM electron.exe` (double slash) and confirm
  `tasklist | grep -ci electron` is 0 before relaunching.
- **Reading the recents store live:**
  `localStorage.getItem("clipflow-editor-recent-colors")` via `cdp.js`.
- **Route to the picker** (~10s): Projects (bottom nav, y≈841) → project card
  `2026-08-06 RL Day14 Pt2` → 3rd `Open in Editor` → right-rail `Subtitles`
  button (x>1200) → the `w-6 h-6 rounded-full` trigger at (1179, 264). The
  canvas picker: real-click the caption overlay at (657, 424), then the colour
  dot at (767, 459).
- **Test hygiene this session:** used a *pending, unapproved, unrendered* clip —
  no rejected clips existed in any open project. Clip 3's colours were confirmed
  back to `#ffffff` in `project.json` on disk afterwards, and dev
  `projectsRoot` was never repointed (still the real `W:\` library).
- App log: `%APPDATA%\clipflow-dev\logs`. Publish errors live in
  `clipflow-publish-log.json`, not `app.log`.
- New traps recorded as **gotchas 50–52** in the CDP memory file
  (synthetic-pointerdown crash, don't-batch-mutating-probes, unmount-ref
  staleness).
