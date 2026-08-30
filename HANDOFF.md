# HANDOFF — Session 222 (2026-08-30)

## Current State

**React shows exist, the week's data is migrated, and alpha.13 is on the feed.** The
brainstorm ("everything react is dumped in Just Chatting") resolved into four per-show
content-type entries — 100T Valorant Reacts (`100T`), Robot Olympics Reacts (`ROBOT`),
GTA6 Reacts (`GTA6-R`), RL Sub Reacts (`RL-R`) — each with seeded YouTube tags/description,
color, hashtag, and an "About This Content" blurb. Three data migrations ran against prod
(app closed, all backed up to `%APPDATA%\clipflow\data\backup-2026-08-30-show-migration\`):
projects renamed/recolored with per-show day numbering, **all 123 per-clip gameTag
overrides re-filed** (every clip carried one — not just the one "Val" stray), 78 feedback
rows moved into per-show buckets (JC keeps its 5 July World-Cup rows), and 27 tracker
history cards relabeled (16 → 100t, 11 → gta6-r, all matched by clipId, zero guesses).

**alpha.13** (`7c29810`) promotes the session's two code changes: the AI-title game
dropdown is steer-only (#334, reverses #197's clip write-through), and content entries'
`aiContextUser` reaches detection's CONTENT CONTEXT (#333). Fega has not yet confirmed
installing it.

## Key Decisions

- **Flat show entries over a game+react toggle** — everything (learning, queue metadata,
  hashtags, art, day counters) already keys off the entry tag; a per-game react mode would
  rebuild all of that for less. Optional "linked game" field deferred to #336.
- **`GTA6-R`/`RL-R` carry the `-R` suffix; `100T`/`ROBOT` don't** — suffix only where a
  gameplay twin exists or will (Fega's call). Tags >4 chars + hyphens verified safe: no
  maxLength, exact-match resolution, tags never parsed back out of filenames.
- **The existing "GTA 6" game entry stays untouched** — it's the future gameplay entry
  (researched Aug 27); GTA6-R inherited its curated ytDescriptions instead.
- **Frozen publish snapshots stay frozen** — the tracker retag changed only `row.game`
  (the pill/stats label); `published.*` and `mainGameAtTime` are the record of what shipped.
- **Feedback rows follow project renames** — `video_id` IS the project name
  (feedback.js:110), so every rename updated `video_id` in the same UPDATE or the
  approve↔reject retract/dedupe key would break.

## Next Steps

1. **Fega installs alpha.13** and confirms: dropdown no longer re-files clips, and Settings
   → Games → Edit on a show reads "About This Content". Then close #333/#334 (untested label).
2. **Fega polishes the shows** (in-app, no code): upload art per show ("Choose image…" —
   Steam lookup won't find shows), review the four seeded tag/description sets, refine the
   context blurbs. First react pipeline run after alpha.13: check the persisted prompt file
   shows the CONTENT CONTEXT block (closes the #333 verification loop).
3. Deferred, filed: #336 (linked-game field on content entries), #337 (add content type
   from Rename view + context step in the Add flow).

## Watch Out For

- **Per-clip `gameTag` overrides exist on EVERY clip of the migrated projects** (now set to
  their show). Any future migration or per-clip logic must assume clip-level tags are the
  norm, not the exception — clip.gameTag beats project.gameTag in every resolution path
  (QueueView.js:668, captionResolve.js:35).
- **ytDescriptions is keyed by display NAME** — renaming a show entry orphans its
  tags/descriptions set. Pre-existing fragility, now with 4 more entries exposed to it.
- **The migration scripts are one-shot and already ran** — `migrate-shows.js` /
  `retag-tracker.js` live in this session's scratchpad (gone with it); their guards abort
  on re-run (tags exist). Backups remain in the folder above; restore = copy back with the
  app closed.
- **Tracker `entry.game` convention:** lowercased short tag for auto-posts, hashtag slug
  for manual logs; `resolveGameDisplay` matches tag/hashtag/name case-insensitively. The
  retagged rows use lowercased show tags (`100t`, `gta6-r`).

## Logs / Debugging

- Dev boot this session: `%APPDATA%\clipflow-dev\logs`; tokens verified `{"accounts":{}}`
  before boot and left untouched; dev electron killed by PID (46760) at wrap of the drive.
- CDP driver: fresh `cdp.py` in scratchpad (websocket-client, `suppress_origin=True`,
  utf-8 stdout reconfigure for emoji labels). Trap 60 added to
  `project_cdp_verification_gotchas` from this drive: whole-word matchers, visibility+
  region filtering, screenshot after the first no-op click — the nav is a BOTTOM bar.
- Release build ran foreground with `NODE_OPTIONS=--max-old-space-size=8192`, clean through
  `building block map`; feed verified serving `version: 0.4.0-alpha.13`, alpha.12 pruned.
