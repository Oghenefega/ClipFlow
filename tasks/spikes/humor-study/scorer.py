"""
#483 cell 3: Fega's personal scorer, trained on his own keep/reject decisions.

Run with the transcription venv (has numpy + scikit-learn):
  D:\\whisper\\betterwhisperx-venv\\Scripts\\python.exe scorer.py

Features per candidate (all already produced by Corva, plus judge v3):
  confidence      clip-finder confidence
  judge_*         judge v3 keep_score, play_quality (hype), reaction_size
  sig_*           max score inside the AI window per event-timeline signal
  mic_* / game_*  max YAMNet probability per sound group (mic track, game track)
  kind, duration

Validation: leave one RECORDING out (train on all other recordings, score the
held-out one), so nothing from the same stream leaks into its own score.
Arc Raiders rows get weight 0.3 (early-Corva decisions, Fega has moved on).

Second target: views. Published clips only, per-platform percentile WITHIN kind
(100T views are inflated by the team's fanbase), clips under 7 days excluded.
"""
import glob, json, os
from datetime import date
import numpy as np
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import roc_auc_score
from scipy.stats import spearmanr

HERE = os.path.dirname(os.path.abspath(__file__))
SIG = os.path.join(os.environ["APPDATA"], "Corva", "processing", "signals")
SIGNALS = ["energy", "pitch_spike", "reaction_words", "transcript_density", "silence_spike", "yamnet", "game_energy", "game_yamnet"]
MIC_GROUPS = {"laugh": ["Laughter", "Giggle", "Chuckle, chortle"], "scream": ["Screaming", "Shout", "Yell", "Whoop"],
              "cheer": ["Cheering", "Applause"], "gasp": ["Gasp", "Sigh", "Groan"]}
GAME_GROUPS = {"shots": ["Gunshot, gunfire", "Explosion"], "crowd": ["Crowd", "Cheering", "Applause"], "speech": ["Speech"]}

rows = json.load(open(os.path.join(HERE, "scorer-manifest.json"), encoding="utf-8"))
judged = {}
for f in glob.glob(os.path.join(HERE, "judge-out", "v3", "*.json")):
    d = json.load(open(f, encoding="utf-8"))
    judged[d["key"]] = d["judged"]
rows = [r for r in rows if r["key"] in judged]

cache = {}
def load(base, kind):
    k = (base, kind)
    if k not in cache:
        p = os.path.join(SIG, f"{base}.{kind}.json")
        cache[k] = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None
    return cache[k]

def overlaps(a0, a1, b0, b1):
    return a0 < b1 and b0 < a1

def features(r):
    j = judged[r["key"]]
    s, e = r["ai_start"], r["ai_end"]
    f = {
        "confidence": r["confidence"] or 0,
        "judge_keep": j.get("keep_score") or 0,
        "judge_play": j.get("play_quality") or 0,
        "judge_reaction": j.get("reaction_size") or 0,
        "kind_hype": 1 if r["kind"] == "hype" else 0,
        "duration": e - s,
    }
    tl = load(r["signal_base"], "event_timeline") or {"events": []}
    for sig in SIGNALS:
        sc = [ev["score"] for ev in tl["events"] if ev["signal"] == sig and overlaps(ev["t_start"], ev["t_end"], s, e)]
        f[f"sig_{sig}"] = max(sc) if sc else 0
    for name, groups, kind in (("mic", MIC_GROUPS, "yamnet"), ("game", GAME_GROUPS, "game_yamnet")):
        y = load(r["signal_base"], kind)
        frames = [fr for fr in (y or {}).get("frames", []) if overlaps(fr["t_start"], fr["t_end"], s, e)]
        for g, classes in groups.items():
            f[f"{name}_{g}"] = max([fr["scores"].get(c, 0) for fr in frames for c in classes] or [0])
    return f

F = [features(r) for r in rows]
names = list(F[0].keys())
X = np.array([[f[n] for n in names] for f in F], dtype=float)
y = np.array([1 if r["decision"] == "approved" else 0 for r in rows])
groups = np.array([r["project_id"] for r in rows])
kind = np.array([r["kind"] for r in rows])
w = np.array([0.3 if r["game_tag"] == "AR" else 1.0 for r in rows])

def loro(make, cols, mask=None):
    """Leave-one-recording-out predictions for rows in mask."""
    idx = np.arange(len(rows)) if mask is None else np.where(mask)[0]
    pred = np.full(len(rows), np.nan)
    ci = [names.index(c) for c in cols]
    for g in np.unique(groups[idx]):
        test = idx[groups[idx] == g]
        train = idx[groups[idx] != g]
        if len(np.unique(y[train])) < 2:
            continue
        m = make()
        try:
            m.fit(X[np.ix_(train, ci)], y[train], **({"logisticregression__sample_weight": w[train]} if hasattr(m, "steps") else {"sample_weight": w[train]}))
        except TypeError:
            m.fit(X[np.ix_(train, ci)], y[train])
        pred[test] = m.predict_proba(X[np.ix_(test, ci)])[:, 1]
    return pred

def report(name, score, mask=None):
    m = ~np.isnan(score) if mask is None else (~np.isnan(score) & mask)
    out = {"auc": round(roc_auc_score(y[m], score[m], sample_weight=w[m]), 3)}
    for k in ("hype", "comedy"):
        mk = m & (kind == k)
        out[f"auc_{k}"] = round(roc_auc_score(y[mk], score[mk]), 3) if len(np.unique(y[mk])) == 2 else None
    # top-k inside each recording: show as many as Fega kept
    hit = tot = 0
    for g in np.unique(groups[m]):
        ii = np.where(m & (groups == g))[0]
        n = int(y[ii].sum())
        if n == 0:
            continue
        top = ii[np.argsort(-score[ii])[:n]]
        hit += int(y[top].sum()); tot += n
    out["top_k"] = f"{hit}/{tot}"
    pos = np.sort(score[m & (y == 1)])
    cut = pos[int(len(pos) * 0.10)]
    out["rejects_removed_at_10pct_keeps_lost"] = round(float((score[m & (y == 0)] < cut).mean()), 3)
    print(f"{name:34} {out}")
    return out

def rank(v):
    from scipy.stats import rankdata
    return rankdata(v) / len(v)

lr = lambda: make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=2000))
gb = lambda: HistGradientBoostingClassifier(max_depth=3, max_iter=150, learning_rate=0.05, min_samples_leaf=20)
JUDGE = ["judge_keep", "judge_play", "judge_reaction"]
SIGS = [n for n in names if n.startswith(("sig_", "mic_", "game_"))]

res = {"n": len(rows), "keeps": int(y.sum()), "recordings": len(np.unique(groups)), "features": names}
print(f"{len(rows)} clips, {int(y.sum())} keeps, {len(np.unique(groups))} recordings\n")
res["confidence"] = report("confidence (today)", X[:, names.index("confidence")])
res["judge_v3"] = report("judge v3 keep_score", X[:, names.index("judge_keep")])
hand = np.where(kind == "hype", rank(X[:, names.index("judge_keep")]),
                rank(X[:, names.index("judge_keep")]) + rank(X[:, names.index("confidence")]))
res["hand_routed"] = report("hand: hype=judge, comedy=judge+conf", hand)
res["signals_only_lr"] = report("learned: signals only (LR)", loro(lr, SIGS + ["kind_hype", "duration"]))
res["conf_judge_lr"] = report("learned: conf+judge (LR)", loro(lr, ["confidence", "kind_hype"] + JUDGE))
res["all_lr"] = report("learned: everything (LR)", loro(lr, names))
res["all_gb"] = report("learned: everything (boosted trees)", loro(gb, names))
per_kind = np.full(len(rows), np.nan)
for k in ("hype", "comedy"):
    p = loro(lr, [n for n in names if n != "kind_hype"], kind == k)
    per_kind[kind == k] = p[kind == k]
res["all_lr_per_kind"] = report("learned: everything, one model per kind", per_kind)

# what the learned model leans on (fit on everything, standardized coefficients)
m = lr().fit(X, y, logisticregression__sample_weight=w)
coef = dict(zip(names, m.named_steps["logisticregression"].coef_[0]))
res["weights"] = {k: round(v, 2) for k, v in sorted(coef.items(), key=lambda kv: -abs(kv[1]))}
print("\nweights (standardized, + = keep):", res["weights"])

# ── views ──
cutoff = date(2026, 10, 1).toordinal() - 7
pub = [i for i, r in enumerate(rows) if r["views"] and r["first_metrics_day"]
       and date.fromisoformat(r["first_metrics_day"][:10]).toordinal() <= cutoff]
perf = {}
for k in ("hype", "comedy"):
    ii = [i for i in pub if rows[i]["kind"] == k]
    for plat in ("youtube", "instagram", "facebook"):
        vals = sorted(rows[i]["views"][plat] for i in ii if plat in rows[i]["views"])
        for i in ii:
            if plat in rows[i]["views"]:
                v = rows[i]["views"][plat]
                perf.setdefault(i, []).append(sum(x < v for x in vals) / max(1, len(vals) - 1))
perf = {i: float(np.mean(v)) for i, v in perf.items()}
res["views"] = {"n": len(perf)}
print(f"\nVIEWS (published, >=7 days, percentile within kind): n={len(perf)}")
for k in ("hype", "comedy"):
    ii = [i for i in perf if rows[i]["kind"] == k]
    corr = {}
    for n in names:
        if n == "kind_hype":
            continue
        rho = spearmanr([X[i, names.index(n)] for i in ii], [perf[i] for i in ii]).statistic
        if not np.isnan(rho):
            corr[n] = round(float(rho), 2)
    corr = dict(sorted(corr.items(), key=lambda kv: -abs(kv[1])))
    res["views"][k] = {"n": len(ii), "spearman": corr}
    print(k, len(ii), list(corr.items())[:8])
# does a learned views model beat chance? leave-one-recording-out ridge, within kind
for k in ("hype", "comedy"):
    ii = np.array([i for i in perf if rows[i]["kind"] == k])
    pv = np.array([perf[i] for i in ii])
    pred = np.full(len(ii), np.nan)
    cols = [names.index(n) for n in names if n != "kind_hype"]
    for g in np.unique(groups[ii]):
        te = groups[ii] == g
        if te.all():
            continue
        mdl = make_pipeline(StandardScaler(), Ridge(alpha=10)).fit(X[np.ix_(ii[~te], cols)], pv[~te])
        pred[te] = mdl.predict(X[np.ix_(ii[te], cols)])
    ok = ~np.isnan(pred)
    rho = spearmanr(pred[ok], pv[ok]).statistic
    res["views"][k]["learned_spearman_loro"] = round(float(rho), 3)
    print(f"{k}: learned views model, held-out recording Spearman = {rho:.3f}")

json.dump(res, open(os.path.join(HERE, "scorer-results.json"), "w", encoding="utf-8"), indent=1)
