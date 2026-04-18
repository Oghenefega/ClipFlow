# ClipFlow — Session Handoff
_Last updated: 2026-04-18 (session 20) — "Technical summary v4 + clip detection architecture review"_

---

## TL;DR

**Documentation-only session.** No code was changed. The session produced `reference/TECHNICAL_SUMMARY v4.md` — a full architectural audit of the clip detection pipeline, written as the foundation for the upcoming multi-signal improvement work.

---

## 🎯 Next session — clip detection signal expansion

The planned change: add 4–5 new local signals to the AI pipeline so Claude reasons over richer evidence than just audio loudness + transcript. The "loud = important" heuristic underperforms for Chill / Competitive / Variety archetypes.

**Two bias contact points to fix (documented in v4 §3.4):**
1. **Frame selection (Stage 5):** Only peak-energy frames get visual representation. Quiet clutch plays, deadpan comedy, slow tactical moments never get a frame.
2. **Transcript labeling (Stage 4):** Energy labels in `claude_ready.txt` are purely RMS-derived. A whispered clutch moment gets 🔇 LOW regardless of content.

**Candidate new signals to discuss/plan:**
- Scene change detection (via FFmpeg `select=gt(scene,0.4)`)
- Silence gaps / speech onset events
- Speech rate / word density per segment
- Face or body motion detection
- Sentiment / keyword spike detection (from transcript text itself)

**Files that will change:**
- `D:\whisper\energy_scorer.py` — will need extension or replacement; consider moving into `tools/`
- `src/main/ai-pipeline.js` — Stage 5 frame selection logic
- `src/main/ai-prompt.js` — system prompt needs to explain new signal labels to Claude

---

## ✅ What was built this session

- **`reference/TECHNICAL_SUMMARY v4.md`** — Updated technical summary replacing v3:
  - Fixed Stage 7 cutting description (re-encode, not stream copy)
  - Expanded §3.4 into a full 8-stage pipeline walkthrough with data flows per stage
  - Added signal table showing exactly what Claude receives
  - Explicitly documented the two "loud = important" bias contact points
  - Added `claude_ready.txt` format example
  - Noted `energy_scorer.py` is not in the repo (lives at `D:\whisper\`)
  - Added "Richer clip detection signals" to Planned / Not Yet Built
  - Corrected file structure to reflect `tools/transcribe.py` explicitly

---

## 🔑 Key decisions this session

- **Produce v4 before implementing** — User wants to understand the full pipeline before planning the multi-signal change. v4 is the source document for next session's planning.
- **Architecture vs. infrastructure clarified** — Architecture = how code is structured internally (pipeline, components, data flows). Infrastructure = external services and runtime (Supabase, Electron, Cloudflare). The clip pipeline flowchart the user wants is architecture.

---

## ⚠️ Watch out for

- `energy_scorer.py` **is not in the repo** — lives at `D:\whisper\energy_scorer.py`. Any signal pipeline changes must account for this. Consider bringing it into `tools/` as part of the improvement work.
- Frame extraction is 100% driven by `peak_energy` sort — changing scoring logic changes what visual moments Claude sees. High-leverage, high-risk change point.
- `claude_ready.txt` is Claude's primary evidence document. New signals must be legible in that format without bloating token count significantly.
- The feedback loop (few-shot examples from approved clips) is calibrated to the current 2-signal world. Post-change, the first batch of approved clips will represent a different signal space — blending still works but examples may feel slightly mismatched until enough new clips accumulate.
- **All session 19 "DO NOT touch" rules still apply** — see previous HANDOFF for the full list (CSP, sandbox, waveform IPC contract, zoom slider, etc.)

---

## 🪵 Logs / Debugging

*(No code changes this session — all logging notes from session 19 still apply.)*

- **Waveform flow:** grep main-process stdout for `[waveform]`. Success: `start` → `cache hit` or `extracting` → `extracted`. Failure: `ffmpeg exit` + `stderr tail` + `failed`. Renderer shows "Waveform unavailable" in red on failure.
- **Per-video pipeline logs:** `C:\Users\IAmAbsolute\Desktop\ClipFlow\processing\logs\<VideoName>_<timestamp>.log`
- **Electron main logs:** `C:\Users\IAmAbsolute\AppData\Roaming\clipflow\logs\app.log`
- **Renderer DevTools:** `CLIPFLOW_DEVTOOLS=1 npm start`

---

## 🔄 Build & verify

```bash
npm run build:renderer               # Vite build (~10s)
npm start                            # Launch Electron (prod mode)
CLIPFLOW_DEVTOOLS=1 npm start        # Launch with DevTools attached
```

---

## 📋 Issue board state (unchanged from session 19)

| Item | Issue | Status |
|---|---|---|
| H2 renderer CSP | [#48](https://github.com/Oghenefega/ClipFlow/issues/48) | ✅ closed session 18 |
| #65 overlay drift | [#65](https://github.com/Oghenefega/ClipFlow/issues/65) | ✅ closed session 19 |
| #59 Render button | [#59](https://github.com/Oghenefega/ClipFlow/issues/59) | ✅ closed session 19 |
| #64 waveform extraction | [#64](https://github.com/Oghenefega/ClipFlow/issues/64) | 🟡 instrumented; root cause pending |
| #66 transcript shows full source | [#66](https://github.com/Oghenefega/ClipFlow/issues/66) | 🔲 filed; ready |
| #67 zoom slider caps at ~23% | [#67](https://github.com/Oghenefega/ClipFlow/issues/67) | 🔲 filed; ready |
| #63 overlay-window sandbox | [#63](https://github.com/Oghenefega/ClipFlow/issues/63) | 🔲 deferred |
| #57 editor perf on long source | [#57](https://github.com/Oghenefega/ClipFlow/issues/57) | 🔲 deferred |
| #61 monthly folder = recording date | [#61](https://github.com/Oghenefega/ClipFlow/issues/61) | 🔲 ready |
| #62 pipeline silent-audio tolerance | [#62](https://github.com/Oghenefega/ClipFlow/issues/62) | 🔲 ready |
| **Multi-signal clip detection** | TBD | 🔲 next session |
