# Subtitle Segmentation Spec v1.2

This is the canonical definition of correct subtitle segmentation in ClipFlow. Every segmentation change must be validated against this spec. No exceptions.

---

## Input Contract

The segmenter is a pure function. This section defines exactly what it receives and what it returns.

### Function Signature

```javascript
function segmentWords(words, mode) → segments[]
```

- `words` — array of word objects, pre-processed by `mergeWordTokens()` and `validateWords()` upstream
- `mode` — `"1word"` or `"3word"`

### Input Word Object Shape

```javascript
{
  word: string,        // The word text (e.g., "raiders", "Let's", "um")
  start: number,       // Start time in seconds (e.g., 1.234)
  end: number,         // End time in seconds (e.g., 1.890)
  probability: number, // Whisper confidence (0-1), not used by segmenter
  track: string        // "s1" (not used by segmenter, passed through)
}
```

### Input Guarantees (enforced upstream)

These are guaranteed by the time words reach the segmenter:

- **Whole words only.** Subword tokens have been merged by `mergeWordTokens()`. No partial tokens.
- **Monotonic timestamps.** Words are sorted by `start` time, ascending. `words[i].start <= words[i+1].start`.
- **Clamped to segment bounds.** `validateWords()` has clamped timestamps to the parent segment's `[start, end]` range.
- **No empty words.** Every word has a non-empty `.word` string.

### Malformed Input Handling

If input violates guarantees (defensive — should not happen in practice):

- **`word.start > word.end`** — Swap start and end.
- **Non-monotonic timestamps** (`words[i].start > words[i+1].start`) — Sort by start time before processing.
- **Missing fields** (`word`, `start`, or `end` is undefined/null) — Skip the word entirely.
- **Empty word array** — Return empty segments array.

### Output Segment Shape

```javascript
{
  id: number,          // Unique identifier
  text: string,        // Segment text (words joined by spaces)
  startSec: number,    // Start time (first word's start)
  endSec: number,      // End time (last word's end)
  words: word[],       // Array of word objects in this segment
  track: string,       // Passed through from first word
  conf: "high",        // Always "high" for auto-generated
  warning: string|null // "Long segment" if duration > 10s, else null
}
```

The caller (store action) is responsible for adding formatted fields (`start`, `end`, `dur`) and managing IDs for the UI.

### What the Segmenter Does NOT Receive

- Raw Whisper JSON — that's parsed upstream
- Segment-level text — word merging happens upstream
- Styling, positioning, or UI state — none of that exists here
- Caption data — separate track, separate store

---

## Display Constraints

| Property | Value | Notes |
|----------|-------|-------|
| Max characters per segment | 20 | Hard cap. Never exceed. Includes spaces. |
| Lines | 1 | Always single-line. Never 2-line subtitles. |
| Min display duration (auto) | 0.3s | Auto-generated segments must be >= 0.3s on screen. User may manually shrink below this on the timeline. |
| Emoji | Never | Do not insert emoji into subtitle text regardless of emojiOn toggle. |

---

## Segment Modes

ClipFlow has two segment modes. Both modes share the same hard walls and display constraints above. They differ only in how words are grouped within those walls.

### 1-Word Mode

One word per segment. Every word gets its own segment with its own timestamp range.

No grouping logic. No phrase detection. No character-limit splitting. Just: one word, one segment.

### 3-Word Mode

Smart phrase-aware chunking. Maximum 3 words per segment. This is where all the segmentation intelligence lives. The rest of this spec defines 3-word mode behavior.

---

## Hard Walls (Non-Negotiable Boundaries)

Hard walls partition the word list BEFORE any chunking runs. No rule, no phrase, no grouping logic may ever place words from different partitions into the same segment. Hard walls are structural — they are not competing rules.

### Wall 1: Sentence Boundaries

Any word ending in `.` `!` `?` (or those followed by a closing quote `'` `"` `"` `'`) terminates the current partition. The next word begins a new partition.

Sentence enders are ALWAYS hard walls, even when they create many short segments in a row.

**Example — rapid micro-sentences:**
```
Input:  "Oh my god. Dude. Let's go."
Output: ["Oh my god."] ["Dude."] ["Let's go."]
         seg 1         seg 2      seg 3
```

**Example — emphatic periods:**
```
Input:  "I. Am. That. Guy."
Output: ["I."] ["Am."] ["That."] ["Guy."]
         seg 1  seg 2   seg 3     seg 4
```

Commas do NOT create hard walls. Whisper's comma placement is unreliable for gaming speech. Commas are treated as regular characters.

### Wall 2: Time Gaps (Pauses)

If the gap between the end of one word and the start of the next is >= 0.7 seconds, that gap is a hard wall. Words on either side must never be in the same segment.

**Example — 2s gap between "guy" and "baby":**
```
Input:  "I'm that guy" [2.0s gap] "baby"
Output: ["I'm that"] ["guy"] | WALL | ["baby"]
         seg 1       seg 2           seg 3
```

Words must not appear on screen before they are spoken. The gap wall ensures this.

---

## Chunking Rules (Within Partitions)

After hard walls have partitioned the word list, the chunking rules operate WITHIN each partition independently. Rules are listed in priority order — higher priority rules override lower ones. There are 8 rules total: Rules 1-5 were defined in v1.1, Rules 6-8 were added in v1.2.

### Rule 1: Repeated Phrase Detection (Highest Priority)

**Pre-scan phase.** Before the main chunking loop, scan the entire partition for **adjacent** repeated phrases of length 2-3 words.

"Adjacent" means the repetitions are back-to-back with no other words between them (or only single filler/transition words between groups). A phrase at 0:05 and the same phrase at 2:30 are NOT treated as a repeat pattern — they must be consecutive.

Each repetition of the phrase must be its own segment. Never split a repeated phrase across segments.

**Single-word repeats** (adjacent identical words) also get one segment each.

```
Input:  "let's go let's go let's go"
Output: ["let's go"] ["let's go"] ["let's go"]

Input:  "there we go baby there we go"
Output: ["there we go"] ["baby"] ["there we go"]

Input:  "no no no no"
Output: ["no"] ["no"] ["no"] ["no"]

Input:  "yo yo yo"
Output: ["yo"] ["yo"] ["yo"]
```

**Phrase recall:** Once a phrase has been seen and flushed, if the same phrase appears later in the partition (not necessarily adjacent), it should still be grouped the same way.

**Phrase protection:** If the current chunk matches a known phrase, do not extend it with an unrelated word. Flush it.

### Rule 2: Filler Word Isolation

Filler words stand alone as their own segment. They do not attach to the previous or next segment.

**Filler word list (exact match only):** `um`, `uh`, `ah`

These three words are always fillers. No ambiguity, no context needed.

**Not fillers (treated as regular words):** `like`, `you know`, `I mean`. These are too ambiguous in gaming speech ("I like that play", "you know what I mean", "I mean it"). The safe default is to treat them as regular words. The cost of incorrectly isolating "like" in "I like this" is worse than occasionally grouping a filler "like" with adjacent words.

```
Input:  "so I was um playing the game"
Output: ["so I was"] ["um"] ["playing the"] ["game"]

Input:  "I like this game"
Output: ["I like this"] ["game"]  (NOT ["I"] ["like"] ["this game"])

Input:  "like I said before"
Output: ["like I said"] ["before"]  (NOT ["like"] ["I said before"])
```

### Rule 3: Forward Look

If the chunk has 2 words, adding the current word would make 3, BUT there is a significant gap (>= 1.0s) AFTER the current word — the current word likely belongs with the NEXT group. Flush the current chunk first, then start a new chunk with this word.

This prevents orphaning words at group boundaries.

**Relationship to the 0.7s hard wall:** The forward look operates WITHIN a partition where all gaps are < 0.7s (gaps >= 0.7s were already walled off during pre-partitioning). **FORWARD_LOOK_GAP = 0.5s** — catches medium pauses (0.5-0.69s) that aren't hard walls but suggest a natural grouping boundary.

**Interaction with filler words:** A filler word (um/uh/ah) landing in a forward-look gap (0.5-0.69s) is still isolated as its own segment — filler isolation (Rule 2) takes priority over forward look (Rule 3) per the priority order.

### Rule 4: Max 3 Words

Never exceed 3 words per segment. If the chunk reaches 3 words, flush.

### Rule 5: Character Limit Enforcement

After a chunk is formed (1-3 words), check the total character count (including spaces). If the text exceeds 20 characters, split it. The split is always **front-heavy**: keep as many words as possible in the first segment, push the remainder to a new segment.

**3-word chunk over limit:** Split as first 2 words + last word.

```
Input chunk:  ["unfortunately", "I", "died"]
              "unfortunately I died" = 22 chars → over limit
Split:        ["unfortunately I"] (16 chars) + ["died"] (4 chars)
```

If the first 2 words are still over 20 chars, split as word 1 + word 2 + word 3 (three segments).

```
Input chunk:  ["unfortunately", "catastrophically", "died"]
              "unfortunately catastrophically" = 30 chars → still over
Split:        ["unfortunately"] + ["catastrophically"] + ["died"]
```

**2-word chunk over limit:** Split as word 1 + word 2.

```
Input chunk:  ["Schwarzenegger", "activated"]
              "Schwarzenegger activated" = 24 chars → over limit
Split:        ["Schwarzenegger"] (14 chars) + ["activated"] (9 chars)
```

**1-word chunk over limit:** Keep as-is. A single word cannot be split. It will render and may overflow the visible area — the user can manually adjust on the timeline or the renderer may scale the font down. This is an extreme edge case (20+ character single words are rare in speech).

```
Input chunk:  ["Supercalifragilistic"]
              21 chars → over limit, but single word
Output:       ["Supercalifragilistic"]  (keep as-is, let renderer handle)
```

### Rule 6: Never End on "I"

The word "I" almost always starts or continues a sentence ("I don't", "I think"). Leaving it dangling at the end of a subtitle segment looks wrong and reads unnaturally.

If "I" would become the last word in a segment that already has 2+ words, flush the current chunk BEFORE adding "I" so it starts the next segment instead.

Do NOT flush if the chunk is empty or has only 1 word — let "I" join naturally in short segments.

```
Input:  ["doesn't", "click,", "I", "don't", "know", "what's"]
Output: ["doesn't click,"] ["I don't know"] ["what's"]
         (NOT ["doesn't click, I"] ["don't know"] ["what's"])
```

**Interaction with comma flush (Rule 7):** In the example above, "click," triggers a comma flush (Rule 7) before Rule 6 can fire. When both would apply to the same boundary, comma flush wins because it runs first in the loop (the comma word is added and flushed, then "I" starts a fresh chunk). The result is the same either way — "I" starts the next segment.

### Rule 7: Comma Flush

A word ending with a comma (`,`) or semicolon (`;`) is a natural phrase-ender. After adding such a word to the current chunk, flush immediately. The comma/semicolon word becomes the LAST word of its segment, never the first word of the next one.

This produces cleaner reading rhythm — commas mark natural pause points in speech, and flushing here keeps phrases intact.

```
Input:  ["gonna", "be", "playing", "some,", "you", "guessed", "it"]
Output: ["gonna be"] ["playing some,"] ["you guessed"] ["it"]
         ("some," ends a segment, never starts one)

Input:  ["yes.", "well,", "I", "think"]
Output: ["yes."] | WALL | ["well,"] ["I think"]
         ("well," is a pause beat — flushes as a single-word segment)
```

**Note:** Commas do NOT create hard walls (Wall 1 only splits on `.` `!` `?`). Comma flush is a soft grouping hint within partitions. Whisper's comma placement is unreliable, but incorrect comma placement only causes suboptimal grouping — it never violates structural integrity.

### Rule 8: Atomic Phrase Protection

Certain common 2-word phrases should never be split across segments. If the current word and the next word form a known atomic phrase, and adding the current word would fill the chunk to max capacity (pushing the next word to a new segment), flush the current chunk BEFORE adding so the phrase stays together in the next segment.

**Atomic phrase list:**
```
"as always", "of course", "by the way", "at least", "right now",
"let's go", "you know", "I mean", "in fact", "so far",
"at all", "no way", "oh my", "come on", "for real",
"hold on", "watch this", "trust me", "believe me", "check this"
```

These are high-frequency gaming/streaming phrases that sound wrong when split. The list is intentionally short — only phrases where splitting is always wrong.

```
Input:  ["great", "and", "awesome", "as", "always", "today"]
Output: ["great and"] ["awesome"] ["as always"] ["today"]
         (NOT ["great and awesome"] ["as"] ["always today"])

Input:  ["well", "yeah", "of", "course", "dude"]
Output: ["well yeah"] ["of course"] ["dude"]
         (NOT ["well yeah of"] ["course dude"])
```

**Interaction with repeated phrases (Rule 1):** If an atomic phrase like "let's go" also appears as a repeated phrase, Rule 1 handles it first (higher priority). The atomic phrase list includes "let's go" as a safety net for non-repeated occurrences.

**Phrase matching is case-insensitive.** Whisper may capitalize inconsistently. The normalized (lowercased) form is compared against the list.

---

## Timing Rules

### Gap Closing

During continuous speech, small timing gaps (< 0.15s) between consecutive segments should be closed by extending the **earlier segment's end time forward** to meet the next segment's start time. The later segment's start time is never changed.

Direction: always extend the previous segment forward. Never pull the next segment backward. This preserves the "words don't appear before they're spoken" guarantee — the next segment still starts when its first word is spoken.

**Edge case — first segment:** If the first segment in the sequence has no previous segment, there is nothing to extend. The first segment simply starts at its own start time. No special handling needed.

Gaps >= 0.15s are real pauses and must be preserved. The subtitle should disappear during these gaps.

### Minimum Duration Floor

Auto-generated segments must have a duration of at least 0.3 seconds. If a segment would be shorter:
- Extend the end time forward (up to the start of the next segment)
- If that's not possible, extend the start time backward (down to the end of the previous segment)
- If still under 0.3s (extremely fast speech), keep as-is — don't merge with another segment

This floor applies only to auto-generated output. The user may manually resize segments below 0.3s on the timeline.

### Linger Duration

After all gap closing and min-duration adjustments, extend each segment's end time by 0.4 seconds into the empty space following the last word. This prevents subtitles from vanishing the instant the last word ends — they linger briefly for readability.

**Constraint:** A lingering segment must NEVER overlap the next segment's start time. The extended end is clamped to `min(endSec + 0.4, nextSegment.startSec)`.

**Last segment:** The final segment in the sequence has no next segment to collide with — it always gets the full 0.4s linger.

```
Example — plenty of empty space:
  Segment 1 words end at 0.8s, next segment starts at 3.0s
  → Segment 1 end = 0.8 + 0.4 = 1.2s  (full linger)

Example — tight spacing:
  Segment 1 words end at 0.8s, next segment starts at 0.85s
  → Segment 1 end = 0.85s  (clamped to avoid overlap)

Example — last segment:
  Segment 5 words end at 5.4s, no next segment
  → Segment 5 end = 5.4 + 0.4 = 5.8s  (full linger)
```

**Processing order:** Linger runs AFTER gap closing and min-duration floor. It is the final timing adjustment.

### Word Timestamp Integrity

Words must not appear on screen before they are spoken. A segment's visual appearance is tied to its start time, which is the first word's start time. No segment may contain words with timestamps significantly after the segment's start — the hard wall on time gaps (>= 0.7s) prevents this.

---

## Whisper Input Handling

The segmenter receives word-level timestamps from Whisper/WhisperX. This input is noisy, especially for gaming speech. The segmenter must handle:

### Missing Punctuation

Whisper may not add periods at sentence ends. The segmenter can only split on punctuation that Whisper provides. If Whisper misses a sentence boundary, the time gap rule (Wall 2) is the fallback — natural pauses between sentences will usually trigger a partition anyway.

### Incorrect Punctuation

Whisper sometimes inserts commas or periods in wrong places. Since commas are ignored (not hard walls), bad comma placement is harmless. Bad period placement will create an incorrect hard wall — this is accepted as a tradeoff. Correct sentence splitting is more valuable than occasionally over-splitting on a Whisper hallucinated period.

### Subword Tokens

Whisper tokenizes at the subword level ("raiders" -> ["ra", "iders"]). The word-merging step (mergeWordTokens) runs BEFORE segmentation and reassembles tokens into real words using the segment text as ground truth. The segmenter always receives whole words.

### Hallucinated Words

Whisper occasionally hallucinates words, especially during silence or background noise. The segmenter does not filter these — it segments whatever words it receives. Hallucination filtering is a separate concern upstream of segmentation.

---

## What the Segmenter Does NOT Do

- Does not handle subtitle styling (colors, fonts, effects, karaoke highlighting)
- Does not handle subtitle positioning or layout
- Does not handle caption track (sub2) — captions have their own store
- Does not filter or correct Whisper transcription errors
- Does not insert emoji
- Does not handle user manual edits (splitting, merging, dragging on timeline)
- Does not handle undo/redo

The segmenter is a pure function: `words[] -> segments[]`. Everything else is a separate concern.

---

## Regression Test Cases

These are the three historically recurring bugs. Any change to segmentation must be validated against all three.

### Test 1: Sentence Boundary Violation

```
Input words:  ["I'm", "gonna", "win", "for", "sure.", "I", "just", "know"]
              (no significant time gaps)

WRONG output: ["I'm gonna win"] ["for sure. I"] ["just know"]
RIGHT output: ["I'm gonna"] ["win for"] ["sure."] | WALL | ["I just"] ["know"]
```

The period after "sure" is a hard wall. "sure." and "I" must never be in the same segment.

### Test 2: Time Gap Violation

```
Input words:  ["I'm", "that", "guy", "baby"]
              gap between "guy" and "baby" = 2.0 seconds

WRONG output: ["I'm that"] ["guy baby"]
RIGHT output: ["I'm that"] ["guy"] | WALL | ["baby"]
```

The 2.0s gap is a hard wall. "guy" and "baby" must never be in the same segment.

### Test 3: Repeated Phrase Split

```
Input words:  ["let's", "go", "let's", "go", "let's", "go"]
              (continuous speech, no significant gaps)

WRONG output: ["let's go let's"] ["go let's go"]
RIGHT output: ["let's go"] ["let's go"] ["let's go"]
```

Each repetition of "let's go" must be its own segment. Never split a repeated phrase across segments.

### Test 4: Single-Word Repeats

```
Input words:  ["no", "no", "no", "no"]
              (continuous speech)

WRONG output: ["no no no"] ["no"]
RIGHT output: ["no"] ["no"] ["no"] ["no"]
```

Each single-word repeat is its own segment in both 1-word and 3-word mode.

### Test 5: Filler Word Isolation

```
Input words:  ["so", "I", "was", "um", "playing", "the", "game"]
              (no significant gaps)

WRONG output: ["so I was"] ["um playing"] ["the game"]
RIGHT output: ["so I was"] ["um"] ["playing the"] ["game"]
```

Filler words (um, uh, ah) stand alone. They do not attach to surrounding words.

### Test 6: Character Limit

```
Input words:  ["unfortunately", "I", "died"]
              (no significant gaps, no sentence boundaries)
              character count: "unfortunately I died" = 20 chars

If <= 20: ["unfortunately I died"]  (OK, exactly 20)
If > 20:  ["unfortunately I"] ["died"]  (split 2+1, front-heavy)
```

Never exceed 20 characters per segment.

### Test 7: "like" Is a Regular Word

```
Input words:  ["like", "I", "said", "before"]
              (no significant gaps)

WRONG output: ["like"] ["I said"] ["before"]  (incorrectly isolated as filler)
RIGHT output: ["like I said"] ["before"]
```

"like" is not in the filler list. Always treated as a regular word.

### Test 8: Hard Wall vs Filler — "you know?"

```
Input words:  ["you", "know?", "that", "was", "crazy"]
              (no significant gaps)

Output: ["you know?"] | WALL | ["that was"] ["crazy"]
```

The `?` on "know" creates a hard wall. "you know?" is NOT isolated as a filler — hard walls run first, and within the first partition, "you" and "know?" are regular words grouped normally.

### Test 9: Forward Look Within Partition

```
Input words:  ["I", "was", "just", "chilling"]
              gap between "just" and "chilling" = 0.55s (under 0.7s wall, over 0.5s forward look)

Output: ["I was just"] | ["chilling"]
        NOT: ["I was"] ["just chilling"]
```

The 0.55s gap is under the 0.7s hard wall, so no partition. But it exceeds the 0.5s forward look — if "just" would be the 3rd word, flush the chunk before adding it. Since "just" is the 3rd word here, flush ["I was just"], then "chilling" starts a new chunk.

### Test 10: Never End on "I"

```
Input words:  ["doesn't", "click,", "I", "don't", "know", "what's"]
              (continuous speech, no significant gaps)

WRONG output: ["doesn't click, I"] ["don't know"] ["what's"]
RIGHT output: ["doesn't click,"] ["I don't know"] ["what's"]
```

"I" must never dangle at the end of a multi-word segment. Here "click," triggers a comma flush (Rule 7) first, then "I" starts the next chunk naturally. Even without the comma, Rule 6 would flush before adding "I" to a 2+ word chunk.

### Test 11: Comma Flush

```
Input words:  ["gonna", "be", "playing", "some,", "you", "guessed", "it"]
              (continuous speech, no significant gaps)

WRONG output: ["gonna be playing"] ["some, you guessed"] ["it"]
RIGHT output: ["gonna be"] ["playing some,"] ["you guessed"] ["it"]
```

"some," ends with a comma — it must be the last word of its segment, never the first word of the next. The comma triggers an immediate flush after the word is added.

### Test 12: Atomic Phrase Protection

```
Input words:  ["great", "and", "awesome", "as", "always", "today"]
              (continuous speech, no significant gaps)

WRONG output: ["great and awesome"] ["as"] ["always today"]
RIGHT output: ["great and"] ["awesome"] ["as always"] ["today"]
```

"as always" is an atomic phrase. Without Rule 8, "awesome" would fill the chunk to 3 words, pushing "as" and "always" into separate segments. Rule 8 detects that "as" + "always" form an atomic pair and flushes ["great and"] before adding "awesome", keeping "as always" together.

### Test 13: Linger Duration

```
Input words:  ["let's", "go", "baby"]
              last word ends at 0.8s, next word at 3.0s

Output: Segment 1 endSec = 1.2  (0.8 + 0.4 linger, next segment at 3.0 — no clamping needed)
```

```
Input words:  ["I'm", "that", "guy", "baby"]
              "guy" ends at 0.8s, "baby" starts at 0.85s

Output: Segment 1 endSec = 0.85  (0.8 + 0.4 = 1.2 would overlap next at 0.85 — clamped)
```

Linger extends segments by 0.4s into empty space for readability, but never encroaches on the next segment's start time.

---

## Conflict Resolution Table

When two rules could fire on the same word or span, this table declares the winner. No ambiguity.

| Scenario | Rules in conflict | Winner | Reasoning |
|----------|-------------------|--------|-----------|
| `"you know?"` | Sentence ender (hard wall) vs filler | **Hard wall wins** | Hard walls are structural pre-partitioning. They run before any chunking rule, including filler detection. "you know?" becomes the end of a partition. Within that partition, "you" and "know?" are regular words. |
| `"um um um"` | Filler isolation vs repeated phrase | **Repeat wins** | Rule 1 (repeat) has higher priority than Rule 2 (filler). Each "um" becomes its own segment via repeat detection. The output is identical to what filler isolation would produce, so no conflict in practice. |
| `"like I said"` | Filler isolation vs regular word | **Regular word** | "like" is not in the filler list (`um`, `uh`, `ah`). Treated as a regular word. Grouped normally. |
| `"no. no. no."` | Sentence enders vs single-word repeats | **Hard wall wins** | Each period creates a wall. Each "no." is already isolated in its own partition. Repeat detection is irrelevant — the walls did the work. |
| Word at partition boundary + forward look | Hard wall vs forward look | **Hard wall wins** | Forward look only operates within partitions. It cannot see across hard walls. |
| 3-word chunk exactly at 20 chars | Max words vs char limit | **No conflict** | 20 chars is the limit, not over it. Segment is valid. Only > 20 triggers a split. |
| Filler word at start of partition | Filler isolation vs chunk start | **Filler isolated** | Filler creates its own 1-word segment. Next word starts a new chunk. |
| Filler in forward-look gap | Filler isolation vs forward look | **Filler isolated** | Rule 2 (filler) has higher priority than Rule 3 (forward look). "um" is always its own segment, even if it sits in a 0.5-0.69s gap. |
| Short filler vs min duration | Filler isolation vs 0.3s floor | **Both apply** | Filler gets its own segment (Rule 2), then min-duration extends its end time forward (timing rule). No conflict — rules apply in sequence. |
| Comma word + "I" next | Comma flush (Rule 7) vs never-end-on-I (Rule 6) | **Both produce same result** | Comma flush fires first (word is added then flushed). "I" then starts a fresh chunk. Rule 6 would also flush before "I" — but comma flush already did the work. No conflict in practice. |
| Atomic phrase at chunk boundary | Atomic phrase (Rule 8) vs max words (Rule 4) | **Atomic phrase wins** | Rule 8 checks BEFORE adding the current word. If the phrase would be split by the max-word boundary, Rule 8 flushes early so the phrase stays together in the next segment. |
| Atomic phrase + comma | Atomic phrase (Rule 8) vs comma flush (Rule 7) | **Both apply sequentially** | Rule 8 may flush before adding the first word of the phrase. Rule 7 then flushes after the comma word if the phrase contains one. No conflict — different points in the loop. |
| "I" at start of chunk | Never-end-on-I (Rule 6) vs chunk start | **No conflict** | Rule 6 only fires when chunk has 2+ words. "I" at the start of a chunk (0-1 words) joins normally. |
| Linger vs gap closing | Linger vs silence gap threshold | **Sequential — no conflict** | Gap closing runs first (Phase 3a), linger runs last (Phase 3c). Linger extends the already-adjusted end time. |

**General principle:** Hard walls always win (they run first, structurally). Within partitions, rules are evaluated in numbered priority order — if Rule 1 handles a word, Rules 2-8 don't touch it.

---

## Constants Reference

| Constant | Value | Purpose |
|----------|-------|---------|
| MAX_WORDS | 3 | Maximum words per segment (3-word mode) |
| MAX_CHARS | 20 | Maximum characters per segment (hard cap) |
| PAUSE_SPLIT_THRESHOLD | 0.7s | Gap duration that creates a hard wall |
| FORWARD_LOOK_GAP | 0.5s | Gap after current word that triggers early flush (within partitions only) |
| SILENCE_GAP_THRESHOLD | 0.15s | Gaps smaller than this are closed between segments |
| MIN_DISPLAY_DURATION | 0.3s | Minimum auto-generated segment duration |
| LINGER_DURATION | 0.4s | Extend segment end into empty space after last word (never overlap next segment) |
| ATOMIC_PHRASES | (set of 20) | 2-word phrases that must never be split across segments (see Rule 8) |

---

## Architecture Requirement

The segmentation algorithm MUST be a pure function extractable to its own module. Input: array of words with timestamps. Output: array of segments. No Zustand, no React, no side effects. This is what makes it unit-testable against the regression cases above.
