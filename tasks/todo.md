# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

## Issue #72 — current state (2026-04-27, end of session 29)

- **Phase 1 — silent-degradation kill:** ✅ SHIPPED (session 28)
- **Phase 2 — scene_change:** 🚫 DROPPED (session 29) — see HANDOFF.md and [#72 Phase 2 close comment](https://github.com/Oghenefega/ClipFlow/issues/72#issuecomment-4320173205) for the data-driven decision rationale
- **Phase 3 — yamnet:** ✅ SHIPPED (session 29) — `num_threads=8` (4.8× speedup) + RMS pre-filter with toggle. 626s → 130s on reference recording, all 4 reaction events preserved bit-identically. In-app smoke test passing in both toggle states.
- **Phase 4 — pitch_spike:** ⏭ NEXT SESSION

## Phase 4 — to be planned at session start

Per global CLAUDE.md rule 1, the detailed Phase 4 plan must be written here at the start of the next session and approved before any code changes. The high-level direction (chunked pYIN with heartbeats between chunks, with YIN and torchcrepe as ranked fallbacks) is captured in [HANDOFF.md](HANDOFF.md) — translate that into a concrete file-by-file plan with acceptance criteria and pioneer gate when the next session opens.

The reference audio is at `tmp/phase3-baseline/audio.wav` (already extracted, 16 kHz mono WAV from the reference 30-min RL recording) — reuse to avoid re-extraction.
