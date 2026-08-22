import React, { useState } from "react";
import T from "../styles/theme";
import { Card, PageHeader, TabBar, SectionLabel, CopyIconButton } from "../components/shared";
import { buildStarterYtDescription } from "../utils/ytDescriptionTemplate";
import { TAGS_MAX, parseTags, tagsLength, tagsToText } from "../utils/ytTags";

const PLATFORMS = [
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
];

export default function CaptionsView({ ytDescriptions, setYtDescriptions, captionTemplates, setCaptionTemplates, platformOptions, setPlatformOptions, gamesDb = [] }) {
  const [section, setSection] = useState("youtube");
  const [editGame, setEditGame] = useState(null);
  const [editDesc, setEditDesc] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState("");
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
    const newDesc = buildStarterYtDescription(game, hashtag);
    setEditDesc(newDesc);
  };

  const handleSave = () => {
    if (tagsOver) return;
    setYtDescriptions((p) => ({
      ...p,
      [editGame]: { ...p[editGame], desc: editDesc, ytTitle: editTitle, tags: parsedTags },
    }));
    setEditGame(null);
  };

  const startEdit = (game, data) => {
    setEditGame(game);
    setEditDesc(data.desc || "");
    setEditTitle(data.ytTitle || game + " Shorts");
    setEditTags((data.tags || []).join(", "));
  };

  const parsedTags = parseTags(editTags);
  const tagsLen = tagsLength(parsedTags);
  const tagsOver = tagsLen > TAGS_MAX;

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
                        <button
                          onClick={handleSave}
                          disabled={tagsOver}
                          title={tagsOver ? "Tags are over YouTube's 500-character limit" : ""}
                          style={{ padding: "8px 16px", borderRadius: 8, background: tagsOver ? "rgba(255,255,255,0.06)" : T.green, border: "none", color: tagsOver ? T.textMuted : "#fff", fontSize: 13, fontWeight: 700, cursor: tagsOver ? "not-allowed" : "pointer", fontFamily: T.font }}
                        >Save</button>
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

                    {/* #286: the variables are invisible unless we say so */}
                    <div style={{ color: T.textMuted, fontSize: 11, marginTop: 6 }}>
                      Variables: <span style={{ fontFamily: T.mono, color: T.textTertiary }}>{"{title}"}</span> the clip title
                      {" · "}<span style={{ fontFamily: T.mono, color: T.textTertiary }}>{"#{gametitle}"}</span> the game hashtag
                      {" · "}<span style={{ fontFamily: T.mono, color: T.textTertiary }}>{"{schedule}"}</span> your stream schedule from Settings
                    </div>

                    {/* #285: per-game YouTube tags — sent with every Short for this game */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <SectionLabel>YouTube Tags</SectionLabel>
                        {parsedTags.length > 0 && <CopyIconButton value={tagsToText(parsedTags)} title="Copy tags" />}
                      </div>
                      <span style={{ fontSize: 11, fontFamily: T.mono, color: tagsOver ? T.red : T.textMuted }}>
                        {tagsLen} / {TAGS_MAX}
                      </span>
                    </div>
                    <input
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="rocket league, rocket league clips, gaming shorts"
                      style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${tagsOver ? T.red : T.border}`, borderRadius: T.radius.md, padding: "12px 14px", color: T.text, fontSize: 13, fontFamily: T.mono, outline: "none", boxSizing: "border-box" }}
                    />
                    <div style={{ color: tagsOver ? T.red : T.textMuted, fontSize: 11, marginTop: 6 }}>
                      {tagsOver
                        ? `Over YouTube's 500-character tag limit by ${tagsLen - TAGS_MAX} — shorten the list to save.`
                        : "Comma-separated. Sent with every Short published for this game."}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ color: T.text, fontSize: 15, fontWeight: 700 }}>{data.ytTitle || game + " Shorts"}</div>
                      <span style={{ fontSize: 11, color: data.tags?.length ? T.textTertiary : T.textMuted }}>
                        {data.tags?.length ? `${data.tags.length} tag${data.tags.length === 1 ? "" : "s"}` : "no tags"}
                      </span>
                      {data.tags?.length > 0 && <CopyIconButton value={tagsToText(data.tags)} title="Copy tags" style={{ marginLeft: -4 }} />}
                    </div>
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
                {p.id === "tiktok" && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ color: T.textSecondary, fontSize: 13 }}>Post Mode</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[
                        { value: "direct_post", label: "Direct Post" },
                        { value: "inbox", label: "Send to Inbox" },
                      ].map(({ value, label }) => {
                        const isActive = (platformOptions?.tiktokPostMode || "direct_post") === value;
                        return (
                          <button
                            key={value}
                            onClick={() => setPlatformOptions?.((p) => ({ ...p, tiktokPostMode: value }))}
                            style={{ padding: "5px 12px", borderRadius: 6, background: isActive ? T.green : "rgba(255,255,255,0.04)", border: `1px solid ${isActive ? T.green : T.border}`, color: isActive ? "#fff" : T.textSecondary, fontSize: 12, fontWeight: isActive ? 700 : 400, cursor: "pointer", fontFamily: T.font, transition: "all 0.15s" }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
