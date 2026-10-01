"""
#483 cell 2 scoring: 100T, single-clip vs whole-recording judge (rubric v2),
against detection confidence and the cell-1 rubric-only judge (on the clips it saw).

  auc            chance a random keep outscores a random reject (all 100T clips pooled)
  auc_within     mean AUC inside each recording (what matters for ranking one stream's list)
  top_k          per recording, show only as many clips as Fega kept: share that are keeps
  at_10pct       rejects pushed below the line when at most 10% of keeps fall below it
"""
import glob, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
recs = {}
for mode in ("single", "stream"):
    for f in glob.glob(os.path.join(HERE, "stream-out", mode, "*.json")):
        d = json.load(open(f, encoding="utf-8"))
        r = recs.setdefault(d["projectId"], {"name": d["name"], "clips": {}})
        for c in d["clips"]:
            row = r["clips"].setdefault(c["clipId"], {"decision": c["decision"], "confidence": c["confidence"] or 0})
            row[mode] = (c["judged"] or {}).get("keep_score")
old = {}
for f in glob.glob(os.path.join(HERE, "judge-out", "judge-noex", "*.json")):
    d = json.load(open(f, encoding="utf-8"))
    old[d["key"][2:]] = d["judged"].get("keep_score") or 0

# only recordings judged in both modes, clips scored in both
clips = {}
for pid, r in recs.items():
    for cid, c in r["clips"].items():
        if c.get("single") is not None and c.get("stream") is not None:
            clips[cid] = {**c, "pid": pid}


def ranks(score):
    order = sorted(clips, key=lambda k: score[k])
    out, i = {}, 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and score[order[j + 1]] == score[order[i]]:
            j += 1
        for t in range(i, j + 1):
            out[order[t]] = (i + j) / 2
        i = j + 1
    return out


scores = {
    "confidence": {k: c["confidence"] for k, c in clips.items()},
    "single_v2": {k: c["single"] for k, c in clips.items()},
    "stream_v2": {k: c["stream"] for k, c in clips.items()},
}
rc = ranks(scores["confidence"])
for name in ("single_v2", "stream_v2"):
    rj = ranks(scores[name])
    scores[f"confidence+{name}"] = {k: rc[k] + rj[k] for k in clips}


def auc(keys, s):
    pos = [s[k] for k in keys if clips[k]["decision"] == "approved"]
    neg = [s[k] for k in keys if clips[k]["decision"] == "rejected"]
    if not pos or not neg:
        return None
    return sum((p > n) + 0.5 * (p == n) for p in pos for n in neg) / (len(pos) * len(neg))


def top_k(s):
    hit = total = 0
    for pid in {c["pid"] for c in clips.values()}:
        ks = [k for k in clips if clips[k]["pid"] == pid]
        n = sum(clips[k]["decision"] == "approved" for k in ks)
        best = sorted(ks, key=lambda k: -s[k])[:n]
        hit += sum(clips[k]["decision"] == "approved" for k in best)
        total += n
    return f"{hit}/{total}"


def at_loss(s, loss=0.10):
    pos = sorted(s[k] for k in clips if clips[k]["decision"] == "approved")
    neg = [s[k] for k in clips if clips[k]["decision"] == "rejected"]
    cut = pos[int(len(pos) * loss)]
    return {"keeps_lost": round(sum(p < cut for p in pos) / len(pos), 3), "rejects_removed": round(sum(n < cut for n in neg) / len(neg), 3)}


pids = {c["pid"] for c in clips.values()}
report = {"clips": len(clips), "keeps": sum(c["decision"] == "approved" for c in clips.values()), "recordings": len(pids),
          "cost": {m: round(sum(json.load(open(f, encoding="utf-8"))["cost"] for f in glob.glob(os.path.join(HERE, "stream-out", m, "*.json"))), 2) for m in ("single", "stream")}}
for name, s in scores.items():
    within = [a for a in (auc([k for k in clips if clips[k]["pid"] == pid], s) for pid in pids) if a is not None]
    report[name] = {"auc": round(auc(list(clips), s), 3), "auc_within": round(sum(within) / len(within), 3),
                    "top_k": top_k(s), "at_10pct": at_loss(s)}

# head to head with cell 1 on the clips both saw
both = [k for k in clips if k in old]
if both:
    o = {k: old[k] for k in both}
    sub = lambda s: {k: s[k] for k in both}
    def auc_sub(s):
        pos = [s[k] for k in both if clips[k]["decision"] == "approved"]
        neg = [s[k] for k in both if clips[k]["decision"] == "rejected"]
        return round(sum((p > n) + 0.5 * (p == n) for p in pos for n in neg) / (len(pos) * len(neg)), 3)
    report["vs_cell1_on_shared"] = {"n": len(both), "cell1_rubric_only": auc_sub(o), "confidence": auc_sub(sub(scores["confidence"])),
                                    "single_v2": auc_sub(sub(scores["single_v2"])), "stream_v2": auc_sub(sub(scores["stream_v2"]))}

json.dump(report, open(os.path.join(HERE, "stream-score.json"), "w", encoding="utf-8"), indent=1)
print(json.dumps(report, indent=1))
