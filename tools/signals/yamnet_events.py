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


def log(msg):
    print(msg, file=sys.stderr, flush=True)


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
    args = ap.parse_args()

    if not os.path.exists(MODEL_PATH):
        log(f"ERROR: model not found at {MODEL_PATH}")
        sys.exit(2)
    if not os.path.exists(CLASS_MAP_PATH):
        log(f"ERROR: class map not found at {CLASS_MAP_PATH}")
        sys.exit(2)

    log(f"Loading audio: {args.audio}")
    audio = load_audio_mono_16k(args.audio)
    log(f"Audio length: {len(audio) / SAMPLE_RATE:.1f} s")

    class_map = load_class_map(CLASS_MAP_PATH)
    keep_indices = {name: class_map[name] for name in KEEP_CLASSES if name in class_map}
    missing = [n for n in KEEP_CLASSES if n not in class_map]
    if missing:
        log(f"WARN: missing class names in class map: {missing}")

    log("Loading model...")
    interp = Interpreter(model_path=MODEL_PATH)
    interp.allocate_tensors()
    inp_idx = interp.get_input_details()[0]["index"]
    out_idx = interp.get_output_details()[0]["index"]

    frames = []
    if len(audio) < FRAME_LEN:
        log("WARN: audio shorter than one frame")
    else:
        n_frames = (len(audio) - FRAME_LEN) // HOP + 1
        log(f"Processing {n_frames} frames...")
        for i in range(n_frames):
            start = i * HOP
            chunk = audio[start:start + FRAME_LEN]
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

    out = {
        "signal": "yamnet",
        "frame_duration_ms": int(FRAME_LEN / SAMPLE_RATE * 1000),
        "classes_kept": KEEP_CLASSES,
        "frames": frames,
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    log(f"Wrote {len(frames)} non-silent frames -> {args.output}")


if __name__ == "__main__":
    main()
