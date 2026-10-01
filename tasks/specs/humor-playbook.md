# Fega's clip playbook (humor study, #484)

Session 283, 2026-10-01. Step 1 of "Corva learns Fega's funny". Feeds the judge (#483),
autopilot (#481) and later auto-edit.

**Data.** gemini-3.6-flash watched, with sound, 404 moments: 255 published clips as
rendered (the finished edit), 79 published clips cut raw over the AI's original window (what
detection proposed), and 70 rejected clips cut raw (game mix matched to the published set,
rejects with reason chips first). One structured breakdown per moment: format, beats with
timestamps, payoff time, whose action, humor mechanism, delivery, key line, opening, ending,
"funny to a stranger" 1-10. Total cost $5.79. Views = mean per-platform percentile on YouTube,
Instagram and Facebook (TikTok has no read scope, #388), clips under 7 days old excluded (225
scored).

Everything is reproducible from `tasks/spikes/humor-study/`:
`build-manifest.py` → `watch.js` → `analyze.py` (writes `analysis.json`). Raw watches in `out/`.

**Caution on size.** 225 scored clips, 79 vs 70 in the keep/reject contrast, 10-43 per game
outside 100T. Findings below are directions to test, not laws. Within-game correlations are
rank correlations (Spearman); anything under ~0.3 at these sizes is a lean.

---

## 1. Fega makes two different kinds of clip, and they win for different reasons

| | Reaction to pro footage (mostly 100T) | Own gameplay (RL, EO, MC, VAL, ROBOT) |
|---|---|---|
| Share of published | 55% | 43% |
| What carries it | Fega as hype-man: "GET HIM OUT OF HERE!", "What did I just watch?" over a pro clutch, with the caster audio under him | Fega's own words set up the fail: "I was born to catch this" → whiff |
| Top mechanism | overreaction 61%, hype/skill (not comedy) 45% | hubris then fail or irony (says X then the opposite) 54%, vs 9% in reactions |
| Delivery | yelling 61%, disbelief | yelling 66%, laughing, disbelief |
| Gemini "funny to a stranger" | median 5 (100T alone: 4) | median 6 |
| Funny score vs views, inside the game | 100T: -0.01 (no link) | RL +0.26, MC +0.22, ROBOT +0.32, EO +0.07 |
| Hype vs views, inside the game | 100T: +0.27 | -0.25 to -0.47 |
| Opening on action vs views | 100T: +0.21 | mixed (MC -0.39, RL +0.11) |

**Read:** one "is this funny?" judge would be wrong for half the library. A generic watcher
scored 11 of the 35 published 100T clips it saw raw at 3 or below ("not comedy"), yet 100T clips
are the ones the audience watches most. The judge needs a rubric per
format:
- **Hype reaction:** is there a real pro play (clutch, multi-kill, disrespectful defuse) AND a
  big, quotable Fega line on it? Does it open on the play?
- **Own-gameplay comedy:** is there a setup line from Fega that the game then contradicts, a
  clear payoff, and a reaction?

A third, smaller format shows up in the GTA 6 reveal clips: first-look commentary
("You can get FAT in this game"). Gemini calls it "informational, not comedy" and Fega keeps it.
News/first-look is a keep reason of its own.

## 2. What the audience rewards (views)

- **100T is the best-performing topic** (median 0.64 percentile vs RL 0.43, EO 0.45, ROBOT 0.40).
  The top 15 clips by views are 13 × 100T. Top-quartile clips are 86% reaction-to-footage;
  bottom-quartile clips are 59% own gameplay.
- **Caster/footage audio under Fega's voice** is in 82% of top-quartile clips vs 29% of bottom.
  (Mostly the 100T effect, same signal.)
- **Opening on the action** is in 48% of top-quartile clips vs 18% of bottom.
- **Length does not matter** in this range (Spearman 0.01; median 18 s top and bottom).
- **Older clips score higher** (-0.24 vs publish date). This is either accumulated views or the
  audience/algorithm changing; the next study should compare clips at a fixed age (day 7 views,
  from `clip_metrics_history`).
- **Inside own-gameplay games, the funnier clip wins**, and added sounds and extra cuts lean
  NEGATIVE in MC and EO (-0.31 to -0.45). Small samples, but worth a look: the heavy edits may
  have gone into clips that needed rescuing.
- Platforms only partly agree (YouTube vs Facebook 0.43, Facebook vs Instagram 0.31). "Good"
  differs by platform, so a later judge should predict per platform.

## 3. What separates a keep from a reject (raw windows, before any edit)

| | Kept (79) | Rejected (70) |
|---|---|---|
| No payoff at all | 4% | 20% |
| Laughing | 66% | 37% |
| Overreaction | 53% | 21% |
| Narrating | 35% | 59% |
| Calm explaining | 15% | 35% |
| "Informational, not comedy" | 5% | 20% |
| Needs context | 29% | 34% |
| Gemini funny median | 5 | 4 |

- **The generic watch already separates keeps from rejects about as well as a coin with a
  70/30 bias** (AUC 0.70 from the funny score alone; 0.71 to 0.74 cross-validated with ten watch
  features). That is with zero knowledge of Fega's past clips and one rubric for both formats.
- **Rejected because "nothing happens" (34 of 70)** gets a funny median of 3: the watcher agrees
  with Fega here. These are the cheap wins for the judge.
- **Only 3 rejects scored 7 or higher:** one "duplicate" (fine to reject, the moment was clipped
  elsewhere), one ROBOT clip with no reason chip, and the RL "it's all part of the plan" goal,
  rejected "not funny, nothing happens". Disagreements like that last one are the most valuable
  examples to put in front of Fega.
- **Practical threshold today:** dropping moments the watcher rates under 3 would remove 20 of 70
  rejects (29%) and cost 6 of 79 keeps (8%): 5 are 100T hype clips and 1 is a GTA 6 first-look. With
  per-format rubrics those 6 should survive. That is the experiment in #483.

## 4. What the edit changes

| | AI window | Fega's final |
|---|---|---|
| Length (median) | 33 s | 18.4 s |
| Shorter than the AI window | | 77% |
| Start moved (median) | | +0.5 s (half later, a quarter earlier) |
| End moved (median) | | -4.5 s (64% end earlier) |
| Seconds kept after the payoff (median) | 16.3 s | 7.4 s |
| Seconds before the payoff (median) | 13.5 s | 12.8 s |
| Cut into several sections | | 57% (median 3 sections) |
| Sound effects added | | 35% |
| Overlays added | | 6% |

- **The start is mostly right; the end is where the AI is wrong.** Detection leaves about
  16 s after the payoff, and Fega keeps about 7. The finished clip ends on his reaction (61%) and
  rarely lingers (23%, vs 57% in the raw windows).
- A naive rule "end 7.4 s after the payoff" halves the median end error (9.7 s → 5.0 s) but is
  rarely within 2 s, because the reaction length varies. Auto-edit should ask the watcher for
  **when the reaction ends**, not apply a fixed tail.
- More than half the clips have middle cuts (dead air or setup talk removed). That is the second
  auto-edit target, after the ending.

## 5. The shape of a Fega clip (own gameplay)

From the funniest own-gameplay clips ("I was born to catch this", "It's so easy! I make it look
so easy", "Tonight I'm not gonna be pissed, I like this egg", "Have I become so strong I can't die
to fall damage anymore?"):

1. **A confident line** (boast, promise, calm claim): the setup is something Fega SAYS.
2. **The game answers immediately** with the opposite (a whiff, a fall, a splat): the trigger.
3. **The reaction**: a scream, mock outrage, or a deadpan beat ("Did he think it was just going
   to be an easy win?").
4. **Cut on the reaction.** Hook at second 0, payoff around 60% of the way in, about 6 s after it.

Detection already looks for the reaction. It should also look back for the confident line: a
self-contradicting setup within ~15 s before the payoff is the strongest own-gameplay comedy
signal in this set (hubris then fail or irony in 54% of own-gameplay published clips, 9% of
reactions; hubris alone in 68% of EO).

---

## What this means for the next steps

- **#483 judge:** two rubrics (hype reaction / comedy), each
  shown Fega's own keeps and rejects of that format. Ask the judge for reaction end and middle
  dead air too, so the same call feeds auto-edit. Bar to beat: AUC 0.70 (generic watch), on the
  90-clip test set.
- **#481 autopilot:** 100T reaction recordings are the best first candidates: highest views, and
  the most consistent shape (pro play + Fega line + caster audio).
- **Auto-edit:** trim the end to the reaction first (largest, most consistent change: 77% of clips
  get shorter, mostly from the end), then remove dead air in the middle.
- **Views study, next round:** day-7 views per platform instead of lifetime totals, so older
  clips do not win by age.

## Fega's answers (2026-10-01)

1. **Two kinds, judged differently: confirmed.** He said to start the judge (#483) on that basis.
2. **GTA 6 first-look was a one-off for the reveal.** Not a third format; GTA6-R is left out of
   the judge's test set and examples.
3. **Sound effects, pictures and music are there to play a moment up, not to rescue a weak
   clip.** So the negative lean of sounds/cuts against views in MC and EO is NOT explained by
   weak clips. Treat it as unexplained (small samples, 22-23 clips per game); do not teach
   auto-edit to avoid sounds on the strength of it.
