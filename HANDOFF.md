# HANDOFF — Session 183 (2026-08-22)

## Current State
**#291 shipped and 0.4.0-alpha.3 is cut and published.** The queue's YouTube card
now shows and edits tags; the code is on master in `36f3f5f`, the version bump in
`2bd292d`. The feed at `https://engine.flowve.app/updates/alpha.yml` reads
`0.4.0-alpha.3`, so **every installed copy offers the update on next launch** —
desktop and laptop both. alpha.2's files were pruned from the feed by the publish
script, as always.

This was a one-issue session: Fega spotted the gap in the alpha.2 build the moment
he opened the queue — #285 had given tags a home in Captions & Descriptions and
wired them into the publish call, but the queue's YouTube card still showed only
Title, Privacy and Description.

**Awaiting Fega's in-app pass:** #291 (left OPEN on purpose, commented not closed),
plus everything still open from before — #284, #285, #286, #263/#269, #270, #271,
#275, #276, #278, #279, #280, #281, #282, #283.

**#285 still has the leg nobody has tested:** a real YouTube publish with tags
attached. Set tags on a game, publish one Short manually and one on a schedule,
then check the Tags field on the live videos. Until that passes, **the
comma-separated keyword wall stays in the description templates** — it is still
the only keyword signal on the channel. #291 does not change that; it only moves
where tags can be edited.

## What Was Built

### #291 — the queue's YouTube card had no tags field
`resolveTags()` (`QueueView.js:322`) already read the per-game list at both publish
call sites (`QueueView.js:1375` publish-now, `QueueView.js:1690` scheduled), but the
card rendered Title → Privacy → Description and stopped. So the last screen before a
clip goes public couldn't show what tags were attached, and a one-off clip needing
different tags meant editing the whole game's setting in Captions and reverting it
afterwards.

**A Tags block now sits directly under the description** (Fega's placement call —
the plan had it between Privacy and Description; see Key Decisions). It shows the
resolved list as chips with a live `N/500` count. Clicking opens a comma-separated
editor that writes `clip.youtubeTags`:

- `resolveTags` prefers the array when present, so **both publish paths pick an
  override up for free** and an untouched clip publishes byte-identically to before.
- An **empty array is a real answer** (tags stripped from this one clip); only a
  missing/non-array value falls through to the game.
- Saving a list identical to the game's **clears** the override — the same trick
  `saveCaptionOverride` uses for descriptions.
- Over the 500-char budget the save is **refused**, the editor stays open with the
  text intact, and the count goes red with the overage. The alternative is a failure
  at the very end of a render.
- An override badges the block **CUSTOM** and adds **Reset to game tags**.

**Copy buttons in three places** — the queue block, a game's row in Captions &
Descriptions, and inside that game's editor. All copy `tag, tag, tag` (the format
both editors parse back) and flip to a tick. Hidden when there's nothing to copy.

**One set of rules, two editors:** `parseTags` / `tagsLength` / `TAGS_MAX` moved out
of CaptionsView into `src/renderer/utils/ytTags.js`. A shared `CopyIconButton` went
into `src/renderer/components/shared.js`.

### 0.4.0-alpha.3 cut and published
`npm run build` → `dist/Corva Setup 0.4.0-alpha.3.exe` (190 MB) →
`scripts/publish-update.ps1`. Live feed verified with `curl`.

## Key Decisions

- **Per-clip override, not just a read-only display.** The description and the
  YouTube title both already have per-clip escape hatches; tags being the one field
  you had to leave the queue to change was the actual complaint.
- **`clip.youtubeTags` needs no main-process change.** `projects.updateClip`
  (`src/main/projects.js:255`) merges arbitrary fields into the clip, so the field
  persists to the project JSON as-is. Nothing in the IPC layer was touched.
- **Over-limit refuses rather than truncates.** Silently dropping tags to fit would
  publish a list the user never wrote. Refusing keeps their text and tells them the
  overage.
- **Placement came from Fega, not from me.** The plan put Tags between Privacy and
  Description; he moved it under the description and asked for the copy buttons in
  the same breath. Lesson captured in `tasks/lessons.md` and routed to the
  `feedback_ui_density_aesthetic` memory.
- **Counting rules shared, not copied.** The 500-char budget counts the tags, the
  separating commas, and two extra for any tag containing a space (the API quotes
  those). Two implementations of that would have drifted.

## Next Steps

1. **Fega verifies #291 on alpha.3** — Settings → bottom should read v0.4.0-alpha.3.
   Then queue a clip and look under the description.
2. **The untested #285 leg: a real publish with tags.** Manual + scheduled, then
   read the Tags field on the live videos. This is the last thing standing between
   the channel and dropping the keyword wall from descriptions.
3. **The eleven hand-written description templates still carry a literal schedule
   line** (#286 shipped `{schedule}`, but existing templates need the one-time
   swap). One editing pass in Captions & Descriptions.
4. **The rest of the untested backlog** — #263/#269, #270, #271, #275, #276, #278,
   #279, #280, #281, #282, #283, #284, #286 are all sitting on shipped code awaiting
   his pass.

## Watch Out For

- **A game with no tags shows "No tags — click to add" and publishes an empty list**
  — exactly as it did before. Fega's real games have no tags saved yet; the only
  game that had any during testing was Valorant, and that was fixture data I
  removed. The empty card is correct, not a bug.
- **`youtubeTags: null` is the "follow the game" state**, written by Reset. Don't
  "clean up" the null key — `Array.isArray` is what distinguishes it from `[]`,
  which means "this clip publishes with no tags at all".
- **Editing tags on a clip does not touch the game's list**, and vice versa. If a
  clip looks stale after changing the game's tags, check for a CUSTOM badge — an
  override is doing exactly what it should.
- **The chips are read-only.** There's no per-chip delete; the whole list is edited
  as text. Deliberate — it keeps one parsing path shared with Captions.

## Logs/Debugging

- **Verification ran against a throwaway fixture, not real data.** Dev profile
  (`CLIPFLOW_PROFILE=dev`) was pointed at a scratchpad projects root holding two
  fabricated approved clips, with a fake YouTube account written into
  `%APPDATA%\clipflow-dev\clipflow-tokens.json` so the card would render. Both dev
  stores were backed up first and **restored afterwards** — the dev profile is back
  on the real `projectsRoot` with zero accounts. Nothing real was touched and the
  publish path was never reachable.
- **Launching the built renderer on the dev profile:**
  `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`. `isDev` is
  hardcoded `false` (`main.js:633`), so this loads `build/` — no Vite needed, and it
  sidesteps the daily driver's single-instance lock. Confirm the profile from the
  first log line (`logsDir: ...\clipflow-dev\logs`), not from the window title.
- **A clip only reaches the queue with `renderStatus: "rendered"`** — `App.js:735`
  filters on that exact string before `QueueView` ever sees it. A fixture clip with
  `renderStatus: "done"` and `status: "approved"` renders nowhere and looks like a
  bug in the view.
- **CDP probes need a tick before reading the DOM.** `element.click()` followed by
  an immediate `querySelector` misses React's re-render; every probe this session
  wrapped the click in an async IIFE with a ~400 ms wait. The earlier
  `innerText`-is-rendered-text trap (s179) still applies — the block's label reads
  `TAGS`, uppercase, because of `textTransform`.
- **`taskkill //IM electron.exe //F`** — double slashes in Git Bash, and never
  suppress its output (s174).
- **Heredocs with apostrophes fail in this shell.** A `cat > file <<'EOF'` block
  containing `YouTube's` aborted with "unexpected EOF while looking for matching
  quote" and wrote nothing. Multi-line JSX/JS insertions went through `Write` to a
  scratchpad `.js` file run with `node` instead.
