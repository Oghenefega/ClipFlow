import React, { useState, useRef, useCallback, useEffect } from "react";
import T from "../styles/theme";
import { GamePill, Select } from "./shared";

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

const THUMB_WIDTH = 64; // display width per thumbnail
const THUMB_INTERVAL = 30; // seconds between thumbnails
const MIN_SEGMENT_SECONDS = 60; // 1-minute minimum segment

/**
 * ThumbnailScrubber — click-to-place split markers on a thumbnail strip.
 *
 * Props:
 *   thumbnails: Array<{path, timestampSeconds}>
 *   duration: number (total seconds)
 *   games: Array<{name, tag, color, entryType}>
 *   markers: Array<{timeSeconds: number, gameTag: string}>  — split markers (sorted)
 *   onMarkersChange: (markers) => void
 *   loading: boolean
 *   defaultGameTag: string — default game tag for new segments
 */
export default function ThumbnailScrubber({ thumbnails, duration, games, markers, onMarkersChange, loading, defaultGameTag }) {
  const stripRef = useRef(null);
  const [hoveredMarker, setHoveredMarker] = useState(null); // index of hovered marker
  const [hoverTime, setHoverTime] = useState(null); // time preview on hover

  const totalWidth = thumbnails.length * THUMB_WIDTH;
  const timeToX = useCallback((t) => (t / duration) * totalWidth, [duration, totalWidth]);
  const xToTime = useCallback((x) => (x / totalWidth) * duration, [duration, totalWidth]);

  // Reset hover on markers change
  useEffect(() => { setHoveredMarker(null); }, [markers]);

  // Build grouped game options (same pattern as RenameView)
  const getGameOptions = () => {
    const gamesList = games.filter((g) => !g.entryType || g.entryType === "game");
    const contentTypes = games.filter((g) => g.entryType === "content");
    const options = [];
    if (gamesList.length > 0) {
      options.push({ value: "__header_games__", label: "Games", isHeader: true });
      gamesList.forEach((g) => options.push({ value: g.tag, label: g.name, tag: g.tag, color: g.color }));
    }
    if (contentTypes.length > 0) {
      options.push({ value: "__header_content__", label: "Content Types", isHeader: true });
      contentTypes.forEach((g) => options.push({ value: g.tag, label: g.name, tag: g.tag, color: g.color }));
    }
    if (gamesList.length === 0 && contentTypes.length === 0) {
      games.forEach((g) => options.push({ value: g.tag, label: g.name, tag: g.tag, color: g.color }));
    }
    return options;
  };

  // Get segments from markers
  const getSegments = () => {
    const sorted = [...markers].sort((a, b) => a.timeSeconds - b.timeSeconds);
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
    // Last segment
    segments.push({
      startSeconds: prevTime,
      endSeconds: duration,
      gameTag: sorted.length > 0 ? (sorted[sorted.length - 1].gameAfter || defaultGameTag) : defaultGameTag,
    });
    return segments;
  };

  // Click on strip to add marker
  const handleStripClick = (e) => {
    if (!stripRef.current) return;
    const rect = stripRef.current.getBoundingClientRect();
    const scrollLeft = stripRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    const time = xToTime(x);

    // Don't place markers in the first or last second
    if (time < 1 || time > duration - 1) return;

    // Check minimum segment — new marker must be at least MIN_SEGMENT_SECONDS from start, end, and all existing markers
    const sorted = [...markers].sort((a, b) => a.timeSeconds - b.timeSeconds);
    if (time < MIN_SEGMENT_SECONDS || (duration - time) < MIN_SEGMENT_SECONDS) return;
    for (const m of sorted) {
      if (Math.abs(m.timeSeconds - time) < MIN_SEGMENT_SECONDS) return;
    }

    const newMarker = {
      timeSeconds: Math.round(time),
      gameBefore: defaultGameTag,
      gameAfter: defaultGameTag,
    };

    const newMarkers = [...markers, newMarker].sort((a, b) => a.timeSeconds - b.timeSeconds);
    // Assign gameBefore/gameAfter based on position
    rebuildSegmentTags(newMarkers);
    onMarkersChange(newMarkers);
  };

  // Click on existing marker to remove it
  const handleMarkerClick = (e, idx) => {
    e.stopPropagation();
    const newMarkers = markers.filter((_, i) => i !== idx);
    onMarkersChange(newMarkers);
  };

  // Update game tag for a segment
  const updateSegmentGame = (segmentIdx, newTag) => {
    const sorted = [...markers].sort((a, b) => a.timeSeconds - b.timeSeconds);
    const newMarkers = [...sorted];

    // segmentIdx 0 = before first marker, 1 = between marker 0 and 1, etc.
    if (segmentIdx === 0 && newMarkers.length > 0) {
      newMarkers[0] = { ...newMarkers[0], gameBefore: newTag };
    } else if (segmentIdx > 0 && segmentIdx <= newMarkers.length) {
      newMarkers[segmentIdx - 1] = { ...newMarkers[segmentIdx - 1], gameAfter: newTag };
    }
    onMarkersChange(newMarkers);
  };

  // Rebuild segment tags to maintain consistency after add/remove
  const rebuildSegmentTags = (sortedMarkers) => {
    // Keep existing tags; new markers get defaultGameTag
    // This is called in-place on the array
  };

  // Track mouse position for time preview
  const handleMouseMove = (e) => {
    if (!stripRef.current) return;
    const rect = stripRef.current.getBoundingClientRect();
    const scrollLeft = stripRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    setHoverTime(xToTime(x));
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ padding: "24px 0", textAlign: "center" }}>
        <div style={{ color: T.accent, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Preparing preview...</div>
        <div style={{ width: 160, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, margin: "0 auto", overflow: "hidden" }}>
          <div style={{ width: "40%", height: "100%", background: T.accent, borderRadius: 2, animation: "thumbLoadSlide 1.2s ease-in-out infinite" }} />
        </div>
        <style>{`@keyframes thumbLoadSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`}</style>
      </div>
    );
  }

  if (!thumbnails || thumbnails.length === 0) return null;

  const segments = getSegments();
  const sortedMarkers = [...markers].sort((a, b) => a.timeSeconds - b.timeSeconds);
  const gameOptions = getGameOptions();

  // Time labels every 5 minutes
  const timeLabels = [];
  const labelInterval = duration > 3600 ? 600 : 300; // 10 min for >1h, 5 min otherwise
  for (let t = labelInterval; t < duration; t += labelInterval) {
    timeLabels.push(t);
  }

  return (
    <div style={{ padding: "12px 0" }}>
      {/* Duration display */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ color: T.textSecondary, fontSize: 12, fontWeight: 600 }}>
          Total: {formatTime(duration)}
        </span>
        <span style={{ color: T.textTertiary, fontSize: 11 }}>
          Click to place markers, click markers to remove
        </span>
      </div>

      {/* Thumbnail strip */}
      <div
        ref={stripRef}
        onClick={handleStripClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverTime(null)}
        style={{
          position: "relative",
          overflowX: "auto",
          overflowY: "hidden",
          borderRadius: T.radius.md,
          border: `1px solid ${T.border}`,
          cursor: "crosshair",
          userSelect: "none",
        }}
      >
        {/* Thumbnails */}
        <div style={{ display: "flex", height: 60, minWidth: totalWidth }}>
          {thumbnails.map((thumb, i) => (
            <img
              key={i}
              src={`file://${thumb.path.replace(/\\/g, "/")}`}
              alt=""
              draggable={false}
              style={{
                width: THUMB_WIDTH,
                height: 60,
                objectFit: "cover",
                flexShrink: 0,
              }}
            />
          ))}
        </div>

        {/* Segment color overlays */}
        {segments.map((seg, i) => {
          const game = games.find((g) => g.tag === seg.gameTag);
          const color = game?.color || T.accent;
          return (
            <div
              key={`seg-${i}`}
              style={{
                position: "absolute",
                top: 0,
                left: timeToX(seg.startSeconds),
                width: timeToX(seg.endSeconds) - timeToX(seg.startSeconds),
                height: 60,
                background: `${color}18`,
                borderLeft: i > 0 ? "none" : undefined,
                borderRight: i < segments.length - 1 ? "none" : undefined,
                pointerEvents: "none",
              }}
            />
          );
        })}

        {/* Time labels */}
        {timeLabels.map((t) => (
          <div
            key={`label-${t}`}
            style={{
              position: "absolute",
              top: 0,
              left: timeToX(t),
              height: 60,
              borderLeft: `1px dashed rgba(255,255,255,0.15)`,
              pointerEvents: "none",
            }}
          >
            <span style={{
              position: "absolute",
              top: 2,
              left: 4,
              fontSize: 9,
              fontFamily: T.mono,
              color: "rgba(255,255,255,0.4)",
              whiteSpace: "nowrap",
            }}>
              {formatTime(t)}
            </span>
          </div>
        ))}

        {/* Split markers */}
        {sortedMarkers.map((m, i) => (
          <div
            key={`marker-${i}`}
            onClick={(e) => handleMarkerClick(e, i)}
            onMouseEnter={() => setHoveredMarker(i)}
            onMouseLeave={() => setHoveredMarker(null)}
            style={{
              position: "absolute",
              top: 0,
              left: timeToX(m.timeSeconds) - 1,
              width: 3,
              height: 60,
              background: T.accent,
              cursor: "pointer",
              zIndex: 10,
              boxShadow: hoveredMarker === i ? `0 0 8px ${T.accent}` : `0 0 4px ${T.accent}`,
              transition: "box-shadow 0.15s",
            }}
          >
            {/* Marker handle */}
            <div style={{
              position: "absolute",
              top: -6,
              left: -5,
              width: 13,
              height: 13,
              borderRadius: "50%",
              background: T.accent,
              border: "2px solid #fff",
              boxShadow: `0 0 6px ${T.accent}`,
            }} />
            {/* Time tooltip */}
            <div style={{
              position: "absolute",
              bottom: -20,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: 10,
              fontFamily: T.mono,
              color: T.accent,
              fontWeight: 700,
              whiteSpace: "nowrap",
              background: T.bg,
              padding: "2px 6px",
              borderRadius: 4,
            }}>
              {formatTime(m.timeSeconds)}
            </div>
          </div>
        ))}

        {/* Hover time preview */}
        {hoverTime !== null && (
          <div style={{
            position: "absolute",
            top: -18,
            left: timeToX(hoverTime),
            transform: "translateX(-50%)",
            fontSize: 10,
            fontFamily: T.mono,
            color: T.textTertiary,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}>
            {formatTime(hoverTime)}
          </div>
        )}
      </div>

      {/* Segment game assignments */}
      <div style={{ marginTop: 16 }}>
        <div style={{ color: T.textSecondary, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
          Segments ({segments.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {segments.map((seg, i) => {
            const game = games.find((g) => g.tag === seg.gameTag);
            return (
              <div
                key={`segrow-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: T.radius.sm,
                  border: `1px solid ${T.border}`,
                }}
              >
                {/* Segment number */}
                <span style={{
                  color: T.textTertiary,
                  fontSize: 11,
                  fontFamily: T.mono,
                  fontWeight: 700,
                  minWidth: 20,
                }}>
                  {i + 1}
                </span>

                {/* Time range */}
                <span style={{
                  color: T.textSecondary,
                  fontSize: 12,
                  fontFamily: T.mono,
                  minWidth: 110,
                }}>
                  {formatTime(seg.startSeconds)} – {formatTime(seg.endSeconds)}
                </span>

                {/* Duration */}
                <span style={{
                  color: T.textTertiary,
                  fontSize: 11,
                  fontFamily: T.mono,
                  minWidth: 50,
                }}>
                  ({formatTime(seg.endSeconds - seg.startSeconds)})
                </span>

                {/* Game dropdown */}
                <Select
                  value={seg.gameTag}
                  onChange={(val) => updateSegmentGame(i, val)}
                  options={gameOptions}
                  style={{ flex: 1, maxWidth: 220 }}
                  renderSelected={(o) => (
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <GamePill tag={o.tag || seg.gameTag} color={o.color || game?.color || "#888"} size="sm" />
                      {o.label}
                    </span>
                  )}
                  renderOption={(o) => o.isHeader ? (
                    <span style={{ color: T.textTertiary, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", pointerEvents: "none" }}>{o.label}</span>
                  ) : (
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <GamePill tag={o.tag} color={o.color} size="sm" />
                      {o.label}
                    </span>
                  )}
                />

                {/* Color indicator */}
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: game?.color || T.accent,
                  boxShadow: `0 0 6px ${game?.color || T.accent}`,
                  flexShrink: 0,
                }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
