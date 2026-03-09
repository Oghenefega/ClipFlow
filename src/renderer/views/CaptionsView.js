import React, { useState } from "react";
import T from "../styles/theme";
import { Card, PageHeader, TabBar, SectionLabel } from "../components/shared";

const PLATFORMS = [
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
];

// Build the full YouTube description template for a game
function buildYtDescription(gameName, hashtag) {
  return `\u{1F534}Live every day 5PM\nThe funniest and most chaotic ${gameName} moments from my streams\u{1F602}\n\nStay connected & support the journey \n\u{1F514}SUBSCRIBE https://www.youtube.com/@Fega  \n\u{1F4AA}\u{1F3FD} Become a member: https://www.youtube.com/@Fega/join   \n\nMultistreaming ON \nTwitch: https://www.twitch.tv/fegaabsolute  \nKick: https://www.kick.com/fegaabsolute  \nTiktok: https://www.tiktok.com/fega  \n\n\u{1F53D} Watch My Best Videos \u{1F525}  \n\u{1F3AE} Old but Gold \u2013 Gaming Highlights & Reactions (Valorant, Fortnite,  Fall Guys, Outlast):  https://www.youtube.com/watch?v=GjYKMJdpESM&list=PLb2kk3HKq1SY6wAXPzbptMKqXULJulUmO    \n\n\u{1F4F2} Follow the Journey:  \n\u27A1 https://instagram.com/fegagaming \n\u27A1 https://twitter.com/FegaAbsolute   \n\n\u{1F3AE}Stream Setup  \nCamera | Sony ZVE10 - https://amzn.to/44QBgk7  \nLens | Vlog Lens (Sigma 18-35 lens) - https://amzn.to/4eX3oXm  \nMic | Blue Snowball - https://amzn.to/40ty3pw  \nElgato CamLink - https://amzn.to/4m1REVR  \nElgato Teleprompter - https://amzn.to/45a4Hit  \nGaming Mouse | Glorious Model O Wireless - https://amzn.to/453cwWe   \n\n\u2702\uFE0FMy Content & Editing Essentials  \nBEST Keyboard EVER | https://charachorder.com/FEGA  \nEditing Mouse | Master MX 3s - https://amzn.to/4kQ5D0j  \nNVME SSD Enclosure Casing - https://amzn.to/4nUunH9  \n2tb Samsung SSD - https://amzn.to/4lCtDFm   \n\n\u{1F4B8} All links above are affiliate links. \nPurchasing anything through them  helps support me. Thank you and God bless you!   \n\n${hashtag} shorts, ${hashtag} funny moments, ${hashtag} gameplay, funny gaming shorts, gaming shorts, funny gaming moments, funny clips, stream highlights, viral shorts, gaming content, gaming videos, gaming entertainment, ${hashtag} highlights, ${hashtag} fails, ${hashtag} clutch, Fega, YouTube Live, live gaming, live reaction\n\n#${hashtag} #gamingshorts #Fega`;
}

export default function CaptionsView({ ytDescriptions, setYtDescriptions, captionTemplates, setCaptionTemplates, gamesDb = [] }) {
  const [section, setSection] = useState("youtube");
  const [editGame, setEditGame] = useState(null);
  const [editDesc, setEditDesc] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editPlat, setEditPlat] = useState(null);
  const [editTpl, setEditTpl] = useState("");
  const [copied, setCopied] = useState(null);

  const handleCopy = (game, desc) => {
    navigator.clipboard.writeText(desc || "");
    setCopied(game);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleRegenerate = (game) => {
    const gameEntry = gamesDb.find((g) => g.name === game);
    const hashtag = gameEntry?.hashtag || game.toLowerCase().replace(/\s+/g, "");
    const newDesc = buildYtDescription(game, hashtag);
    setEditDesc(newDesc);
  };

  const handleSave = () => {
    setYtDescriptions((p) => ({
      ...p,
      [editGame]: { ...p[editGame], desc: editDesc, ytTitle: editTitle },
    }));
    setEditGame(null);
  };

  const startEdit = (game, data) => {
    setEditGame(game);
    setEditDesc(data.desc || "");
    setEditTitle(data.ytTitle || game + " Shorts");
  };

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
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        style={{ color: T.text, fontSize: 17, fontWeight: 700, fontFamily: T.font, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.sm, padding: "6px 12px", outline: "none", width: 280 }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setEditGame(null)} style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary, fontSize: 13, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                        <button onClick={handleSave} style={{ padding: "8px 16px", borderRadius: 8, background: T.green, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save</button>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <SectionLabel>Description</SectionLabel>
                      <button
                        onClick={() => handleRegenerate(game)}
                        style={{ padding: "5px 12px", borderRadius: 6, background: T.accentDim, border: `1px solid ${T.accentBorder}`, color: T.accentLight, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}
                      >
                        Regenerate from Template
                      </button>
                    </div>
                    <textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      rows={8}
                      style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 14, color: T.text, fontSize: 13, fontFamily: T.mono, lineHeight: 1.6, outline: "none", resize: "vertical", marginTop: 4, boxSizing: "border-box" }}
                    />
                  </div>
                ) : (
                  <div style={{ padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ color: T.text, fontSize: 15, fontWeight: 700 }}>{data.ytTitle || game + " Shorts"}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => startEdit(game, data)} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>Edit</button>
                      <button onClick={() => handleCopy(game, data.desc)} style={{ padding: "6px 12px", borderRadius: 6, background: copied === game ? T.yellow : T.yellowDim, border: `1px solid ${copied === game ? T.yellow : T.yellowBorder}`, color: copied === game ? "#000" : T.yellow, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font, transition: "all 0.2s" }}>{copied === game ? "Copied!" : "Copy"}</button>
                      <button onClick={() => setYtDescriptions((p) => { const n = { ...p }; delete n[game]; return n; })} style={{ padding: "6px 12px", borderRadius: 6, background: T.redDim, border: `1px solid ${T.redBorder}`, color: T.red, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>Del</button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {PLATFORMS.map((p) => (
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
