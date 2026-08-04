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
> **2026-08-04 (session 149): #235 pipeline integration SHIPPED (§Step 4 —
> prod watch module, background stage in ai-pipeline, default ON with a key).
> Integration cell f10-gemInt: pooled 22/26 = 85% vs f10-mix 25/26 — gate NOT
> held on run1s; diagnosis = cut-boundary tightening + tail-budget
> displacement, NOT bad moment selection (rej-hit improved 49%→46%).
> Noise-check re-runs + gate decision BLOCKED on Anthropic API credits.**

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
> `Desktop\ClipFlow Eyeball f10-gemInt\`. **Queued, blocked on Anthropic API
> credits: 2×2 noise-check runs on EO Day3 + DD Day2 (~$0.40), then Fega's
> gate decision** (hold behind flag / accept documented edge-loss + run the
> cut-boundary experiment next / revert default-on).

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
