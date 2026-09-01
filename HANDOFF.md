# HANDOFF — Session 226 (2026-09-01)

## Current State

**#347 fixed, committed (a344d9e), pushed — awaiting Fega's in-app verification,
NOT yet in an installer.** Fega reported a clip titled identically to an
already-published clip vanishing from the Queue tab and wearing a false
"Published" badge. Root cause: three mirrored spots (QueueView list knockout,
App.js badge count, ProjectsView `makePublishState`) matched clips against
tracker entries by exact TITLE as well as clip id — a shim for the 26 id-less
tracker entries from March 2026. All three now title-match only those id-less
legacy entries. Also: the WYSIWYG Shorts thumbnail filename gained a clip-id
tail so same-titled clips in one project can't clobber each other's PNG.
No video files were ever overwritten (per-project folders + ` (2)` suffix
guards held) — the damage was purely UI.

## Key Decisions

- **Title fallback scoped, not removed** — the 26 March-2026 id-less tracker
  entries still need it; everything since carries `clipId` (verified in the
  live store).
- **Thumbnail stays title-led with an id tail** (`…_thumbnail_taum.png`) —
  Fega browses the folder manually to upload, so a pure-id name was rejected
  as hostile. Recapture still overwrites the clip's own file.
- **No installer cut** — 1 change since alpha.15; batching per standing rule.

## Next Steps

1. **#347 verification by Fega** (needs next installer): title a new clip
   identically to a published one, render → it must appear in the Queue with no
   Published badge. Then close #347 (it will NOT auto-close — commit says
   "(#347)", not "Fix #347").
2. **#341** (content-type-aware rejection chips) and **#342** (ambient
   background for non-editor tabs) — filed s223, still unbuilt.
3. s225 leftovers: ALL-CAPS caption rule offer (unfiled); two #346 paths
   logic-verified but never exercised live (merged schedule cell with a date,
   over-limit tag blur-refusal).

## Watch Out For

- **His incident clips**: the new Pt5 clip was self-rescued by retitling to
  `100T Vora is INSANE!!!` and is scheduled 2026-09-04 2:30 PM; the Pt4
  original was re-rendered by Fega at 22:24 during his own investigation
  (harmless). Don't "clean up" either.
- The retitle-after-capture case still orphans the old thumbnail PNG under the
  old name (path never stored on the clip — editor only toasts it). Remedy is
  recapture; documented in the main.js comment.
- `renameThumbnailTo`'s `_thumbnail` suffix branch no longer matches the new
  `_thumbnail_<tail>` stems — fine today (nothing stores capture paths in
  `thumbnailPath`), but if a future feature starts storing them, revisit.

## Logs/Debugging

- Filter logic was proven against the REAL prod store read-only
  (`%APPDATA%\clipflow\clipflow-settings.json` → 155 tracker entries, 26
  id-less, all 2026-03-05→12): old filter hid the incident clip, new one
  doesn't; legacy titles still knocked out; clip A still published-by-id.
- Dev boot clean (`sess_8c82617f608b`): scheduler correctly disabled on dev,
  window revealed, no errors; dev tokens still `{"accounts":{}}`; killed by
  PID, Corva.exe daily driver untouched.
