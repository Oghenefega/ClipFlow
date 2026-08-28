import React, { useState, useEffect } from "react";
import T from "../styles/theme";
import PLATFORM_BRAND from "../styles/platformBrand";
import { CopyIconButton, GamePill } from "../components/shared";
import PlatformIcon from "../components/PlatformIcon";
import { buildStarterYtDescription } from "../utils/ytDescriptionTemplate";
import { TAGS_MAX, parseTags, tagsLength, tagsToText } from "../utils/ytTags";

const PLATFORMS = [
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
];

// Matches the queue card's label voice (#325) — small, uppercase, wide-tracked.
const LBL = { fontSize: 10, fontWeight: 800, letterSpacing: 0.7, color: T.labelStrong, textTransform: "uppercase" };
const BTN = { padding: "4px 10px", borderRadius: 6, background: "rgba(var(--lift),0.04)", border: `1px solid ${T.border}`, color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font };
const FIELD = { width: "100%", background: "rgba(var(--lift),0.05)", border: `1px solid ${T.accentBorder}`, borderRadius: 8, padding: "8px 10px", color: T.text, fontSize: 12.5, fontFamily: T.font, outline: "none", boxSizing: "border-box" };

/**
 * #324: Captions & Descriptions, as the Queue tab's right-hand panel.
 *
 * Was a full-width block below the Publish Log — three scrolls down, with every
 * game's set on screen at once. Now it pins beside the queue and shows ONE game:
 * whichever the selected clip belongs to (`scopeGame`, resolved by QueueView
 * through the same lookup the publish path uses). Every other game collapses
 * behind the "Other games" reveal.
 *
 * The YouTube set is per-game, so scoping it is exact. TikTok/Instagram/Facebook
 * are ONE template each shared by every game — the panel labels them
 * "GLOBAL · ALL GAMES" rather than implying they belong to the scoped game.
 * (Making them per-game is a storage change; it is its own piece of work.)
 *
 * This component only ever renders inside QueueView — it is not a route.
 */
export default function CaptionsView({ ytDescriptions, setYtDescriptions, captionTemplates, setCaptionTemplates, platformOptions, setPlatformOptions, gamesDb = [], scopeGame = null }) {
  // A game opened by hand from the "Other games" list. The selected clip always
  // wins, so this clears the moment the scoped game changes underneath it.
  const [pinned, setPinned] = useState(null);
  const [showOthers, setShowOthers] = useState(false);
  const [editingYt, setEditingYt] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editPlat, setEditPlat] = useState(null);
  const [editTpl, setEditTpl] = useState("");

  const scopeName = scopeGame?.name || null;
  useEffect(() => { setPinned(null); setEditingYt(false); }, [scopeName]);

  const activeGame = pinned || scopeName;
  // The pill has to describe what the panel is SHOWING. scopeGame's tag/colour
  // belong to the selected clip, so a hand-opened game must resolve its own from
  // gamesDb — otherwise the header reads "RL" over Arc Raiders' description.
  const activeMeta = pinned
    ? { tag: (gamesDb.find((g) => g.name === pinned)?.tag || pinned).toUpperCase(), color: gamesDb.find((g) => g.name === pinned)?.color || T.accent }
    : { tag: (scopeGame?.tag || activeGame || "").toUpperCase(), color: scopeGame?.color || T.accent };
  const data = (activeGame && ytDescriptions[activeGame]) || null;
  const hasEntry = !!data;
  const otherGames = Object.keys(ytDescriptions).filter((g) => g !== activeGame).sort();
  // With nothing scoped there is no content above, so the list opens itself —
  // the panel is never a dead end.
  const othersOpen = showOthers || !activeGame;

  const parsedTags = parseTags(editTags);
  const tagsLen = tagsLength(parsedTags);
  const tagsOver = tagsLen > TAGS_MAX;

  const startEdit = () => {
    setEditTitle(data?.ytTitle || (activeGame ? activeGame + " Shorts" : ""));
    setEditDesc(data?.desc || "");
    setEditTags((data?.tags || []).join(", "));
    setEditingYt(true);
  };

  const handleSave = () => {
    if (tagsOver) return;
    setYtDescriptions((p) => ({
      ...p,
      [activeGame]: { ...p[activeGame], desc: editDesc, ytTitle: editTitle, tags: parsedTags },
    }));
    setEditingYt(false);
  };

  // Seeds the same starter description a newly-added game gets (App.js), for a
  // legacy game that never received one. Without this a scoped panel for such a
  // game would have nothing to show and no way forward.
  const handleRegenerate = () => {
    const entry = gamesDb.find((g) => g.name === activeGame);
    const hashtag = entry?.hashtag || (activeGame || "").toLowerCase().replace(/\s+/g, "");
    setEditDesc(buildStarterYtDescription(activeGame, hashtag));
  };

  const openGame = (g) => { setPinned(g); setEditingYt(false); };

  const yt = PLATFORM_BRAND.youtube;

  return (
    <div style={{ position: "sticky", top: 12, border: `1px solid ${T.border}`, borderRadius: 14, background: T.surface, overflow: "hidden", maxHeight: "calc(100vh - 160px)", overflowY: "auto" }}>
      {/* Panel header */}
      <div style={{ padding: "13px 15px 12px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: -0.2, color: T.text }}>Captions &amp; Descriptions</div>
        <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 2 }}>Templates the queue publishes from</div>
      </div>

      {activeGame ? (
        <>
          {/* Which game this panel is showing, and why */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 15px", borderBottom: `1px solid ${T.border}`, background: "rgba(var(--lift),0.02)" }}>
            <GamePill tag={activeMeta.tag} color={activeMeta.color} variant="solid" />
            <span style={{ fontSize: 10.5, color: T.textTertiary }}>
              {pinned ? "opened by hand" : "from the selected clip"}
            </span>
            {pinned && scopeName && (
              <button onClick={() => setPinned(null)} style={{ ...BTN, marginLeft: "auto", padding: "3px 9px", fontSize: 10.5 }}>Back to {scopeName}</button>
            )}
          </div>

          {/* ---- YouTube: the per-game set ---- */}
          <div style={{ borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 15px", background: yt.band }}>
              <PlatformIcon platform="youtube" size={15} />
              <span style={{ fontSize: 12.5, fontWeight: 800, color: yt.accent }}>YouTube</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
                {editingYt ? (
                  <>
                    <button onClick={() => setEditingYt(false)} style={BTN}>Cancel</button>
                    <button
                      onClick={handleSave}
                      disabled={tagsOver}
                      title={tagsOver ? "Tags are over YouTube's 500-character limit" : ""}
                      style={{ ...BTN, background: tagsOver ? "rgba(var(--lift),0.06)" : T.green, border: "none", color: tagsOver ? T.textMuted : "#fff", cursor: tagsOver ? "not-allowed" : "pointer" }}
                    >Save</button>
                  </>
                ) : hasEntry ? (
                  <>
                    <button onClick={startEdit} style={BTN}>Edit</button>
                    <CopyIconButton value={data.desc} title="Copy description" />
                    <button
                      onClick={() => { setYtDescriptions((p) => { const n = { ...p }; delete n[activeGame]; return n; }); setPinned(null); }}
                      title={`Delete ${activeGame}'s description`}
                      style={{ ...BTN, background: T.redDim, border: `1px solid ${T.redBorder}`, color: T.red }}
                    >Del</button>
                  </>
                ) : null}
              </div>
            </div>

            {editingYt ? (
              <div style={{ padding: "0 15px 12px" }}>
                <div style={{ ...LBL, margin: "10px 0 5px" }}>Title</div>
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={FIELD} />

                <div style={{ display: "flex", alignItems: "center", margin: "12px 0 5px" }}>
                  <div style={LBL}>Description</div>
                  <button onClick={handleRegenerate} style={{ marginLeft: "auto", padding: "3px 9px", borderRadius: 6, background: T.accentDim, border: `1px solid ${T.accentBorder}`, color: T.accentLight, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>
                    Regenerate
                  </button>
                </div>
                <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={9} style={{ ...FIELD, lineHeight: 1.6, resize: "vertical" }} />
                <div style={{ color: T.textMuted, fontSize: 10, marginTop: 5, lineHeight: 1.5 }}>
                  Variables: <span style={{ color: T.textTertiary }}>{"{title}"}</span> clip title
                  {" · "}<span style={{ color: T.textTertiary }}>{"#{gametitle}"}</span> game hashtag
                  {" · "}<span style={{ color: T.textTertiary }}>{"{schedule}"}</span> stream schedule
                </div>

                <div style={{ display: "flex", alignItems: "center", margin: "12px 0 5px" }}>
                  <div style={LBL}>YouTube Tags</div>
                  <span style={{ marginLeft: "auto", fontSize: 10, color: tagsOver ? T.red : T.textMuted }}>{tagsLen} / {TAGS_MAX}</span>
                </div>
                <input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="rocket league, rocket league clips, gaming shorts"
                  style={{ ...FIELD, border: `1px solid ${tagsOver ? T.red : T.accentBorder}` }}
                />
                <div style={{ color: tagsOver ? T.red : T.textMuted, fontSize: 10, marginTop: 5, lineHeight: 1.5 }}>
                  {tagsOver
                    ? `Over YouTube's 500-character tag limit by ${tagsLen - TAGS_MAX} — shorten the list to save.`
                    : "Comma-separated. Sent with every Short for this game."}
                </div>
              </div>
            ) : hasEntry ? (
              <div style={{ padding: "0 15px 12px" }}>
                <div style={{ ...LBL, margin: "10px 0 5px" }}>Title</div>
                <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, background: "rgba(var(--lift),0.03)", padding: "7px 10px", fontSize: 12.5, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {data.ytTitle || activeGame + " Shorts"}
                </div>

                <div style={{ display: "flex", alignItems: "center", margin: "11px 0 5px" }}>
                  <div style={LBL}>Description</div>
                  <span style={{ marginLeft: "auto", fontSize: 10.5, color: T.textTertiary }}>{(data.desc || "").length} chars</span>
                </div>
                <div style={{ position: "relative", border: `1px solid ${T.border}`, borderRadius: 8, background: "rgba(var(--lift),0.03)", padding: "9px 11px", fontSize: 12, color: T.textSecondary, lineHeight: 1.6, maxHeight: 118, overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {data.desc || <span style={{ color: T.textMuted, fontStyle: "italic" }}>Empty</span>}
                  {/* Fade instead of a scrollbar — the panel is a reference view;
                      Edit is where the whole thing is readable. */}
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 32, background: `linear-gradient(180deg, rgba(17,18,24,0), ${T.surface})`, pointerEvents: "none" }} />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "11px 0 5px" }}>
                  <div style={LBL}>Tags</div>
                  {data.tags?.length > 0 && <CopyIconButton value={tagsToText(data.tags)} title="Copy tags" />}
                  <span style={{ marginLeft: "auto", fontSize: 10.5, color: T.textTertiary }}>{tagsLength(data.tags || [])}/{TAGS_MAX}</span>
                </div>
                {data.tags?.length ? (
                  // Capped the same way the description is: a real game carries 20+
                  // tags, and letting them run pushes the platform templates below
                  // the fold — which is the scrolling this panel exists to end.
                  <div style={{ position: "relative", maxHeight: 74, overflow: "hidden" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {data.tags.map((t) => (
                        <span key={t} style={{ fontSize: 11.5, color: T.textSecondary, background: "rgba(var(--lift),0.05)", border: `1px solid ${T.border}`, borderRadius: 5, padding: "2px 7px" }}>{t}</span>
                      ))}
                    </div>
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 26, background: `linear-gradient(180deg, rgba(17,18,24,0), ${T.surface})`, pointerEvents: "none" }} />
                  </div>
                ) : (
                  <span style={{ fontSize: 11.5, color: T.textMuted, fontStyle: "italic" }}>No tags</span>
                )}
              </div>
            ) : (
              <div style={{ padding: "14px 15px 16px" }}>
                <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.6, marginBottom: 10 }}>
                  {activeGame} has no YouTube description yet — its clips publish with just the title.
                </div>
                <button
                  onClick={() => { handleRegenerate(); setEditTitle(activeGame + " Shorts"); setEditTags(""); setEditingYt(true); }}
                  style={{ ...BTN, background: T.accentDim, border: `1px solid ${T.accentBorder}`, color: T.accentLight }}
                >Create one from the template</button>
              </div>
            )}
          </div>

          {/* ---- TikTok / Instagram / Facebook: one template each, all games ---- */}
          <div style={{ padding: "11px 15px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 9 }}>
              <span style={LBL}>Other platforms</span>
              <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, padding: "1px 8px", borderRadius: 20, border: `1px solid ${T.border}`, color: T.textTertiary, background: "rgba(var(--lift),0.03)" }}>
                GLOBAL &middot; ALL GAMES
              </span>
            </div>

            {PLATFORMS.map((p) => {
              const brand = PLATFORM_BRAND[p.id];
              const isEditing = editPlat === p.id;
              return (
                <div key={p.id} style={{ padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <PlatformIcon platform={p.id} size={14} />
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: brand.accent, flexShrink: 0 }}>{p.label}</span>
                    {!isEditing && (
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {captionTemplates[p.id] || "{title} #fyp"}
                      </span>
                    )}
                    <div style={{ marginLeft: isEditing ? "auto" : 0, display: "flex", gap: 5, flexShrink: 0 }}>
                      {isEditing ? (
                        <>
                          <button onClick={() => setEditPlat(null)} style={BTN}>Cancel</button>
                          <button onClick={() => { setCaptionTemplates((pr) => ({ ...pr, [p.id]: editTpl })); setEditPlat(null); }} style={{ ...BTN, background: T.green, border: "none", color: "#fff" }}>Save</button>
                        </>
                      ) : (
                        <button onClick={() => { setEditPlat(p.id); setEditTpl(captionTemplates[p.id] || ""); }} style={BTN}>Edit</button>
                      )}
                    </div>
                  </div>
                  {isEditing && (
                    <input value={editTpl} onChange={(e) => setEditTpl(e.target.value)} autoFocus style={{ ...FIELD, marginTop: 7 }} />
                  )}
                </div>
              );
            })}

            {/* TikTok's post mode lives with TikTok's template, as it always has */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 9 }}>
              <span style={{ ...LBL, color: T.textTertiary }}>Post mode</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
                {[
                  { value: "direct_post", label: "Direct" },
                  { value: "inbox", label: "Inbox" },
                ].map(({ value, label }) => {
                  const isActive = (platformOptions?.tiktokPostMode || "direct_post") === value;
                  return (
                    <button
                      key={value}
                      onClick={() => setPlatformOptions?.((p) => ({ ...p, tiktokPostMode: value }))}
                      style={{ ...BTN, padding: "3px 10px", fontSize: 10.5, background: isActive ? T.green : "rgba(var(--lift),0.04)", border: `1px solid ${isActive ? T.green : T.border}`, color: isActive ? "#fff" : T.textSecondary }}
                    >{label}</button>
                  );
                })}
              </div>
            </div>

            <div style={{ fontSize: 10.5, color: T.textTertiary, lineHeight: 1.55, marginTop: 9, paddingTop: 9, borderTop: `1px solid ${T.border}` }}>
              These three are one template each, shared by every game &mdash;{" "}
              <span style={{ color: T.textSecondary }}>{"#{gametitle}"}</span> fills in the right hashtag per clip.
            </div>
          </div>
        </>
      ) : (
        <div style={{ padding: "26px 18px", textAlign: "center" }}>
          <div style={{ fontSize: 12.5, color: T.textSecondary, fontWeight: 600 }}>No clip selected</div>
          <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 5, lineHeight: 1.6 }}>
            Pick a clip in the queue and its game&rsquo;s captions land here.<br />Or open any game below.
          </div>
        </div>
      )}

      {/* ---- Every other game, one click away ---- */}
      <button
        onClick={() => setShowOthers((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 15px", border: "none", borderTop: `1px solid ${T.border}`, background: "rgba(var(--lift),0.015)", color: T.textSecondary, fontFamily: T.font, fontSize: 11.5, fontWeight: 700, cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ display: "inline-block", fontSize: 9, color: T.textTertiary, transform: othersOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>{"▶"}</span>
        {activeGame ? "Other games" : "All games"}
        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: T.textTertiary, background: "rgba(var(--lift),0.05)", borderRadius: 20, padding: "1px 8px" }}>{otherGames.length}</span>
      </button>

      {othersOpen && (
        <div style={{ borderTop: `1px solid ${T.border}` }}>
          {otherGames.length === 0 && (
            <div style={{ padding: "12px 15px", fontSize: 11, color: T.textMuted, fontStyle: "italic" }}>No other games set up.</div>
          )}
          {otherGames.map((g) => {
            const d = ytDescriptions[g] || {};
            return (
              <div
                key={g}
                onClick={() => openGame(g)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 15px", borderBottom: `1px solid ${T.border}`, cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(var(--lift),0.025)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g}</span>
                <span style={{ marginLeft: "auto", fontSize: 10.5, color: T.textTertiary, flexShrink: 0 }}>
                  {d.tags?.length ? `${d.tags.length} tag${d.tags.length === 1 ? "" : "s"}` : "no tags"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
