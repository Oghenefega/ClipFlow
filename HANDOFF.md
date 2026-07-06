# ClipFlow — Session Handoff
_Last updated: 2026-07-05 — Sessions 94–95 — **Now Playing Tracker Phase 1 BUILT (Wick's spec, same-day) + all calendar dates moved to Fega's local clock (#160). Awaiting Fega's in-app verification; installer not yet cut.**_

---

## One-line TL;DR
Fega gave the go on Wick's tracker spec and the whole Phase 1 shipped in one session (`bc973cb`): full TrackerView rebuild to the approved mock, honest per-platform publish data at the logPost seam, XP/rank/streak engines, PNG recap share — then a follow-up (`921f41f`) fixed the UTC-date class everywhere after Fega declared "I always want the time of stuff to be EST" (#160 closed `status: untested`).

## Current State
On **0.1.8-alpha.12** installed; source is now **8 commits ahead** of the installed app (sessions 90–95: Review Rail card, #148 animation fix + prior fixes, tracker rebuild, date fixes) — all riding the next batched installer. Fega asked "what's next" and said Phase 2 must be its own phase; he has NOT yet verified the tracker in-app or asked for the installer. Working tree: usual never-commit `data/` pair + `tasks/mocks/` scratch.

## What Was Just Built
- **Now Playing Tracker Phase 1** (spec: [tasks/specs/tracker-now-playing.md](tasks/specs/tracker-now-playing.md), all Fega-locked decisions honored):
  - `src/renderer/views/TrackerView.js` — full rebuild (1,000 lines): NOW PLAYING banner + game switcher (sets `mainGame`), editable weekly target (raise-always / lower-below-posted-blocked), pace ring + by-today tick, rank card, stakes bar (behind/safe/streak-over states), Mon–Sat day columns, log/detail popovers (platform picker; "View post" links via `openExternal`), compact template mini-editor overlay (full-page edit mode retired), recap card + PNG share, CSV keeps a new `PlatformResults` JSON column.
  - `src/renderer/utils/trackerEngine.js` — pure logic: `rankForXp` (15 rungs × 320 XP), `paceInfo`, `computeRecap`, `localISO`, and `evaluateRollover` (lazy, idempotent: banks `goal-bonus:<mondayISO>` once, hard-resets streak on miss, freezes `weekMeta[monday] = {target, nowPlaying, outcome, recap}`, self-heals backdated missed→hit, syncs current week's `nowPlaying` with `mainGame`). 41-assertion test passed (scratchpad, session-local).
  - `src/renderer/utils/recapCardImage.js` — recap PNG drawn by hand on canvas at 2× (no html2canvas dep, no font-embedding risk); save via anchor download + clipboard copy.
  - `src/renderer/views/QueueView.js` — keystone seam fix: `publishResultsRef` captures per-platform postIds/urls in BOTH publish loops; `logPost` writes `id` + `platformResults` + truthful legacy `platforms` string (enabled accounts, was ALL connected) + awards 10 XP (`clip:<id>` idempotency key); the `:1115` unwired-platform hole now fails loudly instead of faking success.
  - `src/renderer/App.js` + `src/main/main.js` — new persisted state (`weeklyTarget`, `weekMeta`, `xpLedger`, `streakState`) via STORE_DEFAULTS + persist effects; `awardXp` (idempotent append — ledger is never rewound); rollover effect on `[trackerData, weekMeta, …]`; tracker pane 860→960.
- **Local-date fix (#160 + the class):** every user-facing calendar date now uses `localISO()` (local clock), not `toISOString()` UTC — tracker entry dates, Queue scheduling keys (`getWeekDates`/`getUpcomingDates`), `mainGameHistory`. Repo grep confirms zero UTC calendar-date extractions remain in `src/`.
- **Wick notified:** build report + Phase 2 handoff written to his vault inbox (`Obsidian Vault/The Lab/Businesses/ClipFlow/Wick/inbox.md`, pending item dated 2026-07-05).

## Key Decisions
- **Goal bonus banks at ROLLOVER only** (spec authority over the mock's instant-add); UI copy says "locks in at week's end." Rank math reads the ledger ONLY — never recomputed from weekly percent.
- **No retroactive evaluation:** first run initializes `evaluatedThroughMondayISO` to last Monday, so pre-feature history earns nothing (locked decision 7 — XP starts at zero, streak builds from now).
- **Recap PNG = hand-drawn canvas**, not html2canvas/html-to-image — zero new deps, fonts guaranteed (document fonts are canvas-usable), works packaged.
- **Coder's calls on spec-open points:** Calendar pill disabled+"soon" (not hidden); target edit updates both week snapshot AND default; post-link URLs only where derivable (YouTube); others store postId only.
- **#160 fixed as a follow-up commit, not bundled** — scheduling behavior deserved its own reviewable change; already-scheduled clips unaffected (stored `scheduledAt` strings untouched, parsed as local-naive).
- **Delegation model worked:** 3 Sonnet subagent chunks against exact contracts, main-session line-by-line review caught 2 real integration bugs (UTC week-key mismatch, frozen mount-time clock) — the review pass is not optional.

## Next Steps (prioritized)
1. **Fega's tracker verification** (spec §Verification, ~10 min in-app) — needs the installer first since he tests on the daily build: cut on his "update the launcher" (8 commits queued; batch threshold effectively met).
2. **Phase 2 — Calendar view:** design session FIRST (Wick owns it; no mock/decisions exist yet). Phase 1 ships all data it needs (frozen `weekMeta` snapshots, `platformResults`, `mainGameHistory`, `streakState`). Fega: build it as its own phase.
3. **Silent-failures batch** #150/#151/#152 (+#153 status card) — shared error-toast + confirm/undo sweep (session-92 plan).
4. **Projects tab finish:** premium header + width-capped column + hover-to-play + REVIEW pill (session-92 carryover).
5. **#158** merge-across-pauses round trip (exact repro in session-92 HANDOFF).

## Watch Out For
- **XP ledger is append-only by design** — never "fix" a wrong award by removing entries; add compensating logic instead. Idempotency keys: `clip:<entryId>`, `goal-bonus:<mondayISO>`.
- **Old tracker entries have no `id` and no `platformResults`** — removal falls back to date/time/game matching; recap counts them in clip totals only. Don't backfill (decided: no migration, "platforms unknown").
- **Calendar dates: LOCAL only** (`localISO`), never `toISOString().split` — new memory `user_timezone_est` + clipflow-code-review checklist line. Full ISO instants (e.g. `publishState[].at`) stay as-is.
- **`evaluateRollover` runs in a useEffect keyed on its own outputs** — it MUST return `changed:false` when stable or App loops. Any engine edit needs the scratchpad test rerun (`engine-test.mjs` — session-local temp; rewrite from the engine's JSDoc if gone).
- **Tab panes stay mounted** (display-toggled) — the Queue scheduler ticks on any tab; TrackerView now has a 60s clock tick for the same reason.
- **`package.json` silent-strip gotcha** ([[project_package_json_strip]]) — check 99 lines if builds break.

## Logs / Debugging
- **Builds:** `npm run build:renderer` clean ×3 across the two sessions (~10–14s; standing >500 kB chunk warning). `node --check src/main/main.js` clean. `npm start` boots clean — renderer alive (preview generation ran), no errors in `%APPDATA%\clipflow\logs\app.log`.
- **GPU-cache "Access is denied" spam on `npm start`** = second instance sharing the prod profile's cache with the installed app — pre-existing noise, not a regression.
- **Computer-use:** Fega DENIED the request this session (wanted to eyeball it himself) — don't assume the session-92 approval repeats.
- **Engine test:** 41 assertions covering rank boundaries, Sunday week-attribution, pace thresholds, rollover idempotency, streak reset, backdated self-heal — pattern worth repeating for any pure-logic module.
