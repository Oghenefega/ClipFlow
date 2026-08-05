# ClipFlow — Session Handoff

_Last updated: 2026-08-05 — Session 151 (#238 run end-to-end: fresh baseline → cells A/B/C → Fega's verdicts → Cell A SHIPPED; #238 closed `status: untested`)._

---

## One-line TL;DR

The detection engine's fixed ~15-pick habit was the root of BOTH open quality problems — it squeezed marginal keepers off dense recordings AND caused bad cut edges. Cell A (count scales with length: "~1 clip per 90s, min 10, max 25") re-found **all 29** of Fega's kept moments (baseline 26/29), improved edge alignment 87%→93% with zero boundary language, kept precision flat, and surfaced one brand-new Fega-verdicted keeper. Shipped to master (`d3a79ee`), [#238](https://github.com/Oghenefega/ClipFlow/issues/238) closed `status: untested`. The explicit cause/payoff boundary rewrite (Cell B) measured useless solo and is SHELVED.

## Current State

Master pushed (`d3a79ee`). Daily driver = **0.3.0-alpha.38** — does NOT contain #239 (feedback choke point) or #238 (pick-budget scaling); both are source-only, riding the next batched installer (2 substantive changes in the batch so far). Prompt code + tests clean: 60/60 unit tests green. Epic [#231](https://github.com/Oghenefega/ClipFlow/issues/231) open; [#234](https://github.com/Oghenefega/ClipFlow/issues/234) open, still data-blocked (needs ≥15 v3-tagged rejections in RL's 50-row window). Gemini watch stays default OFF (Fega reaffirmed this session; stretch re-audition cell deliberately skipped).

## What Was Just Built (session 151)

- **Fresh post-#239 baseline** (`f10-mix-rebase`, $0.57): truth grew 26 → 29 pooled approved rows; baseline scored 26/29 = 90% recall, 47% rej-hit, 87% boundary coverage (new post-hoc metric: fraction of each hit approved row's window covered by its best pick — Fega's hand cuts are edge ground truth). Old cell numbers formally retired on #238.
- **Cells A/B/C run single-factor** (six standard recordings each + stability re-runs, $2.32): A (pick-budget) 29/29 / 47% / 93%; B (cause/payoff boundary rewrite) 26/29 / 51% / 83% — worse edges SOLO; C (A+B) 28/29 / 44% / 94% but coin-flips RL Day8's ANKLES BROKEN cold-open start (2/3 runs start at the reaction, not Fega's 0:19 cause). All results committed under `tasks/spikes/replay-score/results/`, full tables in #238 comments.
- **Fega's eyeball round:** only 4 never-judged picks survived the cross-reference against #235's 28 verdicted moments. 1 KEEP (EO Day3 17:41 jump-fail — "I would use it", A-only territory), 3 NOs, all failing on **payoff-not-visible-on-screen** (new named taste class; candidate future cell).
- **Cell A shipped:** ai-prompt.js count constraint (the cell's exact text), 2 pinned tests updated in ai-prompt.test.js, CHANGELOG entry, spec status block updated (tasks/specs/detection-input-science.md), #238 closed with comment + `status: untested`.

## Key Decisions

- **Ship A alone; SHELVE B** — single-factor evidence: B moved nothing measurable solo (and worsened edge coverage), so its language doesn't earn prompt space. Don't re-propose boundary language without new evidence (e.g., bad-cut rejections persisting under A in live use).
- **C not shipped** despite best precision/coverage — its deltas vs A are inside the ±1/recording noise band and it introduces a real cold-open bad-cut risk.
- **Gemini stretch cell skipped** (Fega): OFF stands; a future re-audition inherits A's fix automatically since the displacement mechanism A removes is exactly what sank the gemInt cell. Re-audition trigger = a recording with a known quiet-spectacular moment.
- **Scoring caveat recorded on #238:** B's and C's single "losses" were midpoint-rule knife-edges on picks that OVERLAP the truth row (0.5s / 2.5s) — moments found, edges shifted. Keep in mind before reading future cell recall dips as real.

## Next Steps (priority order)

1. **Next installer** (when the batch justifies it, or on Fega's ask) carries #239 + #238. Fega's in-app checks: editor-Queue approval bumps approval stats / un-approve drops it (#239); a dense 20-30 min recording yields ~18-20 picks (#238). Remove `status: untested` from both after confirmation.
2. **#234 v3 re-test trigger check at session start:** count v3-tagged rows (`setup-talk`/`chat-banter`/`flat-delivery`) in RL's 50-row rejected window; fire at ≥15 (~$0.26). Fega keeps tagging rejections.
3. **#240 queue imports build** — spec locked (`tasks/specs/queue-imports.md`), greenlit, its own session.
4. **Candidate future cell (not filed):** "payoff visible on screen" — all 3 eyeball NOs were mic-driven picks about action the viewer can't see. File only if the class keeps showing up in Fega's live rejections.

## Watch Out For

- **A's short-tail behavior:** the density rule scales DOWN too — RL Day9 (4 min) went 7 → 4 picks (recall held 4/4, junk dropped). If Fega reports thin results on short tail recordings, this is why; the fix would be a floor tweak, not a revert.
- **One 5s pick observed** (DD, 10:55→11:00) — below the 7-second minimum the schema states. Single occurrence; if the render/cut path ever chokes on a sub-7s pick, this is the source.
- **Old truth numbers are gone:** any comparison must use the 29-row truth and `f10-mix-rebase` (26/29 / 47% / 87%) — never the retired 24/26 / 25/26 era numbers.
- The pre-#239-backfill DB backup still exists: `%APPDATA%\clipflow\data\clipflow.db.bak-20260805-pre239` (delete when Fega's comfortable).
- Eyeball proxy cuts live in `Desktop\ClipFlow Eyeball 238-A\` (4 clips, verdicted — safe to delete) and gemini-era folders from #235; all disposable.
- `_tmp/proxy/*.proxy.mp4` (6 files, ~640MB) in the replay-score spike are the cut sources — keep while the program is active.

## Logs / Debugging

- Harness runs logged Anthropic gateway (BYOK via Cloudflare) HTTP 200s throughout; per-run cost $0.06-0.12, ~8-18s latency. Total session API spend ≈ **$2.89** (baseline $0.57, cells $2.32).
- Boundary-coverage analysis is a post-hoc script over `results/*.json` + the prod DB (no harness changes) — re-derivable from this session's #238 comment if needed; not persisted as a file by design.
- `sql.js` column note: feedback table has `transcript_segment` (NOT `transcript_text`) — a first analysis script died on this; schema via `PRAGMA table_info(feedback)`.
- gh CLI: comment bodies with backticks/parens must go through `--body-file` (a scratchpad .md), not inline `--body` — bash eats them otherwise.
