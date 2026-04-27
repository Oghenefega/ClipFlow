#!/usr/bin/env python3
"""Voice pitch spike detection — ClipFlow Lever 1, Signal 2.

Loads audio at 8 kHz (voice F0 tops out near 1 kHz, so 4 kHz Nyquist is
plenty), runs librosa.yin in fixed-size chunks (default 30s) emitting a
PROGRESS heartbeat between chunks so the Node stall-timer never fires,
computes the speaker's median F0 baseline from voiced frames (frames
where YIN returned a valid F0 inside [fmin, fmax]), and emits 3-second
windows where mean F0 exceeds baseline * 1.4 for >= 0.5 s of voiced
speech.

Phase 4 swapped pYIN → YIN per the Pioneer gate (Issue #72): pYIN even
chunked at 8kHz/hop=512 still ran ~126s on a 30-min recording; YIN at
8kHz/hop=1024 hits the same accuracy band at <30s. We don't use pYIN's
probabilistic voicing output (only the boolean voiced_flag), so YIN's
NaN-when-unvoiced output is functionally equivalent for this script.

Score formula (locked 2026-04-23):
    score = min(1.0, mean_f0 / baseline - 1.0)
  → 1.4 x baseline (detection threshold) = 0.4
  → 2.0 x baseline                       = 1.0
  Linear in between; capped at 1.0 for >2 x baseline.
"""
import argparse
import json
import math
import sys
import time

import numpy as np
import librosa


def log(msg):
    print(msg, file=sys.stderr, flush=True)


_last_progress_t = 0.0


def progress(p):
    global _last_progress_t
    now = time.time()
    if p in (0.0, 1.0) or now - _last_progress_t > 5.0:
        print(f"PROGRESS {p:.3f}", file=sys.stderr, flush=True)
        _last_progress_t = now


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--window-sec", type=float, default=3.0)
    ap.add_argument("--step-sec", type=float, default=1.0)
    ap.add_argument("--threshold-mult", type=float, default=1.4)
    ap.add_argument("--min-voiced-sec", type=float, default=0.5)
    ap.add_argument("--chunk-sec", type=float, default=30.0)
    args = ap.parse_args()

    log(f"Loading audio: {args.audio}")
    load_t0 = time.time()
    y, sr = librosa.load(args.audio, sr=8000, mono=True)
    log(f"Audio: {len(y) / sr:.1f} s @ {sr} Hz  (loaded in {time.time()-load_t0:.1f}s)")
    progress(0.0)

    fmin = librosa.note_to_hz("C2")   # ~65 Hz
    fmax = librosa.note_to_hz("C6")   # ~1047 Hz
    hop_length = 1024
    frame_length = 2048

    chunk_samples = int(args.chunk_sec * sr)
    n_chunks = max(1, math.ceil(len(y) / chunk_samples))
    log(f"Running YIN in {n_chunks} chunks of ~{args.chunk_sec:.0f}s...")

    f0_parts = []
    times_parts = []
    yin_t0 = time.time()
    for i in range(n_chunks):
        start = i * chunk_samples
        end = min(start + chunk_samples, len(y))
        chunk = y[start:end]
        if len(chunk) < frame_length:
            continue
        f0_c = librosa.yin(
            chunk, sr=sr, fmin=fmin, fmax=fmax,
            frame_length=frame_length, hop_length=hop_length,
        )
        times_c = librosa.times_like(f0_c, sr=sr, hop_length=hop_length) + (start / sr)
        f0_parts.append(f0_c)
        times_parts.append(times_c)
        progress(min(0.5, (i + 1) / n_chunks * 0.5))

    log(f"YIN finished in {time.time()-yin_t0:.1f}s ({n_chunks} chunks)")
    if not f0_parts:
        log("WARN: no usable chunks - emitting empty result")
        out = {"signal": "pitch_spike", "baseline_f0_hz": 0, "windows": []}
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2)
        progress(1.0)
        return

    f0 = np.concatenate(f0_parts)
    times = np.concatenate(times_parts)
    progress(0.5)

    # YIN doesn't return a separate voiced_flag — frames with no detected
    # pitch return NaN. Treat any in-range, non-NaN f0 as voiced.
    valid = ~np.isnan(f0) & (f0 >= fmin) & (f0 <= fmax)
    voiced_f0 = f0[valid]
    if len(voiced_f0) < 10:
        log("WARN: too few voiced frames - emitting empty result")
        out = {"signal": "pitch_spike", "baseline_f0_hz": 0, "windows": []}
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2)
        progress(1.0)
        return

    baseline = float(np.median(voiced_f0))
    log(f"Baseline F0: {baseline:.1f} Hz  ({len(voiced_f0)} voiced frames)")

    hop_sec = hop_length / sr
    windows = []
    t = 0.0
    max_t = float(times[-1]) if len(times) else 0.0

    while t + args.window_sec <= max_t:
        mask = (times >= t) & (times < t + args.window_sec) & valid
        voiced_count = int(mask.sum())
        voiced_sec = voiced_count * hop_sec
        if voiced_sec >= args.min_voiced_sec:
            mean_f0 = float(np.mean(f0[mask]))
            if mean_f0 > baseline * args.threshold_mult:
                score = min(1.0, mean_f0 / baseline - 1.0)
                windows.append({
                    "t_start": round(t, 3),
                    "t_end": round(t + args.window_sec, 3),
                    "mean_f0_hz": round(mean_f0, 1),
                    "score": round(score, 4),
                    "is_elevated": True,
                })
        t += args.step_sec
        if max_t > 0:
            progress(0.5 + 0.5 * min(1.0, t / max_t))

    out = {
        "signal": "pitch_spike",
        "baseline_f0_hz": round(baseline, 1),
        "windows": windows,
    }
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    progress(1.0)
    log(f"Wrote {len(windows)} elevated windows -> {args.output}")


if __name__ == "__main__":
    main()
