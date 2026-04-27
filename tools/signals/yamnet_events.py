#!/usr/bin/env python3
"""YAMNet audio event detection — ClipFlow Lever 1, Signal 1.

Runs the YAMNet TFLite classifier over a 16 kHz mono WAV in 0.96 s
non-overlapping frames and emits one JSON file with the 17-class score
subset per frame. Only frames where at least one kept-class score
exceeds 0.05 are emitted — keeps the output file small.

Model: yamnet.tflite (MediaPipe float32 variant, bundled alongside this script)
Runtime: ai-edge-litert (Google's successor to tflite-runtime — tflite-runtime
has no Windows/py3.12 wheel as of 2026).

Input:  --audio <path_to.wav>  (any sample rate; resampled inline to 16 kHz)
Output: --output <path_to.json>
"""
import argparse
import csv
import json
import os
import sys
import time

import numpy as np
import soundfile as sf
from ai_edge_litert.interpreter import Interpreter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(SCRIPT_DIR, "yamnet.tflite")
CLASS_MAP_PATH = os.path.join(SCRIPT_DIR, "yamnet_class_map.csv")

# Locked 2026-04-23. Validated against yamnet_class_map.csv — all 17 present.
KEEP_CLASSES = [
    "Laughter", "Giggle", "Chuckle, chortle",
    "Screaming", "Shout", "Yell", "Whoop",
    "Cheering", "Applause", "Gasp", "Sigh", "Groan",
    "Gunshot, gunfire", "Explosion", "Alarm",
    "Music", "Silence",
]

SAMPLE_RATE = 16000
FRAME_LEN = 15600   # model input — exactly 0.975 s at 16 kHz
HOP = 15600         # non-overlapping frames (matches spec frame_duration_ms ≈ 960)
MIN_SCORE = 0.05    # omit frames where no kept class crosses this

# RMS threshold for skipping inference. Tuned to "true silence" — below typical
# microphone room-tone (~0.001–0.003) but well clear of any low-volume content
# (whispers, distant TV, soft mouth sounds register at 0.003+). At this threshold
# a frame mathematically cannot contain a reaction-class sound, so running
# inference is wasted. User can disable the filter entirely via --no-rms-skip
# (settings: yamnetSilenceSkip toggle) to force inference on every frame.
RMS_SKIP_THRESHOLD = 0.002


def log(msg):
    print(msg, file=sys.stderr, flush=True)


# Heartbeat protocol v1 (Issue #72 Phase 1).
# Node parses lines matching /^PROGRESS\s+([0-9.]+)\s*$/ on stderr to (a) reset
# the stall-timer and (b) feed per-signal progress to the renderer. Always emit
# 0.0 and 1.0; rate-limit interim updates to ~5s so we don't flood stderr.
_last_progress_t = 0.0


def progress(p):
    global _last_progress_t
    now = time.time()
    if p in (0.0, 1.0) or now - _last_progress_t > 5.0:
        print(f"PROGRESS {p:.3f}", file=sys.stderr, flush=True)
        _last_progress_t = now


def load_class_map(path):
    mapping = {}
    with open(path, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            mapping[row["display_name"]] = int(row["index"])
    return mapping


def load_audio_mono_16k(path):
    data, sr = sf.read(path, dtype="float32", always_2d=False)
    if data.ndim > 1:
        data = data.mean(axis=1).astype(np.float32)
    if sr != SAMPLE_RATE:
        # librosa is already a pipeline dep for pitch_spike; reuse here.
        import librosa
        data = librosa.resample(data, orig_sr=sr, target_sr=SAMPLE_RATE, res_type="soxr_hq")
    return np.ascontiguousarray(data, dtype=np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--no-rms-skip", action="store_true",
                    help="Disable the RMS pre-filter; run inference on every frame.")
    args = ap.parse_args()

    if not os.path.exists(MODEL_PATH):
        log(f"ERROR: model not found at {MODEL_PATH}")
        sys.exit(2)
    if not os.path.exists(CLASS_MAP_PATH):
        log(f"ERROR: class map not found at {CLASS_MAP_PATH}")
        sys.exit(2)

    log(f"Loading audio: {args.audio}")
    t_audio = time.time()
    audio = load_audio_mono_16k(args.audio)
    log(f"Audio length: {len(audio) / SAMPLE_RATE:.1f} s (loaded in {time.time() - t_audio:.2f}s)")

    class_map = load_class_map(CLASS_MAP_PATH)
    keep_indices = {name: class_map[name] for name in KEEP_CLASSES if name in class_map}
    missing = [n for n in KEEP_CLASSES if n not in class_map]
    if missing:
        log(f"WARN: missing class names in class map: {missing}")

    log("Loading model...")
    t_model = time.time()
    # ai-edge-litert defaults to single-threaded CPU inference. Phase 3 evidence
    # showed per-call cost of ~339ms single-threaded vs ~71ms at 8 threads on
    # this YAMNet model. Cap at 8 to avoid oversubscription on small CPUs.
    n_threads = min(os.cpu_count() or 4, 8)
    interp = Interpreter(model_path=MODEL_PATH, num_threads=n_threads)
    interp.allocate_tensors()
    inp_idx = interp.get_input_details()[0]["index"]
    out_idx = interp.get_output_details()[0]["index"]
    log(f"Model loaded in {time.time() - t_model:.2f}s")
    progress(0.0)

    frames = []
    if len(audio) < FRAME_LEN:
        log("WARN: audio shorter than one frame")
    else:
        n_frames = (len(audio) - FRAME_LEN) // HOP + 1
        log(f"Processing {n_frames} frames...")
        t_loop = time.time()
        skipped = 0
        # Effective threshold: 0 disables the filter (every frame runs inference).
        effective_threshold = 0.0 if args.no_rms_skip else RMS_SKIP_THRESHOLD
        if args.no_rms_skip:
            log("RMS pre-filter DISABLED — running inference on every frame")
        for i in range(n_frames):
            start = i * HOP
            chunk = audio[start:start + FRAME_LEN]
            rms = float(np.sqrt(np.mean(chunk * chunk)))
            if rms < effective_threshold:
                skipped += 1
                progress(i / n_frames)
                continue
            interp.set_tensor(inp_idx, chunk)
            interp.invoke()
            scores = interp.get_tensor(out_idx)[0]
            kept = {name: float(scores[idx]) for name, idx in keep_indices.items()}
            kept = {k: round(v, 4) for k, v in kept.items() if v > MIN_SCORE}
            if kept:
                frames.append({
                    "t_start": round(start / SAMPLE_RATE, 3),
                    "t_end": round((start + FRAME_LEN) / SAMPLE_RATE, 3),
                    "scores": kept,
                })
            progress(i / n_frames)
        log(f"Skipped {skipped}/{n_frames} silent frames (RMS < {effective_threshold}); inference loop {time.time() - t_loop:.2f}s")

    out = {
        "signal": "yamnet",
        "frame_duration_ms": int(FRAME_LEN / SAMPLE_RATE * 1000),
        "classes_kept": KEEP_CLASSES,
        "frames": frames,
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    progress(1.0)
    log(f"Wrote {len(frames)} non-silent frames -> {args.output}")


if __name__ == "__main__":
    main()
