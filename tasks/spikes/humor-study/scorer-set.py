"""
#483 cell 3: every reviewed clip, for the judge v3 run and the personal scorer.

Same exclusions as judge-set.py (mechanical rejects, GTA6-R one-off). Adds the
recording's signal-file base name (processing/signals/<base>.*.json is keyed by
the master's file name, which can differ from the project name) and the
published view stats where the clip was published. Writes scorer-manifest.json.
"""
import glob, json, os, sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))
APPDATA = os.path.join(os.environ["APPDATA"], "Corva")
HYPE = {"100T", "VCT", "RL-R", "VAL-R"}
SKIP = {"GTA6-R"}
MECHANICAL = {"duplicate", "bad-cut", "wrong-content", "repetitive"}

settings = json.load(open(os.path.join(APPDATA, "clipflow-settings.json"), encoding="utf-8"))
games = {g["tag"].upper(): g for g in settings.get("gamesDb", [])}
root = os.path.join(settings["projectsRoot"], ".clipflow", "projects")
sig_dir = os.path.join(APPDATA, "processing", "signals")
db = sqlite3.connect(os.path.join(APPDATA, "data", "clipflow.db"))
views = {}
for cid, plat, v in db.execute("select clip_id, platform, views from clip_metrics"):
    views.setdefault(cid, {})[plat] = v or 0
first_day = dict(db.execute("select clip_id, min(day) from clip_metrics_history group by clip_id"))

rows = []
for f in glob.glob(os.path.join(root, "*", "project.json")):
    p = json.load(open(f, encoding="utf-8"))
    master = p.get("sourceFile")
    if not master or not os.path.exists(master):
        continue
    base = os.path.splitext(os.path.basename(master))[0]
    has_signals = os.path.exists(os.path.join(sig_dir, f"{base}.event_timeline.json"))
    for c in p.get("clips", []):
        st = c.get("status")
        if st not in ("approved", "rejected") or not isinstance(c.get("startTime"), (int, float)):
            continue
        tag = (c.get("gameTag") or p.get("gameTag") or "?").upper()
        reasons = c.get("rejectReasons") or []
        if tag in SKIP or (st == "rejected" and MECHANICAL & set(reasons)):
            continue
        g = games.get(tag, {})
        rows.append({
            "key": f"j_{c['id']}", "clip_id": c["id"], "project_id": p["id"], "project_name": p.get("name"),
            "game_tag": tag, "game_name": g.get("name") or p.get("game"), "game_context": g.get("aiContextUser") or "",
            "kind": "hype" if tag in HYPE else "comedy", "decision": st, "reject_reasons": reasons,
            "confidence": c.get("confidence"), "master": master, "signal_base": base, "has_signals": has_signals,
            "ai_start": c["startTime"], "ai_end": c["endTime"],
            "views": views.get(c["id"]), "first_metrics_day": first_day.get(c["id"]),
        })

json.dump(rows, open(os.path.join(HERE, "scorer-manifest.json"), "w", encoding="utf-8"), indent=1)
from collections import Counter
print(len(rows), "clips;", sum(r["has_signals"] for r in rows), "with signals;", sum(bool(r["views"]) for r in rows), "published")
print(Counter((r["kind"], r["decision"]) for r in rows))
print(Counter(r["game_tag"] for r in rows if not r["has_signals"]))
