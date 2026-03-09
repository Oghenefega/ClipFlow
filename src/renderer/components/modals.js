import React, { useState, useEffect, useRef } from "react";
import T from "../styles/theme";
import { GamePill, Card, SectionLabel, ColorPicker } from "./shared";

// ============ ADD GAME MODAL ============
export const AddGameModal = ({ exe, onConfirm, onDismiss, onIgnore }) => {
  const rawName = exe ? exe.replace(/\.exe$/i, "").replace(/[-_]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/Win64.*|Shipping.*/i, "").trim() : "";
  const [gameName, setGameName] = useState(rawName);
  const [tag, setTag] = useState(rawName ? rawName.split(" ").map((w) => w[0] || "").join("") : "");
  const [hashtag, setHashtag] = useState(rawName ? rawName.replace(/\s+/g, "").toLowerCase() : "");
  const [color, setColor] = useState("#8b5cf6");
  const [step, setStep] = useState(1);
  const isFromExe = !!exe;
  const timerRef = useRef(null);
  // Clean up timeout on unmount to prevent state updates after unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: T.surface, borderRadius: T.radius.xl, maxWidth: 460, width: "100%", border: `1px solid ${T.accentBorder}`, boxShadow: "0 24px 80px rgba(139,92,246,0.2)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ background: T.accentGlow, padding: "24px 28px 20px", borderBottom: `1px solid ${T.accentBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: T.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎮</div>
            <div>
              <div style={{ color: T.accentLight, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{isFromExe ? "New Game Detected" : "Add New Game"}</div>
              {isFromExe && <div style={{ color: T.textTertiary, fontSize: 12, fontFamily: T.mono, marginTop: 2 }}>{exe}</div>}
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "24px 28px" }}>
          {step === 1 && (
            <>
              <div style={{ marginBottom: 18 }}>
                <SectionLabel>Game Name</SectionLabel>
                <input value={gameName} onChange={(e) => setGameName(e.target.value)} placeholder="e.g. Subway Surfers" style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "12px 16px", color: T.text, fontSize: 16, fontWeight: 600, fontFamily: T.font, outline: "none", marginTop: 8, boxSizing: "border-box" }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
                <div>
                  <SectionLabel>Tag</SectionLabel>
                  <input value={tag} onChange={(e) => setTag(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "12px 16px", color: T.text, fontSize: 14, fontWeight: 700, fontFamily: T.mono, outline: "none", marginTop: 8, boxSizing: "border-box", letterSpacing: "1px" }} />
                </div>
                <div>
                  <SectionLabel>Hashtag</SectionLabel>
                  <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, marginTop: 8, overflow: "hidden" }}>
                    <span style={{ padding: "12px 0 12px 12px", color: T.textTertiary }}>#</span>
                    <input value={hashtag} onChange={(e) => setHashtag(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))} style={{ flex: 1, background: "transparent", border: "none", padding: "12px 12px 12px 4px", color: T.text, fontSize: 14, fontFamily: T.mono, outline: "none" }} />
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <SectionLabel>Color</SectionLabel>
                <div style={{ marginTop: 8 }}><ColorPicker value={color} onChange={setColor} /></div>
              </div>

              <Card style={{ padding: "14px 16px", marginBottom: 20 }}>
                <SectionLabel>Preview</SectionLabel>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                  <GamePill tag={tag || "??"} color={color} />
                  <span style={{ color: T.textSecondary, fontSize: 14, fontFamily: T.mono }}>2026-03-03 {tag || "??"} Day1 Pt1.mp4</span>
                </div>
              </Card>

              <div style={{ display: "flex", gap: 10 }}>
                {isFromExe && onIgnore && (
                  <button onClick={() => onIgnore(exe)} style={{ padding: "14px 16px", borderRadius: T.radius.md, border: `1px solid ${T.redBorder}`, background: T.redDim, color: T.red, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Ignore</button>
                )}
                <button onClick={onDismiss} style={{ flex: 1, padding: 14, borderRadius: T.radius.md, border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                <button onClick={() => { setStep(2); timerRef.current = setTimeout(() => setStep(3), 2000); }} disabled={!gameName.trim() || !tag.trim()} style={{ flex: 2, padding: 14, borderRadius: T.radius.md, border: "none", background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: T.font, opacity: (!gameName.trim() || !tag.trim()) ? 0.4 : 1 }}>Confirm & Generate</button>
              </div>
            </>
          )}

          {step === 2 && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>⚙️</div>
              <div style={{ color: T.text, fontSize: 16, fontWeight: 700 }}>Generating for {gameName}...</div>
            </div>
          )}

          {step === 3 && (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ color: T.green, fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{gameName} Added!</div>
              <button onClick={() => onConfirm({ name: gameName, tag, hashtag, color, exe: exe ? [exe] : [] })} style={{ width: "100%", padding: 14, borderRadius: T.radius.md, border: "none", background: T.green, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ GAME EDIT MODAL ============
export const GameEditModal = ({ game, onSave, onClose, anthropicApiKey }) => {
  const [tag, setTag] = useState(game.tag);
  const [hashtag, setHashtag] = useState(game.hashtag || "");
  const [color, setColor] = useState(game.color);
  const [dayCount, setDayCount] = useState(game.dayCount || 0);
  const [active, setActive] = useState(game.active !== false);
  const [aiPlayStyle, setAiPlayStyle] = useState(game.aiContextUser || "");
  const [aiAutoContext, setAiAutoContext] = useState(game.aiContextAuto || "");
  const [aiResearchedAt, setAiResearchedAt] = useState(game.aiResearchedAt || "");
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState("");
  const [showAiSection, setShowAiSection] = useState(false);

  const handleResearch = async () => {
    if (!anthropicApiKey) return;
    setResearching(true);
    setResearchError("");
    try {
      const result = await window.clipflow.anthropicResearchGame(game.name);
      if (result.success) {
        setAiAutoContext(result.data);
        setAiResearchedAt(new Date().toISOString());
      } else {
        setResearchError(result.error || "Research failed");
      }
    } catch (err) {
      setResearchError(err.message || "Research failed");
    } finally {
      setResearching(false);
    }
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, borderRadius: T.radius.xl, padding: 28, maxWidth: 480, width: "100%", border: `1px solid ${T.borderHover}`, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ color: T.text, fontSize: 20, fontWeight: 800, margin: 0 }}>Edit {game.name}</h3>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, padding: "8px 12px", color: T.textTertiary, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <div>
            <SectionLabel>Tag</SectionLabel>
            <input value={tag} onChange={(e) => setTag(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "12px 16px", color: T.text, fontSize: 14, fontWeight: 700, fontFamily: T.mono, outline: "none", marginTop: 8, boxSizing: "border-box", letterSpacing: "1px" }} />
          </div>
          <div>
            <SectionLabel>Last Day #</SectionLabel>
            <input type="number" min="0" value={dayCount} onChange={(e) => setDayCount(Math.max(0, parseInt(e.target.value) || 0))} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "12px 16px", color: T.yellow, fontSize: 14, fontWeight: 700, fontFamily: T.mono, outline: "none", marginTop: 8, boxSizing: "border-box" }} />
            <div style={{ color: T.textTertiary, fontSize: 11, marginTop: 4 }}>Next file = Day {(dayCount || 0) + 1}</div>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <SectionLabel>Hashtag</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, marginTop: 8, overflow: "hidden" }}>
            <span style={{ padding: "12px 0 12px 12px", color: T.textTertiary }}>#</span>
            <input value={hashtag} onChange={(e) => setHashtag(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))} style={{ flex: 1, background: "transparent", border: "none", padding: "12px 12px 12px 4px", color: T.text, fontSize: 14, fontFamily: T.mono, outline: "none" }} />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <SectionLabel>Color</SectionLabel>
          <div style={{ marginTop: 8 }}><ColorPicker value={color} onChange={setColor} /></div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <SectionLabel>Status</SectionLabel>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button onClick={() => setActive(true)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${active ? T.greenBorder : T.border}`, background: active ? T.greenDim : "transparent", color: active ? T.green : T.textTertiary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Active</button>
            <button onClick={() => setActive(false)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${!active ? T.redBorder : T.border}`, background: !active ? T.redDim : "transparent", color: !active ? T.red : T.textTertiary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Inactive</button>
          </div>
          <div style={{ color: T.textTertiary, fontSize: 11, marginTop: 4 }}>Inactive games are hidden from the tracker picker</div>
        </div>

        {/* AI Context Section */}
        <div style={{ marginBottom: 20, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          <button onClick={() => setShowAiSection(!showAiSection)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%" }}>
            <span style={{ color: T.accentLight, fontSize: 14, fontWeight: 700 }}>AI Context</span>
            <span style={{ color: T.textTertiary, fontSize: 11 }}>{showAiSection ? "▲" : "▼"}</span>
            {(aiAutoContext || aiPlayStyle) && <span style={{ width: 6, height: 6, borderRadius: 3, background: T.green, marginLeft: "auto" }} />}
          </button>

          {showAiSection && (
            <div style={{ marginTop: 14 }}>
              {/* Play Style - user editable */}
              <div style={{ marginBottom: 14 }}>
                <SectionLabel>Your Play Style</SectionLabel>
                <textarea
                  value={aiPlayStyle}
                  onChange={(e) => setAiPlayStyle(e.target.value)}
                  placeholder={"How do you play this game?\ne.g. \"I'm grinding ranked, trying to hit Diamond. Very competitive but I rage in a funny way.\""}
                  style={{ width: "100%", minHeight: 80, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "12px 16px", color: T.text, fontSize: 13, fontFamily: T.font, outline: "none", marginTop: 8, boxSizing: "border-box", resize: "vertical", lineHeight: 1.5 }}
                />
                <div style={{ color: T.textTertiary, fontSize: 11, marginTop: 4 }}>Included in AI title/caption generation for this game</div>
              </div>

              {/* Auto-researched context */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <SectionLabel>Game Knowledge (AI-Researched)</SectionLabel>
                  <button
                    onClick={handleResearch}
                    disabled={researching || !anthropicApiKey}
                    style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${anthropicApiKey ? T.accentBorder : T.border}`, background: anthropicApiKey ? T.accentDim : "transparent", color: anthropicApiKey ? T.accentLight : T.textTertiary, fontSize: 11, fontWeight: 600, cursor: anthropicApiKey ? "pointer" : "not-allowed", fontFamily: T.font, opacity: researching ? 0.6 : 1, whiteSpace: "nowrap" }}
                  >
                    {researching ? "Researching..." : aiAutoContext ? "Refresh" : "Research Game"}
                  </button>
                </div>
                {!anthropicApiKey && (
                  <div style={{ color: T.yellow, fontSize: 11, marginBottom: 6 }}>Add your Anthropic API key in Settings to enable game research</div>
                )}
                {researchError && (
                  <div style={{ color: T.red, fontSize: 11, marginBottom: 6 }}>{researchError}</div>
                )}
                {aiAutoContext ? (
                  <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: T.radius.md, padding: "12px 16px", color: T.textSecondary, fontSize: 12, lineHeight: 1.6, maxHeight: 120, overflowY: "auto", whiteSpace: "pre-wrap" }}>
                    {aiAutoContext}
                    {aiResearchedAt && (
                      <div style={{ color: T.textTertiary, fontSize: 10, marginTop: 8, borderTop: `1px solid ${T.border}`, paddingTop: 6 }}>
                        Researched: {new Date(aiResearchedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: T.radius.md, padding: "16px", color: T.textTertiary, fontSize: 12, textAlign: "center" }}>
                    No game knowledge yet. Click "Research Game" to auto-generate.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, borderRadius: T.radius.md, border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
          <button onClick={() => onSave({ ...game, tag, hashtag, color, dayCount, active, aiContextUser: aiPlayStyle, aiContextAuto: aiAutoContext, aiResearchedAt })} style={{ flex: 2, padding: 14, borderRadius: T.radius.md, border: "none", background: T.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
};

// ============ TRANSCRIPT MODAL ============
export const TranscriptModal = ({ clip, onClose }) => {
  if (!clip) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, borderRadius: T.radius.xl, maxWidth: 540, width: "100%", border: `1px solid ${T.borderHover}`, maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "28px 28px 0 28px", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
            <h3 style={{ color: T.text, fontSize: 18, fontWeight: 700, margin: 0, flex: 1, marginRight: 16 }}>{clip.title}</h3>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, padding: "8px 12px", color: T.textTertiary, cursor: "pointer" }}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 28px 28px 28px" }}>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: T.radius.md, padding: 20, color: T.textSecondary, fontSize: 15, lineHeight: 1.9, fontFamily: T.mono, whiteSpace: "pre-wrap" }}>
            {clip.transcript}
          </div>
        </div>
      </div>
    </div>
  );
};
