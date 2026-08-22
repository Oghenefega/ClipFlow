# HANDOFF — Session 185 (2026-08-22)

## Current State

**0.4.0-alpha.4 is cut, published to the R2 feed, and pushed** (`b7be2d8`). The live
manifest at `engine.flowve.app/updates/alpha.yml` reads `0.4.0-alpha.4`; alpha.3 was pruned
from the feed. Every installed copy (desktop + laptop) gets the banner on next launch.
**Fega has NOT installed it yet** — that is the first thing to confirm next session.

Two issues shipped and were closed, both `status: untested`:

| Issue | State |
|---|---|
| [#295](https://github.com/Oghenefega/ClipFlow/issues/295) | **Shipped + closed** — "Show subtitles" off no longer burns subtitles into the render. |
| [#296](https://github.com/Oghenefega/ClipFlow/issues/296) | **Shipped + closed** — disable/enable for elements and lanes, plus the Audio-lane mute. |

Both ride the installer alongside **#293** (published clips on the Queue), which shipped
last session and had never reached a build until now.

Awaiting Fega's in-app pass: #284, #285, #286, #263/#269, #270, #271, #275, #276, #278,
#279, #280, #281, #282, #283, #291, #293, #295, #296.

**#285's untested leg still stands:** a real YouTube publish with tags attached has never
been verified on a live video. Unchanged by this session.

## What Was Built

### #295 — "Show subtitles" off now means no subtitles in the render

`showSubs` was shipped to the main process inside `subtitleStyle` and never read
(`grep -rn showSubs src/main/` was empty), while `subtitles: timelineSubs` went across
unconditionally. The gate is now payload-side in `buildRenderPayload` — which also covers
the WYSIWYG screenshot, since that goes through the same builder.

**The subtle part:** it must pass an empty **array**, never omit the key. `render.js` falls
back to `resolveClipSubtitles()` whenever `clipData.subtitles` is not an array, and would
have burned in the very lines that were switched off.

`showSubs` now also **persists per clip** (saved in `subtitleStyle`, restored in
`restoreSavedStyle`). It used to be a session-lived store value that leaked from one clip to
the next and reset on restart — wrong for a switch that decides what ships.

### #296 — disable / enable elements and lanes, plus source-audio mute

`enabled !== false` is the read on every path, so absent means enabled and nothing migrates.

- **Elements:** one SFX, one music drop, one subtitle line, one caption block. Sounds toggle
  from their right-click settings popover; subs/captions from the right-click menu. A
  disabled block greys (`grayscale(1)` + `opacity 0.4`) in place, leaves the viewer, and is
  absent from the render.
- **Lanes:** the **Caption / Subtitle / Music / SFX** labels ARE the switch — click the
  label. It greys and strikes through and its icon flips (eye for the two visual lanes,
  speaker for the audio ones). The **Audio** lane gets a *mute* instead: its blocks are the
  video sections, so disabling it would mean deleting the picture.
- **The Subtitle lane's switch IS `showSubs`** — one flag, not a second one beside a broken
  one. That is how #295 got folded in.
- **Shortcuts:** `d` toggles the selection, `alt+d` toggles its lane. Both in the shortcuts
  dialog, both rebindable, rebinds survive a restart.
- Disabling never touches `volume`, so a sound comes back at the level it had and the
  popover still offers "Remember 60% for this sound" rather than "Remember 0%".

**Extra fix the plan missed:** `enabled` was silently dropped on reopen.
`resolveClipSubtitles` rebuilds every segment field-by-field at four hops, so a disabled
line came back enabled. Carried through all four as a conditional spread, so a segment that
never had the flag is byte-identical.

## Key Decisions

1. **One choke point per surface, and it is the payload.** `buildRenderPayload` decides what
   ships for subtitles and captions; `render.js` filters sounds (because `clipData.sfx` is
   read there directly, which covers any future from-disk path). Deliberately did NOT add a
   second `showSubs` gate inside `render.js` — the issue itself argued for keeping the "what
   ships" decision in one place, and no from-disk render path exists today.

2. **The lane shortcut is `alt+d`, NOT the approved plan's `shift+d`.** `eventToKey()`
   deliberately drops Shift when it is the only modifier on a printable character — that is
   what makes `?` work — so `shift+d` canonicalises to plain `d` and could never match.
   Confirmed by testing: Shift+D fired the element toggle. Distilled into
   `clipflow-editor-patterns` so the next shortcut does not repeat it.

3. **Re-enabling REMOVES the key rather than writing `enabled: true`.** A clip switched off
   and back on returns to exactly the JSON it had. Caught by inspecting a saved record
   mid-verification and fixed in all three stores.

4. **Sounds are filtered BEFORE the missing-file check in `render.js`.** A sound the user has
   already switched off must not fail their render because its file moved.

5. **`volume=0` on `base_a`, not dropping the stream.** The stream stays the right length, so
   `amix duration=first` still ends where the picture does, and a clip with no sounds still
   gets a valid silent track rather than none.

6. **Video-segment disable stayed out of scope**, as agreed. So did the Edit-subtitles text
   list — a disabled line still shows there normally. The disable is a timeline affordance.

## Next Steps

1. **Confirm Fega installed alpha.4** and that Settings reads `v0.4.0-alpha.4`.
2. **His in-app pass on #293, #295, #296** — all three are `status: untested`. In the editor
   the lane switches are the labels themselves; `D` toggles a block, `Alt + D` its lane.
3. **#293's snapshot write path STILL has never run for real** (carried from s184). It only
   fires on an actual publish. After the next real post, open that clip on the Published
   shelf and confirm it says "Exactly what was published" rather than the amber recomputed
   note. If it does not, that is the bug and it is small.
4. Backlog is otherwise unchanged — `start session` will surface it grouped by label.

## Watch Out For

- **`enabled !== false` must stay the read on EVERY path.** Absent = on is what makes this
  migration-free. The regression that matters: a clip with nothing disabled must render
  byte-identically. Verified this session — the clean render's graph is
  `-map [out] -map [base_a]`, no `volume=0`, no `amix`, no filtering.
- **Any NEW per-object field on a subtitle segment will be dropped the same way `enabled`
  was.** `resolveClipSubtitles` rebuilds segments field-by-field at four separate hops (the
  editor-saved branch, `primaryRaw`, the final resolved shape, and `initSegments` in the
  store). Add the passthrough at all four, then E2E the save → reload → reopen loop —
  first-save proof is not persistence proof.
- **`SegmentBlock` is `React.memo` with a CUSTOM comparator.** A new prop that should
  re-render it must be added to that comparator or the block silently keeps its old paint.
  `disabled` was added there; the next prop needs the same.
- **The preview has TWO `<video>` elements** (active + standby, swapped at cuts). Anything
  imperative — `muted`, `playbackRate` — must be applied to both, or it reverts the moment
  the timeline crosses a section boundary.
- **`shift+<letter>` can never be a binding.** See Key Decision 2.
- **The legacy (no-NLE) render path honours neither the Audio mute nor sound placements.** It
  maps `0:a?` straight through. It logs a warning now. Same pre-existing limitation sounds
  already had; no clip in the library uses that path today.
- **`showSubs` persisting per clip is a behaviour change.** If Fega notices subtitles coming
  back on when switching clips — that is the fix, not a bug. It used to leak.

## Logs/Debugging

- **Launching the built renderer on the dev profile:**
  `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion`.
  `isDev` is hardcoded `false`, so this loads `build/` and sidesteps the daily driver's
  single-instance lock. `taskkill //F //IM electron.exe` to stop it (double slashes in Git Bash).
- **CDP driver** lives in this session's scratchpad (`cdp.js`) — reads an expression from a
  file, supports `--focus` and `--shot out.png`. Node 24 has a global `WebSocket`, no `ws` needed.
- **Reload after a rebuild via `location.reload()` over CDP** — the renderer picks up the new
  `build/` bundle without restarting Electron. Used four times this session.
- **The dev profile's projectsRoot points at the REAL project tree**, not a copy.
  `npm run dev:seed` copies settings/tracker/DB into `%APPDATA%\clipflow-dev\`, but project
  JSON lives under `projectsRoot` and is shared with prod. Editor edits made in dev DO write
  to real project files — this session used rejected Clip 12 and cleaned up afterwards.
- **Proving the render side:** read the `[Render] FFmpeg args:` line out of the app log. It
  carries the whole filter graph, so `volume=0` on `base_a`, the presence or absence of a
  sound's `-i` and its `amix` mixin, and `-map [base_a]` vs `-map [base_am]` are all readable
  without decoding a frame. `[Render] Overlay frames: N captured` is a strong subtitle signal
  too: 99 with subtitles on, 92 with one line disabled, **1** with the lane off.
- **Frame-level proof:** `ffmpeg -ss <t> -i out.mp4 -frames:v 1 -vf scale=270:480 f.png`, then
  `hstack` several into one strip and look at it. `ffmpeg -af volumedetect -f null -` gives
  `mean_volume` — `-91 dB` is digital silence.
- **`ffmpeg`/`ffprobe` are on PATH** (chocolatey). There is no `node_modules/ffmpeg-static`;
  the app resolves its own from `resources/ffmpeg/` in a packaged build.
- **Test artefacts cleaned up:** the render written for Clip 12 was deleted along with its
  thumbnail, `renderPath`/`thumbnailPath` nulled, the test SFX placement removed, and the
  stray `enabled: true` keys stripped from its saved segments. Clip 12 is back to a plain
  rejected clip with no render.
- **The dev profile's shortcut bindings were reset to defaults** during the rebind test.
  Dev-only (`%APPDATA%\clipflow-dev\`); the daily driver is untouched. A pre-existing dev
  rebind of "End to playhead" (S → K) was lost in that reset.
- **Heredocs with apostrophes still fail in this shell** (s183's lesson holds, and it bit
  again writing this file). Multi-line prose and JS go through `Write` to a file, not an
  inline heredoc.
- **Do not dump whole clip records over CDP.** `projectLoad` plus a clip object is ~40KB of
  transcription and styling; project the three fields you need instead.
