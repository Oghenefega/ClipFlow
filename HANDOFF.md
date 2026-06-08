# ClipFlow — Session Handoff
_Last updated: 2026-06-08 — Session 66 — Built, verified, and shipped #122 (Recordings card redesign, Option A) + a custom hover tooltip. Issue closed._

---

## One-line TL;DR

We built the Option-A Recordings card redesign that was designed in session 65 (spec in #122 + `mockups/recordings-cards.html`): single-line cards, selection-by-card-highlight (left checkbox removed), a game-tag full/min header toggle (persisted), file size moved off the card to hover, and a single green ✓ → red ✕ → un-mark done control replacing both old "DONE ×" paths. Fega verified all of it. We then replaced the basic native hover tooltip with a custom dark one (full filename + size), and after Fega's feedback gave it a ~0.5s show-delay and below-the-card placement. Built clean, verified hands-on, **#122 closed**.

## Current State

App is healthy on `0.1.6-alpha`, running from `build/` (prod profile) via a backgrounded `npm start` (shell `beo4dyi8d`) — **close that window when done.** Renderer builds clean (`npm run build:renderer`, ~9.5s, only the pre-existing #73 chunk-size warning). All session work is committed/pushed to master. Working tree should be clean except runtime churn (`data/clipflow.db`, `data/game_profiles.json` — DO NOT commit).

## What Was Just Built (all in `src/renderer/views/UploadView.js`)

1. **Dropped the left `<Checkbox>`** — selection is now a whole-card purple highlight (accent border + `accentDim` bg + `0 0 0 1px accent, 0 3px 14px` glow). `Checkbox` import removed. Done cards are non-selectable (`onClick` guards on `!fileDone`).
2. **Game-tag full/min toggle** — header segmented control (`Tags` `AR` | `|`) next to Select All; `tagMode` state, default `"full"`, persisted via `window.clipflow.storeSet("recordingsTagMode", …)` and loaded in the split-settings effect. Min mode renders a 3×14 colour bar instead of the `AR` pill.
3. **Removed the on-card size** — now shown in the custom tooltip on hover.
4. **Done = bare green ✓ → red ✕ → un-mark** — `showDoneCheck = manualDone || statusDone`; per-file `armedDone[id]` two-step (click ✓ arms ✕, click ✕ confirms, `onMouseLeave` disarms). One handler `handleDoneCheck(f, manualDone)` routes to `unmarkDone` (manual) or `resetFileDone` (status). Replaced BOTH old "DONE ×" blocks.
5. **`selCount` now excludes done** (moved below `isDone` to avoid TDZ) so the footer "Mark N as Done" + generate counts ignore already-done cards.
6. **Custom hover tooltip** — `tip` state + `tipTimer` ref; `showTip` computes position from `getBoundingClientRect()` and fires `setTip` after 500ms; `hideTip` clears the timer. Rendered fixed-position (outside the card, `pointerEvents:none`) with dark surface + mono filename + size; default below, flips above only when no room below. Cleanup effect clears the timer on unmount.

## Key Decisions

- **Checkmark stays a two-step (✓ → ✕ → confirm), hover-away cancels.** Fega asked why and chose to keep it after the rationale: un-marking is non-destructive (deletes nothing, just re-opens the recording), but the two-step still guards against an accidental single click; the mouse-leave disarm prevents a red ✕ stranding on a done card.
- **Tooltip conventions are load-bearing.** Replacing the native `title` meant re-implementing its defaults: ~0.5s delay + below placement. Shipped instant+above first, Fega flagged both → fixed. (Lesson distilled into `clipflow-ui-debug`.)
- **Built from the approved mockup, not the abstract plan.** Session 65's two-line attempt was rejected on render; Option A was approved against `mockups/recordings-cards.html`, so building faithfully from it was safe — and it was.
- **Tag-mode persistence was light, not heavy** — same `storeGet/storeSet` one-liner pattern as `splitThresholdMinutes`/`doneRecordings`, so it was persisted properly (no `useState`-only fallback needed).

## Next Steps (prioritized)

1. **Larger Recordings redesign** (separate from #122) — filters, sort, search, thumbnails, bulk actions, overall layout. Recordings is still V1 beyond the card.
2. Subtitle `words[]`/`text` family (deferred): #95, #107, #87, #101, #89, #84.
3. **#121** (chore) — `originalSegments` "sentence-level" comment clarification; low priority.
4. Backlog: #64 (waveform empty), #112/#62 (EPIPE / silent audio), #57 (editor lag), #114/#108/#40. Commercial-launch: #20–#23, #50–#56, #73/#74, #85.

## Watch Out For

- **Don't reintroduce the left-edge full-height colour bar** — Fega hates it as an "AI cliché." The min-mode tag is a small 3×14 colour chip that REPLACES the `AR` pill; that's different and approved.
- **Stray `npm start` (shell `beo4dyi8d`)** is running on the new build — close the window when done; **kill it before any `npm run build`** (packaging locks the binary). `npm run build:renderer` is safe with it running. Kill pattern: `Get-Process electron | ? { $_.Path -like '*Desktop\ClipFlow*' } | Stop-Process -Force` (path-filtered so it won't touch other Electron apps).
- **No single-instance lock in `main.js`** — relaunching `npm start` opens a SECOND window on the same prod DB. Kill the old instance before relaunching (done this session).
- **Editing `UploadView.js` near the done badges:** the `×` is stored as the literal escape `×` and there's an em-dash in a `title`; the Edit matcher only auto-swaps ONE unicode form at a time, so a block containing both will fail to match — neutralize one (e.g. em-dash → hyphen) first, then edit.
- **Don't commit `data/clipflow.db` / `data/game_profiles.json`** (runtime churn). Stage source/docs explicitly.

## Logs / Debugging

- **Build/run:** `npm run build:renderer` (~9.5s, renderer only). `npm start` runs prod from `build/`. Clean boots this session: `App started … 0.1.6-alpha` (electron 40.9.1), `Database initialized … (schema v4)`, `File migration already complete — skipping`, then per-recording `Generated N preview frames`. No errors across three rebuild/relaunch cycles.
- **Recordings code map (`UploadView.js`, post-#122):** state `tagMode`/`armedDone`/`tip`+`tipTimer` near :101; `changeTagMode` after `persistDone`; `isDone` then `selCount` (excludes done); `handleDoneCheck`/`disarmDone`/`showTip`/`hideTip` after `resetFileDone`; header tag toggle in the "count + tag toggle + select all" row; card block ~:1195–1295 (card div with `onMouseEnter/Leave` :1196, tag full/min ternary :1210, name :1225, TestChip :1232, clip-count badge :1240, unified done ✓/✕ :1250, generating % :1265); custom tooltip render just before the Quick-Import Modal.
- **Theme tokens** (`src/renderer/styles/theme.js`): accent `#8b5cf6`, accentLight `#a78bfa`, accentDim `rgba(139,92,246,0.12)`, accentBorder `rgba(139,92,246,0.25)`, green `#34d399`, red `#f87171`, surface `#111218`, bg `#0a0b10`, borderHover `rgba(255,255,255,0.12)`, mono `'JetBrains Mono'`.
- **Tooltip bg** uses a literal `#15161d` (one step above `surface`) for separation from the cards.
