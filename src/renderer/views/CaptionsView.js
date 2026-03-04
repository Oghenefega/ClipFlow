import React, { useState } from "react";
import T from "../styles/theme";
import { Card, PageHeader, TabBar, SectionLabel } from "../components/shared";

export default function CaptionsView({ ytDescriptions, setYtDescriptions, captionTemplates, setCaptionTemplates }) {
  const [section, setSection] = useState("youtube");
  const [editGame, setEditGame] = useState(null);
  const [editDesc, setEditDesc] = useState("");
  const [editPlat, setEditPlat] = useState(null);
  const [editTpl, setEditTpl] = useState("");

  const plats = [
    { id: "tiktok", label: "TikTok" },
    { id: "instagram", label: "Instagram" },
    { id: "facebook", label: "Facebook" },
  ];

  return (
    <div>
      <PageHeader title="Captions & Descriptions" subtitle="YouTube descriptions + platform templates" />

      <TabBar
        tabs={[
          { id: "youtube", label: "YouTube", count: Object.keys(ytDescriptions).length },
          { id: "captions", label: "Other Platforms" },
        ]}
        active={section}
        onChange={setSection}
      />

      <div style={{ marginTop: 20 }}>
        {section === "youtube" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(ytDescriptions).map(([game, data]) => (
              <Card key={game} borderColor={editGame === game ? T.accentBorder : T.border}>
                {editGame === game ? (
                  <div style={{ padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <span style={{ color: T.text, fontSize: 17, fontWeight: 700 }}>{game}</span>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setEditGame(null)} style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary, fontSize: 13, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                        <button onClick={() => { setYtDescriptions((p) => ({ ...p, [editGame]: { desc: editDesc } })); setEditGame(null); }} style={{ padding: "8px 16px", borderRadius: 8, background: T.green, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save</button>
                      </div>
                    </div>
                    <SectionLabel>Description</SectionLabel>
                    <textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      rows={8}
                      style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 14, color: T.text, fontSize: 13, fontFamily: T.mono, lineHeight: 1.6, outline: "none", resize: "vertical", marginTop: 8, boxSizing: "border-box" }}
                    />
                  </div>
                ) : (
                  <div style={{ padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ color: T.text, fontSize: 15, fontWeight: 700 }}>{game} Shorts</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setEditGame(game); setEditDesc(data.desc || ""); }} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>Edit</button>
                      <button onClick={() => setYtDescriptions((p) => { const n = { ...p }; delete n[game]; return n; })} style={{ padding: "6px 12px", borderRadius: 6, background: T.redDim, border: `1px solid ${T.redBorder}`, color: T.red, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>Del</button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {plats.map((p) => (
              <Card key={p.id} style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>{p.label}</div>
                  {editPlat === p.id ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setEditPlat(null)} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                      <button onClick={() => { setCaptionTemplates((pr) => ({ ...pr, [p.id]: editTpl })); setEditPlat(null); }} style={{ padding: "6px 12px", borderRadius: 6, background: T.green, border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditPlat(p.id); setEditTpl(captionTemplates[p.id] || ""); }} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>Edit</button>
                  )}
                </div>
                {editPlat === p.id ? (
                  <input value={editTpl} onChange={(e) => setEditTpl(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.accentBorder}`, borderRadius: T.radius.md, padding: "12px 14px", color: T.text, fontSize: 14, fontFamily: T.mono, outline: "none", boxSizing: "border-box" }} />
                ) : (
                  <div style={{ color: T.textTertiary, fontSize: 13, fontFamily: T.mono }}>{captionTemplates[p.id] || `{title} #fyp`}</div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
