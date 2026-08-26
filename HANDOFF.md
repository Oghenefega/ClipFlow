# HANDOFF — Session 206 (2026-08-26)

## Current State

**#312 built and pushed (`d65bbdb`, Opus@high).** Music and SFX can each be split across up to
three lanes; a vertical drag moves a block between lanes of its kind; the render is untouched.
Reproduced the bug in the running app first (three SFX on one lane → two blocks at the same
x/y, one drawn over the other), then measured the fix (zero overlaps, all three grabbable).
`npm test`: **152 passing**. Renderer builds.

Epic #308's build track is now done: #309 / #310 / #311 / #312 have all landed. What's left
before the installer is #314 and #313. **Nothing in the media track has been verified by Fega
yet** — still one pass at the end, installer still the gate.

`d65bbdb` is unreviewed. So is `4eaa36c` from s205 (a review-fix commit). The next Fable@xhigh
session should cover both.

## Key Decisions

1. **A sound lane index is LAYOUT ONLY — the exact opposite of a media lane.** A media
   `trackIndex` is z-order and `resolveMediaPlacements` sorts by it. `resolvePlacements`
   deliberately does NOT read `trackIndex` and does NOT reorder, because the mix is amix over
   every placement: which lane a sound sits on must not change a byte of the export. Both
   models carry that contrast in their comments, and a test asserts identical resolver output
   for the same sounds spread across lanes vs piled onto one. **Don't "tidy" the two models
   into agreement — the asymmetry is the point.**
2. **`render.js` was not touched at all.** That's the whole reason the byte-identical
   requirement is cheap: `trackIndex` is an extra field on a placement the graph never reads.
3. **The s205 sync-loop merge (`syncMediaVideos` / `syncAssetAudio`) was deliberately NOT
   done.** Its premise was that this batch rebuilds that area; it doesn't — `PreviewPanelNew.js`
   has zero lines changed. Merging two unverified preview clock loops before the installer is
   risk without payoff, and they differ in substance (the audio one creates and prunes its own
   elements and applies fades; the video one is handed its elements and must be right while
   paused). Reasoning is on #312. **Currently UNFILED** — file it after Fega's pass if wanted.
4. **Lane geometry:** lane 1 stays on top and extras open BELOW it, so adding one never shuffles
   what's on screen. (Media lanes go the other way — higher index is drawn on top, so it sits
   nearer the Subtitle lane. Both are deliberate.) Controls live on the LAST lane of a kind, the
   on/off toggle on the FIRST.

## Next Steps

**Fega's standing call: NO installer until the media track is done — then one big one.**

1. **#314** (kind-blind watched-folder lists) and **#313** (stale ffmpeg-skill ASS burn-in doc —
   the skill gained lines in s203/s204/s205, don't clobber them).
2. **THEN the one big installer** (`clipflow-update-launcher`): #309/#310/#311/#312 + review
   commits (d30fd39, 62ee3ee, 4eaa36c, d65bbdb) + #313/#314/#317. Issues stay open
   (`status: untested` on anything closed early) until Fega's one pass.

Rhythm stands: Opus@high builds, Fable@xhigh reviews commit-by-hash right after it lands.

## Watch Out For

- **Fega's verification pass gains one check** on top of the s203/s205 ones: drop three sound
  effects on one moment, hover the SFX lane name, click `+`, drag one block down onto the new
  lane. All three visible and grabbable, and **the render must sound identical** to before the
  split.
- **The drag threshold is gated, and the gate matters.** `SoundBlock`'s start threshold had to
  begin noticing vertical movement, which made a wobbly click start a move instead of selecting.
  It's now `|dx| >= 3 || (canChangeLane && |dy| >= 3)` — with one lane, behaviour is exactly what
  it was. Don't simplify that back to an unconditional `|dy|`.
- **A block is RE-PARENTED into another lane mid-drag** — React unmounts it and mounts a fresh
  one there. The gesture survives only because everything it needs is in the pointerdown closure
  and the listeners are on `window`. Nothing in that handler may depend on staying mounted.
- **The last lane of a kind catches `t >= trackIndex`**, so an undo can't strand a block on a
  lane that's since been closed (same guard the Media lanes use). Don't tighten it to `===`.
- `TIMELINE_FIXED_H` no longer includes the two sound lanes — every lane is count-driven now,
  and `EditorLayout` adds media + music + sfx on top. Measured 348px → 384px on adding a lane.
- **#320 filed**: `mediaPlacements`' `!(x >= 0)` guard lets a `null` through (`null >= 0` is
  `true`). Harmless today (every consumer reads `p.trackIndex || 0`). The audio twin was fixed
  here; the media one was deliberately left for after the verification pass.
- The sacrificial test clip remains **"Clip 4 (copy)"** in *2026-08-06 RL Day14 Pt2* (dev
  profile) — used and **restored** this session (verified against the project JSON on disk). The
  first clip there ("He DOMINATED me…") is approved AND published — don't touch.

## Logs/Debugging

- **CDP driver, no dependencies.** `ws` is not installed, but Node 24 has a global `WebSocket`:
  a ~40-line `cdp.js` over `/json/list` + `Runtime.evaluate` was the whole harness. Probes as
  real files (`node cdp.js --file probe.js`), never heredocs. Full notes now in the
  `project_cdp_verification_gotchas` memory.
- **Launch for boot-verify:** `CLIPFLOW_PROFILE=dev electron . --remote-debugging-port=9222`
  loads from `build/`, not Vite (`isDev` is hard-coded false), so CDP drives the REAL bundle.
- **The trap that cost a pass:** dispatching a shortcut KeyboardEvent on both `window` AND
  `document` fires it twice (document bubbles to window) — a "single" Ctrl+Z ran two undos and
  looked like an undo bug. Dispatch on `window` only.
- **Hidden controls, two kinds.** CSS-gated (`hidden group-hover/lane:flex`) responds to
  `.click()` while invisible. React-state-gated (`{hovered && <button/>}`) isn't in the DOM:
  dispatch `mouseover` on the row, await a tick, then query.
- **The assertion that actually proved the bug** was geometric, not visual: collect every block's
  rect per lane and count pairs overlapping in BOTH x and y. One lane → `overlapping: 1`; two
  lanes → `0`. A screenshot alone would not have caught a block hidden exactly behind another.
- Persistence was verified by reading the project JSON off disk after autosave
  (`W:\...\.clipflow\projects\proj_1786068431412_4o50ad\project.json`), not from the UI.
