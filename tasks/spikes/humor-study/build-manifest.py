"""
#484 humor study: build the list of moments Gemini will watch.

Three sets, one row each in manifest.json:
  published_render  every published clip (has clip_metrics rows) whose render is on disk;
                    the FINISHED edit, as the audience saw it
  published_raw     a sample of those clips cut raw from the master over the AI's window;
                    what the detector proposed, before Fega touched it
  rejected_raw      a sample of rejected clips cut raw from the master over the AI's window

published_raw vs rejected_raw is the fair keep-vs-reject contrast (both unedited);
published_render vs published_raw is what the edit changed.

Reads prod data read-only: %APPDATA%\\Corva settings + clipflow.db, project.json files.
"""
import glob, json, os, random, sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))
APPDATA = os.path.join(os.environ["APPDATA"], "Corva")
SAMPLE_RAW = 80
random.seed(484)

settings = json.load(open(os.path.join(APPDATA, "clipflow-settings.json"), encoding="utf-8"))
proj_root = os.path.join(settings["projectsRoot"], ".clipflow", "projects")
db = sqlite3.connect(os.path.join(APPDATA, "data", "clipflow.db"))

views = {}
for clip_id, platform, v, likes, comments, shares in db.execute(
        "select clip_id, platform, views, likes, comments, shares from clip_metrics"):
    views.setdefault(clip_id, {})[platform] = {"views": v, "likes": likes, "comments": comments, "shares": shares}
first_day = dict(db.execute("select clip_id, min(day) from clip_metrics_history group by clip_id"))


def edit_facts(c):
    segs = [s for s in (c.get("nleSegments") or [])
            if isinstance(s.get("sourceStart"), (int, float)) and isinstance(s.get("sourceEnd"), (int, float))
            and s["sourceEnd"] > s["sourceStart"]]
    if not segs:
        segs = [{"sourceStart": c["startTime"], "sourceEnd": c["endTime"]}]
    kept_start = min(s["sourceStart"] for s in segs)
    kept_end = max(s["sourceEnd"] for s in segs)
    return {
        "ai_seconds": round(c["endTime"] - c["startTime"], 2),
        "kept_seconds": round(sum(s["sourceEnd"] - s["sourceStart"] for s in segs), 2),
        "start_moved_s": round(kept_start - c["startTime"], 2),
        "end_moved_s": round(kept_end - c["endTime"], 2),
        "sections": len(segs),
        "sounds": len(c.get("sfx") or []),
        "overlays": len(c.get("media") or []),
    }


published, rejected = [], []
for f in glob.glob(os.path.join(proj_root, "*", "project.json")):
    p = json.load(open(f, encoding="utf-8"))
    for c in p.get("clips", []):
        if not isinstance(c.get("startTime"), (int, float)) or not isinstance(c.get("endTime"), (int, float)):
            continue
        base = {
            "clip_id": c["id"], "project_id": p["id"], "project_name": p.get("name"),
            "game_tag": c.get("gameTag") or p.get("gameTag"), "game": p.get("game"),
            "master": p.get("sourceFile"), "ai_start": c["startTime"], "ai_end": c["endTime"],
            "ai_reason": c.get("highlightReason"), "ai_peak_quote": c.get("peakQuote"),
            "ai_confidence": c.get("confidence"), "title": c.get("title"), "caption": c.get("caption"),
        }
        if c["id"] in views:
            published.append({**base, "render": c.get("renderPath"), "views": views[c["id"]],
                              "first_metrics_day": first_day.get(c["id"]), "edit": edit_facts(c)})
        elif c.get("status") == "rejected":
            rejected.append({**base, "reject_reasons": c.get("rejectReasons") or []})

rows = []
for c in published:
    if c["render"] and os.path.exists(c["render"]):
        rows.append({**c, "set": "published_render", "key": f"pr_{c['clip_id']}"})

with_master = [c for c in published if c["master"] and os.path.exists(c["master"])]
for c in random.sample(with_master, min(SAMPLE_RAW, len(with_master))):
    rows.append({**c, "set": "published_raw", "key": f"pw_{c['clip_id']}"})

# Rejected sample weighted to the same games as the published set, reasons first.
rej_ok = [c for c in rejected if c["master"] and os.path.exists(c["master"])]
pub_games = [c["game_tag"] for c in published]
by_game = {}
for c in rej_ok:
    by_game.setdefault(c["game_tag"], []).append(c)
for g in by_game:
    random.shuffle(by_game[g])
    by_game[g].sort(key=lambda c: 0 if c["reject_reasons"] else 1)
picked = []
for g in sorted(set(pub_games), key=pub_games.count, reverse=True):
    want = round(SAMPLE_RAW * pub_games.count(g) / len(pub_games))
    picked += by_game.get(g, [])[:want]
for c in picked[:SAMPLE_RAW]:
    rows.append({**c, "set": "rejected_raw", "key": f"rw_{c['clip_id']}"})

json.dump(rows, open(os.path.join(HERE, "manifest.json"), "w", encoding="utf-8"), indent=1)
from collections import Counter
print(Counter(r["set"] for r in rows))
print("published games:", Counter(pub_games).most_common())
print("rejected sample games:", Counter(r["game_tag"] for r in rows if r["set"] == "rejected_raw").most_common())
