#!/usr/bin/env python3
"""Voice pitch spike detection — ClipFlow Lever 1, Signal 2.

Runs librosa.pyin over the audio at its native sample rate (Stage 2 outputs
16 kHz mono, so no resampling), computes the speaker's median F0 baseline
from voiced frames, and emits 3-second windows where mean F0 exceeds
baseline * 1.4 for >= 0.5 s of voiced speech.

Score formula (locked 2026-04-23):
    score = min(1.0, mean_f0 / baseline - 1.0)
  → 1.4 x baseline (detection threshold) = 0.4
  → 2.0 x baseline                       = 1.0
  Linear in between; capped at 1.0 for >2 x baseline.
"""
import argparse
import json
import sys

import numpy as np
import librosa


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--window-sec", type=float, default=3.0)
    ap.add_argument("--step-sec", type=float, default=1.0)
    ap.add_argument("--threshold-mult", type=float, default=1.4)
    ap.add_argument("--min-voiced-sec", type=float, default=0.5)
    args = ap.parse_args()

    log(f"Loading audio: {args.audio}")
    y, sr = librosa.load(args.audio, sr=None, mono=True)
    log(f"Audio: {len(y) / sr:.1f} s @ {sr} Hz")

    fmin = librosa.note_to_hz("C2")   # ~65 Hz
    fmax = librosa.note_to_hz("C6")   # ~1047 Hz
    hop_length = 512
    frame_length = 2048

    log("Running pYIN...")
    f0, voiced_flag, _ = librosa.pyin(
        y, sr=sr, fmin=fmin, fmax=fmax,
        frame_length=frame_length, hop_length=hop_length,
    )
    times = librosa.times_like(f0, sr=sr, hop_length=hop_length)

    valid = voiced_flag & ~np.isnan(f0)
    voiced_f0 = f0[valid]
    if len(voiced_f0) < 10:
        log("WARN: too few voiced frames - emitting empty result")
        out = {"signal": "pitch_spike", "baseline_f0_hz": 0, "windows": []}
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2)
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

    out = {
        "signal": "pitch_spike",
        "baseline_f0_hz": round(baseline, 1),
        "windows": windows,
    }
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    log(f"Wrote {len(windows)} elevated windows -> {args.output}")


if __name__ == "__main__":
    main()
