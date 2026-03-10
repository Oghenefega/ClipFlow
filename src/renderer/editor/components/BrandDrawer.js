import React, { useState } from "react";
import T from "../../styles/theme";
import { SectionLabel } from "../../components/shared";
import { Divider, Toggle, SwatchBtn, PosGrid, SliderRow } from "../primitives/editorPrimitives";
import { BD, BDH, S2, S3, BRAND_PRESETS } from "../utils/constants";

export default function BrandDrawer() {
  const [activePreset, setActivePreset] = useState("gaming");
  const [wmOn, setWmOn] = useState(false);
  const [wmPos, setWmPos] = useState(2);
  const [wmOpacity, setWmOpacity] = useState(60);

  return (
    <div>
      {/* Apply CTA */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 13px", background: T.accentDim, borderBottom: `1px solid ${T.accentBorder}`,
      }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text, display: "block" }}>Gaming Default</span>
          <span style={{ fontSize: 10, color: T.accentLight, display: "block", marginTop: 2 }}>Active preset</span>
        </div>
        <button style={{
          background: T.accent, color: "#fff", border: "none", borderRadius: 5,
          padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
        }}>
          ↳ Apply to clip
        </button>
      </div>

      {/* Style Presets */}
      <div style={{ padding: "10px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionLabel>Style Presets</SectionLabel>
          <button style={{
            fontSize: 10, color: T.accentLight, background: "transparent",
            border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: "2px 8px",
            cursor: "pointer", fontFamily: T.font,
          }}>+ Save current</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {BRAND_PRESETS.map(p => (
            <div
              key={p.id}
              onClick={() => setActivePreset(p.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                background: activePreset === p.id ? T.accentDim : S2,
                border: `1px solid ${activePreset === p.id ? T.accentBorder : BD}`,
                borderRadius: 5, cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <div style={{
                width: 44, height: 32, background: S3, borderRadius: 4,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 2, flexShrink: 0,
              }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: "#fff" }}>AB</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: T.text, display: "block" }}>{p.name}</span>
                <span style={{ fontSize: 10, color: T.textSecondary, display: "block", marginTop: 2 }}>{p.detail}</span>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  {p.tracks.map(t => {
                    const tc = t === "Sub 1" ? "#90b8e0" : t === "Sub 2" ? "#d4b94a" : t === "Caption" ? T.green : T.accentLight;
                    return (
                      <span key={t} style={{
                        fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                        background: `${tc}33`, color: tc,
                      }}>{t}</span>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Divider />

      {/* Brand Colors */}
      <div style={{ padding: "10px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionLabel>Brand Colors</SectionLabel>
          <button style={{ fontSize: 10, color: T.accentLight, background: "transparent", border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontFamily: T.font }}>+ Add</button>
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

      {/* Fonts */}
      <div style={{ padding: "10px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionLabel>Fonts</SectionLabel>
          <button style={{ fontSize: 10, color: T.accentLight, background: "transparent", border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontFamily: T.font }}>+ Add</button>
        </div>
        {[
          { name: "Montserrat", weight: "Bold · 900", badge: "Primary", active: true },
          { name: "DM Sans", weight: "Regular · 400", badge: "Secondary", active: false },
        ].map(f => (
          <div key={f.name} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 5,
            background: f.active ? T.accentDim : S2, border: `1px solid ${f.active ? T.accentBorder : BD}`,
            borderRadius: 5, cursor: "pointer",
          }}>
            <span style={{ width: 32, textAlign: "center", color: T.text, fontWeight: f.active ? 900 : 400, fontSize: f.active ? 15 : 13 }}>Aa</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: T.text, display: "block" }}>{f.name}</span>
              <span style={{ fontSize: 10, color: T.textSecondary, display: "block", marginTop: 1 }}>{f.weight}</span>
            </div>
            <span style={{
              fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 10,
              background: f.active ? T.accent : S3, color: f.active ? "#fff" : T.textSecondary,
            }}>{f.badge}</span>
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
