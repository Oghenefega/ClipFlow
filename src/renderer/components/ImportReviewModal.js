import React, { useState, useEffect, useMemo } from "react";
import T from "../styles/theme";
import { Select, Checkbox, toFileUrl } from "./shared";

// Queue imports review grid (#240) — the gate between a dropped wave of
// pre-ClipFlow files and the queue. Rows appear instantly with the stripped
// filename as a provisional title; the Gemini title/game pass streams results
// in per row. Nothing touches disk or memory until Confirm.

const PLATFORM_KEYS = ["tiktok", "instagram", "facebook", "youtube"];
const PLATFORM_SHORT = { tiktok: "TT", instagram: "IG", facebook: "FB", youtube: "YT" };

// Same preset palette as the Settings color picker — new games created from
// the grid get a deterministic pick so re-runs don't shuffle colors.
const GAME_PALETTE = ["#ff6b35", "#00b4d8", "#ff4655", "#ffd23f", "#fca311", "#06d6a0", "#9b5de5", "#ef476f", "#00ff88", "#e0e0e0"];

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function deriveGameFields(name, gamesDb, extraTakenTags) {
  const taken = new Set([
    ...(gamesDb || []).map((g) => (g.tag || "").toLowerCase()),
    ...(extraTakenTags || []),
  ]);
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  const candidates = [
    words.length >= 2 ? words.map((w) => w[0]).join("").toUpperCase().slice(0, 4) : "",
    (words[0] || "").slice(0, 3),
    (words[0] || "").slice(0, 4),
  ].filter(Boolean);
  let tag = candidates.find((c) => !taken.has(c.toLowerCase()));
  if (!tag) {
    const base = candidates[0] || "GM";
    let n = 2;
    while (taken.has(`${base}${n}`.toLowerCase())) n++;
    tag = `${base}${n}`;
  }
  return {
    name: String(name).trim(),
    tag,
    hashtag: String(name).toLowerCase().replace(/[^a-z0-9]/g, ""),
    color: GAME_PALETTE[hashString(name.toLowerCase()) % GAME_PALETTE.length],
    exe: [],
    entryType: "game",
  };
}

const EXCLUDE_LABELS = {
  "already-imported": "already imported",
  "already-skipped": "skipped earlier",
  "duplicate-in-batch": "duplicate in this selection",
  horizontal: "horizontal — flagged for Auto-Reframe (coming later), not importable yet",
  unsupported: "not an .mp4/.mov",
  unreadable: "unreadable",
  missing: "file not found",
};

function excludedSummary(excluded) {
  if (!excluded || excluded.length === 0) return null;
  const counts = {};
  for (const r of excluded) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
  return Object.entries(counts)
    .map(([v, n]) => `${n} ${EXCLUDE_LABELS[v] || v}`)
    .join(" · ");
}

const cellLabel = { fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.textMuted };

export default function ImportReviewModal({ initialRows, excluded, gamesDb, onCreateGame, onClose, onDone }) {
  const [rows, setRows] = useState(() =>
    (initialRows || []).map((r) => ({
      ...r,
      title: r.base,
      gameName: "",
      aiStatus: "pending", // pending → generating → done | failed; "none" = no key
      aiGuess: null, // { game, confidence } hint when not auto-assigned
      toggles: { tiktok: true, instagram: true, facebook: true, youtube: true },
      skipped: false,
      copyPct: null,
      error: null,
    }))
  );
  const [checked, setChecked] = useState(() => new Set());
  const [phase, setPhase] = useState("review"); // review | importing
  const [aiNote, setAiNote] = useState(null);
  const [bulkGame, setBulkGame] = useState("");
  const [newGameAsk, setNewGameAsk] = useState(null); // { targets: [fingerprint] | "bulk" }
  const [newGameName, setNewGameName] = useState("");
  const [failures, setFailures] = useState([]);

  const patchRow = (fingerprint, patch) => {
    setRows((prev) => prev.map((r) => (r.fingerprint === fingerprint ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) } : r)));
  };

  // Kick off the AI pass on mount; stream results in via progress events.
  useEffect(() => {
    const unsubscribe = window.clipflow?.onQueueImportsProgress?.((data) => {
      if (!data?.fingerprint) return;
      if (data.type === "ai") {
        if (data.status === "generating") patchRow(data.fingerprint, { aiStatus: "generating" });
        else if (data.status === "failed") patchRow(data.fingerprint, { aiStatus: "failed" });
        else if (data.status === "done") {
          patchRow(data.fingerprint, (r) => {
            const next = { aiStatus: "done" };
            if (data.title) next.title = data.title;
            const guess = String(data.game || "unknown").trim();
            if (guess && guess.toLowerCase() !== "unknown") {
              const hit = (gamesDb || []).find((g) => (g.name || "").toLowerCase() === guess.toLowerCase());
              if (data.confidence === "high") {
                // High confidence fills the cell — an unknown-to-the-list game
                // becomes a new-game assignment, created for real at Confirm.
                next.gameName = hit ? hit.name : guess;
              } else {
                // Low confidence lands as unassigned, never silently wrong —
                // the guess stays one click away as a hint chip.
                next.aiGuess = { game: hit ? hit.name : guess, confidence: data.confidence };
              }
            }
            return next;
          });
        }
      } else if (data.type === "copy") {
        patchRow(data.fingerprint, { copyPct: data.pct });
      } else if (data.type === "failed") {
        patchRow(data.fingerprint, { error: data.error || "Import failed" });
      }
    });

    const toGenerate = (initialRows || []).map((r) => ({ path: r.path, fingerprint: r.fingerprint, base: r.base }));
    if (toGenerate.length > 0) {
      window.clipflow?.queueImportsGenerate?.(toGenerate).then((res) => {
        if (res?.skipped === "no-key") {
          setAiNote("No Gemini API key set — titles start as the old filenames. Add a key in Settings for AI titles and game guesses.");
          setRows((prev) => prev.map((r) => (r.aiStatus === "pending" || r.aiStatus === "generating" ? { ...r, aiStatus: "none" } : r)));
        } else if (res?.error) {
          setAiNote(`AI pass failed: ${res.error} — titles fall back to the old filenames.`);
          setRows((prev) => prev.map((r) => (r.aiStatus === "pending" || r.aiStatus === "generating" ? { ...r, aiStatus: "failed" } : r)));
        }
      }).catch(() => {});
    }

    return () => {
      window.clipflow?.queueImportsCancelGenerate?.();
      if (unsubscribe) unsubscribe();
    };
    // Mount-only: rows/gamesDb changes are handled through patchRow closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Names assigned in this batch that aren't in gamesDb yet ("new games").
  const batchNewGames = useMemo(() => {
    const known = new Set((gamesDb || []).map((g) => (g.name || "").toLowerCase()));
    const fresh = new Map();
    for (const r of rows) {
      if (r.gameName && !known.has(r.gameName.toLowerCase())) fresh.set(r.gameName.toLowerCase(), r.gameName);
    }
    return Array.from(fresh.values());
  }, [rows, gamesDb]);

  const gameOptions = useMemo(() => ([
    { value: "", label: "— no game —" },
    ...(gamesDb || []).map((g) => ({ value: g.name, label: g.name })),
    ...batchNewGames.map((n) => ({ value: n, label: `${n} (new)` })),
    { value: "__new__", label: "+ New game…" },
  ]), [gamesDb, batchNewGames]);

  const assignGame = (targets, value) => {
    if (value === "__new__") {
      setNewGameAsk({ targets });
      setNewGameName("");
      return;
    }
    setRows((prev) => prev.map((r) => (targets === "bulk" ? checked.has(r.fingerprint) : targets.includes(r.fingerprint)) ? { ...r, gameName: value } : r));
  };

  const commitNewGame = () => {
    const name = newGameName.trim();
    if (!name) { setNewGameAsk(null); return; }
    assignGame(newGameAsk.targets, name);
    setNewGameAsk(null);
  };

  const toggleChecked = (fingerprint) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(fingerprint)) next.delete(fingerprint);
      else next.add(fingerprint);
      return next;
    });
  };

  const live = rows.filter((r) => !r.error);
  const importable = live.filter((r) => !r.skipped && r.gameName);
  const unassigned = live.filter((r) => !r.skipped && !r.gameName);
  const skippedRows = live.filter((r) => r.skipped);
  const generating = rows.some((r) => r.aiStatus === "pending" || r.aiStatus === "generating");

  const confirmImport = async () => {
    if (phase === "importing" || importable.length === 0) return;
    setPhase("importing");
    setFailures([]);

    // Materialize any batch-new games first: real games-list entries (which
    // also seeds their YouTube description template via App.handleNewGame).
    const known = new Map((gamesDb || []).map((g) => [(g.name || "").toLowerCase(), g]));
    const createdTags = [];
    const newGameFields = new Map();
    for (const name of batchNewGames) {
      if (!importable.some((r) => r.gameName === name)) continue;
      const fields = deriveGameFields(name, gamesDb, createdTags);
      createdTags.push(fields.tag.toLowerCase());
      newGameFields.set(name.toLowerCase(), fields);
      try { onCreateGame?.(fields); } catch (e) { /* game entry is a nice-to-have, import proceeds */ }
    }

    const items = importable.map((r) => {
      const existing = known.get(r.gameName.toLowerCase());
      const fresh = newGameFields.get(r.gameName.toLowerCase());
      return {
        path: r.path,
        fingerprint: r.fingerprint,
        base: r.base,
        duration: r.duration,
        thumbPath: r.thumbPath,
        title: (r.title || r.base || "").trim() || r.base,
        gameName: existing?.name || fresh?.name || r.gameName,
        gameTag: existing?.tag || fresh?.tag || r.gameName.slice(0, 3).toUpperCase(),
        gameColor: existing?.color || fresh?.color || "#888",
        platformToggles: { ...r.toggles },
      };
    });
    const skips = skippedRows.map((r) => ({ fingerprint: r.fingerprint, file: r.fileName }));

    try {
      const res = await window.clipflow?.queueImportsConfirm?.({ items, skips });
      if (res?.error) {
        setFailures([{ path: "", error: res.error }]);
        setPhase("review");
        return;
      }
      if (res?.failed?.length > 0) {
        // Keep only the failed rows on screen for a retry; everything else landed.
        const failedPaths = new Set(res.failed.map((f) => f.path));
        setFailures(res.failed);
        setRows((prev) => prev.filter((r) => failedPaths.has(r.path)));
        setPhase("review");
        onDone?.({ partial: true, imported: res.imported });
        return;
      }
      onDone?.(res || {});
    } catch (e) {
      setFailures([{ path: "", error: e.message }]);
      setPhase("review");
    }
  };

  const summary = excludedSummary(excluded);
  const btnBase = { padding: "8px 18px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(var(--shade),calc(0.75 * var(--shadeK)))", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={phase === "importing" ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, width: "min(1060px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Import clips</div>
          <div style={{ fontSize: 11, color: T.textTertiary, fontWeight: 600 }}>
            {live.length} to review{generating ? " · AI titles running…" : ""}
          </div>
          <div style={{ flex: 1 }} />
          {checked.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: T.accentLight, fontWeight: 700 }}>{checked.size} selected</span>
              <Select value={bulkGame} onChange={(v) => { setBulkGame(""); assignGame("bulk", v); }} options={[{ value: "", label: "Assign game…" }, ...gameOptions.slice(1)]} style={{ minWidth: 150 }} />
              <button onClick={() => { setRows((p) => p.map((r) => checked.has(r.fingerprint) ? { ...r, skipped: true } : r)); }} style={{ ...btnBase, padding: "6px 12px", border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary }}>Skip</button>
              <button onClick={() => setChecked(new Set())} style={{ ...btnBase, padding: "6px 12px", border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary }}>Clear</button>
            </div>
          )}
        </div>

        {/* Notes */}
        {(aiNote || summary || failures.length > 0) && (
          <div style={{ padding: "8px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 4 }}>
            {failures.map((f, i) => (
              <div key={i} style={{ fontSize: 11, color: T.red, fontWeight: 600 }}>
                {f.path ? `${f.path.split(/[/\\]/).pop()}: ` : ""}{f.error}
              </div>
            ))}
            {aiNote && <div style={{ fontSize: 11, color: T.yellow, fontWeight: 600 }}>{aiNote}</div>}
            {summary && <div style={{ fontSize: 11, color: T.textTertiary }}>Not offered: {summary}.</div>}
          </div>
        )}

        {/* Grid */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {live.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: T.textTertiary, fontSize: 13 }}>
              Nothing new to import — every selected file was {summary ? "excluded: " + summary : "excluded"}.
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "34px 44px 1fr 170px 130px 64px", gap: 10, alignItems: "center", padding: "8px 20px", borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, background: T.surface, zIndex: 1 }}>
                <span />
                <span style={cellLabel}>Clip</span>
                <span style={cellLabel}>Title</span>
                <span style={cellLabel}>Game</span>
                <span style={cellLabel}>Platforms</span>
                <span />
              </div>
              {live.map((row) => (
                <div key={row.fingerprint} style={{ display: "grid", gridTemplateColumns: "34px 44px 1fr 170px 130px 64px", gap: 10, alignItems: "center", padding: "8px 20px", borderBottom: `1px solid ${T.border}`, opacity: row.skipped ? 0.4 : 1 }}>
                  <div onClick={() => toggleChecked(row.fingerprint)} style={{ cursor: "pointer" }}>
                    <Checkbox checked={checked.has(row.fingerprint)} size={16} />
                  </div>
                  <div style={{ width: 34, height: 60, borderRadius: 5, overflow: "hidden", background: "rgba(var(--lift),0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {row.thumbPath
                      ? <img src={toFileUrl(row.thumbPath)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 14 }}>{"🎬"}</span>}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        value={row.title}
                        disabled={row.skipped || phase === "importing"}
                        onChange={(e) => patchRow(row.fingerprint, { title: e.target.value })}
                        style={{ flex: 1, minWidth: 0, background: "rgba(var(--lift),0.04)", border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 10px", color: T.text, fontSize: 12, fontWeight: 600, fontFamily: T.font, outline: "none" }}
                      />
                      {(row.aiStatus === "pending" || row.aiStatus === "generating") && (
                        <span style={{ fontSize: 10, color: T.yellow, fontWeight: 700, flexShrink: 0 }}>AI…</span>
                      )}
                      {row.aiStatus === "failed" && (
                        <span title="AI title failed — the old filename stands in" style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, flexShrink: 0 }}>no AI</span>
                      )}
                    </div>
                    <div
                      onClick={() => !row.skipped && patchRow(row.fingerprint, { title: row.base })}
                      title="Click to use the old name as the title"
                      style={{ fontSize: 10, color: T.textMuted, marginTop: 3, cursor: row.skipped ? "default" : "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      was: {row.base} · {Math.round(row.duration)}s
                    </div>
                    {row.copyPct != null && phase === "importing" && (
                      <div style={{ height: 3, borderRadius: 2, background: "rgba(var(--lift),0.06)", marginTop: 4, overflow: "hidden" }}>
                        <div style={{ width: `${row.copyPct}%`, height: "100%", background: T.green }} />
                      </div>
                    )}
                  </div>
                  <div>
                    <Select value={row.gameName} onChange={(v) => assignGame([row.fingerprint], v)} options={gameOptions} style={{ width: "100%" }} />
                    {!row.gameName && row.aiGuess && (
                      <div
                        onClick={() => !row.skipped && patchRow(row.fingerprint, { gameName: row.aiGuess.game })}
                        style={{ fontSize: 10, color: T.accentLight, marginTop: 3, cursor: "pointer", fontWeight: 600 }}
                      >
                        AI thinks: {row.aiGuess.game} ({row.aiGuess.confidence}) — click to use
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {PLATFORM_KEYS.map((pk) => {
                      const on = row.toggles[pk] !== false;
                      return (
                        <button
                          key={pk}
                          onClick={() => patchRow(row.fingerprint, (r) => ({ toggles: { ...r.toggles, [pk]: !on } }))}
                          disabled={row.skipped || phase === "importing"}
                          title={`${pk} ${on ? "on" : "off"}`}
                          style={{ padding: "4px 6px", borderRadius: 5, border: `1px solid ${on ? T.green : T.border}`, background: on ? "rgba(74,222,128,0.10)" : "transparent", color: on ? T.green : T.textMuted, fontSize: 9, fontWeight: 800, cursor: "pointer", fontFamily: T.mono, letterSpacing: "0.5px", textDecoration: on ? "none" : "line-through" }}
                        >{PLATFORM_SHORT[pk]}</button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => patchRow(row.fingerprint, { skipped: !row.skipped })}
                    disabled={phase === "importing"}
                    style={{ ...btnBase, padding: "5px 10px", fontSize: 11, border: `1px solid ${T.border}`, background: "transparent", color: row.skipped ? T.yellow : T.textTertiary }}
                  >{row.skipped ? "Undo" : "Skip"}</button>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Inline new-game prompt */}
        {newGameAsk && (
          <div style={{ padding: "10px 20px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>New game:</span>
            <input
              autoFocus
              value={newGameName}
              onChange={(e) => setNewGameName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitNewGame(); if (e.key === "Escape") setNewGameAsk(null); }}
              placeholder="e.g. Baby Steps"
              style={{ flex: 1, maxWidth: 280, background: "rgba(var(--lift),0.04)", border: `1px solid ${T.accentBorder}`, borderRadius: 6, padding: "6px 10px", color: T.text, fontSize: 12, fontFamily: T.font, outline: "none" }}
            />
            <button onClick={commitNewGame} style={{ ...btnBase, padding: "6px 14px", border: "none", background: T.accent, color: "#fff" }}>Add</button>
            <button onClick={() => setNewGameAsk(null)} style={{ ...btnBase, padding: "6px 14px", border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary }}>Cancel</button>
            <span style={{ fontSize: 10, color: T.textTertiary }}>Becomes a real games-list entry (tag, hashtag, and YouTube description are set up automatically).</span>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ flex: 1, fontSize: 11, color: T.textTertiary }}>
            {unassigned.length > 0 && (
              <span style={{ color: T.yellow, fontWeight: 600 }}>
                {unassigned.length} without a game stay{unassigned.length === 1 ? "s" : ""} out — offered again next time.{" "}
              </span>
            )}
            {skippedRows.length > 0 && <span>{skippedRows.length} skipped (remembered — never offered again). </span>}
            Files are copied to ClipFlow Imports; your originals are never touched.
          </div>
          <button onClick={onClose} disabled={phase === "importing"} style={{ ...btnBase, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary }}>Cancel</button>
          <button
            onClick={confirmImport}
            disabled={phase === "importing" || importable.length === 0}
            style={{ ...btnBase, padding: "8px 22px", border: "none", background: phase === "importing" || importable.length === 0 ? "rgba(var(--lift),0.04)" : T.green, color: phase === "importing" || importable.length === 0 ? T.textMuted : T.onSolid }}
          >
            {phase === "importing" ? "Importing…" : `Import ${importable.length} clip${importable.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
