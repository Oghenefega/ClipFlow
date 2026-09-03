"""
Score tools/word_timing.refine_word_timing against Fega's saved subtitles on every approved
clip, through the real production function. Run in the engine venv (PYTHONIOENCODING=utf-8):
  python score_production.py <scratchpad with approved_clips.json + audio/> [mode]
mode = which voters to enable: "median" (all three: hubert+vosk+parakeet, the shipped set),
"snap" (none), or any '+'-joined subset of hubert / vosk / parakeet (ladder rows).
DUMP=1 writes refined/<mode>/<clipId>.json.
Metric: word start within 100 ms of Fega's final; "moved" = Fega changed raw by >100 ms
either way, "untouched" = within 50 ms of raw.
"""
import json, os, sys, wave, statistics as st, time
import numpy as np
S = sys.argv[1]; mode = sys.argv[2] if len(sys.argv) > 2 else "median"
voters = {"hubert", "vosk", "parakeet"} if mode == "median" else set() if mode == "snap" else set(mode.split("+"))
assert voters <= {"hubert", "vosk", "parakeet"}, mode
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "tools"))
from word_timing import refine_word_timing
import torch
dev = "cuda" if torch.cuda.is_available() else "cpu"
def norm(w): return "".join(ch for ch in (w or "").lower() if ch.isalnum() or ch == "'")
clips = [c for c in json.load(open(os.path.join(S, "approved_clips.json"), encoding="utf-8")) if c["clipTranscription"] and c["sub1"]]
err = {"firstMoved": [], "firstUntouched": [], "otherMoved": [], "otherUntouched": [], "all": []}
tot_stats = {}; methods = {}; t0 = time.time()
for c in clips:
    wav = os.path.join(S, "audio", c["clipId"] + ".wav")
    with wave.open(wav, "rb") as wf:
        sr = wf.getframerate(); a = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    raw_segs = json.loads(json.dumps(c["clipTranscription"]["segments"]))
    new_segs, stats = refine_word_timing(raw_segs, a, sr, device=dev, use_whisperx="hubert" in voters,
                                         use_vosk="vosk" in voters, use_parakeet="parakeet" in voters)
    methods[stats.get("method")] = methods.get(stats.get("method"), 0) + 1
    if os.environ.get("DUMP"):
        os.makedirs(os.path.join(S, "refined", mode), exist_ok=True); json.dump({"segments": new_segs}, open(os.path.join(S, "refined", mode, c["clipId"] + ".json"), "w", encoding="utf-8"))
    for k, v in stats.items():
        if isinstance(v, int): tot_stats[k] = tot_stats.get(k, 0) + v
    raw = sorted([w for s in c["clipTranscription"]["segments"] for w in s.get("words", [])], key=lambda w: w["start"])
    new = sorted([w for s in new_segs for w in s.get("words", [])], key=lambda w: w["start"])
    off = c["startTime"]
    def nearest(cands, word, t):
        cc = [x for x in cands if norm(x["word"]) == norm(word) and abs(x["start"] - t) < 1.5]
        return min(cc, key=lambda x: abs(x["start"] - t)) if cc else None
    for seg in c["sub1"]:
        ws = seg.get("words") or []
        for j, w in enumerate(ws):
            fs = w["start"] - off
            r = nearest(raw, w["word"], fs)
            if not r: continue
            n = nearest(new, w["word"], fs) or r
            d = fs - r["start"]; e = n["start"] - fs
            err["all"].append(e)
            grp = "Moved" if abs(d) > 0.1 else ("Untouched" if abs(d) <= 0.05 else None)
            if grp: err[("first" if j == 0 else "other") + grp].append(e)
def f(xs):
    ax = [abs(x) for x in xs]; return f"n={len(xs):4d} <=100ms={sum(1 for x in ax if x <= 0.1) / len(xs):5.1%} >100ms={sum(1 for x in ax if x > 0.1) / len(xs):5.1%}"
print(f"mode={mode} clips={len(clips)} {time.time() - t0:.0f}s methods={methods} stats={tot_stats}")
for k in err: print(f"  {k:15s} {f(err[k])}")
