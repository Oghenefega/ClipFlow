# HANDOFF — Session 228 (2026-09-01)

> Pending session title (set automatically at next session start): S228 · #349 per-section layouts built

## Current State

**#349 per-section layouts is BUILT, machine-verified, committed — not yet in an installer
and not yet user-verified** (`status: untested`, stays open). A clip can now switch layout at
a cut: `segment.reframe` on each `nleSegments` entry, cascade section → clip → project.
Proven on an AR-pool fixture: preview, thumbnail capture and a real 1080×1920 @ 60 fps render
all switch at the cut; the opted-out section letterboxes in both engines; split / trim /
undo / restart keep the section's layout; apply-to-all strips it; Detect under section scope
samples only that section. 205 jest tests green (23 new).

Still awaiting Fega: the #348 feature check (alpha.16 is installed; feature unverified) and
#347. Both stay open with `status: untested`.

## Key Decisions

- **No new IPC for section writes.** `nleSegments` is autosaved wholesale and deep-copied by
  undo/duplicate, so `setSegmentReframe` is a store write. `clip.reframe` still needs its
  dedicated IPC (kept out of the autosave list — s227 rule stands).
- **Canvas rule:** if ANY section has a layout, every section bakes 1080×1920; a raw section
  goes through `fitToScreenReframe` (whole frame letterboxed, style borrowed from the first
  laid-out section) so the frame never resizes mid-clip. Same helper in render and preview.
- **No contiguous-group merging in the render graph.** Per-section composite then concat
  (`rf<i>_` labels); all-agree clips take the old single composite verbatim. `sameReframeLook`
  compares geometry+style by value, layoutId ignored.
- **Scope switch is 2-way** ("This section / This clip"); "Apply to all clips" stays the
  explicit whole-project button (Phase A semantics Fega chose). Section scope only shows
  when the clip has a cut.
- **Cascade is pure:** "No layout for this clip" does not strip section overrides.

## Next Steps

1. **Cut an installer when Fega asks** (alpha.17 would carry #349 alone on top of alpha.16;
   batching rule says wait for the ask or ~10 changes).
2. **Fega's check on #349** (~3 min, plain-language script is in the session wrap message):
   clip with a cut → "This section" → different layout after the cut → scrub + render.
3. **#350** (filed this session): editing an INHERITED layout under clip/section scope
   upserts the shared library entry in place, so the section's "own" layout and the clip's
   share one id/name — decide "variant by default" vs "ask". Pre-existing Phase A semantics,
   more visible now.
4. Backlog from s227 still stands: #297/#299 data-safety pair, quick-wins bundle
   (#307, #304, #320, #303), s223's #341/#342.

## Watch Out For

- **Video-track blocks are `WaveformTrack`, not `SegmentBlock`** (the issue text was wrong;
  corrected in the #349 comment). Badge + memo comparator live there.
- **`clip:concatRecut` is dead from the UI** (only caller is the store's unreferenced
  `rippleDeleteAudio`). Left untouched; it still rebuilds bare segments if anything ever
  revives it.
- **Mixed-layout graph needs real source dims** — `buildNleFilterComplex` throws without them;
  `renderClip`/`renderThumbnail` probe via `probeDims` ONLY when a raw section sits in a mixed
  clip, so every other render's clamp bounds (and args) are unchanged.
- **Preview resolves the section by the `<video>` clock (source time), half-open ranges**,
  and keeps painting the last section while the clock sits in removed footage mid-seek.
- **`layoutScope` resets to "clip" on every clip load**; the calibration draft stamps
  `targetSegmentId` at begin time so scrubbing mid-calibration can't retarget.
- Both `applyReframeToAllClips` copies (projects.js and the store) strip section overrides —
  they must stay twins.

## Logs/Debugging

- **Full CDP editor drive lives in this session's scratchpad** (`e9ffa68e…`): `cdp.js`
  (needs `ws` from `C:\Users\IAmAbsolute\node_modules`), `e2e1.js`–`e2e4.js`. New traps
  recorded in memory `project_cdp_verification_gotchas` #63–67: dedupe memo fibers by
  segment id, select the section lane before split (else a subtitle splits), thumbnail IPC
  overwrites one file per clip, renders land in `<outputFolder>/<project name>/`.
- Fixture recipe (s227) reused cleanly: AR project `2026-07-20 RL Day9 Pt2`
  (3 clips, all rejected, 0.7 GB) copied under `<scratch>/fixture`, dev `projectsRoot`/
  `watchFolder`/`outputFolder` repointed and restored at wrap (`dev-settings-orig.json`);
  the dev saved-layout entry `layout_1784170084767` was renamed/resnapped by the test and
  restored by hand. Dev tokens confirmed `{"accounts":{}}` before every boot.
- Detect-scoping proof again read from a stdout-captured boot: `[ReframeDetect] sampling 8
  frames @ [8.8 … 15.2]s across 1 range(s)`.
