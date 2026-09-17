# HANDOFF — Session 261 (2026-09-17)

## Current State

Master is clean at this wrap's commit. Eight requests from Fega, all built, verified in the dev
profile on a scratch fixture and (where it renders) on frames of a real `renderClip` export, all
pushed. **Nothing is on the update feed yet** — alpha.5 is still the installed build, so Fega has
not seen any of this. Five code commits:

- `1d53262` #427 #428 #429 #432 — header pins (project + Queue), tab memory, TikTok privacy
  "flash", caption line spacing 0.9.
- `68c8f9f` #425 — wrong-layout frame at a cut + playhead parking on the wrong side of it.
- `b15c6b4` #426 — the dead Aa / AB buttons wired; reversible ALL CAPS at word / line / block.
- `b687469` #430 — timeline multi-select on every lane, Ctrl+D, group drag, Alt+drag group copy.
- `dc7b898` #431 — per-subtitle position, preview + export; per-line settings survive a grouping change.

507 tests (26 new). All eight issues closed `status: untested`.

## Key Decisions

- **Caps are drawn, never typed.** `text-transform` at three levels (block `caps` < line `seg.caps`
  / caption `lineStyles[i].caps` < word `style.caps`), innermost wins, `false` is a real value
  (opt OUT of an all-caps block). The old row AA rewrote text; lines it already upper-cased still
  read as on and switch off by lower-casing (nothing else is recoverable). A casing-only word
  override returns NO color/shadow so the karaoke highlight and progressive sweep still apply —
  callers tell the two kinds apart by `css.color`.
- **Per-line fields ride ONE helper, `lineExtras` (resolveSubtitles.js), at every hop** that rebuilds
  segments from named fields: resolver ×3, `initSegments`, render.js's resolver branch. `enabled`,
  `caps`, `yPercent` today; a fourth per-line field goes there and nowhere else. `carryLineExtras`
  is its twin for the grouping re-chunk (settings travel on words as a transient `_line` tag).
- **Layout section is chosen from the presented frame's `mediaTime`** (`sectionIndexForFrame`,
  timeMapping.js), not `video.currentTime`. `seekTo` resolves a cut to the head of the section that
  starts there (`timelineToSourceForSeek`); `timelineToSource` itself is unchanged because trims
  and placement anchors rely on its end-of-earlier-section answer.
- **Timeline selection has one writer, `applySelection`,** which sets `selRef` eagerly. Do not
  re-derive that ref from state during render (see lessons — it breaks mid-gesture).
- **Group drag and Ctrl+D are sounds + overlays only.** Subtitles/captions multi-select supports
  Delete and disable; a copy of one has nowhere to land without overlapping, and Alt+drag covers it.
- **Tab memory:** remembered tab wins while it still has clips (so approving a clip in the editor
  returns to Pending, not to where the clip went); otherwise follow the edited clip, then
  Pending → Approved. Differs slightly from the plan wording Fega approved — told him why.
- **Line spacing:** Fega chose "new clips only". His new clips take their look from his own default
  template ("3 word n Glowy Cap"), which held 1.3 — hence the store migration
  `_migrated_captionLineSpacing_v1` (templates at exactly 1.3 → 0.9). It will run on his prod
  profile on first boot of the next build.
- **TikTok privacy stays with no default** (Direct Post approval). The fix was the layout jump.

## Next Steps

1. **Cut an installer when Fega asks** (or when the batch reaches ~10) — nothing here reaches him
   until then. Then clear `status: untested` on #425–#432 as he confirms each.
2. Ask him specifically about #425 on "Asuna ALMOST CLUTCHED THIS!" — that clip has the repeated-
   footage shape the flash was reproduced on.
3. Carry-overs unchanged: #419 scoreboard (30 published rows), #418, #416, #265.

## Watch Out For

- **Fega's disable key is `.`, not `D`** — his rebinds are in `editorShortcuts` and `dev:seed`
  copied them into the dev profile. A probe pressing `d` "fails" silently. Ctrl+D (new) is free in
  his bindings.
- **Dev profile:** `projectsRoot`, `localProjects` and tokens restored to pre-session values
  (surgically — the app's own writes stayed: `lastSeenVersion` alpha.5, the #427 migration flag and
  the three migrated templates). Tokens are `{"accounts":{}}`.
- **Line endings:** `sed -i` flattened three CRLF files in Batch 1; restored in bytes mode.
  `ProjectsView.js` is LF in the working copy and its original state is unknown — harmless (repo
  normalises), but don't "fix" it.
- **The fixture** is a scratch copy (under this session's scratchpad) of s260's scratch copy of
  `2026-09-02 Val Day3 Pt1`. Clips 8/9/10 (rejected) carry the cut/layout, caps, position and SFX
  test data. The real project was never touched; the SFX file is linked from `V:\AutoSync`, not copied.
- **`render-e2e-probe.js` prints "MISSING"** for any clip but the one it was written for — its
  white-pixel heuristic is for a title card. Use `RENDER_PROBE_PROJECT` / `RENDER_PROBE_OUT` + mode
  `full`, then pull frames with ffmpeg and LOOK at them.

## Logs / Debugging

- Migration line on boot: `Caption line spacing default 1.3 → 0.9 (#427): N saved template(s) moved`
  (module `system`, app.log).
- #425 probe (not in the repo; rebuild from the issue if needed): a temporary push to
  `window.__paintLog` inside `paintActive` of `{via, t: video.currentTime, mt: mediaTime, st: store
  time, hint, idx}`. The bug signature is a `frame` event whose `mt` is in one section while `t`
  already reads the next section's start.
- Scratchpad drivers worth reusing (`…/2d9c1ea5…/scratchpad`): `d.js` (eval / main-process eval /
  trusted click, drag, key with modifiers / screenshot), `open-clip.js` (polling navigation to a
  fixture clip), `fx-setup.js` + `fx-restore.js` (fixture + surgical dev-profile restore),
  `patch-tt.js` (fake a slow `tiktok:queryCreatorInfo` from the main inspector on 9229).
