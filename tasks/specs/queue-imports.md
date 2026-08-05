# Queue Imports — Post Pre-ClipFlow Clips Through the Queue

> Status (2026-08-05): SPEC — shape locked with Fega across Wick sessions 2026-08-04/05,
> greenlit for build. Produced by Wick (GM); build owner: Fable. GitHub:
> [#240](https://github.com/Oghenefega/ClipFlow/issues/240).
> Origin: Fega has 300+ finished vertical shorts from his pre-ClipFlow era (OpusClip,
> DaVinci Resolve) and wants ClipFlow to schedule and post them — keeping his daily
> posting cadence alive while the detection architecture is being reshaped.

## Why (GM context)

- The backlog: `W:\YouTube Gaming Recordings Onward\Downloaded Clips\Opus Clips` — 300+
  finished verticals, MIXED games in one flat folder (Arc Raiders, Bionic Bay, Baby
  Steps, Prince of Persia, Egging On, more), plus a second smaller folder (~20 clips,
  mainly Valorant). No watermarks. Caption styles are older (OpusClip-era fonts) —
  reviewed as acceptable; genuinely weak edits get culled in review, not fixed.
- Cadence math: Fega schedules ~4-5 imports/day alongside fresh ClipFlow clips —
  roughly 8-10 weeks of posting runway with zero editing time.
- **This is a PRODUCT feature, not a Fega-only add-on** (Fega + Wick, locked
  2026-08-04): "bring the library you already have" is an onboarding wedge — a new
  user becomes a daily scheduler on day one, before they trust AI detection. It also
  hardens the distribution-hub thesis. `milestone: commercial-launch`.
- Structural head start: publish machinery is already path-agnostic — publish reads
  `opts.videoPath || clip.renderPath` (QueueView.js). This feature is a front door +
  an entry type, not new publishing plumbing.

## Shape (v1)

1. **Import entry point on the Queue tab:** drag-and-drop video files onto the queue
   AND an Import button that opens the normal OS file picker (multi-select). Waves are
   the expected usage (30-50 files or one game's worth at a time); nothing forces bulk.
2. **Copy-and-keep:** imported files are COPIED to `ClipFlow Imports\<Game>\`, a
   SIBLING folder next to the ClipFlow Renders root — deliberately NOT inside the
   renders tree (library-hygiene tooling assumes per-project structure there, see
   #206). Originals on the source drive are never touched. No auto-delete — the copy
   is the permanent ClipFlow-era archive (Fega decision; ~15 GB total, fine).
3. **Filename cleanup:** strip the leading `#N ` prefix (OpusClip download convention)
   before the name is used anywhere.
4. **One Gemini pass per clip** (rides the existing #193 titlegen path — video with
   audio, ~half a cent/clip, ~$2 for the whole backlog). Single call returns:
   - **title** — the old (stripped) filename is passed as the ANCHOR: the creator
     titled this in the past and those names carry intent; keep the intent and voice,
     improve only where clearly better. Title/card guidance from the Clip Standard
     formulas applies (see #183 comment 2026-08-05).
   - **description + hashtags** — game hashtag merged per the #223 fix.
   - **game guess** — candidates = current games list + the batch's new games +
     "unknown". Low confidence lands as unassigned, never silently wrong.
5. **Review grid before anything is queued:** per-clip thumbnail, proposed title (old
   name one click away), game assignment with bulk-fix (select N rows → assign game),
   platform toggles, skip. **Skip is remembered** — a skipped file does not reappear
   when a later wave re-selects the same folder; already-imported files are detected
   and not offered twice.
6. **Confirmed clips become queue entries** like any rendered clip: manual scheduling
   through the existing slot flow, publish through the existing per-platform path,
   `platformResults` captured by `logPost` as normal.
7. **Platforms: ALL ON by default** (Fega decision). Per-clip YouTube untick is the
   tool for clips Fega remembers already posting there (same-channel exact-duplicate
   risk is the only real one).
8. **New games become real games-list entries** (Baby Steps, Bionic Bay, Prince of
   Persia, Valorant, ...) — the games list drives hashtags/descriptions, and a
   finished story game in the list costs nothing.
9. **Tracker: imported posts COUNT** toward the weekly target and streak, exactly like
   any post. That is the point of the feature — the standard is "posted daily," not
   "manufactured daily."

## Fences (do not cross in v1)

- **Imports NEVER enter taste calibration.** No play-style mining, no
  approved-examples pool, no detection feedback rows. They were edited by other tools
  in a different content era; leaking them into calibration would pollute the #231
  program's ground truth. Mostly naturally excluded (no transcript, no detection run) —
  but enforce it explicitly at every point where "kept clips" are mined.
- **Vertical, finished files only.** Horizontal or odd-aspect files are flagged and
  skipped at import — reframing is Auto-Reframe's arc (#164), not this feature.
- **No editing path for imports.** No subtitle pass, no trims, no re-render. A clip
  posts as-is or gets culled in review.
- **No auto-scheduling, no daily-cap logic.** Fega manages the backlog/fresh mix by
  hand in the queue. Revisit only if he catches himself overfilling.

## Open coder calls (Fable's discretion)

- Skip/imported memory mechanism (content hash vs path) and duplicate detection.
- Reuse vs extend the #193 titlegen prompt for the anchored-title variant.
- Batch UX for a 50-file wave: per-clip Gemini calls queued with visible progress;
  a failed call degrades to filename-as-title, never blocks the batch.
- Whether the review grid is a modal, a queue section, or its own sub-tab.

## Verification (Fega's script, ~10 min)

1. Drag 5 mixed-game files from the OpusClip folder → review grid shows 5 rows,
   `#N ` stripped everywhere, game guesses filled, titles visibly anchored on the old
   names.
2. Fix one wrong game via bulk-select; add a brand-new game (e.g. Baby Steps) without
   leaving the flow.
3. Skip 1 clip, confirm 4 → files exist under `ClipFlow Imports\<Game>\`; the queue
   shows 4 schedulable entries.
4. Re-select the same 5 files → nothing is offered (4 imported + 1 skipped, both
   remembered).
5. Schedule 1 entry to a near slot → it publishes to the selected platforms; tracker
   ring +1; platform links captured in the tracker entry.
6. Include one horizontal file in a batch → flagged and skipped, with a message that
   names Auto-Reframe as the future path.
