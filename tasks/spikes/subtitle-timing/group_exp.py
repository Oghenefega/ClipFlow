"""
Grouping study: where do Fega's pill boundaries differ from segmentWords' output?
  python group_exp.py <scratchpad with approved_clips.json + auto_repro.json>
(auto_repro words are source-absolute like sub1 — no offset.) Aligns Fega's saved word sequence (sub1) with the chunker's word sequence (auto_repro.json)
by text, then classifies every word-to-next-word junction as agree-join / agree-split /
fega-split (Fega broke a pill the chunker kept together) / fega-merge (Fega joined words the
chunker split). Prints boundary precision/recall and the feature distributions at the
disagreements so a rule can be scored, not guessed.
"""
import json, os, sys, re, difflib, statistics as st
from collections import Counter, defaultdict
S = sys.argv[1]
clips = {c["clipId"]: c for c in json.load(open(os.path.join(S, "approved_clips.json"), encoding="utf-8"))}
auto = json.load(open(os.path.join(S, "auto_repro.json"), encoding="utf-8"))
CONN = set("i a an the that this these those to in on at for of with from by and but or so if as let's i'm i'll i've i'd we're we'll we've we'd you're you'll you've you'd they're they'll they've they'd he's he'll he'd she's she'll she'd it's it'll that's there's here's what's who's is are was were will would could should can must might shall".split())
def norm(w): return "".join(ch for ch in (w or "").lower().replace("’", "'") if ch.isalnum() or ch == "'")
def punct(w):
    w = (w or "").strip()
    if re.search(r"[.!?]['\"”]?$", w): return "."
    if re.search(r"[,;:]$", w): return ","
    return ""

junctions = []   # one per aligned word pair (word i, word i+1) present in both sequences
fega_sizes = Counter(); auto_sizes = Counter(); fega_chars = []; auto_chars = []; fega_dur = []; auto_dur = []
pill_exact = 0; pill_total = 0
for a in auto:
    c = clips[a["clipId"]]; off = c["startTime"]
    # Fega sequence
    F = []
    for pi, seg in enumerate(c["sub1"]):
        ws = seg.get("words") or []
        if not ws: continue
        fega_sizes[min(4, len(ws))] += 1; fega_chars.append(len(" ".join(w["word"] for w in ws))); fega_dur.append(seg["endSec"] - seg["startSec"])
        for wi, w in enumerate(ws):
            F.append({"t": norm(w["word"]), "raw": w["word"], "start": w["start"], "end": w["end"], "pill": pi, "last": wi == len(ws) - 1, "n": len(ws), "idx": wi})
    A = []
    for pi, seg in enumerate(a["autoSegs"]):
        ws = seg["words"]
        auto_sizes[min(4, len(ws))] += 1; auto_chars.append(len(seg["text"])); auto_dur.append(seg["endSec"] - seg["startSec"])
        for wi, w in enumerate(ws):
            A.append({"t": norm(w["word"]), "raw": w["word"], "start": w["start"], "end": w["end"], "pill": pi, "last": wi == len(ws) - 1, "n": len(ws), "idx": wi, "chars": len(seg["text"])})
    sm = difflib.SequenceMatcher(a=[w["t"] for w in F], b=[w["t"] for w in A], autojunk=False)
    pairs = []  # (fi, ai)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            pairs.extend(zip(range(i1, i2), range(j1, j2)))
    pairs = [(fi, ai) for fi, ai in pairs if abs(F[fi]["start"] - A[ai]["start"]) < 2.0]
    pmap = dict(pairs)
    # pills reproduced exactly (all words matched and same grouping)
    for pi in range(len(c["sub1"])):
        fw = [i for i, w in enumerate(F) if w["pill"] == pi]
        if not fw: continue
        if all(i in pmap for i in fw):
            pill_total += 1
            ap = {A[pmap[i]]["pill"] for i in fw}
            if len(ap) == 1 and sum(1 for w in A if w["pill"] in ap) == len(fw): pill_exact += 1
    for k in range(len(pairs) - 1):
        fi, ai = pairs[k]; fj, aj = pairs[k + 1]
        if fj != fi + 1 or aj != ai + 1: continue   # consecutive in both
        f_split = F[fi]["pill"] != F[fj]["pill"]; a_split = A[ai]["pill"] != A[aj]["pill"]
        w, nx = A[ai], A[aj]
        gap = nx["start"] - w["end"]
        # what would the merged auto pill look like / the auto pill Fega split
        junctions.append({
            "clip": a["title"], "kind": ("agree-split" if f_split and a_split else "agree-join" if not f_split and not a_split else "fega-split" if f_split else "fega-merge"),
            "w": w["raw"], "nx": nx["raw"], "gap": gap, "punct": punct(w["raw"]), "w_conn": w["t"] in CONN, "nx_conn": nx["t"] in CONN,
            "a_pill_n": w["n"], "a_idx": w["idx"], "a_chars": w["chars"], "nx_pill_n": nx["n"], "nx_chars": nx["chars"],
            "f_pill_n": F[fi]["n"], "f_idx": F[fi]["idx"], "f_nx_n": F[fj]["n"],
            "wdur": w["end"] - w["start"], "wlen": len(w["t"]), "nxlen": len(nx["t"]),
            "ctx": " ".join(x["raw"] for x in A[max(0, ai - 2): ai + 3]),
            "fctx": " | ".join(" ".join(x["raw"] for x in F if x["pill"] == p) for p in sorted({F[fi]["pill"], F[fj]["pill"]})),
        })

K = Counter(j["kind"] for j in junctions)
print(f"junctions={len(junctions)}  {dict(K)}")
tp = K["agree-split"]; fn = K["fega-split"]; fp = K["fega-merge"]
print(f"boundary precision={tp/(tp+fp):.1%} recall={tp/(tp+fn):.1%}  pills reproduced exactly {pill_exact}/{pill_total} = {pill_exact/pill_total:.1%}")
print(f"Fega pill sizes {dict(sorted(fega_sizes.items()))}  auto {dict(sorted(auto_sizes.items()))}")
print(f"Fega chars med={st.median(fega_chars)} p90={sorted(fega_chars)[int(.9*len(fega_chars))]} max={max(fega_chars)} | auto med={st.median(auto_chars)} p90={sorted(auto_chars)[int(.9*len(auto_chars))]}")
print(f"Fega pill dur med={st.median(fega_dur):.2f} p90={sorted(fega_dur)[int(.9*len(fega_dur))]:.2f} | auto med={st.median(auto_dur):.2f} p90={sorted(auto_dur)[int(.9*len(auto_dur))]:.2f}")

def rate(name, pred):
    """How often Fega splits at junctions where pred holds, vs the chunker."""
    sel = [j for j in junctions if pred(j)]
    if not sel: print(f"  {name:55s} n=0"); return
    fs = sum(1 for j in sel if j["kind"] in ("agree-split", "fega-split")); as_ = sum(1 for j in sel if j["kind"] in ("agree-split", "fega-merge"))
    print(f"  {name:55s} n={len(sel):4d}  Fega splits {fs/len(sel):5.1%}  chunker splits {as_/len(sel):5.1%}")

print("\n== split rate by feature (all junctions)")
rate("gap < 0.05", lambda j: j["gap"] < 0.05)
rate("0.05 <= gap < 0.15", lambda j: 0.05 <= j["gap"] < 0.15)
rate("0.15 <= gap < 0.3", lambda j: 0.15 <= j["gap"] < 0.3)
rate("0.3 <= gap < 0.5", lambda j: 0.3 <= j["gap"] < 0.5)
rate("0.5 <= gap < 0.7", lambda j: 0.5 <= j["gap"] < 0.7)
rate("gap >= 0.7", lambda j: j["gap"] >= 0.7)
rate("word ends with comma", lambda j: j["punct"] == ",")
rate("word ends sentence", lambda j: j["punct"] == ".")
rate("next word is connector", lambda j: j["nx_conn"])
rate("word is connector", lambda j: j["w_conn"])
rate("word is connector AND next is not", lambda j: j["w_conn"] and not j["nx_conn"])
for n in (1, 2, 3):
    rate(f"auto pill has {n} words, junction inside/after it (idx={n-1})", lambda j, n=n: j["a_pill_n"] == n and j["a_idx"] == n - 1)
rate("junction after word 1 of a 3-word auto pill", lambda j: j["a_pill_n"] == 3 and j["a_idx"] == 0)
rate("junction after word 2 of a 3-word auto pill", lambda j: j["a_pill_n"] == 3 and j["a_idx"] == 1)
rate("junction after word 1 of a 2-word auto pill", lambda j: j["a_pill_n"] == 2 and j["a_idx"] == 0)
rate("word dur > 0.5", lambda j: j["wdur"] > 0.5)
rate("word dur > 0.5 and inside a pill", lambda j: j["wdur"] > 0.5 and j["a_idx"] < j["a_pill_n"] - 1)

print("\n== fega-split (Fega broke what the chunker joined): where inside the auto pill, and why")
fs = [j for j in junctions if j["kind"] == "fega-split"]
print("  by (auto pill size, index of word before the break):", Counter((j["a_pill_n"], j["a_idx"]) for j in fs).most_common(8))
print("  by Fega's resulting pill sizes (left,right):", Counter((j["f_pill_n"], j["f_nx_n"]) for j in fs).most_common(8))
print("  gap median=%.3f  frac gap>=0.3: %.0f%%  comma: %.0f%%  next-connector: %.0f%%  word-connector: %.0f%%" % (st.median(j["gap"] for j in fs), 100 * sum(j["gap"] >= .3 for j in fs) / len(fs), 100 * sum(j["punct"] == "," for j in fs) / len(fs), 100 * sum(j["nx_conn"] for j in fs) / len(fs), 100 * sum(j["w_conn"] for j in fs) / len(fs)))
print("  word before break (top):", Counter(norm(j["w"]) for j in fs).most_common(25))
print("  word after break (top):", Counter(norm(j["nx"]) for j in fs).most_common(25))
print("  auto pill chars at these breaks: med=%d  frac>14: %.0f%%" % (st.median(j["a_chars"] for j in fs), 100 * sum(j["a_chars"] > 14 for j in fs) / len(fs)))
print("  word dur before break med=%.2f frac>0.4: %.0f%%" % (st.median(j["wdur"] for j in fs), 100 * sum(j["wdur"] > .4 for j in fs) / len(fs)))
print("\n== fega-merge (Fega joined what the chunker split)")
fm = [j for j in junctions if j["kind"] == "fega-merge"]
print("  by (auto pill size before, auto pill size after):", Counter((j["a_pill_n"], j["nx_pill_n"]) for j in fm).most_common(8))
print("  by Fega's resulting pill size:", Counter(j["f_pill_n"] for j in fm).most_common(6))
print("  gap median=%.3f  comma: %.0f%%  next-connector: %.0f%%  word-connector: %.0f%%" % (st.median(j["gap"] for j in fm), 100 * sum(j["punct"] == "," for j in fm) / len(fm), 100 * sum(j["nx_conn"] for j in fm) / len(fm), 100 * sum(j["w_conn"] for j in fm) / len(fm)))
print("  word before junction (top):", Counter(norm(j["w"]) for j in fm).most_common(20))
print("  word after junction (top):", Counter(norm(j["nx"]) for j in fm).most_common(20))
print("  merged chars (auto left + right): med=%d" % st.median(j["a_chars"] + 1 + j["nx_chars"] for j in fm))

json.dump(junctions, open(os.path.join(S, "junctions.json"), "w", encoding="utf-8"))
print("\nsample fega-split:"); [print("   ", j["ctx"], "=>", j["fctx"], f"gap={j['gap']:.2f}") for j in fs[:40]]
print("\nsample fega-merge:"); [print("   ", j["ctx"], "=>", j["fctx"], f"gap={j['gap']:.2f}") for j in fm[:30]]
