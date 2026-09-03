"""Exhaustive vote search over aligner dumps.  python combo2.py <scratch> src1,src2,... [maxk]
Every subset of the sources (raw = stable-ts as transcribed) of size 1..maxk, vote = per-word
median (even count -> mean of the middle two; missing opinions drop out). Scored on all 121 clips
AND split-half: pick on half A, report on half B (and vice versa) so a winner is not a lucky fit."""
import json, sys, os, statistics as st, itertools, hashlib
S = sys.argv[1]; SRC = sys.argv[2].split(","); MAXK = int(sys.argv[3]) if len(sys.argv) > 3 else 5
TOP = int(sys.argv[4]) if len(sys.argv) > 4 else 40
RULE = sys.argv[5] if len(sys.argv) > 5 else "median"   # median | trim | gate<ms>  (gate: median only when it moves raw by > ms)
clips = {c["clipId"]: c for c in json.load(open(os.path.join(S, "approved_clips.json"), encoding="utf-8")) if c["clipTranscription"] and c["sub1"]}
def norm(w): return ''.join(ch for ch in (w or "").lower() if ch.isalnum() or ch == "'")
def words_of(segs): return sorted([w for s in segs for w in s.get("words", []) if w.get("start") is not None], key=lambda w: w["start"])
def nearest(cands, word, t, win=1.5):
    cc = [x for x in cands if norm(x["word"]) == norm(word) and abs(x["start"] - t) < win]
    return min(cc, key=lambda x: abs(x["start"] - t)) if cc else None
rows = []
for cid, c in clips.items():
    off = c["startTime"]; raw = words_of(c["clipTranscription"]["segments"])
    src = {}
    for m in SRC:
        if m == "raw": continue
        p = os.path.join(S, "align", m, cid + ".json")
        src[m] = words_of(json.load(open(p, encoding="utf-8"))["segments"]) if os.path.exists(p) else []
    half = "A" if int(hashlib.md5(cid.encode()).hexdigest(), 16) % 2 == 0 else "B"
    for seg in c["sub1"]:
        ws = seg.get("words") or []
        for j, w in enumerate(ws):
            fs = w["start"] - off; r = nearest(raw, w["word"], fs)
            if not r: continue
            row = {"fega": fs, "raw": r["start"], "d": fs - r["start"], "half": half,
                   "pos": "single" if len(ws) == 1 else "first" if j == 0 else "last" if j == len(ws) - 1 else "mid"}
            for m in src:
                x = nearest(src[m], w["word"], fs); row[m] = x["start"] if x else None
            rows.append(row)
print(f"words={len(rows)}  A={sum(r['half']=='A' for r in rows)} B={sum(r['half']=='B' for r in rows)}")
def biases(sel):
    b = {"raw": 0.0}
    for m in SRC:
        if m == "raw": continue
        xs = [r[m] - r["fega"] for r in sel if abs(r["d"]) <= .05 and r.get(m) is not None]
        b[m] = st.median(xs) if xs else 0.0
    return b
def cover(m): return sum(r.get(m) is not None for r in rows) / len(rows) if m != "raw" else 1.0
for m in SRC: print(f"  {m:14s} coverage={cover(m):5.1%}")
def vote(r, subset, b):
    xs = [r[m] - b[m] for m in subset if r.get(m) is not None]
    if not xs: return r["raw"]
    if RULE == "trim" and len(xs) >= 3:
        xs = sorted(xs)[1:-1]; return sum(xs) / len(xs)
    v = st.median(xs)
    if RULE.startswith("gate"):
        return v if abs(v - r["raw"]) > int(RULE[4:]) / 1000 else r["raw"]
    return v
def score(sel, subset, b):
    ok = 0; moved_ok = 0; moved_n = 0; unt_bad = 0; unt_n = 0
    for r in sel:
        e = vote(r, subset, b) - r["fega"]; hit = abs(e) <= .1; ok += hit
        if abs(r["d"]) > .1: moved_n += 1; moved_ok += hit
        elif abs(r["d"]) <= .05: unt_n += 1; unt_bad += (not hit)
    return ok / len(sel), moved_ok / max(1, moved_n), unt_bad / max(1, unt_n)
A = [r for r in rows if r["half"] == "A"]; B = [r for r in rows if r["half"] == "B"]
bAll, bA, bB = biases(rows), biases(A), biases(B)
subsets = [s for k in range(1, MAXK + 1) for s in itertools.combinations(SRC, k)]
res = []
for s in subsets:
    full = score(rows, s, bAll); onA = score(A, s, bA); onB = score(B, s, bB)
    res.append((s, full, onA, onB))
res.sort(key=lambda x: -x[1][0])
print(f"\n{'subset':64s} {'ALL':>6s} {'moved':>6s} {'unt-dist':>8s} | {'halfA':>6s} {'halfB':>6s}")
for s, full, a, b in res[:TOP]:
    print(f"{'+'.join(s):64s} {full[0]:6.1%} {full[1]:6.0%} {full[2]:8.1%} | {a[0]:6.1%} {b[0]:6.1%}")
bestA = max(res, key=lambda x: x[2][0]); bestB = max(res, key=lambda x: x[3][0])
print(f"\npicked on A -> {'+'.join(bestA[0])}: A={bestA[2][0]:.1%}  scores B={bestA[3][0]:.1%}")
print(f"picked on B -> {'+'.join(bestB[0])}: B={bestB[3][0]:.1%}  scores A={bestB[2][0]:.1%}")
print("\nsingle sources:")
for s, full, a, b in res:
    if len(s) == 1: print(f"  {s[0]:14s} ALL={full[0]:5.1%} moved={full[1]:4.0%} unt-dist={full[2]:5.1%}")
