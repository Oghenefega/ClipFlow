# Detection Input Science — Measurable Feedback Loop + Ablation Program

> Status (2026-08-03): Steps 1-2 SHIPPED (commits `90f0313`, `86a7970`), first ablation
> cells run and recorded. Produced by Fable (ClipFlow dev), session 144; full plan
> approved by Fega in chat 2026-08-02.
> GitHub: epic [#231](https://github.com/Oghenefega/ClipFlow/issues/231) · children
> [#232](https://github.com/Oghenefega/ClipFlow/issues/232) (v3 reason chips, closed
> `status: untested`), [#233](https://github.com/Oghenefega/ClipFlow/issues/233)
> (harness, closed `status: untested`), [#234](https://github.com/Oghenefega/ClipFlow/issues/234)
> (ablations, OPEN — results in comments), [#235](https://github.com/Oghenefega/ClipFlow/issues/235)
> (Gemini full-watch, OPEN — not started).
> **2026-08-04: Fega APPROVED frames 20 → 10 default AND flipped Gemini billing to paid
> on flowveapp@gmail.com (routed via Wick). NO open Fega decisions remain (see §Open
> Decisions). #235 fully unblocked.**
> **2026-08-04 (session 146): frames 20 → 10 SHIPPED + verified (2 replays, recall
> holds with reserved frames). All six single-factor ablation cells now recorded
> (--no-approved and --no-playstyle added). #236 title-noise fix shipped. #235
> prototype run as harness variant D — results in §Step 4.**
> **2026-08-04 (session 148): #237 event-timeline de-saturation SHIPPED + gated
> (§Step 5) — per-signal caps + duplicate collapse in the prompt's top-50
> selection; harness ceiling hack retired. #235 integration gate CLEARED.**
> **2026-08-04/05 (session 149): #235 pipeline integration SHIPPED (§Step 4 —
> prod watch module, background stage in ai-pipeline), then gated to
> **default OFF** (Fega's call 2026-08-05 after verdicts: no unique territory
> post-#237; `geminiWatchEnabled: true` re-enables).
> Integration cell f10-gemInt: pooled 22/26 = 85% vs f10-mix 25/26 — gate NOT
> held on run1s; diagnosis = cut-boundary tightening + tail-budget
> displacement, NOT bad moment selection (rej-hit improved 49%→46%).
> Noise checks (same session): DD's loss was noise, EO Day3's is SYSTEMATIC
> (6/8 all 3 runs, pick-budget squeeze on the densest recording) — expected
> pooled ≈ 23/26. Gate decision with Fega; pick-budget/cut-boundary cell is
> the named follow-up.**

## The question this answers

Fega (2026-08-01): the clip engine is fed play style, transcript, a detection prompt,
approved clips, and rejected clips — "are we feeding it too many things? is it
overwhelmed? are we feeding the right things?" And: rejection tagging only recently
shipped, so the reasons must be sensible and diverse enough to actually train the
engine; screenshot usefulness should be *measured*, not felt; explore Gemini watching
full recordings instead of only clips at title time.

The program's core move: **Fega's ~330 historical approve/reject decisions are the
ground truth.** Any engine variant can be re-run on past recordings and scored on how
well it re-finds kept moments and avoids thrown-away ones. His eye stays the source of
truth; it stops being the measuring instrument.

## What the engine is actually fed (measured from real run artifacts)

Every generation saves its exact prompt to
`%APPDATA%\clipflow\processing\claude\<video>.system_prompt.txt`. Measured on the
2026-07-22 RL Day10 Pt2 run (typical): **~39.4k input tokens to claude-sonnet-4-6**, of
which ALL taste/guidance text (creator profile, play style, rules, approved + rejected
examples) is ~3.8k tokens (~10%). The 20 screenshots are ~25k tokens (~2/3 of every
call). The model is nowhere near overwhelmed; the question was always input *quality*
and screenshot *value*.

Key structural facts (src/main/ai-prompt.js, ai-pipeline.js Stage 6):
- Approved + rejected example sections are each hard-capped at 3,000 chars — history
  growth cannot bloat the prompt.
- Play style updates are offered every 5 generations per game (threshold configurable
  3-20, data/game_profiles.json in the prod profile), mined from KEPT clips only (#192).
- Mechanical rejections (duplicate / bad-cut / wrong-content / repetitive) never enter
  negative calibration (#198, #232) and are excluded from #194 quality stats.

## Step 1 — Rejection reasons v3 · SHIPPED (#232, commit `90f0313`)

**Era naming (per Fega, 2026-08-04 — use his numbering everywhere):** **v1** = the
untagged era, reject button only. **v2** = the CURRENTLY INSTALLED system — six chips
(duplicate, bad-cut, not-funny, nothing-happens, needs-context, wrong-content) +
optional note; Fega has tagged with these for months (live DB 2026-08-04: 109 of 288
rejections tagged; RL's 50-row window 38/50, DD 7/9, EO 20/45, MC 8/10). **v3** = the
four sharper #232 chips below, built but NOT yet in an installer. Earlier drafts of
this spec called v3 "chips v2" (second version of the chip *system*) — corrected;
never phrase v1's absence of reasons as "no way to know why Fega rejects".

Why v3: "not funny" (75 uses) and "nothing happens" (77) dominate v2 tagging and are
constantly co-tagged — a vocabulary too coarse to teach. 140 of RL's 200+ rejections
predate tagging entirely (v1 era) and inject as bare quotes.

Shipped:
- Four new chips (ProjectsView.js): **Setup / tech talk** (`setup-talk`), **Chat
  banter** (`chat-banter`), **Flat delivery** (`flat-delivery`), **Too similar**
  (`repetitive` — mechanical, never teaches "avoid good moments"). Existing six keep
  position for muscle memory.
- Grouped prompt injection (ai-prompt.js `buildRejectedSection`): tagged rows fill the
  budget FIRST, grouped under `## Rejected because: <reason>` headers; untagged legacy
  rows last under "no stated reason". Rejected fetch window 30 → 50 (ai-pipeline.js).
- 50 unit tests green (`node src/main/ai-prompt.test.js`).

NOT yet in an installer — rides the next batched build. Fega's hands-on check: reject a
clip on the Pending tab, confirm the 10 chips render and read well.

## Step 2 — Replay-and-score harness · SHIPPED (#233, commit `86a7970`)

`tasks/spikes/replay-score/harness.js`. Rebuilds the detection call for a past
recording from saved artifacts (claude_ready transcript, energy JSON, event timeline,
frames), CURRENT prompt code, prod settings/profiles, and a read-only copy of the prod
feedback DB; calls the real provider; scores picks against that video's feedback rows.

```
cd tasks/spikes/replay-score
node harness.js "<videoName>" [--frames N] [--no-rejected] [--no-approved]
                [--no-playstyle] [--runs N] [--label name] [--dry]
```

- Metrics: **approved recall** (kept moments re-found), **rejected-hit rate** (picks
  landing on rejected-only moments), unreviewed picks listed for human eyeball.
  Match = midpoint containment either direction.
- Leakage guard: few-shot pools exclude the replayed video.
- Results: `tasks/spikes/replay-score/results/*.json` (+ `_summary.json`), committed as
  the permanent record. `--dry` is free and prints prompt section sizes.
- Noise band (2 identical baseline runs): recall stable; rejected hits ±1 pick.
  **Compare variants only on pooled multi-recording numbers.**
- Known fidelity caveats: frame timestamps re-derived by mirroring extractTopFrames
  ordering (drifts if that code changes); ground truth only covers moments past runs
  surfaced, so "unreviewed" ≠ bad.

## Step 3 — Ablations · FIRST CELLS RUN (#234, open)

Six recordings (RL Day9 Pt1, Day8 Pt8, Day10 Pt1 · EO Day3 Pt2, Day4 Pt1 · DD Day2
Pt1), single run per cell, ~$2.75 total including baseline:

| variant | approved recall | rejected-hit rate | avg $/run | avg input tokens |
|---|---|---|---|---|
| baseline (20 frames) | 24/26 = **92%** | 41/84 = 49% | $0.133 | 39.4k |
| 10 frames | 24/26 = **92%** | 39/81 = 48% | **$0.096** | 27.3k |
| 0 frames | 21/26 = **81%** | 37/76 = 49% | $0.059 | 15.2k |
| no rejected section | 24/26 = 92% | 43/90 = 48% | $0.131 | 38.6k |
| no approved section | 22/26 = 85% | 44/80 = **55%** | $0.131 | 38.9k |
| no play style | 23/26 = 88% | 48/84 = **57%** | $0.132 | 39.0k |

Findings:
1. **Screenshots earn their keep; 10 do the work of 20.** Zero frames loses 3 of 26
   kept moments; ten loses none at −28% cost.
2. **Recall is near-ceiling — precision is the frontier.** ~Half of picks land on
   historically-rejected-type moments in every variant. (This aligns with Mushu's
   2026-07-31 render-review note about weak cold opens — the engine finds the moments,
   it's the *judgment* layer that needs work.)
3. **The rejected section moves nothing measurable** (49% → 48% without it, within
   noise) — and note (corrected 2026-08-04 after Fega's pushback): this cell already
   INCLUDED his v2 reason tags, grouped tagged-first per Step 1 — the recent windows
   are majority v2-tagged, not reason-less. So the honest read is not "no tags yet";
   it's that the v2 vocabulary (dominated by the not-funny/nothing-happens catch-alls)
   doesn't measurably steer picks. Keep the section (~800 tokens); RE-TEST once
   v3-tagged rejections accumulate — the #232 bet is that the sharper vocabulary is
   what changes this, and that bet is still unmeasured.
4. **The approved section earns its keep on both axes** (2026-08-04): dropping it
   loses 2 kept moments AND worsens precision ~6 pts — the only input measured so far
   that moves recall other than frames.
5. **Play style is a precision guard** (2026-08-04): without it, rejected-hit rate is
   the worst of any cell (57%); recall dip within noise. It teaches what Fega's play
   looks like when it's NOT clip-worthy.

Remaining cells: only the post-#232 `--no-rejected` re-run, once v3-tagged rows are a
meaningful share of the 50-row window. Checked 2026-08-04: **0 of 50** recent RL
rejections carry v3 chips (#232 hasn't ridden an installer yet) — stays queued. The
window is already 38/50 v2-tagged, so this re-test measures the vocabulary upgrade,
not tags-vs-none.

**Fega's two standing roles in the program** (the plan fails silently without them):
1. **Tag at least one reason chip on every rejection.** The negative-calibration
   re-test — the whole bet behind #232 — only has data if rejections keep arriving
   tagged. Rejected cards linger on the Pending tab precisely for this (#230).
2. **The ~2-minute eyeball pass per experiment:** picks scored "unreviewed" overlap no
   historical decision, so the harness cannot judge them. Each experiment ends with a
   short list of those (timestamps in the results JSON + issue comments) for Fega to
   skim — new-territory picks can be genuinely good, and his verdicts turn into new
   ground truth.

**Small dangling item:** [#236](https://github.com/Oghenefega/ClipFlow/issues/236) —
~~approved few-shot examples inject placeholder `Title: Clip N` lines as noise~~
**FIXED 2026-08-04** (session 146): `Title:` line now emitted only for real titles;
rebuilt real-DB RL prompt has 0 placeholder lines (was 7 of 12). Closed
`status: untested`.

## Step 4 — Gemini full-recording watch · PROTOTYPE RUN 2026-08-04 (#235)

> **Session 146 results (full detail in #235 comment):** `gemini-watch.js` +
> `harness.js --gemini` ran variant D end-to-end on 4 recordings (~$0.63 Gemini
> total). Pooled recall 11/12 = 92% vs 10/12 for baseline AND f10 on the same
> recordings; several new high-confidence picks land exactly on Gemini-flagged
> visual moments (RL overtime winner, DD finish-line crash) — now on Fega's
> eyeball list. 0 events on the quiet 4-min RL Day9 recording (no hallucination
> pressure). Timestamp drift ~10-20s, absorbed by midpoint matching — no
> snap-to-transcript needed. **Integration blocker: #237** — the prompt's top-50
> event list is saturated (100% pitch_spike at score 1.0; game/reaction signals
> never render), so variant D only worked via a ceiling-merge hack in the
> harness.
>
> **Fega's eyeball verdicts (2026-08-04, full table in #235): 2/6 soft-yes.**
> The discriminator is NOT visual spectacle — it's **creator authorship + mic
> energy**: both keeps are his own crashes/fails; all rejects are teammate/
> opponent plays he spectates or talk-without-action. Gemini's `what` field
> already names the actor ("Teammate … scores" vs "The player …"), so the next
> prototype iteration is actor-aware weighting (player-authored full weight,
> spectator moments dropped/downweighted) + a watch prompt that targets the
> creator's own plays. Re-run variant D on the same 3 recordings; success =
> new-territory picks skew toward the DD (self-authored fail) class. Pipeline
> integration decision waits on that + #237.
>
> **Actor-aware iteration (D3) RUN 2026-08-04, session 147 — success criterion
> met (full detail in #235).** Watch prompt v2-actor (creator-POV framing, own
> plays/fails are the target, spectator + talk-without-action excluded,
> actor-first `what` phrasing mandatory, bare gamertags banned) + actor-aware
> harness merge (events classified from `what`; spectator dropped pre-merge).
> Re-watch of the same 3 recordings ($0.60): RL's spectator events went
> 11 → **0**, every v2 event is player-authored, and v2 surfaces own-fails v1
> never marked (own goal, whiffed clear, backflip fail). Replay `f10-gemD3`:
> pooled recall 11/12 = 92% (unchanged); both rejected RL spectator picks
> GONE; both DD soft-yes windows persist and moved toward Fega's cuts (6:22
> trimmed toward first-fail-only); EO checkpoint-talk pick gone; every
> Gemini-driven new-territory pick is player-authored (4/4, vs D2 where 4 of 5
> Gemini-driven verdicted picks were NOs). New 9-pick eyeball list posted in
> #235. **Pipeline integration still gated on #237** (merge still rides the
> harness ceiling hack) plus Fega's verdicts on the D3 eyeball list.
>
> **Fega's D3 verdicts (same day, all 9 picks — full table in #235): 4/9 usable
> (+1 borderline) vs D2's 2/6; Gemini-driven picks specifically 3/4 usable vs
> D2's 1/5. Actor-aware weighting VALIDATED.** Keeps: DD 6:22 (yes — first-fail
> trim landed), RL 2:25 (yes — scored ON + his sarcasm; transcript-driven), DD
> 1:41 (soft yes — end trimmed the controller-crash punchline), RL 5:31 (soft
> yes — starts at the goal, energy + stakes carry it). The one Gemini-driven NO
> (EO 28:06) fails on attempt-without-payoff, an axis the actor field can't
> see. Also validated: v2 correctly dropped the 2:25 opponent goal as spectator
> and the pick survived via mic/transcript — no signal lost (nuance recorded:
> opponent-acts-ON-him = his moment-as-victim, not pure spectating). **New
> finding — the precision frontier is cut BOUNDARIES:** both imperfect keeps
> fail at the edges (payoff cut off the end / cause cut off the start);
> candidate future experiment: window extension to include cause + payoff.
> Talk-driven new territory stays weak (1 yes of 5 — complaining, bland
> gameplay, chat drama all NO, matching the v3 chip classes). Eyeball delivery
> upgraded: picks now ship as proxy-cut video files in a Desktop folder, not
> timestamp lists. Integration order: **#237 first**, then pipeline wiring
> behind its own ablation cell.
>
> **2026-08-04 (session 148): #237 LANDED (§Step 5) — integration gate cleared,
> ceiling hack retired. Next: pipeline wiring behind its own ablation cell,
> carrying Step 5's watch item (RL Day10's knife-edge approved row under the
> raw-score merge).**
>
> **2026-08-04 (session 149): PIPELINE INTEGRATION SHIPPED (full detail in
> #235).** `src/main/gemini-watch.js` (v2-actor prompt FROZEN verbatim,
> actor-aware spectator-drop merge at raw confidence) + background stage in
> ai-pipeline.js (starts after probe, awaited before the Claude call — adds
> ~0-3 min wall time; failure never aborts the pipeline; skips on no key /
> `geminiWatchEnabled: false` / test mode; ~$0.15-0.25 per recording).
> Harness `--gemini` now requires the prod merge functions, so cells measure
> shipped code. New v2 watches: RL Day8 (13 events), EO Day3 (7), RL Day9
> re-watch (**0 events** — no-hallucination holds on v2). **Integration cell
> `f10-gemInt` (six recordings): pooled 22/26 = 85% vs f10-mix 25/26 — gate
> NOT held as measured.** The 4 lost rows: RL Day10 22:14 knife-edge
> reproduced exactly (1 of 3 runs, same as gemD4); DD 10:26 boundary-shaved
> by 4s (gemD4 hit it); EO Day3 8:36 lost to pick-window tightening (gemini's
> tight 7-17s events pull Claude's cuts in) and 6:33 to tail-budget
> displacement (was mix's rank-14 conf-0.63 pick). Rejected-hit rate
> IMPROVED (49% → 46%) and displacing picks include D3-verdicted keeps — the
> loss axis is cut boundaries + fixed ~15-pick budget under midpoint scoring,
> exactly the precision frontier Fega's D3 verdicts named. 13-pick eyeball
> list (mostly mic-driven fresh territory) shipped as proxy cuts to
> `Desktop\ClipFlow Eyeball f10-gemInt\`.
>
> **Noise-check runs DONE same session (post credit top-up, $0.39): DD's
> loss was NOISE (5/5, 5/5 on re-runs — the 10:26 miss was a 4s boundary
> coin-flip); EO Day3's is SYSTEMATIC (6/8 in all 3 runs — 6:33→7:12
> displaced every run, a second marginal row rotates). Expected pooled with
> the signal ≈ 23/26 (88%) vs 25/26. Mechanism: densest approved recording
> (8 rows) + 7 gemini events competing for a fixed ~15-pick budget; the two
> weakest historical rows lose their slots. GATE DECISION WITH FEGA —
> options: eyeball the 13 new picks first (the 4 displacing EO Day3 picks
> are in the folder; ≥2 keepers arguably flips the trade net-positive),
> keep default ON + run the pick-budget/cut-boundary cell next, or flip
> default OFF until a cell passes. No live exposure either way until the
> next installer ships (batching rule).**
>
> **Fega's 13 eyeball verdicts (2026-08-05, full table in #235): 4 solid + 2
> qualified keeps — but the cross-check flipped the analysis: EVERY keeper
> is also found by f10-mix (no gemini), and mix now surfaces the D2/D3
> "gemini-unique" DD keeps (6:22, 1:41) on its own. Gemini's apparent
> uniqueness was an artifact of the pre-#237 saturated timeline. Measured
> net effect of the signal post-#237 on these six recordings: −2 systematic
> recall (EO Day3) + RL Day10 knife-edge, −3pts rej-hit (small win),
> ~$0.15-0.25/recording, no unique usable territory. Gemini-driven picks
> 0/2 this round (cumulative 4/11). NOT refuted: the quiet-spectacular
> niche the signal was designed for — unsampled by all six mic-heavy test
> recordings. RECOMMENDATION posted: default OFF until a cell re-earns the
> slot (pick-budget/cut-boundary next; re-test on a quiet-spectacular
> recording when one exists). New taste classes recorded: cut-boundary ×2
> more (cause at start / sentence at end), adjacent-pick split (RL9),
> time-sensitivity (World Cup), chat-talk keeps-when-it-frames-his-
> predicament nuance.**
>
> **GATE DECISION (Fega, 2026-08-05): default OFF, per the recommendation.**
> One-line change in ai-pipeline.js — the watch runs only with
> `geminiWatchEnabled: true` + a key. All code + harness machinery kept;
> re-earn path = pick-budget/cut-boundary cell, and/or a re-test on a
> recording with a known quiet-spectacular moment.
>
> **2026-08-05 (session 151): #238 RUN + WINNER SHIPPED (full tables in #238).**
> Post-#239 re-baseline first (`f10-mix-rebase`): truth 26 → 29 pooled rows,
> baseline 26/29 = 90% recall / 47% rej-hit / 87% boundary coverage (new
> metric: fraction of each hit approved row's window covered by its best
> pick). Cells, single-factor: **A pick-budget scaling ("~1 clip per 90s,
> min 10, max 25") = 29/29 recall, rej-hit flat, coverage 93% — SHIPPED**
> (ai-prompt.js count constraint; Fega's call same day). Headline mechanism:
> the fixed ~15-pick budget was itself causing bad edges — coverage improved
> with ZERO boundary language. **B cut-boundary rewrite (cause/payoff +
> anti-split): no recall gain, coverage worse solo (83%) — SHELVED**; the
> RL9 adjacent-split still occurred and EO Day3 14:28 still started at the
> reaction. C (A+B): best precision (44%) + coverage (94%) but coin-flips
> the RL Day8 ANKLES BROKEN cold-open start (2/3 runs start at the reaction)
> — deltas vs A within noise, not shipped. Gemini stretch cell SKIPPED
> (default OFF stands; A removes the displacement mechanism, so a future
> re-audition inherits the fix). Eyeball round: only 4 never-judged picks;
> 1 keep (EO Day3 17:41 jump-fail, "I would use it" — A-only territory),
> 3 NOs all on payoff-not-visible-on-screen (mic-driven picks about unseen
> action remain the weakest class — candidate future cell). Watch items:
> short-tail pick counts scale DOWN (RL Day9 7 → 4, recall held), one 5s
> pick below the 7s minimum observed on DD.

The engine has never *seen* gameplay — it reads words, hears audio events, looks at
stills. Visually spectacular but quiet moments are near-invisible (#190 closes this
only partially via game audio).

Grounded math from Fega's own titlegen logs (#193): 36s clip = 5,391 input tokens on
gemini-3.6-flash → ~100-110 tokens/sec → a 30-min recording ≈ ~190k tokens, one Flash
call (1M context), ≈ $0.28-0.30 input at logged rates. $0 on the current free tier
(flowveapp@gmail.com) but a call that size strains free-tier per-minute quotas — adds
weight to the billing flip already owed on that account.

**Locked shape: a SIGNAL, not a replacement.** Gemini watches a downscaled proxy
(masters are 2560×2880 HEVC — too heavy to upload raw) and emits "visual moment"
events into the existing event timeline; Claude keeps final picks with taste
calibration. Needs: proxy transcode step, Files API upload, timestamp-drift mitigation
(snap to transcript, as the pipeline already does). Validate as harness variant D on
2-3 recordings BEFORE deciding whether it joins the pipeline.

## Step 5 — Event-timeline de-saturation · SHIPPED 2026-08-04 (#237, session 148)

Found during variant D (#235): the prompt's top-50 event list was 100% pitch_spike.
Diagnosis on the six harness recordings' real timelines showed THREE saturated
signals, not one — per-signal score formulas clamp at 1.0 and real gameplay blows
past the clamp constantly (RL Day10: pitch_spike 167 events at exactly 1.00,
reaction_words 250, transcript_density **781 of 781**). The plain top-50 sort
resolved the huge 1.00 tie block by array insertion order; pitch_spike "won" only
because signals.js pushes it first. game/gemini signals (which top out below 1.0
by design) could mathematically never render.

Fix — `selectTimelineEvents` (src/main/ai-prompt.js), selection-only; score
formulas, composite scores, and frame selection untouched:
- Best-score-first walk, **cap 10 lines per signal**, same-signal near-duplicates
  collapsed (midpoints within 10 s — the #190 frame-reservation rule), backfill
  with best leftovers when few signals are present. 8 new unit tests (60 green).
- Harness `--gemini` merge now uses **raw Gemini confidence** (0.72–0.95); the
  score-1.0 ceiling hack is retired.

Gate (pooled, run1 per cell): **f10-mix 25/26 = 96% recall** (f10 record: 24/26),
rejected-hit rate 49% (f10: 48%) — recall holds, done per the locked rule. RL
Day10's mix went `{pitch_spike: 50}` → `pitch 10, density 10, reaction 10,
game_energy 9–10, game_yamnet 2`; with --gemini all 9 visual events land at raw
scores. f10-gemD4 (3 recordings) pooled 10/12 vs gemD3's 11/12 — the delta is
RL Day10's single approved row (22:14), caught 1 of 3 runs. Diagnosed as
pick-budget competition from gemini's new-territory picks (the row's timeline
line IS in the selection; gemini displaced only junk lines) — recorded as a
**#235 integration-cell watch item**, not a #237 regression. Known limitation:
within a 1.00 tie block the capped picks are the earliest distinct windows
(video-start lean; baseline had the same bias on all 50 lines).

## Step 6: Sonnet 5.5 vs Sonnet 4.6 · NO SHIP as-is (#480, session 282, 2026-10-01)

Same six recordings, today's prompt, `--frames 10`, 3 passes per arm (labels `m55-*` = pass 1,
`m55b-*` = passes 2-3). Truth is now 30 approved rows (RL Day9 4, RL Day8 4, RL Day10 1,
EO Day3 9, EO Day4 7, DD Day2 5). Harness gained `--model` / `--effort`, per-model rates and
`stop_reason` checking; summary by `tasks/spikes/replay-score/_summ480.js` (coverage = mean best
overlap share of each matched approved row, from a copy of the prod feedback table).

| Arm | Recall (pooled, 18 runs) | Rejected-hit | Coverage | Picks/run | $/run | s/run |
|---|---|---|---|---|---|---|
| Sonnet 4.6 (today) | **83/90 = 92%** | 147/287 = 51% | 83% | 15.9 | $0.100 | ~14 |
| Sonnet 5.5 @low | 76/90 = 84% | 131/241 = 54% | 78% | 13.4 | $0.070 | ~6 |
| Sonnet 5.5 @medium | 74/90 = 82% | 138/252 = 55% | 78% | 14.0 | $0.071 | ~6 |

Reading: 5.5 is ~30% cheaper and twice as fast, but loses 7-9 approved clips per 90 and is LESS
precise (higher rejected-hit while picking fewer), so it is not just the pick budget: its taste
reads further from Fega's on this prompt. Effort barely matters. Input tokens are ~15% higher on
the 5.5 tokenizer (EO Day4: 38.8k vs 33.8k). Every 5.5 run ended `end_turn` (no refusals, no
cut-offs at 16k max_tokens). Fails the gate (recall below today's fresh baseline and below 26/29
equivalent). Kept on Sonnet 4.6.

Possible re-test, not scheduled: the prompt was tuned on 4.6 over #183/#238/#245; newer models
read instructions more literally. A 5.5-specific prompt cell (pick budget wording first) would be
the next thing to try, scored the same way.

### Step 6b: prompt cells for Sonnet 5.5 · STOPPED on credit balance (session 282)

Edits live in `tasks/spikes/replay-score/prompt-variants.js` (harness `--prompt-variant`), applied
to the built prompt with asserted anchors; `src/main/ai-prompt.js` untouched. Rendered prompts were
read before any spend (`--dry` now writes `_tmp/prompt-<label>.txt`); that read caught a stated
count of 14 contradicting the "don't settle at 14-15" line and the recall text contradicting the
rejected section's "do NOT pick", both fixed before the runs.

- `count`: "return at least N clips for this ~M-minute recording" at one per 80 s (matches what
  4.6 actually returns: 21 min -> 16, 30 -> 23); recordings too short for 10 keep the original rule.
- `recall`: "first of two passes, a missed moment costs more than a weak pick", rejected examples
  lower confidence instead of excluding.
- `high`: base prompt at effort high.

| Arm (Sonnet 5.5) | Recall | Rejected-hit | Coverage | Picks/run | $/run |
|---|---|---|---|---|---|
| base @low (Step 6) | 76/90 = 84% | 54% | 78% | 13.4 | $0.070 |
| count @low | **79/90 = 88%** | 51% | 78% | 17.2 | $0.073 |
| recall @low | 74/90 = 82% | 57% | 76% | 13.3 | $0.071 |
| base @high (16 of 18 runs) | 72/82 = 88% | 49% | 77% | 16.0 | $0.073 |
| Sonnet 4.6 (Step 6) | 83/90 = 92% | 51% | 83% | 15.9 | $0.100 |

Per recording, `count` beats 4.6 on EO Day3 (27/27 vs 24/27), ties RL Day8/Day9/Day10, and loses
on EO Day4 (16/21 vs 20/21) and DD Day2 (12/15 vs 15/15): the whole remaining gap sits on two
recordings. `recall` framing made things worse (more rejected hits, no recall). Effort high
helped as much as `count`, with the best precision of any arm. Not yet run: `count` + effort
high together, the obvious next cell (~$1.40). The Anthropic prepaid balance ran out on the
`high` arm's RL Day8 runs 2-3; no arm passes the gate yet.

**`count` @high (label `p55-counthigh`, run after the top-up): PASSES the gate, awaiting Fega.**

| | Recall | Rejected-hit | Coverage | Picks/run | Unreviewed | $/run | s/run |
|---|---|---|---|---|---|---|---|
| Sonnet 5.5 `count` @high | **84/90 = 93%** | **157/338 = 46%** | 80% | 18.8 | 95 | $0.080 | 12.4 |
| Sonnet 4.6 (Step 6) | 83/90 = 92% | 147/287 = 51% | 83% | 15.9 | 61 | $0.100 | ~14 |

Per recording vs 4.6: EO Day3 27/27 (24), RL Day8 12/12 (9), RL Day9 12/12 (12), RL Day10 3/3
(3), EO Day4 18/21 (20), DD Day2 12/15 (15). Every 5.5 arm caught DD Day2 12/15, so one approved
DD moment is consistently missed. Reading: recall matches 4.6 (+1 of 90 is inside noise), a lower
share of picks lands on rejected clips but the absolute count of rejected picks is about the same
(157 vs 147), and ~3 more picks per recording land on unreviewed footage. Boundary overlap is 3
points looser. 20% cheaper per recording.

## Decisions locked (do not re-litigate without flagging Fega)

- Engine variants are judged by replay scores against Fega's history, not vibes.
- `repetitive` is mechanical, not taste.
- Grouped-by-reason, tagged-first negative calibration.
- Gemini full-watch = event-timeline signal, Claude stays the picker.
- Frames change (any) ships only after Fega's sign-off + 1-2 verification replays.

## Open decisions (Fega)

1. **Frames 20 → 10 default — APPROVED by Fega 2026-08-04, SHIPPED + VERIFIED same
   day** (session 146). ai-pipeline.js Stage 5 now passes topN=10; #190 reservation
   stays `min(4, topN)`. Harness `deriveFrames` updated to mirror the new selection
   (top N−R composite + R reserved), closing the no-reserved-frames caveat.
   Verification replays (`f10-verify`) on the two recordings where reservation fires:
   RL Day10 Pt1 recall 1/1 (rej hits 6/15, = baseline), DD Day2 Pt1 recall 5/5
   (beats baseline's 4/5; rej hits 7/15 vs 8/15). Recall holds — done per the
   locked rule.
2. Gemini billing flip — **DONE 2026-08-04.** Fega flipped flowveapp@gmail.com to
   pay-as-you-go (individual billing profile). #235 unblocked at real volume; paid
   tier also means prompts are not used for Google product improvement.

## Live metric

`#194` rolling per-game approval stats (Feedback → approval rates, quality = conf ≥0.7
excluding mechanical rejects) is the production complement to the harness — if v3
tagging works, RL's rolling quality rate climbs over the next generations.

## Step 7: watch-and-listen judge · TESTED, combine-with-confidence is the candidate (#483, session 283, 2026-10-01)

Test set (`tasks/spikes/humor-study/judge-set.py`): 240 of Fega's reviewed clips, 120 hype reaction
(all 100T) and 120 comedy (EO, MC, RL, ROBOT, DD, AR, JC; game-stratified), half kept and half rejected.
Mechanical rejects (duplicate, bad-cut, wrong-content, repetitive) excluded; GTA6-R excluded (one-off).
Each clip cut raw from the master over the AI window, 720p + stereo audio, judged by gemini-3.6-flash
(`judge.js`). Rubric per kind (from `tasks/specs/humor-playbook.md`); the `judge` arm adds 12 keeps +
12 rejects of the same kind from OTHER recordings as text. Scored by `judge-score.py`.

| Score | AUC all | Hype (100T) | Comedy | Rejects removed at ≤10% keeps lost | $/clip |
|---|---|---|---|---|---|
| Detection confidence (today, free) | 0.704 | 0.621 | 0.789 | 25% | 0 |
| Judge, rubric only | 0.731 | 0.683 | 0.800 | 27% | $0.011 |
| Judge + Fega's examples | 0.725 | 0.667 | 0.786 | 24% | $0.013 |
| **Confidence + judge (rank average)** | **0.754** | 0.674 | **0.845** | **44%** | $0.011 |

- The judge alone is only slightly better than the confidence Corva already has. The two catch
  different clips: averaged, they beat confidence alone by 0.05 AUC (bootstrap 95% CI +0.015 to +0.09)
  and remove 44% of rejects at 10% of keeps lost (vs 25%).
- Fega's examples as text did not help (effect CI -0.04 to +0.03). Drop them; the rubric carries it.
- Kind is classified right 99.6% of the time, so routing by kind is solved.
- Reaction end: cutting 1 s after the judge's `reaction_end_t` lands closer to Fega's real end than
  the AI window (median error 5.5 s vs 7.4 s, 29% vs 23% within 2 s, 92 published clips). Better, not
  good enough to auto-trim yet.
- **Why 100T stays hard:** the misses are systematic. Fega KEEPS taunts and story beats with no play
  on screen ("We're in their heads!" over two enemy timeouts, trash talk at Keeko, the trophy-lift
  "why am I feeling so emotional"), and REJECTS many generic "GET HIM OUT OF THERE!" screams (19 of 60
  test rejects are "live-only"). In 100T streams the big hype scream happens every round; what he keeps
  is the moment that stands out FROM THAT STREAM. Judging one clip at a time cannot see that. Next cell:
  judge all candidates of one recording together and rank them (distinctiveness within the stream).

### Step 7b: 100T with Fega's play-quality rule, one clip vs whole recording (#483, session 283)

Fega (s283): the same line ("get him outta here") is a highlight on a triple kill or a clutch and not on a
shabby single kill. Rubric v2 says so (`stream-judge.js`): the quality of the play decides, the line alone
means little; standout taunts and story beats count. Two modes on every reviewed 100T clip (mechanical
rejects excluded): `single` judges each clip alone; `stream` sends all of one recording's candidates
(up to 22) in one call, in stream order, and asks which stand out. 269 clips / 98 keeps / 18 recordings
scored (Day3 Pt3 timed out in `single` twice and is left out). Scored by `stream-score.py`.

| Score | AUC | AUC inside a recording | Top-k: show as many as Fega kept | Rejects removed at ≤10% keeps lost | $ |
|---|---|---|---|---|---|
| Detection confidence | 0.638 | 0.673 | 54/98 | 12% | 0 |
| **Single clip, rubric v2** | **0.750** | **0.783** | **64/98** | **33%** | $2.38 |
| Whole recording, rubric v2 | 0.720 | 0.764 | 61/98 | 15% | $1.75 |
| Confidence + single v2 | 0.718 | 0.740 | 63/98 | 29% | |

- **The play-quality rule works:** single-clip v2 beats detection confidence on 100T by +0.11 AUC
  (bootstrap by recording, 95% CI +0.04 to +0.19). On the 111 clips cell 1 also judged: 0.744 vs the
  cell-1 rubric's 0.719.
- **Seeing the whole recording did NOT help** (−0.03, CI −0.10 to +0.05). The "stands out from the
  stream" hypothesis is not supported; it is cheaper per clip but no better.
- **Do not average with confidence on 100T:** confidence is weak there and drags the judge down. On
  comedy the average is what helps (Step 7). So the candidate design is routed by kind: hype → judge
  alone, comedy → judge + confidence.

### Step 7c: rules v3 on every reviewed clip + a personal scorer (#483, session 283, 2026-10-02)

Judge v3 (`judge.js --arm v3`): cell-1 rubric + the play-quality rule + Fega's round-2 answers (plays
against 100T count, lost clutches can count, live over replay unless the replay condenses a multi-kill,
over-the-top taunts yes / story talk no, a friend's joke with Fega laughing is a keep). Run on all 770
reviewed clips over 54 recordings (`scorer-set.py`; mechanical rejects and GTA6-R excluded), $8.30.
`scorer.py` (run with the transcription venv for scikit-learn) trains on Fega's keep/reject with every
recording held out in turn. Features: judge keep/play/reaction scores, detection confidence, kind,
duration, max per event-timeline signal in the window, max YAMNet probability per mic/game sound group.
AR rows weighted 0.3.

| Score (770 clips, 229 keeps) | Hype AUC | Comedy AUC | Top-k (show as many as kept) | Rejects removed at ≤10% keeps lost |
|---|---|---|---|---|
| Detection confidence | 0.628 | 0.717 | 135/229 | 20% |
| Judge v3 | 0.697 | 0.807 | 141/229 | 26% |
| Learned: signals only (no judge) | 0.623 | 0.722 | 129/229 | 28% |
| Learned: confidence + judge | 0.682 | 0.805 | 140/229 | 36% |
| Learned: everything | 0.658 | 0.808 | 146/229 | 35% |
| Learned: everything, boosted trees | 0.633 | 0.767 | 138/229 | 34% |

- **The judge carries it; a trained scorer adds little.** Sound and loudness features alone are about as
  good as detection confidence, and adding them to the judge does not raise AUC. A learned blend of
  confidence + judge removes more rejects at the 10% line (36% vs 26%) but ranks no better overall. Not
  worth shipping yet; revisit when the label count has grown.
- **v3 is not better than v2 on 100T.** Same 269 clips: v2 0.750, v3 0.716 (CI of v3 − v2: −0.09 to
  +0.02). v3 now scores some rejected opponent plays and routine round wins high (e.g. LOUD's 1v3
  against 100T, 15 → 88). Keep the v2 hype rubric; the "plays against 100T count" line needs Fega's
  examples of which ones, or it over-fires. Comedy v3 ≈ cell 1 (0.807 vs 0.800).
- **Views are not predictable from the clip yet.** Within each kind (published ≥ 7 days, percentile within
  kind), the best single links are reaction words (hype, Spearman 0.32), judge keep score (hype 0.26,
  comedy 0.18) and detection confidence (comedy 0.21). A views model trained on the other recordings
  barely ranks a held-out recording (0.10 hype, 0.05 comedy). What drives views mostly sits outside the
  clip (which match and teams, posting time, platform algorithm). Retention data (#484 next steps) is
  the better views signal.
- Ship candidate: judge only, rubric per kind (v2 for hype, v3 for comedy), as a sort with a reason line.

### Step 7d: shipped judge (v4) · GATE PASSED, built behind a setting (#483, session 283, 2026-10-02)

`src/main/clip-judge.js` = generic two-kind rubric (v2 hype + the round-3 "against the team: only an ace or a
clutch with a hard reaction" rule, v3 comedy, no creator names or catchphrases; the game's own
`aiContextUser` supplies them), preview cut with `ffmpeg.cutTitlePreview` (the title/caption cutter),
gemini-3.6-flash with audio. Gate = the shipped `judgeOne` run on the 770 reviewed clips through
`tasks/spikes/humor-study/judge.js --arm v4` (768 judged, $8.06):

| | Hype AUC (290) | Comedy AUC (478) | Rejects pushed below the ≤10%-keeps-lost line |
|---|---|---|---|
| Detection confidence | 0.630 | 0.717 | |
| Judge v3 | 0.695 | 0.807 | |
| **Judge v4 (shipped)** | **0.724** | **0.827** | hype 23%, comedy 46% |

On the 268 100T clips v2 also judged: v4 0.748 vs v2 0.750 (the round-3 rule recovered v3's loss).
Pass line was hype ≥ 0.72, comedy ≥ 0.79. 14 of ~780 calls hung to the 300 s timeout and 12 succeeded on a
later retry; the shipped module waits 60 s and retries once (normal calls 7-20 s).

End to end (real `runAIPipeline`, 5-minute copies, isolated userData/library on W:, prod DB copy): 100T copy
10/11 clips judged, $0.081, one clip hung twice (2 × timeout); RL copy with the personal Gemini key blanked
ran entirely through the bundled gateway (BYOK) 9/10 judged, $0.072; judge OFF = skipped, 0 judged.
`ai_calls` got one `clip_judge` row per clip; feedback migration v16 applied.
