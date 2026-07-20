# ClipFlow — Session Handoff
_Last updated: 2026-07-20 — Session 115 CLOSED — **Recording tree unified + archived, date-first naming restored, 0.2.2-alpha.2 installed and CONFIRMED by Fega. #170/#171 closed.**_

---

## One-line TL;DR
Consolidated Fega's per-game recording folders into one flat `Recordings\<YYYY-MM>` tree (158 files, zero collisions), archived all pre-July months out of the watch tree (149 files — they're duplicates of already-processed vertical recordings), fixed the preset engine's tag-first naming drift back to the app-wide date-first convention, repaired the four Day7 strays on disk + DB, and shipped it all as 0.2.2-alpha.2 — which Fega installed and verified ("It all works correctly").

## Current State
- **Fega is on 0.2.2-alpha.2 (installed, confirmed).** Watch folder is `W:\YouTube Gaming Recordings Onward\Recordings`; his Day 8 Rocket League renames went through correctly (date-first names, in-place month folder, sane day counter).
- **Disk layout on W:\YouTube Gaming Recordings Onward\ (all moves verified, nothing deleted):**
  - `Recordings\<YYYY-MM>\` — THE watch tree. Flat months, no per-game folders. OBS (reconfigured by Fega) writes everything here.
  - `Archived Recordings\<YYYY-MM>\` — 149 pre-July files (2025-11 → 2026-06). Horizontal duplicates of vertical recordings already clipped. **Never re-add to the watch tree** — they'd flood Rename (~100 raw-named files) and adoption would create duplicate library entries.
  - `Bionic Bay Videos\` — moved up out of Recordings; project workspace (raws + VO .m4a + edits), not a watch target.
  - `Vertical Recordings Onwards\` — unchanged; still the project library (`projectsRoot`), retired as watch target.
- **#170 and #171 CLOSED** (Fega confirmed on installed build). **#169 (audio wizard) still OPEN** — needs its own hands-on pass; today's confirmation didn't exercise it.
- Prod DB was directly modified this session (4 row updates, see below) — backup was taken to session scratchpad, which is gone next session; the DB has since been confirmed healthy in-app, so no lingering dependency on that backup.

## What Was Built (commit b2bc28b)
- **Date-first naming restoration.** The preset engine (`naming-presets.js formatFilename()`) had drifted to tag-first output (`RL 2026-03-04 Day7 Pt1`), clashing with the app-wide date-first convention: Recordings card labels couldn't strip the date (`shortName` expects leading date) and RenameView's same-day part checks (`startsWith(fileDate)`, lines ~383/457) never matched. Fixed: date now leads for the three date-using presets; tag-only presets unchanged. All real renames route through main's `formatFilename()` — renderer `getProposed()` is preview-only and was mirrored. Preset labels/examples updated in RenameView + SettingsView. **Preset IDs deliberately unchanged** (`tag-date-day-part` etc.) to avoid a store migration — don't "fix" the id-vs-output mismatch.
- **Reconcile patterns updated** (`reconcile.js`): `DATE_FIRST_PATTERN` (renamed from `LEGACY_PATTERN`) is now the current format with Day/Pt optional (so `2026-03-15 AR.mp4` adopts); `TAG_FIRST_PATTERN` demoted to legacy. Verified: raw OBS names (incl. `-vertical`) still parse as null.
- **Data repair (one-time, not code):** the 4 `RL 2026-03-04 Day7 Pt1-4` files renamed on disk to `2026-03-04 RL Day7 Pt1-4` in `Vertical Recordings Onwards\2026-03\`, and their `file_metadata` rows updated (current_filename/current_path) via sql.js with app closed. All 4 verified pointing at existing files; 0 stale tag-first rows remain.

## Key Decisions
- **Old months archived out of the watch tree instead of a date-cutoff feature** — a folder move solves "don't ingest pre-July" permanently with zero code.
- **Per-game folders eliminated entirely** — ClipFlow keys games off the rename-time tag, never the folder; the game folders were pure user-error surface (RL footage kept landing in the Arc Raiders folder via a stale OBS profile).
- **Day7 repair done as disk rename + direct DB row update** (not via reconcile's missing→re-adopt churn) — surgical, preserves row IDs, avoided a Clean-up click on fresh rows.
- Version sized 0.2.2-alpha.1 → 0.2.2-alpha.2 (single bug-fix = alpha tick; cut immediately rather than batched because any rename on the old build reproduces wrong-order names).

## Next Steps (priority order)
1. **#169 hands-on pass** — Fega runs the audio calibration wizard on a real multi-track recording (still the standing verification from session 112).
2. **#167/#153 proper fix** (neutral STORE_DEFAULTS + wizard-owned folder setup) — remains the top substrate candidate.
3. Backlog grooming: 20 open code issues, oldest from 2026-07-01 (#149-#157 cluster).

## Watch Out For
- **`Archived Recordings\` must stay out of any watch/library path.** If Fega ever asks why old clips aren't in ClipFlow, this is why — intentional.
- **Test Footage still contains tag-first strays** (e.g. `RL 2026-10-15 Day9 Pt1.mp4`, referenced by a test project) — left alone deliberately; they'd display long names in the test group. Don't "clean them up" without asking.
- The naming preset IDs (`tag-date-day-part`) no longer describe the output order — cosmetic; renaming IDs requires a store migration for zero user benefit.
- Adoption's known-tags guard is what keeps archived-style names from mattering; if a new game tag is added that collides with an archived file's tag, re-scan behavior is unchanged (archive is outside the tree anyway).
- Old prod DB twin at `<repo>\data\clipflow.db` still stale/harmless — never `git add -A`.
- `tasks/mocks/*` untracked files remain untracked — leave them.

## Logs / Debugging
- **This session's file moves:** consolidation manifest (158 rows SOURCE→DEST) was written to session scratchpad — gone next session. Durable record: this file + the `project_obs_recording_layout` memory (disk reorg is not an app change, so it's not in CHANGELOG). Move counts: 158 consolidated → 149 archived + 9 kept in `Recordings\2026-07`.
- **DB row updates:** 4 UPDATEs keyed on old current_filename, `updated_at` bumped; row IDs unchanged (be617674…, 2417ba22…, 56ae3922…, 32fd9b1e…).
- **Verification evidence:** formatFilename unit-checked across all 6 presets (module-require stub for electron-log/database); parseRenamedFilename round-trip on 6 cases; shipped asar extracted and grepped — `{date} {tag}` present in `dist/win-unpacked/resources/app.asar`. Fega's in-app confirmation 2026-07-20.
- **Naming scope log lines** unchanged (`naming` scope, electron-log); reconcile log lines per session-113 handoff still current.
