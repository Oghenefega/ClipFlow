"""
#484 humor study: turn out/*.json watches + manifest.json into numbers.
Prints a report and writes analysis.json. Read-only.

Performance score = mean per-platform percentile of views among published clips
(YouTube, Instagram, Facebook; TikTok has no read scope, #388). Clips whose first
metrics day is under 7 days before the run are left out of performance cuts.
"""
import json, os, glob, statistics as st
from collections import Counter, defaultdict
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
manifest = {r["key"]: r for r in json.load(open(os.path.join(HERE, "manifest.json"), encoding="utf-8"))}
rows = []
for f in glob.glob(os.path.join(HERE, "out", "*.json")):
    d = json.load(open(f, encoding="utf-8"))
    m = manifest[d["key"]]
    rows.append({**m, "w": d["watch"], "game_tag": (m["game_tag"] or "?").upper()})

by_set = defaultdict(list)
for r in rows:
    by_set[r["set"]].append(r)

# ── performance percentile ──
pubs = by_set["published_render"]
cutoff = date(2026, 10, 1).toordinal() - 7
for plat in ("youtube", "instagram", "facebook"):
    vals = sorted(r["views"][plat]["views"] or 0 for r in pubs if plat in r["views"])
    for r in pubs:
        if plat in r["views"]:
            v = r["views"][plat]["views"] or 0
            r.setdefault("pct", []).append(sum(1 for x in vals if x < v) / max(1, len(vals) - 1))
for r in pubs:
    day = r.get("first_metrics_day")
    old_enough = bool(day) and date.fromisoformat(day[:10]).toordinal() <= cutoff
    r["perf"] = st.mean(r["pct"]) if r.get("pct") and old_enough else None


def dur(r):
    return r["edit"]["kept_seconds"] if r["set"] == "published_render" else r["ai_end"] - r["ai_start"]


def share(rs, field, multi=False):
    c = Counter()
    for r in rs:
        v = r["w"].get(field)
        for x in (v if multi else [v]) if v is not None else []:
            c[str(x)] += 1
    n = max(1, len(rs))
    return {k: round(v / n, 3) for k, v in c.most_common()}


def med(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return round(st.median(xs), 2) if xs else None


def profile(rs):
    return {
        "n": len(rs),
        "format": share(rs, "format"),
        "author": share(rs, "author"),
        "mechanisms": share(rs, "mechanisms", True),
        "delivery": share(rs, "delivery", True),
        "opens_with": share(rs, "opens_with"),
        "ends_with": share(rs, "ends_with"),
        "other_voices": share(rs, "other_voices"),
        "edit_traces": share(rs, "edit_traces", True),
        "needs_context": round(sum(1 for r in rs if r["w"].get("needs_context")) / max(1, len(rs)), 3),
        "no_payoff": round(sum(1 for r in rs if r["w"].get("payoff_t") is None) / max(1, len(rs)), 3),
        "stranger_funny_median": med([r["w"].get("stranger_funny_1to10") for r in rs]),
        "duration_median": med([dur(r) for r in rs]),
        "payoff_t_median": med([r["w"].get("payoff_t") for r in rs]),
        "hook_t_median": med([r["w"].get("hook_t") for r in rs]),
        "after_payoff_median": med([dur(r) - r["w"]["payoff_t"] for r in rs if isinstance(r["w"].get("payoff_t"), (int, float))]),
        "payoff_position_median": med([r["w"]["payoff_t"] / dur(r) for r in rs if isinstance(r["w"].get("payoff_t"), (int, float)) and dur(r) > 0]),
    }


def auc(pos, neg):
    """P(random keep scores above random reject), ties half."""
    if not pos or not neg:
        return None
    wins = sum((p > n) + 0.5 * (p == n) for p in pos for n in neg)
    return round(wins / (len(pos) * len(neg)), 3)


report = {}
report["published_render"] = profile(pubs)
report["published_raw"] = profile(by_set["published_raw"])
report["rejected_raw"] = profile(by_set["rejected_raw"])
report["published_by_game"] = {g: profile([r for r in pubs if r["game_tag"] == g])
                               for g, n in Counter(r["game_tag"] for r in pubs).most_common() if n >= 10}

# keep vs reject separability on raw windows
keep_sf = [r["w"].get("stranger_funny_1to10") or 0 for r in by_set["published_raw"]]
rej_sf = [r["w"].get("stranger_funny_1to10") or 0 for r in by_set["rejected_raw"]]
report["keep_vs_reject_auc_stranger_funny"] = auc(keep_sf, rej_sf)
report["rejected_by_reason"] = {}
for reason in sorted({x for r in by_set["rejected_raw"] for x in r["reject_reasons"]}):
    rs = [r for r in by_set["rejected_raw"] if reason in r["reject_reasons"]]
    report["rejected_by_reason"][reason] = {"n": len(rs), "stranger_funny_median": med([r["w"].get("stranger_funny_1to10") for r in rs]),
                                            "mechanisms": share(rs, "mechanisms", True)}

# performance: top vs bottom quartile
perf = sorted([r for r in pubs if r["perf"] is not None], key=lambda r: r["perf"])
q = len(perf) // 4
report["perf_n"] = len(perf)
report["perf_top_quartile"] = profile(perf[-q:])
report["perf_bottom_quartile"] = profile(perf[:q])
report["perf_top_titles"] = [(round(r["perf"], 2), r["game_tag"], r["title"], r["w"].get("key_line")) for r in perf[-15:][::-1]]
report["perf_bottom_titles"] = [(round(r["perf"], 2), r["game_tag"], r["title"], r["w"].get("key_line")) for r in perf[:10]]


def spearman(xs, ys):
    def rank(v):
        o = sorted(range(len(v)), key=lambda i: v[i])
        r = [0] * len(v)
        for pos, i in enumerate(o):
            r[i] = pos
        return r
    rx, ry = rank(xs), rank(ys)
    return round(st.correlation(rx, ry), 3) if len(xs) > 2 else None


pp = [r for r in perf if isinstance(r["w"].get("stranger_funny_1to10"), (int, float))]
report["perf_vs_stranger_funny_spearman"] = spearman([r["w"]["stranger_funny_1to10"] for r in pp], [r["perf"] for r in pp])
report["perf_vs_duration_spearman"] = spearman([dur(r) for r in perf], [r["perf"] for r in perf])
report["perf_by_mechanism"] = {}
for mech in {m for r in perf for m in r["w"].get("mechanisms") or []}:
    rs = [r["perf"] for r in perf if mech in (r["w"].get("mechanisms") or [])]
    if len(rs) >= 8:
        report["perf_by_mechanism"][mech] = {"n": len(rs), "median_perf": med(rs)}
report["perf_by_game"] = {g: {"n": len(v), "median_perf": med(v)} for g, v in
                          ((g, [r["perf"] for r in perf if r["game_tag"] == g]) for g in {r["game_tag"] for r in perf}) if len(v) >= 5}

# ── the edit: what Fega changed on the raw window ──
ed = [r["edit"] for r in pubs]
report["edit"] = {
    "n": len(ed),
    "ai_seconds_median": med([e["ai_seconds"] for e in ed]),
    "kept_seconds_median": med([e["kept_seconds"] for e in ed]),
    "shorter_than_ai": round(sum(e["kept_seconds"] < e["ai_seconds"] - 0.5 for e in ed) / len(ed), 3),
    "longer_than_ai": round(sum(e["kept_seconds"] > e["ai_seconds"] + 0.5 for e in ed) / len(ed), 3),
    "start_moved_median": med([e["start_moved_s"] for e in ed]),
    "end_moved_median": med([e["end_moved_s"] for e in ed]),
    "start_later": round(sum(e["start_moved_s"] > 0.5 for e in ed) / len(ed), 3),
    "start_earlier": round(sum(e["start_moved_s"] < -0.5 for e in ed) / len(ed), 3),
    "end_earlier": round(sum(e["end_moved_s"] < -0.5 for e in ed) / len(ed), 3),
    "end_later": round(sum(e["end_moved_s"] > 0.5 for e in ed) / len(ed), 3),
    "multi_section": round(sum(e["sections"] > 1 for e in ed) / len(ed), 3),
    "sections_median_when_cut": med([e["sections"] for e in ed if e["sections"] > 1]),
    "with_sounds": round(sum(e["sounds"] > 0 for e in ed) / len(ed), 3),
    "with_overlays": round(sum(e["overlays"] > 0 for e in ed) / len(ed), 3),
}
# Timing around the payoff, from the raw watch of the same clip: where Fega's kept
# window sits relative to the moment the payoff lands.
lead, tail = [], []
for r in by_set["published_raw"]:
    p = r["w"].get("payoff_t")
    if not isinstance(p, (int, float)):
        continue
    payoff_abs = r["ai_start"] + p
    kept_start = r["ai_start"] + r["edit"]["start_moved_s"]
    kept_end = r["ai_end"] + r["edit"]["end_moved_s"]
    lead.append(payoff_abs - kept_start)
    tail.append(kept_end - payoff_abs)
report["edit"]["raw_payoff_lead_in_median"] = med(lead)
report["edit"]["raw_payoff_tail_median"] = med(tail)
report["edit"]["ai_lead_in_median"] = med([r["w"]["payoff_t"] for r in by_set["published_raw"] if isinstance(r["w"].get("payoff_t"), (int, float))])
report["edit"]["ai_tail_median"] = med([(r["ai_end"] - r["ai_start"]) - r["w"]["payoff_t"] for r in by_set["published_raw"] if isinstance(r["w"].get("payoff_t"), (int, float))])

json.dump(report, open(os.path.join(HERE, "analysis.json"), "w", encoding="utf-8"), indent=1)
print(json.dumps(report, indent=1)[:20000])
