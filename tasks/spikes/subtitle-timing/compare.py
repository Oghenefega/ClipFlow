"""Compare named vote sets at several tolerances + per-position breakdown.
  python compare.py <scratch> "raw+whisperx+qwen" "raw+hubert_l+vosk+parakeet" ..."""
import json, sys, os, statistics as st
S = sys.argv[1]; SETS = [s.split("+") for s in sys.argv[2:]]
SRC = sorted({m for s in SETS for m in s if m != "raw"})
clips = {c["clipId"]: c for c in json.load(open(os.path.join(S, "approved_clips.json"), encoding="utf-8")) if c["clipTranscription"] and c["sub1"]}
def norm(w): return ''.join(ch for ch in (w or "").lower() if ch.isalnum() or ch == "'")
def words_of(segs): return sorted([w for s in segs for w in s.get("words", []) if w.get("start") is not None], key=lambda w: w["start"])
def nearest(cands, word, t, win=1.5):
    cc = [x for x in cands if norm(x["word"]) == norm(word) and abs(x["start"] - t) < win]
    return min(cc, key=lambda x: abs(x["start"] - t)) if cc else None
rows = []
for cid, c in clips.items():
    off = c["startTime"]; raw = words_of(c["clipTranscription"]["segments"]); src = {}
    for m in SRC:
        p = os.path.join(S, "align", m, cid + ".json")
        src[m] = words_of(json.load(open(p, encoding="utf-8"))["segments"]) if os.path.exists(p) else []
    for seg in c["sub1"]:
        ws = seg.get("words") or []
        for j, w in enumerate(ws):
            fs = w["start"] - off; r = nearest(raw, w["word"], fs)
            if not r: continue
            row = {"fega": fs, "raw": r["start"], "d": fs - r["start"], "cid": cid,
                   "pos": "single" if len(ws) == 1 else "first" if j == 0 else "last" if j == len(ws) - 1 else "mid"}
            for m in SRC:
                x = nearest(src[m], w["word"], fs); row[m] = x["start"] if x else None
            rows.append(row)
bias = {"raw": 0.0}
for m in SRC:
    xs = [r[m] - r["fega"] for r in rows if abs(r["d"]) <= .05 and r.get(m) is not None]; bias[m] = st.median(xs) if xs else 0.0
def vote(r, subset):
    xs = [r[m] - bias[m] for m in subset if r.get(m) is not None]; return st.median(xs) if xs else r["raw"]
print(f"{'set':44s} {'<=50ms':>7s} {'<=100':>6s} {'<=150':>6s} {'<=200':>6s} {'med|e|':>7s} | single first  mid  last | clips>=90%")
for s in SETS:
    E = [(vote(r, s) - r["fega"], r) for r in rows]; ax = [abs(e) for e, _ in E]
    tol = [sum(a <= t for a in ax) / len(ax) for t in (.05, .1, .15, .2)]
    pos = {p: sum(abs(e) <= .1 for e, r in E if r["pos"] == p) / max(1, sum(r["pos"] == p for r in rows)) for p in ("single", "first", "mid", "last")}
    per = {}
    for e, r in E: per.setdefault(r["cid"], []).append(abs(e) <= .1)
    good = sum(sum(v) / len(v) >= .9 for v in per.values())
    print(f"{'+'.join(s):44s} {tol[0]:7.1%} {tol[1]:6.1%} {tol[2]:6.1%} {tol[3]:6.1%} {st.median(ax)*1000:6.0f}ms | {pos['single']:5.0%} {pos['first']:5.0%} {pos['mid']:4.0%} {pos['last']:5.0%} | {good}/{len(per)}")
