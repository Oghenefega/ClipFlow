import React, { useState, useEffect, useRef } from "react";
import T from "../styles/theme";
import PLATFORM_BRAND from "../styles/platformBrand";
import { CopyIconButton, GamePill, TagInput } from "../components/shared";
import PlatformIcon from "../components/PlatformIcon";
import { buildStarterYtDescription } from "../../shared/ytDescriptionTemplate";
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
 * #346: what IS per-game for them is the tag line ({gametags}, gamesDb
 * captionTags), edited on the Game tags row below the three templates.
 *
 * Every field is click-to-edit: clicking the preview opens the editor in place,
 * clicking away saves, Escape backs out without saving (#346).
 *
 * This component only ever renders inside QueueView — it is not a route.
 */
export default function CaptionsView({ ytDescriptions, setYtDescriptions, captionTemplates, setCaptionTemplates, platformOptions, setPlatformOptions, gamesDb = [], setGamesDb, scopeGame = null }) {
  // A game opened by hand from the "Other games" list. The selected clip always
  // wins, so this clears the moment the scoped game changes underneath it.
  const [pinned, setPinned] = useState(null);
  const [showOthers, setShowOthers] = useState(false);
  // #346: which YouTube field is open in place — null | "desc" | "tags".
  const [editingField, setEditingField] = useState(null);
  const [editDesc, setEditDesc] = useState("");
  // Committed pills and the word still being typed, held apart so the counter
  // can price both (see TagInput in components/shared).
  const [editTags, setEditTags] = useState([]);
  const [editTagsDraft, setEditTagsDraft] = useState("");
  const [editPlat, setEditPlat] = useState(null);
  const [editTpl, setEditTpl] = useState("");
  const [editingGameTags, setEditingGameTags] = useState(false);
  const [editGameTags, setEditGameTags] = useState("");
  // Which label just flashed "Saved ✓" — a blur-save has no button press, so it
  // needs its own visible confirmation.
  const [savedFlash, setSavedFlash] = useState(null);
  const flashTimer = useRef(null);
  const flash = (k) => { setSavedFlash(k); clearTimeout(flashTimer.current); flashTimer.current = setTimeout(() => setSavedFlash(null), 1600); };
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  // Escape tears an editor down without saving; this flag makes the blur that
  // follows a no-op (same trick TagInput uses internally).
  const skipSave = useRef(false);

  const scopeName = scopeGame?.name || null;
  useEffect(() => { setPinned(null); setEditingField(null); setEditPlat(null); setEditingGameTags(false); setSavedFlash(null); }, [scopeName]);

  const activeGame = pinned || scopeName;
  // The pill has to describe what the panel is SHOWING. scopeGame's tag/colour
  // belong to the selected clip, so a hand-opened game must resolve its own from
  // gamesDb — otherwise the header reads "RL" over Arc Raiders' description.
  // Colour fallback is a literal, not T.accent — GamePill string-appends an
  // alpha suffix, which silently drops a var() value (#328 rule; fixed in #346).
  const activeMeta = pinned
    ? { tag: (gamesDb.find((g) => g.name === pinned)?.tag || pinned).toUpperCase(), color: gamesDb.find((g) => g.name === pinned)?.color || "#8b5cf6" }
    : { tag: (scopeGame?.tag || activeGame || "").toUpperCase(), color: scopeGame?.color || "#8b5cf6" };
  const data = (activeGame && ytDescriptions[activeGame]) || null;
  // The scoped game's gamesDb record — where the per-game tag line lives (#346).
  const gameRecord = gamesDb.find((g) => g.name === activeGame) || null;
  const hasEntry = !!data;
  // #287: every library entry, not only the ones that already have a description —
  // a migration-injected entry (Just Chatting) or one deleted with Del could never
  // be opened again otherwise. Entries without one are marked in the list and open
  // onto the "Create one from the template" state above. Legacy ytDescriptions keys
  // with no gamesDb record still show, as before.
  const otherGames = [...new Set([...gamesDb.map((g) => g?.name), ...Object.keys(ytDescriptions)])]
    .filter((g) => g && g !== activeGame)
    .sort();
  // With nothing scoped there is no content above, so the list opens itself —
  // the panel is never a dead end.
  const othersOpen = showOthers || !activeGame;

  // Prices the half-typed word too, so Save can't stay enabled on a list that is
  // one commit away from being over budget.
  const parsedTags = parseTags([...editTags, editTagsDraft].join(","));
  const tagsLen = tagsLength(parsedTags);
  const tagsOver = tagsLen > TAGS_MAX;

  const startEditDesc = () => {
    setEditDesc(data?.desc || "");
    setEditingField("desc");
  };
  const saveDesc = () => {
    if (skipSave.current) { skipSave.current = false; setEditingField(null); return; }
    setYtDescriptions((p) => ({ ...p, [activeGame]: { ...p[activeGame], desc: editDesc } }));
    setEditingField(null);
    flash("desc");
  };

  const startEditTags = () => {
    setEditTags(data?.tags || []);
    setEditTagsDraft("");
    setEditingField("tags");
  };
  // TagInput hands the finished list to onCommitBlur — save from the argument,
  // never from state. Over YouTube's 500-char budget the write is refused and
  // the editor stays open (red) so nothing is silently lost or clamped.
  const saveTags = (finalTags) => {
    if (tagsLength(finalTags) > TAGS_MAX) return;
    setYtDescriptions((p) => ({ ...p, [activeGame]: { ...p[activeGame], tags: finalTags } }));
    setEditingField(null);
    flash("tags");
  };

  // The same starter description a newly-added game gets (App.js), for a legacy
  // game that never received one.
  const starterDesc = () => {
    const hashtag = gameRecord?.hashtag || (activeGame || "").toLowerCase().replace(/\s+/g, "");
    return buildStarterYtDescription(activeGame, hashtag);
  };
  // Seeds the starter into the OPEN editor rather than writing it — blur saves,
  // Escape backs out, so regenerating over a real description stays undoable.
  const handleRegenerate = () => {
    setEditDesc(starterDesc());
    setEditingField("desc");
  };

  const openGame = (g) => { setPinned(g); setEditingField(null); setEditPlat(null); setEditingGameTags(false); };

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
                {hasEntry && (
                  <button
                    onClick={() => {
                      // #287: one click used to drop the description for good, with no
                      // way back. Same native confirm the placeholder-title publish check uses.
                      if (!window.confirm(`Delete ${activeGame}'s YouTube description and tags?\n\nIts clips will publish with just the title until you add one again from "Other games".`)) return;
                      setYtDescriptions((p) => { const n = { ...p }; delete n[activeGame]; return n; });
                      setPinned(null);
                    }}
                    title={`Delete ${activeGame}'s description`}
                    style={{ ...BTN, background: T.redDim, border: `1px solid ${T.redBorder}`, color: T.red }}
                  >Del</button>
                )}
              </div>
            </div>

            {hasEntry ? (
              <div style={{ padding: "0 15px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "11px 0 5px" }}>
                  <div style={LBL}>Description</div>
                  {!!data.desc && <CopyIconButton value={data.desc} title="Copy description" />}
                  <button onClick={handleRegenerate} style={{ padding: "2px 8px", borderRadius: 6, background: T.accentDim, border: `1px solid ${T.accentBorder}`, color: T.accentLight, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>
                    Regenerate
                  </button>
                  {savedFlash === "desc" && <span style={{ fontSize: 10, fontWeight: 700, color: T.green }}>Saved ✓</span>}
                  <span style={{ marginLeft: "auto", fontSize: 10.5, color: T.textTertiary }}>{(editingField === "desc" ? editDesc : data.desc || "").length} chars</span>
                </div>
                {editingField === "desc" ? (
                  <>
                    <textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") { skipSave.current = true; e.currentTarget.blur(); } }}
                      onBlur={saveDesc}
                      autoFocus
                      rows={9}
                      style={{ ...FIELD, lineHeight: 1.6, resize: "vertical" }}
                    />
                    <div style={{ color: T.textMuted, fontSize: 10, marginTop: 5, lineHeight: 1.5 }}>
                      Variables: <span style={{ color: T.textTertiary }}>{"{title}"}</span> clip title
                      {" · "}<span style={{ color: T.textTertiary }}>{"#{gametitle}"}</span> game hashtag
                      {" · "}<span style={{ color: T.textTertiary }}>{"{gametags}"}</span> game tag line
                      {" · "}<span style={{ color: T.textTertiary }}>{"{schedule}"}</span> stream schedule
                    </div>
                  </>
                ) : (
                  <div
                    onClick={startEditDesc}
                    title="Click to edit"
                    style={{ position: "relative", border: `1px solid ${T.border}`, borderRadius: 8, background: "rgba(var(--lift),0.03)", padding: "9px 11px", fontSize: 12, color: T.textSecondary, lineHeight: 1.6, maxHeight: 118, overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word", cursor: "text" }}
                  >
                    {data.desc || <span style={{ color: T.textMuted, fontStyle: "italic" }}>Empty — click to write one</span>}
                    {/* Fade instead of a scrollbar — the panel is a reference view;
                        clicking in is where the whole thing is readable. */}
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 32, background: `linear-gradient(180deg, rgba(17,18,24,0), ${T.surface})`, pointerEvents: "none" }} />
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "11px 0 5px" }}>
                  <div style={LBL}>Tags</div>
                  {editingField !== "tags" && data.tags?.length > 0 && <CopyIconButton value={tagsToText(data.tags)} title="Copy tags" />}
                  {savedFlash === "tags" && <span style={{ fontSize: 10, fontWeight: 700, color: T.green }}>Saved ✓</span>}
                  <span style={{ marginLeft: "auto", fontSize: 10.5, color: editingField === "tags" && tagsOver ? T.red : T.textTertiary }}>
                    {editingField === "tags" ? tagsLen : tagsLength(data.tags || [])}/{TAGS_MAX}
                  </span>
                </div>
                {editingField === "tags" ? (
                  <>
                    <TagInput
                      tags={editTags}
                      draft={editTagsDraft}
                      invalid={tagsOver}
                      autoFocus
                      minHeight={44}
                      placeholder="rocket league, rocket league clips, gaming shorts"
                      onChange={(next, d) => { setEditTags(next); setEditTagsDraft(d); }}
                      onCommitBlur={saveTags}
                      onEscape={() => setEditingField(null)}
                    />
                    <div style={{ color: tagsOver ? T.red : T.textMuted, fontSize: 10, marginTop: 5, lineHeight: 1.5 }}>
                      {tagsOver
                        ? `Over YouTube's 500-character tag limit by ${tagsLen - TAGS_MAX} — shorten the list to save.`
                        : "Comma or Enter adds a tag. Click away to save."}
                    </div>
                  </>
                ) : data.tags?.length ? (
                  // Capped the same way the description is: a real game carries 20+
                  // tags, and letting them run pushes the platform templates below
                  // the fold — which is the scrolling this panel exists to end.
                  <div onClick={startEditTags} title="Click to edit" style={{ position: "relative", maxHeight: 74, overflow: "hidden", cursor: "text" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {data.tags.map((t) => (
                        <span key={t} style={{ fontSize: 11.5, color: T.textSecondary, background: "rgba(var(--lift),0.05)", border: `1px solid ${T.border}`, borderRadius: 5, padding: "2px 7px" }}>{t}</span>
                      ))}
                    </div>
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 26, background: `linear-gradient(180deg, rgba(17,18,24,0), ${T.surface})`, pointerEvents: "none" }} />
                  </div>
                ) : (
                  <span onClick={startEditTags} title="Click to edit" style={{ fontSize: 11.5, color: T.textMuted, fontStyle: "italic", cursor: "text" }}>No tags — click to add</span>
                )}
              </div>
            ) : (
              <div style={{ padding: "14px 15px 16px" }}>
                <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.6, marginBottom: 10 }}>
                  {activeGame} has no YouTube description yet — its clips publish with just the title.
                </div>
                <button
                  onClick={() => setYtDescriptions((p) => ({ ...p, [activeGame]: { desc: starterDesc(), tags: [] } }))}
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
                    {savedFlash === p.id && <span style={{ fontSize: 10, fontWeight: 700, color: T.green, flexShrink: 0 }}>Saved ✓</span>}
                    {!isEditing && (
                      <span
                        onClick={() => { setEditPlat(p.id); setEditTpl(captionTemplates[p.id] || ""); }}
                        title="Click to edit"
                        style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "text" }}
                      >
                        {captionTemplates[p.id] || "{title} #fyp"}
                      </span>
                    )}
                  </div>
                  {isEditing && (
                    <input
                      value={editTpl}
                      onChange={(e) => setEditTpl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") { skipSave.current = true; e.currentTarget.blur(); } }}
                      onBlur={() => {
                        if (skipSave.current) { skipSave.current = false; setEditPlat(null); return; }
                        setCaptionTemplates((pr) => ({ ...pr, [p.id]: editTpl }));
                        setEditPlat(null);
                        flash(p.id);
                      }}
                      autoFocus
                      style={{ ...FIELD, marginTop: 7 }}
                    />
                  )}
                </div>
              );
            })}

            {/* #346: the game's shared tag line — one line per game, filled into
                all three captions wherever their template says {gametags}. Hidden
                for a legacy ytDescriptions key with no gamesDb record to save to. */}
            {gameRecord && (
              <div style={{ padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ ...LBL, flexShrink: 0 }}>Game tags &middot; {activeMeta.tag}</span>
                  {savedFlash === "gametags" && <span style={{ fontSize: 10, fontWeight: 700, color: T.green, flexShrink: 0 }}>Saved ✓</span>}
                  {!editingGameTags && (
                    <span
                      onClick={() => { setEditGameTags(gameRecord.captionTags || ""); setEditingGameTags(true); }}
                      title="Click to edit"
                      style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: gameRecord.captionTags ? T.textSecondary : T.textMuted, fontStyle: gameRecord.captionTags ? "normal" : "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "text" }}
                    >
                      {gameRecord.captionTags || "e.g. #vct #100thieves #100T"}
                    </span>
                  )}
                </div>
                {editingGameTags && (
                  <input
                    value={editGameTags}
                    onChange={(e) => setEditGameTags(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") { skipSave.current = true; e.currentTarget.blur(); } }}
                    onBlur={() => {
                      if (skipSave.current) { skipSave.current = false; setEditingGameTags(false); return; }
                      const value = editGameTags.trim();
                      setGamesDb?.((prev) => prev.map((g) => (g.name === activeGame ? { ...g, captionTags: value } : g)));
                      setEditingGameTags(false);
                      flash("gametags");
                    }}
                    autoFocus
                    placeholder="#vct #100thieves #100T"
                    style={{ ...FIELD, marginTop: 7 }}
                  />
                )}
              </div>
            )}

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
              <span style={{ color: T.textSecondary }}>{"#{gametitle}"}</span> fills the game&rsquo;s hashtag and{" "}
              <span style={{ color: T.textSecondary }}>{"{gametags}"}</span> fills its tag line per clip.
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
            const d = ytDescriptions[g] || null;
            return (
              <div
                key={g}
                onClick={() => openGame(g)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 15px", borderBottom: `1px solid ${T.border}`, cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(var(--lift),0.025)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: d ? T.text : T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g}</span>
                {d ? (
                  <span style={{ marginLeft: "auto", fontSize: 10.5, color: T.textTertiary, flexShrink: 0 }}>
                    {d.tags?.length ? `${d.tags.length} tag${d.tags.length === 1 ? "" : "s"}` : "no tags"}
                  </span>
                ) : (
                  // #287: an entry with no description yet — opening it lands on the
                  // "Create one from the template" state.
                  <>
                    <span style={{ marginLeft: "auto", fontSize: 10.5, color: T.textTertiary, fontStyle: "italic", flexShrink: 0 }}>no description</span>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.3, padding: "1px 7px", borderRadius: 20, background: T.accentDim, border: `1px solid ${T.accentBorder}`, color: T.accentLight, flexShrink: 0 }}>+ Add</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
