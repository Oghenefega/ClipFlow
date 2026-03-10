import React, { useRef } from "react";
import T from "../../styles/theme";
import useEditorStore from "../stores/useEditorStore";
import useLayoutStore from "../stores/useLayoutStore";
import { TOPBAR_H, S2, BD } from "../utils/constants";
import { Ib } from "../primitives/editorPrimitives";

export default function Topbar({ onBack, handleRender, rendering, renderProgress }) {
  const titleInputRef = useRef(null);

  const clipTitle = useEditorStore((s) => s.clipTitle);
  const editingTitle = useEditorStore((s) => s.editingTitle);
  const dirty = useEditorStore((s) => s.dirty);
  const clip = useEditorStore((s) => s.clip);
  const setClipTitle = useEditorStore((s) => s.setClipTitle);
  const setEditingTitle = useEditorStore((s) => s.setEditingTitle);
  const markDirty = useEditorStore((s) => s.markDirty);
  const handleSave = useEditorStore((s) => s.handleSave);
  const zoom = useLayoutStore((s) => s.zoom);

  return (
    <div style={{
      height: TOPBAR_H, minHeight: TOPBAR_H, background: T.surface, borderBottom: `1px solid ${BD}`,
      display: "flex", alignItems: "center", padding: "0 16px", gap: 12, zIndex: 9, flexShrink: 0,
    }}>
      {/* Left: Back + Undo/Redo/AutoSave */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {onBack && <Ib title="Back to clips" onClick={async () => { if (dirty) await handleSave(); onBack(); }} style={{ fontSize: 14 }}>←</Ib>}
        <Ib title="Undo">↩</Ib>
        <Ib title="Redo">↪</Ib>
        <Ib title="Auto-save">◎</Ib>
      </div>

      {/* Center: Clip title — click to edit */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={clipTitle}
            onChange={(e) => { setClipTitle(e.target.value); markDirty(); }}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => { if (e.key === "Enter") setEditingTitle(false); if (e.key === "Escape") { setClipTitle(clip?.title || "Untitled Clip"); setEditingTitle(false); } }}
            autoFocus
            style={{
              background: S2, border: `1px solid ${T.accentBorder}`, borderRadius: 5,
              padding: "5px 12px", color: T.text, fontSize: 13, fontWeight: 500,
              fontFamily: T.font, maxWidth: 340, width: 300, outline: "none",
              textAlign: "center",
            }}
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6, background: S2, border: `1px solid ${BD}`,
              borderRadius: 5, padding: "5px 12px", color: T.text, fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: T.font, maxWidth: 340, transition: "all 0.15s",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 2l3 3-9 9H2v-3L11 2z"/></svg>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clipTitle}</span>
          </button>
        )}
      </div>

      {/* Right: Zoom, Fullscreen, Save, Render */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
        <span style={{ fontSize: 11, color: T.textSecondary }}>{zoom}%</span>
        <Ib title="Fullscreen">⛶</Ib>
        <button
          onClick={handleSave}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: dirty ? T.accent : "rgba(255,255,255,0.06)",
            color: dirty ? "#fff" : T.textTertiary,
            border: "none", borderRadius: 5, padding: "6px 14px", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: T.font, transition: "background 0.15s",
          }}
        >
          {dirty ? "● Save" : "✓ Saved"}
        </button>
        <button
          onClick={handleRender}
          disabled={rendering || !clip}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: rendering ? T.yellow : `linear-gradient(135deg, ${T.green}, #2dd4a8)`,
            color: rendering ? "#000" : "#fff",
            border: "none", borderRadius: 5, padding: "6px 14px", fontSize: 12, fontWeight: 700,
            cursor: rendering ? "default" : "pointer", fontFamily: T.font, transition: "all 0.15s",
            opacity: !clip ? 0.4 : 1,
          }}
        >
          {rendering ? `⏳ ${renderProgress.pct}%` : "🚀 Ready to Share"}
        </button>
      </div>
    </div>
  );
}
