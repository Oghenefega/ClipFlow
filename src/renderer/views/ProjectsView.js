import React, { useState } from "react";
import T from "../styles/theme";
import { Card, Badge, PageHeader, TabBar, InfoBanner, ViralBar, hasHashtag } from "../components/shared";

const MOCK_PROJECTS = [
  { id: "p1", name: "Arc Raiders Day 19 Part 4", game: "Arc Raiders", status: "ready", clipCount: 5 },
  { id: "p2", name: "Arc Raiders Day 13 Part 2", game: "Arc Raiders", status: "ready", clipCount: 3 },
  { id: "p3", name: "Rocket League Day 5", game: "Rocket League", status: "ready", clipCount: 2 },
  { id: "p4", name: "Arc Raiders Day 14 Pt1", game: "Arc Raiders", status: "processing", clipCount: 0, progress: 65 },
];

// ============ PROJECT LIST ============
export function ProjectsListView({ onSelect, clips, mainGame }) {
  const getStatus = (p) => {
    if (p.status === "processing") return "processing";
    const pc = clips[p.id];
    if (!pc) return p.status;
    const tagged = pc.filter((c) => hasHashtag(c.title));
    return tagged.length > 0 && tagged.filter((c) => c.status === "none").length === 0 ? "done" : "ready";
  };

  return (
    <div>
      <PageHeader title="Projects" subtitle={`${MOCK_PROJECTS.length} projects`} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {MOCK_PROJECTS.map((p) => {
          const st = getStatus(p);
          return (
            <Card key={p.id} onClick={() => p.status === "ready" && onSelect(p)} borderColor={st === "done" ? T.greenBorder : T.border} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 20, opacity: p.status === "processing" ? 0.5 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
                <div style={{ width: 46, height: 46, borderRadius: T.radius.md, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, background: st === "done" ? T.greenDim : p.game === mainGame ? T.accentDim : T.greenDim }}>
                  {st === "done" ? "✅" : "🎮"}
                </div>
                <div>
                  <div style={{ color: T.text, fontSize: 16, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ color: T.textTertiary, fontSize: 13, marginTop: 4 }}>
                    {p.status === "processing" ? <span>Processing <span style={{ fontFamily: T.mono, color: T.yellow }}>{p.progress}%</span></span> : <><span style={{ fontFamily: T.mono }}>{p.clipCount}</span> clips</>}
                  </div>
                </div>
              </div>
              <Badge color={st === "done" ? T.green : st === "processing" ? T.yellow : T.accent}>{st === "done" ? "Done" : st === "processing" ? "Processing" : "Review"}</Badge>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ============ CLIP BROWSER ============
export function ClipBrowser({ project, clips, onBack, onUpdate, onTranscript, onEditTitle }) {
  const [filter, setFilter] = useState("all");
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState("");

  const isApproved = (c) => c.status === "approved" || c.status === "ready";
  const tagged = clips.filter((c) => hasHashtag(c.title));
  const untagged = clips.filter((c) => !hasHashtag(c.title));
  const filtered = tagged.filter((c) => filter === "approved" ? isApproved(c) : filter === "pending" ? c.status === "none" : true);
  const approved = tagged.filter(isApproved).length;

  return (
    <div>
      <PageHeader title={project.name} subtitle={`${approved} approved · ${tagged.filter((c) => c.status === "none").length} pending`} backAction={onBack} />

      <TabBar tabs={[{ id: "all", label: "All", count: tagged.length }, { id: "pending", label: "Pending", count: tagged.filter((c) => c.status === "none").length }, { id: "approved", label: "Approved", count: approved }]} active={filter} onChange={setFilter} />

      {untagged.length > 0 && <div style={{ margin: "16px 0 0" }}><InfoBanner color={T.yellow} icon="⚠️">{untagged.length} clip{untagged.length > 1 ? "s" : ""} hidden — no hashtag.</InfoBanner></div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        {filtered.map((clip) => {
          const ca = isApproved(clip);
          const rej = clip.status === "rejected";
          return (
            <Card key={clip.id} borderColor={ca ? T.greenBorder : T.border} style={{ padding: 20, opacity: rej ? 0.35 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  {editId === clip.id ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.accentBorder}`, borderRadius: T.radius.md, padding: "10px 14px", color: T.text, fontSize: 15, fontWeight: 600, fontFamily: T.font, outline: "none" }} />
                      <button onClick={() => { onEditTitle(clip.id, editText); setEditId(null); }} style={{ background: T.accent, border: "none", borderRadius: T.radius.md, padding: "10px 18px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save</button>
                    </div>
                  ) : (
                    <div onClick={() => { setEditId(clip.id); setEditText(clip.title); }} style={{ color: T.text, fontSize: 16, fontWeight: 600, lineHeight: 1.5, cursor: "pointer" }}>{clip.title} <span style={{ color: T.textMuted, fontSize: 13 }}>✎</span></div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => onUpdate(clip.id, ca ? "none" : "approved")} style={{ width: 42, height: 42, borderRadius: T.radius.md, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", border: ca ? `1px solid ${T.greenBorder}` : `1px solid ${T.border}`, cursor: "pointer", background: ca ? T.greenDim : "rgba(255,255,255,0.04)", color: ca ? T.green : T.textTertiary }}>👍</button>
                  <button onClick={() => onUpdate(clip.id, rej ? "none" : "rejected")} style={{ width: 42, height: 42, borderRadius: T.radius.md, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", border: rej ? `1px solid ${T.redBorder}` : `1px solid ${T.border}`, cursor: "pointer", background: rej ? T.redDim : "rgba(255,255,255,0.04)", color: rej ? T.red : T.textTertiary }}>👎</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ color: T.textTertiary, fontSize: 13, fontFamily: T.mono }}>{clip.duration}s</span>
                <ViralBar score={clip.viralScore} />
              </div>
              {!rej && (
                <div style={{ display: "flex", gap: 8, paddingTop: 14, borderTop: `1px solid ${T.border}`, marginTop: 14 }}>
                  <button onClick={() => onTranscript(clip)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>📝 Transcript</button>
                  {ca && <Badge color={T.green}>✓ Queued</Badge>}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
