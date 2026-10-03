import React, { useState, useRef, useEffect } from "react";
import T from "../styles/theme";
import { GamePill, Select, ReactSwitch, renderEntryOption, toFileUrl } from "./shared";
import { groupedEntryOptions } from "../../shared/reactions";

/**
 * Format seconds to MM:SS or HH:MM:SS display.
 */
function formatTime(seconds) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const MIN_SEGMENT_SECONDS = 60; // 1-minute minimum segment
const STRIP_H = 120;
const STRIP_FRAMES = 50; // every other preview frame fills the strip

const hexA = (c, a) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c || "");
  if (!m) return `color-mix(in srgb, ${c || T.accent} ${Math.round(a * 100)}%, transparent)`;
  const h = m[1].length === 3 ? m[1].split("").map((x) => x + x).join("") : m[1];
  const n = parseInt(h, 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

const IcScissors = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><path d="M8.12 8.12 12 12M20 4 8.12 15.88" /><circle cx="6" cy="18" r="3" /><path d="M14.8 14.8 20 20" /></svg>
);

/**
 * #485 split strip: the whole recording as one long filmstrip under its
 * session. Click where a new game starts to drop a marker (× removes it);
 * each part between markers gets its own game. Hovering reports the time so
 * the big preview beside it can show that moment.
 *
 * Props:
 *   thumbnails: Array<{path, timestampSeconds}> — the recording's preview frames
 *   duration: number (total seconds)
 *   games: Array<{name, tag, color, entryType}>
 *   markers: Array<{timeSeconds, gameBefore, gameAfter}>
 *   onMarkersChange: (markers) => void
 *   loading: boolean — frames still being made
 *   defaultGameTag: string — game tag for new parts
 *   partLabel: string — "Pt1", shown in the header
 *   onHover: (seconds | null) => void
 *   onDone: () => void
 */
export default function ThumbnailScrubber({ thumbnails, duration, games, markers, onMarkersChange, loading, defaultGameTag, onReactionFor, partLabel, onHover, onDone }) {
  const stripRef = useRef(null);
  const [hoverX, setHoverX] = useState(null); // 0..1 across the strip

  useEffect(() => () => onHover?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const gameOptions = groupedEntryOptions(games, "tag");
  const sorted = [...markers].sort((a, b) => a.timeSeconds - b.timeSeconds);

  // Parts between markers, each with its game
  const segments = [];
  let prevTime = 0;
  for (let i = 0; i < sorted.length; i++) {
    segments.push({
      startSeconds: prevTime,
      endSeconds: sorted[i].timeSeconds,
      gameTag: i === 0 ? (sorted[i].gameBefore || defaultGameTag) : (sorted[i - 1].gameAfter || defaultGameTag),
    });
    prevTime = sorted[i].timeSeconds;
  }
  segments.push({
    startSeconds: prevTime,
    endSeconds: duration,
    gameTag: sorted.length > 0 ? (sorted[sorted.length - 1].gameAfter || defaultGameTag) : defaultGameTag,
  });

  const fracAt = (e) => {
    const rect = stripRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  const handleStripClick = (e) => {
    if (!stripRef.current || !duration) return;
    const time = fracAt(e) * duration;
    // The new marker must leave at least MIN_SEGMENT_SECONDS to the start, the end and every other marker
    if (time < MIN_SEGMENT_SECONDS || (duration - time) < MIN_SEGMENT_SECONDS) return;
    if (sorted.some((m) => Math.abs(m.timeSeconds - time) < MIN_SEGMENT_SECONDS)) return;
    const newMarker = { timeSeconds: Math.round(time), gameBefore: defaultGameTag, gameAfter: defaultGameTag };
    onMarkersChange([...sorted, newMarker].sort((a, b) => a.timeSeconds - b.timeSeconds));
  };

  const removeMarker = (e, idx) => {
    e.stopPropagation();
    onMarkersChange(sorted.filter((_, i) => i !== idx));
  };

  const updateSegmentGame = (segmentIdx, newTag) => {
    const next = [...sorted];
    // segmentIdx 0 = before first marker, 1 = between marker 0 and 1, etc.
    if (segmentIdx === 0 && next.length > 0) next[0] = { ...next[0], gameBefore: newTag };
    else if (segmentIdx > 0 && segmentIdx <= next.length) next[segmentIdx - 1] = { ...next[segmentIdx - 1], gameAfter: newTag };
    onMarkersChange(next);
  };

  const onMove = (e) => {
    if (!stripRef.current || !duration) return;
    const f = fracAt(e);
    setHoverX(f);
    onHover?.(f * duration);
  };
  const onLeave = () => { setHoverX(null); onHover?.(null); };

  const strip = thumbnails.length > STRIP_FRAMES
    ? Array.from({ length: STRIP_FRAMES }, (_, i) => thumbnails[Math.floor((i * thumbnails.length) / STRIP_FRAMES)])
    : thumbnails;

  const ticks = [];
  const tickEvery = duration > 3600 ? 600 : duration > 900 ? 300 : 60;
  for (let t = 0; t <= duration; t += tickEvery) ticks.push(t);

  const btn = { display: "inline-flex", alignItems: "center", height: 28, padding: "0 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: T.font, cursor: "pointer", whiteSpace: "nowrap" };

  return (
    <div style={{ margin: "0 12px 12px", padding: 14, borderRadius: 13, border: `1px solid ${T.accentBorder}`, background: `linear-gradient(180deg, color-mix(in srgb, ${T.accent} 7%, transparent), color-mix(in srgb, ${T.accent} 2%, transparent))` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, color: T.text }}>
        <span style={{ color: T.accentLight, display: "inline-flex" }}>{IcScissors}</span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Mark where the game changes</span>
        <span style={{ color: T.textSecondary, fontSize: 12.5 }}>in {partLabel} · {formatTime(duration)}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {sorted.length > 0 && (
            <button onClick={() => onMarkersChange([])} style={{ ...btn, border: `1px solid ${T.border}`, background: "rgba(var(--lift),0.035)", color: T.textSecondary }}>Remove markers</button>
          )}
          <button onClick={onDone} style={{ ...btn, border: "1px solid transparent", background: T.accent, color: "#fff" }}>Done</button>
        </span>
      </div>

      {/* time ruler */}
      <div style={{ position: "relative", height: 16, marginBottom: 6 }}>
        {ticks.map((t) => (
          <span key={t} style={{ position: "absolute", top: 0, left: `${(t / duration) * 100}%`, transform: t === 0 ? "none" : "translateX(-50%)", fontSize: 10.5, color: T.textTertiary, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatTime(t)}</span>
        ))}
      </div>

      <div
        ref={stripRef}
        onClick={handleStripClick}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={{ position: "relative", display: "flex", height: STRIP_H, borderRadius: 10, overflow: "hidden", cursor: "crosshair", userSelect: "none", border: "1px solid rgba(var(--lift),0.08)", background: "rgba(var(--lift),0.04)" }}
      >
        {strip.map((f, i) => (
          <img key={f.path} src={toFileUrl(f.path)} alt="" draggable={false} style={{ flex: "1 1 0", width: 0, minWidth: 0, height: "100%", objectFit: "cover", opacity: 0.8, display: "block" }} />
        ))}
        {loading && strip.length === 0 && (
          <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 12.5, color: T.textTertiary }}>Preparing the filmstrip…</span>
        )}

        {/* each part tinted in its game's colour */}
        {sorted.length > 0 && segments.map((seg, i) => {
          const color = games.find((g) => g.tag === seg.gameTag)?.color || T.accent;
          return <div key={`seg-${i}`} style={{ position: "absolute", top: 0, bottom: 0, left: `${(seg.startSeconds / duration) * 100}%`, width: `${((seg.endSeconds - seg.startSeconds) / duration) * 100}%`, background: hexA(color, i % 2 ? 0.16 : 0.08), pointerEvents: "none" }} />;
        })}

        {sorted.map((m, i) => (
          <div key={`mk-${m.timeSeconds}`} style={{ position: "absolute", top: 0, bottom: 0, left: `${(m.timeSeconds / duration) * 100}%`, width: 2, marginLeft: -1, background: T.accentLight, boxShadow: `0 0 12px color-mix(in srgb, ${T.accentLight} 90%, transparent)`, zIndex: 2 }}>
            <b onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 4, padding: "3px 4px 3px 8px", borderRadius: 7, background: T.accent, color: "#fff", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", cursor: "default", fontVariantNumeric: "tabular-nums" }}>
              {formatTime(m.timeSeconds)}
              <button onClick={(e) => removeMarker(e, i)} title="Remove this marker" style={{ width: 16, height: 16, borderRadius: 4, border: "none", display: "grid", placeItems: "center", fontSize: 12, lineHeight: 1, background: "rgba(0,0,0,0.25)", color: "#fff", cursor: "pointer", padding: 0 }}>×</button>
            </b>
          </div>
        ))}

        {hoverX !== null && (
          // #328: literal white — a playhead drawn over the footage itself
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${hoverX * 100}%`, width: 2, background: "#fff", boxShadow: "0 0 10px rgba(255,255,255,0.9)", pointerEvents: "none", zIndex: 1 }}>
            <em style={{ position: "absolute", bottom: 8, left: 6, fontStyle: "normal", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: "rgba(0,0,0,0.7)", color: "#fff", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatTime(hoverX * duration)}</em>
          </div>
        )}
      </div>

      {sorted.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8, marginTop: 12 }}>
          {segments.map((seg, i) => {
            const game = games.find((g) => g.tag === seg.gameTag);
            return (
              <div key={`segrow-${i}`} style={{ display: "grid", gap: 8, padding: "9px 10px", borderRadius: 10, background: "rgba(var(--lift),0.03)", border: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  <b style={{ fontSize: 12.5, color: T.text }}>Part {i + 1} · {formatTime(seg.startSeconds)} to {formatTime(seg.endSeconds)}</b>
                  <span style={{ marginLeft: "auto", fontSize: 11.5, color: T.textSecondary }}>{formatTime(seg.endSeconds - seg.startSeconds)} long</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Select
                  value={seg.gameTag}
                  onChange={(val) => updateSegmentGame(i, val)}
                  options={gameOptions}
                  style={{ flex: 1, minWidth: 0 }}
                  renderSelected={(o) => (
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <GamePill tag={o.tag || seg.gameTag} color={o.color || game?.color || "#888"} size="sm" />
                      {o.label}
                    </span>
                  )}
                  renderOption={(o) => o.isHeader ? (
                    <span style={{ color: T.textTertiary, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", pointerEvents: "none" }}>{o.label}</span>
                  ) : (
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>{renderEntryOption(o)}</span>
                  )}
                />
                <ReactSwitch compact tight entry={game} gamesDb={games} onPick={(e) => updateSegmentGame(i, e.tag)} onReactionFor={onReactionFor} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ marginTop: 10, color: T.textTertiary, fontSize: 12 }}>
          Click the strip where a new game starts. Each marker splits the recording into its own part, and you can pick the game for each one. The split happens when you rename.
        </div>
      )}
    </div>
  );
}
