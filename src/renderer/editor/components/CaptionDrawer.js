import React from "react";
import T from "../../styles/theme";
import { SectionLabel } from "../../components/shared";
import useCaptionStore from "../stores/useCaptionStore";
import useEditorStore from "../stores/useEditorStore";
import { Ib, NumBox, SwatchBtn } from "../primitives/editorPrimitives";
import { BD, S2 } from "../utils/constants";

export default function CaptionDrawer() {
  const captionText = useCaptionStore((s) => s.captionText);
  const setCaptionText = useCaptionStore((s) => s.setCaptionText);
  const captionFontFamily = useCaptionStore((s) => s.captionFontFamily);
  const setCaptionFontFamily = useCaptionStore((s) => s.setCaptionFontFamily);
  const captionFontSize = useCaptionStore((s) => s.captionFontSize);
  const setCaptionFontSize = useCaptionStore((s) => s.setCaptionFontSize);
  const captionColor = useCaptionStore((s) => s.captionColor);
  const setCaptionColor = useCaptionStore((s) => s.setCaptionColor);
  const captionBold = useCaptionStore((s) => s.captionBold);
  const setCaptionBold = useCaptionStore((s) => s.setCaptionBold);
  const captionItalic = useCaptionStore((s) => s.captionItalic);
  const setCaptionItalic = useCaptionStore((s) => s.setCaptionItalic);
  const captionUnderline = useCaptionStore((s) => s.captionUnderline);
  const setCaptionUnderline = useCaptionStore((s) => s.setCaptionUnderline);
  const markDirty = useEditorStore((s) => s.markDirty);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Caption text editing */}
      <div style={{ padding: "10px 13px", borderBottom: `1px solid ${BD}` }}>
        <SectionLabel>Caption Text</SectionLabel>
        <textarea
          value={captionText}
          onChange={e => { setCaptionText(e.target.value); markDirty(); }}
          placeholder="Enter caption text…"
          rows={3}
          style={{
            width: "100%", background: S2, border: `1px solid ${BD}`, borderRadius: 5,
            padding: "8px 10px", color: T.text, fontSize: 13, fontFamily: T.font,
            outline: "none", resize: "vertical", marginTop: 8, lineHeight: 1.5,
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Font family + size */}
      <div style={{ padding: "10px 13px", borderBottom: `1px solid ${BD}` }}>
        <SectionLabel>Font</SectionLabel>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
          <select
            value={captionFontFamily}
            onChange={e => { setCaptionFontFamily(e.target.value); markDirty(); }}
            style={{
              flex: 1, background: S2, border: `1px solid ${BD}`, borderRadius: 5,
              padding: "6px 10px", fontSize: 11, color: T.text, cursor: "pointer",
              fontFamily: T.font, outline: "none",
            }}
          >
            {["Montserrat", "DM Sans", "Impact", "Arial", "Roboto", "Georgia", "Courier New"].map(f =>
              <option key={f} value={f}>{f}</option>
            )}
          </select>
          <NumBox value={captionFontSize} onChange={v => { setCaptionFontSize(v); markDirty(); }} min={8} max={72} />
        </div>
      </div>

      {/* Color */}
      <div style={{ padding: "10px 13px", borderBottom: `1px solid ${BD}` }}>
        <SectionLabel>Color</SectionLabel>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {["#ffffff", "#f4c430", "#4cce8a", "#e63946", T.accent, "#22d3ee"].map(c => (
            <SwatchBtn key={c} color={c} size={22} selected={captionColor === c}
              onClick={() => { setCaptionColor(c); markDirty(); }}
            />
          ))}
        </div>
      </div>

      {/* Format: B/I/U */}
      <div style={{ padding: "10px 13px" }}>
        <SectionLabel>Format</SectionLabel>
        <div style={{ display: "flex", gap: 2, marginTop: 8 }}>
          <Ib title="Bold" active={captionBold} onClick={() => { setCaptionBold(!captionBold); markDirty(); }}
            style={{ fontSize: 12, fontWeight: 800 }}>B</Ib>
          <Ib title="Italic" active={captionItalic} onClick={() => { setCaptionItalic(!captionItalic); markDirty(); }}
            style={{ fontSize: 12, fontStyle: "italic" }}>I</Ib>
          <Ib title="Underline" active={captionUnderline} onClick={() => { setCaptionUnderline(!captionUnderline); markDirty(); }}
            style={{ fontSize: 12, textDecoration: "underline" }}>U</Ib>
        </div>
      </div>
    </div>
  );
}
