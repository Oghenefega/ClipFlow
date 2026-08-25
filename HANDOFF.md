# HANDOFF — Session 198 (2026-08-25)

## Current State

**Batch 5 reviewed, two #306 fixes shipped, 0.4.0-alpha.5 cut, published, and confirmed
installed on Fega's desktop** (Settings reads v0.4.0-alpha.5). #305 and #306 are CLOSED
with `status: untested` — Fega confirmed the update took, not the features themselves.
The installer promotes everything since alpha.4: batches 1–5 plus all review fixes.

Commits: `3220776` (review fixes), `714aa89` (version bump + cut).

## Key Decisions

1. **Review verdict on batch 5: #305 clean, #306 had two real edges.** (a) The Queue tab
   badge (`totalApproved`, App.js) is a deliberate mirror of QueueView's unscheduled
   filter but never got the `repostOf` title-knockout exemption — a waiting repost showed
   in the list while the badge subtracted it, recreating the #139 desync. (b) On a
   failed/missing thumbnail copy, `repostClip` fell back to the ORIGINAL's thumbnail path
   — two clips sharing one file, violating the feature's own "copied, not shared"
   invariant. Now the repost carries a thumbnail only when it owns the copied file.
2. **`splitCopy` durability was traced end-to-end and passed**: saved verbatim in `sub1`,
   `resolveSubtitles` skips whisperx dedups for editor-saved subs, `setSegmentMode` and
   all four `cleanWordTimestamps` passes spread word objects. No fix needed.
3. Review notes were commented on #306; both issues closed `status: untested` after Fega
   confirmed the alpha.5 install.

## Next Steps

1. **Fega's eyeball checks on the installed build**: #305 (split a one-word subtitle) and
   #306 (Repost from Tracker popover + Queue Published shelf) — remove `status: untested`
   on confirmation. Carried batch-4 items too (Rename watcher states, delete dialog,
   completion headline).
2. **Laptop update** — relaunch Corva there, banner should offer alpha.5. First download
   on a machine is full-size; differential starts from the next one.
3. **Next build batch** per the s186 sequencing (Opus@high builds, Fable@xhigh reviews).
4. #307 still open: timeline right-click menu labels Split `S` while the shortcut is `U`.

## Watch Out For

- The two review fixes are UNTESTED by Fega like the features: the badge fix only shows
  when a repost is sitting unscheduled (badge must match list count); the thumbnail fix
  only shows on a copy failure (repost card simply has no thumbnail).
- **#306's queue exemption is load-bearing** (QueueView.js:771 and now App.js:850 —
  BOTH must keep `c.repostOf ||` or list and badge desync again).
- **#305's `splitCopy` flag** must keep surviving spreads — any future pass that REBUILDS
  word objects instead of `{...w}` silently re-arms the dedup and eats a half.
- Standing s190–s197 items unchanged: prod hasn't run the #301 migration path until now
  (alpha.5 IS the installer that carries it — watch first-boot logs if anything odd);
  `gatewayAuthTokenPreMigration` kept until the laptop is on alpha.5; the second half of
  a #305 split drifting its end on mode switches is segmentWords' existing linger rule,
  not a bug.

## Logs / Debugging

- Review verification: `node --check` on projects.js, `npm run build:renderer` clean,
  dev-profile boot clean (`CLIPFLOW_PROFILE=dev npx electron .` — schema v9, no errors;
  plain `npm start` exits 0 silently under the daily driver's single-instance lock).
- Release loop: `npm run build` (background, ~4 min), `scripts/publish-update.ps1`
  (uploaded exe + blockmap + manifest, pruned alpha.4 from the feed), feed verified via
  `curl https://engine.flowve.app/updates/alpha.yml` → `version: 0.4.0-alpha.5`.
- s197's fixture-library harness scripts are in that session's scratchpad if #305/#306
  need re-verification (see b1572b9's HANDOFF Logs section for the file list).
