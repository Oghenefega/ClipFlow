# HANDOFF — Session 283 (2026-10-01 → 10-02)

## Current State

**0.5.0-alpha.19 is on the update feed** with the clip judge (#483): Settings → Pipeline → "Rank new clips by
watching them" (off by default). When on, Gemini watches and listens to each new clip, gives a score and a
one-line reason, and the Projects list puts likely keepers first. Fega has been told to install on desktop and
laptop and switch it on. Nothing is unreleased.

The session also ran the research behind it, all under `tasks/spikes/humor-study/`:
- the humor study (#484): `tasks/specs/humor-playbook.md`, with Fega's answers in rounds 1-3
- three judge test cells, the shipped-code gate and a personal-scorer test: `tasks/specs/detection-input-science.md` Steps 7 to 7d

## Key Decisions

- **Two kinds of clip, judged differently (Fega confirmed).** Hype reactions (100T) are judged on play quality plus his reaction. Comedy is judged on being funny to a stranger. The judge picks the kind itself (99.6% right).
- **Judge only, no trained scorer.** A model trained on his 770 decisions with sound/loudness signals added nothing over the judge. Showing his past examples as text added nothing either. Revisit when there are more decisions.
- **No app clone.** Fega-tuned work stays in `tasks/spikes/`; anything shipped is a per-user mechanism. His rules live in his own 100T game description (`aiContextUser`, rewritten this session, backup `%APPDATA%\Corva\clipflow-settings.backup-2026-10-02-pre-100t-desc.json`). Memory: `feedback_experiments_generic_ship`.
- **Unwatched clips sort last and show no score** (Fega: best first reduces fatigue). Ranked recordings hide the clip-finder confidence (Fega: "what's the point").
- **Learn both keeps and views**, but nothing measured predicts views within a kind yet. Retention data is the next views signal.

## Next Steps

1. **Ask Fega how ranking feels after a few recordings.** Suggested wording:
   > "With 'Rank new clips by watching them' on, do the top clips match what you'd keep? Any reason line that made no sense? After about 10 recordings I can show how often you kept what it put on top."
   Then read the real keep rate by score: `SELECT judge_kind, judge_score>=60, decision, COUNT(*) FROM feedback WHERE judge_score IS NOT NULL GROUP BY 1,2,3`.
2. **Ask Fega whether the laptop check passed.** Suggested wording:
   > "On the laptop, did the Rocket League recording come back sorted with reasons with the setting on, and in the old order with it off?"
   If yes, remove `status: untested` from #483 (label it untested now if not yet).
3. **Hung Gemini calls (plan line).** About 1 in 10 judge calls stalled in the end-to-end runs (2% in the test kit). A clip that stalls twice gets no score. If Fega sees many "couldn't watch" lines, try `thinkingLevel` or a shorter first timeout as a replay cell first.
4. **Next research steps (from the plan, ask before spending):**
   - pull pre-Corva shorts + views from his YouTube channel;
   - test a YouTube Analytics retention call on one Short;
   - auto-trim ends from the judge's `reactionEndT`. Fega keeps ~7 s after the payoff, detection leaves ~16.
5. **Carried over from s282 and earlier:** the Resolve relink-tip wording, the React switch check (#472, #474-#477), #478 split quirks.

## Watch Out For

- **Gemini and Anthropic are both prepaid with no auto-recharge.** The Gemini balance ran out mid-test this session, and the app's titles fell back to Claude stills until Fega topped up. State each run's cost and the day's total.
- **The judge's prompt is generic on purpose** (a test fails if "100 Thieves", "Valorant" or a catchphrase appears in `clip-judge.js`). Creator specifics go in the game description, never the code.
- **The 100T rubric:** "plays against the team" needs the ace-or-clutch-plus-hard-reaction limit. The looser v3 wording over-fired (0.716 vs 0.750).
- **Test scratch on W:** `W:\corva-s283-verify\` holds two recording copies (~4.4 GB), scratch projects and logs. It's safe to delete; it was left for Fega to decide.
- `tasks/spikes/humor-study/_report.txt` is an untracked leftover (delete was blocked).

## Logs/Debugging

- Judge calls: `ai_calls` rows with `kind = 'clip_judge'` (ok, duration_ms, cost_usd, error). The pipeline log has a "Clip Judge" step with judged/failed/cost. Skips are logged with the reason (setting off, test mode, no key/gateway).
- Feedback migration 16 added `feedback.judge_score` and `judge_kind`.
- Re-running the gate: `node tasks/spikes/humor-study/judge.js --arm v4 --manifest scorer-manifest.json` (resumable, ~$8). Then score it with the snippet in spec Step 7d, or `judge-score.py` / `stream-score.py` for the older cells. `scorer.py` needs the transcription venv for scikit-learn: `D:\whisper\betterwhisperx-venv\Scripts\python.exe`.
- End-to-end harness: `W:\corva-s283-verify\judge-harness.js`. Run it with `npx electron <harness> "<mp4>" <tag> on|off [--gateway-only]`; it isolates userData, the library and processing on W: and uses a copy of the prod DB.
