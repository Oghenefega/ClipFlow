"""
#483 judge scoring. Compares, on judge-manifest.json:
  confidence   the clip-finder's own confidence (what Corva already has, free)
  judge-noex   the watch-and-listen judge, rubrics only
  judge        the judge with Fega's keeps/rejects of the same kind from other recordings

Metrics: AUC (chance a random keep scores above a random reject), the share of
rejects removed at thresholds that lose at most 5% / 10% of keeps, kind accuracy,
and for published clips how close "reaction_end_t" lands to Fega's real end.
"""
import glob, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
rows = {r["key"]: r for r in json.load(open(os.path.join(HERE, "judge-manifest.json"), encoding="utf-8"))}
edit = {r["clip_id"]: r["edit"] for r in json.load(open(os.path.join(HERE, "manifest.json"), encoding="utf-8"))
        if r["set"] == "published_render"}

arms = {"confidence": {k: (r["confidence"] or 0) for k, r in rows.items()}}
judged = {}
for arm in ("judge-noex", "judge"):
    judged[arm] = {}
    for f in glob.glob(os.path.join(HERE, "judge-out", arm, "*.json")):
        d = json.load(open(f, encoding="utf-8"))
        judged[arm][d["key"]] = d
    arms[arm] = {k: d["judged"].get("keep_score") or 0 for k, d in judged[arm].items()}

common = set(rows)
for arm in ("judge-noex", "judge"):
    if judged[arm]:
        common &= set(judged[arm])


def auc(keys, score):
    pos = [score[k] for k in keys if rows[k]["decision"] == "approved"]
    neg = [score[k] for k in keys if rows[k]["decision"] == "rejected"]
    if not pos or not neg:
        return None
    return round(sum((p > n) + 0.5 * (p == n) for p in pos for n in neg) / (len(pos) * len(neg)), 3)


def at_keep_loss(keys, score, max_loss):
    pos = sorted(score[k] for k in keys if rows[k]["decision"] == "approved")
    neg = [score[k] for k in keys if rows[k]["decision"] == "rejected"]
    cut = pos[int(len(pos) * max_loss)]  # keep everything scoring >= cut
    lost = sum(p < cut for p in pos) / len(pos)
    removed = sum(n < cut for n in neg) / len(neg)
    return {"threshold": cut, "keeps_lost": round(lost, 3), "rejects_removed": round(removed, 3)}


report = {"n": len(common), "cost": {a: round(sum(d["cost"] for d in judged[a].values()), 2) for a in judged}}
for arm, score in arms.items():
    r = {"auc_all": auc(common, score)}
    for kind in ("hype", "comedy"):
        r[f"auc_{kind}"] = auc([k for k in common if rows[k]["kind"] == kind], score)
    r["at_5pct_keep_loss"] = at_keep_loss(common, score, 0.05)
    r["at_10pct_keep_loss"] = at_keep_loss(common, score, 0.10)
    r["by_game"] = {}
    for g in sorted({rows[k]["game_tag"] for k in common}):
        ks = [k for k in common if rows[k]["game_tag"] == g]
        a = auc(ks, score)
        if a is not None:
            r["by_game"][g] = {"n": len(ks), "auc": a}
    report[arm] = r

for arm in ("judge-noex", "judge"):
    js = judged[arm]
    if not js:
        continue
    want = {"hype": "hype_reaction", "comedy": "comedy"}
    report[arm]["kind_accuracy"] = round(sum(js[k]["judged"].get("kind") == want[rows[k]["kind"]] for k in common) / len(common), 3)
    # reaction end vs Fega's real end, on clips he published
    ai_err, judge_err = [], []
    for k in common:
        e = edit.get(rows[k]["clip_id"])
        t = js[k]["judged"].get("reaction_end_t")
        if not e or not isinstance(t, (int, float)) or e["sections"] < 1:
            continue
        kept_end = rows[k]["ai_end"] + e["end_moved_s"]
        ai_err.append(abs(rows[k]["ai_end"] - kept_end))
        judge_err.append(abs(rows[k]["ai_start"] + t + 1.0 - kept_end))  # +1 s: cut just after the reaction
    if ai_err:
        med = lambda xs: round(sorted(xs)[len(xs) // 2], 1)
        within2 = lambda xs: round(sum(x <= 2 for x in xs) / len(xs), 2)
        report[arm]["end"] = {"n": len(ai_err), "ai_window_median_err": med(ai_err), "judge_median_err": med(judge_err),
                              "ai_within_2s": within2(ai_err), "judge_within_2s": within2(judge_err)}

json.dump(report, open(os.path.join(HERE, "judge-score.json"), "w", encoding="utf-8"), indent=1)
print(json.dumps(report, indent=1))
