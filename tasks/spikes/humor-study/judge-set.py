"""
#483 judge test set: Fega's reviewed clips, balanced keep/reject per clip kind.

kind = "hype"   for esports-reaction games (100T, VCT, RL-R, Val-R)
       "comedy" for everything else (own gameplay, ROBOT reacts)
GTA6-R is left out (Fega: the GTA 6 reveal was a one-off). Mechanical rejects
(duplicate, bad-cut, wrong-content, repetitive) are left out: a judge watching
one moment cannot see them. Writes judge-manifest.json. Read-only on prod data.
"""
import glob, json, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
APPDATA = os.path.join(os.environ["APPDATA"], "Corva")
PER_CELL = 60
HYPE = {"100T", "VCT", "RL-R", "VAL-R"}
SKIP = {"GTA6-R"}
MECHANICAL = {"duplicate", "bad-cut", "wrong-content", "repetitive"}
random.seed(483)

settings = json.load(open(os.path.join(APPDATA, "clipflow-settings.json"), encoding="utf-8"))
games = {g["tag"].upper(): g for g in settings.get("gamesDb", [])}
root = os.path.join(settings["projectsRoot"], ".clipflow", "projects")

cells = {(k, d): [] for k in ("hype", "comedy") for d in ("approved", "rejected")}
for f in glob.glob(os.path.join(root, "*", "project.json")):
    p = json.load(open(f, encoding="utf-8"))
    master = p.get("sourceFile")
    if not master or not os.path.exists(master):
        continue
    for c in p.get("clips", []):
        st = c.get("status")
        if st not in ("approved", "rejected") or not isinstance(c.get("startTime"), (int, float)):
            continue
        tag = (c.get("gameTag") or p.get("gameTag") or "?").upper()
        reasons = c.get("rejectReasons") or []
        if tag in SKIP or (st == "rejected" and MECHANICAL & set(reasons)):
            continue
        g = games.get(tag, {})
        cells[("hype" if tag in HYPE else "comedy", st)].append({
            "key": f"j_{c['id']}", "clip_id": c["id"], "project_id": p["id"], "project_name": p.get("name"),
            "game_tag": tag, "game_name": g.get("name") or p.get("game"), "game_context": g.get("aiContextUser") or "",
            "kind": "hype" if tag in HYPE else "comedy", "decision": st, "reject_reasons": reasons,
            "confidence": c.get("confidence"), "master": master, "ai_start": c["startTime"], "ai_end": c["endTime"],
        })

rows = []
for (kind, dec), xs in cells.items():
    if kind == "comedy":
        # stratify by game so RL's 267 rejects do not swamp the comedy cell
        by = {}
        for x in xs:
            by.setdefault(x["game_tag"], []).append(x)
        for v in by.values():
            random.shuffle(v)
        pick = []
        while len(pick) < PER_CELL and any(by.values()):
            for g in sorted(by):
                if by[g] and len(pick) < PER_CELL:
                    pick.append(by[g].pop())
    else:
        pick = random.sample(xs, min(PER_CELL, len(xs)))
    rows += pick
    print(kind, dec, "pool", len(xs), "picked", len(pick))

json.dump(rows, open(os.path.join(HERE, "judge-manifest.json"), "w", encoding="utf-8"), indent=1)
from collections import Counter
print(Counter((r["kind"], r["decision"], r["game_tag"]) for r in rows))
