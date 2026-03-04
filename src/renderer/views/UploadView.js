import React, { useState, useEffect } from "react";
import T from "../styles/theme";
import { Card, PageHeader, PrimaryButton, Checkbox, SectionLabel } from "../components/shared";

const MOCK_FILES = [
  { name: "2026-03-03 AR Day25 Pt1.mp4", size: "6.2 GB", game: "Arc Raiders" },
  { name: "2026-03-03 AR Day25 Pt2.mp4", size: "5.8 GB", game: "Arc Raiders" },
  { name: "2026-03-02 DD Day14 Pt1.mp4", size: "5.4 GB", game: "Deadline Delivery" },
];

export default function UploadView() {
  const [selected, setSelected] = useState({});
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({});
  const [done, setDone] = useState({});

  const toggle = (i) => { if (done[i]) return; setSelected((p) => ({ ...p, [i]: !p[i] })); };
  const selCount = Object.keys(selected).filter((k) => selected[k] && !done[k]).length;

  const upload = () => {
    if (selCount === 0) return;
    setUploading(true);
    Object.keys(selected).filter((k) => selected[k] && !done[k]).forEach((idx) => {
      const i = parseInt(idx);
      let p = 0;
      const iv = setInterval(() => {
        p += Math.random() * 12 + 4;
        if (p >= 100) { clearInterval(iv); setDone((pr) => ({ ...pr, [i]: true })); p = 100; }
        setProgress((pr) => ({ ...pr, [i]: Math.min(p, 100) }));
      }, 350 + i * 150);
    });
  };

  const batchDone = Object.keys(selected).filter((k) => selected[k]).length > 0 && Object.keys(selected).filter((k) => selected[k]).every((k) => done[k]);
  useEffect(() => { if (batchDone) setUploading(false); }, [batchDone]);

  return (
    <div>
      <PageHeader title="Upload & Clip" subtitle="Renamed recordings → R2 → Vizard AI" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionLabel>{MOCK_FILES.length} files</SectionLabel>
        <button onClick={() => { const u = {}; MOCK_FILES.forEach((_, i) => { if (!done[i]) u[i] = true; }); setSelected((p) => ({ ...p, ...u })); }} style={{ background: "none", border: "none", color: T.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font, padding: 0 }}>Select All</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {MOCK_FILES.map((f, i) => {
          const isDone = done[i]; const isSel = selected[i]; const isUp = uploading && isSel && !isDone;
          return (
            <Card key={i} onClick={() => toggle(i)} borderColor={isDone ? T.greenBorder : isSel ? T.accentBorder : T.border} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", cursor: isDone ? "default" : "pointer", background: isDone ? "rgba(52,211,153,0.03)" : isSel ? T.accentGlow : T.surface }}>
              {isDone ? (
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: T.greenDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke={T.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
              ) : <Checkbox checked={!!isSel} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.text, fontSize: 15, fontWeight: 600 }}>{f.name}</div>
                <div style={{ color: T.textTertiary, fontSize: 13, marginTop: 4 }}><span style={{ fontFamily: T.mono }}>{f.size}</span> · {f.game}</div>
              </div>
              {isUp && (
                <div style={{ width: 100 }}>
                  <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${progress[i] || 0}%`, height: "100%", background: T.accent, borderRadius: 2, transition: "width 0.3s" }} />
                  </div>
                  <div style={{ color: T.textTertiary, fontSize: 11, textAlign: "right", marginTop: 4, fontFamily: T.mono }}>{Math.round(progress[i] || 0)}%</div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <PrimaryButton onClick={upload} disabled={selCount === 0}>
        {selCount > 0 ? `Upload ${selCount} File${selCount > 1 ? "s" : ""}` : Object.values(done).some(Boolean) ? "All selected uploaded ✅" : "Select Files"}
      </PrimaryButton>
    </div>
  );
}
