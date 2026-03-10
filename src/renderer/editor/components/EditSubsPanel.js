import React from "react";
import T from "../../styles/theme";
import useSubtitleStore from "../stores/useSubtitleStore";
import usePlaybackStore from "../stores/usePlaybackStore";
import useEditorStore from "../stores/useEditorStore";
import { BD, S2, S3 } from "../utils/constants";
import { fmtTime, parseTime } from "../utils/timeUtils";
import { Ib, ToolBtn, EditableTC } from "../primitives/editorPrimitives";

export default function EditSubsPanel() {
  const editSegments = useSubtitleStore((s) => s.editSegments);
  const esFilter = useSubtitleStore((s) => s.esFilter);
  const activeSegId = useSubtitleStore((s) => s.activeSegId);
  const selectedWordInfo = useSubtitleStore((s) => s.selectedWordInfo);
  const editingWordKey = useSubtitleStore((s) => s.editingWordKey);
  const setEsFilter = useSubtitleStore((s) => s.setEsFilter);
  const setActiveSegId = useSubtitleStore((s) => s.setActiveSegId);
  const setSelectedWordInfo = useSubtitleStore((s) => s.setSelectedWordInfo);
  const setEditingWordKey = useSubtitleStore((s) => s.setEditingWordKey);
  const setEditSegments = useSubtitleStore((s) => s.setEditSegments);
  const splitSegment = useSubtitleStore((s) => s.splitSegment);
  const mergeSegment = useSubtitleStore((s) => s.mergeSegment);
  const splitToWords = useSubtitleStore((s) => s.splitToWords);
  const deleteSegment = useSubtitleStore((s) => s.deleteSegment);
  const seekTo = usePlaybackStore((s) => s.seekTo);
  const markDirty = useEditorStore((s) => s.markDirty);

  const clip = useEditorStore((s) => s.clip);
  const clipDuration = clip ? ((clip.endTime || 0) - (clip.startTime || 0)) : 0;

  const filtered = esFilter === "all" ? editSegments : editSegments.filter(s => s.track === esFilter);
  const confColor = { high: T.green, med: T.yellow, low: T.red };

  const handleSplit = () => { splitSegment(); markDirty(); };
  const handleMerge = () => { mergeSegment(); markDirty(); };
  const handleSplitToWords = () => { splitToWords(); markDirty(); };
  const handleDelete = (segId) => { deleteSegment(segId); markDirty(); };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 10px", borderBottom: `1px solid ${BD}` }}>
        <ToolBtn onClick={handleSplit} active={!!activeSegId}>⌇ Split</ToolBtn>
        <ToolBtn onClick={handleMerge}>⇔ Merge</ToolBtn>
        <div style={{ width: 1, height: 16, background: BD, margin: "0 2px" }} />
        <ToolBtn onClick={handleSplitToWords}>≈ Words</ToolBtn>
        <div style={{ flex: 1 }} />
        {["all", "s1", "s2"].map(f => (
          <button
            key={f}
            onClick={() => setEsFilter(f)}
            style={{
              padding: "3px 8px", borderRadius: 12,
              border: `1px solid ${esFilter === f ? T.accentBorder : f === "s1" ? "#90b8e0" : f === "s2" ? "#d4b94a" : BD}`,
              fontSize: 10, fontWeight: 600,
              color: esFilter === f ? T.accentLight : f === "s1" ? "#90b8e0" : f === "s2" ? "#d4b94a" : T.textTertiary,
              background: esFilter === f ? T.accentDim : "transparent",
              cursor: "pointer", fontFamily: T.font, transition: "all 0.15s",
            }}
          >
            {f === "all" ? "All" : f.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Segment list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {filtered.map(seg => {
          const isActive = seg.id === activeSegId;
          const dotColor = seg.track === "s1" ? "#90b8e0" : "#d4b94a";
          return (
            <div
              key={seg.id}
              onClick={() => {
                setActiveSegId(seg.id);
                if (seg.startSec !== undefined) seekTo(seg.startSec);
              }}
              style={{
                background: isActive ? "rgba(139,92,246,0.06)" : S2,
                border: `1px solid ${isActive ? T.accentBorder : BD}`,
                borderRadius: T.radius.md, marginBottom: 6, cursor: "pointer", transition: "border-color 0.15s",
              }}
            >
              {/* Header: timecodes + actions */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 9px 4px", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, minWidth: 0 }}>
                  <EditableTC value={seg.start} clipDuration={clipDuration} onChange={(newVal) => {
                    const newSec = parseTime(newVal);
                    setEditSegments(prev => prev.map(s => s.id === seg.id ? { ...s, startSec: newSec, start: fmtTime(newSec), dur: (s.endSec - newSec).toFixed(1) + "s" } : s));
                    markDirty();
                  }} />
                  <span style={{ fontSize: 9, color: T.textTertiary }}>→</span>
                  <EditableTC value={seg.end} clipDuration={clipDuration} onChange={(newVal) => {
                    const newSec = parseTime(newVal);
                    setEditSegments(prev => prev.map(s => s.id === seg.id ? { ...s, endSec: newSec, end: fmtTime(newSec), dur: (newSec - s.startSec).toFixed(1) + "s" } : s));
                    markDirty();
                  }} />
                  <span style={{ fontSize: 9, color: T.textTertiary, fontFamily: T.mono }}>[{seg.dur}]</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor }} title={seg.track === "s1" ? "Sub 1" : "Sub 2"} />
                  <Ib title="Split here" onClick={(e) => { e.stopPropagation(); setActiveSegId(seg.id); setTimeout(handleSplit, 0); }} style={{ width: 20, height: 20, fontSize: 11 }}>⌇</Ib>
                  <Ib title="Delete segment" onClick={(e) => { e.stopPropagation(); handleDelete(seg.id); }} style={{ width: 20, height: 20, fontSize: 11 }}>✕</Ib>
                </div>
              </div>

              {/* Text as word spans */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "0 9px 8px" }}>
                <div
                  style={{
                    flex: 1, fontSize: 12.5, color: T.text, lineHeight: 1.8, minHeight: 18,
                    borderRadius: 3, padding: "2px 4px", background: isActive ? "rgba(255,255,255,0.04)" : "transparent",
                    border: isActive ? `1px solid ${BD}` : "1px solid transparent",
                    fontFamily: T.font, cursor: "text",
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {seg.text.split(/\s+/).map((word, wi, arr) => {
                    const segDur = seg.endSec - seg.startSec;
                    const wordStart = seg.startSec + (wi / arr.length) * segDur;
                    const isSelected = selectedWordInfo && selectedWordInfo.segId === seg.id && selectedWordInfo.wordIdx === wi;
                    const wKey = `es-${seg.id}-${wi}`;
                    const isEditing = editingWordKey === wKey;

                    if (isEditing) {
                      return (
                        <input
                          key={wKey}
                          autoFocus
                          defaultValue={word}
                          onBlur={e => {
                            const newWord = e.target.value.trim();
                            if (newWord && newWord !== word) {
                              const newWords = seg.text.split(/\s+/);
                              newWords[wi] = newWord;
                              setEditSegments(prev => prev.map(s => s.id === seg.id ? { ...s, text: newWords.join(" ") } : s));
                              markDirty();
                            }
                            setEditingWordKey(null);
                          }}
                          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingWordKey(null); }}
                          onClick={e => e.stopPropagation()}
                          style={{
                            width: Math.max(30, word.length * 8), fontSize: 12.5, fontFamily: T.font,
                            color: T.accentLight, background: "rgba(139,92,246,0.15)",
                            border: `1px solid ${T.accentBorder}`, borderRadius: 3,
                            padding: "1px 3px", outline: "none", display: "inline",
                          }}
                        />
                      );
                    }

                    return (
                      <span
                        key={wKey}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWordInfo({ segId: seg.id, wordIdx: wi });
                          setActiveSegId(seg.id);
                          seekTo(wordStart);
                        }}
                        onDoubleClick={() => setEditingWordKey(wKey)}
                        style={{
                          cursor: "pointer", padding: "1px 2px", borderRadius: 2,
                          background: isSelected ? T.accentDim : "transparent",
                          color: isSelected ? T.accentLight : T.text,
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "rgba(139,92,246,0.08)"; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                      >
                        {word}{wi < arr.length - 1 ? " " : ""}
                      </span>
                    );
                  })}
                </div>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0, marginTop: 6,
                  background: confColor[seg.conf],
                  boxShadow: seg.conf === "low" ? `0 0 4px ${T.red}` : "none",
                }} title={`Confidence: ${seg.conf}`} />
              </div>

              {/* Warning */}
              {seg.warning && (
                <div style={{ fontSize: 10, color: T.yellow, padding: "0 9px 7px", display: "flex", alignItems: "center", gap: 4 }}>
                  ⚠ {seg.warning}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
