# LLM Council Transcript — Spec Review
**Date:** March 31, 2026
**Question:** Is the subtitle segmentation spec complete and correct before implementation?

---

## Framed Question
The subtitle segmentation spec (v1.0) defines hard walls (sentence enders, 0.7s gaps), 5 chunking rules, timing rules, 6 test cases, and pure function architecture. Needs validation before implementation. Previous council recommended writing spec first — this is step 1.

---

## Advisor Responses

### The Contrarian
Three gaps: (1) Filler "like" detection is handwaved — no way to distinguish filler from verb. (2) Repeated phrase needs minimum recurrence count and adjacency requirement — a phrase at 0:05 and 2:30 shouldn't trigger same as "go go go." (3) Priority conflicts unresolved — "um um um" hits both filler and repeat rules. Also: char split direction not specified (front-heavy vs back-heavy?), single long words unaddressed.

### The First Principles Thinker
What counts as a "word" is undefined (hyphenated terms, contractions, "360fps"). Filler detection needs a concrete heuristic, not "like when filler." Tests capture behavior not intent. Missing layer: input tokenization/normalization before hard walls. Need a named pre-processing stage.

### The Expansionist
Spec solves correctness not virality. Gaming subtitles need emotional pacing — high-energy words isolated for impact. Adjacent opportunities: emphasis detection via audio energy, style presets per mode. Spec is the floor, viral-feeling subtitles are the ceiling.

### The Outsider
0.7s hard wall vs 1.0s forward look — what happens between? Rule 5 (char split) is vaguest rule and most likely to regress. "um I" creates ugly tiny segments. Gap closing direction unspecified. Test cases mentioned but not shown inline. Fix Rule 5 first.

### The Executor
Two implementation blockers: (1) "you know?" is both a filler phrase AND a sentence ender — hard walls run first so it never reaches filler isolation, is that correct? (2) 20-char split needs worked examples. Also: single-word partitions > 20 chars undefined. Pre-partitioning is sound. Add edge case tests, then implementation is mechanical.

---

## Peer Reviews

### Anonymization Map
- A = Contrarian, B = First Principles, C = Expansionist, D = Outsider, E = Executor

### Review 1
**Strongest:** A (Contrarian) — most actionable spec-level gaps.
**Weakest:** C (Expansionist) — feature pitch not spec critique.
**All missed:** Input contract undefined — does function receive word objects with timestamps, or flat text?

### Review 2
**Strongest:** D (Outsider) — 0.7/1.0 gap is concrete spec inconsistency.
**Weakest:** C (Expansionist) — scope expansion not depth.
**All missed:** No defined behavior for overlapping edge cases between rules.

### Review 3
**Strongest:** E (Executor) — "you know?" collision is highest-stakes.
**Weakest:** C (Expansionist) — feature creep.
**All missed:** Non-monotonic timestamps, overlapping words from degraded Whisper output.

### Review 4
**Strongest:** D (Outsider) — highest density of implementation blockers.
**Weakest:** C (Expansionist) — scope pollution.
**All missed:** Input format and reliability undefined — Whisper timestamp drift.

### Review 5
**Strongest:** D (Outsider) — catches implementation-breaking ambiguities.
**Weakest:** C (Expansionist) — scope creep.
**All missed:** No conflict resolution table for simultaneous rule triggers.

---

## Chairman's Synthesis

### Where the Council Agrees
- Pre-partitioning architecture is sound and will prevent regressions
- Pure function + test cases are the right shape
- Rule 5 (char split) is vaguest and most likely to regress
- Spec reads as feature list, not algorithm — needs more specificity

### Where the Council Clashes
- Filler detection depth (recurrence counting vs tokenization definition)
- "you know?" collision (filler + sentence ender — which wins?)
- 0.7s vs 1.0s gap relationship undefined

### Blind Spots Caught
- Input contract undefined (function signature, word object shape, malformed input handling)
- No conflict resolution table for simultaneous rule triggers
- Whisper timestamp drift/overlap not handled

### The Recommendation
Do not implement. Fix 4 things:
1. Define input contract (function signature, types, malformed input behavior)
2. Write conflict resolution table (5-10 rows for rule collisions)
3. Specify Rule 5 with worked examples (split direction, single long words)
4. Resolve 0.7s/1.0s relationship in one sentence

### The One Thing to Do First
Write the input contract.
