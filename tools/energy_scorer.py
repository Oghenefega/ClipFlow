import subprocess
import json
import sys
import re
from pathlib import Path


def robust_normalize(values: list[float], floor_pct=0.05, ceil_pct=0.95) -> tuple[float, float]:
    """
    Returns (floor_db, ceil_db) using percentiles instead of min/max.
    This automatically ignores stream-end music, OBS alerts, one-off spikes,
    and silence — no manual intervention needed, works on any recording.
    """
    valid = sorted([v for v in values if v > -90])
    if not valid:
        return -60.0, -20.0
    floor = valid[int(len(valid) * floor_pct)]
    ceil = valid[int(len(valid) * ceil_pct)]
    return floor, ceil


def count_audio_streams(video_path: str) -> int:
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "a",
        "-show_entries", "stream=index",
        "-of", "csv=p=0",
        video_path
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        return len([l for l in result.stdout.splitlines() if l.strip()])
    except OSError:
        return 0


def get_duration(video_path: str) -> float:
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "csv=p=0",
        video_path
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        return float(result.stdout.strip())
    except (OSError, ValueError):
        return 0.0


def resolve_audio_track(video_path: str, requested: int) -> int:
    count = count_audio_streams(video_path)
    if count > 0 and requested >= count:
        print(f"  Track {requested + 1} not in this file ({count} audio stream(s)) — using track 1")
        return 0
    return requested


def get_audio_energy(video_path: str, track: int) -> list[dict]:
    print(f"Analyzing audio energy: {video_path} (audio track index {track})")

    cmd = [
        "ffmpeg",
        "-i", video_path,
        "-map", f"0:a:{track}",
        "-af", "ebur128=peak=true",
        "-f", "null",
        "-"
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    output = result.stderr + result.stdout

    pattern = re.compile(r't:\s*([\d.]+)\s+TARGET:[\s\d.-]+LUFS\s+M:\s*([\d.-]+)')
    matches = pattern.findall(output)

    if not matches:
        print("  ebur128 parse failed, falling back to astats")
        return get_audio_energy_astats(video_path, track)

    raw_values = []
    for t_str, m_str in matches:
        try:
            m = float(m_str)
            if m > -100:
                raw_values.append((float(t_str), m))
        except ValueError:
            continue

    if not raw_values:
        return []

    db_values = [v for _, v in raw_values]
    floor, ceil = robust_normalize(db_values)
    r_range = ceil - floor if ceil != floor else 1.0
    print(f"  Loudness range (5-95th pct): {floor:.1f}dB to {ceil:.1f}dB — outliers auto-excluded")

    energy_data = []
    for t, m in raw_values:
        normalized = max(0.0, min(1.0, (m - floor) / r_range)) ** 2.5
        second = int(t)
        energy_data.append({
            "second": second,
            "timestamp": format_timestamp(second),
            "energy_db": round(m, 2),
            "energy": round(normalized, 3)
        })

    # Deduplicate — keep peak per second
    by_second = {}
    for entry in energy_data:
        s = entry["second"]
        if s not in by_second or entry["energy"] > by_second[s]["energy"]:
            by_second[s] = entry

    energy_data = [by_second[s] for s in sorted(by_second.keys())]
    print(f"  Found {len(energy_data)} seconds of audio data")
    return energy_data


def get_audio_energy_astats(video_path: str, track: int) -> list[dict]:
    print("  Running astats fallback (1-second windows)...")

    cmd = [
        "ffmpeg",
        "-i", video_path,
        "-map", f"0:a:{track}",
        "-af", "asetnsamples=n=44100:p=0,astats=metadata=1:reset=44100,"
               "ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
        "-f", "null",
        "-"
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    output = result.stderr + result.stdout
    rms_values = re.findall(r'lavfi\.astats\.Overall\.RMS_level=(.+)', output)

    raw = []
    for rms_str in rms_values:
        try:
            raw.append(float(rms_str.strip()))
        except ValueError:
            raw.append(-90.0)

    if not raw:
        return []

    floor, ceil = robust_normalize(raw)
    r_range = ceil - floor if ceil != floor else 1.0
    print(f"  Loudness range (5-95th pct): {floor:.1f}dB to {ceil:.1f}dB — outliers auto-excluded")

    energy_data = []
    for i, rms in enumerate(raw):
        normalized = max(0.0, min(1.0, (rms - floor) / r_range)) ** 2.5 if rms > -90 else 0.0
        energy_data.append({
            "second": i,
            "timestamp": format_timestamp(i),
            "energy_db": round(rms, 2),
            "energy": round(normalized, 3)
        })

    print(f"  Found {len(energy_data)} seconds of audio data")
    return energy_data


def energy_label(energy: float) -> str:
    """
    Relative to YOUR loudness range — HIGH = top 25%, SILENT = bottom 20%.
    No manual calibration needed.
    """
    if energy >= 0.75:
        return "🔥 HIGH"
    elif energy >= 0.45:
        return "⚡ MED"
    elif energy >= 0.20:
        return "💤 LOW"
    else:
        return "🔇 SILENT"


def parse_whisper_transcript(transcript_path: str) -> list[dict]:
    transcript_path = Path(transcript_path)
    base = transcript_path.with_suffix("")

    for ext, parser in [(".srt", parse_srt), (".vtt", parse_vtt)]:
        candidate = base.with_suffix(ext)
        if candidate.exists():
            print(f"  Found {ext.upper()} file: {candidate}")
            return parser(str(candidate))

    print(f"  Using plain TXT: {transcript_path}")
    return parse_plain_txt(str(transcript_path))


def parse_srt(srt_path: str) -> list[dict]:
    segments = []
    with open(srt_path, 'r', encoding='utf-8') as f:
        content = f.read()

    for block in content.strip().split('\n\n'):
        lines = block.strip().split('\n')
        if len(lines) < 3:
            continue

        m = re.match(
            r'(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})',
            lines[1]
        )
        if not m:
            continue

        start_sec = int(m.group(1))*3600 + int(m.group(2))*60 + int(m.group(3)) + int(m.group(4))/1000
        end_sec   = int(m.group(5))*3600 + int(m.group(6))*60 + int(m.group(7)) + int(m.group(8))/1000

        segments.append({
            "start": start_sec,
            "end": end_sec,
            "start_timestamp": format_timestamp(int(start_sec)),
            "end_timestamp": format_timestamp(int(end_sec)),
            "text": ' '.join(lines[2:]).strip()
        })

    return segments


def parse_vtt(vtt_path: str) -> list[dict]:
    segments = []
    with open(vtt_path, 'r', encoding='utf-8') as f:
        content = f.read()

    content = re.sub(r'^WEBVTT.*?\n\n', '', content, flags=re.DOTALL)

    for block in content.strip().split('\n\n'):
        time_line = next((l for l in block.split('\n') if '-->' in l), None)
        if not time_line:
            continue

        m = re.match(
            r'(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})',
            time_line
        )
        if not m:
            continue

        start_sec = int(m.group(1))*3600 + int(m.group(2))*60 + int(m.group(3)) + int(m.group(4))/1000
        end_sec   = int(m.group(5))*3600 + int(m.group(6))*60 + int(m.group(7)) + int(m.group(8))/1000
        text_lines = [l for l in block.split('\n') if '-->' not in l and not l.isdigit() and l.strip()]

        segments.append({
            "start": start_sec,
            "end": end_sec,
            "start_timestamp": format_timestamp(int(start_sec)),
            "end_timestamp": format_timestamp(int(end_sec)),
            "text": ' '.join(text_lines).strip()
        })

    return segments


def parse_plain_txt(txt_path: str) -> list[dict]:
    with open(txt_path, 'r', encoding='utf-8') as f:
        lines = [l.strip() for l in f if l.strip()]

    segments = []
    for i in range(0, len(lines), 10):
        segments.append({
            "start": None, "end": None,
            "start_timestamp": "unknown", "end_timestamp": "unknown",
            "text": ' '.join(lines[i:i+10]),
            "note": "No timestamps — rerun whisper with --output_format srt"
        })
    return segments


def merge_energy_with_transcript(segments: list[dict], energy_data: list[dict]) -> list[dict]:
    if not energy_data:
        return segments

    merged = []
    for seg in segments:
        start, end = seg.get("start"), seg.get("end")

        if start is None or end is None:
            seg.update({"avg_energy": None, "peak_energy": None, "energy_label": "unknown"})
            merged.append(seg)
            continue

        window = [e["energy"] for e in energy_data if start <= e["second"] <= end]
        avg  = round(sum(window) / len(window), 3) if window else 0.0
        peak = round(max(window), 3) if window else 0.0

        seg.update({"avg_energy": avg, "peak_energy": peak, "energy_label": energy_label(peak)})
        merged.append(seg)

    return merged


def silent_energy_series(duration: float) -> list[dict]:
    """
    A zero-energy stand-in for a recording with no measurable audio (#62).
    Same schema as the real extractors, so everything downstream — merging,
    frame extraction, signal extraction — sees a normal (if flat) timeline
    instead of an empty one.
    """
    return [
        {
            "second": s,
            "timestamp": format_timestamp(s),
            "energy_db": -90.0,
            "energy": 0.0,
        }
        for s in range(int(duration) + 1)
    ]


def windowed_segments(energy_data: list[dict], window: int = 30) -> list[dict]:
    """
    Fixed-length pseudo-segments covering the whole recording, used when the
    transcript is empty (#62 — a silent recording transcribes to nothing).
    Text is blank; the energy merge and frame picker only need the bounds.
    """
    if not energy_data:
        return []
    total = energy_data[-1]["second"] + 1
    segments = []
    for start in range(0, total, window):
        end = min(start + window, total)
        segments.append({
            "start": float(start),
            "end": float(end),
            "start_timestamp": format_timestamp(start),
            "end_timestamp": format_timestamp(end),
            "text": "",
        })
    return segments


def format_timestamp(seconds: int) -> str:
    h, r = divmod(int(seconds), 3600)
    m, s = divmod(r, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def format_for_claude(merged_segments: list[dict]) -> str:
    lines = []
    for seg in merged_segments:
        ts = (f"[{seg['start_timestamp']} → {seg['end_timestamp']}]"
              if seg.get('start_timestamp') != 'unknown' else "[timestamp unknown]")
        lines.append(f"{ts} [energy: {seg.get('energy_label', 'unknown')}]\n{seg['text']}\n")
    return '\n'.join(lines)


def main():
    argv = sys.argv[1:]

    # --track <n>: 0-based audio stream index. Default 1 (Fega's mic track)
    # for back-compat with standalone runs; ClipFlow passes transcriptionAudioTrack.
    track = 1
    if "--track" in argv:
        i = argv.index("--track")
        try:
            track = max(0, int(argv[i + 1]))
            del argv[i:i + 2]
        except (IndexError, ValueError):
            print("Invalid --track value — expected an integer, e.g. --track 0")
            sys.exit(1)

    if len(argv) < 1:
        print("Usage: python energy_scorer.py <video_file> [transcript_file] [--track <n>]")
        print("Example: python energy_scorer.py \"W:\\recordings\\AR Day25 Pt1.mp4\" --track 1")
        print("\nAuto-detects .srt/.vtt/.txt in same folder if no transcript provided.")
        print("--track is the 0-based audio stream index (default 1).")
        sys.exit(1)

    video_path = argv[0]
    transcript_path = argv[1] if len(argv) >= 2 else None
    track = resolve_audio_track(video_path, track)

    if not transcript_path:
        base = Path(video_path).with_suffix("")
        for ext in [".srt", ".vtt", ".txt"]:
            candidate = base.with_suffix(ext)
            if candidate.exists():
                transcript_path = str(candidate)
                print(f"Auto-detected transcript: {transcript_path}")
                break

    # Step 1
    print("\n=== STEP 1: Audio Energy Analysis ===")
    energy_data = get_audio_energy(video_path, track)
    silent_source = False
    if not energy_data:
        # #62: a silent, music-only or audio-less recording is legitimate input,
        # not an error. Fall back to a flat zero-energy timeline so the pipeline
        # picks highlights from the transcript and frames instead of dying.
        duration = get_duration(video_path)
        if duration <= 0:
            print("No audio energy AND no readable duration — this file looks unplayable, not silent.")
            sys.exit(1)
        silent_source = True
        energy_data = silent_energy_series(duration)
        print(f"  No measurable audio on track {track + 1} — treating {int(duration)}s "
              f"as silent. Energy scoring is flat; highlights come from transcript + frames.")

    if silent_source:
        print("\nTop 10 energy peaks: none — every second is silent.")
    else:
        peaks = sorted(energy_data, key=lambda x: x["energy"], reverse=True)[:10]
        print("\nTop 10 energy peaks:")
        for p in peaks:
            bar = "█" * int(p["energy"] * 30)
            print(f"  {p['timestamp']} | {p['energy']:.3f} | {energy_label(p['energy'])} | {bar}")

    # Step 2 + 3
    if transcript_path:
        print(f"\n=== STEP 2: Parsing Transcript ===")
        segments = parse_whisper_transcript(transcript_path)
        print(f"  Found {len(segments)} transcript segments")

        if not segments:
            # #62: nothing was said (or nothing was heard). Cover the recording
            # in fixed windows so frame extraction still has a timeline to sort.
            segments = windowed_segments(energy_data)
            print(f"  Empty transcript — covering the recording in {len(segments)} 30s windows instead")

        print(f"\n=== STEP 3: Merging Energy + Transcript ===")
        merged = merge_energy_with_transcript(segments, energy_data)

        output_path = Path(video_path).with_suffix(".energy.json")
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(merged, f, indent=2, ensure_ascii=False)
        print(f"  Saved: {output_path}")

        claude_path = Path(video_path).with_suffix(".claude_ready.txt")
        with open(claude_path, 'w', encoding='utf-8') as f:
            f.write(format_for_claude(merged))
        print(f"  Saved: {claude_path}")

        print("\n=== PREVIEW (first 5 segments) ===")
        for seg in merged[:5]:
            print(f"[{seg['start_timestamp']} → {seg['end_timestamp']}] [{seg.get('energy_label')}]")
            print(f"  {seg['text'][:80]}")
            print()

        labels = [s.get("energy_label", "") for s in merged]
        print("=== ENERGY DISTRIBUTION ===")
        for lbl in ["🔥 HIGH", "⚡ MED", "💤 LOW", "🔇 SILENT"]:
            count = labels.count(lbl)
            pct = round(count / len(labels) * 100) if labels else 0
            print(f"  {lbl}: {count} segments ({pct}%)")
    else:
        output_path = Path(video_path).with_suffix(".energy.json")
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(energy_data, f, indent=2)
        print(f"Saved: {output_path}")

    print("\nDone.")


if __name__ == "__main__":
    main()
