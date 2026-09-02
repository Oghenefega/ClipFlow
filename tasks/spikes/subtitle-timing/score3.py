"""Direction-aware scoring of aligner dumps (align/<method>/<clipId>.json) against Fega's finals.
  python score3.py <scratchpad> method1,method2,...   ("raw" = stable-ts as transcribed)
Per pill position (single/first/mid/last) x direction Fega moved the word (later/earlier/untouched):
share of words whose candidate start lands within 100 ms of Fega."""
import json,sys,os,statistics as st
S=sys.argv[1]; methods=sys.argv[2].split(",")
clips={c["clipId"]:c for c in json.load(open(os.path.join(S,"approved_clips.json"),encoding="utf-8")) if c["clipTranscription"] and c["sub1"]}
def norm(w): return ''.join(ch for ch in (w or "").lower() if ch.isalnum() or ch=="'")
def words_of(segs): return sorted([w for s in segs for w in s.get("words",[]) if w.get("start") is not None],key=lambda w:w["start"])
def load(m,cid,c):
    if m=="raw": return words_of(c["clipTranscription"]["segments"])
    p=os.path.join(S,"align",m,cid+".json"); return words_of(json.load(open(p,encoding="utf-8"))["segments"]) if os.path.exists(p) else None
for m in ["raw"]+methods:
    cells={}; unmatched=0; n_clips=0; bias=[]; allE=[]
    for cid,c in clips.items():
        cand=load(m,cid,c)
        if cand is None: continue
        n_clips+=1; off=c["startTime"]; raw=words_of(c["clipTranscription"]["segments"])
        for seg in c["sub1"]:
            ws=seg.get("words") or []
            for j,w in enumerate(ws):
                fs=w["start"]-off
                rc=[r for r in raw if norm(r["word"])==norm(w["word"]) and abs(r["start"]-fs)<1.5]
                if not rc: continue
                r=min(rc,key=lambda r:abs(r["start"]-fs)); d=fs-r["start"]
                cc=[x for x in cand if norm(x["word"])==norm(w["word"]) and abs(x["start"]-fs)<1.5]
                if not cc: unmatched+=1; x=r
                else: x=min(cc,key=lambda x:abs(x["start"]-fs))
                e=x["start"]-fs; allE.append(e)
                pos="single" if len(ws)==1 else "first" if j==0 else "last" if j==len(ws)-1 else "mid"
                dirn="later" if d>0.1 else "earlier" if d<-0.1 else "untouched" if abs(d)<=0.05 else None
                if dirn is None: continue
                if dirn=="untouched": bias.append(e)
                cells.setdefault((pos,dirn),[]).append(e)
    if not n_clips: print(f"\n== {m}: no dumps"); continue
    ax=[abs(e) for e in allE]
    print(f"\n== {m}: clips={n_clips} unmatched(left at raw)={unmatched} ALL within100={sum(a<=.1 for a in ax)/len(ax):.1%} med|e|={st.median(ax):.3f} bias(untouched med)={st.median(bias):+.3f}")
    print(f"   {'pos':7s} {'later: n  ok':>16s} {'earlier: n  ok':>18s} {'untouched: n  ok':>20s}")
    for pos in ("single","first","mid","last"):
        row=[]
        for dirn in ("later","earlier","untouched"):
            xs=cells.get((pos,dirn),[]); row.append(f"{len(xs):4d} {sum(abs(e)<=.1 for e in xs)/max(1,len(xs)):5.0%}")
        print(f"   {pos:7s} {row[0]:>16s} {row[1]:>18s} {row[2]:>20s}")
    L=[e for (p,d),xs in cells.items() if d=="later" for e in xs]; E=[e for (p,d),xs in cells.items() if d=="earlier" for e in xs]; U=[e for (p,d),xs in cells.items() if d=="untouched" for e in xs]
    print(f"   TOTAL  later {len(L)} ok={sum(abs(e)<=.1 for e in L)/len(L):.0%}  earlier {len(E)} ok={sum(abs(e)<=.1 for e in E)/len(E):.0%}  untouched {len(U)} disturbed={sum(abs(e)>.1 for e in U)/len(U):.1%}")
