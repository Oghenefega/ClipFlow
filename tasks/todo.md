# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## ✅ BUILT (session 181) — colour picker recents + vivid palette (#283)

**APPROVED by Fega 2026-08-21** off the HTML mock, with one change: Recent holds
**16** colours (two rows of 8), not 8.

**Problem.** The 40-swatch quick grid has no pure red, green, blue or yellow, but
does have 7 greys, 6 muddy olives and one exact duplicate (`#f87171` twice). Fega
has to open the gradient for almost every colour.

**Change.**
1. New `src/renderer/editor/utils/recentColors.js` — renderer-only ESM. Holds
   `PALETTE_COLORS` + `getRecentColors()` / `pushRecentColor(hex)` backed by
   `localStorage["clipflow-editor-recent-colors"]` (same pattern as the drawer
   width at `RightPanelNew.js:2409`). Cap 8, newest first, lowercase dedupe.
2. `RightPanelNew.js` — delete the local `PALETTE_COLORS` (line 36), import it;
   render a **Recent** row above the palette; hide row + label when empty; write
   the recent entry in `onOpenChange` when the popover *closes* (one entry per
   picking session, so gradient drags don't flood the list).
3. `PreviewPanelNew.js` — `InlineColorPicker` (line 195) drops its own 18-swatch
   `SWATCHES` list, uses the same shared palette + the same Recent row, so both
   editor pickers behave identically and share one history.
4. Palette cut 40 → 24 (3 × 8): row 1 neutrals + true primaries/secondaries,
   row 2 vivids, row 3 pops + three dark tones for stroke/shadow.

**Not touched.** `ColorPicker` in `components/shared.js:301` (game-tag accents)
and `FOLDER_COLORS` in `views/ProjectsView.js:1104` — different job, tidy already.

**Verified** in the built app via CDP against the dev profile, on a pending
(unapproved, unrendered) clip — no rejected clips existed in any open project.
Empty state: 24 swatches, 8 cols, pure red/green/blue/yellow present, no Recent
row, popover 318px (old palette was 372px). Pick → close writes one entry;
nothing is written while open. A 25-move gradient drag added exactly one entry.
Re-picking an existing recent moves it to front without duplicating. Seeded 16 +
a 17th pick stays at 16 with the oldest dropped, rendered as 2 rows (437px).
Recents survived a full app restart. The preview-canvas picker showed the same
Recent list written from the Subtitles panel. Clip 3's colours confirmed back to
`#ffffff` on disk afterwards; test recents cleared.

**One bug found and fixed during verification:** the canvas picker's swatch click
calls `onChange` + `onClose` in the same handler, so the component unmounted
before re-rendering and the unmount cleanup still saw the pre-click colour — the
pick was never recorded. The swatch now writes its own value directly; the
unmount path still covers the colour-input and hex-field cases.

**Verify steps were.** `npm run build:renderer` + `npm start`; on a *rejected* clip: (a) pure
red/green/blue/yellow present and one click away, (b) pick a colour off the
gradient → close → reopen: it's first in Recent, (c) a full gradient drag adds
exactly one entry, (d) restart the app → Recent survives, (e) preview-canvas
toolbar picker shows the same Recent list, (f) no console errors.

---

## ✅ BUILT (session 180) — Tracker redesign #281 + drag-to-reschedule #282

**APPROVED by Fega 2026-08-21.** Header trim confirmed (the duplicate
`NOW PLAYING <game>` stays out of the page header). One addition to #282:
**dragging a clip to the edge of the calendar flips the week** — left edge back,
right edge forward — so clips can be moved across weeks without a Queue trip.

**Status: on master, both issues E2E-verified through CDP against the live dev
app on an isolated throwaway project (never a real scheduled clip).** Verified:
only the 3 scheduled clips carried `draggable=true` and all 8 posted entries did
not; an in-week move wrote the new `scheduledAt` to disk; a past slot refused the
drop; holding the right edge for 1.5s walked Aug 17 → Aug 24 → Aug 31 and a drop
landed the clip on Sep 7 in the project JSON, with the Queue tab then showing
"Mon, Sep 7 at 12:30 PM"; past weeks stayed read-only (0 open slots, no Edit
slots); the no-art fallback (Just Chatting) filled the poster with its tag block;
no error boundary. Layout measured at 1280×860 — 71px of slack, no scrollbar
(the pre-change layout had 101px, so the redesign costs 30px). Dev profile
settings restored to their real projectsRoot afterwards. Riding the next
installer — Fega's in-app pass pending (`status: untested`).

**One bug found and fixed during verification:** the edge-travel timer kept
flipping weeks forever if `dragover` stopped arriving (cursor dragged outside the
window). It now stops after 1200ms of silence. A second hazard was designed
around up front: the dragged card unmounts when the week flips, so `dragend`
never reaches the document — cleanup also listens for `mousemove`, which the OS
suppresses for the whole duration of a native drag.

**Goal (plain language):** the Tracker tab gets the same premium look as the
redesigned Projects tab, its cluttered header row gets untangled, and you can
drag a scheduled clip onto another time slot to move when it posts.

**Mock:** `tasks/mocks/tracker-redesign.html` (opened in your browser). It's
interactive — hover the Now Playing card, drag the dashed yellow Friday cards
onto open slots.

### Step 1 — #281 Layout + premium pass (one file: `src/renderer/views/TrackerView.js`)

| Your complaint | What changes |
|---|---|
| Week switcher too high | `‹ Aug 17 – Aug 22 ›` moves out of the page header (TrackerView.js:645-652) and becomes the week-log card's own header row, directly above the day columns. "This week" chip rides with it. |
| Legend crammed in the header | Auto-posted / Manual / Scheduled (TrackerView.js:922-936) moves to a new footer strip at the bottom-left of the week-log card. The hint text goes bottom-right. |
| Game art too small, two redundant pills | Now Playing card becomes an album-cover card: poster full-bleed on the left edge at ~92px wide by full card height (up from 54x72), `Bronze I` pill and `12 posted this week` pill deleted, game name at 21px, `Switch` becomes a hover-reveal pill in the top-right corner. |
| Doesn't feel premium like Projects | All three top cards + the week log adopt the Projects visual language: game-hue radial+linear wash and `${color}3d` border on Now Playing, the subtle top-highlight panel on Goal/Rank, poster vignette, hover-lift. |

Open question for Fega: the page header still says `NOW PLAYING Rocket League`
right above a card that says the same thing bigger. The mock removes it — say
the word and it comes back.

### Step 2 — #282 Drag a scheduled clip to reschedule

- Files: `src/renderer/views/TrackerView.js` (drag handlers on the week-log
  cards + slots), `src/renderer/App.js` (pass `onRescheduleClip`, wired to the
  existing `handleUpdateClipFields`, App.js:662-671).
- Draggable: scheduled clips only (yellow dashed). Posted clips — auto or
  manual — never pick up; the post already went out.
- Drop targets: open `+` slots in the week on screen whose time is still in the
  future. Past slots refuse the drop (a past `scheduledAt` fires the publish on
  the scheduler's next tick).
- On drop: `scheduledAt` rewritten and saved to the project JSON, card moves,
  vacated position becomes an open slot again, toast confirms.
- **Cross-week (added on approval):** holding the drag near the left or right
  edge of the calendar flips the week — ~550ms dwell before the first flip, then
  it keeps going about every 800ms so you can travel several weeks in one drag.
  The edge zones are visual only, so Mon/Sat slots underneath stay droppable.
  Drag payload lives in a ref (the source card unmounts when the week flips).

### Verification (before I call either one done)

1. `npm run build:renderer` + `npm start`, Tracker tab open.
2. Screenshot at 1280x860 and at your window size — top row + stakes bar + full
   week log fit with no scrolling, no wrapped lines in any of the three cards.
3. Week arrows still work; popovers/game picker/slot editor still close on
   navigation; past and future weeks still render their frozen/preview states.
4. Now Playing card verified with real Steam art AND with a game that has none
   (tag-on-colour fallback must still show).
5. Drag one scheduled clip to a new slot → Queue tab shows the new time →
   restart the app → new time survived (proves the disk write).
6. Confirm a posted clip can't be dragged and a past slot refuses a drop.

---

## 📋 PLANNED (session 177) — Batch #270–#273 (awaiting approval)

**Goal (plain language):** the four editor/audio asks from 2026-08-20 — style
individual caption words (#270), make the audio-track wizard legible and
professional (#271), balance mic vs game volume per clip (#272), and let music
ramp volume over a clip (#273).

**Order APPROVED by Fega (2026-08-20): #271 → #270 → #272 → #273** (~4 sessions).
- #271 first: smallest, mock-first anyway (Fega review roundtrip), and its
  custom track names feed #272's mixer labels.
- #270 second: Fega's first ask, fully independent, biggest single issue.
- #272 before #273: they share a mixing mechanism; #272 builds it.
- Mock round 1 (`tasks/mocks/audio-wizard-redesign.html`): Fega picked
  **Variant C** ("track stuff should feel like it exists on an editor") and
  asked for the video to be shown + a visualizer per track. Mock round 2
  (`tasks/mocks/audio-wizard-redesign-v2.html`): editor-style track stack —
  video anchor, real waveform lane per track, sweeping playhead, lane click =
  solo. Awaiting his sign-off on v2, then implement #271.

### ✅ #270 — Per-word caption styling — BUILT (session 178)

**Status: on master, E2E-verified via CDP against the live dev app on a
rejected clip (word card + color/font/size/glow through the real UI, preview
override with untouched siblings, karaoke keep-custom-style, save → disk →
reopen persistence, caption chips + POSITIVITY case, full render with
frame-extraction proof of both surfaces). Test clip restored byte-identical
from snapshot. Riding the next installer — Fega's in-app pass pending
(`status: untested`).** Karaoke decision (approved): a custom-styled word keeps
its look at all times; the highlight sweep never recolors it. One extra fix
shipped: the resolver's word normalization (resolveSubtitles.js primaryRaw)
whitelisted fields and silently dropped `style` on every reopen — caught
because the E2E loop tested reopen, not just first-save.

Original plan (approved 2026-08-20):

**Goal (plain language):** pick a word in a subtitle or in the hook text and give
just that word its own color, glow, shadow, font, or size — the rest of the line
stays untouched, and the exported clip looks exactly like the preview.

**How it fits the existing machinery (all paths verified in code):**
- Subtitles already render word-by-word (karaoke) in BOTH the preview
  (`PreviewOverlays.js`) and the export burn-in (`overlay-renderer.js`), driven by
  the same shared style engine. Word objects survive text edits, split, merge,
  trim, save, and the render payload with extra fields intact (verified: every
  hop spreads the whole word object). So a style saved ON the word object flows
  everywhere for free.
- Hook text (captions) renders as ONE flat text block in all three places
  (editor preview, Projects tab, burn-in). Those get upgraded to word-by-word
  spans; unstyled words inherit the block's look (CSS inheritance), so
  existing captions render pixel-identical.

**Data model (additive, no migration needed — old clips simply lack the fields):**
- Subtitle word: optional `style` object on the word entry
  (`editSegments[].words[n].style`), holding any subset of the line-style keys
  (color, fontFamily, fontSize, glow*, shadow*). Render = line config with the
  word's overrides laid on top, fed through the SAME engine builders.
- Caption segment: optional `wordStyles: { [wordIndex]: styleObj }`. On caption
  text edits, indexes remap by matching word text; unmatched overrides drop.
- Single-word text edit keeps the style; replacing one word with several drops
  it (new words). Undo covers style changes (same undo stacks as today).

**UI (dense, in the existing right-panel Settings sub-tabs):**
- Subtitles tab: a compact "Selected word" card appears when a word is clicked
  in the transcript (the existing #217 selection). Controls: color, font, size,
  glow (toggle+color), shadow (toggle+color), Reset word.
- Captions tab: the caption text renders as clickable word chips under the text
  box; clicking a chip shows the same "Selected word" card (shared component).
- Transcript words carrying a style get a subtle marker so styled words are findable.

**File impact:** `subtitleStyleEngine.js` (merge helper), `PreviewOverlays.js`
(subtitle word merge + caption word spans), `PreviewPanelNew.js` (caption display
uses shared word-span renderer), `public/subtitle-overlay/overlay-renderer.js`
(burn-in mirror of both), `useSubtitleStore.js` + `useCaptionStore.js` (style
actions + caption word selection), `RightPanelNew.js` (Selected-word card +
caption chips), `SegmentRow.js` (styled-word marker). No changes needed to
renderPayload/timeMapping/preloads (verified they already carry the data).

**Verification criteria:**
1. Style a word in karaoke subs (color+size+font+glow) → only that word changes,
   preview matches at multiple playhead times.
2. Style the big word in a hook caption → only it changes; other captions untouched.
3. Render/export → extracted frames match preview styling (FFmpeg frame probe).
4. Close + reopen clip → styles persist. Split/merge the segment → style follows the word.
5. Projects tab preview shows the same styling.
6. Existing clips with no overrides render byte-identical (frame-skip signatures untouched — overrides are static per word).

**Out of scope (per issue):** per-letter sizing = stretch goal, parked as a
follow-up; does not block word-level shipping.

### ✅ #271 — Audio wizard redesign — BUILT (session 177)

**Status: on master, E2E-verified via CDP against the live dev app (21/21
checks: gate mount, lanes/waveforms, playhead sweep, solo continuity, pill
renames, custom-name flow, mic gate, cancel path, save sanitization, Settings
pickers showing "Track 4 — Spotify"). Riding the next installer. Fega's
in-app pass: Settings → Recalibrate — that path also exercises the prefill,
which automation couldn't reach (native file dialog).**

E2E discovery: real OBS tracks measure ~-31 dBFS max — raw peaks rendered
every lane flat. Lanes now normalize per track (genuinely-silent floor
~-60 dBFS stays flat) and the helper text steers quiet lanes to "Try another
part" instead of Empty (Fega's mic was silent in the first sample window —
"flat = Empty" would have mislabeled it).

Exploration verdict: **all renames are display-text only — persisted values
are raw keys (`voice`/`game`/…), zero migration risk.** Custom names and the
new Browser option DO touch the main process: any new value must be added to
the `AUDIO_CAL_LABELS` allow-list (`main.js:1501`) or saves silently strip it.
Labels surface in exactly 3 places (modal + two hand-duplicated `LABEL_TEXT`
maps in `SettingsView.js:1099/:1159`); render/export never reads labels.

Files: `src/renderer/components/AudioCalibrationModal.js` (labels 17–25,
progress dots 210–234, finish 115–122), `src/main/main.js` (:1501 allow-list,
:1527–1542 save handler, :334 schema comment), `src/renderer/views/SettingsView.js`
(:1099/:1159 LABEL_TEXT maps).

Steps:
1. ✅ Variant picked: C evolved into **editor-style v2** (video anchor +
   waveform lane per track + sweeping playhead + lane click = solo). Mock:
   `tasks/mocks/audio-wizard-redesign-v2.html`. Final sign-off pending.
2. Rename display text: Full Mix, Mic, Game/Desktop, Comms (hint "e.g.
   Discord"), Music stays. Value keys untouched.
3. Add `browser` value: modal pill + `AUDIO_CAL_LABELS` + both LABEL_TEXT maps.
4. "Other" gains an inline name input → track saves as
   `{index, label: "other", customName}`; main handler sanitizes (trim, cap
   length) and persists; Settings pickers + modal progress show customName
   when present.
5. Rebuild layout per v2. Mechanics (all existing plumbing, no new main-side
   code expected): the muted `<video>` already exists
   (`AudioCalibrationModal.js:139` — just small, promote it to anchor);
   per-track 20s samples already extract + cache via
   `audioExtractTrackSample` (`main.js:1510`) — on open, fire it for ALL
   tracks at the current offset in parallel; decode each WAV renderer-side
   with WebAudio `decodeAudioData`, compute ~150-bucket peak envelopes, draw
   one waveform lane per track row; playhead position = playing sample's
   `currentTime` mapped across the lanes; clicking a lane solos that track
   (same audio-element mechanics as today's per-track play). Waveforms are
   per-sample-window; "Try another part" re-extracts + redraws all lanes.
6. Prefill on recalibrate (Fega-approved fix of pre-existing quirk): seed
   `labels` state from the existing audioSetup. SettingsView already holds
   audioSetup in state; the pipeline-gate launch path (`App.js` via
   `audio:calibrationNeeded`) may need the stored setup added to the event
   payload — check at implementation.
7. Mic-required rule untouched (client gate + `main.js:1535` server check).

Verify: build + `npm start` (dev) → Settings → Recalibrate on a multi-track
file: editor-style layout with real waveforms (silent track = flat lane),
playhead sweeps during playback, lane click solos; new labels show, Browser
picks, custom name survives into `clipflow-settings.json → audioSetup` and
displays in both Settings pickers; recalibrate arrives pre-filled with the
previous labels; finishing without a Mic pick still blocked; pre-existing
audioSetup (old shape, no customName) still displays fine.

### #270 — Per-word caption styling

Exploration verdict: karaoke subtitles already render **one span per word**
in BOTH preview (`PreviewOverlays.js:174–217`) and export
(`public/subtitle-overlay/overlay-renderer.js:268–283`) — the override
skeleton exists. The hook text card is the **Caption** system and has ZERO
word-level structure (whole line = one span, no `words[]` on
`captionSegments`) — word splitting must be built there. Preview and export
share the style/shadow math (`subtitleStyleEngine.js` via the overlay
preload) but the word render **loops are hand-duplicated** — every override
lands twice or preview ≠ export.

Design decisions:
- **Override lives inline on the word object** (`word.style = {color, glow…,
  shadow…, fontFamily, fontSize}`) — NOT an index-keyed map. Word indices
  shift on split/merge (#131 fragility); inline rides along with the word.
  Risk to verify early: `resolveClipSubtitles` rebuilds words as
  `{word,start,end,probability}` — override must be carried through the
  resolver or it dies on reload.
- Captions: split text into tokens at render, overrides keyed by token index
  per caption segment. v1 limitation (documented): editing caption text
  shifts styled words. Captions are short + hand-written; acceptable.
- Entry point: existing word selection (`selectedWordInfo`, SegmentRow) — a
  "Style word" affordance wired to it (context-menu action or right-panel
  section; currently ZERO wiring between selection and the style panel).
- Active-karaoke word that also has an override: override color wins.
- Per-letter size: stretch per issue — deferred, does not block.

Files: `PreviewOverlays.js` (both overlays), `public/subtitle-overlay/overlay-renderer.js`
(both render fns + frame-skip signature :323–356), `subtitleStyleEngine.js`
(per-word shadow build from merged config), `SegmentRow.js` (entry point),
`RightPanelNew.js` (controls), `useSubtitleStore.js` (+ `SUB_STYLE_KEYS` for
undo), `useCaptionStore.js`, and the THREE persistence whitelists:
`useEditorStore.js:1114+` (_doSilentSave), `useSubtitleStore.js:296+`
(restoreSavedStyle), `renderPayload.js:52+` (buildRenderPayload).

Verify: style a karaoke word (color+font+size) → only that word changes in
preview; export → identical in rendered clip; same on a caption word; split/
merge around a styled word → style stays on the right word; save → reopen →
re-render → survives; unstyled project renders byte-identical to today.

### #272 — Per-track volume (source recording tracks)

Exploration verdict: **this feature doesn't "adjust" existing mixing — no
per-track path exists at all.** Export uses only the first audio stream
(unindexed `[i:a]` = OBS full mix, `render.js:147`); preview is one `<video>`
element playing the default track; Chromium cannot mix multiple embedded
tracks of one file. The issue's anchor is stale: the Audio panel lists the
music/SFX library, not source tracks — the mixer UI is a new surface.

Architecture (the core proposal):
- **Untouched clips change nothing**: export filtergraph stays byte-identical
  (extend `renderAudioMix.test.js` to prove it).
- When any track level is adjusted, the clip flips to **stem mixing**: export
  maps each labeled non-"mix" track (`[i:a:N]`) through `volume=g`, combined
  with `amix …:normalize=0` (existing #202 pattern) as the new base audio.
  The "Full Mix" track is excluded — otherwise stems double the full mix.
- Preview parity: mute the main `<video>`, play per-track audio via one
  `<audio>` element per stem, synced exactly like `syncAssetAudio` already
  syncs placements. Stems = on-demand FFmpeg extracts of the clip's source
  window only (small files, cached under the project folder).
- v1 range 0–100% (attenuate-only): `<audio>.volume` caps at 1.0; balance is
  achieved by pulling the loud track down. Boost >100% would need WebAudio
  GainNodes — deferred unless Fega asks.
- Persistence: per-clip `trackVolumes: {trackIndex: gain}` via the existing
  `updateClip` merge (issue says levels persist per clip).
- UI: mixer rows with REAL names from audioSetup (incl. #271 custom names);
  home (Audio tab third sub-tab vs right-panel section) decided via a quick
  mock when we get there.

Verify: pull mic to 50% → preview audibly matches exported render; untouched
clip → filtergraph byte-identical (test); levels persist across close/reopen;
clip from a 1-track recording → mixer hidden, nothing breaks.

### #273 — Volume keyframes (placed music/SFX first)

Design:
- `placement.volumeKeyframes = [{t, v}]` (t seconds from placement start,
  sorted; absent/empty = static `volume` exactly as today).
- One shared resolver `resolveVolumeAt(placement, t)` (CJS, next to
  `audioPlacements.js`) — preview's per-frame gain math calls it
  (`PreviewPanelNew.js:1316–1326`), export builds a piecewise-linear
  `volume='…'` expression (eval=frame) from the SAME lerp so preview ≡
  export. Fades keep multiplying on top (existing semantics).
- UI mock-first when we reach it (points on the timeline SoundBlock vs a
  ramp mini-editor in the existing sound-settings popover).
- Source tracks get keyframes by reusing the resolver on #272's track gains —
  follow-up slice, not v1.

Verify: quiet-intro music: 3 points (low → up → down) → ramp audible in
preview, identical in export; no-keyframe placement → filtergraph unchanged
from today (test fixture); interaction usable without explanation (Fega
pass).

---

## ✅ BUILT (session 176) — #263 Auto-detect game per recording

**Status: built and E2E-verified on the dev profile (awaiting Fega's in-app
pass; rides the next installer).** All steps below landed as planned, plus two
discoveries the E2E surfaced:
- **Sampler race (fixed in-session):** a cold PowerShell spawn (1-4s) lost to
  the ~3s stability window on short files — the only sample a quick recording
  ever gets was discarded. `stopSampling` now awaits the in-flight sample.
- **Finished-file guard (fixed in-session):** the boot rescan sampled the
  CURRENT foreground for already-finished files — booting Corva while a linked
  game runs would have mislabeled old unrenamed files (the exact false-positive
  class Fega asked about). Now only a file observed GROWING during the
  stability watch counts as a live recording; finished files go cache → AI.

E2E evidence (dev profile, real PowerShell + real Gemini via gateway): growing
file + probe game in foreground → `DP Day1 Pt1` pre-filled in the Rename row,
stamp `{source: "process"}`; restart with impossible exe → row still DP from
cache, zero re-detection, zero re-sniff; 3 non-gameplay probe files → Gemini
"unknown" → no pre-fill, rows kept normal defaults; `processes:list` IPC
round-trip returns filtered windowed apps. Unit harness: 9/9 (majority rule,
half-is-not-majority, background-game-never-wins, immediate-stop race).

**Fega's in-app check (next installer):** record while a linked game is in
front → Rename row arrives pre-filled; change nothing if right, one click if
wrong. Settings → Edit Game shows "Linked Program" with a running-apps picker.

**Goal (plain language):** a recording made while a known game is running shows
up in the Rename tab with game, day, and part already filled in — rename
becomes one click. Files are still NEVER auto-renamed. Two tiers: watch the
running programs (cheap, reliable) → AI looks at a few frames (fallback for
dragged-in files / anything with no process info).

### What the exploration found (changes the plan)

- **The `exe` data the issue assumed exists is GONE.** #262 wiped the seeded
  games; `gamesDb` defaults `[]` (main.js:234) and the only writer always
  produces `exe: []` (modals.js:121 — `newGameExe` is never set, App.js:129).
  GameEditModal has no exe editor. Tier 1 has zero data until an exe editor +
  running-app picker ships — that UI is now part of this issue.
- One shared main-process handler (`handleWatcherFileAdded` main.js:1012), two
  renderer listeners (RenameView.js:418/:443). Detection slots in as a third,
  highest-priority default branch: **detected > lastRenamedGame > mainGame** —
  day/part math untouched (route through existing `detectForGame`, :653).
- Pending rows are React state only; `ignoreInitial:false` (main.js:1068)
  rescans everything each boot → **detection stamps must persist** (new
  electron-store map, low blast radius vs. premature file_metadata rows).
- **AI fallback is ~80% written**: queue-imports.js:196-257 + the §5 "THE
  GAME" prompt (title-caption-prompt.js:371-382) already do "which game is
  this, constrained to gamesDb, else unknown". Reuse with a game-only variant;
  frames via `extractClipStills` 640px (ffmpeg.js:439). Gate on
  `geminiProvider.isConfigured()` — NOT raw key (ai-pipeline.js:511 gets this
  wrong; don't copy).
- Pre-existing inconsistency: drag-drop imports (RenameView.js:1577) bypass
  the watcher payload AND #267's lastRenamedGame routing.
- `ignoredProcesses` (main.js:235) has never had a consumer — the process
  picker becomes its first.

### Steps

1. **Store**: `detectedGames` map, default `{}` (near main.js:234) —
   `{ [absPath]: { game, source: "process"|"ai", exe?, confidence?, at } }`.
   Migration per pipeline rule. Evict on rename commit (`metadata:create`),
   watcher fileRemoved, and a boot sweep for paths no longer on disk.
2. **Tier 1 (main)**: **foreground-majority rule (Fega, session 176 — a game
   merely running in the background must NOT win).** While the file is being
   written (add-time → waitForStable), sample the FOREGROUND process (PowerShell
   GetForegroundWindow → process name) immediately and every ~30s. At stable:
   a game pre-fills only if its exe held >50% of samples. Whole-recording
   video-watching → browser majority → no stamp → tier 2 judges the actual
   footage. Boot rescan of finished files: store cache first, else tier 2
   (no live sampling possible). No new dependency (child_process + PowerShell).
3. **Payload**: add `detectedGame` to the fileAdded payload (main.js:1050).
4. **Renderer routing**: third branch in BOTH watcher handlers
   (RenameView.js:418-419, :443-444): detected game → `detectForGame(game, …)`.
5. **Settings UI**: exe editor in GameEditModal (modals.js:131+, save payload
   :383): shows the linked program + "pick from running apps" list (new
   `processes:list` IPC filtered by `ignoredProcesses` + system noise). No
   typing exe names — satisfies the "new users don't know exe names"
   constraint for v1.
6. **Tier 2 (AI)**: game-only Gemini prompt; auto-runs for pending files with
   no tier-1 stamp (drag-drop imports + boot-rescanned files), 3-4 stills via
   `extractClipStills`; result arrives via new `gameDetect:result` push event
   (unsubscribe-fn preload variant); row updates ONLY if the user hasn't
   manually changed its game; result cached in `detectedGames` — one AI call
   per file, ever.
7. **Verify (dev profile, my job)**: dev game with exe `notepad.exe`, start
   Notepad, drop a raw-named file in the dev watch folder → row pre-fills
   game/day/part; restart app → stamp survives; drag in a real clip with no
   process info → AI proposes the game.

### Decisions for Fega (asked in chat, session 176)

(a) detected game beats "same as last rename" default — recommend yes;
(b) teach flow v1 = running-app picker in game settings; record-time "was this
<exe>?" chip deferred to a follow-up — recommend yes;
(c) AI sniff auto-runs on imports (well under 1¢/file) — recommend yes;
(d) give drag-drop the same "same game as last rename" default while in here
(pre-existing #267 gap) — recommend yes.

---

## ✅ SHIPPED (session 174) — #264 Rename-aware split with letter parts (subsumes #173 + #174)

**Status: built and headlessly verified end-to-end on the dev profile (awaiting
Fega's in-app pass).** All steps landed as planned. Verification: fabricated
30s + 3min recordings, threshold 1min → Rename All produced `Pt1`, `Pt2`
(whole parent, hidden) + `Pt2a/b/c`; DB rows carry part_number=2 + letters +
lineage; no undoable parent history row; a TRUE relaunch (first attempt
bounced off the single-instance lock — taskkill /IM was being path-mangled by
Git Bash; use `taskkill //IM`) showed zero ghosts while a genuinely-new file
still surfaced, proposing Pt3; the legacy case (raw-named parent + DB row)
stayed out of Pending. Discoveries: filed #266 (silence/scene-aware
boundaries, Fega's preferred end state) and #267 (pre-existing: files detected
after a same-session rename propose Day+1 — the lastRenamedGame override
skips the same-date rule; surfaced as "Day3 Pt3" during verification, correct
after restart). Dev profile fully restored from backups (settings + DB).

**#267 fixed same session on Fega's ask (f685f44):** both watcher handlers now
route the last-renamed-game default through detectForGame — day respects the
same-date rule, part follows the defaulted game. Verified live: rename → same-
day drop proposes Day2 Pt2 (was Day3, reproduced pre-fix), next-day → Day3 Pt1.
Closed #173/#174/#264/#267 with `status: untested` pending Fega's in-app pass;
none of this is in an installer yet (rides the next cut).

**Goal (plain language):** A long recording gets its real name FIRST (e.g.
`2026-08-17 RL Day16 Pt2.mp4`), and only then gets split — children inherit the
parent's full name plus a letter: `Pt2a`, `Pt2b`, `Pt2c`. No more children
renumbering from Pt1 (the #173 collision class), and no more split parents
ghosting back into Pending (#174), because the parent never sits on disk under
a raw OBS name.

### What the trace found (matters for the plan)

- The exists-guard half of #173 already shipped (`fs:renameFile` refuses to
  overwrite, main.js:926). Today a split collision is a *silent skip* — the
  child stays behind as a `_split_0_...mp4` temp file (RenameView.js:1000
  `continue`). Not data loss anymore, but still broken.
- The pending row already knows the correct part slot (`r.part`, computed at
  RenameView.js:685-690 from DB + history + pending) — the split code just
  ignores it and hardcodes 1..N (RenameView.js:963, 980).
- #174 is worse than filed: the watcher rescans everything on every app boot
  (`ignoreInitial: false`, main.js:1037), so a raw-named split parent re-enters
  Pending on EVERY launch, not just once after the split.
- Recordings already hides split parents (status != 'split', main.js:2494), and
  next-part accounting is MAX(part_number) per tag+date (naming-presets.js:238)
  — so keeping children on the parent's part number (Pt2 + letters) makes the
  next same-day file correctly propose Pt3 with zero accounting changes.

### Steps

1. **DB migration v9** (database.js): add `sub_part TEXT` column to
   file_metadata. part_number stays numeric (children share the parent's
   number) so MAX(part_number) accounting is untouched.
2. **Naming engine** (naming-presets.js formatFilename:120): render
   `Pt{N}{letter}` when a sub-part is present. Letters a-z, then aa, ab (a 13h+
   recording at 30-min threshold is the only way past z).
3. **Rework `splitAndRename`** (RenameView.js:918): rename the whole file to
   its final name first — same collision handling as a normal rename, using the
   pending row's own part slot — then split, then name children as parent-name
   + letter. Child DB rows keep parent's part_number + their letter + the
   existing split lineage columns. Parent flips to status 'split' (already
   does) → leaves Pending and Recordings but keeps its proper name on disk.
   Under conditional-part presets (Date+Tag etc.) a split parent always takes a
   part number via the existing collision machinery (today's code also forces
   Pt onto children there, so this is no new behavior).
4. **#174 legacy guard** (main.js handleWatcherFileAdded:993): skip any
   detected file whose path already has a file_metadata row. Covers old
   raw-named split parents already on disk from past sessions.
5. **Teach the three filename parsers the optional letter**
   (file-migration.js:19, reconcile.js:34+37): `Pt(\d+)([a-z]+)?`, storing the
   letter in sub_part on adopt/migrate.
6. **UI touch-ups** (RenameView.js): split preview badge shows the real
   proposed names (`Pt2a 0:00-30:00 ...`); rename-history rows show `Pt2a`.
   `byTagDate` listing order gains `sub_part` as tiebreaker (main.js:2482).

### Explicitly OUT of scope this session

- **Game-switch scrubber split** (RenameView.js:1067) keeps today's naming —
  its children span *different games* with per-tag accounting, a separate
  problem. Letters there would be a follow-up.
- **Drag-and-drop import split** (UploadView.js:794) unchanged — different
  preset and accounting; it renumbers today too (pre-existing, noting it).
- **"Split" action on already-renamed files in Recordings** (issue open
  question 3) — follow-up feature.
- Onboarding copy about OBS auto-split being optional → #265's territory.

### Decisions assumed (objections welcome before approval)

- **Split boundaries stay fixed-interval** (threshold setting, keyframe-snapped
  stream copy — fast, no re-encode). Scene/silence-aware cutting is a
  different, much heavier feature.
- **Parent file stays on disk** after split (hidden in-app, proper name, acts
  as the safety copy). Deleting/archiving can be a later setting.

### Verification (mine, dev profile + scratch watch folder)

- #173 repro from the issue ends correctly: short file → Pt1, long file →
  renamed Pt2 → split into Pt2a/Pt2b; nothing overwritten, no temp files left,
  next same-day file proposes Pt3.
- Parent absent from Pending and Recordings after split; **app relaunch** —
  parent must NOT reappear in Pending (kills #174 including the boot case).
- Planted legacy case: raw-named file WITH an existing DB row → boot → stays
  out of Pending.
- Full build + npm start boot check before wrap.

---

## ✅ SHIPPED (session 171) — Real auto-updates so the laptop stops needing sneakernet

**Status: built and headlessly verified; the one remaining leg is Fega clicking
Install in the banner (install alpha.54 → banner offers .55 → click).**

Outcome vs plan: all steps landed as written, plus discoveries the plan missed —
(1) prerelease versions get a channel manifest named **alpha.yml**, not
latest.yml (packaged app agrees: `channel: alpha` in app-update.yml), and the
publish script auto-detects it; (2) installed alpha.53 has no network updater,
so E2E needed TWO builds: alpha.54 (manual install, the starting point) and
alpha.55 (pure version bump on the feed, the target — every machine ends here);
(3) v26 keeps real filenames (spaces) in the manifest, R2 serves them
URL-encoded, verified 200 + correct Content-Length + Accept-Ranges. Verified
headlessly via packaged win-unpacked on dev profile + CDP: check leg proven in
BOTH directions over the real feed (available:false on matching version, then
available:true → newVersion detected against a temporarily doctored manifest,
then restored and re-proven false). Feed live at
engine.flowve.app/updates/alpha.yml. Original plan below.

**Goal (plain language):** ClipFlow on the laptop notices a new version by itself,
downloads it in the background, and offers a one-click Install. Today the laptop
gets nothing — every update means copying a 192 MB installer over by hand.

### Why this is unblocked now

The infra dashboard's H4 decision parked the updater behind #35, #45 and #46.
All three closed back in sessions 10-13. The gate has been open for a while and
nobody noticed. H4 also left "where do the update files live?" open — R1
(2026-08-14) answered it sideways by putting the AI engine on R2 behind
`engine.flowve.app`, which already does resumable multi-GB downloads with
checksum verification. That is the update feed; it just needs a folder.

### What already exists (verified, session 171)

- `src/renderer/components/UpdateBanner.js` — the whole UI: banner, version
  compare, Install button, Later button, suppressed on the dev profile. Correct
  as written, no redesign needed.
- `src/main/preload.js:42-43` — `checkForUpdate` / `installUpdate` bridge. Fine.
- `src/main/main.js:4463-4506` — the two IPC handlers. **These are the broken
  part**: `update:check` scans a hardcoded `C:\Users\IAmAbsolute\Desktop\ClipFlow\dist`,
  so on the laptop it returns "no update" forever and the banner never renders.
  Filed as #259.

So this is replacing the insides of two handlers, not building a feature from zero.

### Steps

1. **Bump `electron-builder` 24.13.3 → 26** (#54, already scoped as "bundle with
   the updater work"). Its NSIS + publish handling is what the updater rides on.
2. **Add a `publish` block** to `package.json` — generic provider pointed at an
   `/updates/` path on the existing R2 bucket. This makes `npm run build` emit a
   `latest.yml` next to the exe and blockmap. Nothing emits `latest.yml` today.
3. **Add `electron-updater`**, and rewrite the bodies of `update:check` /
   `update:install` to call it. Keep the IPC names identical so preload and the
   banner keep working untouched. Fixes #259 as a side effect.
4. **Small banner change:** electron-updater downloads *before* installing, so the
   banner needs a "Downloading… 40%" state between Install and restart. Today's
   handler just launches a local file instantly.
5. **Release step becomes:** build, then upload 3 files (exe, `.blockmap`,
   `latest.yml`) to R2 under `/updates/`. The `.blockmap` is what lets a small
   change download a few MB instead of the full 192.

### Explicitly NOT doing

- **Code signing (#51).** H4 rejected shipping unsigned, but that reasoning was
  about install conversion for strangers buying the product. For Fega's own two
  machines it means clicking through one SmartScreen warning. Decoupling these
  is the whole reason this can happen now instead of after a 2-6 week cert
  procurement. Revisit before any non-Fega tester installs.
- Beta/stable channels. Single channel, same as H4's "single release channel at
  launch".

### Verification criteria

- Build alpha.54, upload to R2. The **desktop** running alpha.53 shows the banner
  within a launch, downloads, installs, and relaunches reporting 0.3.0-alpha.54.
- The download is visibly smaller than 192 MB (proves the blockmap diff works).
- Same test on the **laptop** — a genuinely different machine, which is the
  actual point.
- `npm run dev` still shows no banner (dev profile suppression intact).
- Cancel/"Later" path leaves the app in a clean state.

### Open question for Fega

Reuse `engine.flowve.app/updates/`, or set up a separate `updates.flowve.app`?
**Recommendation: reuse `engine.flowve.app`** — bucket, DNS and Cloudflare config
already exist and are proven. A second subdomain is extra setup for no benefit
today, and it can be split later without changing app code beyond one URL.

### Dashboard correction needed

Infra dashboard H4 records hosting as "will be on clipflow.app". That domain
belongs to a third party (#255). Section 9 needs updating to R2/flowve.app per R1
before this lands — flagging rather than silently diverging.

### Related issues

#250 (beta distribution — the closest match), #19, #50 (updater research),
#54 (electron-builder bump), #51 (code signing, deliberately deferred),
#259 (hardcoded dist path, fixed by step 3).

---

## ✅ SHIPPED (session 169) — #146 session 2 of 3: engines on Cloudflare + in-app "Set up ClipFlow's AI engine" flow

All parts landed and E2E-verified on the dev profile 2026-08-15: real R2 download
(engine.flowve.app), kill-mid-download → resume → checksum pass, unpack, probe
verify, model pre-download (real 1.6 GB fetch observed), "done" screen, banner
clear, and a real 40-segment transcription through the freshly downloaded
engine. Regression: pinned-D:\ profile never sees the screen. One bug found
live and fixed: the overlay closed early once whisperPythonPath was set
(pre-model phase) because an unstable parent callback re-fired the state probe
— fixed with active-job reporting in getState + a callback ref in the view.
Session 3 (laptop clean-machine E2E + failure modes) remains. Original plan below.

### Original plan (session 168+1)

**Goal:** a fresh install with no Python can click through one screen and end with
working transcription. Fega's machines (D:\ venv pinned by the #251 migration)
never see the screen.

### Part A — Put the engines on Cloudflare R2

**Fega does (one-time, ~5 min in the Cloudflare dashboard, guided click-by-click):**
1. Create bucket `clipflow-engine` on the ClipFlow business account (same account
   as the #249 gateway).
2. Enable the bucket's r2.dev public URL ("Allow public access"). clipflow.app's
   DNS is on GoDaddy, not Cloudflare, so a downloads.clipflow.app custom domain
   isn't possible today — r2.dev is fine for this arc + session 3; a pre-beta
   "move to custom domain" issue gets filed.
3. Create an R2 API token (Object Read & Write, scoped to the bucket) and save
   Account ID + Access Key ID + Secret to `C:\Users\IAmAbsolute\.claude\r2_credentials.txt`
   (same pattern as github_token.txt — Claude never sees the dashboard secret page).

**Claude does:**
4. Install rclone (winget) and configure it against the R2 S3 endpoint from the
   credentials file. (2.73 GB needs multipart — wrangler caps out at ~300 MB.)
5. New `scripts/publish-runtime.ps1`: builds a combined `manifest.json` from the
   two per-variant manifests (adds `url` + `unpackedBytes` per variant), uploads
   both zips + manifest to `engine/v1.0.0/` + `engine/manifest.json`, prints the
   public URLs. Repeatable for future engine versions.
6. Verify hosting for real: re-download the CPU zip from the public URL and hash
   it (must match manifest sha256); confirm Range requests work (resume support);
   fetch manifest.json.

### Part B — In-app "Setting up ClipFlow's AI engine" flow

**B0 — Mockup checkpoint (before any UI code):** HTML mockup of the setup screen
(all phases: detect result → confirm w/ size + CPU-speed warning → downloading
w/ progress/speed/ETA → unpacking → verifying → model download → done → error/retry)
in `tasks/mocks/engine-setup.html`, opened in Fega's browser. Fega picks/adjusts,
THEN it gets built. (ui-density rule: mock aesthetic-sensitive UI first.)

**New files:**
- `src/main/setup-runtime.js` — the whole engine-install brain:
  - GPU probe: spawn `nvidia-smi` (PATH, then System32 fallback) → cuda|cpu variant
  - fetch `engine/manifest.json` from R2
  - disk preflight on the userData drive: zip + unpackedBytes + ~1.6 GB model + margin
  - download to `userData\runtime\.download\<file>.part` with Range resume,
    streamed SHA-256, progress events throttled ~250 ms (mirrors the
    `import:progress` pattern, main.js:1710-1740)
  - unpack via `%SystemRoot%\System32\tar.exe -xf` (bsdtar reads zips; proven in
    build-runtime.ps1; zero new npm deps) into `userData\runtime\.staging` →
    rename to `userData\runtime\python-<variant>-v<ver>\` (atomic-ish), delete zip
  - verify via existing `whisper.checkWhisper()` probe (imports stable_whisper+torch,
    reports CUDA) → `store.set("whisperPythonPath", <new python.exe>)`
  - model pre-download: spawn the new runtime's python on new `tools/download_model.py`
  - cancel keeps the .part for resume; every phase has a typed error for the UI
- `tools/download_model.py` — downloads the configured whisper model (default
  large-v3-turbo) into HF_HOME, printing the same `PROGRESS n msg` lines
  transcribe.py prints (rides the existing tools/ extraResources glob)
- `src/renderer/components/EngineSetupView.js` — full-screen overlay, same slot +
  pattern as OnboardingView (App.js:1119-1123, fixed inset-0, T tokens, DM Sans);
  built from the approved mockup; "Set up later" escape → DependencyBanner remains
  the way back in

**Modified files:**
- `src/main/main.js` — IPC: `setup:getState` (needed? variant? sizes), `setup:start`,
  `setup:cancel`; `setup:progress` push events. Store: record installed engine
  `{variant, version}` (additive default + migration-safe)
- `src/main/preload.js` — bridge the four channels (pattern: preload.js:198-203)
- `src/main/deps-check.js` — whisper-python issue's `fix` text → "Finish Setup"
  (kill the Beta Tester Manual pointer, which never resolved to anything)
- `src/main/ai/transcription/stable-ts.js` — PYTHON_SETUP_ERROR → point at Finish
  Setup instead of Settings-path-plus-manual
- `src/main/ai-pipeline.js` (~:659) — the inlined duplicate of that error text, same repoint
- `src/renderer/components/DependencyBanner.js` — "Finish Setup" button on the
  whisper-python issue → opens the setup screen
- `src/renderer/App.js` — mount EngineSetupView after onboarding
  (onboardingComplete !== false), gated on `setup:getState.needed`

**Gate (must not fight #251 migrations):** setup is offered ONLY when
`whisperPythonPath` is empty or points at a missing file — checked AFTER boot
migrations run, so Fega's D:\ pin wins and his machines never see the screen.

### Verification (all on this machine, dev profile)
1. `scripts/publish-runtime.ps1` re-run is a no-op-safe overwrite; public-URL CPU-zip
   hash matches manifest.
2. Dev profile with `whisperPythonPath` cleared → full E2E: screen appears →
   downloads REAL zip from R2 → unpack → probe passes → model pre-downloads →
   a real clip transcribes through the new runtime.
3. Resume: kill mid-download, relaunch, download continues from the .part.
4. Regression: prod-like profile with D:\ venv present → screen never appears,
   banner unchanged, pipeline untouched.
5. `npm run build` + `npm start` visual pass (non-negotiable).
6. Session 3 (laptop clean-machine E2E + failure modes: offline mid-download,
   disk full, AMD GPU, corrupt unpack) stays scoped OUT of this session.

---

## ✅ SHIPPED (session 166) — alpha.48 installed & Fega-confirmed ("All the changes are here")

Two asks from Fega (2026-08-13): real game art on the Projects-tab tiles, and
a transparent taskbar icon (no navy plate). Both built per the plan below and
verified live on the dev profile (boot sweep fetched 6 posters incl. delisted
Rocket League; tiles render art with letters-fallback for artless games; Edit
Game modal art section works). Icon rebuilt from the transparent master —
all 9 sizes, transparent corners, assets swapped in repo.

Fega then picked card Variant A + circles from the layout mock — built, CDP-
verified (counts 1px off a shared right edge on 8 rows, hover via forced
pseudo-state), and shipped in the same alpha.48 cut. Still open (non-blocking):
which Prince of Persia he plays (Steam matched the 2008 one), and a Valorant
poster file — both solvable via Settings → Edit Game → Choose image.

### A. Transparent app icon (small fix, do first)

**Root cause:** `make-app-ico.py` (in `ClipFlow stuff\Logo\`) builds the
9-size ICO from `clipflow-mark-tile-1024.png` — the dark-plate tile version.
The transparent master `clipflow-mark-1024.png` sits unused beside it.
`public/icon.png` is also the tile version (feeds favicon + builder fallback).

**Fix:**
1. `make-app-ico.py`: SOURCE → `clipflow-mark-1024.png`; rerun; copy the
   output to repo `public/icon.ico`. Update the Logo README note.
2. Swap `public/icon.png` to the transparent 1024 master for consistency.
3. Reaches the taskbar only via a new installer → rides the alpha.48 cut at
   session end (batched with item B, per the batch-versions rule).

**Verify:** open the new .ico frames (16–256 all present, transparent
corners), `npm run build`, install, taskbar shows the bare mark — no plate.

### B. Game art on Projects-tab tiles (feature)

**Source of art (recommended):** Steam's public store search + CDN poster
(`library_600x900` capsule — same 2:3 shape as the 44×58 tile). One-time
fetch per game, cached at `<userData>\game-art\<tag>.jpg`. Art is keyed by
game tag on disk — NO gamesDb schema change, no migration. Manual
"Choose image…" override in Settings covers non-Steam games (Valorant).
No AI generation — real key art or nothing.

**File impact:**
- `src/main/main.js` — `games:fetchArt` (Steam storesearch → appid →
  download capsule → cache), `games:setArt` (copy a user-picked file in),
  `games:listArt` (tag → file path map). Fetch fails soft (offline/not
  found → tile keeps letters).
- `src/main/preload.js` — the three bridges.
- `src/renderer/views/ProjectsView.js` — poster tile shows the art image
  (cover, existing dark-bottom overlay kept) when art exists; letters
  remain the fallback. Card gradients/borders untouched.
- `src/renderer/views/SettingsView.js` — per-game art controls in the games
  editor: fetch/refresh, choose file, clear.

**Steps:**
1. HTML mock of the tile with real posters (RL/AR/EO/DD) → open in browser
   for Fega's eyeball before any code.
2. Build main-process fetch/cache + bridges.
3. Wire ProjectsView tile + Settings controls.
4. Build + `npm start`, verify all seven gamesDb games: Steam hits get art,
   Valorant falls back to letters until manually set.

**Verify criteria:** tiles show real posters for Steam games with no layout
shift; missing art degrades to today's letters; art survives restart
(cached); manual override works; offline start does not error.

### End of session
- CHANGELOG entries for both, cut alpha.48 (icon + tile art in one
  installer), Fega installs — folds into the pending alpha.47 checks
  (#248 script, #219 rename check, #244 live shakedown).

---

## ✅ BUILT (session 163) — #244 loud scheduled-publish failures (+ #163 folded in) — machine-verified end-to-end, ships with the tester installer

Built exactly per the approved plan below; both issues closed `status: untested`
(Fega sees it live on the next installer — the recurring weekly YouTube death
is the natural real-world test). Verification notes: fabricated dead YouTube
account on the dev profile produced a REAL `invalid_grant` from Google through
both the pre-flight and publish paths; 15/15 CDP assertions passed (two probe
bugs fixed along the way — the status filter DOES hide the scheduled clip, its
title was matching in the hidden Tracker pane; the Settings badge renders fine
once the collapsed PUBLISHING group is expanded). Gotcha for future harnesses:
`safeStorage` keys live per-profile in "Local State" — seed scripts must
`app.setPath("userData", ...clipflow-dev)` BEFORE `app.whenReady()` or the app
decrypts seeded tokens to "".

Fega's ratified choices (2026-08-12): retry via Queue button only · fold #163 in ·
notifications on failures only (no success pings).

### The three layers, in plain language

1. **Warning BEFORE the slot.** Up to an hour before each scheduled post, ClipFlow
   quietly tests every enabled account's connection. If one is dead (like the
   YouTube weekly death), a Windows notification fires — "YouTube needs
   reconnecting before your 2:30 PM post" — and the account gets an amber
   "Needs reconnect" badge in Settings.
2. **Loud failure AT the slot.** If a scheduled post still fails on any platform,
   a Windows notification fires AND a banner appears across the top of the app
   that stays until dismissed. (Manual publishes don't notify — you're watching
   those. The #248 pill pulse already covers both.)
3. **One-click recovery.** A "Retry all failed" button in the Queue header
   re-publishes every failed clip. The banner's "Review" button jumps to the
   Queue filtered to failed clips.

Folded #163: the four token-refresh error paths stop saying "Bad Request" and
say "YouTube connection expired — reconnect the account in Settings, then
retry" (per platform), and mark the account with the same badge flag.

### How it works (liveness-verified paths)

- The scheduler tick (QueueView.js:848, fires every 60s on every tab because
  QueueView stays mounted — App.js:824 `display:none` panes) gains a pre-flight
  sweep: clips due within 60 min → new `publish:preflight` IPC → main tests each
  enabled account. One warning per account per slot (ref-tracked, no re-nag
  every minute).
- Pre-flight "test" = the same token refresh the publish handler would do
  (YouTube main.js:4158, TikTok 3713 — their access tokens expire
  hourly/daily so refresh is the natural liveness probe; success updates stored
  tokens, failure = dead). **Meta/IG long-lived tokens (~60 days) are only
  refreshed when near expiry — Meta pre-flight is usually a no-op by design;
  its rarer death modes get caught at post time by layer 2.**
- OS notifications: new generic `system:notify` handler in main using
  Electron's `Notification` (none exists in the app today — grep confirmed).
  `app.setAppUserModelId("com.clipflow.app")` added for Windows toasts; in dev
  they attribute to "Electron", correct branding arrives with the installer.
  Clicking a toast focuses the app window.
- Failure detection at post time stays renderer-side: the scheduler tick already
  awaits `publishClip` and the per-platform results land in `publishStatus` —
  after each scheduled fire, failures raise one toast per clip + set app-level
  banner state in App.js. A `scheduled: true` flag threads publishClip → the four
  platform IPC payloads → `logBase` so the publish log records which attempts
  were scheduled ones.
- `needsReconnect` flag lives on token-store account entries: set by pre-flight
  and by publish-time `invalid_grant` (#163 blocks), cleared by
  `updateTokens` on any successful refresh; reconnecting rebuilds the entry
  from scratch (token-store.js:72) so it auto-clears. New optional field read
  falsy-safe — no migration needed (same pattern as main.js:276).
- "Retry all failed": header button in Queue iterating clips with
  `publishStatus[id].state === "failed"` → existing `retryFailed`
  (QueueView.js:1228) sequentially. Failed states hydrate from disk on restart
  (QueueView.js:760-791), so it works after an app restart too.

### Files

- `src/main/main.js` — `system:notify` + `publish:preflight` handlers,
  setAppUserModelId, #163 friendly errors + flag in 4 refresh blocks,
  `scheduled` flag into logBase
- `src/main/token-store.js` — `needsReconnect` (set/clear/expose in
  getAccountsForUI)
- `src/main/preload.js` — `systemNotify`, `publishPreflight` bridges
- `src/renderer/views/QueueView.js` — pre-flight sweep in tick, post-failure
  toast + banner raise, `scheduled` threading, Retry-all-failed button
- `src/renderer/App.js` — persistent failure banner (state + render + Review →
  Queue)
- `src/renderer/views/SettingsView.js` — "Needs reconnect" badge on account
  cards

### Verification (dev profile only — nothing can reach a real platform)

- Fabricate a dead account in the DEV token store (garbage refresh token, fake
  id) so refresh fails with invalid_grant and no upload can ever start. Real
  prod tokens untouched.
- Layer 1: clip scheduled ~30 min out with the dead account enabled → next tick
  → toast + Settings badge + friendly error text. (60-min window means it fires
  on the first tick — no waiting.)
- Layer 2: clip scheduled 1 min out → tick fires → publish fails at refresh →
  toast + persistent banner + publish-log entry carries `scheduled: true` +
  existing #248 pill pulses.
- Layer 3: Retry-all button hits every failed clip; banner Review lands on
  Queue filtered to failed. CDP checks for badge/banner/button states.
- Regression: manual publish failure produces NO toast/banner (pill pulse only);
  build + `npm start` boot-verify.

### What Fega does after

Nothing until the tester installer — these paths then get a live shakedown when
the next real weekly YouTube death happens (or at the next scheduled slot).

---

## ✅ BUILT (session 162) — #248 beta feedback reporter — code complete + CDP-verified + live Sentry round-trip; awaiting Fega's 6-step script

Shipped per the locked spec (`tasks/specs/beta-feedback-reporter.md`) and the
Fega-approved mock (`tasks/mocks/feedback-bubble.html`): variant-B labeled
pill, right edge, rotating prompts advancing on tab switch (no idle rotate),
tuck-to-peel + vertical drag (both persist via `feedbackBubble` store key),
Problem/Idea/Feedback toggle with mock-verbatim adaptive copy,
point-at-the-problem with cropped `capturePage` snapshot, Sentry-backed
transport. NOT yet in an installer — next cut picks it up.

### What was actually built (deviations from plan noted)

1. NEW `src/renderer/components/FeedbackBubble.js` — the whole feature UI
   (pill/peel/panel/pick mode/submit). Mounted at App root, overlays every tab.
2. NEW `src/main/feedback-report.js` — planned name `feedback.js` was TAKEN
   (clip-feedback DB). Log tail (200 lines), context assembly, zoom-corrected
   `capturePage` crop (window zoom runs up to 1.35 — rects must scale).
3. DEVIATION: the Sentry event is captured RENDERER-side
   (`Sentry.captureFeedback` from `@sentry/electron/renderer`), not in a main
   `feedback:submit` handler — renderer envelopes ride the SDK's IPC bridge
   into main's transport, which is `makeElectronOfflineTransport()` by default
   (verified sdk.js:79), so offline queueing came free. Main supplies only
   `feedback:context` + `feedback:snapshot` via IPC.
4. DEVIATION (found live): Sentry's feedback schema DROPS event breadcrumbs
   server-side — the last ~20 attach as `recent-activity.txt` instead
   (Problem reports only; Idea/Feedback consent promises "nothing else").
   Gotcha (cost two failed attempts): the renderer scope NEVER holds the
   trail — the SDK's ScopeToMain integration forwards every renderer
   breadcrumb over IPC and clears it locally; main's handleScope adds them to
   main's CURRENT scope. The trail is read main-side in feedback-report.js
   (`recentBreadcrumbs()`, isolation + current merged) and returned through
   `feedback:context`.
5. Error pulse: `publish-log.js setFailureNotifier` (status "failed" only) +
   `pipeline:generateClips` result.error → `feedback:appError` event → pulse
   3× + "Something just went wrong?" + next open preselects Problem.
6. Settings masking: `data-secret` on all 11 key-display spans in
   SettingsView + `cf-snapshot-mask` body class during Settings captures
   blurs those spans + all inputs/textareas (globals.css).
7. `nav()` in App.js adds a `ui.tab` Sentry breadcrumb beside the existing
   PostHog capture. STORE_DEFAULTS gains `feedbackBubble` (new key, no
   migration needed).

### Verification record (2026-08-11, dev-profile build + CDP)

- 47/47 automated checks: pill/prompt/rotation/preselect, adaptive copy per
  category, Esc paths, pick mode (crosshair class, hint, hover highlight,
  snap-to-parent identity, panel return), snapshot preview, send success
  beat + form reset, tuck/peel/restore + store persistence, drag (clamp
  14..innerHeight-80, suppressed click, persistence), panel flip-below on a
  high pill, `feedback:context` shape (tail only when requested).
- Live Sentry round-trip: feedback event landed with tags category/view/
  appVersion/deviceId, release `clipflow@0.3.0-alpha.45`, message carrying
  pointed-at identity; attachments verified byte-real (valid PNG 112×69 =
  rect+margin ×1.35 zoom ×1.25 DPR w/ edge clamp; 27KB genuine log tail).
- Masking: `blur(7px)` computed style confirmed under the mask class.
- NOT machine-verified: the error pulse end-to-end (needs a real pipeline/
  publish failure — wiring is traced; next real failure demos it) and true
  offline queueing (Fega's script step 4).

---

## ✅ BUILT (session 160) — #249 Option A token posture — alpha.45 cut + inspected; issue OPEN pending Fega's nod + auto-recharge check

Goal: a tester's install talks to AI out of the box (shared gateway token
preset in the build), every gateway call carries a usage label (the existing
PostHog install ID) so Fega can tell testers apart in Cloudflare's logs, and
the packaged installer is re-inspected against the RESTATED done-means: no
raw provider keys; the bundled gateway token is a deliberate, revocable,
spend-capped inclusion — NOT a leak.

Note: #249 had been auto-closed by the session-159 wrap commit message
("Session 159 close: #249 ..." matched GitHub's close keyword). Reopened at
session start.

### File impact

1. `src/main/ai/llm-provider.js` — new `gatewayMetadataHeader()`: returns
   `{"deviceId": "<store deviceId>"}` as a JSON string (null if unset). One
   shared source so both providers label identically.
2. `src/main/ai/providers/anthropic.js` — gateway config gains the metadata
   string; `anthropicRequest` sends `cf-aig-metadata` whenever the call is
   routed through the gateway. Direct calls untouched.
3. `src/main/ai/providers/gemini.js` — `resolveRouting` adds `cf-aig-metadata`
   to `authHeaders` in the gateway branch only. Covers generateContent +
   Files start/poll/delete. The Google-issued byte-upload URL stays direct
   and unlabeled (per spec — must not be rewritten).
4. `src/main/main.js` — `STORE_DEFAULTS.gatewayAuthToken` becomes the shared
   beta token (today: ""). Comment states the restated done-means so no
   future session "fixes" it as a leak. No migration needed: no shape change;
   installs that explicitly cleared the token keep their "" (electron-store
   file values win over defaults).
   **PIVOT (mid-session): the token value lives OUTSIDE git.** GitHub push
   protection (correctly) rejected a committed live Cloudflare token. Instead
   of allowlisting the secret, the token follows the vendor/ffmpeg pattern:
   git-ignored `vendor/beta-token.json`, shipped via extraResources as
   `resources/beta-token.json`, read at boot by
   `app-paths.js bundledGatewayToken()` as the store default. Missing file →
   "" → raw-key fallback, so fresh clones still run. Same zero-setup install,
   no secret in git history. Build machines cutting installers need the file
   (same class of prerequisite as vendor/ffmpeg).
5. `src/renderer/views/SettingsView.js` — AnalyticsToggle card grows an
   "Install ID" row: the deviceId, read-only, monospace, with a copy button
   (✓ feedback). This is the ID a tester reads out so Fega can map ID→person.

### Verification

- Existing suites green: ai-prompt, game-profiles, gemini-watch, signals,
  segmentWords, trackerCalendarModel.
- Live harness over the REAL provider modules (stub store, gateway base +
  token, fake deviceId): Anthropic call and Gemini call both HTTP 200 WITH
  the cf-aig-metadata header attached — proves Cloudflare accepts the label.
- Renderer build + dev-profile boot: Settings shows the Install ID row.
- Bump to alpha.45, `npm run build`, then byte-scan `app.asar` + the Setup
  exe: zero `sk-ant-`/`AIza` hits, zero raw-key values from Fega's store,
  gateway token PRESENT by design.
- Comment the verification record on #249. Fega's remaining manual check
  (from Wick's decision): auto-recharge OFF on both provider billing pages.

---

## ✅ SHIPPED (session 159) — #251: ClipFlow runs on a machine that isn't Fega's — alpha.44 installed, Fega-confirmed, issue CLOSED

Fega installed alpha.44 (2026-08-11) and ran a full pipeline on RL Day10 Pt3
end-to-end: no settings re-entry, no model re-download (prod log: hfHome
pinned to D:\whisper\hf_cache on first boot; other two migrations no-op'd
as designed — both explicitly set in his store), bundled FFmpeg n7.1.5
carried the whole run. #251 closed; #68 closed earlier + untested label
removed. Remaining: tester #1 = true clean-machine proof; #146 = the
commercial-launch Python-bundling gate.

Approved by Fega 2026-08-11 ("go", Q1 yes = watchFolder default emptied,
Q2 = leave UPDATE_DIST_DIR, noted on #250). All items below implemented.
Verified: all 4 runnable test suites green (62+15+14+weights, plus editor
29+19); packaged build inspected — resources/ffmpeg/{ffmpeg,ffprobe}.exe
present, tools/energy_scorer.py ships, zero __pycache__; three live dev-boots
via CDP: (1) banner shows Whisper-only issue + hfHome migration log line,
(2) clean-machine sim (stripped PATH, vendor hidden, store keys removed) shows
both banner issues + watchFolder rescue fires, (3) healthy boot shows NO
banner, whisperPythonPath migration fires, and the running app's ffmpegCheck
reports the BUNDLED n7.1.5 build. Prod store peeked read-only: python path
explicitly set (safe), hfHome absent (will pin on next launch). One accepted
deviation: `grep D:\ src/` shows exactly one hit — the migration's own
legacy-path detector constant in main.js (mandated by the migrate-at-boot
trap; noted on #251). A fourth migration (whisperPythonPath pin) was added
beyond the plan after discovering the dev profile relied on the deleted
code fallback — same pattern, protects "no settings re-entry".

Goal: a tester installs ClipFlow and it either works or tells them plainly
what to install — no more silent assumptions that Fega's D: drive, W: drive,
or PATH setup exists. Fega's own install keeps working with zero re-setup.

### Already done (step 0, committed `7f4f1f7`, pushed)

`tools/energy_scorer.py` rescued into the repo — it lived only on D:\whisper
with no version history and did not ship. Audit result: every OTHER script the
pipeline runs was already in the repo (transcribe.py, signals/*.py, yamnet
model + class map). One stray file on D:\whisper (`check_ebur128.py`) is never
referenced by ClipFlow — left alone.

### File impact

1. `package.json` — (a) `extraResources`: filter out `__pycache__` from the
   `tools` entry (stops shipping Fega's local .pyc files); (b) new entry
   `vendor/ffmpeg → ffmpeg` shipping `ffmpeg.exe` + `ffprobe.exe` + license.
2. `.gitignore` + new `scripts/fetch-ffmpeg.ps1` — the two exes are ~130 MB
   each (GitHub rejects files over 100 MB), so they stay OUT of git in a
   `vendor/ffmpeg/` folder; the script downloads a pinned BtbN GPL build
   (includes NVENC, which the render path needs) and unpacks the two exes.
   Run once per machine that builds installers.
3. `src/main/ffmpeg.js` — resolve `FFMPEG_BIN` / `FFPROBE_BIN` once at load:
   bundled copy if present (packaged → `resources/ffmpeg/`, source →
   `vendor/ffmpeg/`), otherwise the bare name (PATH fallback). Same guarded
   electron require pattern signals.js uses. Export both. Replace all 16
   bare-name call sites in this file.
4. Bare-name call sites in other files → use the exported constants:
   `ai-pipeline.js:365`, `gemini-watch.js:118`, `render.js:18/615/811`,
   `subtitle-overlay-renderer.js:39/64`. (The issue listed ffmpeg.js,
   ai-pipeline, gemini-watch "and more" — render.js and
   subtitle-overlay-renderer.js are the "more".)
5. **Python children also get the bundled FFmpeg.** `energy_scorer.py` and
   WhisperX's audio loader call `ffmpeg`/`ffprobe` by bare name from inside
   Python. Every Python spawn (energy scorer, transcribe, signals) gets the
   bundled ffmpeg folder prepended to its child `PATH` env — no script edits
   needed, and on Fega's machine behavior is unchanged if the bundle is
   missing (PATH still has his install).
6. `src/main/ai-pipeline.js:177` — energy_scorer.py resolves exactly like
   transcribe.py does (packaged → `resources/tools/`, source → repo `tools/`).
   The D:\ constant dies.
7. `src/main/main.js` (migration, written FIRST per pipeline rule) — at boot:
   if `hfHome` is unset AND `D:\whisper\hf_cache` exists on this machine,
   write it into settings. Same pattern as #249's gatewayUrl migration.
   Protects Fega's multi-GB model cache from a re-download.
8. hfHome fallback at `ai-pipeline.js:602`, `stable-ts.js:116/219`,
   `main.js:1823` — one shared helper returning
   `store.get("hfHome") || <userData>\hf_cache` (per-user app-data). D:\ gone.
9. `src/main/ai-pipeline.js:638` — whisperPythonPath loses the D:\ fallback
   entirely. Unset or nonexistent → plain error: what's missing, where to fix
   it (Settings → point at your Whisper Python), where the setup guide is.
   Same plain-language fix for stable-ts.js:84's "Python not found at: null".
10. First-run dependency check — new small module `src/main/deps-check.js`:
    checks FFmpeg (bundled or PATH), Whisper Python (set + exists), bundled
    scripts present. Returns a plain-language list: what's missing + what to
    do. Wired in twice: (a) app launch → if anything is missing, the renderer
    shows a clear panel before the tester invests any time, with "Check
    again"; (b) pipeline start → same check, refuses early with the same
    friendly message instead of dying mid-run at stage 4.

### Open questions for Fega (found in audit, outside the six D:\ paths)

- **Q1** `main.js:186` — fresh installs default the watch folder to your
  `W:\...Vertical Recordings Onwards`. A tester's app would watch a folder
  that doesn't exist. Recommend: default to empty, first-run/Settings picks
  it. Your install is unaffected (your value is already saved). Fix in this
  pass?
- **Q2** `main.js:4165` — the update notifier looks for new installers in
  `C:\Users\IAmAbsolute\Desktop\ClipFlow\dist`. Harmless for testers (finds
  nothing) but it's a you-machine path. That's #250's territory — I'd leave
  it and note it on #250. OK?

### Out of scope (per issue)

Bundling Python / whisper.cpp (separate commercial-launch gate — I'll file
that issue when implementation starts), #249 gaps, #199 track fix, detection
quality. Installer cut (alpha.44) only on Fega's go after verification.

### Verification

- `grep -rn "D:\\" src/` → zero results.
- Existing test files pass; `npm run build` clean.
- Packaged listing shows `tools/energy_scorer.py`, `ffmpeg/ffmpeg.exe`,
  `ffmpeg/ffprobe.exe`, and NO `__pycache__` (checked via asar/resources
  listing, not globs).
- Dev-profile boot: migration writes hfHome on this machine (log line), full
  pipeline stages resolve bundled paths.
- Simulated clean machine: whisperPythonPath pointed at a nonexistent path +
  ffmpeg removed → launch shows the plain first-run message, pipeline refuses
  early. (True clean-machine proof = tester #1.)
- Fega (after alpha.44, on his go): install, one full pipeline run on a real
  recording — no settings re-entry, no model re-download.

---

## ✅ BUILT (session 158) — #249 gap 1: Gemini routed through the Cloudflare gateway — VERIFIED LIVE, ships with next installer

Approved by Fega 2026-08-08 ("go", Gemini status dot fix included). All five
files changed as planned. Verified: 13/13 harness checks — live BYOK text +
54MB video (full Files API path) with the Gemini key BLANK, Anthropic 200 on
both old- and new-shape URLs, migration proven on the real dev store at boot
(`Migrated gatewayUrl to gateway base`), existing tests green (14+62+15+
weights), renderer build clean, dev boot clean. Harness: session scratchpad
`verify-249.js`. Issue #249 stays open (gaps 2–4 + packaged-installer
inspection remain).

Goal: title generation (Gemini) stops needing a raw Google key on the machine.
The gateway side is done and live-proven (see #249's 2026-08-08 comment — the
spec). This session is the app-code half only. Beta installers must ship with
zero raw AI provider keys; detection (Anthropic) already routes this way.

### File impact

1. `src/main/ai/providers/gemini.js` — route generate + file-upload start +
   poll + delete through the gateway, mirroring anthropic.js. Gateway token
   present → send `cf-aig-authorization`, no Google key (Cloudflare injects
   it, credential named `default`, no alias headers). Key becomes optional
   when a gateway token exists (mirror anthropic.js:171). Recognize
   Cloudflare's array-shaped gateway errors in `fetchJson` (mirror
   anthropic.js:95-98). Byte-upload step (gemini.js:106) stays pointed at
   Google — per spec, its URL carries its own authorization.
   Export an `isConfigured()` helper: "raw key OR gateway token" for gates.
2. `src/main/ai/providers/anthropic.js` — stored gatewayUrl becomes the BASE;
   this file appends `/anthropic` itself and strips a trailing `/anthropic`
   from old-style stored values first. Old and new values produce identical
   routes (trap: detection must not change behavior).
3. `src/main/main.js` — (a) default gatewayUrl at :245 loses the `/anthropic`
   tail; (b) migration in `runStoreMigrations` strips the tail from existing
   installs (hard rule: stored-data change ⇒ migration; idempotent, fresh
   installs skip); (c) titlegen gate at :2870 uses `isConfigured()` instead
   of key-only — without this a keyless install silently falls back to
   stills and the gateway is never exercised (gate not in the issue's anchor
   list; discovered during research).
4. `src/main/queue-imports.js:198` — same gate fix for #240 import titles
   (identical key-only check).
5. `src/renderer/views/SettingsView.js` — placeholder/hint wording only:
   Gateway URL example drops `/anthropic` (:1232), token hint stops saying
   "call Anthropic directly" (:1237, :1240).

Not touched: gaps 2–4 of #249, byte-upload URL, prompts, #235 watch gate
(ai-pipeline.js:497 still wants a raw key; feature is hard-gated OFF — flagged
in chat, not changed).

Open question for Fega: Settings shows Gemini "Not set" (red) when the key box
is empty even though titles will now work via gateway — fix dot or leave?

### Verification criteria

- Live BYOK call through real provider code with Gemini key BLANK (dev copy):
  one text call + one >14MB video call (full 3-step upload path) return titles.
- Live Anthropic regression call through changed code with the OLD-style
  stored URL: HTTP 200, same route as before.
- Migration run against a copy of real settings: URL cleaned, nothing else.
- `npm run build` clean + boot verify (dev profile). Existing bare-node tests
  still pass.

---

## ✅ BUILT (sessions 155–156) — #246 auto-research + play style, #245 wiring — ALL STEPS DONE; cell PASSED; awaiting Fega sign-off, ships with next installer (alpha.41+)

Approved direction from Fega 2026-08-06 chat: auto-research on add, play-style
as an extra Add Game step (skippable), evidence-based re-ask ("here's what
we've noticed"), backfill the unresearched games. Execution order below is
deliberate: the #245 wire only ships through a #234 ablation cell (spec
`tasks/specs/detection-input-science.md`, "decisions locked" — replay scores,
not vibes), and the cell needs the backfill first because the six harness
recordings are RL/EO/DD games, none of which currently have research text.

### Step 1 — Backfill research for the 7 unresearched games — ✅ DONE 2026-08-06

Ran with app closed, settings backed up first
(`%APPDATA%\clipflow\clipflow-settings.backup-2026-08-06.json` — keep until the
new build is verified). All 7 games researched via the app's exact prompt +
model (claude-opus-4-6 + web search, through the CF gateway): RL 1,017 chars ·
Val 1,084 · EO 1,334 · DD 1,002 · PoP 1,294 · SCoG 975 · MC 1,122. Spot-checked
EO/MC/SCoG — accurate, no hallucination (Yolk Mode, paint-yourself prop hunt,
downhill carts all real). Citation-fragment line breaks flattened to prose.
Just Chatting excluded (content type). Script + per-game cache in session
scratchpad `backfill-research.js` / `research-cache.json` — the in-app sweep
(Step 3) reuses nothing from it; it exists for any future re-run.

- Fega decision (2026-08-06): AddGameModal step-2 copy change APPROVED
  ("handle it now") — implement with Step 3a.

### Step 2 — #245 wire + ablation cell (gated ship) — ✅ DONE 2026-08-06 s156

Cell `gc245` PASSED the gate: recall 28/29 (miss = ANKLES BROKEN midpoint
knife-edge, 1/3 hit across 3 samples — same rate as #238 Cell C), rej-hit flat
47%. Boundary coverage 86% vs shipped-A's 93% (single runs; flagged in #234 as
the post-ship watch metric — watch bad-cut chips). Cap lives in
buildSystemPrompt so harness measures shipped code; 2 cap tests added (62/62
green). Full tables in #234 comment; wire ships ON pending Fega sign-off.

Code: [ai-pipeline.js:734](src/main/ai-pipeline.js) reads `aiContextAuto`
(dead `aiContext` retired), injection capped ~1,500 chars (Pico Park's 8.4k
outlier must not eat prompt budget; approved/rejected sections cap at 3,000).
Harness: add `--no-gamecontext` flag (mirrors `--no-playstyle`) so the cell is
single-factor on shipped code.

Cell: six standard recordings, 1 run each, `+gamecontext` vs the post-#238
rebaseline (26/29 recall / 47% rej-hit / 87% coverage). ~$0.60-0.80.
- Recall holds, precision not worse → wire ships ON in the next installer.
- Recall/precision degrade → wire lands behind a setting default OFF, #245
  updated with the measured verdict, research stays editor-titles-only.
- Either way: results posted to #234, Fega signs off before the installer.

### Step 3 — #246 UI (all renderer) — ✅ DONE 2026-08-06 s156

All three built + step-2 honest copy. CDP-drove both wizard flows on the dev
profile: play-style Save landed in BOTH stores (profile got real gameName via
ensureProfile), Skip left no profile entry, research auto-landed for both games
in 10–15s with the toast, old fake "Generating..." copy gone. NOT live-driven:
the first-draft ProfileDiffModal reframe (needs a real pipeline run on an
empty-profile game — verify next time one fires naturally).

a. **Auto-research on add** — App.js ([AddGameModal mount :1046](src/renderer/App.js)):
   after a game is confirmed, fire `anthropicResearchGame` in the background;
   on success persist `aiContextAuto`/`aiResearchedAt`. No API key → skip
   silently (Edit-modal hint already covers it). Toast on completion.
b. **Play-style step in Add Game wizard** ([modals.js:6-98](src/renderer/components/modals.js)):
   new step after the details form — "How do you play this game?" textarea,
   prominent **Skip for now**, Save. Save writes BOTH `aiContextUser` (editor
   titles) and `game_profiles.json` playStyle via `ensureProfile` +
   `updatePlayStyle` (pipeline reads this one) — the two stores stop diverging.
c. **Evidence-based re-ask** — existing #192 threshold machinery unchanged
   (5 runs + ≥5 kept datapoints). Change: when the current profile is EMPTY,
   the Play Style Update card reframes as *"How do you play X? Here's what
   we've noticed — confirm or tweak"* (accept/edit instead of compose-from-
   scratch). Accepting writes both stores (same helper as b). Card component:
   ProfileDiffModal ([modals.js:297+](src/renderer/components/modals.js)); its
   caller located at implementation.
- Note for Fega: AddGameModal step 2 today is a cosmetic 2-second
  "Generating..." wait ([modals.js:75](src/renderer/components/modals.js) —
  `setTimeout(() => setStep(3), 2000)`, no real work). With auto-research now
  real, proposal: keep the flow speed but make the copy honest ("Researching in
  background — you can keep working"). Flag if you want it different.

### Step 4 — Batch + verify — ✅ DONE 2026-08-06 s156

Build green; dev-profile CDP drive covered the exact verification script
(throwaway games Celeste + Stardew Valley, both flows, both stores, research
without button press); dev settings/profiles restored after. CHANGELOG
updated. Rides the next batched installer (alpha.41+) with session 154's
items, after Fega signs off on the gc245 cell.

### Out of scope (parked)

- #163 error message + needsReconnect badge, #244 pre-flight/notifications —
  separate approval.
- Research reaching TITLE/caption prompts beyond current editor path — #85
  Chunk D territory, deliberately deferred (memory: archetype re-introduces
  generic copy).

## ✅ BUILT (session 154) — #242 + #243 + #225 Part A — CDP-verified, awaiting Fega on next installer

Approved and built same session. All three verified live over CDP on the dev
profile (isolated scratch projectsRoot; dev settings restored byte-identical
after). Evidence: scratchpad qa-242-pill.png / qa-243-conflict.png; 16/16
assertions passed across the two drive runs. Batch into the next installer.

Harness traps hit and documented: stale cached `localProjects` fallback masked
the fixture project (session-130 trap — cleared the cache key from seeded dev
settings); Settings "Content Library" group persisted collapsed (expand before
asserting chips); custom Select trigger is a BUTTON inside the root div (click
the button, not the wrapper); an expanded Queue row toggles closed on re-click.

### 1. #242 — Bionic Bay pill bug (root cause confirmed)

Stored color is `hsl(80,80%,55%)` (hue-wheel output, `shared.js:305`); `GamePill`'s
`${color}18`/`${color}44` hex-suffix tint (`shared.js:44`) is invalid CSS for hsl
strings → transparent pill, valid text color. Fix: (a) hue slider converts to hex
before `onChange` (hslToHex helper in shared.js), (b) normalize non-hex gamesDb
colors on load (`App.js:318`) so Bionic Bay self-heals next launch.

- Files: `src/renderer/components/shared.js`, `src/renderer/App.js`
- Verify: dev profile — add a game via hue wheel → pill renders everywhere
  (Settings chip, Queue solid pill); seeded hsl color heals on boot.

### 2. #243 — Queue schedule-conflict warning

Extract `autoSuggestSlot`'s taken-slot builder (`QueueView.js:1162-1204`) into a
helper returning Map `"YYYY-MM-DDTHH:MM"` → occupant label (scheduled clip title
or tracker entry). Schedule picker (`QueueView.js:2387-2404`) looks up the picked
time; on hit shows inline amber warning naming the occupant (same pattern as the
`schedPast` line at :2400). Warn, don't block — Save stays enabled.

- Files: `src/renderer/views/QueueView.js` only
- Verify: dev profile — schedule A at time T, open B's picker at T → warning
  names A; tracker-logged time → warning; free time → nothing; auto-suggest
  unchanged.

### 3. #225 Part A — Tracker CSV readable report (formatting + header-aware import)

Per the locked spec in #225. New layout:
`Date, Day, Time, Title, Game, Type, Scheduled, Source, MainGame, YouTube, TikTok, Instagram, Facebook, PlatformResults`.
Game resolved to display name (`TrackerView.js:359` lookup), Type spelled out
(Main/Variety), Scheduled Yes/No, per-platform URL columns derived from
`platformResults` (never fabricate), JSON blob last. Import becomes header-aware,
accepts BOTH legacy 10-col and new layout; CSV imports earn no XP (locked rule).

**#240 interaction (Fega's question):** no new column needed — `QueueView.js:1441`
already stamps tracker rows `source: "import"` vs `"clipflow"` at publish time.
Part A spells the Source column out: `clipflow` → "ClipFlow", `import` →
"Imported", `manual` → "Manual", `vizard` → "Vizard" (real data: 68/25/5).
Optional 1-line extra if wanted: explicit "Edited with ClipFlow" Yes/No column.

Part B (IG permalink fetch + TikTok post-id chase) deferred — needs a real
publish to verify; ships separately.

- Files: `src/renderer/views/TrackerView.js` only (Part A)
- Verify: export with real tracker data → opens readable in Excel; re-import
  both a legacy CSV and a new CSV → entries land, no XP awarded.

---

## ✅ BUILT (session 153) — #240 Queue imports — code complete, awaiting Fega's 6-step verification

Spec locked: `tasks/specs/queue-imports.md`. Greenlit; this is the working plan.

### Architecture (open coder calls resolved)

1. **Container = synthetic import project per game** (`kind: "import"`, one per
   game, named "Imports — <Game>"). Every `_projectId`-coupled path (queue list,
   auto-fire scheduler, claim, publish, tracker) then works unchanged. Hidden
   from the Projects tab by prop filter.
2. **Skip/imported memory = content fingerprint** (sha1 of size + first/last
   256KB), stored main-side only in electron-store `importMemory`
   `{ [fp]: { status: "imported"|"skipped", at, file } }`. Rename-proof, fast.
3. **Titlegen = one Gemini video call per clip** via new import prompt builders
   in `title-caption-prompt.js` (reuses CLIP_TRUTH/voice/hardRules + titleAnchor;
   candidates list w/ hashtags injected). Output `{ title, game, gameIsNew,
   confidence }`. No caption (imports never get on-screen text; social captions
   come from templates via game assignment — #223 path). No transcript.
   Failure → stripped filename as title, never blocks the batch.
4. **Review grid = full-screen modal** from the Queue tab
   (`ImportReviewModal.js`, T-theme). Rows appear instantly; AI results stream
   in per-row. Bulk game assign, inline new game, per-row platform toggles,
   skip. Unassigned-game rows are held back (not imported, not remembered).

### Import clip shape

`clip_import_<ts>_<rand>` id (prefix = greppable fence), `source: "import"`,
`status: "approved"` at creation (no status transition ever fires),
`renderStatus: "rendered"`, `renderPath` = copy in `ClipFlow Imports\<Game>\`
(sibling of outputFolder), `duration`/`startTime: 0`/`endTime`, `gameTag`,
`thumbnailPath` = `<clipId>_renderthumb.jpg` in project clips dir.

### Fence set (imports NEVER teach)

- `feedback.js:136` — already live (`clip.source === "import"`).
- `QueueView.logPost` — skip `titleCaptionRecordPublish`, tracker row
  `source: "import"`.
- `title-caption-log.js backfill` — skip `clip_import_` ids + import tracker rows.
- Queue title-knockout (`scheduledTitles`) — id-only dedup for imports.
- RowActions editor button + popover copy — no editing path for imports.

### File impact

- NEW `src/main/imports.js` — inspect / generate / cancel / confirm + memory
- NEW `src/renderer/components/ImportReviewModal.js` — review grid
- `src/main/ai/title-caption-prompt.js` — import prompt builders
- `src/main/main.js` — `importMemory` default, register handlers, deps
- `src/main/title-caption-log.js` — backfill fence
- `src/main/preload.js` — `queueImports*` bridge
- `src/main/projects.js` — `kind` passthrough in create/list
- `src/renderer/views/QueueView.js` — Import button, drop target, modal, fences
- `src/renderer/App.js` — badge knockout parity, `onCreateGame`, ProjectsView filter

### Steps

- [x] 1. Main: queue-imports.js (inspect/fingerprint/thumbs/aspect gate/memory)
- [x] 2. Main: import prompt builders + Gemini generate queue (concurrency 2)
- [x] 3. Main: confirm (copy w/ progress, project find-or-create, clips, memory)
- [x] 4. Fences: backfill + logPost + knockout + RowActions
- [x] 5. Preload bridge + main.js registration
- [x] 6. Renderer: ImportReviewModal + QueueView entry points + App.js wiring
- [x] 7. Verify: renderer build green; dev-profile boot clean (schema v8,
      renderer alive); headless electron harness ALL-PASS — inspect verdicts
      (strip/vertical/unsupported), confirm (copy, original untouched,
      kind:"import" project, fence fields, YT untick, all-on omitted),
      memory (already-imported/already-skipped), wave-2 project reuse,
      listProjects kind+source passthrough
- [x] 8. CHANGELOG + HANDOFF + commit/push + #240 comment

NOT machine-verified (needs the real app / Fega): the review-grid UI flow
end-to-end, the live Gemini title/game pass (no API call was made this
session), and the 6-step script on the real OpusClip folder.

Verification bar = Fega's 6-step script in the spec (his part, on his real
OpusClip folder).

---

## ✅ CLOSED (session 151) — #238 pick-budget scaling + cut-boundary extension — Cell A SHIPPED (`d3a79ee`), B shelved, #238 closed `status: untested`

Fega's verdicts: 1 keep of 4 new-territory picks (EO Day3 17:41 — A-only
territory); 3 NOs all payoff-not-visible-on-screen (new named class).
Ship approved same session; rides next installer with #239.

### Results (2026-08-05, cells $2.32, full tables in #238 comment)

| variant | pooled recall | rej-hit | boundary coverage |
|---|---|---|---|
| baseline (rebase) | 26/29 = 90% | 47% | 87% |
| **A pick-budget** | **29/29 = 100%** | 47% | 93% |
| B cut-boundary | 26/29 = 90% | 51% | 83% |
| C = A+B | 28/29 = 97% | 44% | 94% |

- A rescued ALL THREE baseline misses incl. the never-found EO Day4 17:31.
  Stability: EO Day4 7/7 in 2/2 runs; EO Day3 8/8 in 2/3 (the 6:33 marginal
  improved, not eliminated). Key finding: the fixed budget was CAUSING bad
  edges — A improves boundary coverage with zero boundary language.
- B alone: no recall gain, coverage WORSE (83%) — its language doesn't pull
  weight solo. C ≈ A + noise; C coin-flips ANKLES BROKEN (starts at the
  reaction 0:48, not Fega's 0:19 cause; 1/3 runs hit).
- Both B/C "losses" are midpoint-rule knife-edges on found-but-shifted picks,
  not lost moments.
- A warts to watch: RL Day9 (4-min tail) pick count 7 → 4; one 5s pick on DD
  (violates the 7s min).
- Eyeball: only 4 never-judged picks (rest already verdicted in #235) —
  cut to `Desktop\ClipFlow Eyeball 238-A\`. Several #235 YES keeps
  re-surface in A's picks.

**Next: Fega's 4-clip verdicts + approve shipping A (edit ai-prompt.js:144
for real + update 2 pinned tests + CHANGELOG; rides next batched installer).**

### Fresh post-#239 baseline (f10-mix-rebase, run 2026-08-05, $0.57)

Ground truth grew 26 → 29 pooled approved rows after the #239 backfill
(RL Day8 Pt8 +2, EO Day4 Pt1 +1). New baseline on the six standard
recordings, single run each, current shipped prompt code (frames=10, #237
selection, no gemini):

| recording | recall | rej hits |
|---|---|---|
| EO Day3 Pt2 | 7/8 | 4/14 |
| RL Day8 Pt8 | 4/4 (both backfill rows hit) | 10/14 |
| RL Day9 Pt1 | 4/4 | 2/7 |
| EO Day4 Pt1 | 5/7 (new 9:24 row hit) | 8/15 |
| RL Day10 Pt1 | 1/1 | 8/15 |
| DD Day2 Pt1 | 5/5 | 5/14 |
| **pooled** | **26/29 = 90%** | **37/79 = 47%** |

The three missed rows, characterized against the old f10-mix run:
- **EO Day4 17:31→18:11** — STABLE miss (old run missed it too; the old
  25/26 gap). Nearest pick 18:48.
- **EO Day3 6:33→7:12** — rotating tail-budget marginal; THE row that was
  systematically displaced in f10-gemInt. Now coin-flips even without
  gemini. Nearest pick 25s away, same signature.
- **EO Day4 26:13→26:52** — rotating marginal (old run caught it 26:38).

Pick counts: 14-15 on every 20-30-min recording (7 on the 4-min RL Day9)
— the model self-caps near 15 despite the prompt allowing 10-20. This IS
the fixed-budget mechanism #238 names.

### Cells (single-factor each; six recordings; compare pooled vs 26/29 / 47%)

- **Cell A — pick-budget scaling** (~$0.60): rewrite the count constraint
  (ai-prompt.js:144) to scale with recording length: "aim for roughly one
  clip per 90 seconds of recording, minimum 10, maximum 25" + explicit
  "do not stop at 14-15 out of habit" push. Nothing else changes.
  Pass: recall ≥ 26/29 with the two rotating marginals expected back;
  watch rej-hit drift (more picks = more rejected hits is acceptable —
  Fega is the precision filter — but log it).
- **Cell B — cut-boundary extension** (~$0.60): rewrite CLIP BOUNDARY
  RULES 2-4 (ai-prompt.js:117-125): start at the CAUSE (the jump before
  the fall, the shot before the goal), end after the PAYOFF completes
  (finish the sentence/punchline, extend to natural speech boundary),
  plus a one-moment-one-clip anti-split rule (RL9 2:36+3:06 class).
  Pass: recall holds ≥ baseline; secondary metric = boundary coverage
  (per-hit overlap fraction + start/end deltas vs approved rows, computed
  post-hoc from result JSONs — no harness change); Fega eyeballs
  new-territory picks as proxy cuts.
- **Cell C — A+B combined** (~$0.60): only if A and B each hold recall.
- **Stretch — f10-gemInt re-run on the winner** (~$0.60, gemini events
  cached): the named re-earn path for the gemini watch slot. Pass:
  pooled ≥ 26/29 with the signal ON (it scored 22/26-equiv pre-#238).

Noise protocol: any contested delta on EO Day3 Pt2 gets 2 extra runs on
that recording only (~$0.12 each), per session-149 precedent.

Mechanics: each cell is a temporary edit to src/main/ai-prompt.js →
six harness runs → revert. Results JSONs committed under cell labels
(a25-scale / bCut / abComb / gemInt-238). The WINNING change ships as
real code only after Fega's sign-off + ai-prompt.test.js green (60
tests; count/boundary tests updated to match). Watch prompt v2-actor
stays frozen. Total program ≈ $2.40-3.00.

### Fega's part

1. Approve/adjust this plan (cells A, B, C, stretch — or a subset).
2. After the cells: the usual ~2-min eyeball pass on new-territory picks
   (proxy cuts land in a Desktop folder). For Cell B your verdicts on
   the cut edges ARE the success measure the harness can't see.

---

## CLOSED (session 149) — #235 pipeline integration: Gemini full-watch becomes a real detection signal — SHIPPED; cell run; gate 22/26 vs 25/26 (diagnosis: cut-boundary + tail-budget, NOT bad picks); noise-check runs + Fega's gate decision BLOCKED on Anthropic API credits

CLOSED 2026-08-05: integration shipped, cell + noise runs + Fega's 13
verdicts done ($1.51). Cross-check showed every keeper is mix-found too
(post-#237, gemini adds no unique territory on mic-heavy recordings).
**Fega's gate call: default OFF** (geminiWatchEnabled: true re-enables).
Re-earn path filed as #238 (pick-budget scaling + cut-boundary extension).
Quiet-spectacular niche unsampled — re-test when such a recording exists.

Gate cleared by #237 (session 148). Wire the validated Gemini watch (v2-actor
prompt, actor-aware spectator-drop, raw-confidence merge) into the real
pipeline, verified by its own harness ablation cell. **Watch prompt is frozen
at v2-actor — no prompt changes this session.** Cut-boundary extension is a
separate future experiment.

### File impact

1. **NEW `src/main/gemini-watch.js`** — prod watch module, lifted from the
   spike: proxy transcode (720p h264 600k + mono aac, NVDEC/NVENC, .tmp-rename
   guard), Files-API upload + long processing poll, one gemini-3.6-flash call
   with the v2-actor SYSTEM prompt VERBATIM, event validation, artifact write
   to `processing/signals/<vid>.visual_events.json` (same schema as spike:
   promptVersion/usage/cost/events). Exports `watchRecording()`,
   `classifyActor()`, `mergeVisualEvents()` (actor classification +
   spectator-drop + raw-score merge + signals_computed append) so the harness
   measures the SAME shipped code. Configurable proxy/out paths so the spike
   CLI can reuse it.
2. **`src/main/ai/providers/gemini.js`** — export `uploadFile`/`deleteFile`;
   `uploadFile` gains an opts param `{uploadTimeoutMs, pollTimeoutMs}`
   defaulting to current values (titlegen path byte-identical). `buildParts`
   accepts a new block `{type: "video_ref", uri, mimeType}` → fileData part
   (video already uploaded; chat() must not re-upload or delete it).
3. **`src/main/ai-pipeline.js`** — kick off `watchRecording()` as a background
   promise right after Stage 0 probe (overlaps transcription/energy/signals →
   adds ~0-3 min wall time instead of ~10-15 sequential); await it just before
   Stage 6 prompt build; merge via `mergeVisualEvents` (player+unclear at raw
   confidence, spectator dropped + logged, actor counts + lines-landed logged
   like the harness). Skip conditions (one log line each): no `geminiApiKey`,
   `store.get("geminiWatchEnabled") === false` (new key, read-with-default —
   no migration needed), or `gameData.isTest`. ANY watch failure → log +
   continue without the signal (never-empty detection). Proxy deleted after
   the watch (success or fail); remote file deleted best-effort. Frames stage
   untouched (gemini_visual reserves no frames — matches every harness cell).
   Progress = detail-text update on the existing analysis stage; NO renderer
   changes.
4. **`src/main/pipeline-logger.js`** — `logApiUsage` accumulates (`+=`) so
   detection + gemini both land in the per-recording cost line (single-call
   callers unchanged; main.js:2768 titlegen logger unaffected).
5. **`tasks/spikes/replay-score/harness.js`** — `--gemini` merge switches to
   requiring `mergeVisualEvents`/`classifyActor` from the prod module (deletes
   the inline copy); keeps its gemini/ dir + merge log output.
6. **`tasks/spikes/replay-score/gemini-watch.js`** — becomes a thin CLI over
   the prod module (electron stub like harness.js), writing to spike gemini/ +
   cached _tmp/proxy — new watches exercise prod transcode/upload/poll code.
7. **NEW `src/main/gemini-watch.test.js`** — classifier tests (actor-first
   phrasing, "opponent's net" possessive regression, unclear fallback) +
   merge tests (spectator dropped, raw scores kept, signals_computed).
   Existing `ai-prompt.test.js` 60 tests stay green.

### Cost per recording (live pipeline, once shipped)

Gemini ≈ $0.005-0.008/min of footage: 16-min ≈ $0.14, 30-min ≈ $0.23,
44-min ≈ $0.22 (measured D2/D3 numbers). Claude detection unchanged ~$0.10.
Total detection ≈ **$0.25-0.35/recording** + a few minutes of local GPU for
the proxy (free, overlapped with transcription).

### Ablation cell + gate (per program rules)

- New v2-actor watches for the 3 standard recordings lacking them (via the
  refactored spike CLI = prod code path): EO Day3 Pt2 (27.5 min ≈ $0.21),
  RL Day8 Pt8 (20.6 min ≈ $0.16), RL Day9 Pt1 re-watch (3.8 min ≈ $0.03;
  v1 gave 0 events — re-checks no-hallucination on v2). ≈ $0.40 Gemini.
- Re-pull truth counts before scoring (Fega reviews shift windows).
- Cell **`f10-gemInt`**: all six standard recordings, 1 run each (≈ $0.60);
  RL Day10 gets 3 runs total (+≈ $0.20) for the #237 knife-edge watch item.
- **Gate:** pooled recall (run1s) holds vs f10-mix 25/26; rejected-hit ~flat.
  If the ONLY miss is RL Day10's 22:14 row → watch item REPRODUCED → decision
  point for Fega (ship as-is vs follow-up mitigation experiment), not a silent
  pass/fail. Mitigation is NOT a watch-prompt tweak (frozen).
- Pooled row into `results/_summary.json`. Session API spend ≈ **$1.20-1.40**.

### Verify

Unit tests green → harness `--dry` sanity → cell runs → dev-profile boot
(`CLIPFLOW_PROFILE=dev npx electron .`) after main-process changes.

### Wrap

Results comment on #235, spec §Step 4 update (+ integration section),
CHANGELOG, commit + push. No installer (batching rule — this joins the
pending batch: #232 v3 chips, frames 10, #236, #237).

### Fega's part

Approve the plan. If the cell surfaces new-territory picks, they ship as
proxy-cut clips in a Desktop folder for the ~2-min eyeball pass (established
delivery). Decision embedded in plan: watch defaults ON whenever a Gemini key
is configured — daily driver starts paying ~$0.15-0.25/recording once this
rides the next installer.

---

## ✅ DONE (session 144) — Detection input science — steps 1-2 complete + first ablations; frames-10 APPROVED by Fega 2026-08-04 (build it: Stage 5 default 20 → 10, keep min(4,10) reservation, 1-2 verification replays)

Fega's ask: make the clip-detection inputs *measurably* useful — sharper rejection
reasons, a numeric way to judge screenshots (not vibes), and explore Gemini
watching full recordings. Plan approved in chat 2026-08-02.

### Step 1 — Rejection reasons v2 (implement now)
- [x] `ProjectsView.js` REJECT_REASON_CHIPS: append 4 chips — Setup / tech talk,
      Chat banter, Flat delivery, Too similar (keys: setup-talk, chat-banter,
      flat-delivery, repetitive). Existing 6 keep position (muscle memory).
- [x] `ai-prompt.js`: labels for new keys; `repetitive` joins EXCLUDED list
      (good-but-redundant ≠ taste); rebuild `buildRejectedSection` — tagged rows
      fill the 3k budget FIRST, grouped by reason ("## Rejected because: …"),
      untagged legacy rows last under "no stated reason".
- [x] `feedback.js` MECHANICAL_REJECT_REASONS: add `repetitive` (stats mirror).
- [x] `ai-pipeline.js`: rejected fetch 30 → 50 so tagged rows from older
      windows can reach the budget.
- [x] Update + extend `ai-prompt.test.js` (grouping, tagged-first, repetitive
      exclusion). All tests green.
- Verify: tests pass, build renderer, dev-profile boot, chips render in reject
  flow, prompt snapshot from builder shows grouped section.

### Step 2 — Replay-and-score harness (this session if room)
- [x] `tasks/spikes/replay-score/` harness: rebuild the detection call from
      saved artifacts (processing/claude claude_ready.txt, energy/, signals/,
      frames re-extracted from source), current DB feedback, current prompt
      code; call LLM; score picks vs feedback history (approved-recall +
      rejected-hit-rate, overlap = midpoint containment).
- [x] Baseline current config on the RL recordings with richest feedback.
- Verify: baseline numbers reproducible run-to-run within noise (2 runs).

### Step 3 — Ablations: frames + no-rejected cells DONE (results on #234); no-approved / no-playstyle / post-#232 no-rejected re-run remain.
### Step 4 — Gemini full-watch prototype as event-timeline signal (after 3).

---

## ✅ DONE (session 142) — Clip status ladder (#221) + seamless split playback (#222) — **built and machine-verified in the dev app; committed; NOT yet confirmed by Fega, NOT yet in an installer**

Ladder verified live over real data (all colors render; "To schedule"/"Done" follow the strict rule). Split fix verified with numbers: old in-place seek at a real cut = 190–1100ms frozen (probe on the actual recording); new double-buffer handoff = ~8ms, zero visible seeking, playhead continuous, 1.5× shuttle speed carried across the swap, undo intact. Incident during verification: `S` (trim, NOT split — split is `U`) cut a real clip; restored exactly (single segment 733.1377→747.8186, verified on disk). Lessons in tasks/lessons.md + memory gotchas 28-30.

Approved by Fega (explainer: `tasks/mocks/clip-status-and-split-gap.html`).
Decisions locked: **strict Done** (rendered-but-undated blocks), **dequeued gets
a "Removed from queue" tag + blocks Done**.

### A. Unified clip status ladder (ProjectsView + theme)
Ladder (furthest rung wins): Untouched (ghost) → Approved (green) →
Rendered/queued (orange, NEW `T.orange` #f97316) → Scheduled (yellow) →
Published (cyan). Rejected (red) off-ladder. Dequeued = ghost dash + tag.

- [ ] `theme.js`: add `orange` (+ dim/border variants)
- [ ] `ProjectsView.js` `makePublishState`: `isScheduled = !!c.scheduledAt`
      (drop dead tracker-entry requirement — tracker rows are only written at
      publish time, so the old check could never fire pre-publish)
- [ ] Project-card pip strip: 6-color ladder
- [ ] Clip row badges: Rendered cyan→orange, Published green→cyan, Scheduled
      accent→yellow (now actually shows), add ghost "Removed from queue" badge
      for `status === "dequeued"`
- [ ] `getProjectStatus`: done = all reviewed AND every non-rejected clip has
      `scheduledAt` or is published; dequeued blocks
- [ ] Fix stale comment at ProjectsView.js:56-58 (claims scheduling writes a
      tracker entry — it doesn't)

Verify: build renderer + dev-profile boot, eyeball Projects tab states via CDP.

### B. Split playback gap (editor preview)
Root cause: single-`<video>` seek at each cut boundary (rAF loop
PreviewPanelNew.js:1323-1371 → mapSourceTime usePlaybackStore.js:159-215 →
seek at :1357). Seek = hunt + decode in a big HEVC file → frozen frame +
silent audio ≈ 0.1-0.3s. Render output unaffected.

- [ ] Probe: measure real seeking→seeked latency on one of Fega's actual
      recordings (standalone HTML probe, mid-playback jumps) BEFORE building
- [ ] Double-buffer: hidden standby `<video>` pre-parked at next segment
      start; instant swap at boundary; active-element ref keeps playback
      store / rAF / compositor / audio sync working; legacy seek as fallback
      when standby not ready (scrub, reorder, rewind excluded)
- [ ] Verify: CDP — play across a cut, visible element must fire no `seeking`
      at the boundary; measure before/after gap

### C. Wrap
- [ ] CHANGELOG.md, commit + push (batch, no installer per batching rule)

---

## ✅ DONE (session 141) — Editor keyboard layer: reliable Space, five new edit keys, rebindable shortcuts overlay — **built and verified in the running app; filed as #220; NOT yet confirmed by Fega, and NOT yet in an installer**

All 11 verification criteria met except one partial (see below). Highlights:
Space started on the FIRST press in 20/20 presses and after every gesture type
(seek, rapid scrub, split, rewind, fast forward, timeline-block click); `M` at 8s
took 27.28s → 19.28s with the section's `sourceStart` moving exactly +8s and
Ctrl+Z restoring the list byte-identically; `S` at 5s → 5.00s; rewinding across a
cut jumped source 740.1 → 727.48 exactly at the boundary with zero samples in
deleted footage; and **the rendered MP4 after `S` at 5s measured exactly 5.000s**,
proving the keys agree with the export and not just the preview.

**Partial:** criterion 3 was proven on the AI-context textarea (typing "same u r"
changed nothing) but NOT specifically on the clip-title input — a synthetic click
wouldn't swap that node to an input. Both go through the same single
`INPUT`/`TEXTAREA`/`contentEditable` branch, so it's covered by mechanism, not by
direct observation. Worth a manual poke.

**Scope added beyond the approved plan (flagged, not silent):** timeline edits
turned out never to have been undoable — `_pushNleUndo()` delegates to the
subtitle store, whose snapshot only carried `editSegments` + `styling`, never
`nleSegments`. Split / delete-section / trim / reorder have all silently failed to
restore since they were built. The approved plan promised M and S would be
undoable, and they destroy footage, so the snapshot now carries `nleSegments`.
This fixes undo for every timeline operation, not just the new keys.

**Two verification lessons worth keeping:**
1. `requestAnimationFrame` fires **zero** times in an occluded Electron window.
   The rewind loop measured as completely broken for three probes until
   `document.visibilityState` came back `"hidden"`. Any rAF-dependent CDP
   verification must `Page.bringToFront` first — see `cdp2.js`.
2. Dev and prod share `projectsRoot`, so a dev-profile edit writes to Fega's REAL
   project JSON. The `S` test trimmed a real clip to 5s; restored via in-app undo
   + Save and verified on disk. Check `projectsRoot` before destructive testing.

**Original plan below, kept for the reasoning and the liveness proofs.**

## 📋 PLAN (session 141) — Editor keyboard layer: reliable Space, five new edit keys, rebindable shortcuts overlay

Fega's ask: spacebar sometimes needs 2–3 presses before the timeline plays; he wants
"butter smooth" keyboard control. Plus five new keys (M/S/U/R/E) and a shortcuts
popup opened from the editor.

### What I verified first (liveness proofs)

| Claim | Proof |
|---|---|
| Every playback/edit shortcut lives in ONE effect inside the timeline panel | `TimelinePanelNew.js:790-820` — Space→`togglePlay`, `s`→`handleSplit`, `Ctrl+.`→collapse, Del/Backspace→delete |
| That component is unmounted whenever the timeline is collapsed, so all of those keys cease to exist | `EditorLayout.js:1172-1183` (`{!tlCollapsed && (…<TimelinePanelNew />…)}`); confirmed by the source comment at `TimelinePanelNew.js:866` "this component is unmounted when collapsed". Collapsed shows `MiniPlayerBar` (`EditorLayout.js:1169`), which registers no keys |
| **`S` is already Split today** — Fega's layout reassigns it | `TimelinePanelNew.js:798-801` |
| The only other editor-wide key handler is undo/redo, and it IS always mounted | `EditorLayout.js:1076-1102` (`document` keydown, `[]` deps) — so `EditorLayout` is the correct home for a global key layer |
| Space flips a store boolean; it never touches the video element directly | `usePlaybackStore.js:38-54` `togglePlay` → `seekTo(currentTime)` then `set({playing: !playing})` |
| A separate effect pushes that boolean at the element, and **swallows failure silently** | `PreviewPanelNew.js:1458-1465` — `videoRef.current.play().catch(() => {})` |
| **Nothing ever reconciles `playing` back FROM the element.** The `<video>` has only `onEnded`; there is no `onPlay`/`onPause` | `PreviewPanelNew.js:1828` is the sole element handler; `setPlaying` is called from exactly two places, both end-of-timeline (`:1350` rAF `atEnd`, `:1455` `onVideoEnd`) |
| Playback speed already exists end-to-end and is wired to the element | `usePlaybackStore.js:12` `tlSpeed:"1x"` + `:202` `setTlSpeed`; applied at `TimelinePanelNew.js:861-864` → `videoRef.current.playbackRate`; UI dropdown at `TimelinePanelNew.js:1055-1066` |
| Every primitive M/S/U need already exists as a store action, each with undo + dirty-marking | `useEditorStore.js:370` `splitAtTimeline`, `:395` `deleteNleSegment`, `:403` `trimNleSegmentLeft`, `:411` `trimNleSegmentRight` — all call `_pushNleUndo()` then `setNleSegments()` then `markDirty()` |
| Timeline↔source conversion for the playhead is a solved, shared path | `usePlaybackStore.js:112-135` `seekTo`; `models/timeMapping` `timelineToSource` / `sourceToTimeline` |
| There is no shortcuts UI of any kind today | grep for `shortcut`/`hotkey` across `src/renderer/editor` returns only 4 code comments |

### Decisions from Fega (answered before planning)

1. **M / S act on the section under the playhead.** Selection is ignored.
2. **E = smooth reverse scrub**, silent, ramping 1.5x → 2x → 4x.
3. **Shortcuts overlay is rebindable**, and remembers changes between sessions.
4. **U keeps today's smart split** (subtitle / caption / video section, auto-detected) — key change only.

---

### Part 1 — Make Space reliable

**Status of the root cause: NOT reproduced.** I can prove the state *can* desync but not
which gesture triggers it, so I am fixing the class, not guessing at one trigger.

The failure mode the code permits: `playing` is the single source of truth, and it is
write-only toward the element. If `play()` ever rejects (`PreviewPanelNew.js:1461`), the
catch discards it, the store still says "playing", and the video is paused. The next
Space press then reads `playing === true` and *pauses* — a press that looks like it did
nothing. The press after that plays. That is exactly the "two or three presses" symptom,
and nothing in the code can currently correct it.

1. **Reconcile the flag from the element.** Add `onPlay` / `onPause` handlers to the
   `<video>` (`PreviewPanelNew.js:1828`) that call `setPlaying(true/false)`. The store
   can then never disagree with reality for more than a frame, whatever caused the drift.
2. **Stop swallowing the rejection.** `play().catch()` sets `playing: false` instead of
   discarding, so a failed start leaves the button and the flag honest and the very next
   Space press starts playback.
3. **Log the rejection reason** (`console.warn`) so if it ever recurs we learn the actual
   trigger instead of guessing again. Temporary; removed once we've seen it or gone a
   few sessions without.
4. **Space keeps working when the timeline is collapsed** — falls out of Part 2.

I am deliberately NOT rewriting the rAF loop, the seek-on-play in `togglePlay`, or the
gap-crossing logic. All three are load-bearing and none is implicated.

### Part 2 — One always-mounted keyboard layer

New: `src/renderer/editor/shortcuts/registry.js` + `useEditorShortcuts.js`, mounted once
in `EditorLayout` (always mounted, next to the existing undo/redo handler).

Registry entry = `{ id, defaultKey, label, group }`. The layer resolves a pressed key
through the registry (respecting saved rebinds) and dispatches. One list drives the
behaviour AND the overlay, so the popup can never drift from what the keys actually do.

**Which shortcuts move, and why it's split:**

- **Space, R, E, M, S** need only `usePlaybackStore` + `useEditorStore` → they live
  entirely in the global layer and work whether or not the timeline is collapsed.
- **U (split) and Delete** depend on the timeline's local selection (`selectedTrack`,
  `selectedSegIds`). Rather than hoist that state into a store — a much wider refactor
  than this request warrants — `TimelinePanelNew` **registers its two handlers with the
  layer on mount and unregisters on unmount**. Collapsed, those two no-op; everything
  else still works. Tradeoff stated so it's a choice, not an accident.

**Guard on every shortcut:** skip when focus is in an `INPUT`, `TEXTAREA`, or anything
`contentEditable`. Today's guard checks the first two only — with five new single-letter
keys, typing "same" into a title field must not trim the timeline.

**New key behaviours:**

| Key | Behaviour |
|---|---|
| `U` | Split — today's `handleSplit`, unchanged, rebound from `S` |
| `M` | Start to playhead — trims the **section under the playhead** so it begins there (`trimNleSegmentLeft`), and deletes any section lying entirely before it (`deleteNleSegment`). Timeline closes up automatically; sections are contiguous by construction |
| `S` | End to playhead — mirror: `trimNleSegmentRight`, deletes sections entirely after |
| `R` | Fast forward. Press 1 → 1.5x, 2 → 2x, 3 → 4x, 4 → back to 1x. Starts playback if paused. Drives the existing `tlSpeed`, so the on-screen speed dropdown stays truthful for free |
| `E` | Rewind — rAF loop stepping the playhead backwards at 1.5x/2x/4x via `seekTo`, so it walks section boundaries correctly. Video is paused during it (silent, as agreed). Stops at 0 |

Ramp resets to 1x on Space, on reaching either end, and when reversing direction.
No-ops are silent no-ops (M at 0:00, E at 0:00) — never an error.

Both M and S go through the existing store actions, so **both are undoable with Ctrl+Z**
and both mark the project dirty for autosave. No new undo machinery.

### Part 3 — Rebindable shortcuts overlay

New: `src/renderer/editor/components/ShortcutsDialog.js`.

- Opens from a keyboard icon in the editor header **and** from `?`.
- Renders straight off the registry, grouped (Playback / Editing / View), so a new
  shortcut shows up here the day it's added.
- Click a row → "press a key…" → captures the next keypress and rebinds.
- **Conflict handling:** if the key is taken, name the action holding it and offer to
  reassign (the old one becomes unbound and is flagged in the list, not silently lost).
- "Reset to defaults" button.
- Persisted via `window.clipflow.storeSet("editorShortcuts", {…})` — the same store
  path every other editor preference uses. Rebinds survive restart.
- Esc / click-outside closes.

### File impact

| File | Change |
|---|---|
| `src/renderer/editor/shortcuts/registry.js` | **NEW** — the one list of shortcuts + defaults |
| `src/renderer/editor/shortcuts/useEditorShortcuts.js` | **NEW** — global key layer, rebind resolution, handler registration |
| `src/renderer/editor/components/ShortcutsDialog.js` | **NEW** — the overlay |
| `src/renderer/editor/components/EditorLayout.js` | Mount the layer + the dialog; header button |
| `src/renderer/editor/components/TimelinePanelNew.js` | Remove the local shortcut effect (`:790-820`); register split/delete with the layer instead |
| `src/renderer/editor/components/PreviewPanelNew.js` | `onPlay`/`onPause` reconciliation; honest `play()` catch |
| `src/renderer/editor/stores/usePlaybackStore.js` | Rewind state + FF/RW ramp actions |
| `src/renderer/editor/stores/useEditorStore.js` | `trimTimelineToPlayhead(side)` — the M/S action, built on the existing trim/delete primitives |

### Verification criteria (all checked in the running app before I call it done)

1. Space plays/pauses on the **first** press, 20 presses in a row, including immediately
   after: scrubbing, clicking a timeline section, a split, and switching clips.
2. Space still works with the timeline **collapsed**.
3. Typing a title containing "s", "m", "u", "r", "e" into a text field edits **nothing**
   on the timeline.
4. `U` splits exactly where `S` used to, in all three cases (subtitle selected, caption
   selected, nothing selected).
5. `M` at 0:12 inside section 2 → section 2 starts at 0:12, sections entirely before it
   are gone, timeline duration drops by the right amount, playhead stays on the same
   frame. `Ctrl+Z` restores it exactly.
6. `S` — same, mirrored.
7. `R` ramps 1.5→2→4→1 and the speed dropdown shows the same value at each step.
8. `E` glides backwards at each of the three speeds and stops cleanly at 0.
9. `E` across a cut lands on the correct frame (walks the section boundary, doesn't jump
   into deleted footage).
10. Overlay: opens from icon and `?`, rebinding U→K works and survives an app restart,
    a conflicting bind is reported rather than silently applied, reset restores defaults.
11. Full clip render after an M+S+U session produces the expected cut — the keys must
    agree with the render path, not just the preview.

### Risks / open

- **Reverse audio is impossible** — E is silent by design, agreed with Fega up front.
- Moving Split off `S` breaks existing muscle memory. Flagged; Fega chose the layout
  knowing this (and it's rebindable).
- `U`/`Delete` are inert while the timeline is collapsed (see Part 2 tradeoff).
- I'll file this as a GitHub issue once approved, per the repo's issue policy.

---

## ✅ DONE (session 140) — Subtitle row actions + tracker week log identity & scheduled preview — **both built, verified in the running app, shipped as 0.3.0-alpha.34; NOT yet confirmed by Fega**

Filed as #217 and #218, both commits ecf0273 + fe2fbf6, installer 05a0dd0.
One addition on top of the plan: Fega approved greying Merge up/down wherever the
line it would swallow is not visible — applied to the row buttons, the right-click
word menu AND the panel toolbar Merge button.
Two bugs of mine caught during verification and fixed before commit: the detail
popover hung off the bottom of the window once it grew, and popBtn used flex:1 only
so the standalone Remove button rendered as a narrow stub.

**Original plan below, kept for the reasoning and the liveness proofs.**

## 📋 PLAN (session 140) — Subtitle row actions + tracker week log identity & scheduled preview

Two unrelated quality-of-life asks from Fega, both awaiting approval before code.
Mockup: `tasks/mocks/tracker-week-log.html` (opened in browser).

### What I verified first (liveness proofs)

| Claim | Proof |
|---|---|
| Split/merge exist ONLY in the panel toolbar as visible controls | `LeftPanelNew.js:641-660` — the two `<Tooltip>` buttons calling `splitSegment()` / `mergeSegment()`, both `disabled={!activeSegId}` |
| A hidden word-level path already exists | `SegmentRow.js:191-206` opens `wordMenu` on right-click; `SegmentRow.js:422-475` renders Split-before-word / Merge-prev / Merge-next with `canSplit` / `canMergePrev` / `canMergeNext` guards |
| "Merge with previous" = merge from the previous segment's side | `SegmentRow.js:451-456` — sets `activeSegId` to `segs[idx-1]`, then `mergeSegment()`; the store action only ever merges `activeSegId` with its NEXT (`useSubtitleStore.js:864-871`) |
| Split honours the selected word | `useSubtitleStore.js:798-805` — the `selectedWordInfo` branch splits at `seg.words[wordIdx].start` |
| `SegmentRow` is `React.memo`'d and prop-stable on purpose | `SegmentRow.js:169-171` + `LeftPanelNew.js:685-709` — parent computes `activeWordInSeg` / `selectedWordIdx` so only the changed row re-renders during playback |
| Every tracker entry already stores the published title | prod `clipflow-settings.json` → `trackerData`: **83/83 have `title`**, 57/83 also have `clipId`, 53 are `source: "clipflow"` |
| The week log shows none of it | `TrackerView.js:769-780` — the entry card renders game tag + `shortSlot(entry.time)` + source dot, nothing else |
| The detail popover shows none of it either | `TrackerView.js:858-901` — game name, day·time, platform icons, source label, Remove |
| Queue-scheduled clips never reach the week log | `scheduleClipOnly` (`QueueView.js:964-982`) only writes `clip.scheduledAt`; the tracker entry is created at fire time by `logPost` (`QueueView.js:1248-1269`). `TrackerView` receives `scheduledClips` but forwards it **only** to the Calendar (`TrackerView.js:513`) |
| The Calendar already renders them | `TrackerCalendar.js:76-80` `scheduledByDate`, hollow segments `:106-109`, dashed drawer rows `:346-358` |
| Scheduled clip shape available today | `App.js:654-670` — `{date, time, title, game}` only; no `clipId`, no `thumbnailPath` |
| XP is awarded at publish time, not at schedule time | `QueueView.js:1280` `awardXp(...)` inside `logPost` |
| Platform-scheduled entries (`scheduled: true`) already count | 3 exist in prod data; they're real `trackerData` rows, so `weekEntries` (`trackerEngine.js:84-88`) and the XP ledger already include them |

### Decisions locked (Fega, this session)

1. **Three buttons on the line:** Split here / Merge up / Merge down.
2. **Placement:** a new action row *under the line's text*, only on the selected line.
3. **Tracker card:** title on the card, plus the game's colour as tint/glow, keeping the tag pill. Card may grow.
4. **Scheduled clips:** dimmed ghost card + amber dot, **and** future days show their open `+` slots.

### Assumptions (say the word if any is wrong)

- Scheduled clips do **not** count toward posted / the ring / XP — they're a preview until they publish.
- Existing `scheduled: true` tracker rows keep counting exactly as they do today (XP already banked; changing it would rewrite streak history). They gain the amber dot for visual consistency only.
- The trailing `#rocketleague` is stripped from titles on the card — the tag pill already says the game.
- The toolbar's split/merge buttons stay.

### Part A — subtitle line actions (`area: subtitles`)

**Files:** `src/renderer/editor/components/leftpanel/SegmentRow.js` only.

1. Render an action row under `renderWords()` when this row has a selected word
   (`selectedWordIdx >= 0`) — not merely when the row is active, so it appears on click and
   disappears when playback takes the highlight back.
2. Three buttons reusing the store calls the right-click menu already proves out:
   - **Split here** → `setSelectedWordInfo({segId, wordIdx})` + `splitSegment()`; disabled when `wordIdx === 0` or the line has <2 words.
   - **Merge up** → `setActiveSegId(prev.id)` + `mergeSegment()`; disabled on the first line.
   - **Merge down** → `setActiveSegId(seg.id)` + `mergeSegment()`; disabled on the last line.
3. Guard flags come from the raw store (`useSubtitleStore.getState().editSegments`), matching
   `handleWordContextMenu` — the `seg` prop is the trim-filtered timeline copy.
4. Keep the right-click menu (no behaviour change, zero-risk, still faster for power use).
5. `stopPropagation` on the row so clicking a button doesn't re-seek via `handleSegClick`.

**Re-render risk:** the action row reads only props the row already receives, so `React.memo`'s
bail-out is untouched. No new props, no new subscriptions.

### Part B — tracker week log (`area: tracker`)

**Files:** `src/renderer/views/TrackerView.js`, `src/renderer/App.js`.

1. **`App.js`** — extend the `scheduledClips` memo to also carry `clipId`, `thumbnailPath`,
   and the clip's `_projectId` so the tracker can show a frame and offer a jump back to the Queue.
2. **`TrackerView.js`** — `dayRows` builder (`:738-750`): merge `scheduledClips` for that date into
   the same time-ordered list. A scheduled clip landing on a template slot **replaces** that slot's
   `+` tile rather than stacking with it (same rule the posted-entry branch already uses).
3. **Future days** (`canLog === false`, `:733`): allow the `+` slots to render again, so Fri/Sat
   stop being blank. Clicking one still opens the manual-log popover; that already works for any date.
4. **Card** (`:769-780`): add a 2-line clamped title under the header row, tint/glow from
   `resolveGameDisplay(entry.game).color`, `title` attribute carries the untruncated text.
5. **Ghost card:** same shape, dashed border, `opacity ~.62`, amber dot (`T.yellow`).
6. **Detail popover** (`:852-905`): lead with the title, add the clip frame (falls back to a colour
   block when `W:` is offline), keep platforms/source/Remove. Scheduled variant swaps Remove for
   **Open in Queue** (needs a `onOpenQueue` callback threaded from `App.js`'s `setView`).
7. **Legend** (`:800-808`): third entry — amber = scheduled, not posted yet.
8. **Counting is untouched** — `posted`, `pace`, `weekXp` all still derive from `thisWeekEntries`.

### Verification

- `npm run build:renderer` clean, `npm start`, Tracker tab: Mon–Thu cards show this week's real
  titles with the right game colour; Fri/Sat show ghosts + open slots.
- Schedule a clip from the Queue for tomorrow → it appears as an amber ghost within a render;
  unschedule → it disappears.
- The header number stays **18/20** (or whatever it is at the time) with ghosts on screen —
  proof they don't count.
- Editor: click a word mid-line → action row appears; Split here cuts before that word;
  Merge up/down fold the right neighbours; first line's Merge up and word 0's Split are greyed.
- Playback: let it run — the action row disappears when the highlight returns to playback,
  and no other row re-renders (spot-check with React DevTools' highlight).

---

## ✅ DONE (session 138) — Audio panel round 2: eight requests — **all 8 built + verified on the dev build; NOT yet on Fega's installed daily driver**

All four issues closed out in source: **#209** (refresh, search X, SFX fades),
**#210** (per-sound default volume), **#211** (waveform rows + scrubber, panel
extracted to `components/audio/`), **#212** (Epidemic's 34 mood tags, seeding,
Untagged queue, Recent + backfill). Commits 050b75f, a325623, f1366f4, 1a0433a.

**One gap, filed as #213:** tagging is one track at a time in the UI. The bulk
path (`addAssetTagToMany` + `assets:addTagToMany` + `TagPicker`'s `bulkCount`) is
built and wired, but there's no row multi-select yet — and 487 tracks are still
untagged, so that's what makes 34 moods practical.

**Bugs found and fixed during verification** (both mine, both caught by
measurement rather than reasoning):
1. The lazy waveform loader used `IntersectionObserver`'s default root, but
   intersection is clipped by ancestors — rows scrolled out of the ScrollArea
   could never fire, and `rootMargin` expands the window rect so it couldn't
   compensate. Exactly the rows inside the visible box had painted while
   `assets:peaks` returned 200 peaks for all 11.
2. `projects.listProjects()` returns `{ projects: [...] }`, not an array, so the
   Recent backfill threw and the catch-up's handler swallowed it — the feature
   looked like it had run and matched nothing. The log line named the cause.

**Original plan below, kept for the reasoning and the liveness proofs.**

## 📋 PLAN (session 138) — Audio panel round 2: eight requests

Follow-on to #208. All eight items live in the Audio panel and the placed-sound
popover. Nothing here touches detection, the pipeline, or publishing.

Filed as four issues under epic #201, grouped by how they'll actually ship:
- **#209** — items 1, 2, 7 (refresh button, search clear, SFX fades)
- **#210** — item 6 (per-sound default volume)
- **#211** — items 4, 5 (waveform + scrubbable mini player, row extraction)
- **#212** — items 3, 8 (mood tags, Recently used)

### Decisions locked (Fega, session 138 open)

1. **Tags = presets + free text.** Preset one-click moods (Hyped, Epic, Tense,
   Sad, Moody, Chill, Funny, Eerie, Triumphant) plus a free-text field. Presets
   keep "hype"/"hyped" from forking; free text is the escape hatch.
2. **Seed tags from folder names on first run** — one-time, non-destructive,
   editable. Gives ~760 pre-tagged tracks on day one.
3. **Waveforms load as rows scroll into view**, capped concurrency. No eager
   pass. First scroll through a folder is slow, later visits are cache hits.
4. **Backfill Recent from existing clips** — one-time pass over saved project
   JSONs so the tab is useful the first time it's opened.

### What I verified first (liveness proofs)

| Claim | Proof |
|---|---|
| The Audio panel is the live component | `RightPanelNew.js:2714` `case "audio": return <AudioPanel />` inside the rendered drawer switch → `AudioPanel` at `RightPanelNew.js:860` |
| `assets:list` already rescans watched folders on every call | `main.js:980` calls `listAssets`, which walks every enabled root recursively (`assets.js:163-212`) and absorbs new files, then kicks `backfillDurations` (`main.js:983`) |
| The panel already rescans on open | `AudioPanel` calls `refresh()` on mount (`RightPanelNew.js:886`); the drawer `switch` unmounts it on every panel change, so switching away and back = a rescan |
| Waveform peaks infrastructure exists and RUNS | `assets.js:375` `getPeaks` → `main.js:1031` `assets:peaks` → `preload.js:54` → consumed by `SoundBlock.js:18` for every placed block |
| Peaks are disk-cached per file | `assets.js:379-398` — `{assetsRoot}/peaks/<sha1>.json`, invalidated on mtime/size |
| Fades are gated on music in exactly 4 places | store init `useEditorStore.js:453`, popover `TimelinePanelNew.js:1364`, preview `PreviewPanelNew.js:1277`, render `render.js:256` |
| Fade math itself is kind-agnostic | `render.js:257-258` and `PreviewPanelNew.js:1281-1283` — only the `if (kind === "music")` wrapper restricts them |
| `addAudioPlacement` has ONE caller | `RightPanelNew.js:998` (`handleAddToTimeline`). The lane hints at `TimelinePanelNew.js:942` only `togglePanel("audio")` — they don't place anything. So placement has a single chokepoint |
| Placements carry `assetId` AND `path` | `useEditorStore.js:441,443` |
| Placements persist on the clip as `sfx` | written `useEditorStore.js:1103`, read back `useEditorStore.js:221` |
| Per-track fields have a home | `assets.json` entries already carry fields defaulted on read (`favorite` `assets.js:207`, `typeLocked` `assets.js:187`). Not electron-store, so no store migration applies |

### 1. Refresh the library from the panel

**Symptom:** drop a new sound into the folder, ClipFlow doesn't know.
**Reality:** it does know — on the *next panel open*. There is no way to trigger
it while looking at the panel and no feedback that it happened.
**Change:** refresh button beside Upload / preview-volume. Spins while listing,
then flashes `3 new tracks` or `Nothing new` (diff the asset-id set across the
call). Reuses `assetsList()` untouched.
- `RightPanelNew.js` — `AudioPanel`: new handler + button.

### 2. Clear (X) in the search box

Appears only when the box has text; clears and refocuses.
- `RightPanelNew.js:1085` — search input.

### 3. Tags on tracks

Mood/character labels, filterable, on both lanes (music *and* SFX — "boom",
"riser", "whoosh" is the same problem as "hyped", "sad").
- `assets.js` — `tags: []` on the entry, defaulted on read; `setAssetTags()`.
- `main.js` + `preload.js` — `assets:setTags`.
- Panel — tag chips on the row, a tag filter strip, add/remove UI.
- **Decided:** presets + free text. Presets: Hyped, Epic, Tense, Sad, Moody,
  Chill, Funny, Eerie, Triumphant.
- **Decided:** seed tags from folder names on first run (one-time,
  non-destructive, editable). His folders already encode mood: "Troll - Derpy -
  Funny", "Lowkey - Just Chatting".

### 4. Mini player with scrub

**Change:** the playing row grows a seek strip — position, total, click/drag to
seek. Reuses the single existing `audioRef` (`RightPanelNew.js:877`).
**Perf guard:** the position tick must NOT re-render the list. The row body moves
into its own memoised `TrackRow` component so only the playing row repaints.
- `RightPanelNew.js` — extract row; add a `timeupdate`/rAF tick inside it.

### 5. Waveform per row

Reuses the live `assetsPeaks` path and its disk cache. Converges with item 4: the
playing row's scrub strip *is* the waveform, so you scrub by eye.
**Cost:** one FFmpeg decode per file on first sight. 760 files eagerly is roughly
5 minutes of decoding across 12.6 GB — so it must not be eager.
- **Decided:** lazy as rows scroll into view, capped concurrency (~2-3). No
  eager pass. Cold scroll is slow once per folder, then cache hits.

### 6. Save a per-sound default volume

**Change:** `defaultVolume` on the asset entry. Right-click a block on the
timeline → the existing sound popover gains **Save as default for this sound**
under the Volume slider. Every future placement of that sound opens at that
level; a small `60%` badge on the library row shows which sounds are calibrated,
with a way to clear it.
- `assets.js` — `defaultVolume` + `setAssetDefaultVolume()`.
- `main.js` + `preload.js` — `assets:setDefaultVolume`.
- `useEditorStore.js:449` — `asset.defaultVolume ?? (kind === "music" ? 0.4 : 0.6)`.
- `TimelinePanelNew.js:1361` — the save button under the slider.
Graceful failure when the asset is no longer in the library (deleted/un-watched).

### 7. Fade in / out on SFX

Remove the four `kind === "music"` gates listed above. The math already works for
both kinds.
**One real fix while in here:** the sliders are fixed 0–3s, and most one-shots are
under a second — a 3s fade on a 0.4s boom is nonsense. `render.js:258` guards
fade-*out* against block length; fade-*in* has no guard at all. Clamp both slider
maxes to the block's own length.
- `useEditorStore.js:453`, `TimelinePanelNew.js:1364`, `PreviewPanelNew.js:1277`,
  `render.js:256`, `__tests__/renderAudioMix.test.js`.

### 8. Recently used

**Change:** `lastUsedAt` stamped on the asset entry at the single placement
chokepoint (`RightPanelNew.js:998`). Surfaced as a third filter pill beside
All / Favorites → **Recent**: newest first, grouping dropped, capped ~30,
per-lane so each tab keeps its meaning.
- **Decided:** one-time backfill from existing clips, so the tab is useful the
  first time it's opened. Backfill walks the saved project JSONs, reads each
  clip's `sfx[]`, and matches on `path` first / `assetId` second (path is stable
  across index rebuilds; a regenerated `assetId` is not).

### Assumptions I'm making without asking

- **`AudioPanel` moves to its own file.** It's ~435 lines inside a 2818-line
  `RightPanelNew.js`, and these eight items add several hundred more. Moving it
  to `components/audio/AudioPanel.js` + `TrackRow.js` follows the existing
  `leftpanel/` precedent. Pure move, no logic change, same commit.
- **Tags apply to both lanes**, not music only.
- **Re-using a sound bumps it** to the top of Recent, even within one clip.
- **No electron-store migration needed** — `assets.json` is its own file with
  read-time defaults, the pattern `favorite` and `typeLocked` already use.

### Sequencing

The panel row is about to carry tags, a waveform, a scrub strip, a volume badge
and the existing five actions. That's aesthetic-sensitive and dense, so:

0. **HTML mock of the new row + player + tag strip, opened in the browser for
   approval** before any React is written.
1. Items 2, 7, 1 — small and independent, land first.
2. Item 6 — small, high value, self-contained.
3. Row extraction, then items 4 + 5 together (they share the strip).
4. Item 3, then item 8.

### Verification criteria

- `npm run build:renderer` clean, `npm start` launches, Audio panel opens.
- **1:** drop a file into a watched folder with the panel open → refresh shows it
  and reports the count.
- **2:** typing then clicking X empties the box and restores the full list.
- **3:** tag a track, close and reopen the editor, tag survives; filter narrows.
- **4:** click play, drag the strip mid-track, audio jumps to that point.
- **5:** scroll a folder cold, waveforms fill in without freezing the panel;
  reopen and they're instant (cache hit).
- **6:** save 45% on a boom, place it on a fresh clip → it opens at 45%.
- **7:** SFX popover shows both fade sliders; a 0.5s one-shot caps at 0.5s;
  render the clip and confirm the fade is audible (and `render.js` emits `afade`).
- **8:** place a sound, switch to Recent → it's top of the list.
- No regressions: preview volume slider, favorites, lane override, Length sort,
  offline/missing flags, group collapse all still behave.
- Unmount cleanup still pauses and drops the audio element (standing rule).

---

## ✅ DONE (session 137) — Audio library: link Fega's real folders instead of copying (#208) — **built + verified on the dev build; NOT yet on Fega's installed daily driver**

Drafted at the end of session 136 (2026-07-29); re-measured, revised and built in
session 137. Fega locked the scope (one folder `V:\AutoSync\Audio`, whole library
visible); the per-folder role dropdown was cut, groups collapsed by default.

### What the live drive proved (built app, dev profile, driven over CDP)

- **Migration:** seeded a legacy `sfxFolder` into the dev profile → first boot
  moved it to `audioFolders: [{path, enabled: true}]` and blanked `sfxFolder`.
  Logged as `Migrated sfxFolder to audioFolders: …`.
- **Full library:** pointed at `V:\AutoSync\Audio` → **762 tracks** (760 linked +
  2 previously uploaded) in **29 groups**, sorted **513 music / 249 sfx**, zero
  copied bytes. Cold scan 124ms; duration pass **77s for 760 files**; every later
  list call ~50ms from the cache.
- **Groups** render collapsed with counts; Fega's mood folders all survived
  (`Lowkey - Just Chatting - Lobby - Chill` 68, `Troll - Derpy - Funny` 10,
  `Intense - Epic - Final Battle…` 20). Expanding one lists its tracks.
- **Search bypasses collapse** — typing "casino" surfaced matches from two
  different collapsed groups.
- **Lane override** through the UI: `2985_Descending Mount Everest` (59.9s, so
  SFX by a hair) moved to Music, status line confirmed, `typeLocked: true` on
  the entry, and it held through a rescan AND a second duration pass.
- **Offline/toggle/delete** (separate harness on a small copied tree, since `V:`
  can't be unplugged): folder Off → 0 shown but favorite + lane remembered;
  folder renamed away → 4/4 kept and flagged offline, lanes unchanged even after
  a scan attempt while offline; renamed back → flags cleared, no re-probe; one
  file deleted → kept with `missing: true`; a file swapped for a longer one →
  re-probed and re-classified sfx → music; folder removed from Settings → gone.
- 125 jest tests green. Clean boot, no errors in the dev log.
- Fega's real `assets.json` was backed up before the run and **restored
  byte-for-byte** afterwards (2 entries, both uploads).

### Two things left for Fega's call

1. **Group names come straight off the folder**, so Epidemic's folders show as
   groups literally named `Music` (131) and `SFX` — and `SFX` appears inside the
   Music tab with the 4 long files it holds. Honest, but reads oddly. Renaming
   would mean inventing labels; left alone unless he wants it changed.
2. **The 60-second cut is exact.** `2985_Descending Mount Everest` at 59.9s
   landed in SFX until it was overridden. Working as designed — flagging it so
   the boundary isn't a surprise.

### Original plan (kept for reference)

### Locked by Fega (session 137)

- **Watch one folder: `V:\AutoSync\Audio`.** Covers all 760 files, both Epidemic
  folders and the whole Sound FX tree. He can add/remove later.
- **Bring the whole library in** — all ~510 music tracks including the 100
  Thieves pile. Collapsed groups + search keep the unused piles out of the way
  rather than excluding them.
- Per-folder role dropdown cut (see below).

### Why

ClipFlow's Audio panel offers two ways in, and today only the wrong one works
for Fega:

- **Copy** (`importAssets`, `assets.js:130`) — `fs.copyFileSync` into
  `{assetsRoot}/files/`, entry `source: "library"`. This is what the Upload
  drawer does, and what Fega has been shown.
- **Link** (`listAssets`, `assets.js:77`) — scans the folder in the `sfxFolder`
  setting and indexes files **in place**, entry `source: "folder"`,
  `resolvePath` returns `entry.path` untouched. **Fega's `sfxFolder` is empty**,
  so he has never seen this work.

Copying is wrong for him for one reason above all: his library lives under
`V:\AutoSync\`, which **syncs itself**. A copy forks it — when Epidemic adds,
renames or pulls a track, ClipFlow's copy silently stops matching the folder he
actually maintains, and the stale one is the one the app uses. Size is the
lesser problem, but it isn't nothing (below).

Copying stays the right **default for other users** — someone dragging one file
off their Desktop must not lose it when they clear out Downloads.

### Fega's actual library (re-measured 2026-07-29, session 137)

**Corrected from the session-136 figures below.** Walking the whole
`V:\AutoSync\Audio` root — not just the two folders session 136 sampled —
gives **760 audio files, 12.59 GB, 38 folders, 5 levels deep**. Session 136
missed `Epidemic Sound\SFX` (60 files, 372.6 MB) and a stems subfolder inside
Epidemic's Music. Top folders by count:

```
133   6125.7 MB  Epidemic Sound\Music                                    ← music
122     86.4 MB  Sound FX\Effects                                        ← SFX
100   3269.6 MB  Sound FX\SoundTracks\...\100 Thieves Hype Tracks        ← music
 71    353.1 MB  ...\Game Music - Jazz\Lowkey - Just Chatting            ← music
 64    163.2 MB  Sound FX\Mango's Complete SFX Pack\Mango's Sfx          ← SFX
 60    372.6 MB  Epidemic Sound\SFX                        ← SFX, MISSED in s136
 35    736.4 MB  Sound FX\SoundTracks\StreamBeats Verified Music         ← music
 35    162.0 MB  Sound FX\SoundTracks                                    ← music
 35    264.6 MB  ...\Game Music - Jazz\Upbeat - Mario Plaza              ← music
  5    218.0 MB  Epidemic Sound\Music\ES_Counting Blessings — 5 stems of ONE song
                 (all 151.2s; they will show as five near-identical rows)
 …plus 18 smaller folders, and 10 folders holding no audio at all
 (`Meme Audio` is completely empty; `Zipped`, `Tutorials _ Presets`, …)
```

**Copying would duplicate 12.59 GB.**

The session-136 tree below is still accurate for `Sound FX` itself:

```
Sound FX                                    3 files    71.2 MB   ← music, loose at root
  Brian Rian Rehan - Dark [MP3&WAV]         2          49.0 MB   ← music
  Effects                                 122          82.4 MB   ← SFX
    Swoosh SFX/002_SFX                      6           0.5 MB   ← SFX
      Terrible Swooshes                     5           1.1 MB   ← SFX
  Mango's Complete SFX Pack/Mango's Sfx     64         155.7 MB   ← SFX
  SoundTracks                               35         154.5 MB   ← music
    HarrisHeller - Streambeats               3          80.8 MB   ← music
      100 Thieves Hype Tracks              100        3118.1 MB   ← music
    StreamBeats Verified Music              35         702.3 MB   ← music
  TikTok SoundTracks                         1           0.1 MB   ← music
  Video Music 2022/Video Music 2022/
    BASSBOOSTED                              4          19.3 MB   ← music
    Game Music - Jazz/  (10 mood folders)  ~173        ~1106  MB   ← music
    Holiday Themed                           2           9.6 MB
    Meme Music                               7          45.7 MB
```

`F:\Youtube\Sound FX\Effects` is a **legacy duplicate** of `Effects` — Fega
confirmed it is dead. Do not index it.

### The three questions, answered

#### 1. Track more than one folder — DECIDED, build it

Replace the single `sfxFolder` string with a list of watched folders. Each entry
is at minimum `{ path, enabled }`. Scan is recursive.

Migration: an existing non-empty `sfxFolder` becomes the first entry in the list.
(Fega's is empty, so this only matters for correctness, not for him.)

#### 2. Telling music from sound effects — the folder tree can't be trusted, but duration can

The obvious idea — read it off the folder name — **fails on Fega's library
specifically**, and fails in the most damaging way: the root folder is called
`Sound FX` and it contains `SoundTracks`, `100 Thieves Hype Tracks`,
`Video Music 2022`… A "path contains SFX → it's an effect" rule labels all ~350
music files as sound effects. Folder names are a hint, never the rule.

**Duration is the real signal.** Sampled with ffprobe across his own folders:

| Folder | n | min | median | max | over 60s |
|---|---|---|---|---|---|
| Effects | 12 | 0.9s | **4.6s** | 190.7s | 1/12 |
| Mango's Sfx | 12 | 0.7s | **4.0s** | 29.0s | 0/12 |
| Terrible Swooshes | 5 | 0.2s | **0.6s** | 1.2s | 0/12 |
| SoundTracks | 12 | 99.1s | **193.1s** | 352.2s | 12/12 |
| 100 Thieves Hype | 12 | 118.0s | **130.2s** | 170.4s | 12/12 |
| Lowkey / Chill | 12 | 74.4s | **160.0s** | 319.7s | 12/12 |
| Meme Music | 7 | 11.7s | **280.6s** | 882.0s | 6/7 |
| Sound FX root | 3 | 178.1s | **264.0s** | 4096.4s | 3/3 |
| Epidemic Music | 12 | 113.9s | **157.0s** | 260.5s | 12/12 |

Session 137 re-sampled the five folders session 136 never touched, and the cut
held **30/30**:

| Folder | n | min | median | max | over 60s |
|---|---|---|---|---|---|
| Epidemic Sound\SFX | 12 | 0.6s | **3.3s** | 11.0s | 0/12 → all SFX ✓ |
| ES_Counting Blessings (stems) | 5 | 151.2s | **151.2s** | 151.2s | 5/5 → all music ✓ |
| Troll - Derpy - Funny | 10 | 66.6s | **120.6s** | 302.3s | 10/10 → all music ✓ |
| Brian Rian Rehan - Dark | 2 | 128.9s | **129.0s** | 129.0s | 2/2 → all music ✓ |
| TikTok SoundTracks | 1 | 8.0s | **8.0s** | 8.0s | 0/1 → SFX (folder name says music) |

**Running total: 103 of 105 sampled files classified correctly (~98%).** The two
misses: a 190.7s file sitting in `Effects` (almost certainly music filed in the
wrong folder) and an 11.7s sting in `Meme Music` (arguably an SFX anyway). The
lone `TikTok SoundTracks` file is 8s, so calling it an SFX is defensible.

**Probe cost re-measured: 99ms per file → 760 files ≈ 1.3 min cold**, matching
the session-136 estimate. Cached after that.

ClipFlow already has this constant — `MUSIC_MIN_SECONDS = 60` (`assets.js:18`) —
and already applies it on the copy path (`assets.js:152`). It is simply never
applied on the folder-scan path, where **everything is hardcoded
`type: "sfx"`** (`assets.js:104`). That single line is the bug behind
"everything from a folder shows up as a sound effect".

**Rule, in priority order — TWO tiers, not three (session 137 change):**
1. A per-track manual override, if the user has set one — always wins, stored on
   the index entry so a rescan never undoes it.
2. Otherwise `durationSec >= 60 → music, else sfx`.

**The per-folder role dropdown from the session-136 draft is cut.** It was tier 2
of three, and at 98% measured accuracy it earns nothing: every folder it would
let Fega label is already labelled correctly by duration. It costs a dropdown in
Settings, a third field on every watched-folder entry, and a priority branch —
for a case that has not appeared in 105 sampled files. Add it later if the
duration rule actually disappoints. (Simplicity rule; flagging the change because
the session-136 draft proposed it.)

Deliberately NOT proposed: guessing from folder names (breaks on his tree, as
above), or asking him to reorganise 760 files.

The manual override is the piece that makes the ~2% tolerable — one click
"Move to Music / Move to SFX" in the Audio panel, and it sticks.

**Cost of the duration rule:** every file must be probed once. Measured at 99ms
per file → **760 files ≈ 1.3 minutes** on the first scan. Must be
(a) backgrounded — the panel opens immediately and fills in — and (b) cached by
`path + mtime + size`, the same invalidation rule `getPeaks` already uses
(`assets.js:197`). After the first scan it is near-instant. Sequential probing is
fine; it already runs in `probeDurationSafe`, just make it not block the list.

#### 3. "Offline drives" — what that meant, and why it matters

Plain version: `V:` is a synced drive. If it is disconnected, renamed, or the
sync moves a folder, ClipFlow can no longer find those files. There are two
things the app can do, and **today linking does the worse one**:

- `listAssets` **prunes** folder entries whose file vanished
  (`assets.js:85-89`) — the track silently disappears from the Audio panel, with
  no explanation. If a clip already used it, the render fails later with a
  missing-file error and no hint about why.
- The copy path does the better thing already: keeps the entry and flags it
  `missing: true` (`assets.js:121`), with the comment *"the user may restore a
  moved drive"*.

So: linked tracks should be flagged, not pruned — greyed out in the panel with an
"offline" marker, coming back by themselves when the drive returns. Only a track
the user explicitly removes should leave the list.

Distinguish two cases when scanning: **folder unreachable** (drive offline — keep
everything, mark the whole folder offline) vs **file gone while the folder is
readable** (genuinely deleted — still keep it, but it can be offered for cleanup).
Pruning a whole folder's worth of tracks because `V:` was unplugged is the
failure this prevents.

### Also in scope

- **Subfolders as groups in the Audio panel.** His organisation (`Lowkey - Just
  Chatting`, `Intense - Epic - Final Battle`, `Troll - Derpy - Funny`) is the
  useful part of his library and must survive the import. Group by immediate
  parent folder, collapsible.
- **Groups start collapsed** (session 137 addition). 760 tracks in one open
  scroll list is ~4,500 DOM nodes in a panel that renders every row eagerly;
  collapsed it is 28 headers. **Typing in the search box bypasses collapse** and
  shows matches across every group, so nothing is buried — that is the standard
  pattern and it keeps the panel's existing search useful.
- **Empty/junk folders** (`Meme Audio` — completely empty, `Zipped`,
  `Tutorials _ Presets`, `Swoosh SFX` with 0 audio: 10 such folders) should not
  render as empty groups.
- Existing copied assets keep working — this adds a source, it does not migrate
  or delete anything already in `{assetsRoot}/files/`.
- **Already-placed sounds are safe from index churn.** A placement copies the
  absolute `path` at drop time (`useEditorStore.js:443`) and the renderer
  resolves by `p.path` (`render.js:458`), so a re-scan that mints new asset ids
  cannot detach a sound already on a clip.

### Files this will touch

- `src/main/assets.js` — the watched-folder list, recursive scan, duration cache,
  classification, offline flagging instead of pruning.
- `src/main/main.js` — `sfxFolder` → list setting + migration (schema change, so
  a migration function is mandatory per `.claude/rules/pipeline.md`).
- `src/renderer/views/SettingsView.js` — the single "Sound Effects Folder" card
  becomes an add/remove list of watched folders (no role dropdown — cut above).
- `src/renderer/editor/components/RightPanelNew.js` — subfolder groups
  (collapsed by default, search bypasses), offline styling, the per-track
  "Move to Music/SFX" override.

### Verify

- Point ClipFlow at `V:\AutoSync\Audio`. **All 760 tracks appear**, roughly 510
  under Music and 250 under SFX, grouped by their real subfolders, groups
  collapsed. `Meme Audio` and the other 9 audio-free folders show no group.
- Nothing is copied — `{assetsRoot}/files/` gains no bytes.
- Search finds a track inside a collapsed group without expanding it by hand.
- Move one track to the other lane; rescan; it stays where it was put.
- Disconnect / rename `V:` → tracks grey out, none disappear; restore → they
  come back.
- First scan finishes in ~1.3 min with the panel usable throughout; second panel
  open is instant (durations cached).

---

## ✅ DONE (session 136) — Queue row buttons, render filenames, thumbnail placement — **built + verified on the dev build; NOT yet on Fega's installed daily driver**

All three shipped as planned, plus both on-disk cleanups. Verified by driving the
built dev-profile app over CDP.

**What the live drive proved:**
- 29 Queue rows each carry both buttons, hidden at rest (opacity 0,
  pointer-events none); hovering reveals exactly one row's pair.
- **Open in editor** loaded the right clip ("I went speechless #eggingon"), and
  **Back returned to the Queue tab**, not the project clip list.
- **Show in folder** opened Explorer at `…\ClipFlow Renders`, the folder holding
  that clip's MP4 (confirmed against its stored `renderPath`).
- **#188, the exact reported scenario:** retitled a clip and pressed **Queue
  without pressing Save** → the render landed as
  `ZZ Render Probe 136 #arcraiders.mp4`. Pre-fix that file would have been
  `Clip 1.mp4`.
- **Re-render case:** retitling an already-rendered clip updated the store
  snapshot's `renderPath` along with the title (the #188 `updateClip` rename
  fired and propagated back), so no `(2)` twin. Verified on a real clip and
  reverted.
- **#205:** the test render wrote its thumbnail to
  `<project>/clips/<clipId>_renderthumb.jpg` and left **no JPG beside the MP4**.
  28 Queue rows now draw from the moved location, 0 broken images.
- 125 jest tests green. App boots clean with no errors in the log.
- Test render and its thumbnail deleted; the test project's `project.json`
  restored byte-for-byte from a pre-run backup.

**Cleanup results (real library):** renders folder went from 53 mp4 + 54 jpg to
**53 mp4 + 1 png** (the PNG is a deliberate WYSIWYG Shorts thumbnail, untouched).
7 videos renamed to their real titles.

### Three pre-existing things left alone, needing Fega's call

1. **One rename blocked.** `2026-07-20 RL Day9 Pt3 / Clip 6.mp4` (title *"Rocket
   League has the worst kickoffs #rocketleague"*) can't take its proper name —
   an **unreferenced** file of that exact name, byte-identical in size, already
   sits in the folder. It is almost certainly the first render of this same
   clip: it got the name right, the re-render stamped `Clip 6`, and #188 left
   the good name on the orphan. Suffixing `(2)` would have been worse. Deleting
   the 18.6 MB orphan and renaming `Clip 6.mp4` into its place is the fix.
2. **24 orphan MP4s** in the renders folder that no clip points at (~1.4 GB),
   mostly pre-#181 flat-folder leftovers. Listed but not touched.
3. **Two dangling pointers in the real library**, both traced to the dev
   profile's `outputFolder` having been left pointed at a temp folder by an
   earlier session: `2026-07-20 RL Day9 Pt4 / "Clip 1"` has a `thumbnailPath`
   into `…\Temp\claude\clipflow-thumb-test\` (broken image in the UI), and
   `"Clip 3"` in the same project claims a `renderPath` (`Clip 3 (2).mp4`) that
   doesn't exist. #205 closes the leak going forward.

---

### Original plan (for reference)

Three items from Fega: two Queue-row buttons (feature), the "Clip N.mp4"
filename bug (#188 follow-up), and the thumbnail clutter in the renders folder.

---

### Item 1 — "Show in folder" + "Open in editor" on each Queue row

**Feature.** Both tables on the Queue tab (Unscheduled and Scheduled) get two
icon buttons in the right-hand action cell, revealed on row hover.

- **Show in folder** — opens Explorer with the rendered MP4 selected.
  IPC already exists: `shell:revealInFolder` (`main.js:920`,
  `preload.js:39` → `window.clipflow.revealInFolder`). Only rendered clips
  reach the Queue, so the button always has a `renderPath`; still guarded.
- **Open in editor** — jumps straight to that clip in the editor. App.js
  already has `handleOpenInEditor(projectId, clipId)` (`App.js:587`), which
  the Projects clip list uses. Queue clips carry `_projectId`
  (`QueueView.js:538`), so the call is a direct fit.

**Back-navigation.** `EditorView`'s Back currently returns to the clip browser
(`App.js:945`). Opened from the Queue that's wrong — it lands on a project
list. Add `from: "queue"` to `editorContext` and have Back honour it, the same
way `sourcePreviewPath` already routes back to Recordings.

**Hover reveal** uses the row's existing `onMouseEnter`/`onMouseLeave` handlers
(which already mutate `style.background` directly) rather than a hover state —
no re-render of the list on mouse move, and it matches the file's idiom.

**Layout.** Action column grows `104px → 160px` in both grid templates
(header + row must stay in sync). The `1fr` title column absorbs it.

**Files**
- `src/renderer/views/QueueView.js` — two buttons × two tables, grid widths,
  a new `onOpenInEditor` prop.
- `src/renderer/App.js` — pass `onOpenInEditor` to `QueueView`; teach
  `EditorView`'s `onBack` about `from: "queue"`.

**Verify**
- Hover an unscheduled row → both buttons fade in; leave → they fade out.
- Show in folder → Explorer opens with the right MP4 selected.
- Open in editor → correct clip loads; Back returns to the Queue tab.
- Same on a scheduled row. Publish and trash buttons still work.

---

### Item 2 — Renders still land as "Clip N.mp4" after retitling (#188 follow-up)

**Bug. Root cause found — and Fega's hunch about not pressing Save is wrong:
pressing Save would not have helped.**

`useEditorStore` keeps the clip in two places: `clip` (a whole-record snapshot
taken once, when the clip is opened — `useEditorStore.js:212-231`) and
`clipTitle` (the live title box). Editing the title only writes `clipTitle`
(`useEditorStore.js:333`). `clip.title` stays at whatever it was on open.

Saving persists the new title to disk (`_doSilentSave` sends
`title: clipTitle`, `useEditorStore.js:1096`) but **never writes the result
back into `clip`** — so the in-memory snapshot stays stale for the rest of the
session.

The Queue button then does: `handleSave()` → build payload → render
(`EditorLayout.js:318-337`). The payload spreads that stale snapshot
(`renderPayload.js:42-49` — it deliberately overrides `subtitles`,
`nleSegments` and `sfx` with live state, but not `title`), and the main
process stamps the filename from `clipData.title`
(`resolveRenderOutputPath`, `main.js:3111`). Result: `Clip 3.mp4`.

#188's repair path in `updateClip` (`projects.js:266-281`) can't catch it —
it skips deliberately when the caller is setting `renderPath` itself, which is
exactly what a finishing render does (`main.js:3041-3045`).

**Confirmed against real data** — 9 clips in Fega's library have a real title
on record and a placeholder filename on disk, e.g.
`2026-07-17 RL Day8 Pt8` → file `Clip 1.mp4`, title
*"He COOKED me completely #rocketleague"*. 15 `Clip N.mp4` files total in
`ClipFlow Renders`.

**Fix.** One place: `_doSilentSave` writes the saved record back into the
store when it differs.

```js
const res = await window.clipflow.projectUpdateClip(project.id, clip.id, {...});
// The store's `clip` is a load-time snapshot; the render payload spreads it,
// so without this a retitled clip renders under its old name (#188).
const next = res?.clip;
const changed = next && (next.title !== clip.title
  || next.renderPath !== clip.renderPath
  || next.thumbnailPath !== clip.thumbnailPath);
set({ dirty: false, ...(changed ? { clip: next } : {}) });
```

Only these three fields can be rewritten by the main process behind the
renderer's back, so gating on them means a normal autosave swaps nothing and
costs no re-render. Nothing in the editor keys an effect on the `clip` object
(checked: 4 subscribers, all field reads, no `[clip]` deps).

This also fixes the **re-render** case, which a title-only patch would have
made worse: `renderPath` is stale for the same reason, so `uniquePath`'s
"a clip re-rendering onto its own file overwrites in place" check
(`projects.js:38`) currently fails after a retitle and would spawn
`New Title (2).mp4` beside an orphaned `New Title.mp4`.

Batch render ("Render All" in Projects) is unaffected — its clips come from
project state refreshed off disk, not the editor snapshot.

**Files**
- `src/renderer/editor/stores/useEditorStore.js` — `_doSilentSave` only.

**Verify**
- Open a clip titled `Clip N`, retitle it, press **Queue** without pressing
  Save → the MP4 on disk carries the new title.
- Retitle an already-rendered clip and press Queue → one file, correctly
  named, no `(2)` twin; the Queue row still plays and publishes it.
- Retitle, press Save, then Queue → same result.
- Title before rendering → unchanged from today.

---

### Item 3 — A `_thumb.jpg` next to every rendered clip

**Not a bug; a placement mistake.** The thumbnails are needed — Queue rows and
cards, the Projects clip grid and the editor's clip strip all read
`clip.thumbnailPath`. But the render writes its thumbnail as a **sibling of
the MP4 in the output folder** (`main.js:3029-3031`), which is Fega's browsable
renders folder. It currently holds **54 jpgs beside 53 mp4s**.

Every other thumbnail in the app already lives inside the project's private
folder — detection thumbs (`ai-pipeline.js:772`) and repair thumbs
(`render-collision-repair.js:110`) both use `projects.getClipsDir()`. The
render thumbnail is the only one that leaks into user space.

**Fix.** Write it to `getClipsDir(projectId)/<clipId>_renderthumb.jpg` instead.
Keyed by clip id, so it can't collide with a same-titled clip and never needs
renaming when the title changes — which also means it drops out of
`renameThumbnailTo`'s rename set (`projects.js:297-306`); that gets a one-line
guard entry so the intent is explicit rather than accidental.

Nothing else reads the file: no publisher uploads it, and clip deletion
unlinks by `thumbnailPath` (`projects.js:520`) wherever it points.

**Files**
- `src/main/main.js` — `doRenderClip` thumbnail destination.
- `src/main/projects.js` — add `_renderthumb` to the leave-alone suffix list.

**Verify**
- Render a clip → no new jpg appears in the renders folder; the thumbnail
  shows on the Queue row and the Projects card as before.
- Retitle that clip → thumbnail still displays (no rename attempted).
- Delete the clip with "delete files" → the thumbnail goes with it.

---

### Two backfills — need Fega's yes/no (one-shot scripts run with the app closed, not shipped code)

**A. Rename the 9 mis-named MP4s** to match their real titles and update
`renderPath` in each project.json. Six of the fifteen `Clip N.mp4` files are
genuinely still untitled and stay as they are. Safe for already-published
clips — the platforms hold their own copy; publish-log rows keep the old path
as correct history. *Recommend: yes.*

**B. Move the 54 stray `_thumb.jpg` files** out of the renders folder into
each project's private folder, rewriting `thumbnailPath` as they go, and
delete any that no clip references. Leaves the renders folder as MP4s only.
*Recommend: yes.*

---

## ✅ DONE (session 135) — Sounds usability pass (#202 follow-ups) — **shipped as alpha.28, VERIFIED by Fega 2026-07-29, #202 closed**

**Fega's verification, point by point:** waveform shape visible; Alt+drag +
overlap + duplicate work; left-click/right-click as intended; adding a song and
Ctrl+Z work; **"the rendered result is as the editor shows it"**. No follow-up
complaints — notably he did not flag the 42px shorter preview.

**Built exactly as planned below, plus decisions 4–6 (multiple songs).** Verified
on the built dev-profile app via CDP, and cleaned up after (test assets deleted,
both test clips' `sfx` cleared, Clip 1's render record reverted, peaks cache
folder removed, render output deleted — library back to just Fega's Fahh).

**What the live drive proved:**
- Waveform draws inside every block (silence flat, the hit as a bump); peaks
  fetch 236ms cold / 11ms cached.
- Music + SFX lanes both fully visible above the scrollbar at height 276.
- Left trim handle cut 4.59s of head silence: `sourceTime` and `trimStart` both
  advanced by 4.594 — the audible part did not move (right edge pixel-identical).
- Alt+drag duplicated the sound and dragged the COPY; the overlap split the SFX
  lane into two half-height rows, both waveforms readable.
- Right-click opens the settings popover; left-click only selects.
- Song switch: songA 0.3→10.13, songB 10.13→19.0 — no gap, no overlap, status
  line "songB plays from 0:10 · songA now ends there". One Ctrl+Z undid the
  whole switch (songB gone AND songA back to full length); Ctrl+Y redid it.
- Delete key removes a selected sound; Reset in the popover restores the full
  file AND keeps the audible part where it was (tone stayed at 9.11s).
- Legacy-shaped music bed (no anchor/window, written by hand onto Clip 2)
  opened spanning the whole 28s clip — old behaviour preserved.
- Render (real pipeline, 19s clip): 400Hz trimmed tone −22.8dB inside its
  7.8–11.1s window vs −54/−49dB outside; 6.3–7.3s and 11.4–12.4s silent
  (−60/−57dB) so no trimmed silence leaked; songA 150Hz −32.1dB early /
  −58.0dB late; songB 250Hz −48.9dB early / −32.0dB late; two overlapping SFX
  summed +2.5dB; max_volume −10.2dB (no clipping).
- 125 jest tests green (5 new render-graph, 17 new placement-model, 5 new
  time-mapping). The 5 pre-existing `process.exit` script-style test files still
  crash jest workers — unrelated, they predate jest here.

**One real bug caught by the drive:** clicking a sound block let the click bubble
to the scroll container's deselect handler, so selection never stuck (handles
appeared on hover only, Delete did nothing). Fixed by stopping the click the way
every other lane's block does.

**Gotcha worth remembering:** `extractWaveformPeaks` resamples to 1000Hz, so any
test tone above ~500Hz draws a flat waveform (my first 880Hz fixture read as
silence). Real sounds always carry low-frequency content; synthetic fixtures
must stay under 500Hz.

Original plan below.

## 📋 PLAN (session 135, approved) — Sounds usability pass (#202 follow-ups)

**Fega's ask after testing alpha.27** ("good job so far, but before it's
useable"): 1) show the sound's waveform on the timeline block so he can align
it by eye, 2) separate Music and SFX lanes so both can play at once and be
seen, 3) trim a placed sound's start/end (files often have silence around the
actual hit), 4) Alt+drag to duplicate a sound (same gesture as subtitles),
5) right-click — not left-click — opens the volume/remove popover.

**Decisions (Fega, question UI, 2026-07-28):**
1. **Grow the timeline ~35px** (234 → 272 in `EditorLayout.js`) to pay for the
   second lane — full-height lanes, readable waveforms; preview loses ~35px.
2. **Lanes split into two half-height rows when blocks overlap**, single
   full-height row when they don't (same rule on both lanes).
3. **Music is trimmable too.**
4. **Multiple songs per clip** (hyped → sad switch). Adding a song at the
   playhead ends the previous one there; nothing is deleted.
5. **A song is anchored to its footage moment**, like SFX and subtitles — trim
   footage earlier in the clip and the song change travels with its moment.

### The model this collapses to (key insight)

Decision 4 kills the "one music bed spanning the clip" special case, and every
block on both lanes becomes the **same shape**: an anchor at a source moment +
a window into its file.

```
{ id, assetId, name, path, kind: "sfx"|"music", durationSec,
  sourceTime,              // the footage moment it starts on (both kinds)
  trimStart, trimEnd,      // the window of the FILE that plays (both kinds)
  volume, fadeIn?, fadeOut? }        // fades: music only
```

Timeline length = `trimEnd - trimStart` for both kinds. "Song A ends at 0:08"
is just A's window being shortened — visible in its waveform, undoable, and it
needs no new concepts in the preview or the render graph. Music differs from
SFX in only four ways: its default window is as much of the song as fits, it
has fades, adding one clamps the previous song, and it lives in its own lane.

**Migration** — no migration file needed, but three derived defaults on read
(`initFromContext` for the editor, `render.js` for a clip rendered without
opening the editor, so old clips render byte-identically):
`trimStart → 0`, `trimEnd → durationSec`, and a legacy music placement (no
`sourceTime`) → anchor at timeline 0 with `trimEnd = min(durationSec,
timelineDuration)`, i.e. exactly today's spans-the-clip behaviour.

### A. Waveform on every sound block (ask 1)

- `src/main/assets.js`: new `getPeaks(assetsRoot, filePath)` — reuses
  `ffmpeg.extractWaveformPeaks`, caches to `{assetsRoot}/peaks/<hash>.json`
  keyed on path + mtime + size (same validity check as the project waveform
  cache, `main.js:1149-1179`). `peakCount = clamp(round(dur*50), 200, 4000)`.
- `main.js`: IPC `assets:peaks`. `preload.js`: `assetsPeaks(filePath)`.
- NEW `src/renderer/editor/components/timeline/SoundBlock.js` — owns the block:
  canvas waveform (mirrored fill like `WaveformTrack`, violet SFX / teal
  music), sliced to the trimmed window; module-level `Map` peaks cache keyed by
  file path (survives clip switches, one fetch per file per session); flat
  block while loading, no error text (blocks can be 12px wide).

### B. Separate Music + SFX lanes (ask 2)

- `TimelinePanelNew.js`: the one **Sounds** lane becomes **Music** (teal) and
  **SFX** (violet). Kills the z-order trap from session 134 by construction —
  a song and a sound are never in the same row.
- Row assignment (both lanes, same helper): sort by timeline start; a block
  overlapping the previous one drops to row 1 (2 rows max, half height each; a
  3rd overlapper reuses row 0 with z-order). No overlaps → one full-height row.
- Empty-lane hints stay, one per lane ("Add music" / "Add a sound").
- `timelineConstants.js`: `SOUND_TRACK_H` + the sound colour pair (moved out of
  the inline literals currently in `TimelinePanelNew`).

### C. Trim a placed sound or song (ask 3)

- Left/right trim handles on every block, both lanes (same hit-width + visual
  as the Audio lane's).
  - **Left handle** moves `sourceTime` and `trimStart` together, so the
    **audible part stays put on the timeline** while the silence (or the song's
    intro) is cut off — Premiere in-point behaviour, the whole point of the ask.
  - **Right handle** moves `trimEnd` only.
  - Clamps: `0 ≤ trimStart ≤ trimEnd-0.05 ≤ durationSec`. Nothing can be
    stretched past the end of its own file.
- Undo: one `_pushNleUndo()` at gesture start (matches the popover's
  push-on-first-change), not one per rAF tick.
- Preview (`PreviewPanelNew.js`): both kinds collapse to one code path —
  `el.currentTime = trimStart + offset`, block window =
  `start … start + (trimEnd - trimStart)`. Deletes the music/SFX branch.
- Render (`render.js`): one chain shape for both kinds —
  `aformat → atrim=trimStart:trimEnd → asetpts=PTS-STARTPTS →
  (afade in/out, music) → volume → adelay=<block's timeline start>`.
  **asetpts is mandatory**: `atrim` keeps the source PTS, so `adelay` would
  otherwise stack on top and the sound would land late. Fades become relative
  to the block, not the clip.

### D. Alt+drag duplicates a sound or song (ask 4)

- Store `duplicateAudioPlacement(id)` → clone with a new id at the same
  moment, returns the new id. Works on both kinds now that a song is a normal
  block (same song again later is a real move).
- `SoundBlock` body drag mirrors `SegmentBlock`'s proven pattern: window
  listeners (not pointer capture — the drag target swaps to the clone), 3px
  threshold, Alt read at pointerdown OR live off `ev.altKey` (Windows
  swallows the press-time modifier).
- Popover gets a **Duplicate** button too — standing rule: a requested
  capability needs a visible control, gestures are accelerators only.

### E. Right-click opens the popover (ask 5)

- Left click = select the block (highlight + trim handles). Drag = move.
  Alt+drag = duplicate. **Right click = settings popover** (volume, fades for
  music, a "plays 0:12 → 0:41 of 3:07" readout, Reset trim, Duplicate,
  Remove). Selection joins the existing `selectedTrack`/`selectedSegIds` state
  so a background click clears it.

### F. Multiple songs on the Music lane (ask 6 — the switch)

- The one-bed rule comes out of `addAudioPlacement`: no more replace, no more
  "music bed replaced" message.
- Adding a song anchors it at the playhead's **source** moment; its length is
  `min(song length - trimStart, room until the next song, room until the clip
  ends)` — never trailing silence past the end of the file.
- The song playing across that moment has its window shortened to end exactly
  there (**the switch**). Songs *after* the playhead are untouched — the new
  one fills the gap up to them, so nothing is ever silently deleted. One undo
  entry covers add + clamp. Status line says what happened
  ("Sad Song plays from 0:08 · Hyped Song now ends there").
- Dragging the new song later does **not** grow the old one back — expected,
  and each block's right handle is right there.
- Songs may overlap if you drag one onto another (both play, mixed) — the
  two-row stacking makes that visible instead of hiding a block.
- Anchoring (ask 5's answer) needs one small shared helper in `timeMapping.js`:
  `sourceToTimelineClamped` — like `sourceToTimeline`, but when the anchor
  moment itself was trimmed away it clamps FORWARD to the next surviving
  footage instead of returning not-found. Without it, trimming the head of a
  clip would make a song anchored near 0 vanish. SFX keep the existing
  drop-when-its-moment-is-gone rule (correct for a one-shot, already verified).
  Used by the timeline, the preview, and the render so all three agree.
- `RightPanelNew.js`: music "+" tooltip becomes "Add at playhead".

### Files touched

| File | Change |
|---|---|
| `src/main/assets.js` | `getPeaks` + peaks cache |
| `src/main/main.js` | `assets:peaks` IPC |
| `src/main/preload.js` | `assetsPeaks` bridge |
| `src/main/render.js` | unified trim/fade/delay chain, legacy-music fallback |
| `src/main/__tests__/renderAudioMix.test.js` | trimmed SFX, two songs + switch, legacy fallback, parity |
| `.../models/timeMapping.js` | `sourceToTimelineClamped` |
| `.../models/__tests__/nleModel.test.js` | cases for it (incl. anchor inside trimmed footage) |
| `.../timeline/SoundBlock.js` | **NEW** — waveform, drag, trim, alt-dup, right-click |
| `.../timeline/timelineConstants.js` | sound lane height + colours |
| `.../TimelinePanelNew.js` | two lanes, row stacking, popover |
| `.../PreviewPanelNew.js` | one trim-aware playback path for both kinds |
| `.../stores/useEditorStore.js` | trim fields, normalize on load, multi-song add + clamp, duplicate, trim |
| `.../RightPanelNew.js` | music add copy |
| `.../EditorLayout.js` | timeline height 234 → 272 |
| `CHANGELOG.md` | session entry |

### Verification criteria

1. `npx jest` — new filter-graph + timeMapping cases green, existing 99 still
   green, the "no placements → byte-identical graph" assertion untouched.
   (Two existing music-graph strings gain `asetpts`, a no-op on a 0-based
   trim — noted rather than silently changed.)
2. `npm run build:renderer` + dev-profile launch: waveform draws on sounds and
   songs; trim both ends (audible part stays put); Alt+drag duplicates;
   left-click selects without opening the popover; right-click opens it; music
   in its own lane; two overlapping SFX stack into rows; **song A → song B
   switch at the playhead, then trim footage before it and confirm the switch
   travels with its moment**; Ctrl+Z reverses each op once; everything survives
   save → reopen.
3. Render a clip with a trimmed SFX + two songs, spectrally verify (bandpass +
   volumedetect) the hit lands on the right second, song A stops and song B
   starts at the switch, and no trimmed silence leaks in.
4. No-sounds clip renders unchanged; a clip saved before today (legacy music,
   no trim fields) renders the same as it does now.

---

## ✅ DONE (session 134) — Media assets: SFX, music & pictures on clips → **epic #201**

**Decisions (Fega, via question UI, 2026-07-27):**
1. Build order after Phase 1: **sounds first** (pictures after).
2. "Sound Effects Folder" setting: **auto-scan it** — files in that folder
   appear in the SFX tab automatically (linked in place, not copied).
3. Music v1: **manual volume slider + fades**; auto-duck parked.

**Phase 1 (asset library) BUILT + verified (session 134).** New
`src/main/assets.js` + `assets:list/import/delete/favorite` IPC + preload
bridge; Audio panel wired to real data (tabs, search, All/Favorites pills,
upload, click-to-preview, two-click delete); Upload drawer drop zone + button
import for real, images listed with thumbnails; SFX-folder auto-scan live
(folder files linked in place, absorbed into the index so favorites persist,
pruned when removed); `dialog:openFile` learned `properties` passthrough
(multi-select; existing single-select callers unchanged).

**Verified via CDP on the dev-profile app (built renderer):** import inference
(2s wav → sfx, 95s mp3 → music, png → image, .txt refused with reason),
folder scan absorption, favorite persistence, folder-item delete refused with
friendly message, library delete removes index entry + copied file, editor
clip-open clean (no crash), both panels render real data, play/pause preview
works, image thumbnail loads. Test assets cleaned off the real W:\ tree
afterward (dev projectsRoot points at it!) and dev sfxFolder reset.

**Phase 1 verified by Fega on alpha.26 (2026-07-28)** — importing, SFX-folder
scan, drag-drop, favorites all confirmed. Noted on #201.

**Phase 2 (#202 — sounds on clips) BUILT + verified (session 134 cont.).**
- Model: `audioPlacements` on useEditorStore (SFX source-anchored, music
  timeline-anchored, one bed at a time, music defaults 40% volume), persisted
  via the revived `clip.sfx` field in `_doSilentSave`, restored on load, and
  wired into the shared cross-store undo snapshot (`_snapshotStyling`).
- Audio panel + button live: SFX drop at the playhead's source moment; music
  becomes the bed (replace message when one exists).
- Timeline "Audio 2" placeholder → real **Sounds** lane: violet SFX blocks
  (drag to move, commit-on-drop = one Ctrl+Z), full-width teal music block,
  click/right-click opens a settings popover (volume, music fades, remove).
  Music renders below SFX (z-order — first live-drive bug, fixed in place).
- Preview: per-placement `<audio>` synced to the rAF clock (timeline time is
  continuous across cut-seeks so no chasing), music fades applied per-frame,
  full unmount teardown.
- Render: per-placement inputs AFTER the overlay pipe (pipe keeps index n),
  aformat→(atrim/afades music)→volume→adelay→amix normalize=0 duration=first;
  missing sound file fails the render with a plain-language error. Clips with
  no placements build a byte-identical graph (unit-asserted).

**Verified:** 8 new jest tests on the filter graph (parity + mix chains) + 91
existing green; CDP drive on the built dev app: add via panel, drag commit
(+8.4s then pixel-exact 3.64s), Ctrl+Z reverts move/delete, popover
volume/delete, placements survive save→reopen, split+ripple-delete of 2s of
footage shifted the SFX block to the pixel-exact new position of its
unchanged source moment (source-anchoring proven live), preview played both
sounds (airhorn auto-stopped after its 2s window; music tracked the clock
within 0.06s at 40%), pause silences all. Rendered through the real pipeline:
880Hz airhorn energy -24dB inside its 3.6-5.6s window vs -57.6dB outside;
220Hz music bed steady -32.6dB early+late; max_volume -1.6dB (no clipping);
no-sounds regression render clean. Real EO clip restored exactly (nleSegments
byte-identical, test placements stripped); Fega's real "Fahh" import kept
(index rebuilt after my cleanup nuked it — favorite flag lost if it was set).

**CDP traps for next time:** trusted Input needs explicit `buttons` bitmask;
a page reload mid-gesture wedges the browser-process input state (only an app
relaunch fixes it); React hover = `mouseover`, not `mouseenter`; the timeline
auto-scroll during playback moves block coordinates.

**Next: #203 (pictures on clips).** Filed with full scope + risks (overlay
frame-skip signature; overlay page file:// CSP).

Original plan below.

## 📋 PLAN (session 134, approved) — Media assets: SFX, music & pictures on clips

**Ask:** add sound effects, music, and pictures to clips in the editor so they
help sell the clip more, and have them baked into the final rendered video.

### What's already there (surprise finding)

The editor UI already ships shells for exactly this feature — none wired:

- **Audio panel** (rail icon lives) with Music/SFX tabs, search, 9 filter
  pills, favourite + "Add to timeline" hover buttons — permanently empty:
  `DEMO_TRACKS = []` with a self-documenting comment (`RightPanelNew.js:835`).
- **Three inert drop zones**: Brand Kit Logos/Images/Outros
  (`RightPanelNew.js:1146/1154/1162`) and the Upload drawer's "Drop images,
  videos or audio here" (`:1707`). All share a decorative `DropZone`
  (`:673-691`) whose onDrop reads nothing — files dropped today vanish
  silently with no error.
- **Dead "Audio 2" timeline row** — "Drop audio or click to add" button with
  no onClick and no drop handlers (`TimelinePanelNew.js:1191-1207`).
- **"Sound Effects Folder" Settings picker** persisted but read by nothing
  (`SettingsView.js:448-460`, `main.js:223`).
- Every clip is created with `sfx: []` and `media: []` fields no code reads
  (`projects.js:441-442`, `ai-pipeline.js:848-849`) — pre-allocated slots.

So the browse-UI skeleton is ~half built; the data layer, import plumbing,
preview playback, and render compositing are all missing.

### Expanding the brief ("sfx, music, pictures, e.t.c")

**In scope (three phases):**

1. **SFX** — short one-shot sounds (airhorn, vine boom, whoosh) dropped at a
   moment, with per-placement volume.
2. **Music** — a background track under the whole clip, volume slider +
   fade-in/out, trimmable start offset.
3. **Pictures** — static images (reaction memes, emoji, arrows, logo) shown
   for a time range, dragged to position/size on the preview.

**Deliberately parked (named so they aren't forgotten):**

- Animated GIFs/stickers — the burn-in renderer rebuilds its DOM every frame,
  so animation must be a pure function of time and join the frame-skip
  signature (`overlay-renderer.js:328-369`); same trap #148 hit. Static first.
- Video overlays / outro cards (the Brand Kit "Outros" stub).
- Auto-ducking music under voice — v1 is a manual volume slider.
- A bundled royalty-free SFX/music pack — licensing question for a commercial
  product; v1 is bring-your-own-files.
- TikTok trending-audio browsing.

### Key design decisions

1. **Anchoring.** SFX and pictures anchor to **source time** (like subtitles):
   trim or reorder sections and they stay glued to their moment. Music anchors
   to **timeline time** (like captions): it spans the clip regardless of cuts.
   This mirrors the split that already exists in the codebase
   (`useEditorStore.deleteSpanWithClip:443` branches on exactly this).
2. **Storage.** Imported files are **copied** into a ClipFlow-managed assets
   library (`{libraryRoot}/.clipflow/assets/` + a JSON index) so clips never
   break when the original file moves. Per-clip placements live on the clip
   record — reviving the dead `clip.sfx` / `clip.media` fields, saved by
   `_doSilentSave` alongside `nleSegments`.
3. **Pictures ride the existing subtitle burn-in path.** The offscreen overlay
   page already streams transparent PNGs composited over the full frame
   (`render.js:230-238`) — an image layer there needs **zero FFmpeg changes**
   and inherits WYSIWYG for free (same JS renders preview and burn-in).
   `DraggableOverlay` (`PreviewPanelNew.js:355`) already provides
   drag-to-position + resize with percent coords.
4. **Audio is genuinely new plumbing on both sides.** Preview: the single
   `<video>` is today the only clock and audio source; SFX/music need `<audio>`
   elements synced to the playback loop across NLE cut-seeks (with unmount
   cleanup — standing rule). Render: extra FFmpeg inputs with per-placement
   delay/volume mixed into the base track (`adelay`/`volume`/`amix`) — none of
   which exist in any filtergraph today.

### Phases

**Phase 1 — Asset library (the shared foundation)** ~1 session
- New `src/main/assets.js`: import (copy + index), list, delete; IPC + preload
  bridge. Audio duration probed on import (existing ffprobe helpers).
- Wire the Audio panel to the real library (Music/SFX tabs, search, filters,
  favourites). Wire the Upload drawer drop zone + upload buttons to import.
  Wrong-type drops get visible feedback instead of silence.
- Settings "Sound Effects Folder": auto-scan into the SFX tab (open Q below).

**Phase 2 — Sounds on clips** ~1-2 sessions (the big one)
- Placement model + store state (undo via the shared undo stack).
- "Add to timeline" from the Audio panel drops at the playhead; the dead
  "Audio 2" row becomes a real lane showing SFX/music blocks (drag to move,
  trim, delete, right-click menu; volume + fades in a small popover).
- Preview playback: synced `<audio>` elements following the rAF clock.
- Render: per-placement inputs + delay/volume + mix into `[base_a]`.
  **Risk:** input-index arithmetic — the overlay PNG pipe is currently "index
  N after N segments" (`render.js:120,233`); new inputs shift it. Also
  `renderThumbnail` reuses the graph with `{audio:false}` — must stay working.
- Persist to `clip.sfx`, restore on load.

**Phase 3 — Pictures on clips** ~1 session
- Place an image from the panel at the playhead (default a few seconds,
  adjustable range), drag/resize on the preview via `DraggableOverlay`.
- Render: add image layer to the offscreen overlay page
  (`__OVERLAY_CONFIG__` → `overlay-renderer.js`) + matching React layer in
  `PreviewOverlays.js` + frame-skip signature term. **Risk:** the overlay
  page must be able to load asset files via `file://` (check its CSP).
- Persist to `clip.media`, restore on load.

### File impact

- **Phase 1:** new `src/main/assets.js`; `main.js` (IPC); `preload.js`;
  `RightPanelNew.js` (AudioPanel/UploadPanel/DropZone wiring).
- **Phase 2:** `useEditorStore.js` or new `useAssetStore.js`;
  `TimelinePanelNew.js`; `PreviewPanelNew.js`; `render.js`;
  `utils/renderPayload.js`; `projects.js`; `preload.js`.
- **Phase 3:** `PreviewOverlays.js`; `public/subtitle-overlay/overlay-renderer.js`;
  `src/main/subtitle-overlay-preload.js`; `src/main/subtitle-overlay-renderer.js`;
  `projects.js`.
- Cross-tree/bundling: no new cross-tree requires planned; if any appear they
  must respect `build.files` (project CLAUDE.md rule).

### Verification

**What I do (per phase, before handover):**
- Unit tests for placement↔timeline mapping (trim before an SFX → it stays on
  its moment; reorder sections → same).
- `npm run build:renderer` + `npm start`: import files, place an SFX + music +
  image, confirm preview plays/shows them at the right times; reopen the clip
  → everything persisted; render the clip → extract the output's audio/frames
  and confirm the SFX lands at the right second, music sits under it, image is
  visible in the right spot; render a clip with NO assets → byte-path
  unchanged (no regression to plain renders or thumbnails).

**What Fega does (on the next installer):**
- Import a few of his own sounds + a meme image. Drop an airhorn on a goal,
  music under a clip, the image over a moment. Check: preview matches the
  final render, placing things feels quick, and a trimmed clip keeps the
  sound on the right moment.

### Open questions for Fega

1. **Build order after Phase 1:** sounds first (what you named first; the big
   gap) or pictures first (quicker win, ~1 session to something usable)?
2. **The dead "Sound Effects Folder" setting:** repurpose it — anything you
   drop in that folder auto-appears in the SFX tab (recommended) — or remove
   it and import only through the app?
3. **Music v1:** manual volume slider + fades (recommended, simple), or is
   auto-duck-under-voice worth doing now?

---

## ✅ BUILT, AWAITING A LIVE POST (session 130) — automatic 720p fallback → **#189**

Plan in [#189](https://github.com/Oghenefega/ClipFlow/issues/189). **Supersedes the manual
button scope of [#187](https://github.com/Oghenefega/ClipFlow/issues/187)** — Fega reversed
that call: the switch to 720p happens automatically now, with a durable record each time it
fires. Trigger: on clips over ~55s, one full-quality attempt instead of three, then fall
back. Short clips untouched.

**Verified:** 22 assertions green (13 stubbed-network classification + 9 against the live
Graph API). Badge and both Publish Log lines confirmed rendering in the running app via
CDP against an isolated sandbox project. Renderer builds; app boots clean.

**Not yet exercised:** the success path end-to-end — a real long clip actually failing at
1080p and landing at 720p — needs a live Instagram post. Same gap #185 had at ship time.
The live-progress line is in the same bucket (it only renders mid-publish).

Blocked on nothing. The real fix is [#186](https://github.com/Oghenefega/ClipFlow/issues/186)
(hosted delivery), still an open decision.

### Shipped, superseded (session 129) — 720p copy button → **#187**

The click-only button shipped in 0.3.0-alpha.17. #189 makes it automatic; recommend
keeping the button as the escape hatch for when the automatic fallback itself fails.

## ✅ DONE (session 128) — Reorder sections on the timeline (#184)

All five phases built and verified in the running app (dev profile, built renderer
— the daily driver was open, so the single-instance lock ruled out `npm start`).

**Verified:** 91 unit tests green (74 pre-existing unchanged); dragged the third
of three sections to the front → subtitles followed, duration unchanged; one
Ctrl+Z reverted it; playback crossed both seams monotonically (10.9 → 12.0 →
14.0); order survived an app reload; "Move section later" from the right-click
menu reordered correctly and greyed out at the ends; a subtitle deliberately
split across a cut clipped cleanly instead of glitching; click-to-seek on the
waveform still works. Rendered the reordered clip: 30.03s out, frame at 1s
matches source 19s, frame at 13s matches source ~2s with the right burned-in
subtitle.

**Found during verification:** the subtitle mapping returned segments in
recording order, so the karaoke word index and Transcript panel tracked the
wrong word once sections were reordered. Fixed by sorting the mapped output by
timeline position (no-op on an unreordered list).

Original plan below.

---

## 📋 PLAN (session 128) — Reorder sections on the timeline

**Ask:** move a section of a clip in front of another (10s–14s plays before 0s–9s).
Subtitles must follow the section.

**Scope decisions (Fega, session 128):**
1. Drop behaviour = **insert / gapless ripple**. No free placement, no gaps.
2. On-screen captions stay pinned to timeline time — they do **not** follow a moved
   section. Revisit only if it turns out to be annoying in practice.
3. **Duplicating sections is cut** — not worth the ambiguity it creates on the
   timeline. Alt+drag duplicate is out of scope; the whole per-occurrence subtitle
   mapping rewrite (old Phase 3) is dropped with it.

### Where this lands

The video/audio blocks on the **Audio track** (the orange waveform lane) are the
"sections" — one block per NLE segment. Today they can only be trimmed at the
edges, split, and deleted. They can't be picked up and moved, and they can't be
duplicated. Everything below is about that lane. The Subtitle lane already has
free drag + Alt+drag duplicate (SegmentBlock), so it needs no new gestures.

### What already works in our favour

`nleSegments` is an **ordered list**; timeline position is derived by summing
durations in array order (`timeMapping.sourceToTimeline`). So:

- **Reordering is a pure array move.** No coordinate math changes.
- **Subtitles follow a reorder for free.** Subtitle times are source-absolute and
  projected through the ordered segment list on every read, so moving a segment
  moves its subtitles with it — no subtitle data is touched.
- **Render is already order-agnostic.** `render.js` emits one `-ss/-t` input per
  segment in array order and concats them (`buildNleFilterComplex`). A reordered
  or duplicated list needs zero render changes.

### What genuinely breaks, and why

Three places assume the segment list is in **recording order**. Reordering makes
that false. None of them are large, but all three are silent failures if missed.

1. **Extend clamps against index-neighbours.** `extendSegmentLeft/Right`
   (`segmentOps.js:139,169`) treat segment i-1 / i+1 as the source-time
   neighbour to clamp against. After a reorder that's the wrong segment, so
   dragging a section's edge outward would stop early or overlap another
   section's footage. Must clamp against the nearest segment in *source* order.

2. **The playback gap-recovery searches in source order.** Normal segment-to-
   segment advance is index-based and already correct
   (`usePlaybackStore.mapSourceTime:159`). But when the video drifts into a
   deleted span, the fallback picks the segment with the next later *source*
   time (`usePlaybackStore.js:179`, mirrored in `ProjectsView.js:193`) — which
   after a reorder can be somewhere else entirely, so playback jumps. Must
   recover in *timeline* order.

3. **A subtitle straddling a cut point maps to an inverted range.** Today a
   subtitle whose start is in section A and end in section B renders as one
   continuous block, because A and B are adjacent on both the timeline and the
   recording. Reorder them and the start maps late while the end maps early —
   `timelineEnd < timelineStart` — producing a negative-width block
   (`visibleSubtitleSegments:264`). Fega's 1–3 word chunks are short, but a cut
   lands inside one often enough to matter. Fix: when the mapped range inverts
   (i.e. the two segments are no longer contiguous), clamp the subtitle to the
   section containing its **start** and clip the tail. Behaviour on an in-order
   list is byte-identical, so trimmed clips are unaffected. Same guard for
   `visibleWords`.

### Phases

**Phase 1 — Model op + order-safety fixes** (`models/segmentOps.js`, `models/__tests__/nleModel.test.js`)
- `moveSegment(segments, segmentId, toIndex)` — pure array reorder.
- Fix `extendSegmentLeft/Right` to clamp against the nearest segment in *source*
  order rather than array-index neighbours.
- Unit tests: reorder repositions subtitles correctly; total duration unchanged;
  extend clamps correctly on a reordered list.

**Phase 2 — Straddle guard** (`models/timeMapping.js`)
- In `visibleSubtitleSegments` and `visibleWords`: if the mapped end lands before
  the mapped start, clamp to the segment holding the start. Assert in tests that
  an in-order list produces identical output to today.

**Phase 3 — Playback recovers in timeline order** (`stores/usePlaybackStore.js`, `views/ProjectsView.js`)
- Replace the source-order gap search with timeline-order recovery in both the
  editor store and the Projects preview's own copy of the logic.

**Phase 4 — The gesture** (`components/timeline/WaveformTrack.js`, `TimelinePanelNew.js`, `TrackContextMenu.js`, `stores/useEditorStore.js`)
- Body-drag on a waveform block, mirroring `SegmentBlock.onDragStart` (3px
  threshold before the drag engages).
- While dragging: dim the block and draw an insertion indicator at the drop slot.
- Drop commits a new `moveNleSegment(id, toIndex)` store action wrapped in the
  existing `_pushNleUndo()` so one Ctrl+Z reverts the whole gesture.
- Add **Move left / Move right** to the Audio track right-click menu — a drag
  gesture must never be the only path to a requested capability.

**Phase 5 — Verify**
- `npx jest src/renderer/editor/models` green (existing cases unchanged).
- `npm run build:renderer && npm start`, then on a real multi-section clip:
  1. Split into 3 sections, drag the third to the front → preview plays in the
     new order, subtitles land on the right footage, total duration unchanged.
  2. A subtitle that straddled the cut renders as one clean block, not a glitch.
  3. Ctrl+Z once → fully reverted.
  4. Queue + render the reordered clip → the exported MP4 matches the editor
     preview (order, duration, burned-in subtitles).
  5. Existing trim / split / delete / extend still behave on a reordered list.
  6. Reopen the clip after save → order persisted.

### Risks

- **`clip:concatRecut` (main.js:1473) sorts segments by start time** before
  writing `nleSegments` — it would silently undo a reorder. It is reached only
  from the legacy `rippleDeleteAudioSegment` path, which the current timeline
  doesn't call. Confirm it's genuinely unreachable; if not, drop the sort.
- **Straddle guard touches shared mapping code** (`timeMapping.js`) used by every
  subtitle surface — editor preview, timeline, left panel, Projects preview,
  burn-in render. The existing `nleModel.test.js` coverage must stay green with
  no expectation edits; any test that needs changing means the guard is too broad.

---

## ✅ DONE (session 127) — Fix AI titles & captions (#183)

All four phases built and verified. Issue: https://github.com/Oghenefega/ClipFlow/issues/183
Outstanding: in-app confirmation on the next installer (the single-instance lock
blocked a source launch while the daily driver was open), and Fega's read on
whether the new suggestions are actually usable.

Original plan below, kept for the reasoning.

---


Fega's report: the titles/captions are unusable. He hasn't accepted a single
suggestion in days. Evidence from his own data confirms it, and shows why.

### The evidence

Pulled from `%APPDATA%\clipflow\clipflow-publish-log.json` and
`clipflow-settings.json` (`titleCaptionHistory`, 100 entries):

- 31 distinct titles published. **28 of them he wrote himself.** Only 3
  matched an accepted AI suggestion.
- When he *did* accept one, he then edited it down before publishing:
  - AI: "The sideways jump giveth and the sideways jump taketh" →
    shipped: "The sideways jump giveth and taketh"
  - AI: "A 1-0 lead has never felt less safe" →
    shipped: "1-0 leads never feel safe in Rocket League"
  - AI: "The pass was PERFECT and I still blew it" →
    shipped: "The pass was PERFECT"
  He cuts the second clause every time.
- Length: his published titles average **5.5 words** (range 3-8). AI-accepted
  ones average 7.5 (range 6-9). The prompt spec asks for **5-10 words** — the
  spec itself is calibrated wrong.
- His voice, from what he actually ships: "He STOLE my Goal", "I went
  speechless", "How do I miss that", "I chickened out literally", "The fear in
  my eyes", "All part of the plan", "POV: Your brain turns off mid game".
  Short fragments, plain words, zero constructed wit, one ALL-CAPS word for
  emphasis, sometimes a typo. The AI writes complete two-clause sentences with
  a twist.

### Root causes (three, all independent)

**A. The model has never seen the clip.** Only the transcript text is sent —
`useAIStore._collectClipParams` (src/renderer/editor/stores/useAIStore.js:31-52)
→ `buildUserContent` (src/main/ai/title-caption-prompt.js:259-272). No frames,
no thumbnail, no audio. Meanwhile the *detection* stage already sends peak
frames as images (src/main/ai-prompt.js:365-389). The plumbing exists; the
title stage just doesn't use it.

**B. The prompt is over-engineered into blandness.** The system prompt is
14,207 characters (~3,700 tokens) before the transcript is even read: 3
pillars, 4 drivers, an execution spec, a payoff-integrity section, a batch
spec, 6 worked examples, 11 real-world titles, 11 anti-patterns, and a 13-line
DO NOT list. Stacking that many constraints collapses output variety — the
model optimizes for not-breaking-rules, which is exactly what "slop" sounds
like. The prompt warns against cargo-culting a framework while being one.

**C. There is no voice to copy.** `styleGuide` in his store is **empty**. The
only voice signal is a bare list of past picks with no clip context, capped at
100 entries. And the highest-value signal is thrown away: what the AI offered
vs. what he actually shipped is never recorded (`_perClipCache` in
useAIStore.js:21 is in-memory only, dies on app close).

### Proposed fix — 4 phases

**Phase 1 — Show it the clip (frames).**
Send 3-6 evenly-spaced frames from the clip's cut window to the title/caption
call, the same way detection does. Extract on demand via FFmpeg, cache per
clip so regenerate/rephrase don't re-pay.
Files: `src/main/ffmpeg.js` (frame extract helper), `src/main/main.js`
(`anthropic:generate` handler ~2411), `src/main/ai/title-caption-prompt.js`
(accept image content blocks), `useAIStore.js` (pass clip id + cut window).
Verify: generate on a clip whose transcript is uninformative (mostly silence
or filler) — suggestions should reference what's visually happening.

**Phase 2 — Rewrite the prompt around his voice, not a framework.**
Cut the system prompt from ~14k chars to ~3k. Keep: the clip-truth gate, the
no-spoiler rule, sentence case, one hashtag, no emoji. Delete: the pillars /
drivers taxonomy, the real-world-titles list, the 6 abstract worked examples,
and most of the DO NOT list. Replace all of it with **20 of his actual shipped
titles** as the examples. Retune the length spec from 5-10 words to **3-7**,
and add an explicit "fragments beat complete sentences — no second clause"
rule (this is the single most consistent edit he makes).
Files: `src/main/ai/title-caption-prompt.js`,
`src/main/data/caption-hook-examples.json`,
`src/main/data/caption-frameworks.md`.
Verify: side-by-side — run the same 5 clips through old and new prompt, show
Fega both sets blind.

**Phase 3 — Start recording real training data.**
New SQLite table `title_caption_rounds`: clip id, game, transcript, the full
3+3 the AI generated, which one (if any) he accepted, the final published text,
and whether he edited it. Log at publish time, not accept time — so
hand-written titles are captured too. Backfill the 31 published titles from
the publish log + `trackerData`. Then Phase 2's examples come from this table
automatically instead of being hardcoded, and improve on their own.
Also: log captions at publish time — right now the publish log stores only
`clipTitle`, so caption history is being lost entirely.
Files: `src/main/database.js` (migration), `src/main/publish.js`,
`src/main/main.js`, new `src/main/title-caption-log.js`.
Verify: publish a clip → row appears with all fields; a hand-typed title is
recorded as `edited: true` with both the AI options and his final text.

**Phase 4 (optional, later) — Close the loop with real numbers.**
`trackerData` already stores YouTube video IDs and Facebook reel URLs for every
published clip. Pull view counts back via the YouTube Data API (already
authorized) and rank the Phase 3 examples by what actually performed, so the
few-shot set is his best titles, not just his most recent.

### What Fega does
Nothing for Phase 1-3 except review. For Phase 2 verification he picks which
of two blind sets reads better. Optionally: if he wants to seed the voice
faster than the data does, paste 10-20 titles he'd genuinely write — but the
31 published ones may already be enough.

### Open decision
Whether to do all 4 phases, or start with Phase 2 alone (cheapest, no new
plumbing, probably the biggest single jump in quality) and judge from there.

---

## 🔄 ACTIVE (session 124) — Pre-alpha.8 batch: viewer screenshot, Recordings auto-refresh, scheduled visibility, Queue blur-save

Render speed work (skip identical overlay frames + FFmpeg streaming) shipped
`6a16202`, closed #180 untested. Four upgrades below join the alpha.8 batch.
Status: DONE — all four built + verified. Decisions (Fega, via question UI):
screenshot = exact-as-final WYSIWYG; DONE = all scheduled (publish is
automatic after); Published gets its own badge. Verified: thumbnail harness
(1.4s, pixel-matches render frame at same t), full-render regression clean
(27/424 frames, 16.3s), renderer build clean, app boots with all four
modified views mounted, no errors. UI behaviors (blur-save feel, NEW chip,
badges on real scheduled clips) await Fega on the alpha.8 installer.

### 1. Viewer screenshot → Shorts thumbnail
What: camera button in the editor preview toolbar. Captures the CURRENT
paused frame and saves a PNG to the render output folder as
`<clip title>_thumbnail.png`, with a toast confirming + click-to-reveal.
OPEN DECISION: exact-as-final (subtitles + reframe layout burned in, ~2-4s,
uses a one-frame render through the real pipeline) vs clean raw frame
(instant, no subtitles) vs a camera button with both options.
How (exact-as-final): new IPC `thumbnail:capture` in main.js — map playhead
timeline time → source time (timeMapping), single pre-seeked FFmpeg input
through the existing filter graph (buildNleFilterComplex, video-only maps),
one overlay PNG at that timestamp via createOverlaySession, `-frames:v 1`.
Files: PreviewPanelNew.js (button), preload.js, main.js, render.js (export a
one-frame seam) or new thumbnail.js.
Verify: screenshot at a karaoke moment → PNG matches rendered output frame
(text, layout, resolution); saved file lands in output folder; toast fires.

### 2. Recordings tab auto-refresh + NEW badge
Root cause: Recordings tab (UploadView.js) loads its file list on mount and
manual refresh only. The file watcher already emits `watcher:fileAdded` /
`fileRemoved` (preload.js:17-25) but only RenameView subscribes (:397).
Renames rewrite files in the watch tree → Recordings list goes stale until
app reload (Ctrl+R).
How: subscribe ONCE at App level (avoids the preload removeAllListeners
stomp between views), debounce-bump a `recordingsVersion` counter, pass to
UploadView → refreshFiles() on change. RenameView's rename-complete path
also bumps it directly (belt + suspenders).
NEW badge: files first seen since the last time the Recordings tab was
viewed get a "NEW" chip + 7-8px glow dot (ui-standards); clears when the
tab is next viewed. Session-only state, nothing persisted.
Files: App.js, UploadView.js, RenameView.js (bump on rename complete).
Verify: rename a batch in Rename tab → switch to Recordings → files appear
without Ctrl+R, wearing NEW badges; badges gone on next visit; new OBS
recording while app open also appears live.

### 3. Scheduled/Published visibility on Projects tab (the brainstorm)
Current truth: clip.status = none/approved/rejected (review), renderStatus
= rendered, SCHEDULED = trackerData row keyed by clipId (+ clip.scheduledAt
until fire time), PUBLISHED = tracker row whose time passed / publish log
success. ProjectsView receives no trackerData at all today — that's the
entire blind spot. "Send to Queue" (editor) = render + approve; every
approved clip auto-appears on the Queue tab; the manual step Fega can't see
from Projects is SCHEDULING.
Plan (recommended):
- Pass trackerData into ProjectsView (App.js already derives scheduled sets
  from it at :650-662 — same zero-new-persisted-state pattern).
- Clip rows/cards gain "Scheduled" badge (purple, with EST date/time) and
  "Published" badge (emerald) alongside Approved/Rendered.
- Project card status becomes three-stage: "N left to review" → "all
  reviewed · N to schedule" (with count of approved-but-unscheduled) →
  "DONE" only when every clip is rejected OR scheduled/published.
- Detail header adds an "Approved" filter-adjacent count: "2 to schedule".
OPEN DECISIONS: (a) does DONE require published or is scheduled enough?
(b) show Published as its own badge or collapse into Scheduled?
Files: App.js (prop), ProjectsView.js (badges, card status, counts).
Verify: schedule one of two approved clips → Projects shows Scheduled on
that clip, card says "1 to schedule"; schedule the other → DONE; published
clip (past tracker entry) shows Published.

### 4. Queue tab: click-outside saves platform text fields
What: editing the YouTube description (and the other per-platform text
fields in the expanded clip panel) saves automatically when the field loses
focus / on click outside — no hunting for the bottom Save button. Save
button removed (redundant-actions rule) with a brief "Saved ✓" flash near
the field (ui-standards: every action needs confirmation).
Files: QueueView.js (expanded panel field handlers).
Verify: edit description → click anywhere outside → collapse/reopen panel
→ text persisted; restart app → still there.

---

## 🔨 BUILT — AWAITING VERIFICATION (built 2026-07-24, session 125, shipped in 0.3.0-alpha.11 alongside the #181 render-collision fix) — Facebook Reels publishing

Spec: `tasks/specs/facebook-reels-publishing.md`. Built as specced: three-phase
`publishReel` + legacy path renamed `publishLegacyVideo` + ffprobe duration router
(3–90s inclusive → Reels, outside → legacy video, probe failure → legacy).
`surface` reaches the publish log; Reels path stores `facebook.com/reel/<id>` in
platformResults; legacy path stores no URL. Error codes 613/190/200/100/6000 get
plain-language messages. Raw status + finish responses logged for the first real
run (Meta's docs are thin on the video_reels status shape — polling parses
tolerantly and proceeds to finish on an unrecognized shape).

**NOT DONE until Fega verifies:** (1) sub-90s clip appears in the page's REELS
tab, (2) log shows `surface: "reels"` + real post ID, (3) tracker link opens,
(4) the 90.73s clip posts as normal video without failing the batch, (5) non-zero
views after 24h — the only check that proves the fix.

**Why:** every video ClipFlow ever posted to Fega's Facebook page had zero views.
Two independent causes. (1) The Meta app was in Development mode, so posts were
visible only to app-role users; Fega switched the app to Live on 2026-07-24 and
Meta un-hides that content retroactively. No code needed, already done. (2) THIS
TASK: `facebook-publish.js:73` posts to `/{page-id}/videos`, the legacy Page video
endpoint, so clips never enter Facebook's Reels distribution surface. Instagram
already does this correctly (`instagram-publish.js:154`, `media_type: "REELS"`).

**Scope:** API swap only. All 28 of Fega's renders already pass every Facebook
Reels spec (1080x1920, 60fps, AAC 48kHz stereo ~194kbps). No re-encoding, no
reframing, no render pipeline work.

**Build:** three-phase Reels flow (start → binary upload to rupload.facebook.com →
finish), adapted from the working resumable-upload pattern already in
`instagram-publish.js`. Keep the existing `/videos` path as a fallback.

**Fega's locked call:** clips outside 3 to 90 seconds post as a normal video
instead of erroring. The legacy path becomes a proven fallback, not dead code, and
a 90s+ clip cannot be a Reel anyway. Never fail the whole multi-platform publish
over Facebook's format boundary.

**Files:** `src/main/oauth/facebook-publish.js` (rewrite, keep legacy fn as
fallback), `src/main/main.js:3212` (prefer real postId). Nothing else touches FB.

**Bonus:** the Reels finish phase returns a real `post_id`, so the tracker can
finally store a clickable Facebook link in `platformResults`.

**Verify:** clip under 90s lands in the page's REELS tab (not just Videos); the
90.73s clip posts as a normal video without failing the batch; and after 24h a
Reels post shows non-zero views. That last check is the only one that proves it.

**Out of scope:** native Facebook scheduling (`video_state=SCHEDULED`), which
would let FB posts fire with the app closed. Real future win, not this change.

---

## 🗄 PREVIOUS (session 123) — Subtitle upgrades + render queue + Queue-tab delete

Shipped earlier this session (committed `e963c13`, unreleased): render input-seek
speed fix (5min → ~8s FFmpeg phase) + app-level floating render pill. Cut of
alpha.7 deferred until this batch lands.

### A. Auto-capitalize I'm / oh my God (smallest, first)
Where: `resolveSubtitles.js` resolvedSegments map (the single choke point all
three consumers share — editor load `useSubtitleStore.js:353`, projects preview
`buildPreviewSubtitles.js:90`, render `render.js:339`), transforming
`repairedWords[i].word` before text rebuild at `:276-278`.
Rules: standalone i + i'm/i'll/i've/i'd → capital I; "god" → "God" only inside
the word sequence "oh my god" (case-insensitive, within a segment, punctuation
preserved). Gate behind `!hasEditorSavedSubs` so a user's saved hand-edits are
never clobbered on reload (mirrors existing cleanup gates at `:192/:211/:290`).
Verify: fresh clip w/ whisper "i'm" renders "I'm" in panel + preview + render;
hand-edited lowercase survives reopen.

### B. Multi-word input into a word block → real word objects (+ merge)
Root cause: `updateWordInSegment` standard path (`useSubtitleStore.js:542`)
stores the whole typed string (spaces included) into ONE word object → text/words
token desync → highlighter treats phrase as one word (Fega's symptom).
Fix at the commit point: split multi-word input into N word objects across the
original word's [start,end], time distributed by char count (reuse/extract
`redistributeByCharCount` from `cleanWordTimestamps.js:138-166`). Rebuild
seg.text from words. 1-word-mode branch (`:503-529`) unchanged.
Merge (Fega clarified 2026-07-23): merge = SEGMENT merge — "very" and "angry"
each on their own segment → one segment holding both as separate word objects,
shown together on screen, highlighted one after the other. Store action
`mergeSegment` (`useSubtitleStore.js:807-824`) already does exactly this —
verify its callers (may be unwired); expose it in the panel: right-click a
segment row → "Merge with next segment" (+ "previous" if trivial).
Verify: type "I am very angry" into one block → 4 blocks, per-word highlight
walks through them in preview; segment merge combines blocks with sequential
highlighting; undo works for both.

### C. Alt+drag duplicates a subtitle segment on the timeline
NLE convention. Gesture is unclaimed (no modifier handling in the drag path —
`SegmentBlock.js:52-90`).
Impl: capture `e.altKey` at pointerdown in `SegmentBlock.onDragStart`; on 3px
threshold cross with Alt: parent callback (`TimelinePanelNew.js`) runs
`startDrag()` (single undo snapshot; _dragging guard makes inner pushes no-ops)
then inserts a clone (fresh `_newSegId()`, deep-copied words) via new store
action `duplicateSegment(segId)` → returns cloneId; SegmentBlock swaps its drag
target to cloneId so the COPY moves, original stays. Existing overlap-push +
snap logic applies (`handleSubtitleDrag:357-409`); `toSource()` conversion as
usual. `endDrag` on release → one undo entry reverts everything.
Verify: Alt+drag left/right → copy lands where dropped, original untouched,
one Ctrl+Z removes the copy; plain drag unchanged.

### D. Queue tab: discoverable remove + optional delete-from-disk
Existing "Remove" (dequeue → status "dequeued", `QueueView.js:680-686`) is
buried in the expanded panel with no confirm. Plan:
- Hover trash icon on the collapsed row (both sections), matching the session-122
  Review-Rail pattern → small confirm popover with two actions:
  "Remove from queue" (existing dequeue, reversible) ·
  "Delete clip + rendered file" (red, destructive).
- Fix latent gap: `projects.deleteClip` deleteFile branch (`projects.js:366-385`)
  unlinks filePath+thumbnailPath but NOT renderPath — add renderPath unlink.
  Never touches project sourceFile.
- Plumb deleteFile through `project:deleteClip` IPC (`main.js:1719`) + preload
  (`preload.js:87`) as optional param, default false — existing editor/rail
  callers unchanged.
- QueueView needs an onClipDeleted callback prop from App (rows derive from
  localProjects, so App must reload the project — same as `App.js:675` flow).
Verify: trash visible on hover; queue-only removal keeps files; full delete
removes record + rendered MP4 + thumb from disk; source recording untouched.

### E. Render queue — serial, auto-drain (Option A; Fega to confirm)
Main process job manager in `main.js`: render:clip invokes enqueue jobs
({clipData, projectData, outputPath, options}); worker drains one at a time via
`render.renderClip`. Progress events gain `{clipId, clipTitle, waiting}`;
terminal events per job. `render:cancel` takes clipId — current job → 
`cancelActiveRender()`, waiting job → drop from queue (resolve canceled).
`render:batch` re-routed through the same queue (enqueue each clip, await all,
aggregate) so batch + single can never run concurrently — `render.batchRender`
becomes dead and is removed.
Renderer: App.js renderJob gains clipId/clipTitle/waiting + waitingIds; floating
pill shows "Rendering <title> — N waiting" and now ALSO shows inside the editor
when the rendering clip ≠ open clip. Topbar pill/buttons: pill only when the
OPEN clip is current-or-waiting; otherwise Queue/Render buttons stay live
(fixes "button blocked behind other clip's %"). doRender guard: only block for
this clip.
Verify: queue clip A, open clip B → B shows green Queue button + floating pill
for A; queue B → both render sequentially; cancel current vs waiting both work;
"Render All" still works and interleaves safely.

Sequencing: A → B → C → D → E, verify each on source, then cut 0.3.0-alpha.7
carrying today's speed fix + pill + this batch.

---

## ✅ SHIPPED (session 120, 0.3.0-alpha.4 — Fega installed; awaiting his live-look confirmation) — Rename fixes + Projects list redesign

Design approved via mockup `tasks/mocks/projects-list-redesign.html`:
**Rich rows · portal dropdown · folders removed · game + date filtering.**

### 1. Rename — game dropdown clipped by the card (bug)
Root cause: session-group card `RenameView.js:1665` uses `overflow:hidden`
(rounds corners) and clips the dropdown when it opens downward; sibling
`SessionPresetPicker` also shares `zIndex:999` and out-paints it.
Fix: render the `GroupedSelect` menu (`RenameView.js:2008`) in a React
**portal** to `document.body`, positioned from the trigger's
`getBoundingClientRect()`; close on outside-click / scroll.
Verify: dropdown fully visible over the naming pill + rows, nothing clipped;
select still works.

### 2. Hover-reveal checkboxes — Rename + Projects (change)
Now always rendered (Rename `LedgerCheck` 1668/1705; Projects `Checkbox`
1267–1270). Hide by default; reveal on row-hover, and show all in "select
mode" (any selection active). Reuse the `.cfr-acts` hover idiom in RenameView.
Files: `RenameView.js`, `ProjectsView.js`.

### 3. Rename — remove the TEST toggle (change)
Delete `<TestChip>` at `RenameView.js:1709` (+ unused import line 5). Keep
`TestChip.js` (used by Projects/Queue/Upload). `isTest` still auto-set by the
test watcher — only the manual per-row toggle goes.

### 4. Projects list redesign — "launch pad" (feature)
Rows (Rich): game-hue poster (tag + hover play) · title · quiet meta
(`date · N clips`) · per-clip **pip strip** (green approved / red rejected /
dim to-review) + count summary · status pill · Review/Open + trash on hover.
Keep a Tight density variant (pips → slim bar).
Chrome: premium header + subline; **status chips** (All / To review / Done);
**game filter chips** (All games + one per game, counts + color dot);
**Sort dropdown** (Most recent · Oldest · Most to review · Name).
Remove: folder sidebar + "Move to Folder" bulk action (folder store data left
untouched for now). Delete bulk action stays.
Data: real — `clipCount`/`approvedCount`/`renderedCount`/derived status; add
`reviewedCount` (approved+rejected) to `listProjects` for the pip/bar fill.
Files: `ProjectsView.js` (ProjectsListView 790–1652; card 1246–1340; sidebar
1046–1186; sort bar 1197–1226; action bar), `projects.js` (listProjects).
Note: ProjectsView.js is CRLF + emoji escapes → Node patch script for big edits.
Verify in `npm start`: hue poster + pips render; game chip narrows to one game;
sort reorders; status chips filter; hover reveals checkbox/Review/trash;
opening a project still enters the clip Review Rail; no sidebar; delete works.

Open decision: purge folder store data on next launch, or leave it. Leaning leave.

---

## ✅ BUILT (session 117, shipped in 0.3.0-alpha.1, awaiting Fega verification) — Rename tab redesign (#172)

Fega approved the plan at session start ("go ahead with the rename redesign");
built per the plan below in one pass, CDP-verified on a sealed dev-profile
sandbox (scratch watch folder, 7 seeded FFmpeg test recordings across 3 dates
+ a 33-min file, real trusted-input drives):
- Sessions group by date+game with header controls (game picker, Day stepper,
  preset chip, folder icon, parts+duration meta); rows slim with native-aspect
  hover-scrub thumbs (50×56 for 8:9 source, 100×56 for 16:9) and 240px peek
  with exact timestamp (24:45 at 75% of 33:00), flip + clamp + leave-hide.
- Selection: row/session checkboxes (full/half states), shift-click range
  (fixed a real bug: anchor ref was read inside the setState updater — see
  lessons.md), Ctrl+A (gated to visible pane + not-in-input), floating batch
  bar with Rename All / N selected modes.
- Set Game on a subset re-groups under the same date and renumbers parts on
  both sides (AR Pt1-3 + Val Pt1-2 from one 5-file day); day counters per
  game.
- Rename 2 Selected renamed exactly those 2 into `2026-07\` (disk verified),
  History recorded, remaining 5 intact; Rename All ran the 33-min auto-split;
  TEST row routed to `Test\2026-07\` and did NOT advance day counters (#170
  intact: AR ended Day3/2026-07-19, Val untouched by the test rename).
- Undo re-enters pending with placeholder thumb (no filePath) and redo
  removes it; per-row preset picker + header "Mixed formats" divergence +
  header Day stepper all verified; zero console errors in instrumented runs.

**Found while verifying (pre-existing, filed, NOT fixed here):**
- #173 — auto-split children renumber from Pt1 and `fs:renameFile` silently
  overwrites an existing target (real data loss in the sandbox repro).
- #174 — the split parent file re-enters Pending via the depth-2 watcher.

**Unresolved wrinkle (watch for it):** ONE blank-page event occurred during
verification right after a header game change on Val-tagged rows; three
instrumented replays of the same and harsher sequences (divergent presets,
select-all, runaway MiniSpinbox hold + mid-hold group unmount) all ran clean
with zero exceptions, and a render-path audit found no throwable. Repro
scripts preserved in the session scratchpad (`cdp-repro*.js`). If Fega ever
sees a blank Rename tab, that's the thread to pull.

## Original plan (approved session 116, executed session 117) — Rename tab redesign

**Approved direction (mock):** `tasks/mocks/rename-tab-redesign.html` — Variant A
"session ledger" + Set Game re-grouping + hover-scrub thumbnails with pop-out peek.
Fega confirmed hover-scrub, the mixed-game-day flow, and the peek preview size fix.

**Scope:** the Pending sub-tab of the Rename tab only. History and Manage sub-tabs,
and ALL rename machinery (presets, collision handling, auto-split, game-switch
scrubber, day/part detection, test-mode rules #170) stay exactly as they are.
Renderer-only change: no main-process edits, no new IPC, no build.files impact.

**File impact:**
- `src/renderer/views/RenameView.js` — pending-tab render rewritten (session
  groups + dense rows + batch bar + peek); selection state added; `renameAll`
  refactored to `renameFiles(list)` so it can run on a subset; header strip
  replaces stat cards + watching banner. All handlers (renameOne, splitAndRename,
  gameSwitchSplitAndRename, hideOne, detectForGame, day-counter updates) reused.
- Possibly one new component file for the ledger pieces if RenameView.js gets
  unwieldy — decided during the build, nothing else imports it either way.

### Build order (ships as ONE unit — the ledger needs Set Game to change a row's game)

**1. Session ledger layout**
- Group pending files by (date + game tag), sessions sorted by date, rows by
  original filename (chronological).
- Session header: checkbox, "Thu, Jul 17" date, game picker (existing
  GroupedSelect), Day stepper, naming-preset chip (moves up from per-row; the
  per-row name stays clickable as today), "N parts · total duration", folder icon.
- Rows (~70px): checkbox, native-aspect thumb, original name, TEST chip,
  → proposed name (game color, clickable preset picker), Pt stepper, duration,
  hover actions: folder / split video / hide. Split badge inline; the
  game-switch scrubber still expands full-width under its row.
- Slim header strip replaces the 4 stat cards + WATCHING banner: title, pulse
  dot + watch path, stat chips (total / pending / games), Refresh + Add Game.
- Explorer access: `window.clipflow.revealInFolder(filePath)` (preload.js:39,
  already used by Recordings) on every row; session-header icon reveals the
  first file of the group.
- Drag-drop import, import progress banner, retro notifications: untouched.

**2. Selection + floating batch bar**
- Row checkboxes; session checkbox with full/partial states; shift-click range.
- Floating bottom-center glass bar (same shell style as the Recordings batch
  cluster, #123): no selection → "Rename All N Files"; with selection →
  "N selected · Set Game ▾ · Hide Selected · Clear · Rename N Selected".
- Set Game: reassigns game on the selected rows and recomputes day/part via the
  existing detectForGame; groups and proposed names re-derive automatically
  (three games in one day = three headers). Per-game Day counters unchanged.
- Rename Selected / Rename All: same per-file pipeline as today via
  renameFiles(list) — splits, collisions, labels, history entries, and the
  #170 test-mode day-counter exclusion all behave identically.
- Hide Selected: existing hideOne per row.

**3. Thumbnails**
- Native aspect: read the preview frame's own naturalWidth/naturalHeight
  (frames already extracted per file) — container height 56px, width follows
  the real aspect, capped for ultrawide. Zero FFmpeg changes.
- Hover-scrub replaces the timed crossfade in PreviewThumbnail: mouse X picks
  the frame; thin position tick at the bottom.
- Peek pop-out: while hovering, a fixed-position ~240px-wide preview appears
  beside the row showing the current frame full-size with a timestamp badge
  (frames already carry timestampSeconds). Flips to the left near the screen
  edge, disappears on mouse-leave. Every <video>/img cleanup rule respected
  (no <video> used — static frames only).

### Verification

**What I do before handing over:**
1. `npm run build:renderer` clean, `npm run dev` (dev profile) launches.
2. CDP-verify in the dev app with seeded pending files: sessions group
   correctly; select 2 of 8 → "Rename 2 Selected" renames only those and
   History records them; Set Game on a subset re-groups + renumbers both
   sides; Rename All still handles auto-split and game-switch markers;
   folder icon opens Explorer with the file selected; hover shows peek with
   correct timestamp; TEST rows still don't advance day counters (#170).
3. Regression pass: drag-drop import, undo from History re-enters pending,
   preset switching per row, label presets validate.
4. `npm run build` for the installer when Fega wants it on the daily driver
   (feature → minor version bump per version policy).

**What Fega checks on the daily driver:**
- His real 8-part RL day shows as one clean session group.
- Pick a few files → Rename Selected; a mixed day → Set Game flow.
- Hover a thumb: peek is big enough to actually see the gameplay.
- Folder icons land in the right Explorer location.

**Risks / watch out for:**
- renameAll today wipes ALL pending state at the end (setPendingRenames([]));
  the subset version must remove only the renamed rows and their splitInfo /
  scrubber state.
- Undo-created pending rows have no filePath — placeholder thumb, no probe,
  no explorer icon (existing behavior, keep it).
- Selection must exclude rows mid-rename (renaming flag) so double-fires
  can't happen.

---

## ✅ BUILT (session 112, awaiting Fega verification) — Audio track calibration wizard (#169)

Shipped per the plan below. CDP-verified in the dev app (sealed sandbox watch
folder, real 4-track recording): gate fires → wizard renders → per-track
samples extract & play → labels + auto-advance + skip-after-voice → save
writes audioSetup + transcriptionAudioTrack=1 → pipeline proceeded and
whisper transcribed the isolated mic track (7 segments; run then stopped at
the dev profile's missing Anthropic key — unrelated, pre-existing). Cancel
blocks generation with a clear message; 60s decline cooldown stops per-file
re-prompts; 2-track file vs saved 4-track setup re-prompts with the
"setup changed" copy; Settings shows learned labels + Recalibrate + date.

Two bugs found & fixed during verification:
1. `_migrated_audioTrack_v2` migration only set its flag when it flipped
   1→0, so it stayed armed on 0-value stores and silently reverted any
   deliberate track-2 choice on next launch. Now disarms on first run.
2. Settings' mount-time load went stale after a wizard save (all panes mount
   at launch) — now re-reads audio settings on tab activation (isActive prop).

Not live-verified (by construction): sparse-transcript warning UI (threshold
logic only; note: doesn't surface on strict-abort runs since the result never
returns), Recalibrate's native file dialog (undriveable via CDP; post-pick
path identical to verified wizard flow). NOT yet in an installer — Fega tests
on the daily driver, cut one on request.

## Original plan (approved) — Audio track calibration wizard (session 112)

**Problem:** ClipFlow guesses which audio track is the mic. One global setting
`transcriptionAudioTrack` (default 0) drives transcription (ai-pipeline.js:493,
:817), retranscription (main.js:1291), and waveforms (main.js:807, :863). The
Settings picker (SettingsView.js:991-1012) shows hardcoded guessed labels
("Track 1 (Mic)", "Track 2 (Game)").

**Fega's three setups (session 112, verified via probes + OBS screenshots):**
1. *Vertical-canvas era* (months of processed footage): T1 mix, **T2 mic**,
   T4 empty — whisper-verified on 2 files. ClipFlow read T1 = the mix; on
   sessions with vocal music playing, lyrics transcribe into T1 (demonstrated
   on processed project source RL 2026-07-15).
2. *Yesterday's interim setup* (OBS screenshot): T1 mix, T2 Mic, T3 Desktop,
   T4 Chrome, T5 Comms+Music, T6 Music — file only contains T1-T4 (OBS output
   records 4 tracks). Matches probe of 2026-07-17 recording (RL gameplay,
   despite Arc Raiders folder name).
3. *NEW going-forward setup* (OBS screenshot, no recordings yet): **no mix
   track**. T1 **Mic**, T2 Desktop, T3 Chrome, T4 Comms, T5 Music. Current
   setting (0) is CORRECT for this setup — earlier "switch to Track 2" advice
   retracted.

**Trigger-design hole this exposes:** track-COUNT mismatch cannot catch a
setup change that keeps the same count (old era = 4 tracks; new era likely
also 4-5). Count check stays (cheap, catches some cases) but is insufficient
alone → sanity-check trigger added below.

**Design (Fega-approved shape):** listen-and-identify wizard. Full labelling,
with "skip the rest" once voice is labeled — voice is the only required answer.

1. **Probe helper** (ffmpeg.js): `probeAudioTracks(videoPath)` → ffprobe count
   + per-stream info. Cheap, run at calibration/trigger time.
2. **Data model** (electron-store): new `audioSetup` = `{ trackCount,
   tracks: [{index, label}], calibratedAt }`. Labels: voice / game / music /
   mix / other / empty. Wizard ALSO writes `transcriptionAudioTrack` = the
   voice track index — all existing consumers stay untouched (zero pipeline
   changes).
3. **Wizard UI** (renderer, modal): per track — extract short sample via
   existing `extractAudioRange`, play it (muted video preview + `<audio>`;
   MUST have unmount cleanup), user picks label from dropdown. "Skip
   remaining tracks" appears once a track is labeled voice.
4. **Triggers:** (a) first multi-track video entering clip generation with no
   `audioSetup` → wizard before transcription; (b) new video's audio track
   count ≠ `audioSetup.trackCount` → re-prompt (catches some OBS setup
   changes); (c) single-track video → never prompt, use track 0;
   (d) Settings "Recalibrate" button → wizard on a picked recording;
   (e) **voice-track sanity check** — after transcription completes, if the
   transcript is near-empty for a long source (voice track probably moved),
   surface "your voice track may have changed — recalibrate?". Uses the
   transcription that already ran; zero extra compute. NOTE: (e) still misses
   the worst case — a swap where another track ALSO contains speech (e.g. old
   era's T2-mic → new era's T2-Desktop with mix-like content). The full fix is
   the stretch auto-detect (whisper sample per track), which also makes
   mixed-era reprocessing seamless; v1 relies on (b)+(e)+manual recalibrate.
5. **Settings UI:** replace hardcoded 4-button labels with learned labels
   from `audioSetup` + Recalibrate button. Manual override stays.

**Render-path dependency (discovered session 112):** final clip audio = the
source's FIRST audio stream — NLE filter graph uses `[0:a]` labels
(render.js:128, :134); legacy path maps `0:a?` (render.js:460), players
default to the first stream. So Track 1 is the audio bed of every published
clip. A no-mix OBS layout (mic on T1) ships voice-only clips with silent
gameplay. Recommended OBS shape: mix on T1 (render bed) + isolated stems
after (mic T2 → transcription). Future slice: render-audio selection by
wizard label ("mix" labeled track as bed, or amix stems); v1 renders
unchanged.

**Stretch (separate slice, not v1):** auto-suggest voice track by running
whisper on a 30-60s sample per track (proven manually this session).

**Verify:** wizard on the 4-track recording labels all tracks & sets
transcription to T2; subtitles + waveform read T2; track-count change
re-prompts; single-track video never prompts; skip-the-rest works.

---

## GATE PASSED (2026-07-16, session 106) — #164 Phase B: auto-detect proposes the boxes

**Gate results (prototype harness, zero src/ changes):**
- Recall 100%: face found in 8/8 sampled frames on all 6 sources (3 real
  videos + 3 manufactured mini-cam composites, faces down to ~51px). All
  small-face hits came from the tile passes — tiling is load-bearing.
- World classification 6/6 correct (stacked vs overlay).
- Rect accuracy: v1 cam 0/0/0/2px vs Fega's saved layout; v2 band boundary
  702 (visually exact); v3 borderless rounded cam worst-edge ~54px (~2% of
  width; L2/T7/B19); m240 2/3/2/4px; m320 2/2/2/2px.
- m480 (cam corner-abutting RL boost HUD over a dark corner): clean REFUSAL
  (world:none), never a wrong box — the designed failure posture; manual
  calibration remains the path.
- Detector settled: MediaPipe blaze_face_short_range + full-frame pass +
  overlapping tile grids (2/4, +6 below ~1080p-scale cams), consensus =
  cluster present in ≥75% of frames with <2%-diag position spread. NO YuNet
  fallback needed. Runtime = pure WASM (+~11.3MB assets), zero native modules.
- Algorithm: stacked worlds via temporal-variance band step (quiet/loud
  ratio ≥2.5); overlay cam rect via flood over (sharp-in-mean OR V<qTheta
  [abs 6-10]) mask from face seeds, dilate r1, occupancy trim ≥0.12.
- Build-slice refinements noted: native-res edge refine (±60px search at
  full res, fixes v3's right-edge shave), asar/file:// WASM serving (harness
  used localhost http; app loads via loadFile — needs protocol route or
  asarUnpack), HUD-adjacency hardening for m480-class layouts.

Harness + scorecard + annotated overlays: session scratchpad `gate/`
(main.js, index.html, snap.js, postprocess.js, proposal-*.json, annot-*.jpg).

Next: build slices B1-B4 below.

---

## BUILD PLAN (awaiting Fega's go) — #164 Phase B implementation (session 106+)

Ship order: B1 engine → B2 Detect button (face path) → B3 game-only layouts
+ two presets → B4 first-recording auto-offer. One installer at the end
(version sized at wrap). Each slice: build + `npm start` + CDP verify before
moving on.

### B1 — Detection engine in the app (hidden window, zero UI) — ✅ SHIPPED (session 107)

**Built exactly per spec below, verified end-to-end. Deltas + results:**
- Bridge is `window.clipflow.reframeDetect(projectId)` (flat method — matches
  preload.js conventions; the plan's dotted `clipflow.reframe.detect` shape
  didn't fit the file's idiom). Returns `{ success, proposal }` / `{ error }`.
- Verified in dev source AND the packaged exe (win-unpacked; asar list shows
  detect.html + detect-page.js + mediapipe/* + both main files; devDep pruned
  from packaged node_modules as intended). Zero network by construction
  (page CSP allows only blob:; all assets vendored + preload-fs-read).
- Gate reproduction: v1 cam {0,0,2560,1442} IDENTICAL to gate (0/0/0/2px vs
  saved layout); v2 band 704 vs gate 702 (same boundary, video-seek sampling
  vs ffmpeg frames); v3 coarse {28,428,630,356} ≈ gate {28,428,628,356}.
- NEW native-res edge refinement: v3 refined to {30,430,625,353} — all four
  edges within 0-1px of the OBJECTIVE temporal boundary (8-frame native-res
  std profiles: L≈29-30, T≈431, R≈655, B≈783). Two design iterations landed
  on: long-window (12px) quiet/loud qualification + winner = sharpest 3-line
  gradient, floor 6 (hard edges step ~17-32/line; feather ramps ~1-2 and must
  not win). Stacked worlds skip refinement (band boundaries gated 0-2px).
- **Gate's "v3 right edge shaved ~54px" reinterpreted:** the objective
  temporal step sits at x≈655 (exactly where B1 lands). The eyeballed truth
  ~712 is the tail of a feathered/semi-transparent fade on that borderless
  overlay — pixels 656-712 carry damped game motion (std 18-33 vs quiet ≤3 /
  full-game 43-49). A content crop at the hard step is the defensible choice;
  feather taste = user nudge in calibration. Fega eyeballs this in B2 anyway.
- Perf: ~6s total for the 15GB 2560×1440 overlay source (8 seeks + ~470
  detector passes + refinement), similar order for 2560×2880. B2's progress
  state will be short-lived.
- Dev-profile test projects proj_b1v1/v2/v3 (in spike164-watch) point at the
  three gate videos — reusable for B2 CDP verification.

Original B1 spec (implemented 1:1 unless noted above):
Mirror the subtitle-overlay offscreen pattern (subtitle-overlay-renderer.js:189
— hidden BrowserWindow, dedicated preload, loadFile of a static html).
- `public/detect.html` (→ build/detect.html): own CSP meta (`script-src
  'self' blob: 'wasm-unsafe-eval'; connect-src blob:; media-src file: blob:`)
  — the MAIN window's CSP (index.html:7) is UNTOUCHED. Main-window security
  posture unchanged; new single-purpose window noted on the infra dashboard
  when B1 lands (CSP rule in project CLAUDE.md).
- `public/mediapipe/`: vision_bundle.mjs + wasm pair + blaze_face_short_range
  .tflite (~11.5MB, copied from @mediapipe/tasks-vision — pinned 0.10.35 as a
  devDependency; assets vendored into public/ so the packaged app never
  touches node_modules). Loading: dedicated preload reads bytes via fs
  (asar-aware) → blob URLs (+ modelAssetBuffer for the model); page does
  dynamic import(blobUrl). FALLBACK if blob-import misbehaves under file://:
  protocol.handle('clipflow-detect') route in main.js (named, not default).
- `src/main/reframe-detect.js`: `detect:run(sourcePath)` IPC — spawns/reuses
  the hidden window, passes the source path, 240s timeout, returns proposal
  JSON; window torn down after each run.
- Detect page renderer: hidden `<video src=file://source>` seek-sampler (8
  frames 10-90%, WITH teardown — every <video> gets cleanup, crash memory),
  canvas tiles → FaceDetector (grids 2/4, +6 when min(dim)<1200), then
  consensus + world classify + band/region snap ported 1:1 from the gate's
  snap.js (proven constants: quiet/loud ≥2.5, qTheta abs 6-10, theta
  max(10,6·med), dilate r1, trim 0.12, refusal caps).
- NEW vs gate: native-res edge refinement — after the coarse rect, re-search
  each edge ±60px at full res on 2 sampled frames (fixes v3's 54px shave).
- Output: `{world: 'stacked'|'overlay'|'nocam'|'none', camRect, gameRect,
  confidence, faceBox}` — 'nocam' = detector confident no static face
  (≤1 frame hits after consensus), 'none' = refusal (face found, region
  failed). Preload bridge: `clipflow.reframe.detect(projectId)`.
- Verify (B1): dev app console/IPC call on the three real videos reproduces
  the gate proposals (v1 0-2px vs saved layout); packaged exe (`npm run
  build` + install) runs detection with network disabled; `npx asar list`
  shows detect.html + mediapipe assets.

### B2 — "Detect layout" in the Layout panel (face path) — ✅ SHIPPED (session 108)

**Built per spec, CDP-verified end-to-end on the dev sandbox. Results:**
- [Detect layout] button above the boxes in the calibrating view →
  "Analyzing 8 frames…" disabled progress state → stacked/overlay proposals
  prefill the draft via updateReframeDraft (both rects); green status row
  "Found your webcam — adjust or Apply". world 'none'/'nocam' → existing red
  error row: "Couldn't detect this layout — place the boxes manually."
  ('nocam' gets its preset path in B3.) IPC-level errors surface raw in the
  same red row (panel idiom, same as Apply errors).
- Post-await staleness guards: result dropped if calibration closed or the
  project switched mid-run (project-id + draft-null checks via getState());
  stale status line cleared when calibration closes.
- Verified (CDP UI drive, dev profile, proj_polish_real RL Main 2560×2880):
  Detect → cam {0,0,2560,1442} — identical to B1/gate, Δy11/Δh13 vs Fega's
  taste-nudged saved entry — game = complement band {0,1442,2560,1438};
  Apply → "RL Main" entry updated IN PLACE (library stayed 2 entries, no
  duplicate), project.json persisted, panel returned to active view. Error
  path: killed the detect window mid-run → red row "Detection window closed",
  button recovered, follow-up run completed clean. Engine log: stacked,
  confidence 0.943, 8/8 frames.
- NOT footage-tested: the world='none'/'nocam' message branch (no face-free
  source on hand) — 3-line reviewed branch; the red-row mechanism itself is
  proven by the kill test.

Original B2 spec (implemented 1:1 — "updateReframeRect" in the spec text is
updateReframeDraft in shipped code):
- RightPanelNew.js calibrating view: [Detect layout] button above the boxes
  block → "Analyzing 8 frames…" progress state → outcome A (stacked/overlay):
  prefill draft camRect/gameRect, status line
  "Found your webcam — adjust or Apply"; outcome 'none': red-box message
  "Couldn't detect this layout — place the boxes manually" (existing error
  row). 'nocam' handled in B3 (until then: same manual message).
- No store schema changes: detection writes into the existing reframeDraft.

### B3 — Game-only layouts + the two no-cam presets — ✅ SHIPPED (session 109)

**Built per spec, verified end-to-end (parity harness + CDP UI drive + two real
renders). Results:**
- camRect null end-to-end: projects.js whitelist copies null (104 trap),
  render.js/PreviewPanelNew center the game band (y=(1920-band)/2) or go
  full-fill when band ≥1916 (≤1924 → scale absorbs slop; taller → centered
  1920 crop, no distortion), store copy sites null-guarded ({...null} === {}
  trap in commit/entry/apply/ai-pipeline — all four fixed), calibration
  overlay skips the cam box, panel hides the Webcam row.
- Presets in reframeStyle.js (CJS like the rest): presetFullyZoomed = largest
  centered even-rounded 9:16 crop (2560×2880 → {470,0,1620,2880} — matches
  the session-105 cover framing; 1920×1080 → {657,2,606,1076} band 1918);
  presetFitToScreen = full frame. Chips row ("No webcam?") in the calibrating
  view when draft is fresh OR detection returned 'nocam' OR draft already
  game-only (spec-completing addition so saved game-only layouts can switch).
- handleDetect: 'nocam' split from 'none' — nocam sets a green status
  ("No webcam found — pick a game-only layout below") + forces chips;
  'none' keeps the red manual-fallback row.
- Parity: 8/8 pre-existing filter cases byte-identical (no-reframe, stacked
  default + styled seam-0, overlay, corrupt/undefined shapes). Cam layouts
  render through the exact pre-B3 filter text (gameY === camBand).
- Verified (CDP, dev build): chips fresh/hidden-on-cam-draft/shown-on-null-cam;
  both presets prefill exact rects; game box drag after preset (470→708 on a
  40px drag — presets stay starting points); Apply → project.json + library
  entry persist camRect null; edit-existing routes to null-cam draft with
  seeded name; RL Main cam layout re-applied cleanly after (regression);
  composite paints full-bleed / letterbox correctly (pixel probes + shots).
- Real renders (proj_spike164_reframe, 1920×1080@60): Fit to screen →
  1080×1920@60, sharp band centered at y=656 over blurred+darkened bg,
  feathered bottom edge, subtitles composited. Fully zoomed → 1080×1920@60
  edge-to-edge, no bg/feather stages. Both via the app's Render button.
- Live-fired the 'none' refusal E2E by accident of footage: the synthetic
  test pattern triggers ~30 spurious MediaPipe faces/frame → segmentation
  fails → clean world:'none' → manual message (designed posture). world
  ='nocam' (zero face hits) remains footage-untested — 3-line reviewed
  branch; the chips mechanism it triggers is proven via the other two paths.
- Found + filed #166 while verifying (pre-existing, NOT B3): preview fitSize
  stays null until the first resize on the Open-in-Editor path — calibration
  boxes invisible until any panel/window resize. Diff-disjoint from B3.
- Dev sandbox state after: proj_polish_real back on RL Main; SPIKE project on
  "Old HD Canvas"; library gained two game-only test entries ("Game Only
  8x9", "Fit Test HD") — useful for B4 testing.

Original B3 spec (implemented 1:1):
camRect becomes nullable end-to-end ("game-only" layout):
- `src/main/projects.js:265` updateReframe: accept camRect === null
  (whitelist copies null; gameRect still required) — the 104 whitelist trap,
  handled deliberately.
- `src/main/render.js:58,87-93,154-177` isReframeActive drops the camRect
  requirement; camBand=0 when null; game band overlays CENTERED
  (y=(1920-gameBand)/2) instead of below the cam; feather/bg skip when
  gameBand ≥ 1916 (fully-zoomed fills the frame). Null-reframe parity guard
  re-run (existing projects byte-identical).
- `PreviewPanelNew.js:917,1244-1329` compositor mirrors the same math;
  calibration overlay renders only present boxes (skip cam when null).
- `reframeStyle.js`: `presetFullyZoomed(srcW,srcH)` (gameRect = centered
  even-rounded 9:16 crop, camRect null) + `presetFitToScreen(srcW,srcH)`
  (gameRect = full frame, camRect null). CJS exports like the rest (main +
  renderer both consume).
- Panel: preset chips row in the calibrating view when draft is fresh OR
  detection returned 'nocam' — [Fully zoomed] [Fit to screen] chips (existing
  chip idiom, no new aesthetic) prefill the draft; everything stays draggable
  /tunable/saveable (presets are starting points, not modes). Fully-zoomed
  game box: horizontal pan = drag (box keeps 9:16 W:H lock? NO — keep
  free-form per editor conventions; preset just places it).
- Library/store: entries with camRect null save/apply/star normally
  (dims guard unchanged); useEditorStore draft tolerates null cam.
- Verify (B3): real renders of both presets from a horizontal source (mode 1
  fills 1080×1920 edge to edge; mode 2 letterboxed with blurred bg matching
  preview); CDP: chip → draft → Apply → persists → reload; null-reframe
  parity; existing cam layouts regress nothing (render v1 project again).

### B4 — First-recording auto-offer — ✅ SHIPPED (session 110). PHASE B COMPLETE.

**Built per spec below, verified end-to-end. Deltas + results:**
- Decision rule extracted as pure CJS `shouldOfferReframe({sourceWidth,
  sourceHeight, reframe, layouts, dismissed})` in `reframeStyle.js` —
  17-case node matrix passes (8:9-must-offer, 9:16 ±1% skips, entry-match,
  dismissed, undecidable/garbage dims → false, non-array tolerance).
- Banner lives in `PreviewPanelNew.js`: floats top-right over the preview
  (spec's "over the preview/right rail"), Crop icon + spec copy + [Set up]
  [Not for this format]. Evaluated once per project open; latch absorbs
  later condition flips (removing a layout mid-session does NOT resurface
  it). Extra suppressions beyond spec: source-preview shells
  (`__source_preview__`) and Media Offline. Dims resolve probe-fields-first
  then the live `<video>` (readyState-guarded — a src swap reports 0×0, so
  stale element dims can never latch a wrong decision; pre-#164 projects
  with null probe fields re-evaluate when metadata lands).
- [Set up] = `beginReframeDraft()` + one-shot `reframeAutoDetectPending`
  store flag + open Layout drawer; LayoutPanel consumes the flag on mount
  and fires the SAME `handleDetect` as the B2 button (cleared before the
  call; `detecting` guard is the second belt; flag also cleared on cancel
  and clip load). Zero duplicated detection logic.
- "Not for this format" appends `"WxH"` to `reframeOfferDismissed` —
  main.js defaults + migration (the spec's "settings whitelist" doesn't
  exist; `store:set` is generic, so defaults + migration is the whole job).
- Verified (CDP drive, dev build, real footage): banner on proj_polish_real
  with reframe detached + 2560×2880 entries stashed → [Set up] opened the
  drawer mid-"Analyzing 8 frames…" → auto-detect returned the EXACT gate
  rect (cam {0,0,2560,1442}, world stacked, conf 0.943, log-confirmed) with
  green status + chips; Cancel → banner stays away (once-per-open); fresh
  reopen → banner → [Not for this format] → gone + store `["2560x2880"]`;
  reopen → suppressed; app relaunch → still suppressed; dismissed cleared +
  entries restored → entry-match suppresses; RL Main reframe restored →
  reframe-attached suppresses + composite paints (regression clean); LIVE
  9:16 skip on proj_spike164_916 (banner absent). Zero renderer exceptions
  both runs. Dev sandbox fully restored (RL Main re-applied, 4 library
  entries, dismissed []).

Original B4 spec (implemented 1:1 modulo deltas above):
- Trigger: editor opens a project whose source is non-9:16 AND
  project.reframe == null AND no dims-matching library entry AND dims not in
  the dismissed list.
- UX: banner over the preview/right rail: "New recording format — set up a
  vertical layout?" [Set up] [Not for this format] — Set up switches to the
  Layout tab, auto-runs detection, lands in calibration prefilled (boxes or
  preset chips per outcome). "Not for this format" persists the dims to
  `reframeOfferDismissed` (electron-store, main.js defaults + settings
  whitelist — new key, migration-safe default []).
- Verify (B4): CDP: fresh-dims project shows banner once → Set up →
  prefilled calibration; dismiss persists across relaunch; 9:16 project and
  dims-matched projects never see it.

### Cross-cutting
- Renderer detection module is page-scoped (detect.html) — no editor imports
  of mediapipe, so no build.files additions beyond build/ (already shipped).
- Version/installer: one cut after B4 + CHANGELOG; sizing decided at wrap
  (epic-completion candidate for the 0.2.0 line once Fega verifies on his
  real workflow).
- Risks watched: CSP scoped to detect.html only; hidden <video> teardown;
  Vite ESM-only rule untouched (detect page bypasses Vite bundling); dev-mode
  URL vs loadFile dual-path for detect.html (mirror main-window logic).

### Original approved plan (for reference)

Order flip APPROVED (auto-offer = final Phase B slice). Gate footage supplied
by Fega (real, replaces most of the manufactured set):
1. Stacked 2560×2880 (current): `W:\YouTube Gaming Recordings Onward\Recordings\Arc Raiders\2026-07\2026-07-15 13-30-36.mp4`
2. Old vertical canvas: `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\2026-03\2026-03-02 RL Day6 Pt2.mp4` (robustness only — true 9:16 skips reframe in-product)
3. Old horizontal + overlay cam (THE target-customer case, 15GB — frame-extract in place, never copy): `W:\YouTube Gaming Recordings Onward\Recordings\Arc Raiders\2025-12\2025-12-16 AR Day 3.mp4`
Manufactured small-cam variants still get built from these for the 120–300px sweep.

Revised 2026-07-16 against shipped Phase A reality (named layout library,
apply-and-save, style system, aspect-agnostic sources). The Phase B text in
#164 predates all of that. Core unchanged: detect ONCE per layout, static
boxes only, fully local, manual stays the guaranteed path.

**Reality checks that reshaped the plan**
- Fega's real layout (prod library = ground truth): source 2560×2880,
  camRect = full top half (0,0,2560,1440), gameRect = bottom band with taste
  insets (144,1433,2273,1447). STACKED canvas, giant cam — trivially
  detectable. The hard case (100–300px overlay cam on 1920×1080) is the
  target customer, and we own NO such footage — it must be manufactured.
- No vision deps in package.json yet; renderer is Vite/ESM-only (no
  require()); MediaPipe WASM + model must bundle locally (no CDN) and load
  from inside the packaged exe — verify with asar list, not build.files.

**Plan updates vs the original #164 Phase B section**
1. Two-world proposal rule after cam detection: cam = floating island →
   game = full frame (overlay world); cam spans a full-width/height band →
   game = complement band (stacked world, Fega). Geometry only, no game-box
   ML. Taste insets are the user's nudge, not detection's job.
2. Integration = the shipped library flow: trigger when source dims match no
   library entry, plus a manual "Detect" button in the layout editor
   (calibrating view). Proposal lands as a normal draft; the existing
   apply-and-save upsert names it ("WxH — Detected"). Detection proposes
   RECTS ONLY — style (blur/darken/zoom/pan) untouched, comes from
   defaults/library as today.
3. Sequencing flip [NEEDS FEGA OK]: detection core ships first; the parked
   first-recording auto-offer slice (approved session 103) becomes Phase B's
   FINAL slice and consumes detection (offer opens calibration pre-filled).
4. Gate ground truth: score proposed rects against Fega's saved rects —
   cam box scored strictly (edge distance), game box scored on correct
   world-classification only (his insets are taste). Manufactured 1080p set
   from his own footage: cam band scaled to ~120/200/300px, composited over
   the game band at corners; bordered / borderless / rounded variants.
   Answer keys exact by construction.
5. Fallback corrected: MediaPipe full-range model + tiled 2× scan for small
   faces first; if recall still fails → YuNet via onnxruntime-WEB (WASM in
   renderer). onnxruntime-node (native module = packaging risk) is OFF the
   table — the original plan named it in error.
6. Packaging checkpoint moves INTO the gate: the harness is a headless
   Electron page (session-104/105 pattern, window-all-closed guard) loading
   @mediapipe/tasks-vision WASM from local files — proves in-app + packaged
   loading on day one.

**Gate — step 1, zero src/ changes**
- FFmpeg-extract ~8 frames (spread 10–90% of duration, skipping stream-start
  scenes) from 2–3 real recordings + the manufactured 1080p set.
- Harness runs detector → consensus-cluster face hits → snap outward to the
  cam border via a pixels-that-never-change (temporal variance) edge map →
  proposed camRect/gameRect per source.
- Report: found/missed per cam size, mean nudge px, proposal-overlay
  screenshots. Go/no-go on the fallback detector.
- Pass criteria: Fega's cam found in ≥7/8 frames with proposed cam edges
  within ~2% of frame dims vs saved rects; manufactured 200px+ cams found
  reliably; failures are clean no-proposals, never confident wrong boxes.
- Outputs live in the session scratchpad; nothing ships until the gate
  passes and Fega approves the build slice.

---

## DONE (FEGA-CONFIRMED on installed alpha.5) — #164 polish round 3 (session 105b)

Two items from Fega's alpha.4 pass, implemented by Fable directly (no
subagents — policy reversed this session). CDP v4 pass: 19/19, zero
exceptions — active view names the layout, Save button gone, pencil rename
persists, Name prefills from the linked entry, 6 panel sliders load persisted
values, pan sliders drive + persist (H=100/V=0), Apply renames + updates the
entry with no duplicates and without touching the default.

**1. Naming folds into Apply — the "Save layout" button dies.**
- The layout editor (calibrating view) gets a **Name** field, prefilled with the
  layout's current name (or "Layout N" for a fresh one), sitting right above
  Apply/Cancel.
- **Apply layout** now does everything in one click: applies to the clip AND
  saves/updates the named layout in the library (first-ever still becomes the
  default; after that ★ controls it). Draft carries `name`; commit runs the
  existing upsert+link logic (kills the separate save flow).
- Active view: shows the layout's name in the status line ("'RL Dual Band' is
  active…"); buttons reduce to [Edit layout] + Remove. Save-row states deleted.
- Saved layouts list: **pencil icon per row → rename inline** (Enter/blur
  saves) — rename without touching boxes. Apply-on-click/★/dimmed rows stay.
- Consequence (intended): re-applying after a tweak keeps the linked library
  entry current — the layout stays maintained, no duplicates.

**2. Pan gets real controls.**
- Two sliders under Zoom in "Background & edge": **Horizontal** (left↔right)
  and **Vertical** (top↔bottom) — they drive the same bgPosX/bgPosY the render
  reads. Live preview like every other slider.
- The drag-the-Result gesture stays as a bonus, but sliders are the primary,
  visible path (drag-only failed the discoverability test on Fega's pass).

Files: RightPanelNew.js (panel UI), useEditorStore.js (draft name +
commit-with-save merge), reframeStyle.js untouched (bgPosX/Y already exist).
Verify: build + CDP pass (apply-saves-with-name, sliders persist, rename row)
→ cut **0.1.9-alpha.5**.

---

## DONE (FEGA-CONFIRMED via alpha.5) — #164 polish round 2 (session 105)

Fega's four items from his alpha.3 pass, all shipped in **0.1.9-alpha.4**:
1. ✅ Shadow edge option removed (Fade is the only edge treatment; stored
   "shadow" values resolve to fade; migration cleans library entries).
2. ✅ Background no longer stuck on the floor: new default = 2× zoom centered
   on the game box (`bgZoom 50 → 2.0×`, `bgPosX/bgPosY 50/50`).
3. ✅ New controls: Zoom slider (0–100 → 1×–3×) + drag the Result preview to
   reposition the background (content-follows-pointer, clamped, live).
4. ✅ Named layouts: "Save layout" opens a name field (prefilled); "Saved
   layouts" list in the panel (apply on click, ★ default toggle, dimmed rows
   on dimension mismatch, "In use" tag); re-save updates in place (duplicate
   bug fixed by writing layoutId back onto the project after first save).

### Implementation (delegated to 2 Sonnet subagents, reviewed line-by-line)
- All window math in `reframeStyle.js` (`bgSourceWindow`) — parity by
  construction; engines just consume the integer window.
- `render.js` bg chain: `crop=<win>,scale=270:480,…` replaces the
  cover+center-crop pair; shadow branch deleted.
- `PreviewPanelNew.js`: scratch draws the same window; shadow branch deleted.
- `RightPanelNew.js`: chips out, Zoom slider in, Result drag (pointer capture,
  buttons-guard, pointercancel), save row, `SavedLayoutsList`.
- `useEditorStore.js`: `saveReframeLayout(name)` (upsert + link-back +
  default-only-if-none), `applyReframeLayout(entry)` (dims guard).
- `main.js`: layout-library migration re-resolves style (adds bg fields,
  drops seam) — idempotent, fresh-install no-op.

### Verification evidence (session 105)
- `bgSourceWindow` node checks: zoom 0 == old cover framing EXACTLY
  ({470,0,1620,2880} on the 2560×2880 canvas); default = centered half;
  clamps + even-rounding hold on degenerate rects.
- Filter args: no-reframe path has zero `rf_` tokens (byte-identical);
  default style → `crop=810:1440:875:720`; blur=0/darken=0 stages drop;
  zero shadow tokens.
- CDP drive (dev app, proj_polish_real): 22/22 v3 + drag proven in v2
  (pointer counts, pos 36/29 in drag direction, fling clamps safe), zero
  renderer exceptions across all runs. Library migration verified live
  (dev entry gained bg fields, lost seam, kept blur/darken).
- Real render (`RL 2026-07-15.mp4` clone): FFmpeg args contained the
  hand-computed `crop=272:482:838:1713`; frame grab shows correct composite
  (bands + feather + chosen bg region + subtitles).
- Driver gotchas for the record: editor top bar has its own "Save" button —
  scope clicks to the inline row; the Result box needs `scrollIntoView`
  before CDP pointer events land; the timeline zoom slider is a 5th
  `[role=slider]` — scope slider asserts to the panel.

### Fega's verification pass (0.1.9-alpha.4)
- Background sits on the action by default; Zoom slider + dragging the small
  Result preview reposition it.
- Shadow chip gone.
- Saving asks for a name; list picks/applies; ★ moves the default.

### Deferred / parked (carried)
- First-recording auto-offer slice (approved, session 103), Projects-tab
  preview consistency, Phase B (MediaPipe pre-fill), #165 zoom tuning,
  #163 YouTube reconnect messaging, old waveform cache cleanup, session-102
  waveform regression check.

---

## Session 113 — Recordings/disk reconcile + watch-folder split (Fega's 3 issues)

### Findings (all verified read-only against prod DB/store)
1. **Ghost cards:** Recordings tab renders `file_metadata` rows verbatim
   (`allRenamed`, main.js:1834); nothing in the app ever deletes a row, no
   disk-existence check anywhere. 4 ghosts in prod (RL 2026-03-04,
   JC 2026-03-23, JC 2026-03-23 Day1 Pt1, RL 2026-07-15).
2. **Invisible Day7:** `RL 2026-03-04 Day7 Pt1-4.mp4` exist on disk, zero DB
   rows (prod/dev/repo all checked). Mechanism: RenameView.js:612 ignores
   `fileMetadataCreate` failure after the disk rename already succeeded
   (historical trigger unconfirmable). One-time migration regex only matches
   legacy date-first names, never re-runs.
3. **Watch folder:** OBS now pre-buckets `Recordings\<Game>\<YYYY-MM>\`
   (OBS creates month folders; one folder per game). Watcher is depth:0
   (main.js:736); rename dest = `<fileDir>\<month>` → nesting (#171);
   projects tree lives under `<watchFolder>\.clipflow` → changing the
   setting orphans all projects/queue (clip paths absolute, projects.js:308).
4. Side bugs filed: #170 (test renames advance real day counters — RL at
   dayCount 9 / lastDayDate 2026-10-15), #171 (month-folder nesting).

### Plan (approved: reconcile fix; folder design follows Fega's answers)
- [x] 1. Library/watch split: `projectsRoot` store key + idempotent pin-once
       migration; `libraryRoot()` helper; swap project-storage call sites in
       main.js (projects.*, waveform cache, transcripts, pollution migration,
       pipeline, test-project root). Settings shows read-only library line.
- [x] 2. Watcher depth 0→2 (sees `<Game>\<YYYY-MM>\` raws). Rename in place
       when source dir is already a `YYYY-MM` folder (#171). Surface
       `fileMetadataCreate` failure in RenameView instead of swallowing.
- [x] 3. Reconcile on Recordings load + refresh (`metadata:reconcile`):
       flag rows whose file is gone (skip when drive root unreachable);
       adopt untracked renamed files (legacy + tag-first formats, known tags
       only, skip test folders); UI hides missing + "Clean up" button
       (`metadata:removeMissing` — first-ever row delete, confirm-gated).
       Reconcile also repairs impossible day counters (lastDayDate in the
       future → recompute from non-test rows; runs after adoption) (#170).
- [x] 4. Test-mode renames stop advancing real day counters (#170).
- [x] 5. Verify in sandboxed dev profile (backup dev DB/settings, scratch
       watch folder with ghost row + untracked file + nested raw; restore
       after). Build renderer, CDP-check Recordings tab.
- [x] 6. CHANGELOG, commit/push, cut 0.2.2-alpha.1 (includes pending #169
       wizard). Fega installs, sets watch folder to
       `W:\YouTube Gaming Recordings Onward\Recordings`, verifies.

### Outcome (session close)
All six steps DONE and sandbox-verified (commits e0d191d, 3431161, 9d8de89; installer 0.2.2-alpha.1 cut). Remaining: Fega installs, sets watch folder to the Recordings root, confirms — then close #170/#171 (+ #169 wizard pass).

### Success criteria
- Ghost cards hidden immediately; Clean up removes their rows; unplugged
  drive flags nothing.
- Day7 Pt1-4 appear under March 2026 without manual DB surgery.
- Raw files in `Recordings\Arc Raiders\2026-07\` reach the Rename tab; a
  rename there does NOT create `2026-07\2026-07\`.
- Existing projects/queue unchanged after watch-folder switch (library
  pinned to vertical folder).
- Next real RL rename would be Day8 (counter repaired 9→7).
