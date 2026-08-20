# HANDOFF — Session 178 (2026-08-20)

## Current State
**#270 (per-word caption styling) is built, E2E-verified, and on master
(commit 1478016).** Second of the approved batch **#271 → #270 → #272 → #273**.
It rides the next installer cut together with #271 (s177) and #263/#269 (s176)
— no installer has been cut for any of them yet, so Fega has verified none of
this in the daily driver. Issues #263, #269, #271, #270 are all closed with
`status: untested`.

## What Was Just Built (#270)
- **Per-word style overrides** for both text surfaces: subtitles (click a word
  in Edit subtitles → compact "Word" card at the top of the Subtitles panel)
  and hook-text captions (clickable word chips under the caption box in the
  Text panel → same card). Controls: color, font, size, glow toggle+color,
  shadow toggle+color, Reset. Styled words get a colored underline marker in
  the transcript and chips.
- **Data model:** style rides the word object itself —
  `editSegments[].words[n].style` (flat subset of engine keys) and
  `captionSegments[].wordStyles[tokenIdx]`. Additive/optional; no migration.
  Survives text edits, split/merge, trim, save, render payload (all hops
  verified). Caption text edits remap `wordStyles` (`_remapWordStyles` in
  useCaptionStore: positional when token count unchanged, text-match otherwise).
- **Rendering:** merged config (`{...lineConfig, ...override}`) fed through the
  SAME engine builders — new `buildSubtitleWordOverrideCss` /
  `buildCaptionWordOverrideCss` in `subtitleStyleEngine.js`, consumed by
  PreviewOverlays (editor + Projects), PreviewPanelNew's caption display (new
  shared `CaptionText` component), and the burn-in
  `public/subtitle-overlay/overlay-renderer.js` (exposed via
  subtitle-overlay-preload.js).
- **Fix found by E2E:** `resolveSubtitles.js` primaryRaw rebuilt words from a
  whitelist and stripped `style` on every clip reopen (autosave then persisted
  the stripped copy). Now carries `style` through.
- Filed **#278**: pre-existing word-dedup in resolveSubtitles runs on
  editor-SAVED subs and can merge a repeated word on reopen (user-text
  mutation; observed 41→40 words during testing).

## Key Decisions
- **Karaoke vs custom style (Fega approved):** a custom-styled word keeps its
  look at ALL times — highlight color flip and progressive sweep are suppressed
  for it; the pop/scale animation still plays.
- **Unstyled caption words stay plain text nodes** (no spans) so existing
  captions render pixel-identical; overridden words are inline spans whose
  textShadow/color/font override the block's inherited style.
- **`styleTarget: true` flag on selectedWordInfo** marks real word clicks —
  segment/timecode/timeline clicks also set selectedWordInfo (wordIdx 0) and
  must not pop the card.
- **Per-letter sizing = stretch goal, parked** (per issue scope), not built.

## Next Steps
1. **#272 — per-clip mic vs game volume balance** (next in approved batch;
   builds the mixing mechanism #273 reuses). Plan to Fega before code.
2. **#273 — music volume ramp over a clip** (shares #272's mechanism).
3. When batch is ready: cut installer via `clipflow-update-launcher`
   (#263/#269/#271/#270 all ride it), then Fega's in-app passes.
4. #278 (saved-subs word dedup) — small gated fix, good session filler.

## Watch Out For
- **resolveSubtitles primaryRaw is a whitelist** — any future per-word field
  must be added there explicitly or it dies on clip reopen (and autosave then
  wipes it on disk). Same for the extras map below it if extras ever carry
  custom fields.
- **Caption `cap-N` ids restart per clip** — `activeCaptionWord` is cleared in
  both initFromClip branches for this reason; keep that if touching init.
- **The dev profile shares Fega's real projectsRoot** — this session styled a
  REJECTED clip (clip_1787202782990_2r7b in proj_1787202305653_tndmi9),
  snapshotted first, and restored `project.json` byte-identical (md5
  95bb1f9a…) after. Test render deleted from the temp output folder.
- WordStyleCard glow/shadow toggles write explicit overrides (`glowOn: false`
  kills a line-level glow for that word); Reset clears the whole override.
- `_remapWordStyles` drops a styled word's override if its text changes in the
  same edit that changes the word count — acceptable edge, documented in code.

## Logs/Debugging
- E2E was CDP against `CLIPFLOW_PROFILE=dev npx electron .
  --remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion`
  with a ws-based evaluator (scratchpad cdp.js; 8MB maxPayload — the 64MB
  buffer caused node VirtualAlloc crashes under this machine's memory
  pressure). Machine also threw "paging file too small" mid-session; retries
  succeeded.
- Render output lands in `<outputFolder>/<project name>/<clip title>.mp4` —
  poll the project SUBFOLDER, not the output root (this session's poll missed
  a finished render for 4 minutes).
- Burn-in proof pattern: render → `ffmpeg -ss <t> -frames:v 1` → Read the PNG.
  One frame at 1.5s showed both surfaces (red Impact "breathing" + magenta
  POSITIVITY) matching preview.
- The dup-word merge (#278) shows as transcript word count dropping on reopen
  of a saved clip (41→40 here); disk keeps the old count until next save.
