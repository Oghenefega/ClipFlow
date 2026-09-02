"""
Can a junction model beat segmentWords at predicting where Fega breaks pills?
  python group_model.py <scratchpad with approved_clips.json + auto_repro.json>
Features per junction (word i -> word i+1): normalized words, POS tags (nltk), gap, punctuation,
raw word durations, chunker's own decision. Logistic regression, grouped 5-fold CV by clip.
Reports boundary precision/recall/F1 for the chunker vs the model, and the top weights so the
result can be turned into rules (or a weight table) in segmentWords.js.
"""
import json, os, sys, re, difflib, statistics as st
from collections import Counter
import numpy as np
S = sys.argv[1]
import nltk
try:
    nltk.pos_tag(["test"])
except LookupError:
    nltk.download("averaged_perceptron_tagger_eng", quiet=True)
from sklearn.linear_model import LogisticRegression
from sklearn.feature_extraction import DictVectorizer
from sklearn.model_selection import GroupKFold

clips = {c["clipId"]: c for c in json.load(open(os.path.join(S, "approved_clips.json"), encoding="utf-8"))}
auto = json.load(open(os.path.join(S, "auto_repro.json"), encoding="utf-8"))
def norm(w): return "".join(ch for ch in (w or "").lower().replace("’", "'") if ch.isalnum() or ch == "'")
def punct(w):
    w = (w or "").strip()
    if re.search(r"[.!?]['\"”]?$", w): return "."
    if re.search(r"[,;:]$", w): return ","
    return ""
INTERJ = set("oh man bro dude yo okay ok wow wait no yes yeah look god jesus goodness damn bruh nah yep nope hey woah whoa ooh ah ugh please".split())

rows = []; groups = []; y = []; chunker = []
for a in auto:
    c = clips[a["clipId"]]
    F = []
    for pi, seg in enumerate(c["sub1"]):
        for wi, w in enumerate(seg.get("words") or []):
            F.append({"t": norm(w["word"]), "start": w["start"], "pill": pi})
    A = []
    for pi, seg in enumerate(a["autoSegs"]):
        for wi, w in enumerate(seg["words"]):
            A.append({"t": norm(w["word"]), "raw": w["word"], "start": w["start"], "end": w["end"], "pill": pi, "idx": wi, "n": len(seg["words"])})
    tags = [t for _, t in nltk.pos_tag([w["raw"].strip(".,!?;:\"'") or w["raw"] for w in A])] if A else []
    sm = difflib.SequenceMatcher(a=[w["t"] for w in F], b=[w["t"] for w in A], autojunk=False)
    pairs = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal": pairs.extend(zip(range(i1, i2), range(j1, j2)))
    pairs = [(fi, ai) for fi, ai in pairs if abs(F[fi]["start"] - A[ai]["start"]) < 2.0]
    for k in range(len(pairs) - 1):
        fi, ai = pairs[k]; fj, aj = pairs[k + 1]
        if fj != fi + 1 or aj != ai + 1: continue
        w, nx = A[ai], A[aj]; gap = nx["start"] - w["end"]
        # words since the last hard wall (sentence end or gap >= 0.7) — so the model knows the partition length
        f = {
            "w=" + w["t"]: 1, "nx=" + nx["t"]: 1, "pos=" + tags[ai]: 1, "nxpos=" + tags[aj]: 1, "bigram=" + tags[ai] + ">" + tags[aj]: 1,
            "punct=" + punct(w["raw"]): 1, "nx_interj": nx["t"] in INTERJ, "w_interj": w["t"] in INTERJ,
            "gap": min(gap, 1.0), "gap>=0.15": gap >= 0.15, "gap>=0.3": gap >= 0.3, "gap>=0.5": gap >= 0.5, "gap>=0.7": gap >= 0.7,
            "wdur": min(w["end"] - w["start"], 1.0), "wlen": len(w["t"]), "nxlen": len(nx["t"]),
            "nx_caps": nx["raw"].isupper() and len(nx["t"]) > 1, "w_caps": w["raw"].isupper() and len(w["t"]) > 1,
        }
        rows.append(f); groups.append(a["clipId"]); y.append(int(F[fi]["pill"] != F[fj]["pill"])); chunker.append(int(w["pill"] != nx["pill"]))
y = np.array(y); chunker = np.array(chunker)
def prf(pred, gold):
    tp = int(((pred == 1) & (gold == 1)).sum()); fp = int(((pred == 1) & (gold == 0)).sum()); fn = int(((pred == 0) & (gold == 1)).sum())
    p = tp / (tp + fp); r = tp / (tp + fn); return p, r, 2 * p * r / (p + r)
print(f"junctions={len(y)} Fega split rate={y.mean():.1%}")
print("chunker      P=%.1f%% R=%.1f%% F1=%.1f%%" % tuple(100 * x for x in prf(chunker, y)))
vec = DictVectorizer(); X = vec.fit_transform(rows)
for name, Xm in (("model (words+pos+timing)", X),):
    pred = np.zeros_like(y); prob = np.zeros(len(y))
    for tr, te in GroupKFold(n_splits=5).split(Xm, y, groups):
        clf = LogisticRegression(C=0.5, max_iter=2000, class_weight=None).fit(Xm[tr], y[tr])
        prob[te] = clf.predict_proba(Xm[te])[:, 1]
    for thr in (0.4, 0.5, 0.6):
        print(f"{name} thr={thr}  P=%.1f%% R=%.1f%% F1=%.1f%%" % tuple(100 * x for x in prf((prob >= thr).astype(int), y)))
# without word identity (pos + timing only) — the portable version
rows2 = [{k: v for k, v in r.items() if not (k.startswith("w=") or k.startswith("nx="))} for r in rows]
vec2 = DictVectorizer(); X2 = vec2.fit_transform(rows2); prob2 = np.zeros(len(y))
for tr, te in GroupKFold(n_splits=5).split(X2, y, groups):
    prob2[te] = LogisticRegression(C=0.5, max_iter=2000).fit(X2[tr], y[tr]).predict_proba(X2[te])[:, 1]
print("model (pos+timing, no word ids) thr=0.5  P=%.1f%% R=%.1f%% F1=%.1f%%" % tuple(100 * x for x in prf((prob2 >= 0.5).astype(int), y)))
# chunker decision as a feature + corrections on top
rows3 = [dict(r, chunker=int(cv)) for r, cv in zip(rows2, chunker)]
vec3 = DictVectorizer(); X3 = vec3.fit_transform(rows3); prob3 = np.zeros(len(y))
for tr, te in GroupKFold(n_splits=5).split(X3, y, groups):
    prob3[te] = LogisticRegression(C=0.5, max_iter=2000).fit(X3[tr], y[tr]).predict_proba(X3[te])[:, 1]
print("model (chunker + pos + timing)  thr=0.5  P=%.1f%% R=%.1f%% F1=%.1f%%" % tuple(100 * x for x in prf((prob3 >= 0.5).astype(int), y)))
clf = LogisticRegression(C=0.5, max_iter=2000).fit(X3, y)
names = vec3.get_feature_names_out(); order = np.argsort(clf.coef_[0])
print("\nstrongest JOIN features:"); [print(f"  {names[i]:30s} {clf.coef_[0][i]:+.2f}") for i in order[:25]]
print("strongest SPLIT features:"); [print(f"  {names[i]:30s} {clf.coef_[0][i]:+.2f}") for i in order[::-1][:25]]
# POS bigram table: Fega split rate vs chunker split rate for common tag pairs
bg = Counter(); bgF = Counter(); bgC = Counter()
for r, yy, cc in zip(rows, y, chunker):
    k = [k for k in r if k.startswith("bigram=")][0][7:]; bg[k] += 1; bgF[k] += yy; bgC[k] += cc
print("\nPOS bigram (word>next)  n  Fega-split  chunker-split")
for k, n in bg.most_common(40):
    print(f"  {k:12s} {n:4d}  {bgF[k]/n:5.1%}  {bgC[k]/n:5.1%}")
