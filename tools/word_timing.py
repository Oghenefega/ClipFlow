"""
Word-start refinement for Corva subtitles (#356).

Measured on Fega's 129 approved clips (tasks/specs/subtitle-timing-learning-2026-09-02.md):
stable-ts word starts are within 100 ms of his hand-fixed timing for 78% of words. The
misses are (a) the first word of an utterance stretched back over the pause or the previous
word's tail, and (b) inner/last words whose boundary inside continuous speech sits too late
or too early. Two corrections, both scored against those clips before shipping:

  1. WhisperX second opinion (wav2vec2 CTC forced alignment of the SAME text). Where its
     start disagrees with stable-ts by more than WX_DISAGREE seconds, WhisperX wins.
     Scored: 81% of words within 100 ms (raw 78%), 36% of the words Fega had to move now
     land, 5-8% of untouched words nudged. Fixes inner words too (67% of them when used
     alone) — the energy rule below cannot see a boundary inside continuous speech.
  2. Silence-edge snap (audio energy only, no model). A word longer than LONG_WORD seconds
     whose span contains a quiet run followed by speech really starts at the end of that
     run. Scored: 44% of the early first words land, 2-3% of untouched words nudged.
     Used on its own when WhisperX is unavailable, and as a tie-break when both agree.

Pure functions over the ClipFlow segment shape:
  [{start, end, text, words: [{word, start, end, probability}]}]
Times are seconds relative to the audio passed in (clip-relative). Nothing here mutates
its input.
"""

import sys
import numpy as np

FRAME = 0.01          # energy frame, seconds
LONG_WORD = 0.3       # only words longer than this get the silence-edge snap
QUIET_REL_DB = 18.0   # quiet = below (local peak - this)
QUIET_ABS_DB = 6.0    # ... and below (noise floor + this)
QUIET_MIN_RUN = 0.06  # a quiet run must last this long to count
SNAP_LEAD = 0.02      # land the start this far before the speech edge
WX_DISAGREE = 0.15    # WhisperX overrides stable-ts when they differ by more than this
WX_BIAS = 0.031       # WhisperX starts run this much late vs Fega's finals (median)
MIN_WORD = 0.03


def _norm(word):
    return "".join(ch for ch in (word or "").lower() if ch.isalnum() or ch == "'")


# ── Energy envelope ──────────────────────────────────────────────────────────

def energy_db(audio_np, sr):
    """Per-FRAME RMS energy in dB. audio_np: float32 mono in [-1, 1]."""
    n = max(1, int(sr * FRAME))
    m = len(audio_np) // n
    if m == 0:
        return np.array([-100.0])
    frames = audio_np[: m * n].reshape(m, n)
    rms = np.sqrt((frames ** 2).mean(axis=1)) + 1e-7
    return 20.0 * np.log10(rms)


def silence_edge_start(db, noise_db, start, end):
    """
    Return the corrected start for a word spanning [start, end]: the end of the LAST quiet
    run inside the span that is followed by speech, minus SNAP_LEAD. Returns `start`
    unchanged when there is no such run.
    """
    i0 = max(0, int(start / FRAME))
    i1 = min(len(db) - 1, int(end / FRAME))
    if i1 - i0 < 3:
        return start
    seg = db[i0 : i1 + 1]
    thr = max(noise_db + QUIET_ABS_DB, float(seg.max()) - QUIET_REL_DB)
    quiet = seg < thr
    runs = []
    k = 0
    while k < len(quiet):
        if quiet[k]:
            j = k
            while j < len(quiet) and quiet[j]:
                j += 1
            if (j - k) * FRAME >= QUIET_MIN_RUN:
                runs.append((k, j))
            k = j
        else:
            k += 1
    runs = [r for r in runs if r[1] < len(quiet)]  # must be followed by speech inside the span
    if not runs:
        return start
    return max(start, (i0 + runs[-1][1]) * FRAME - SNAP_LEAD)


def snap_long_words(segments, audio_np, sr):
    """Rule 2 on its own: silence-edge snap for every word longer than LONG_WORD."""
    db = energy_db(audio_np, sr)
    noise = float(np.percentile(db, 5))
    out = []
    moved = 0
    for seg in segments:
        words = []
        for w in seg.get("words", []):
            nw = dict(w)
            if (w["end"] - w["start"]) > LONG_WORD:
                ns = silence_edge_start(db, noise, w["start"], w["end"])
                if ns > w["start"] + 0.01:
                    nw["start"] = round(ns, 3)
                    moved += 1
            words.append(nw)
        out.append({**seg, "words": words})
    return _enforce_order(out), {"snapped": moved}


# ── WhisperX second opinion ──────────────────────────────────────────────────

_ALIGN = {"model": None, "meta": None, "device": None, "failed": False}


def _load_align_model(device):
    if _ALIGN["failed"]:
        return None
    if _ALIGN["model"] is None or _ALIGN["device"] != device:
        try:
            import whisperx
            model, meta = whisperx.load_align_model(language_code="en", device=device)
            _ALIGN.update(model=model, meta=meta, device=device)
        except Exception as e:  # whisperx not installed / model download failed
            print(f"[TIMING] WhisperX unavailable ({e}); using the silence-edge snap only", file=sys.stderr)
            _ALIGN["failed"] = True
            return None
    return _ALIGN


def whisperx_word_starts(segments, audio_np, sr, device):
    """
    Force-align the transcribed text with wav2vec2 and return a flat, time-sorted list of
    {word, start} for every word it could place. None when WhisperX is unavailable.
    """
    al = _load_align_model(device)
    if al is None:
        return None
    import whisperx
    if sr != 16000:
        # whisperx expects 16 kHz; transcribe.py always feeds 16 kHz WAVs (ffmpeg.extractAudioRange)
        print(f"[TIMING] WhisperX skipped: audio is {sr} Hz, need 16000", file=sys.stderr)
        return None
    text_segs = [
        {"text": s.get("text", ""), "start": s["start"], "end": s["end"]}
        for s in segments
        if (s.get("text") or "").strip() and s["end"] > s["start"]
    ]
    if not text_segs:
        return None
    try:
        res = whisperx.align(text_segs, al["model"], al["meta"], audio_np.astype(np.float32), device,
                             return_char_alignments=False)
    except Exception as e:
        print(f"[TIMING] WhisperX align failed ({e}); using the silence-edge snap only", file=sys.stderr)
        return None
    out = []
    for s in res.get("segments", []):
        for w in s.get("words", []):
            if w.get("start") is not None:
                out.append({"word": w.get("word", ""), "start": float(w["start"])})
    out.sort(key=lambda w: w["start"])
    return out


def _nearest(cands, word, t, window=1.0):
    n = _norm(word)
    best = None
    for c in cands:
        if _norm(c["word"]) != n:
            continue
        d = abs(c["start"] - t)
        if d < window and (best is None or d < best[0]):
            best = (d, c)
    return best[1] if best else None


def apply_second_opinion(segments, wx_words, audio_np, sr):
    """
    Rule 1 (+2 as tie-break): WhisperX wins where it disagrees with stable-ts by more than
    WX_DISAGREE; otherwise a long word's silence-edge snap applies when WhisperX agrees
    with the snapped position.
    """
    db = energy_db(audio_np, sr)
    noise = float(np.percentile(db, 5))
    out = []
    stats = {"whisperx": 0, "snapped": 0, "unmatched": 0}
    for seg in segments:
        words = []
        for w in seg.get("words", []):
            nw = dict(w)
            m = _nearest(wx_words, w["word"], w["start"])
            if m is None:
                stats["unmatched"] += 1
            else:
                wx = m["start"] - WX_BIAS
                if abs(wx - w["start"]) > WX_DISAGREE:
                    nw["start"] = round(max(0.0, wx), 3)
                    stats["whisperx"] += 1
                elif (w["end"] - w["start"]) > LONG_WORD:
                    ns = silence_edge_start(db, noise, w["start"], w["end"])
                    if ns > w["start"] + 0.01 and abs(ns - wx) <= WX_DISAGREE:
                        nw["start"] = round(ns, 3)
                        stats["snapped"] += 1
            words.append(nw)
        out.append({**seg, "words": words})
    return _enforce_order(out), stats


# ── Shared tidy-up ───────────────────────────────────────────────────────────

def _enforce_order(segments):
    """Keep every word at least MIN_WORD long and strictly ordered after a start moved."""
    flat = [w for s in segments for w in s.get("words", [])]
    for i, w in enumerate(flat):
        if w["end"] < w["start"] + MIN_WORD:
            w["end"] = round(w["start"] + MIN_WORD, 3)
        if i > 0 and flat[i - 1]["end"] > w["start"]:
            flat[i - 1]["end"] = round(max(flat[i - 1]["start"] + MIN_WORD, w["start"]), 3)
    for s in segments:
        if s.get("words"):
            s["start"] = min(s["start"], s["words"][0]["start"])
            s["end"] = max(s["end"], s["words"][-1]["end"])
    return segments


def refine_word_timing(segments, audio_np, sr, device="cpu", use_whisperx=True):
    """
    Entry point used by transcribe.py after its own post-processing. Returns
    (segments, stats). Never raises: any failure leaves the input timings as they were.
    """
    try:
        if use_whisperx:
            wx = whisperx_word_starts(segments, audio_np, sr, device)
            if wx:
                segs, stats = apply_second_opinion(segments, wx, audio_np, sr)
                stats["method"] = "whisperx+snap"
                return segs, stats
        segs, stats = snap_long_words(segments, audio_np, sr)
        stats["method"] = "snap"
        return segs, stats
    except Exception as e:
        print(f"[TIMING] refinement skipped ({e})", file=sys.stderr)
        return segments, {"method": "none", "error": str(e)}
