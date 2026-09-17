# HANDOFF — Session 262 (2026-09-17)

## Current State

Master is clean at this wrap's commit. **0.5.0-alpha.6 is on the update feed** (`92703f9`) and
carries all of session 261. Fega installed it, used ALL CAPS and rejected it ("badly written");
it was rebuilt this session as real text (`0901872`, #433) — verified in the dev editor on a
rejected fixture clip and on frames of two real exports, **but it is NOT in an installer**, so the
build he is running still has the rejected version. 525 tests. #433 closed `status: untested`.

## Key Decisions

- **ALL CAPS is TEXT, never a drawn effect** — reverses s261's `text-transform` design, which had
  gone against #426's own written plan without asking. One `AA` switch (Fega's preference over the
  `Aa | AB` pair) in the Subtitles toolbar, the Text toolbar, the word/line card and the subtitle
  row. Its state is never stored: it lights when `isAllCaps(text)`, so typed capitals light it.
- **Off restores the spelling the word had** (Fega's requirement: "Cryo" → "CRYO" → "Cryo",
  "oOoOOo" → "OOOOOO" → "oOoOOo"). Memory is per word: `words[i].orig` for subtitles (added to the
  resolver's word whitelist — it is the one place words are rebuilt from named fields),
  `wordOrig` map on the caption segment (remapped on text edits like `wordStyles`). Trusted only
  while `orig.toUpperCase()` equals the word on screen. No memory (typed in capitals) → lower-case,
  standalone I / I'm / I'll / I've / I'd kept.
- **Caps are not in templates** — Fega: "something I press per clip."
- **"Every subtitle" reads its state from the clip's own lines** (`getTimelineMappedSegments`), not
  raw `editSegments` — those hold the whole recording, which comes back as transcribed on every
  reopen and would switch it off again. The action still rewrites all of `editSegments`.
- **alpha.6 data is converted where it is read, not migrated:** `bakeLegacy*Caps` in the shared
  subtitle resolver, caption store init, ProjectsView and render.js. Returns the SAME array when
  no flag is present. A never-reopened alpha.6 clip therefore still exports as it looked.
- **Session-end now writes the What's New lines** (new step 3); the release skill checks the
  waiting `"unreleased"` entry against the commit range. An `"unreleased"` entry for #433 is
  already in `src/main/release-notes.js` — the next cut renames it, and appends anything newer.

## Next Steps

1. **Cut 0.5.0-alpha.7 when Fega asks** (offered; he chose to end the session instead). Until
   then he is on the rejected ALL CAPS build. After the cut: clear `status: untested` on #433 and
   on #425–#432 as he confirms each.
2. Ask him about #425 on "Asuna ALMOST CLUTCHED THIS!" (the repeated-footage shape) — carried over.
3. Carry-overs unchanged: #419 scoreboard (30 published rows), #418, #416, #265.

## Watch Out For

- **Known behaviour, told to Fega:** a mixed-case caption ("I was OUT OF LINE") reads as AA off;
  first press capitalises everything, and switching back off lower-cases the words he had TYPED in
  capitals (they have no other spelling to restore). If he dislikes that, the fix is in
  `capsWord` (casing.js): skip memory-less all-caps words on a block/line "off".
- **A lone "I" keeps the word switch lit** — off leaves it "I" by his own rule, so that one press
  changes nothing visible. Deliberate.
- **Count mismatch between a subtitle's `text` tokens and `words[]`:** both are re-cased but with
  no memory, and a single-word toggle leaves `words[]` alone (so it would not reach the export).
  Rare (the lists are kept parallel everywhere else); not seen on real data.
- **Dev profile restored:** `projectsRoot` back on the real library, tokens `{"accounts":{}}`.
  The dev electron was killed by command line match; Fega's `Corva.exe` was never touched.
- **`render-e2e-probe.js` prints "MISSING"** for any clip but its own — ignore it, pull frames with
  ffmpeg and LOOK. (`FFMPEG_BIN` for ad-hoc frame grabs: plain `ffmpeg` is on PATH via chocolatey.)
- **The Bash tool eats one backslash level even inside a quoted heredoc** — a `"\\n"` in a
  heredoc-written patch script arrived as a real newline and the anchor missed (nothing was
  written; the patch helper asserts every anchor first). Patch scripts containing backslashes go
  through the Write tool.

## Logs / Debugging

- No new log lines. The legacy conversion is silent by design (identity when no flag is present);
  to see whether a clip still carries alpha.6 flags, look in its project JSON for
  `subtitleStyle.caps`, `captionStyle.caps`, `sub1[i].caps`, `words[j].style.caps`,
  `captionSegments[k].wordStyles/lineStyles[*].caps`. Converted data has `words[j].orig` /
  `captionSegments[k].wordOrig` instead.
- Scratchpad drivers (`…/f73fa197…/scratchpad`): `d.js` + `open-clip.js` (from s261), `fx-setup.js`
  (fixture with Fega's own examples on rejected Clip 8 and alpha.6-shaped flags on rejected Clip 9;
  `--restore` puts the dev profile back), `aa.js` / `rowaa.js` (press an AA switch by its title /
  row index, then print every surface), `state-cap.js` / `state-sub.js` (text box, chips, card,
  switch states, preview text), `disk.js` (what autosave wrote), `patchlib.js` in `%TEMP%`
  (CRLF-safe multi-anchor patcher that asserts every anchor before writing).
