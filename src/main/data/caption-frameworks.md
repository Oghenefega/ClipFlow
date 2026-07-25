# Caption & Title Architecture

Reference for ClipFlow's AI title/caption generation. Human-readable companion to
`caption-hook-examples.json` (the rules and cold-start examples the prompt builder
loads) and `src/main/ai/title-caption-prompt.js` (the builder). Change them together.

Rewritten in #183. The previous architecture (#85) is described in section 4 — read
it before proposing anything that looks like a return to it.

---

## 1. What the two fields actually are

This is the thing most easily got wrong, and the old prompt got it wrong.

- **Title** — the post title on YouTube Shorts / TikTok / Instagram Reels.
  Ends with one game hashtag.
- **Caption** — hook text **burned on screen** over the clip's opening seconds,
  read while the footage plays, in roughly two short lines. It is *not* the social
  post caption; those are assembled per-platform from templates in
  `QueueView.resolveCaption`. The `\n` in real caption data is a deliberate
  on-screen line break.

A caption written as if it were a tweet reads wrong on screen. Say what it is in
the prompt.

## 2. The architecture

```
CLIP TRUTH  →  VOICE EXAMPLES  →  HARD RULES  →  3 cards
 (the gate)     (the target)       (the floor)
```

**Clip truth** is the gate: find what genuinely happened before writing a word.
Never invent a detail the transcript or frames don't support. If the transcript is
uninformative, write about the reaction rather than the event.

**Voice examples** are the target and carry most of the weight. They are read live
from the `title_caption_rounds` table (`src/main/title-caption-log.js`) — real
published copy, best-performing first, hand-written and edited titles ranked above
verbatim-AI ones. The static `cold_start_examples` in the JSON are used only until
a creator has published enough of their own; the two sets are never mixed, because
diluting real voice data with invented examples defeats the point.

**Hard rules** are a floor, not a curriculum. The list is deliberately short —
every rule added past the point of necessity buys compliance at the cost of range.

## 3. What the data said

Measured against the creator's own publishing record at the time of the rewrite:

- 31 distinct titles published; **28 were hand-written**. Three came from an
  accepted suggestion.
- Every accepted suggestion was edited before it shipped, always the same way —
  by **cutting the second clause**:
  - "The pass was PERFECT and I still blew it" → "The pass was PERFECT"
  - "The sideways jump giveth and the sideways jump taketh" → "…giveth and taketh"
  - "A 1-0 lead has never felt less safe" → "1-0 leads never feel safe in Rocket League"
- Published titles averaged **5.5 words** (range 3-8). The prompt spec asked for
  5-10. The spec itself was calibrated wrong.

Hence the two rules that carry the most weight now: **3-7 words**, and **a fragment
beats a sentence**.

## 4. What was removed, and why

The #85 build injected a 3-pillar / 4-driver / payoff-integrity / batch-spec /
six-worked-example / eleven-real-world-title / eleven-anti-pattern framework —
about 14,000 characters before the transcript was read.

It was well-reasoned and it did not work. Stacking that many simultaneous
constraints makes a model optimize for not-breaking-them, and the output converges
on whatever satisfies every rule at once. That convergence is what "AI slop" is:
not a failure of intelligence, a failure of range. The prompt warned against
cargo-culting a framework while being one.

The pillars and drivers weren't wrong as *analysis*. They were wrong as *prompt*.
If they return, they belong in this document, not in the model's context.

## 5. Anti-patterns that survived

Kept in `caption-hook-examples.json` because each one was observed in real output,
not derived from theory:

- Title Case — the clearest single tell of AI short-form copy.
- The second clause — writing the hook, then explaining or twisting it.
- Spoiling the payoff in the caption.
- Hallucinated detail the clip doesn't support.
- Crutch words ("crazy", "insane", "yikes") carrying the hook or repeating.
- Filler openers ("hey guys", "ok so").
- Vague stakes ("this changes everything").
- Over-cleverness — if it needs a second sentence to land, cut it.

## 6. How it improves on its own

Every publish writes a row to `title_caption_rounds` recording what the AI offered,
what actually shipped, and whether the creator took it verbatim, edited it, or wrote
their own. View counts are backfilled from the platform post ids stored in
`trackerData`. The example set the prompt reads is therefore re-ranked by real
performance over time without anyone editing a prompt.

The signal to protect is the **`ai_edited`** bucket: those rows are a direct record
of what the creator consistently changes about the model's output.
