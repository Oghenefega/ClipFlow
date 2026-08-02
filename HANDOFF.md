# ClipFlow — Session Handoff

_Last updated: 2026-08-02 — Session 144 (S144 · Detection science: chips v2 + replay harness + first ablations) — **no installer cut; chips v2 rides the next batch.**_

---

## One-line TL;DR

Fega asked whether the clip AI's inputs (play style, transcript, approved/rejected feedback, screenshots) are actually useful or just noise; we measured instead of guessed — shipped sharper rejection chips + a grouped teaching section (#232), built a replay-and-score harness that grades the engine against his own historical decisions (#233), and ran the first ablations (#234): 10 screenshots do the work of 20, recall is near-ceiling at 92%, and precision (~half of picks land on rejected-type moments) is the real frontier.

## Current State

Master clean, pushed. Epic [#231](https://github.com/Oghenefega/ClipFlow/issues/231) open with 4 children: [#232](https://github.com/Oghenefega/ClipFlow/issues/232) chips v2 (closed `status: untested`), [#233](https://github.com/Oghenefega/ClipFlow/issues/233) harness (closed `status: untested`), [#234](https://github.com/Oghenefega/ClipFlow/issues/234) ablations (open — 3 of ~6 cells run, results in comments), [#235](https://github.com/Oghenefega/ClipFlow/issues/235) Gemini full-watch prototype (open, not started). No installer cut this session — chips v2 is renderer+main code that rides the next batched build (batching rule).

## What Was Just Built

- **#232 — rejection reasons v2.** Four new chips in `ProjectsView.js` (`setup-talk`, `chat-banter`, `flat-delivery`, `repetitive`); `repetitive` ("Too similar") is mechanical — excluded from negative calibration (`ai-prompt.js` EXCLUDED_REJECT_REASONS) and from quality-rate stats (`feedback.js` MECHANICAL_REJECT_REASONS). `buildRejectedSection` rebuilt: tagged rows fill the 3k-char budget first, grouped under `## Rejected because: <reason>` headers (canonical order in REJECT_GROUP_ORDER), untagged legacy rows last under "no stated reason". Rejected fetch window 30→50 (`ai-pipeline.js`). 50/50 unit tests green; real-DB RL section verified grouped and note-carrying; renderer bundle + dev-profile boot verified.
- **#233 — replay-and-score harness.** `tasks/spikes/replay-score/harness.js`: rebuilds the detection LLM call from saved artifacts (`processing/claude|energy|signals|frames`), current prompt code, prod settings (`clipflow-settings.json`), prod game profiles, and a read-only DB copy; scores picks against that video's feedback rows (match = midpoint containment either direction). Leakage guard: few-shot pools exclude the replayed video. Variant flags: `--frames N`, `--no-rejected`, `--no-approved`, `--no-playstyle`, `--runs N`, `--dry`. Results in `results/*.json` + `_summary.json`.
- **#234 — first ablation cells** (6 recordings: RL Day9 Pt1, Day8 Pt8, Day10 Pt1; EO Day3 Pt2, Day4 Pt1; DD Day2 Pt1; ~$2.75 total):

  | variant | recall | rej-hit rate | $/run |
  |---|---|---|---|
  | baseline (20 frames) | 24/26 = 92% | 49% | $0.133 |
  | 10 frames | 24/26 = 92% | 48% | $0.096 |
  | 0 frames | 21/26 = 81% | 49% | $0.059 |
  | no rejected section | 24/26 = 92% | 48% | $0.131 |

## Key Decisions

- **Measured, not vibed:** every input's value is judged by replaying past recordings against Fega's own approve/reject history. His eye is the ground truth, not the measuring instrument.
- **`repetitive` is mechanical, not taste** — "good moment, too similar" must never teach the AI to avoid good moments.
- **Grouped-by-reason beats flat list** for negative calibration; untagged rows are last-class citizens in the budget.
- **Gemini full-watch (#235) will be a timeline SIGNAL, not a detection replacement** — grounded cost from Fega's own titlegen logs: ~100-110 tokens/sec → ~190k tokens ≈ $0.28-0.30 per 30-min recording (fits one Flash call).
- **Frames 20→10 default change is PROPOSED, not shipped** — awaiting Fega's sign-off (comment on #234). It halves image cost with zero measured recall loss.

## Next Steps

1. **Fega decision:** ship frames 20→10 in `ai-pipeline.js` Stage 5 (`extractTopFrames(..., 20, ...)` → 10)? If yes: one-line change + verify with 1-2 replays (the tested f10 cell had no game-event reserved frames; the real change keeps reservation min(4,10)).
2. **Remaining ablation cells (#234):** `--no-approved`, `--no-playstyle`; re-run `--no-rejected` after a few generations of v2-tagged rejections accumulate.
3. **#235 Gemini prototype** — proxy transcode + Files API upload + visual events into the event timeline, validated as harness variant D.
4. Fega's hands-on pass on chips v2 (next generation session: reject a clip on Pending, check the 10 chips render and read well).
5. Watch the #194 rolling approval stats as tagged data grows — that's the live metric the harness complements.

## Watch Out For

- **Harness fidelity caveats:** frame timestamps re-derived by replicating `extractTopFrames` ordering — if that ordering code changes, pairing with on-disk jpgs drifts (noted in harness header). Feedback ground truth only covers moments past runs surfaced; "unreviewed" picks are not necessarily bad.
- **Noise band:** ±1 pick per recording per run (rejected-hit 25%→38% on an 8-pick recording across 2 identical runs). Compare variants on the POOLED 6-recording numbers only.
- **Old rejected rows can now re-enter the prompt**: fetch window is 50, so heavily-rejected games (RL: 200 rows) reach further back; all still filtered to taste-only and budget-capped at 3k chars.
- **`results/*.json` are committed as the baseline record** — don't regenerate over them casually; new experiments get new labels.
- The `Also tagged:` line replaced `Reason:` inside grouped entries — anything downstream parsing the prompt text (nothing known) would need updating.

## Logs & Debugging

- **Harness:** `cd tasks/spikes/replay-score && node harness.js "<videoName>" --dry` (free, prints section sizes) or without `--dry` for a live scored run (~$0.10-0.15). Results: `tasks/spikes/replay-score/results/`, pooled table: `_summary.json`. DB copy lands in `_tmp/` (gitignored).
- **Real prompts per generation:** `%APPDATA%\clipflow\processing\claude\<video>.system_prompt.txt` (+ `.claude_ready.txt`); token/cost lines in `%APPDATA%\clipflow\processing\logs\<video>_<ts>.log`.
- **Feedback DB queries:** `%APPDATA%\clipflow\data\clipflow.db` (repo `data/` copy is STALE — never measure against it).
- Unit tests: `node src/main/ai-prompt.test.js` (50 tests).
