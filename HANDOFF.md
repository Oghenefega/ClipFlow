# ClipFlow — Session Handoff

_Last updated: 2026-08-01 — Session 143 (S143 · alpha.37 — Seven-fix batch) — **installer cut, all seven closes await Fega's hands-on pass.**_

---

## One-line TL;DR

Fega reported four annoyances across two days (generic `#gaming` hashtags, a misleading Play Style diff, a forgetful sound popover, tooltips covering subtitle text) and then three more (past-time schedule suggestions, dropdown time picker, vanishing reject-reason chips); all seven shipped and were promoted to the daily driver as `0.3.0-alpha.37`.

## Current State

Healthy on `0.3.0-alpha.37` — installer in `dist/`, in-app banner will surface it; Fega told to install. Master clean at `ed7d731`. Seven issues closed `status: untested`: [#223](https://github.com/Oghenefega/ClipFlow/issues/223), [#224](https://github.com/Oghenefega/ClipFlow/issues/224), [#226](https://github.com/Oghenefega/ClipFlow/issues/226), [#227](https://github.com/Oghenefega/ClipFlow/issues/227), [#228](https://github.com/Oghenefega/ClipFlow/issues/228), [#229](https://github.com/Oghenefega/ClipFlow/issues/229), [#230](https://github.com/Oghenefega/ClipFlow/issues/230).

## What Was Just Built

- **#223 — real game hashtags in AI titles.** `gamesDb`'s `hashtag` + game name now reach every title/caption prompt (batch, single-card rephrase/regenerate, Gemini video path) via `buildTitleCaptionStoreContext` → `title-caption-prompt.js`. Previously the model guessed; new games (Deadline Delivery) fell back to `#gaming`.
- **#224 — honest Play Style diff.** Update prompt now requires verbatim copies of unchanged lines; `ProfileDiffModal` (modals.js) classifies each line unchanged / reworded (amber, word-overlap ≥0.6 vs the shorter line) / added-removed (green/red); legend rewritten.
- **#226 — sound popover remembers it remembered.** New `assets:getDefaultVolume` IPC (index-only read, path-first per #214); `openSoundPopover` (TimelinePanelNew.js) fetches it; the button shows the green check whenever the slider sits at the remembered level.
- **#227 — Edit Subtitles row tooltips** open below the buttons (`side="bottom"` on RowAction's TooltipContent, SegmentRow.js).
- **#228 — Queue schedule past-time guards.** `autoSuggestSlot` skips slots at/behind the local clock; Save Schedule greys with a note on a past pick.
- **#229 — inline snapping time wheel** (Fega picked variant A of `tasks/mocks/queue-time-wheel.html`). `WheelColumn`/`TimeWheel` in QueueView replace the hour/minute dropdowns; one notch per wheel tick, drag + settle-snap, click-to-jump; past hours ghost on today's date. CDP-verified live: seed correctly landed on Saturday's slot (proving #228 too), ghosting and save-gate flip correct on today.
- **#230 — sticky rejected cards on Pending.** `ClipBrowser` (ProjectsView.js) remembers ids rejected while the Pending filter is active so the card lingers and the WHY? reason chips stay reachable; clears on tab/project change; approvals never linger. CDP-verified end-to-end including a reason-chip toggle.

## Key Decisions

- **Hashtag stated outright** in the prompt's hard rules + output format (replacing the `#gamehashtag` placeholder), resolved once in the shared store-context builder — covers both IPC handlers.
- **Reworded-line detection:** word-overlap relative to the SHORTER line (containment-friendly so merged bullets read as reworded), threshold 0.6, no diff library.
- **Sound popover read-back is a dedicated tiny IPC** — `assetsList` re-walks the audio folders per call, too heavy for a right-click.
- **Time wheel is variant A** (inline, 3 rows) — chosen over the compact chip+popover variant B.
- **Sticky reject scope:** rejections only, Pending filter only, component-local state — nothing persisted.

## Next Steps

1. Fega installs `dist/ClipFlow Setup 0.3.0-alpha.37.exe` and verifies the seven untested closes — clear `status: untested` as he confirms.
2. #224's amber tier gets its real judgment when the next playstyle proposal fires (needs pipeline runs to reach the threshold).
3. Optional #223 follow-up: Deadline Delivery has no `aiContextAuto` — auto-research would give the model actual game knowledge (hashtag fix works regardless).
4. Run the start-session issue backlog next session; nothing else was left mid-flight.

## Watch Out For

- **Dev profile shares the REAL `projectsRoot`** — both profiles point at `W:\…\Vertical Recordings Onwards`. Any UI-driving test that writes through the app touches Fega's real project JSON. Mandatory harness: snapshot `project.json` before, field-diff after, restore byte-identical with the app closed. This session's probe un-rejected a REAL rejection in `2026-01-23 AR Day16 Pt3` (first-match button targeting across the card list); the snapshot restore made recovery exact. See memory `project_cdp_verification_gotchas` traps 31–33.
- **TimeWheel controlled-sync:** external seeds scroll the wheel via an effect guarded by `idxRef` — if the wheel ever fights user scrolls, that guard is the suspect (QueueView.js `WheelColumn`).
- **`schedHour` values are 24h strings** (`"08"`–`"23"`, `"00"`); `"00"` on today's date = start-of-today = past, by design — the wheel's ghosting and the #228 save gate agree.
- **Playstyle verbatim rule** depends on the model honoring it; the amber tier catches rewording either way (belt and suspenders).
- The Play Style diff helpers (`wordSetOf`/`overlapOf`, modals.js) are shared by both panes — keep them module-level.

## Logs/Debugging

- No new Sentry-relevant errors; dev boots clean (schema v8, single-instance lock respected).
- Test residue from #230 verification: two feedback rows + a rejected/approved posthog event pair went to the ISOLATED dev DB/analytics; prod DB untouched; test project JSON restored byte-identical (verified by comparison).
- CDP drivers live in the `5051f2b7…` scratchpad: `cdp-eval.js` (one-shot evaluator using repo `ws`), `cdp-sticky-check3.js` (visibility-scoped #230 driver — the pattern to copy), `cdp-wheel-check.js` (#229), `expr-*.js` probe expressions. Remember: visibility-scope EVERY DOM query (hidden mounted views host lookalike buttons/tabs), and assert DOM text ("Rejected"), not the CSS-uppercased rendering ("REJECTED").
