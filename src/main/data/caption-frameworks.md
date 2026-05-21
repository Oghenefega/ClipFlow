# Caption & Title Architecture

Reference for ClipFlow's AI title/caption generation (issue #85). This document is
the human-readable architecture; `caption-hook-examples.json` is the machine-readable
form the prompt builder loads at generation time. Change them together.

Distilled from the "ClipFlow — Gaming Shorts Hook Research" NotebookLM notebook —
37 sources including vidiq's hook guides, Jenny Hoyos, Creator Hooks / Jake Thomas,
George Blackman, Paddy Galloway, MrBeast production docs, and 11 real viral gaming
Shorts.

---

## 1. The problem this solves

AI-generated titles and captions read generic. The research names three causes, and
they compound:

- **Viewer-agnosticism** — copy written for the creator, not for the viewer's
  "what's in it for me?". The survival brain files it as background noise.
- **Cargo-cult sameness** — copying a surface tactic without the strategy beneath
  it. When everyone runs the same shape, the shape stops interrupting anyone.
- **Answer, not Equation** — templates and AI hand over a finished, resolved
  thought. That robs the viewer of closing the loop themselves — which is the whole
  reason a hook works.

The architecture below avoids all three: it starts from the specific clip, never a
template, and it never resolves the loop the footage is there to close.

## 2. The architecture

Generation runs as a pipeline. Each stage feeds the next:

```
  CLIP TRUTH  →  3 PILLARS  →  DRIVER  →  EXECUTION  →  3 cards
   (the gate)    (skeleton)    (engine)    (finish)
```

- You may only build a hook from what the clip actually contains.
- Every hook is structured by the 3 Pillars.
- A Driver is the psychological force the hook pulls.
- Execution is the wording rules.
- The output is 3 titles + 3 captions — three genuine angles, not one reworded.

There is **no archetype layer**. "Curiosity gap", "status reversal" and the rest are
how creators *talk* about hooks — useful vocabulary, not a build step. Picking a
named pattern first and filling its template is the cargo-cult failure above.

## 3. The gate — Clip Truth

Before any wording: find what genuinely happened in this clip. The wow, the irony,
the specific moment, the personal why. This is raw material to be found, never
invented.

Two hard rules:

- **Discard rule.** If the clip cannot pay a hook off, the hook is dead. A promise
  the footage doesn't deliver is bad clickbait — the viewer feels the false alarm
  and swipes.
- **No invention.** Never introduce a game term, player name, or event the clip or
  transcript doesn't support. (The "lipper kill" hallucination in #85 came from
  generating past the available signal.)

ClipFlow generates from finished footage, so its whole job is this: find the real
hook *in* the clip — never force the clip to fit a hook.

## 4. The skeleton — the 3 Pillars

George Blackman's irreducible model; it recurs across the sources. Every hook must
define all three. Anything that serves none of them is cut.

- **Character / Target** — who is this for, or who is in it? The person the viewer
  roots for or sees themselves in.
- **Concept / Transformation** — what actually happens? The change, the reversal,
  the before→after.
- **Stakes** — why does it matter? What is on the line.

Fill the Pillars from the clip first. The title and caption are written *from* a
filled skeleton — they are not free text.

## 5. The engine — the 4 Drivers

Beneath every hook are four root psychological forces. Creator Hooks' model
(curiosity, fear, desire) explains the *click* but misses the force that stops the
scroll and the one that prevents the swipe. The full set, mapped to the timeline of
a single view:

| Driver | Moment | Mechanism |
|---|---|---|
| **Alertness** | stops the scroll | A pattern break wakes the survival brain — it must evaluate the unusual. |
| **Friction** | earns the click | An information gap — an open loop the brain itches to close. |
| **Utility** | earns the click | "What's in it for me?" — a move from a current pain toward a desired gain. |
| **Resonance** | prevents the swipe | Character, story, and social investment — a reason to *stay*. |

A clip fires **one or two** of these, never all four. Choosing which is the engine's
job — and it depends entirely on the Clip Truth.

**Alertness nuance.** In the sources, Alertness is mostly *visual* — a shocking
frame. For text (title + caption) it mostly delegates to the first frame (ClipFlow
forwards the peak-frame screenshot). In wording, treat Alertness as a *constraint* —
front-load a surprising word — not as an engine. Friction, Utility and Resonance do
the generative work.

## 6. The finish — Execution

### Title vs caption

- **Title** — the platform headline. Headline voice. 5–10 words. Ends with one
  `#gamehashtag`. Opens a loop; never spoils the outcome.
- **Caption** — the on-screen / social text. First-person. 3–7 words (may stretch
  a little). **One natural thought** — the way the creator would say it out loud.

### The caption's two hard rules

1. **It opens the loop; the footage closes it.** The payoff — the outcome, the
   punchline — lives in the clip. Never in the caption. *"All I did was wave"* works;
   *"I waved and he shot me"* is dead on arrival — nothing left to watch for.
2. **No constructed two-beat.** The "setup, then payoff" antithesis — *"I said hi,
   he said no"*, *"I thought I was him. I found out"* — is a stale cliché AI overuses.
   It reads as a copywriter performing punchiness, not a person talking. Write one
   thought, not a built one-two.

### Casing

Sentence case. 1–3 ALL-CAPS words allowed for genuine emphasis on the peak word.
**Never Title Case** — it is the single clearest tell of AI-written short-form copy.
(The research recommends Title Case, drawn from MrBeast's *long-form YouTube*
packaging. ClipFlow deliberately overrides this for vertical short-form, where native
creators write in sentence case. Settled in #85.)

### The rest

- **One idea only.** If it needs a second sentence to make sense, cut it.
- **Specific over vague.** Name the gun, the rank, the number, the moment.
- **Readability** — 1st–5th grade. Explain the thing; don't lean on jargon.

## 7. The 3-card batch

Default output: **3 titles + 3 captions**. Each card is a genuinely different
**angle** — a different Pillar leading, or a different Driver — not the same truth
reworded. (#85's old 5+5 batch had illusory variety: one hook in five costumes.)

Each card carries a short **chip** — a plain-language description of its angle
(*"Leads with the stakes"*, *"Innocent setup, no outcome"*). The chip is generated to
fit the card, not chosen from a fixed list. It replaces the long "why" paragraph from
the old prompt.

## 8. Anti-patterns

- **Spoiling the payoff** — putting the outcome or punchline in the caption. The
  caption opens the loop; the footage closes it.
- **The two-beat** — a constructed "setup, then payoff" antithesis. Reads as AI.
  Write one natural thought.
- **Viewer-agnostic copy** — a title written for the creator, not the viewer. Name
  what's in it for the person watching.
- **Cargo-cult sameness** — copying a surface tactic without the clip's real truth
  behind it.
- **Hallucinated detail** — inventing a game term, player name, or event the clip or
  transcript doesn't support.
- **Title Case** — the clearest tell of AI short-form copy. Sentence case only.
- **Crutch words** — one weak reaction word ("yikes", "crazy", "insane") carrying the
  hook, or repeating across the batch.
- **Filler openers** — "hey guys", "ok so", "welcome back".
- **Over-cleverness** — if the hook needs a second sentence to land, cut it.
- **Vague stakes** — "this changes everything" names nothing. Name the specific thing
  on the line.
- **Bad clickbait** — a promise the clip can't pay off.

## 9. Source of truth

`caption-hook-examples.json` is the machine-readable form of this document — the
Pillars, Drivers, Execution rules, worked pipeline examples, real-world title
references, and anti-patterns the prompt builder injects as it generates. Update both
files together.
