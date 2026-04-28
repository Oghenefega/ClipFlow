#!/usr/bin/env python3
"""
ClipFlow transcription bridge — stable-ts (faster-whisper backend) wrapper.

Usage:
    python transcribe.py --audio <path> --output <path> [--model <name>] [--language <lang>]
                         [--batch_size <n>] [--compute_type <type>] [--hf_token <token>]

Outputs JSON matching ClipFlow's expected format:
    { segments: [{ start, end, text, words: [{ word, start, end, probability }] }], text: "..." }

Progress is printed to stderr as "XX%" (parseable by the existing progress handler).
Exit 0 on success, non-zero on error.

Uses stable-ts for transcription + word-level timestamps. stable-ts uses iterative
audio muting + probability analysis to produce highly accurate word boundaries,
significantly better than WhisperX's wav2vec2 forced alignment for gaming commentary.
"""

import sys
import os
import json
import argparse
import numpy as np

# Redirect HuggingFace cache to D: drive
os.environ.setdefault("HF_HOME", r"D:\whisper\hf_cache")


def print_progress(pct, msg=""):
    """Print progress to stderr in a format the Node.js handler can parse."""
    sys.stderr.write(f"{int(pct)}%\n")
    sys.stderr.flush()


# ════════════════════════════════════════════════════════════════════════════
#  TIER 1: Audio-aware word timestamp post-processing
# ════════════════════════════════════════════════════════════════════════════

def compute_speech_energy(audio_np, sr=16000, frame_ms=20):
    """
    Compute per-frame RMS energy from raw audio samples.
    Returns array of energy values, one per frame_ms window.
    """
    frame_size = int(sr * frame_ms / 1000)
    n_frames = len(audio_np) // frame_size
    if n_frames == 0:
        return np.array([0.0])
    # Reshape into frames and compute RMS
    frames = audio_np[:n_frames * frame_size].reshape(n_frames, frame_size)
    energy = np.sqrt(np.mean(frames ** 2, axis=1))
    return energy


def detect_speech_regions(energy, frame_ms=20, threshold_ratio=0.15, min_speech_ms=60):
    """
    Simple energy-based speech detection.
    Returns list of (start_sec, end_sec) tuples where speech is detected.
    """
    if len(energy) == 0:
        return []

    threshold = np.max(energy) * threshold_ratio
    is_speech = energy > threshold

    # Merge short gaps (< 100ms)
    merge_frames = int(100 / frame_ms)
    for i in range(len(is_speech) - merge_frames):
        if is_speech[i] and any(is_speech[i+1:i+merge_frames+1]):
            is_speech[i:i+merge_frames+1] = True

    # Find contiguous speech regions
    regions = []
    in_speech = False
    start = 0
    for i, s in enumerate(is_speech):
        if s and not in_speech:
            start = i
            in_speech = True
        elif not s and in_speech:
            dur_ms = (i - start) * frame_ms
            if dur_ms >= min_speech_ms:
                regions.append((start * frame_ms / 1000, i * frame_ms / 1000))
            in_speech = False
    if in_speech:
        dur_ms = (len(is_speech) - start) * frame_ms
        if dur_ms >= min_speech_ms:
            regions.append((start * frame_ms / 1000, len(is_speech) * frame_ms / 1000))

    return regions


def get_energy_in_range(energy, start_sec, end_sec, frame_ms=20):
    """Get mean energy in a time range."""
    start_frame = int(start_sec * 1000 / frame_ms)
    end_frame = int(end_sec * 1000 / frame_ms)
    start_frame = max(0, min(start_frame, len(energy) - 1))
    end_frame = max(start_frame + 1, min(end_frame, len(energy)))
    return float(np.mean(energy[start_frame:end_frame]))


def find_nearest_speech_onset(energy, target_sec, search_range_sec=0.3, frame_ms=20):
    """
    Find the nearest speech onset (energy rise) near target_sec.
    Searches ±search_range_sec around target.
    Returns adjusted time in seconds.
    """
    frame_rate = 1000 / frame_ms
    target_frame = int(target_sec * frame_rate)
    search_frames = int(search_range_sec * frame_rate)

    start_f = max(0, target_frame - search_frames)
    end_f = min(len(energy) - 1, target_frame + search_frames)

    if start_f >= end_f:
        return target_sec

    # Compute energy derivative (onset = positive spike)
    window = energy[start_f:end_f + 1]
    if len(window) < 3:
        return target_sec

    deriv = np.diff(window)
    threshold = np.max(np.abs(deriv)) * 0.3

    # Find the first significant positive derivative (onset) near target
    target_local = target_frame - start_f
    best_onset = target_local
    best_dist = search_frames + 1

    for i, d in enumerate(deriv):
        if d > threshold:
            dist = abs(i - target_local)
            if dist < best_dist:
                best_dist = dist
                best_onset = i

    return (start_f + best_onset) / frame_rate


def repair_segment_words(words, seg_start, seg_end, energy, frame_ms=20):
    """
    Repair word timestamps within a single segment using audio energy.

    Strategy:
    1. Detect if timestamps are SEVERELY broken (not just natural variance)
    2. If broken: redistribute using energy-weighted allocation
    3. If mostly OK: snap word boundaries to nearest speech onsets
    4. Enforce monotonicity and segment boundary clamping

    IMPORTANT: Only trigger repair for genuinely broken data. Natural speech
    has uneven pacing — words are NOT uniformly distributed. Aggressive
    repair replaces real alignment with interpolation, making timing worse.
    """
    if not words or len(words) == 0:
        return words

    seg_dur = seg_end - seg_start
    n_words = len(words)
    triggered_check = None

    # ── Check if timestamps are broken ──
    is_broken = False

    # Check 1: Segment has ~0 duration
    if seg_dur < 0.05:
        is_broken = True
        triggered_check = "check1_zero_duration"

    # Check 2: Words bunched at the same time (>70% share a start time within 50ms)
    # Relaxed from 50% → 70% to avoid false positives on naturally tight speech
    if not is_broken and n_words > 1:
        rounded_starts = [round(w["start"] * 20) / 20 for w in words]
        unique_count = len(set(rounded_starts))
        ratio = unique_count / n_words
        if ratio < 0.3:
            is_broken = True
            triggered_check = f"check2_bunched(unique_ratio={ratio:.2f})"

    # Check 3: REMOVED — natural speech legitimately clusters in a portion of the
    # segment. A word span covering only 30-50% of segment time is normal for speech
    # with leading/trailing silence. This check had ~20% false positive rate.

    # Check 4: Many words have zero or near-zero duration
    # Relaxed: only trigger if >60% of words are <10ms (truly broken)
    if not is_broken and n_words > 2:
        zero_dur_count = sum(1 for w in words if (w["end"] - w["start"]) < 0.01)
        ratio = zero_dur_count / n_words
        if ratio > 0.6:
            is_broken = True
            triggered_check = f"check4_zero_dur(ratio={ratio:.2f})"

    # Check 5: Words are not monotonically increasing
    if not is_broken and n_words > 1:
        for i in range(1, n_words):
            if words[i]["start"] < words[i-1]["start"] - 0.01:
                is_broken = True
                triggered_check = f"check5_non_monotonic(word={i})"
                break

    # Check 6: REMOVED — comparing word positions against UNIFORM distribution
    # is fundamentally wrong. Natural speech is bursty: some words are rapid-fire,
    # others have pauses. This check was flagging perfectly good alignment as
    # "broken" and replacing real timestamps with energy-weighted interpolation.

    # Check 7: REMOVED — words not filling a segment is normal. Speech often starts
    # after the segment boundary or ends before it. 25% gap threshold was too
    # aggressive and caused false positives on natural speech.

    # ── Diagnostic logging ──
    if is_broken:
        text_preview = " ".join(w.get("word", "") for w in words[:5])
        if len(words) > 5:
            text_preview += "..."
        print(f"[REPAIR] {seg_start:.1f}-{seg_end:.1f}s ({n_words}w): {triggered_check} → redistributing | \"{text_preview}\"", file=sys.stderr)
    else:
        # Log when we KEEP the alignment (for debugging good vs bad clips)
        text_preview = " ".join(w.get("word", "") for w in words[:5])
        if len(words) > 5:
            text_preview += "..."
        # Only log segments with 3+ words to reduce noise
        if n_words >= 3:
            avg_dur = sum((w["end"] - w["start"]) for w in words) / n_words
            print(f"[KEEP]   {seg_start:.1f}-{seg_end:.1f}s ({n_words}w): avg_word_dur={avg_dur:.3f}s | \"{text_preview}\"", file=sys.stderr)

    # ── Fix broken timestamps ──
    if is_broken:
        return energy_weighted_distribute(words, seg_start, seg_end, energy, frame_ms)

    # ── Timestamps look OK — apply light corrections ──
    repaired = []
    for i, w in enumerate(words):
        new_w = dict(w)

        # Clamp to segment boundaries
        new_w["start"] = max(seg_start, min(seg_end, new_w["start"]))
        new_w["end"] = max(seg_start, min(seg_end, new_w["end"]))

        # Ensure minimum word duration (30ms)
        if new_w["end"] - new_w["start"] < 0.03:
            # Expand to 30ms, preferring to extend end
            new_w["end"] = min(seg_end, new_w["start"] + 0.03)

        # Snap start to nearest speech onset (within ±150ms)
        snapped = find_nearest_speech_onset(energy, new_w["start"], 0.15, frame_ms)
        # Only apply if the snap is small (< 100ms)
        if abs(snapped - new_w["start"]) < 0.1:
            shift = snapped - new_w["start"]
            new_w["start"] = snapped
            new_w["end"] = new_w["end"] + shift

        repaired.append(new_w)

    # ── Enforce monotonicity ──
    for i in range(1, len(repaired)):
        if repaired[i]["start"] < repaired[i-1]["end"]:
            # Overlap — split the difference
            mid = (repaired[i-1]["end"] + repaired[i]["start"]) / 2
            repaired[i-1]["end"] = mid
            repaired[i]["start"] = mid

    # Final clamp
    for w in repaired:
        w["start"] = max(seg_start, min(seg_end, w["start"]))
        w["end"] = max(w["start"], min(seg_end, w["end"]))

    return repaired


def energy_weighted_distribute(words, seg_start, seg_end, energy, frame_ms=20):
    """
    Distribute words across a segment using audio energy as weights.
    Words in louder portions get more time; silence gets compressed.
    This produces much more natural timing than even distribution.
    """
    n_words = len(words)
    seg_dur = max(0.05, seg_end - seg_start)

    # Get per-frame energy for this segment
    frame_rate = 1000 / frame_ms
    start_frame = int(seg_start * frame_rate)
    end_frame = int(seg_end * frame_rate)
    start_frame = max(0, min(start_frame, len(energy) - 1))
    end_frame = max(start_frame + 1, min(end_frame, len(energy)))

    seg_energy = energy[start_frame:end_frame]

    if len(seg_energy) < n_words:
        # Not enough frames — fall back to even distribution
        per_word = seg_dur / n_words
        result = []
        for i, w in enumerate(words):
            result.append({
                **w,
                "start": seg_start + i * per_word,
                "end": seg_start + (i + 1) * per_word,
            })
        return result

    # Split energy into n_words chunks and compute weight per chunk
    chunk_size = len(seg_energy) / n_words
    weights = []
    for i in range(n_words):
        c_start = int(i * chunk_size)
        c_end = int((i + 1) * chunk_size)
        c_end = max(c_start + 1, c_end)
        chunk_energy = seg_energy[c_start:c_end]
        weights.append(float(np.mean(chunk_energy)) + 0.01)  # +0.01 to avoid zero

    # Normalize weights to sum to segment duration
    total_weight = sum(weights)
    durations = [(w / total_weight) * seg_dur for w in weights]

    # Enforce minimum word duration (20ms)
    min_dur = 0.02
    for i in range(len(durations)):
        if durations[i] < min_dur:
            deficit = min_dur - durations[i]
            durations[i] = min_dur
            # Steal from longest neighbor
            neighbors = []
            if i > 0:
                neighbors.append(i - 1)
            if i < len(durations) - 1:
                neighbors.append(i + 1)
            if neighbors:
                longest = max(neighbors, key=lambda j: durations[j])
                durations[longest] = max(min_dur, durations[longest] - deficit)

    # Build word timestamps from durations
    result = []
    t = seg_start
    for i, w in enumerate(words):
        w_start = t
        w_end = t + durations[i]
        result.append({
            **w,
            "start": round(w_start, 3),
            "end": round(w_end, 3),
        })
        t = w_end

    return result


def postprocess_timestamps(segments, audio_np, sr=16000):
    """
    Main post-processing entry point.
    Takes whisperx segments + raw audio, returns repaired segments.
    """
    frame_ms = 20
    energy = compute_speech_energy(audio_np, sr, frame_ms)

    repaired_segments = []
    for seg in segments:
        seg_start = seg.get("start", 0)
        seg_end = seg.get("end", 0)
        words = seg.get("words", [])
        text = (seg.get("text") or "").strip()

        if words:
            repaired_words = repair_segment_words(
                words, seg_start, seg_end, energy, frame_ms
            )
        elif text:
            # No word timestamps — create synthetic words from text and distribute
            # using energy-weighted allocation for natural timing
            text_words = text.split()
            synthetic_words = [{"word": w, "start": seg_start, "end": seg_end, "probability": 0.5} for w in text_words]
            repaired_words = energy_weighted_distribute(synthetic_words, seg_start, seg_end, energy, frame_ms)
        else:
            repaired_words = words

        repaired_segments.append({
            **seg,
            "words": repaired_words,
        })

    # ── Cross-segment fixes ──
    # Ensure no overlap between last word of segment N and first word of segment N+1
    for i in range(1, len(repaired_segments)):
        prev_words = repaired_segments[i-1].get("words", [])
        curr_words = repaired_segments[i].get("words", [])
        if prev_words and curr_words:
            if prev_words[-1]["end"] > curr_words[0]["start"]:
                mid = (prev_words[-1]["end"] + curr_words[0]["start"]) / 2
                prev_words[-1]["end"] = round(mid, 3)
                curr_words[0]["start"] = round(mid, 3)

    return repaired_segments


# ════════════════════════════════════════════════════════════════════════════
#  TIER 2: Pre-alignment mega-segment splitting
# ════════════════════════════════════════════════════════════════════════════

def split_mega_segments(segments, max_duration=10.0):
    """
    Split segments longer than max_duration into smaller sub-segments
    BEFORE alignment. This gives the alignment model shorter audio chunks
    to work with, producing much more accurate word-level timestamps.

    Split strategy:
    1. Find natural sentence boundaries (. ! ? followed by capital letter)
    2. If not enough natural splits, split at comma boundaries
    3. Last resort: split evenly by word count

    Each sub-segment gets proportional time allocation from the parent.
    """
    import re

    split_segs = []
    for seg in segments:
        seg_start = seg.get("start", 0)
        seg_end = seg.get("end", 0)
        dur = seg_end - seg_start
        text = (seg.get("text") or "").strip()

        if dur <= max_duration or not text:
            split_segs.append(seg)
            continue

        words = text.split()
        if len(words) <= 3:
            split_segs.append(seg)
            continue

        n_target_splits = max(2, int(dur / max_duration) + 1)
        target_chunk_size = max(1, len(words) // n_target_splits)

        # Find natural split points — indices where a new sub-segment should start
        # Priority 1: After sentence enders (. ! ?) where next word is capitalized
        # Priority 2: After commas with a natural break feel
        sentence_splits = []
        comma_splits = []

        for i in range(1, len(words)):
            prev = words[i - 1]
            curr = words[i]
            if re.search(r'[.!?][\'""\u2019]*$', prev):
                sentence_splits.append(i)
            elif prev.endswith(",") and len(curr) > 1:
                comma_splits.append(i)

        # Pick best split points
        def pick_splits(candidates, n_needed):
            """Pick n_needed split points from candidates, as evenly spaced as possible."""
            if len(candidates) <= n_needed:
                return candidates
            # Score each candidate by how close it is to ideal positions
            ideal_positions = [(k + 1) * len(words) // (n_needed + 1)
                               for k in range(n_needed)]
            selected = []
            used = set()
            for ideal in ideal_positions:
                best = min(candidates, key=lambda x: abs(x - ideal))
                if best not in used:
                    selected.append(best)
                    used.add(best)
            return sorted(selected)

        needed = n_target_splits - 1
        chosen_splits = pick_splits(sentence_splits, needed)

        # Not enough sentence splits? Add comma splits
        if len(chosen_splits) < needed:
            remaining = needed - len(chosen_splits)
            available_commas = [c for c in comma_splits if c not in chosen_splits]
            extra = pick_splits(available_commas, remaining)
            chosen_splits = sorted(set(chosen_splits) | set(extra))

        # Still not enough? Add evenly-spaced splits
        if len(chosen_splits) < needed:
            remaining = needed - len(chosen_splits)
            even_splits = [(k + 1) * len(words) // (remaining + 1)
                           for k in range(remaining)]
            even_splits = [e for e in even_splits
                           if e not in chosen_splits and 0 < e < len(words)]
            chosen_splits = sorted(set(chosen_splits) | set(even_splits[:remaining]))

        # Build sub-segments
        boundaries = [0] + sorted(chosen_splits) + [len(words)]
        seg_dur = seg_end - seg_start

        for j in range(len(boundaries) - 1):
            start_idx = boundaries[j]
            end_idx = boundaries[j + 1]
            chunk_words = words[start_idx:end_idx]
            if not chunk_words:
                continue

            # Proportional time allocation
            frac_start = start_idx / len(words)
            frac_end = end_idx / len(words)
            sub_start = round(seg_start + frac_start * seg_dur, 3)
            sub_end = round(seg_start + frac_end * seg_dur, 3)

            split_segs.append({
                "start": sub_start,
                "end": sub_end,
                "text": " ".join(chunk_words),
            })

        n_subs = len(boundaries) - 1
        print(f"[INFO] Split {dur:.1f}s mega-segment ({len(words)} words) "
              f"into {n_subs} sub-segments", file=sys.stderr)

    return split_segs


# ════════════════════════════════════════════════════════════════════════════
#  MAIN
# ════════════════════════════════════════════════════════════════════════════

def transcribe_one(model, audio_path, output_path, language, initial_prompt):
    """
    Transcribe a single audio file using an already-loaded stable-ts model.
    Writes a JSON result to output_path. Returns segment count on success.
    Used both by single-clip mode and by batch mode (#75: model loaded once,
    reused across all clips in a pipeline run to avoid per-clip ~5-8s of
    Python+CUDA+model-load overhead × N clips).
    """
    transcribe_kwargs = {
        "language": language,
        # Anti-hallucination: prevent Whisper from conditioning on its own
        # previous output, which causes repeated phrases (e.g. "Let's go."
        # echoed across silent/unclear sections of gaming audio)
        "condition_on_previous_text": False,
    }
    if initial_prompt:
        transcribe_kwargs["initial_prompt"] = initial_prompt

    result = model.transcribe(audio_path, **transcribe_kwargs)
    n_segs = len(result.segments) if hasattr(result, 'segments') else 0
    print(f"[INFO] Transcription complete ({audio_path}): {n_segs} segments", file=sys.stderr)

    # ── Refine word timestamps ──
    # refine() iteratively mutes audio at word boundaries and re-runs
    # inference to find precise onset/offset times. precision=0.05 gives
    # 50ms accuracy (good balance of speed vs precision)
    model.refine(audio_path, result, precision=0.05)

    # ── Convert stable-ts result to ClipFlow format ──
    segments = []
    full_text_parts = []
    for seg in result.segments:
        text = seg.text.strip()
        if not text:
            continue
        words = []
        for w in seg.words:
            word_text = w.word.strip()
            if not word_text:
                continue
            words.append({
                "word": word_text,
                "start": round(w.start, 3),
                "end": round(w.end, 3),
                "probability": round(getattr(w, 'probability', 1.0), 3),
            })
        segments.append({
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": text,
            "words": words,
        })
        full_text_parts.append(text)

    # ── Lightweight post-processing (safety net for edge cases) ──
    import wave
    with wave.open(audio_path, 'rb') as wf:
        sr = wf.getframerate()
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        n_frames = wf.getnframes()
        raw_bytes = wf.readframes(n_frames)
    if sampwidth == 2:
        audio_np = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    elif sampwidth == 4:
        audio_np = np.frombuffer(raw_bytes, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        audio_np = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    if n_channels > 1:
        audio_np = audio_np.reshape(-1, n_channels).mean(axis=1)

    segments = postprocess_timestamps(segments, audio_np, sr=sr)

    output = {"segments": segments, "text": " ".join(full_text_parts)}
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False)
    return len(segments)


def main():
    parser = argparse.ArgumentParser(description="ClipFlow stable-ts transcription bridge")
    parser.add_argument("--audio", help="Path to audio file (WAV) — single-clip mode")
    parser.add_argument("--output", help="Path to write JSON output — single-clip mode")
    parser.add_argument("--batch", help='Path to batch manifest JSON: [{"audio":"...","output":"..."}, ...]. '
                                        'Loads model once and processes all items sequentially (#75 Phase 3).')
    parser.add_argument("--model", default="large-v3-turbo", help="Whisper model name")
    parser.add_argument("--language", default="en", help="Language code")
    parser.add_argument("--batch_size", type=int, default=16, help="Batch size for inference (unused by stable-ts, kept for CLI compat)")
    parser.add_argument("--compute_type", default="float16", help="Compute type (float16, int8, etc.)")
    parser.add_argument("--hf_token", default=None, help="HuggingFace token (unused by stable-ts, kept for CLI compat)")
    parser.add_argument("--initial_prompt", default=None, help="Initial prompt to seed vocabulary hints (slang, proper nouns)")
    args = parser.parse_args()

    # Validate args: either --batch OR (--audio + --output) required.
    if args.batch:
        if not os.path.exists(args.batch):
            print(f"Error: Batch manifest not found: {args.batch}", file=sys.stderr)
            sys.exit(1)
    else:
        if not args.audio or not args.output:
            print("Error: --audio and --output are required (or use --batch <manifest>)", file=sys.stderr)
            sys.exit(1)
        if not os.path.exists(args.audio):
            print(f"Error: Audio file not found: {args.audio}", file=sys.stderr)
            sys.exit(1)

    try:
        print_progress(0, "Loading stable-ts...")
        import stable_whisper
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[INFO] Device: {device}, CUDA available: {torch.cuda.is_available()}", file=sys.stderr)

        # ── Load model ONCE (shared across batch items if --batch) ──
        print_progress(5, "Loading model...")
        model = stable_whisper.load_faster_whisper(
            args.model,
            device=device,
            compute_type=args.compute_type,
        )
        print_progress(15, "Model loaded")

        if args.batch:
            # ── Batch mode: process N items with the loaded model ──
            with open(args.batch, "r", encoding="utf-8") as f:
                items = json.load(f)
            if not isinstance(items, list) or not items:
                print(f"Error: Batch manifest is empty or invalid: {args.batch}", file=sys.stderr)
                sys.exit(1)
            n_total = len(items)
            print(f"[INFO] Batch mode: {n_total} items, model loaded once", file=sys.stderr)
            success_count = 0
            for i, item in enumerate(items):
                audio_path = item.get("audio")
                output_path = item.get("output")
                if not audio_path or not output_path:
                    print(f"[WARN] Skipping batch item {i}: missing audio/output", file=sys.stderr)
                    continue
                if not os.path.exists(audio_path):
                    print(f"[WARN] Skipping batch item {i}: audio not found: {audio_path}", file=sys.stderr)
                    continue
                # Progress: 15% (model loaded) + 0..85% across items
                pct = 15 + int(((i + 1) / n_total) * 85)
                print_progress(pct, f"Clip {i + 1}/{n_total}")
                try:
                    n_segs = transcribe_one(model, audio_path, output_path, args.language, args.initial_prompt)
                    success_count += 1
                    print(f"[INFO] Batch {i + 1}/{n_total} done: {n_segs} segments → {output_path}", file=sys.stderr)
                except Exception as e:
                    # One clip failure must NOT abort the batch — write nothing,
                    # caller detects missing output JSON and flags clip.transcriptionFailed.
                    print(f"[ERROR] Batch {i + 1}/{n_total} failed: {e}", file=sys.stderr)
                    import traceback
                    traceback.print_exc(file=sys.stderr)
            print_progress(100, "Done")
            print(json.dumps({"success": True, "completed": success_count, "total": n_total}), file=sys.stderr)
        else:
            # ── Single-clip mode (unchanged behavior) ──
            print_progress(20, "Transcribing...")
            n_segs = transcribe_one(model, args.audio, args.output, args.language, args.initial_prompt)
            print_progress(100, "Done")
            print(json.dumps({"success": True, "segments": n_segs}), file=sys.stderr)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
