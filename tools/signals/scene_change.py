#!/usr/bin/env python3
"""FFmpeg scene-change detection — ClipFlow Lever 1, Signal 3.

Runs ffmpeg's built-in scene detection at threshold 0.4 and extracts the
timestamp of every frame that passed the threshold via the `showinfo` filter.

showinfo does NOT expose the scene-change score itself — only the pts_time
of each selected frame. We emit score=1.0 as a binary-detection placeholder.
The composite formula in signals.js uses scene_change_boost in {0, 1} based
on proximity to the energy segment's midpoint, so the numeric score is never
read. If finer-grained scoring is needed later, switch to the `scdet` filter
(v2 task).

Phase 1 (Issue #72): streams ffmpeg stderr line-by-line via Popen so each
detected scene cut serves as a heartbeat. The orchestrator's 30s stall-timer
will fire if no `Parsed_showinfo` line arrives for 30s after the startup grace
period — that's the right behavior, since long silence here means decode is
either hung or pathologically slow (Phase 2 fixes decode speed).
"""
import argparse
import json
import re
import subprocess
import sys
import time


def log(msg):
    print(msg, file=sys.stderr, flush=True)


# Heartbeat protocol v1 (Issue #72 Phase 1).
_last_progress_t = 0.0


def progress(p):
    global _last_progress_t
    now = time.time()
    if p in (0.0, 1.0) or now - _last_progress_t > 5.0:
        print(f"PROGRESS {p:.3f}", file=sys.stderr, flush=True)
        _last_progress_t = now


PTS_RE = re.compile(r"pts_time:(\d+\.?\d*)")


def get_duration_seconds(path):
    """Best-effort source duration via ffprobe. Returns 0.0 on any failure."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", path],
            capture_output=True, text=True, timeout=10,
            encoding="utf-8", errors="replace",
        )
        return float(out.stdout.strip()) if out.returncode == 0 else 0.0
    except Exception as e:
        log(f"WARN: ffprobe duration failed: {e}")
        return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--threshold", type=float, default=0.4)
    args = ap.parse_args()

    log(f"Scene detection on {args.video} (threshold={args.threshold})")
    duration = get_duration_seconds(args.video)
    log(f"Duration: {duration:.1f}s")
    progress(0.0)

    cmd = [
        "ffmpeg", "-hide_banner", "-nostdin",
        "-i", args.video,
        "-vf", f"select='gt(scene,{args.threshold})',showinfo",
        "-f", "null", "-",
    ]
    log(f"CMD: {' '.join(cmd)}")

    # Popen + line-iteration so showinfo lines drive the heartbeat in real time.
    # ffmpeg's periodic `frame= ... time=...` stats line uses \r overwrites that
    # don't reach Python via line-iteration; that's fine — showinfo is enough
    # heartbeat density for any non-pathological recording, and a 30s gap
    # between detected scenes on real ffmpeg output reliably means trouble.
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        bufsize=1,  # line-buffered
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    events = []
    try:
        for raw in proc.stderr:
            line = raw.rstrip()
            if not line:
                continue
            # Re-emit so the orchestrator's stderr-buffer logger captures the
            # full ffmpeg log in processing/logs/<videoName>.log.
            print(line, file=sys.stderr, flush=True)

            if "Parsed_showinfo" in line:
                m = PTS_RE.search(line)
                if m:
                    t = float(m.group(1))
                    events.append({"t": round(t, 3), "score": 1.0})
                    if duration > 0:
                        progress(min(0.95, t / duration))
                    else:
                        progress(0.5)
    except Exception as e:
        log(f"ERROR: stderr read failed: {e}")
        proc.kill()
        proc.wait()
        sys.exit(1)

    proc.wait()
    if proc.returncode != 0:
        log(f"ERROR: ffmpeg exit {proc.returncode}")
        sys.exit(proc.returncode)

    out = {
        "signal": "scene_change",
        "threshold": args.threshold,
        "events": events,
    }
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    progress(1.0)
    log(f"Wrote {len(events)} scene events -> {args.output}")


if __name__ == "__main__":
    main()
