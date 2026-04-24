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
"""
import argparse
import json
import re
import subprocess
import sys


def log(msg):
    print(msg, file=sys.stderr, flush=True)


PTS_RE = re.compile(r"pts_time:(\d+\.?\d*)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--threshold", type=float, default=0.4)
    args = ap.parse_args()

    log(f"Scene detection on {args.video} (threshold={args.threshold})")
    cmd = [
        "ffmpeg", "-hide_banner", "-nostdin",
        "-i", args.video,
        "-vf", f"select='gt(scene,{args.threshold})',showinfo",
        "-f", "null", "-",
    ]
    log(f"CMD: {' '.join(cmd)}")

    # ffmpeg writes its log output to stderr even on success. Exit code is 0 on success.
    proc = subprocess.run(
        cmd, capture_output=True, text=True,
        encoding="utf-8", errors="replace",
    )
    if proc.returncode != 0:
        log(f"ERROR: ffmpeg exit {proc.returncode}")
        log(proc.stderr[-2000:])
        sys.exit(proc.returncode)

    events = []
    for line in proc.stderr.splitlines():
        if "Parsed_showinfo" in line:
            m = PTS_RE.search(line)
            if m:
                events.append({"t": round(float(m.group(1)), 3), "score": 1.0})

    out = {
        "signal": "scene_change",
        "threshold": args.threshold,
        "events": events,
    }
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    log(f"Wrote {len(events)} scene events -> {args.output}")


if __name__ == "__main__":
    main()
