#!/usr/bin/env python3
"""
ClipFlow transcription bridge — BetterWhisperX (whisperx) wrapper.

Usage:
    python transcribe.py --audio <path> --output <path> [--model <name>] [--language <lang>]
                         [--batch_size <n>] [--compute_type <type>] [--hf_token <token>]

Outputs JSON matching ClipFlow's expected format:
    { segments: [{ start, end, text, words: [{ word, start, end, probability }] }], text: "..." }

Progress is printed to stderr as "XX%" (parseable by the existing progress handler).
Exit 0 on success, non-zero on error.
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
    1. Detect if timestamps are broken (bunched, zero-duration, out of bounds)
    2. If broken: redistribute using energy-weighted allocation
    3. If mostly OK: snap word boundaries to nearest speech onsets
    4. Enforce monotonicity and segment boundary clamping
    """
    if not words or len(words) == 0:
        return words

    seg_dur = seg_end - seg_start
    n_words = len(words)

    # ── Check if timestamps are broken ──
    is_broken = False

    # Check 1: Segment has ~0 duration
    if seg_dur < 0.05:
        is_broken = True

    # Check 2: Words bunched at the same time (>50% share a start time within 50ms)
    if not is_broken and n_words > 1:
        rounded_starts = [round(w["start"] * 20) / 20 for w in words]
        unique_count = len(set(rounded_starts))
        if unique_count / n_words < 0.5:
            is_broken = True

    # Check 3: Words don't span the segment (cover < 30%)
    if not is_broken and n_words > 1:
        w_start = min(w["start"] for w in words)
        w_end = max(w["end"] for w in words)
        coverage = (w_end - w_start) / seg_dur if seg_dur > 0 else 0
        if coverage < 0.3:
            is_broken = True

    # Check 4: Many words have zero or near-zero duration
    if not is_broken and n_words > 2:
        zero_dur_count = sum(1 for w in words if (w["end"] - w["start"]) < 0.02)
        if zero_dur_count / n_words > 0.4:
            is_broken = True

    # Check 5: Words are not monotonically increasing
    if not is_broken and n_words > 1:
        for i in range(1, n_words):
            if words[i]["start"] < words[i-1]["start"] - 0.01:
                is_broken = True
                break

    # Check 6: Mid-segment drift — words cluster in one half of the segment
    # This catches the pattern where alignment drifts in the middle but catches up
    # at the end, making other checks pass but timestamps still feel wrong.
    if not is_broken and n_words >= 4 and seg_dur > 0.5:
        # Compare where words ARE vs where they SHOULD be (uniform pacing)
        word_centers = [(w["start"] + w["end"]) / 2 for w in words]
        # Expected uniform centers
        expected_centers = [seg_start + (i + 0.5) / n_words * seg_dur for i in range(n_words)]
        # Compute mean absolute deviation from expected positions
        deviations = [abs(actual - expected) for actual, expected in zip(word_centers, expected_centers)]
        mean_deviation = sum(deviations) / len(deviations)
        # If average word is off by more than 15% of segment duration, redistribute
        if mean_deviation > seg_dur * 0.15:
            is_broken = True

    # Check 7: Words don't fill the segment — first word starts late or last word ends early
    if not is_broken and n_words >= 2 and seg_dur > 0.3:
        first_gap = words[0]["start"] - seg_start
        last_gap = seg_end - words[-1]["end"]
        # If >25% of segment is empty at start or end, words aren't spanning properly
        if first_gap > seg_dur * 0.25 or last_gap > seg_dur * 0.25:
            is_broken = True

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
#  MAIN
# ════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="ClipFlow BetterWhisperX transcription bridge")
    parser.add_argument("--audio", required=True, help="Path to audio file (WAV)")
    parser.add_argument("--output", required=True, help="Path to write JSON output")
    parser.add_argument("--model", default="large-v3-turbo", help="Whisper model name")
    parser.add_argument("--language", default="en", help="Language code")
    parser.add_argument("--batch_size", type=int, default=16, help="Batch size for inference")
    parser.add_argument("--compute_type", default="float16", help="Compute type (float16, int8, etc.)")
    parser.add_argument("--hf_token", default=None, help="HuggingFace token for wav2vec2 alignment model")
    parser.add_argument("--initial_prompt", default=None, help="Initial prompt to seed vocabulary hints (slang, proper nouns)")
    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(f"Error: Audio file not found: {args.audio}", file=sys.stderr)
        sys.exit(1)

    try:
        print_progress(0, "Loading whisperx...")
        import whisperx
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"

        # ── Step 1: Load model ──
        print_progress(5, "Loading model...")
        # initial_prompt goes into asr_options (TranscriptionOptions), not transcribe()
        asr_options = {}
        if args.initial_prompt:
            asr_options["initial_prompt"] = args.initial_prompt
        model = whisperx.load_model(
            args.model,
            device=device,
            compute_type=args.compute_type,
            language=args.language,
            asr_options=asr_options if asr_options else None,
        )

        # ── Step 2: Load audio ──
        print_progress(10, "Loading audio...")
        audio = whisperx.load_audio(args.audio)

        # ── Step 3: Transcribe ──
        print_progress(15, "Transcribing...")
        result = model.transcribe(
            audio,
            batch_size=args.batch_size,
            language=args.language,
        )
        print_progress(60, "Transcription complete")

        # ── Step 4: Align for word-level timestamps ──
        print_progress(65, "Loading alignment model...")
        align_model, align_metadata = whisperx.load_align_model(
            language_code=args.language,
            device=device,
        )

        print_progress(70, "Aligning words...")
        aligned = whisperx.align(
            result["segments"],
            align_model,
            align_metadata,
            audio,
            device,
            return_char_alignments=False,
        )
        print_progress(85, "Alignment complete")

        # ── Step 5: Format output ──
        # Merge aligned segments with unaligned ones to prevent dropouts.
        # Alignment can fail/drop segments — we keep the unaligned version
        # for any segment that got lost during alignment.
        raw_segs = result.get("segments", [])
        aligned_segs = aligned.get("segments", [])

        # Build a lookup of aligned segments by their text (approximate match)
        aligned_by_text = {}
        for seg in aligned_segs:
            text = (seg.get("text") or "").strip()
            if text:
                aligned_by_text[text] = seg

        # Merge strategy: ANCHOR segment boundaries to whisper's raw timestamps
        # (which are reliable) and take word-level data from alignment.
        # If alignment drifts (word times significantly outside segment range),
        # fall back to raw segment without word timestamps.
        DRIFT_THRESHOLD = 0.8  # seconds — if aligned words drift >0.8s from raw segment, discard alignment

        merged_segs = []
        for raw_seg in raw_segs:
            text = (raw_seg.get("text") or "").strip()
            if not text:
                continue

            raw_start = raw_seg.get("start", 0)
            raw_end = raw_seg.get("end", 0)

            if text in aligned_by_text:
                aligned_seg = aligned_by_text[text]
                aligned_words = aligned_seg.get("words", [])

                # Check for drift: do aligned words fall within raw segment boundaries?
                if aligned_words:
                    word_starts = [w.get("start", 0) for w in aligned_words if w.get("start") is not None]
                    word_ends = [w.get("end", 0) for w in aligned_words if w.get("end") is not None]

                    if word_starts and word_ends:
                        min_word_start = min(word_starts)
                        max_word_end = max(word_ends)

                        # Drift = how far words have shifted from raw segment boundaries
                        start_drift = abs(min_word_start - raw_start)
                        end_drift = abs(max_word_end - raw_end)

                        if start_drift > DRIFT_THRESHOLD or end_drift > DRIFT_THRESHOLD:
                            # Alignment drifted — use raw segment, discard alignment words
                            print(f"[WARN] Alignment drift at {raw_start:.1f}s: words shifted by {start_drift:.1f}s/{end_drift:.1f}s — using raw timestamps", file=sys.stderr)
                            merged_segs.append(raw_seg)
                            continue

                # Alignment looks OK — use aligned words but anchor to raw segment times
                merged_seg = {
                    **aligned_seg,
                    "start": raw_start,  # Anchor to whisper's segment time
                    "end": raw_end,      # Anchor to whisper's segment time
                }

                # Rescale word timestamps to fit within raw segment boundaries
                if aligned_words:
                    aw_start = aligned_seg.get("start", raw_start)
                    aw_end = aligned_seg.get("end", raw_end)
                    aw_dur = max(0.01, aw_end - aw_start)
                    raw_dur = max(0.01, raw_end - raw_start)

                    rescaled_words = []
                    has_valid_words = False
                    for w in aligned_words:
                        ws = w.get("start")
                        we = w.get("end")
                        if ws is not None and we is not None:
                            has_valid_words = True
                            # Linear rescale from aligned time range to raw time range
                            t_start = raw_start + ((ws - aw_start) / aw_dur) * raw_dur
                            t_end = raw_start + ((we - aw_start) / aw_dur) * raw_dur
                            rescaled_words.append({
                                **w,
                                "start": round(max(raw_start, min(raw_end, t_start)), 3),
                                "end": round(max(raw_start, min(raw_end, t_end)), 3),
                            })
                        else:
                            rescaled_words.append(w)

                    # Per-word validation: check if rescaled words are monotonic and
                    # don't bunch up (>50% of words with near-zero duration)
                    if has_valid_words and len(rescaled_words) > 1:
                        valid_rw = [w for w in rescaled_words if w.get("start") is not None and w.get("end") is not None]
                        if valid_rw:
                            zero_dur = sum(1 for w in valid_rw if (w["end"] - w["start"]) < 0.02)
                            if zero_dur / len(valid_rw) > 0.4:
                                # Words are bunched — alignment failed for this segment
                                # Fall back to no word timestamps (let postprocess fix it)
                                print(f"[WARN] Word timestamps bunched at {raw_start:.1f}s — discarding alignment words", file=sys.stderr)
                                merged_seg["words"] = []
                                merged_segs.append(merged_seg)
                                continue

                    merged_seg["words"] = rescaled_words

                merged_segs.append(merged_seg)
            else:
                # Alignment dropped this segment — use the raw version
                merged_segs.append(raw_seg)
                print(f"[WARN] Alignment dropped segment at {raw_start:.1f}s: {text[:60]}...", file=sys.stderr)

        # Also add any aligned segments that weren't in raw (shouldn't happen but safety).
        # Guard: skip any aligned segment that overlaps >50% with an already-merged segment —
        # this prevents sub-segments produced by alignment from duplicating content that
        # the merge loop already captured from the larger raw segment.
        raw_texts = {(s.get("text") or "").strip() for s in raw_segs}
        for seg in aligned_segs:
            text = (seg.get("text") or "").strip()
            if not text or text in raw_texts:
                continue
            seg_start = seg.get("start", 0)
            seg_end = seg.get("end", 0)
            seg_dur = max(0.01, seg_end - seg_start)
            # Check overlap against all already-merged segments
            overlaps = False
            for merged in merged_segs:
                m_start = merged.get("start", 0)
                m_end = merged.get("end", 0)
                overlap = max(0, min(seg_end, m_end) - max(seg_start, m_start))
                if overlap / seg_dur > 0.5:
                    overlaps = True
                    break
            if not overlaps:
                merged_segs.append(seg)

        # Sort by start time
        merged_segs.sort(key=lambda s: s.get("start", 0))

        n_raw = len(raw_segs)
        n_aligned = len(aligned_segs)
        n_merged = len(merged_segs)
        print(f"Segments: {n_raw} transcribed, {n_aligned} aligned, {n_merged} merged", file=sys.stderr)

        segments = []
        full_text_parts = []

        for seg in merged_segs:
            text = (seg.get("text") or "").strip()
            if not text:
                continue

            start = seg.get("start", 0)
            end = seg.get("end", 0)

            words = []
            for w in seg.get("words", []):
                word_text = (w.get("word") or "").strip()
                if not word_text:
                    continue
                words.append({
                    "word": word_text,
                    "start": w.get("start", start),
                    "end": w.get("end", end),
                    "probability": w.get("score", w.get("probability", 1.0)),
                })

            segments.append({
                "start": start,
                "end": end,
                "text": text,
                "words": words,
            })
            full_text_parts.append(text)

        # ── Step 6: Audio-aware timestamp post-processing ──
        print_progress(90, "Repairing word timestamps...")
        segments = postprocess_timestamps(segments, audio, sr=16000)
        print_progress(95, "Post-processing complete")

        output = {
            "segments": segments,
            "text": " ".join(full_text_parts),
        }

        # Write JSON output
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False)

        print_progress(100, "Done")
        print(json.dumps({"success": True, "segments": len(segments)}), file=sys.stderr)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
