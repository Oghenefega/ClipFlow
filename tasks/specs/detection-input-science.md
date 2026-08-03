# Detection Input Science — Measurable Feedback Loop + Ablation Program

> Status (2026-08-03): Steps 1-2 SHIPPED (commits `90f0313`, `86a7970`), first ablation
> cells run and recorded. Produced by Fable (ClipFlow dev), session 144; full plan
> approved by Fega in chat 2026-08-02.
> GitHub: epic [#231](https://github.com/Oghenefega/ClipFlow/issues/231) · children
> [#232](https://github.com/Oghenefega/ClipFlow/issues/232) (chips v2, closed
> `status: untested`), [#233](https://github.com/Oghenefega/ClipFlow/issues/233)
> (harness, closed `status: untested`), [#234](https://github.com/Oghenefega/ClipFlow/issues/234)
> (ablations, OPEN — results in comments), [#235](https://github.com/Oghenefega/ClipFlow/issues/235)
> (Gemini full-watch, OPEN — not started).
> **One open decision for Fega: screenshots 20 → 10 default (see §Open Decisions).**

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

## Step 1 — Rejection reasons v2 · SHIPPED (#232, commit `90f0313`)

Why: "not funny" (67 uses) and "nothing happens" (67) dominated and were constantly
co-tagged — a vocabulary too coarse to teach. 140 of RL's 200 rejections predate
tagging entirely and injected as bare quotes.

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

Findings:
1. **Screenshots earn their keep; 10 do the work of 20.** Zero frames loses 3 of 26
   kept moments; ten loses none at −28% cost.
2. **Recall is near-ceiling — precision is the frontier.** ~Half of picks land on
   historically-rejected-type moments in every variant. (This aligns with Mushu's
   2026-07-31 render-review note about weak cold opens — the engine finds the moments,
   it's the *judgment* layer that needs work.)
3. **The rejected section moves nothing measurable yet** (49% → 48% without it, within
   noise) — expected, since the pool was mostly untagged legacy rows. Keep it (~800
   tokens); RE-TEST after a few generations of v2-tagged rejections accumulate.

Remaining cells: `--no-approved`, `--no-playstyle`, and the post-#232 `--no-rejected`
re-run once tagged rows dominate the 50-row window.

## Step 4 — Gemini full-recording watch · NOT STARTED (#235)

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

## Decisions locked (do not re-litigate without flagging Fega)

- Engine variants are judged by replay scores against Fega's history, not vibes.
- `repetitive` is mechanical, not taste.
- Grouped-by-reason, tagged-first negative calibration.
- Gemini full-watch = event-timeline signal, Claude stays the picker.
- Frames change (any) ships only after Fega's sign-off + 1-2 verification replays.

## Open decisions (Fega)

1. **Frames 20 → 10 default** in ai-pipeline.js Stage 5 — data says free money (same
   recall, −28% cost). Caveat: the tested f10 cell had no #190 game-event reserved
   frames; the real change keeps reservation min(4,10) — verify with replays after.
2. Gemini billing flip timing (prereq for #235 at real volume).

## Live metric

`#194` rolling per-game approval stats (Feedback → approval rates, quality = conf ≥0.7
excluding mechanical rejects) is the production complement to the harness — if v2
tagging works, RL's rolling quality rate climbs over the next generations.
