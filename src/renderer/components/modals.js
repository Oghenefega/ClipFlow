import React, { useState } from "react";
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
                <button onClick={() => { setStep(2); setTimeout(() => setStep(3), 2000); }} disabled={!gameName.trim() || !tag.trim()} style={{ flex: 2, padding: 14, borderRadius: T.radius.md, border: "none", background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: T.font, opacity: (!gameName.trim() || !tag.trim()) ? 0.4 : 1 }}>Confirm & Generate</button>
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
export const GameEditModal = ({ game, onSave, onClose }) => {
  const [tag, setTag] = useState(game.tag);
  const [hashtag, setHashtag] = useState(game.hashtag || "");
  const [color, setColor] = useState(game.color);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, borderRadius: T.radius.xl, padding: 28, maxWidth: 420, width: "100%", border: `1px solid ${T.borderHover}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ color: T.text, fontSize: 20, fontWeight: 800, margin: 0 }}>Edit {game.name}</h3>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, padding: "8px 12px", color: T.textTertiary, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <SectionLabel>Tag</SectionLabel>
          <input value={tag} onChange={(e) => setTag(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "12px 16px", color: T.text, fontSize: 14, fontWeight: 700, fontFamily: T.mono, outline: "none", marginTop: 8, boxSizing: "border-box", letterSpacing: "1px" }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <SectionLabel>Hashtag</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, marginTop: 8, overflow: "hidden" }}>
            <span style={{ padding: "12px 0 12px 12px", color: T.textTertiary }}>#</span>
            <input value={hashtag} onChange={(e) => setHashtag(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))} style={{ flex: 1, background: "transparent", border: "none", padding: "12px 12px 12px 4px", color: T.text, fontSize: 14, fontFamily: T.mono, outline: "none" }} />
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <SectionLabel>Color</SectionLabel>
          <div style={{ marginTop: 8 }}><ColorPicker value={color} onChange={setColor} /></div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, borderRadius: T.radius.md, border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
          <button onClick={() => onSave({ ...game, tag, hashtag, color })} style={{ flex: 2, padding: 14, borderRadius: T.radius.md, border: "none", background: T.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save Changes</button>
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
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, borderRadius: T.radius.xl, padding: 28, maxWidth: 540, width: "100%", border: `1px solid ${T.borderHover}`, maxHeight: "80vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ color: T.text, fontSize: 18, fontWeight: 700, margin: 0, flex: 1, marginRight: 16 }}>{clip.title}</h3>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, padding: "8px 12px", color: T.textTertiary, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: T.radius.md, padding: 20, color: T.textSecondary, fontSize: 15, lineHeight: 1.9, fontFamily: T.mono, whiteSpace: "pre-wrap" }}>
          {clip.transcript}
        </div>
      </div>
    </div>
  );
};
