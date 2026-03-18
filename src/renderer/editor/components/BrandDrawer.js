import React, { useState, useEffect, useCallback } from "react";
import T from "../../styles/theme";
import { SectionLabel } from "../../components/shared";
import { Divider, Toggle, PosGrid, SliderRow } from "../primitives/editorPrimitives";
import { BD, BDH, S2, S3 } from "../utils/constants";
import useSubtitleStore from "../stores/useSubtitleStore";
import useCaptionStore from "../stores/useCaptionStore";
import useLayoutStore from "../stores/useLayoutStore";

// ── Font weight label helper ──
const WEIGHT_LABELS = { 300: "Light", 400: "Regular", 500: "Medium", 700: "Bold", 900: "Heavy" };
function weightLabel(w) { return WEIGHT_LABELS[w] || `${w}`; }

// ── Built-in default template ──
const BUILTIN_TEMPLATE = {
  id: "fega-default",
  name: "Fega Default",
  builtIn: true,
  caption: {
    fontFamily: "Latina Essential", fontWeight: 900, fontSize: 30,
    color: "#ffffff", bold: true, italic: true, underline: false,
    yPercent: 15, widthPercent: 90,
  },
  subtitle: {
    fontFamily: "Latina Essential", fontWeight: 900, fontSize: 52,
    italic: true, bold: true, underline: false,
    strokeOn: true, strokeWidth: 7, shadowOn: false, shadowBlur: 8,
    bgOn: false, bgOpacity: 80, highlightColor: "#4cce8a",
    lineMode: "2L", subMode: "karaoke", yPercent: 80,
  },
};

// ── Snapshot current state into template data ──
function snapshotTemplate(name) {
  const sub = useSubtitleStore.getState();
  const cap = useCaptionStore.getState();
  const lay = useLayoutStore.getState();
  return {
    id: `tpl-${Date.now()}`,
    name,
    builtIn: false,
    createdAt: new Date().toISOString(),
    caption: {
      fontFamily: cap.captionFontFamily, fontWeight: cap.captionFontWeight,
      fontSize: cap.captionFontSize, color: cap.captionColor,
      bold: cap.captionBold, italic: cap.captionItalic, underline: cap.captionUnderline,
      yPercent: lay.capYPercent, widthPercent: lay.capWidthPercent,
    },
    subtitle: {
      fontFamily: sub.subFontFamily, fontWeight: sub.subFontWeight,
      fontSize: sub.fontSize, italic: sub.subItalic, bold: sub.subBold, underline: sub.subUnderline,
      strokeOn: sub.strokeOn, strokeWidth: sub.strokeWidth,
      shadowOn: sub.shadowOn, shadowBlur: sub.shadowBlur,
      bgOn: sub.bgOn, bgOpacity: sub.bgOpacity,
      highlightColor: sub.highlightColor, lineMode: sub.lineMode, subMode: sub.subMode,
      yPercent: lay.subYPercent,
    },
  };
}

// ── Apply a template to all stores ──
function applyTemplate(tpl) {
  const c = tpl.caption;
  const s = tpl.subtitle;

  // Caption store
  const capStore = useCaptionStore.getState();
  capStore.setCaptionFontFamily(c.fontFamily);
  capStore.setCaptionFontWeight(c.fontWeight);
  capStore.setCaptionFontSize(c.fontSize);
  capStore.setCaptionColor(c.color);
  capStore.setCaptionBold(c.bold);
  capStore.setCaptionItalic(c.italic);
  capStore.setCaptionUnderline(c.underline);

  // Subtitle store
  const subStore = useSubtitleStore.getState();
  subStore.setSubFontFamily(s.fontFamily);
  subStore.setSubFontWeight(s.fontWeight);
  subStore.setFontSize(s.fontSize);
  subStore.setSubItalic(s.italic);
  subStore.setSubBold(s.bold);
  subStore.setSubUnderline(s.underline);
  subStore.setStrokeOn(s.strokeOn);
  subStore.setStrokeWidth(s.strokeWidth);
  subStore.setShadowOn(s.shadowOn);
  subStore.setShadowBlur(s.shadowBlur);
  subStore.setBgOn(s.bgOn);
  subStore.setBgOpacity(s.bgOpacity);
  subStore.setHighlightColor(s.highlightColor);
  subStore.setLineMode(s.lineMode);
  subStore.setSubMode(s.subMode);

  // Layout store (positions)
  const layStore = useLayoutStore.getState();
  layStore.setCapYPercent(c.yPercent);
  layStore.setCapWidthPercent(c.widthPercent);
  layStore.setSubYPercent(s.yPercent);
}

// ── Template detail string ──
function templateDetail(tpl) {
  const c = tpl.caption;
  const s = tpl.subtitle;
  return `${s.fontFamily} · ${s.fontSize} · ${weightLabel(s.fontWeight)}${s.italic ? " · Italic" : ""}`;
}

export default function BrandDrawer() {
  const [templates, setTemplates] = useState([]);
  const [activeId, setActiveId] = useState("fega-default");
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [wmOn, setWmOn] = useState(false);
  const [wmPos, setWmPos] = useState(2);
  const [wmOpacity, setWmOpacity] = useState(60);

  // Load saved templates from electron-store on mount
  useEffect(() => {
    if (window.clipflow?.storeGet) {
      window.clipflow.storeGet("layoutTemplates").then((saved) => {
        if (Array.isArray(saved) && saved.length > 0) {
          setTemplates(saved);
        }
      });
      window.clipflow.storeGet("activeTemplateId").then((id) => {
        if (id) setActiveId(id);
      });
    }
  }, []);

  // Persist templates to electron-store
  const persistTemplates = useCallback((tpls) => {
    setTemplates(tpls);
    if (window.clipflow?.storeSet) {
      window.clipflow.storeSet("layoutTemplates", tpls);
    }
  }, []);

  const persistActiveId = useCallback((id) => {
    setActiveId(id);
    if (window.clipflow?.storeSet) {
      window.clipflow.storeSet("activeTemplateId", id);
    }
  }, []);

  // Combined list: built-in + saved
  const allTemplates = [BUILTIN_TEMPLATE, ...templates];
  const activeTpl = allTemplates.find((t) => t.id === activeId) || BUILTIN_TEMPLATE;

  // Save current layout as new template
  const handleSave = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const tpl = snapshotTemplate(name);
    const updated = [...templates, tpl];
    persistTemplates(updated);
    persistActiveId(tpl.id);
    setNaming(false);
    setNewName("");
  }, [newName, templates, persistTemplates, persistActiveId]);

  // Apply template
  const handleApply = useCallback((tpl) => {
    applyTemplate(tpl);
    persistActiveId(tpl.id);
  }, [persistActiveId]);

  // Delete custom template
  const handleDelete = useCallback((id) => {
    const updated = templates.filter((t) => t.id !== id);
    persistTemplates(updated);
    if (activeId === id) persistActiveId("fega-default");
  }, [templates, activeId, persistTemplates, persistActiveId]);

  return (
    <div>
      {/* Active template header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 13px", background: T.accentDim, borderBottom: `1px solid ${T.accentBorder}`,
      }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text, display: "block" }}>{activeTpl.name}</span>
          <span style={{ fontSize: 10, color: T.accentLight, display: "block", marginTop: 2 }}>Active template</span>
        </div>
        <button
          onClick={() => handleApply(activeTpl)}
          style={{
            background: T.accent, color: "#fff", border: "none", borderRadius: 5,
            padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
          }}
        >
          Apply to clip
        </button>
      </div>

      {/* Layout Templates */}
      <div style={{ padding: "10px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionLabel>Layout Templates</SectionLabel>
          <button
            onClick={() => { setNaming(true); setNewName(""); }}
            style={{
              fontSize: 10, color: T.accentLight, background: "transparent",
              border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: "2px 8px",
              cursor: "pointer", fontFamily: T.font,
            }}
          >
            + Save current
          </button>
        </div>

        {/* Name input for new template */}
        {naming && (
          <div style={{
            display: "flex", gap: 6, marginBottom: 8, padding: "6px 8px",
            background: S2, borderRadius: 5, border: `1px solid ${T.accentBorder}`,
          }}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") setNaming(false);
              }}
              placeholder="Template name..."
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: T.text, fontSize: 12, fontFamily: T.font,
              }}
            />
            <button
              onClick={handleSave}
              style={{
                background: T.accent, color: "#fff", border: "none", borderRadius: 4,
                padding: "3px 10px", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
              }}
            >
              Save
            </button>
            <button
              onClick={() => setNaming(false)}
              style={{
                background: "transparent", color: T.textSecondary, border: `1px solid ${BD}`, borderRadius: 4,
                padding: "3px 8px", fontSize: 10, cursor: "pointer", fontFamily: T.font,
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Template list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {allTemplates.map((tpl) => {
            const isActive = tpl.id === activeId;
            return (
              <div
                key={tpl.id}
                onClick={() => handleApply(tpl)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  background: isActive ? T.accentDim : S2,
                  border: `1px solid ${isActive ? T.accentBorder : BD}`,
                  borderRadius: 5, cursor: "pointer", transition: "all 0.15s",
                }}
              >
                {/* Preview thumbnail */}
                <div style={{
                  width: 36, height: 52, background: S3, borderRadius: 4,
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "space-between", padding: "4px 2px", flexShrink: 0,
                  position: "relative", overflow: "hidden",
                }}>
                  {/* Mini caption position indicator */}
                  <div style={{
                    width: "80%", height: 5, borderRadius: 2, background: T.accent,
                    position: "absolute", top: `${tpl.caption.yPercent}%`,
                    transform: "translateY(-50%)", opacity: 0.8,
                  }} />
                  {/* Mini subtitle position indicator */}
                  <div style={{
                    width: "60%", height: 4, borderRadius: 2, background: tpl.subtitle.highlightColor || "#4cce8a",
                    position: "absolute", top: `${tpl.subtitle.yPercent}%`,
                    transform: "translateY(-50%)", opacity: 0.8,
                  }} />
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: T.text, display: "block" }}>{tpl.name}</span>
                  <span style={{ fontSize: 10, color: T.textSecondary, display: "block", marginTop: 2 }}>
                    {templateDetail(tpl)}
                  </span>
                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                      background: "#90b8e033", color: "#90b8e0",
                    }}>Subs</span>
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                      background: `${T.green}33`, color: T.green,
                    }}>Caption</span>
                  </div>
                </div>

                {/* Active indicator or delete button */}
                {isActive ? (
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 10,
                    background: T.accent, color: "#fff",
                  }}>Active</span>
                ) : !tpl.builtIn ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(tpl.id); }}
                    style={{
                      background: "transparent", border: "none", color: T.textTertiary,
                      fontSize: 14, cursor: "pointer", padding: "2px 4px", lineHeight: 1,
                    }}
                    title="Delete template"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <Divider />

      {/* Brand Colors */}
      <div style={{ padding: "10px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionLabel>Brand Colors</SectionLabel>
        </div>
        {[
          { name: "Fega Purple", hex: "#7C5CBF", color: "#7c5cbf" },
          { name: "Karaoke Green", hex: "#4CCE8A", color: "#4cce8a" },
          { name: "Clean White", hex: "#FFFFFF", color: "#fff" },
          { name: "Hype Red", hex: "#E63946", color: "#e63946" },
        ].map(c => (
          <div key={c.hex} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 5, cursor: "pointer" }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, background: c.color, border: c.color === "#fff" ? "1px solid #444" : "none" }} />
            <span style={{ flex: 1, fontSize: 11, color: T.textSecondary }}>{c.name}</span>
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textTertiary }}>{c.hex}</span>
          </div>
        ))}
      </div>
      <Divider />

      {/* Watermark */}
      <div style={{ padding: "10px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionLabel>Watermark</SectionLabel>
          <Toggle on={wmOn} onClick={() => setWmOn(!wmOn)} />
        </div>
        <div style={{ opacity: wmOn ? 1 : 0.35, pointerEvents: wmOn ? "auto" : "none" }}>
          <div style={{
            border: `1px dashed ${BDH}`, borderRadius: 5, padding: 16, textAlign: "center",
            fontSize: 11, color: T.textTertiary, cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <span style={{ fontSize: 20, opacity: 0.4 }}>◈</span>
            <span>Drop logo here or click to upload</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <span style={{ fontSize: 11, color: T.textSecondary }}>Position</span>
            <PosGrid value={wmPos} onChange={setWmPos} cellSize={12} gap={3} width={54} />
          </div>
          <div style={{ marginTop: 8 }}>
            <SliderRow label="Opacity" value={wmOpacity} onChange={setWmOpacity} min={10} max={100} suffix="%" />
          </div>
        </div>
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}
