# ClipFlow — Session Handoff

_Last updated: 2026-08-05 — Session 152 (#241 cell run → NO SHIP; #183 title/card rebuild on Clip Standard formulas SHIPPED; #240 titleAnchor groundwork laid)._

---

## One-line TL;DR

The Clip Standard's selection rules taught detection nothing (recall 29/29 both ways, rej-hit 47%→45% = one pick) and its "enter late" rule systematically shaved a kept clip's reaction tail — so #241 closed NO-SHIP, and the standard's real leverage landed where it belongs: the #183 titlegen rebuild. The title engine now carries the general formulas (hook = promise the footage pays off, one best line takes both surfaces, honesty rule, hook-angle menu), Fega's signature formats live as data in his Style Guide setting (live on alpha.38 at next launch, no installer needed), and the prompt accepts an intent-anchor for #240's imports.

## Current State

Master pushed. Daily driver = **0.3.0-alpha.38** — batch riding the next installer is now **3 substantive changes**: #239 (feedback choke point), #238 (pick-budget scaling), #183 (title formula rebuild). The styleGuide seed is the exception: it's settings data, active on the installed app immediately. Epic [#231](https://github.com/Oghenefega/ClipFlow/issues/231) open; [#234](https://github.com/Oghenefega/ClipFlow/issues/234) still data-blocked (checked at session start: **0 of 50** recent RL rejections carry v3 chips — the chips ARE live on alpha.38, but the 50-row window is still dominated by pre-install rejections; needs Fega rejecting + tagging on the new build). [#241](https://github.com/Oghenefega/ClipFlow/issues/241) CLOSED with full results. [#183](https://github.com/Oghenefega/ClipFlow/issues/183) stays open — its success bar is longitudinal (hand-written share of published titles drops).

## What Was Just Built (session 152)

- **#241 cell (`clipStd`, $0.79):** four distilled Clip Standard selection rules as a delimited detection-prompt section vs the shipped config (baseline = #238's `a25-scale` replays, shared per the issue's own suggestion). Recall 29/29 = identical; rej-hit 42/93 = 45% vs 43/92 = 47% (one pick, noise); boundary coverage **regressed** 93.5% → 90.4%, driver = RL Day10's single approved row (22:14→22:52) end-shaved 89% → 61% coverage, reproduced 2/2 stability runs (EO Day3's dip was noise — 97% on re-run). Verdict: taste calibration already carries the standard's content; boundary language hurts edges (third independent proof after Cells B and C). Prompt reverted, results committed, issue closed.
- **#183 rebuild (engine, all general):** `title-caption-prompt.js` — CLIP_TRUTH gains the loop principle (title AND caption open a loop, never a summary) + honesty rule (line the footage can't cash is banned); batch section gains "find the strongest line first — it takes BOTH title #1 and caption #1" (schema annotated to match) + a general hook-angle menu (stakes declared / arguable claim / mid-emotion open / comeback / anomaly); the fragment rule's example swapped off "The pass was PERFECT" (the standard names it a loop-killer) to "NO ONE gets past me". `main.js` Gemini video block gains a payoff check (it can SEE the ending — verify the footage cashes each line). KB json v4 (spoiler anti-pattern generalized to both surfaces) + frameworks doc updated in lockstep.
- **Per-creator layer:** Fega's signature formats ("claim the footage disproves", "setup + tease") seeded as TEXT into `styleGuide` in prod AND dev settings (backups: `clipflow-settings.json.bak-20260805-pre183` in both profiles). Zero Fega-specific text in engine code — a deliberate fence; a migration was considered and rejected (would seed Fega's voice into every future install).
- **#240 groundwork:** `buildUserContent` accepts `titleAnchor` — renders an intent-anchor section (keep the creator's old filename's intent/voice, improve only where clearly better). Next session passes stripped OpusClip filenames through it.
- Verified: smoke-render probes all new prompt content (batch ~5.1k chars — far from the 14k overconstraint zone), 60/60 detection tests green after revert, dev-profile boot clean.

## Key Decisions

- **#241 NO-SHIP** is the recorded answer to the cell's question — do not re-propose Clip Standard rules in the detection prompt without new evidence. The named pattern now has three data points: boundary/selection *instructions* tighten windows; *room* (pick budget) relaxes them.
- **Signature formats are data, not code.** Delivery = styleGuide setting (Settings-editable). If Fega wants them changed, he edits Settings — no build needed.
- **First title + first caption now intentionally carry the same line.** If Fega reports the pairs feeling redundant, that's the one-best-line formula working as designed — the other two cards carry the variety. Don't "fix" it without his say-so.

## Next Steps (priority order)

1. **#240 queue imports build** — spec locked (`tasks/specs/queue-imports.md`), greenlit, its own session. Title pass: reuse `buildSystemPrompt` + `buildUserContent({titleAnchor})`; open coder calls listed in the spec.
2. **Next installer** (batch of 3 now, or on Fega's ask): carries #239 + #238 + #183 prompt code. In-app checks: approval stats move on editor-Queue approvals (#239); dense recording yields ~18-20 picks (#238); title/caption drafts open loops + card 1 title/caption share a line (#183).
3. **Fega's eyeball, ~2 min:** 3 proxy cuts in `Desktop\ClipFlow Eyeball 241-clipStd\` (EO Day4 22:32, RL Day10 11:44, RL Day8 17:52 — last one flagged as adjacent to a verdicted NO). Verdicts → comment on closed #241 as usual.
4. **#234 v3 re-test trigger check at session start** (standing): count v3 tags in RL's 50-row rejected window; fire at ≥15. Still 0/50 — the chips shipped with alpha.38, so this now moves at the pace of Fega's post-install rejection tagging.
5. **#183 measurement continues on its own:** every publish logs `title_caption_rounds`; the bar is `title_source` shifting away from `self` over the coming weeks. Check `SELECT title_source, COUNT(*) FROM title_caption_rounds GROUP BY title_source` after a batch of posts on the new build.

## Watch Out For

- **styleGuide is now non-empty in BOTH profiles** — any future "seed if empty" logic will correctly skip. Backups exist if the seed needs reverting (`%APPDATA%\clipflow\clipflow-settings.json.bak-20260805-pre183`, same in `clipflow-dev`).
- The seeded signature text reaches the CURRENT installed app's prompts at next launch (alpha.38 already injects the styleGuide section) — so title output may shift for Fega BEFORE the installer with the engine rebuild lands. If he reports title changes "already", that's why, not a mystery.
- The title prompt has NO unit tests (only smoke-rendered) — detection's 60 tests don't cover it. If regressions bite here, a small pinned-probe test file is the fix.
- `Desktop\ClipFlow Eyeball 238-A\` (verdicted, disposable) and `Desktop\ClipFlow Eyeball 241-clipStd\` (awaiting verdicts) both exist; `_tmp/proxy/*.proxy.mp4` (~640MB) stays while the program is active.
- Pre-#239 DB backup still exists: `%APPDATA%\clipflow\data\clipflow.db.bak-20260805-pre239` (delete when Fega's comfortable).

## Logs / Debugging

- #241 runs: Anthropic gateway (BYOK via Cloudflare) HTTP 200s throughout; per-run $0.065-0.122, 6-22s. Session API spend ≈ **$0.79** (6 cell runs $0.59 + 2 stability $0.20). Boundary-coverage script validated by reproducing the recorded 87%/93% baselines before scoring the new cell; methodology in the #241 closing comment.
- Boot-verify: `CLIPFLOW_PROFILE=dev npm start` — clean start, schema v8, migrations skipped as expected; killed via `taskkill //F //IM electron.exe`.
- sql.js reminder: feedback table column is `transcript_segment`; settings live at `%APPDATA%\clipflow\clipflow-settings.json` (electron-store, tab-indented JSON — external writes only while the app is closed).
- gh CLI: comment bodies with backticks/parens go through `--body-file` from the scratchpad, not inline `--body`.
