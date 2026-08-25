# HANDOFF — Session 197 (2026-08-25)

## Current State

**Batch 5 built and machine-verified: #305 (cut a one-word subtitle in half) and #306
(repost a published clip).** Two commits, one per feature, plus the changelog — all
pushed. Both issues are left OPEN with a full verification write-up commented on each;
Fega hasn't eyeballed either yet. Everything from s195/s196 still stands: batches 1–4
built + reviewed, **the installer covering them is still uncut**, and batch 5 is now
sitting in front of it.

Commits: `fa5e3fb` (#305), `e964752` (#306), `084b596` (changelog).

## Key Decisions

1. **#306 copies the THUMBNAIL as well as the render** — one step beyond the approved
   spec. `deleteClip(deleteFile)` unlinks `thumbnailPath` too, so a shared thumbnail
   meant deleting a repost would strip the frame off the original's Tracker popover,
   which is the very surface the Repost button lives on. `filePath` (the pre-cut clip
   file) is still shared — that's `duplicateClip`'s existing behaviour and was left alone
   rather than widening scope.
2. **Verification ran against an isolated fixture library, not the real one.** Dev
   `projectsRoot`/`watchFolder` were repointed at a scratchpad tree holding a throwaway
   project (gotcha 48), so the editor's autosave and the repost's file writes could be
   fully destructive at zero risk. Settings were restored from backup at teardown.
3. **No publish was run** — #306's `logPost` passthrough and the AI-training fence are
   left for the review session to read, per the spec.

## Next Steps

1. **Fable@xhigh review session** on `fa5e3fb` and `e964752`, commit-by-hash. The two
   things worth the reviewer's attention are named under Watch Out For.
2. **Cut the installer** covering batches 1–5 (`clipflow-update-launcher`) — carried
   from s195, now with two more features folded in.
3. Fega's eyeball checks: #305 and #306 in the real app, plus the carried batch-4 items
   (Rename watcher states, delete dialog, completion headline).
4. #307 (filed this session): the timeline right-click menu labels Split with `S` while
   the shortcut is `U`, and the hint is hardcoded so it ignores rebinds.

## Watch Out For

- **#305's `splitCopy` flag has to survive three hops to work**: the words array through
  `setSegmentMode`'s rebuild, `cleanWordTimestamps` (all passes spread `{...w}`), and
  `segmentWords` (passes word objects by reference). It does today — the 3w→1w→3w→1w
  round trip was run and both copies survived — but any future pass that REBUILDS word
  objects instead of spreading them will silently re-arm the dedup and eat a half.
- **#306's queue exemption is load-bearing.** `c.repostOf ||` at QueueView.js:771 is the
  only reason a repost isn't filtered out for matching its original's title. If a
  simplification pass removes it, reposts vanish with no error.
- **The second half of a #305 split drifts its end time on every mode switch**
  (7.0 → 7.4 → 7.8 → 8.0 across the round trip). That is segmentWords' existing
  linger/min-display rule stretching the last word of a partition, not new behaviour —
  don't "fix" it as a split bug.
- Standing s190–s196 items unchanged (see b1572b9's HANDOFF): prod hasn't run the #301
  migration; `gatewayAuthTokenPreMigration` kept until the installer reaches the laptop;
  completion headline still never eyeballed on screen.

## Logs / Debugging

- Verification harness lives in this session's scratchpad: `drv.js` (CDP evaluator),
  `key.js` (trusted key dispatch via `Input.dispatchKeyEvent`), `shot.js` (screenshot),
  `mkfixture.py` (builds the fixture library + repoints dev settings),
  `checklie.py` (reads split results straight off the fixture's project.json).
  `clipflow-settings.dev.backup.json` is the restored-from backup — dev profile is back
  on the real library, verified after teardown.
- Reading split results **off disk** (the editor autosaves ~800ms after every edit) was
  far cheaper than walking the React fiber tree for store state. Worth reusing.
- New CDP trap recorded as #57 in the `project_cdp_verification_gotchas` memory: the
  Tracker calendar only renders the visible week, so a seeded entry dated outside it
  reads as "the feature didn't render". Cost one restart.
- No app errors in `%APPDATA%\clipflow-dev\logs` during the run; nothing new in Sentry.
