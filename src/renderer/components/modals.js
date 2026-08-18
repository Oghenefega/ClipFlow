import React, { useState, useEffect, useRef } from "react";
import T from "../styles/theme";
import { GamePill, Card, SectionLabel, ColorPicker, toFileUrl } from "./shared";

// ============ ADD GAME MODAL ============
export const AddGameModal = ({ exe, entryType = "game", onConfirm, onDismiss, onIgnore, aiReady = false }) => {
  const isContent = entryType === "content";
  const rawName = exe ? exe.replace(/\.exe$/i, "").replace(/[-_]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/Win64.*|Shipping.*/i, "").trim() : "";
  const [gameName, setGameName] = useState(rawName);
  const [tag, setTag] = useState(rawName ? rawName.split(" ").map((w) => w[0] || "").join("") : "");
  const [hashtag, setHashtag] = useState(rawName ? rawName.replace(/\s+/g, "").toLowerCase() : "");
  const [color, setColor] = useState(isContent ? "#9b5de5" : "#8b5cf6");
  // #246: playStyle is collected on its own wizard step (games only) and lands
  // in BOTH stores via the confirm payload + App's profile write-through.
  const [playStyle, setPlayStyle] = useState("");
  const [step, setStep] = useState(1);
  const isFromExe = !!exe;
  const typeLabel = isContent ? "Content Type" : "Game";
  // #246: research really happens after Done (App fires it in the background),
  // so the interstitial only claims it when it will actually run.
  const willResearch = !isContent && aiReady;
  const timerRef = useRef(null);
  // Clean up timeout on unmount to prevent state updates after unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);
  const advance = () => { setStep(3); timerRef.current = setTimeout(() => setStep(4), 2000); };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: T.surface, borderRadius: T.radius.xl, maxWidth: 460, width: "100%", border: `1px solid ${T.accentBorder}`, boxShadow: "0 24px 80px rgba(139,92,246,0.2)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ background: T.accentGlow, padding: "24px 28px 20px", borderBottom: `1px solid ${T.accentBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: T.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{isContent ? "💬" : "🎮"}</div>
            <div>
              <div style={{ color: T.accentLight, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{isFromExe ? "New Game Detected" : `Add New ${typeLabel}`}</div>
              {isFromExe && <div style={{ color: T.textTertiary, fontSize: 12, fontFamily: T.mono, marginTop: 2 }}>{exe}</div>}
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "24px 28px" }}>
          {step === 1 && (
            <>
              <div style={{ marginBottom: 18 }}>
                <SectionLabel>{isContent ? "Content Type Name" : "Game Name"}</SectionLabel>
                <input value={gameName} onChange={(e) => setGameName(e.target.value)} placeholder={isContent ? "e.g. Just Chatting" : "e.g. Subway Surfers"} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "12px 16px", color: T.text, fontSize: 16, fontWeight: 600, fontFamily: T.font, outline: "none", marginTop: 8, boxSizing: "border-box" }} />
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
                <button onClick={() => { if (isContent) advance(); else setStep(2); }} disabled={!gameName.trim() || !tag.trim()} style={{ flex: 2, padding: 14, borderRadius: T.radius.md, border: "none", background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: T.font, opacity: (!gameName.trim() || !tag.trim()) ? 0.4 : 1 }}>{isContent ? "Confirm & Generate" : "Continue"}</button>
              </div>
            </>
          )}

          {/* #246: play-style step (games only) — skippable on purpose; skipping
              still lets the evidence-based re-ask propose a draft later. */}
          {step === 2 && (
            <>
              <div style={{ color: T.text, fontSize: 16, fontWeight: 700 }}>How do you play {gameName}?</div>
              <div style={{ color: T.textSecondary, fontSize: 12.5, lineHeight: 1.5, marginTop: 4 }}>
                Helps the AI pick clips and write titles that sound like you. Skip it and ClipFlow will ask again once it has seen a few of your sessions.
              </div>
              <textarea
                value={playStyle}
                onChange={(e) => setPlayStyle(e.target.value)}
                autoFocus
                placeholder={"e.g. \"I'm grinding ranked, trying to hit Diamond. Very competitive but I rage in a funny way.\""}
                style={{ width: "100%", minHeight: 110, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "12px 16px", color: T.text, fontSize: 13, fontFamily: T.font, outline: "none", marginTop: 14, marginBottom: 18, boxSizing: "border-box", resize: "vertical", lineHeight: 1.5 }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setPlayStyle(""); advance(); }} style={{ flex: 1, padding: 14, borderRadius: T.radius.md, border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Skip for now</button>
                <button onClick={advance} disabled={!playStyle.trim()} style={{ flex: 2, padding: 14, borderRadius: T.radius.md, border: "none", background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: T.font, opacity: !playStyle.trim() ? 0.4 : 1 }}>Save & Continue</button>
              </div>
            </>
          )}

          {step === 3 && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>{willResearch ? "🔎" : "⚙️"}</div>
              <div style={{ color: T.text, fontSize: 16, fontWeight: 700 }}>{willResearch ? `Researching ${gameName} in the background` : `Setting up ${gameName}...`}</div>
              {willResearch && <div style={{ color: T.textSecondary, fontSize: 12.5, marginTop: 8 }}>You can keep working — game knowledge lands on its own.</div>}
            </div>
          )}

          {step === 4 && (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ color: T.green, fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{gameName} Added!</div>
              <button onClick={() => onConfirm({ name: gameName, tag, hashtag, color, entryType, exe: exe ? [exe] : [], aiContextUser: playStyle.trim() })} style={{ width: "100%", padding: 14, borderRadius: T.radius.md, border: "none", background: T.green, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ GAME EDIT MODAL ============
export const GameEditModal = ({ game, gamesDb = [], onSave, onClose, aiReady = false }) => {
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
  const [updateThreshold, setUpdateThreshold] = useState(5);
  const [sessionCount, setSessionCount] = useState(0);
  const [artPath, setArtPath] = useState(null);
  const [artV, setArtV] = useState(0);
  const [artBusy, setArtBusy] = useState(false);
  const [artError, setArtError] = useState("");

  // Load game profile data (threshold + session count) on mount
  useEffect(() => {
    if (game.tag && window.clipflow.gameProfilesGet) {
      window.clipflow.gameProfilesGet(game.tag).then((profile) => {
        if (profile) {
          setUpdateThreshold(profile.updateThreshold || 5);
          setSessionCount(profile.sessionCount || 0);
        }
      });
    }
  }, [game.tag]);

  // Current tile art (Projects tab poster), keyed by game name on disk
  useEffect(() => {
    window.clipflow.gameArtList?.().then((m) => {
      const a = m?.[game.name];
      if (a) { setArtPath(a.path); setArtV(a.v); }
    });
  }, [game.name]);

  const artFetch = async () => {
    setArtBusy(true);
    setArtError("");
    const r = await window.clipflow.gameArtFetch?.(game.name);
    setArtBusy(false);
    if (r?.ok) { setArtPath(r.path); setArtV(Date.now()); }
    else if (r?.reason === "not-found") setArtError("Not on Steam — use Choose image instead");
    else setArtError("Couldn't reach Steam — check your connection");
  };

  const artChoose = async () => {
    const file = await window.clipflow.openFileDialog?.({ filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] }] });
    if (!file) return;
    const r = await window.clipflow.gameArtSetFile?.(game.name, file);
    if (r?.ok) { setArtPath(r.path); setArtV(Date.now()); setArtError(""); }
    else setArtError("Couldn't use that image");
  };

  const artClear = async () => {
    await window.clipflow.gameArtClear?.(game.name);
    setArtPath(null);
    setArtError("");
  };

  const handleResearch = async () => {
    if (!aiReady) return;
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
            {(() => { const dup = tag && gamesDb.some((g) => g.tag === tag && g.name !== game.name); return (<>
              <input value={tag} onChange={(e) => setTag(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${dup ? T.red : T.border}`, borderRadius: T.radius.md, padding: "12px 16px", color: T.text, fontSize: 14, fontWeight: 700, fontFamily: T.mono, outline: "none", marginTop: 8, boxSizing: "border-box", letterSpacing: "1px" }} />
              {dup && <div style={{ color: T.red, fontSize: 11, marginTop: 4 }}>Tag already in use by another entry</div>}
            </>); })()}
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
          <SectionLabel>Game Art</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8 }}>
            <div style={{ width: 44, height: 58, borderRadius: 9, overflow: "hidden", flexShrink: 0, border: `1px solid ${T.border}`, background: `${color}18`, display: "grid", placeItems: "center" }}>
              {artPath
                ? <img src={`${toFileUrl(artPath)}?v=${artV}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 11, fontWeight: 800, color: T.textTertiary, letterSpacing: "0.5px" }}>{tag}</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={artFetch} disabled={artBusy} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font, opacity: artBusy ? 0.6 : 1, whiteSpace: "nowrap" }}>
                  {artBusy ? "Searching..." : artPath ? "Refresh from Steam" : "Find on Steam"}
                </button>
                <button onClick={artChoose} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.04)", color: T.textSecondary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font, whiteSpace: "nowrap" }}>
                  Choose image…
                </button>
                {artPath && (
                  <button onClick={artClear} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font, whiteSpace: "nowrap" }}>
                    Remove
                  </button>
                )}
              </div>
              {artError
                ? <div style={{ color: T.yellow, fontSize: 11 }}>{artError}</div>
                : <div style={{ color: T.textTertiary, fontSize: 11 }}>The poster on the Projects tab tile. Steam games are fetched automatically.</div>}
            </div>
          </div>
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
                    disabled={researching || !aiReady}
                    style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${aiReady ? T.accentBorder : T.border}`, background: aiReady ? T.accentDim : "transparent", color: aiReady ? T.accentLight : T.textTertiary, fontSize: 11, fontWeight: 600, cursor: aiReady ? "pointer" : "not-allowed", fontFamily: T.font, opacity: researching ? 0.6 : 1, whiteSpace: "nowrap" }}
                  >
                    {researching ? "Researching..." : aiAutoContext ? "Refresh" : "Research Game"}
                  </button>
                </div>
                {!aiReady && (
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

              {/* Auto-update threshold stepper */}
              <div style={{ marginBottom: 14, background: "rgba(255,255,255,0.02)", borderRadius: T.radius.md, padding: "14px 16px" }}>
                <SectionLabel>Play Style Auto-Update</SectionLabel>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                  <span style={{ color: T.textSecondary, fontSize: 12, whiteSpace: "nowrap" }}>Update after every</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    <button
                      onClick={() => setUpdateThreshold(Math.max(3, updateThreshold - 1))}
                      style={{ width: 28, height: 28, borderRadius: "6px 0 0 6px", border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.04)", color: updateThreshold <= 3 ? T.textTertiary : T.text, fontSize: 16, cursor: updateThreshold <= 3 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font }}
                    >−</button>
                    <div style={{ width: 36, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, color: T.accentLight, fontSize: 14, fontWeight: 700, fontFamily: T.mono }}>
                      {updateThreshold}
                    </div>
                    <button
                      onClick={() => setUpdateThreshold(Math.min(20, updateThreshold + 1))}
                      style={{ width: 28, height: 28, borderRadius: "0 6px 6px 0", border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.04)", color: updateThreshold >= 20 ? T.textTertiary : T.text, fontSize: 16, cursor: updateThreshold >= 20 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font }}
                    >+</button>
                  </div>
                  <span style={{ color: T.textSecondary, fontSize: 12, whiteSpace: "nowrap" }}>sessions</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, (sessionCount / updateThreshold) * 100)}%`, height: "100%", borderRadius: 2, background: sessionCount >= updateThreshold ? T.green : T.accent, transition: "width 0.3s" }} />
                  </div>
                  <span style={{ color: T.textTertiary, fontSize: 11, fontFamily: T.mono, whiteSpace: "nowrap" }}>
                    {sessionCount} / {updateThreshold}
                  </span>
                </div>
                <div style={{ color: T.textTertiary, fontSize: 11, marginTop: 6 }}>
                  AI will analyze recent transcripts and suggest play style updates after {updateThreshold} pipeline runs
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, borderRadius: T.radius.md, border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
          <button onClick={() => {
            const tagDup = tag && gamesDb.some((g) => g.tag === tag && g.name !== game.name);
            if (tagDup) return;
            // Save threshold to game profiles backend
            if (window.clipflow.gameProfilesSetThreshold) {
              window.clipflow.gameProfilesSetThreshold(game.tag, updateThreshold);
            }
            onSave({ ...game, tag, hashtag, color, dayCount, active, aiContextUser: aiPlayStyle, aiContextAuto: aiAutoContext, aiResearchedAt });
          }} style={{ flex: 2, padding: 14, borderRadius: T.radius.md, border: "none", background: (tag && gamesDb.some((g) => g.tag === tag && g.name !== game.name)) ? "rgba(255,255,255,0.1)" : T.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: (tag && gamesDb.some((g) => g.tag === tag && g.name !== game.name)) ? "not-allowed" : "pointer", fontFamily: T.font }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
};

// ============ PROFILE DIFF MODAL ============
// Line-level diff helpers: lines are compared whitespace/case-insensitively so
// cosmetic tweaks don't light up as "new". Three states per line (#224):
//   (none)    — the exact line exists on the other side
//   reworded  — no exact match, but a line over there shares most of its words
//               (amber on BOTH sides; covers rephrased and merged bullets)
//   added/dropped — no exact match and nothing similar (green in Proposed /
//               red tint in Current)
const normLine = (l) => l.replace(/\s+/g, " ").trim().toLowerCase();
const lineSetOf = (text) => new Set((text || "").split("\n").map(normLine).filter(Boolean));
const wordCountOf = (text) => (text || "").trim().split(/\s+/).filter(Boolean).length;
const wordSetOf = (l) => new Set(normLine(l).split(" ").filter(Boolean));
// Overlap relative to the SHORTER line, so a bullet merged into a longer one
// still reads as "reworded" rather than dropped+new.
const overlapOf = (a, b) => {
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / Math.min(a.size, b.size);
};
const REWORD_THRESHOLD = 0.6;
const REWORD_TINT = "rgba(251,191,36,0.14)";

// One diff pane: highlighted read view with an Edit pencil that swaps in an
// auto-sized textarea; blur returns to the highlighted view with edits kept.
function ProfilePane({ label, dotColor, tint, text, onChange, otherText, highlightColor, emptyLabel }) {
  const [editing, setEditing] = useState(false);
  const words = wordCountOf(text);
  const lines = (text || "").split("\n");
  const otherLineSet = lineSetOf(otherText);
  const otherWordSets = (otherText || "").split("\n").map(wordSetOf).filter((s) => s.size > 0);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
        <span style={{ color: T.textSecondary, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
        <div style={{ flex: 1 }} />
        {/* Word counter — amber past 300 words, the update prompt's own budget */}
        <span style={{ fontSize: 10.5, fontFamily: T.mono, color: words > 300 ? T.yellow : T.textMuted }} title={words > 300 ? "Over ~300 words — consider merging or cutting bullets so AI generation stays sharp" : "Word count"}>{words}w</span>
        <button
          onClick={() => setEditing(!editing)}
          title={editing ? "Done editing" : "Edit this text"}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 5, border: `1px solid ${editing ? T.accentBorder : T.border}`, background: editing ? T.accentDim : "transparent", color: editing ? T.accentLight : T.textTertiary, fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          {editing ? "Done" : "Edit"}
        </button>
      </div>
      {editing ? (
        <textarea
          autoFocus
          ref={(el) => { if (el && !el.dataset.sized) { el.dataset.sized = "1"; el.style.height = Math.max(160, el.scrollHeight + 2) + "px"; } }}
          value={text}
          onChange={(e) => {
            onChange(e.target.value);
            const el = e.target;
            if (el.scrollHeight > el.clientHeight) el.style.height = el.scrollHeight + 2 + "px";
          }}
          onBlur={() => setEditing(false)}
          style={{ width: "100%", minHeight: 160, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.accentBorder}`, borderRadius: T.radius.md, padding: "14px 16px", color: T.text, fontSize: 12, lineHeight: 1.7, fontFamily: T.font, outline: "none", resize: "vertical" }}
        />
      ) : (
        <div
          onDoubleClick={() => setEditing(true)}
          title="Double-click to edit"
          style={{ background: tint.bg, border: `1px solid ${tint.border}`, borderRadius: T.radius.md, padding: "14px 16px", color: T.text, fontSize: 12, lineHeight: 1.7, minHeight: 120, cursor: "text" }}
        >
          {text
            ? lines.map((line, i) => {
                const n = normLine(line);
                let lineColor = null;
                if (n && !otherLineSet.has(n)) {
                  const ws = wordSetOf(line);
                  const reworded = otherWordSets.some((o) => overlapOf(ws, o) >= REWORD_THRESHOLD);
                  lineColor = reworded ? REWORD_TINT : highlightColor;
                }
                return (
                  <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", ...(lineColor ? { background: lineColor, borderRadius: 4, padding: "1px 4px", margin: "1px -4px" } : {}) }}>
                    {line || " "}
                  </div>
                );
              })
            : <span style={{ color: T.textMuted, fontStyle: "italic" }}>{emptyLabel}</span>}
        </div>
      )}
    </div>
  );
}

export const ProfileDiffModal = ({ gameTag, gameName, oldProfile, newProfile, onAccept, onDismiss }) => {
  const [accepting, setAccepting] = useState(false);
  // Both panes are editable; the button you press saves THAT pane's text.
  const [curText, setCurText] = useState(oldProfile || "");
  const [newText, setNewText] = useState(newProfile || "");
  // #246: no existing profile → this isn't an update, it's the first ask.
  // Reframe as an evidence draft ("here's what we've noticed — confirm or
  // tweak") instead of a diff against nothing.
  const isFirstDraft = !(oldProfile || "").trim();

  const handleAccept = async () => {
    setAccepting(true);
    try {
      // gameName rides along so a profile created here gets its display name (#246)
      await window.clipflow.gameProfilesUpdatePlayStyle(gameTag, newText, gameName);
      await window.clipflow.gameProfilesResetCount(gameTag);
      onAccept(newText);
    } catch (err) {
      console.error("Failed to save profile update:", err);
    } finally {
      setAccepting(false);
    }
  };

  const handleDismiss = async () => {
    try {
      // Honor edits made to the Current pane — "Keep Current" keeps what the
      // user sees there, not a stale copy from before their edits.
      if (curText !== (oldProfile || "")) {
        await window.clipflow.gameProfilesUpdatePlayStyle(gameTag, curText, gameName);
      }
      await window.clipflow.gameProfilesResetCount(gameTag);
    } catch (err) {
      console.error("Failed to save profile:", err);
    }
    // #246: callers write-through to gamesDb.aiContextUser when text was kept
    onDismiss(curText !== (oldProfile || "") ? curText : null);
  };

  const curEdited = curText !== (oldProfile || "");

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20 }}>
      <div style={{ background: T.surface, borderRadius: T.radius.xl, maxWidth: 720, width: "100%", border: `1px solid ${T.accentBorder}`, boxShadow: "0 24px 80px rgba(139,92,246,0.2)", overflow: "hidden", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ background: T.accentGlow, padding: "20px 24px", borderBottom: `1px solid ${T.accentBorder}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: T.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🧠</div>
            <div>
              <div style={{ color: T.text, fontSize: 16, fontWeight: 700 }}>{isFirstDraft ? `How do you play ${gameName}?` : `Play Style Update — ${gameName}`}</div>
              <div style={{ color: T.textTertiary, fontSize: 12, marginTop: 2 }}>{isFirstDraft ? "Based on your recent sessions, here's what we've noticed — accept it, or edit it to match how you actually play" : "Green = added · red = removed · amber = reworded, same content on both sides · both sides editable"}</div>
            </div>
          </div>
        </div>

        {/* Diff content — first draft shows a single evidence pane (a diff
            against an empty Current is all-green noise, #246) */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: isFirstDraft ? "1fr" : "1fr 1fr", gap: 16 }}>
            {!isFirstDraft && (
              <ProfilePane
                label="Current"
                dotColor={T.red}
                tint={{ bg: "rgba(248,113,113,0.04)", border: "rgba(248,113,113,0.15)" }}
                text={curText}
                onChange={setCurText}
                otherText={newText}
                highlightColor="rgba(248,113,113,0.14)"
                emptyLabel="(empty)"
              />
            )}
            <ProfilePane
              label={isFirstDraft ? "What we've noticed" : "Proposed"}
              dotColor={T.green}
              tint={{ bg: "rgba(52,211,153,0.04)", border: "rgba(52,211,153,0.15)" }}
              text={newText}
              onChange={setNewText}
              otherText={isFirstDraft ? newText : curText}
              highlightColor="rgba(52,211,153,0.18)"
              emptyLabel="(empty)"
            />
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 10, flexShrink: 0 }}>
          <button onClick={handleDismiss} style={{ flex: 1, padding: 12, borderRadius: T.radius.md, border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>{isFirstDraft ? "Not now" : curEdited ? "Keep Current (edited)" : "Keep Current"}</button>
          <button onClick={handleAccept} disabled={accepting} style={{ flex: 2, padding: 12, borderRadius: T.radius.md, border: "none", background: T.green, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.font, opacity: accepting ? 0.6 : 1 }}>{accepting ? "Saving..." : isFirstDraft ? "Save Play Style" : "Accept Update"}</button>
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
