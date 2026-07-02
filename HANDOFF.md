# ClipFlow — Session Handoff
_Last updated: 2026-07-01 — Session 92 — **Fable restored (post-ban): reviewed all outage-era code (verdict solid, 3 fixes shipped), ran a whole-app UX audit (code sweep + live sandbox walkthrough), filed 11 issues. Clean checkpoint, no installer cut.**_

---

## One-line TL;DR
Fable 5 came back from the June-12 US export-control suspension; this session reviewed everything written while it was dark (26 commits, sessions 83–91 — **no critical bugs found**, 3 surgical fixes shipped in `e0037a3`) and delivered the UX audit Fega asked for: [tasks/ux-audit-2026-07-01.md](tasks/ux-audit-2026-07-01.md) with 5 criticals + live-pass addendum, and issues **#149–#159** filed.

## Current State
On **0.1.8-alpha.12** installed; source is 5 commits ahead (3 fixes + report + addendum + this wrap) — all source-only, riding the next batched installer per the batch rule. Working tree: usual never-commit `data/` pair + pre-existing `tasks/mocks/` scratch. **No open in-flight task.** Sandbox dev app was used for the walkthrough and has been shut down.

## What Was Just Built
- **Post-ban code review (task 1):** full diff read of sessions 83–91 + verification greps. Cleared as sound: resolver unification, #99 style-baseline factories, ripple-delete simplification, packaged-path repairs. Fixes shipped: `_chunkPending` guard (deleted subtitles can't resurrect via mode switch), ClipRow transcript `useMemo`, dead `animateSpeed` branch removal.
- **UX audit (task 2):** 6 parallel per-view auditors + main-session verification of every headline claim (2 false positives killed: the degrade-ask modal exists at App.js:730; the #139 badge logic is consistent). Then a live computer-use walkthrough of the sandbox app: confirmed C1 contrast, raw publish errors in the Publish Log, button-focus-OK/input-focus-broken nuance, approve/reject snappiness, editor health — and found 2 new bugs live (#158 mode round-trip merge-across-pauses, #159 stale clip count).
- **Issues filed:** #149 sub2 cleanup; #150 silent rename; #151 silent render failure; #152 project delete no-confirm; #153 fresh-install watcher lies (commercial-launch); #154 past-time scheduling; #155 FB token refresh; #156 single-instance lock (commercial-launch); #157 inert Download button; #158 mode round trip; #159 clip count.

## Key Decisions
- **Outage-era code needed no rework** — review found quality consistent with pre-ban sessions; only 3 small findings actioned.
- **Bugs filed autonomously; design improvements NOT filed** — they sit in the report's Important/Suggestions lists awaiting Fega's triage (avoid backlog spam; he picks what becomes issues).
- **#158 confirmed pre-existing, NOT caused by this session's `_chunkPending` fix** — the round-trip path re-chunks from populated editSegments (#89 flow, untouched); the fresh-open path the fix gates produced correct grouping live.
- **Live generate run + schedule-confirm dialog deliberately skipped** — a multi-minute CPU run for marginal signal, and the sandbox queue was empty. Offer stands for a follow-up.
- **Hover-to-play (locked Review Rail spec) was never implemented** — shipped card is click-to-play. Folded into the Projects-tab finish work, not a separate issue.

## Next Steps (prioritized)
1. **Fega triage:** the report's design-improvement lists + 3 product questions (karaoke `subMode` plumbing — unshipped feature or prune; thumbs up/down QA tool in shipped topbar; Download button fate → #157).
2. **"Silent failures + confirmations" fix batch:** #150/#151/#152 (+#153's status card) are one coherent sweep — a shared error-toast + confirm/undo pattern, then cut an installer so Fega gets the review fixes too.
3. **Finish the Projects tab** (deferred Review Rail chrome): premium header + width-capped column + hover-to-play + make the REVIEW pill clickable (or restyle as status).
4. **#158** merge-across-pauses round trip — Fega's most-hated regression class, now with an exact repro.
5. Older backlog picks: #69 trim toggle, #7 projects search, #128 scrub frame-skip, #114 line-break parity, #135 caption corner handles.

## Watch Out For
- **Fega tests on the INSTALLED daily build** — reaching him = cut an installer (memory `feedback_test_on_daily_build`). Five source-only commits are queued up for the next cut.
- **The dev sandbox shares REAL files:** `dev:seed` copies settings, so the dev profile's watch/output folders point at the real `W:\` recordings. The DB is isolated; the files are NOT — never click Rename/delete/render-to-output in the dev app during walkthroughs.
- **#158 lives in `setSegmentMode`'s word-stream rebuild + `segmentWords` 1-word end-time assignment** — do not confuse with the adjacent new `_chunkPending` guard (verified unrelated).
- **`package.json` silent-strip gotcha** ([[project_package_json_strip]]) — check `scripts`/`build`/`devDependencies` exist if builds break; restore from HEAD.
- **`ProjectsView.js` is CRLF** — single-line Edit anchors only (or Node patch script). Worked cleanly this session with a single-line edit.

## Logs / Debugging
- **Builds:** `npm run build:renderer` clean twice this session (2741 modules, ~16s, 0 errors; >500 kB chunk warning is the standing ignorable one).
- **Computer-use on ClipFlow (new knowledge):** request `"ClipFlow"` for the installed exe, `"electron.exe"` for the dev instance. Requesting `"Electron"` is unresolvable and SHORT-CIRCUITS the whole permission request — the dialog never shows and the call times out after 300s (this burned two 5-minute timeouts before diagnosis). Memory updated (`feedback_no_windows_mcp` superseded, new `project_computer_use_app_names`).
- **Audit method that worked:** parallel Sonnet auditors per view returning file:line claims → main-session verification of every headline claim before reporting. Two false positives caught this way — do not skip the verify pass.
- **Live repro numbers for #158:** "it" (00:06.4–00:07.1) + "hello" (00:08.1–00:08.9) → merged "it hello" (00:06.4–00:09.7) after 3w→1w→3w; "go home" 0.8s→1.6s. Ctrl+Z ×2 restores.
- **App log:** `%APPDATA%\clipflow\logs\app.log` (dev profile: `%APPDATA%\clipflow-dev\logs\app.log`).
