import React from "react";
import T from "../../styles/theme";
import { SectionLabel } from "../../components/shared";
import useSubtitleStore from "../stores/useSubtitleStore";
import useEditorStore from "../stores/useEditorStore";
import { Pill, Ib, Divider, Toggle, SwatchBtn, PosGrid, NumBox, SliderRow } from "../primitives/editorPrimitives";
import { BD, BDH, S2, S3, HIGHLIGHT_COLORS } from "../utils/constants";

export default function SubtitlesDrawer() {
  // ── Store selectors ──
  const subMode = useSubtitleStore((s) => s.subMode);
  const setSubMode = useSubtitleStore((s) => s.setSubMode);
  const subFontFamily = useSubtitleStore((s) => s.subFontFamily);
  const setSubFontFamily = useSubtitleStore((s) => s.setSubFontFamily);
  const fontSize = useSubtitleStore((s) => s.fontSize);
  const setFontSize = useSubtitleStore((s) => s.setFontSize);
  const lineMode = useSubtitleStore((s) => s.lineMode);
  const setLineMode = useSubtitleStore((s) => s.setLineMode);
  const strokeOn = useSubtitleStore((s) => s.strokeOn);
  const setStrokeOn = useSubtitleStore((s) => s.setStrokeOn);
  const strokeWidth = useSubtitleStore((s) => s.strokeWidth);
  const setStrokeWidth = useSubtitleStore((s) => s.setStrokeWidth);
  const shadowOn = useSubtitleStore((s) => s.shadowOn);
  const setShadowOn = useSubtitleStore((s) => s.setShadowOn);
  const shadowBlur = useSubtitleStore((s) => s.shadowBlur);
  const setShadowBlur = useSubtitleStore((s) => s.setShadowBlur);
  const bgOn = useSubtitleStore((s) => s.bgOn);
  const setBgOn = useSubtitleStore((s) => s.setBgOn);
  const bgOpacity = useSubtitleStore((s) => s.bgOpacity);
  const setBgOpacity = useSubtitleStore((s) => s.setBgOpacity);
  const highlightColor = useSubtitleStore((s) => s.highlightColor);
  const setHighlightColor = useSubtitleStore((s) => s.setHighlightColor);
  const subPos = useSubtitleStore((s) => s.subPos);
  const setSubPos = useSubtitleStore((s) => s.setSubPos);
  const punctOn = useSubtitleStore((s) => s.punctOn);
  const setPunctOn = useSubtitleStore((s) => s.setPunctOn);
  const showSubs = useSubtitleStore((s) => s.showSubs);
  const setShowSubs = useSubtitleStore((s) => s.setShowSubs);
  const emojiOn = useSubtitleStore((s) => s.emojiOn);
  const setEmojiOn = useSubtitleStore((s) => s.setEmojiOn);
  const syncOffset = useSubtitleStore((s) => s.syncOffset);
  const setSyncOffset = useSubtitleStore((s) => s.setSyncOffset);
  const s1Open = useSubtitleStore((s) => s.s1Open);
  const setS1Open = useSubtitleStore((s) => s.setS1Open);
  const s2Open = useSubtitleStore((s) => s.s2Open);
  const setS2Open = useSubtitleStore((s) => s.setS2Open);

  return (
    <div>
      {/* ── GLOBAL ── */}
      <div style={{ borderBottom: `2px solid ${BD}` }}>
        <div style={{ padding: "8px 13px 4px", fontSize: 9, fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase", color: T.textTertiary }}>GLOBAL</div>

        {/* Mode */}
        <div style={{ padding: "10px 13px" }}>
          <SectionLabel>Mode</SectionLabel>
          <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
            <Pill label="Karaoke" active={subMode === "karaoke"} onClick={() => setSubMode("karaoke")} icon={<span style={{ color: T.green, fontWeight: 800 }}>the</span>} />
            <Pill label="Word" active={subMode === "word"} onClick={() => setSubMode("word")} icon={<span style={{ fontWeight: 800, fontSize: 11 }}>the</span>} />
            <Pill label="Phrase" active={subMode === "phrase"} onClick={() => setSubMode("phrase")} />
          </div>
        </div>
        <Divider />

        {/* Basic: Font + size + format */}
        <div style={{ padding: "10px 13px" }}>
          <SectionLabel>Basic</SectionLabel>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, marginBottom: 7 }}>
            <select
              value={subFontFamily}
              onChange={e => setSubFontFamily(e.target.value)}
              style={{
                flex: 1, background: S2, border: `1px solid ${BD}`, borderRadius: 5,
                padding: "6px 9px", fontSize: 11, color: T.text, cursor: "pointer",
                fontFamily: T.font, outline: "none",
              }}
            >
              {["Montserrat", "DM Sans", "Impact", "Arial", "Roboto", "Georgia"].map(f =>
                <option key={f} value={f}>{f}</option>
              )}
            </select>
            <NumBox value={fontSize} onChange={setFontSize} min={8} max={120} />
          </div>

          {/* Format toolbar row 1 */}
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Ib title="As typed" active style={{ fontSize: 12 }}>Aa</Ib>
            <Ib title="Uppercase" style={{ fontSize: 12 }}>AB</Ib>
            <div style={{ width: 1, height: 16, background: BD, margin: "0 2px" }} />
            <Ib title="Align left" active style={{ fontSize: 12 }}>☰</Ib>
            <Ib title="Align center" style={{ fontSize: 12 }}>☰</Ib>
            <Ib title="Align right" style={{ fontSize: 12 }}>☰</Ib>
            <div style={{ width: 1, height: 16, background: BD, margin: "0 2px" }} />
            <Ib title="Italic" style={{ fontSize: 12, fontStyle: "italic" }}>I</Ib>
            <Ib title="Bold" active style={{ fontSize: 12, fontWeight: 800 }}>B</Ib>
            <Ib title="Underline" style={{ fontSize: 12, textDecoration: "underline" }}>U</Ib>
          </div>

          {/* Format toolbar row 2 */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 5 }}>
            <Ib title="1 line (~3 words)" active={lineMode === "1L"} onClick={() => setLineMode("1L")} style={{ fontSize: 9, fontWeight: 700 }}>1L</Ib>
            <Ib title="2 lines (full phrase)" active={lineMode === "2L"} onClick={() => setLineMode("2L")} style={{ fontSize: 9, fontWeight: 700 }}>2L</Ib>
            <div style={{ width: 1, height: 16, background: BD, margin: "0 2px" }} />
            <SwatchBtn color="#fff" size={18} style={{ border: "1px solid #555" }} />
            <SwatchBtn color={highlightColor} size={18} style={{ marginLeft: 4 }} />
          </div>
        </div>
        <Divider />

        {/* Stroke */}
        <div style={{ padding: "10px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SectionLabel>Stroke</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: T.textSecondary }}>{strokeWidth}</span>
              <SwatchBtn color="#000" size={18} />
              <Ib onClick={() => setStrokeOn(!strokeOn)} style={{ width: 20, height: 20, fontSize: 13, border: `1px solid ${BD}`, background: S2 }}>
                {strokeOn ? "−" : "+"}
              </Ib>
            </div>
          </div>
          {strokeOn && (
            <div style={{ marginTop: 6 }}>
              <SliderRow value={strokeWidth} onChange={setStrokeWidth} min={0} max={20} />
            </div>
          )}
        </div>
        <Divider />

        {/* Shadow */}
        <div style={{ padding: "10px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SectionLabel>Shadow</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <SwatchBtn color="#000" size={18} style={{ opacity: 0.4 }} />
              <Ib onClick={() => setShadowOn(!shadowOn)} style={{ width: 20, height: 20, fontSize: 13, border: `1px solid ${BD}`, background: S2 }}>
                {shadowOn ? "−" : "+"}
              </Ib>
            </div>
          </div>
          {shadowOn && (
            <div style={{ marginTop: 8 }}>
              <SliderRow label="Blur" value={shadowBlur} onChange={setShadowBlur} min={0} max={30} />
            </div>
          )}
        </div>
        <Divider />

        {/* Background */}
        <div style={{ padding: "10px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SectionLabel>Background</SectionLabel>
            <Ib onClick={() => setBgOn(!bgOn)} style={{ width: 20, height: 20, fontSize: 13, border: `1px solid ${BD}`, background: S2 }}>
              {bgOn ? "−" : "+"}
            </Ib>
          </div>
          {bgOn && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <SwatchBtn color="#000" size={24} />
                <SliderRow label="Opacity" value={bgOpacity} onChange={setBgOpacity} suffix="%" />
              </div>
            </div>
          )}
        </div>
        <Divider />

        {/* Highlight */}
        <div style={{ padding: "10px 13px" }}>
          <SectionLabel>Highlight</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {HIGHLIGHT_COLORS.map(c => (
              <SwatchBtn
                key={c}
                color={c}
                size={22}
                selected={highlightColor === c}
                onClick={() => setHighlightColor(c)}
                style={{ borderRadius: "50%", border: c === "#ffffff" ? "1px solid #555" : undefined }}
              />
            ))}
            <div style={{
              width: 22, height: 22, borderRadius: "50%", border: `1px dashed ${BDH}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: T.textTertiary, fontSize: 13, cursor: "pointer",
            }}>+</div>
          </div>
        </div>
        <Divider />

        {/* Position */}
        <div style={{ padding: "10px 13px" }}>
          <SectionLabel>Position</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
            <PosGrid value={subPos} onChange={setSubPos} />
          </div>
        </div>
        <Divider />

        {/* Punctuation */}
        <div style={{ padding: "10px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SectionLabel>Punctuation</SectionLabel>
            <Toggle on={punctOn} onClick={() => setPunctOn(!punctOn)} />
          </div>
          <div style={{ opacity: punctOn ? 1 : 0.35, pointerEvents: punctOn ? "auto" : "none", marginTop: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {[", Commas", ". Periods", "? Questions", "! Exclamation", "… Ellipsis", ": Colons"].map((p, i) => (
                <label key={p} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: T.textSecondary, cursor: "pointer", padding: "3px 0" }}>
                  <input type="checkbox" defaultChecked={i < 2 || i === 4} style={{ accentColor: T.accent, width: 12, height: 12 }} />
                  <span>{p}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <Divider />

        {/* Sync offset */}
        <div style={{ padding: "10px 13px" }}>
          <SectionLabel>Sync Offset</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <input type="range" min={-10} max={10} step={1} value={syncOffset * 10}
              onChange={e => setSyncOffset(Number(e.target.value) / 10)}
              style={{ flex: 1, height: 3, accentColor: T.accent, cursor: "pointer" }}
            />
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textSecondary, minWidth: 40, textAlign: "right" }}>
              {syncOffset > 0 ? "+" : ""}{syncOffset.toFixed(1)}s
            </span>
          </div>
        </div>
        <Divider />

        {/* Quick toggles */}
        <div style={{ padding: "10px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: T.textSecondary }}>Show subtitles</span>
            <Toggle on={showSubs} onClick={() => setShowSubs(!showSubs)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 11, color: T.textSecondary }}>Emoji</span>
            <Toggle on={emojiOn} onClick={() => setEmojiOn(!emojiOn)} />
          </div>
        </div>
      </div>

      {/* ── Sub 1 accordion ── */}
      <div style={{ borderBottom: `1px solid ${BD}` }}>
        <div onClick={() => setS1Open(!s1Open)} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 13px", cursor: "pointer", userSelect: "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#90b8e0" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Sub 1</span>
            <span style={{ fontSize: 10, color: T.accentLight, background: T.accentDim, borderRadius: 10, padding: "1px 7px" }}>1 override</span>
          </div>
          <span style={{ fontSize: 14, color: T.textTertiary, transform: s1Open ? "rotate(90deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>›</span>
        </div>
        {s1Open && (
          <div style={{ borderTop: `1px solid ${BD}` }}>
            <div style={{ padding: "7px 13px", fontSize: 10, color: T.textTertiary, background: "rgba(139,92,246,0.06)", borderBottom: `1px solid ${BD}` }}>
              Changes here override Global for Sub 1 only.
            </div>
            <div style={{ padding: "10px 13px" }}>
              <SectionLabel>Size <span style={{ fontSize: 9, color: T.accentLight, fontWeight: 500, marginLeft: 4 }}>overriding global (52)</span></SectionLabel>
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <NumBox value={64} onChange={() => {}} />
                <button style={{ fontSize: 10, color: T.accentLight, background: "transparent", border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: "2px 7px", cursor: "pointer", fontFamily: T.font }}>↺</button>
              </div>
            </div>
            <Divider />
            <div style={{ padding: "10px 13px" }}>
              <SectionLabel>Highlight</SectionLabel>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {HIGHLIGHT_COLORS.map(c => <SwatchBtn key={c} color={c} size={22} style={{ borderRadius: "50%", border: c === "#ffffff" ? "1px solid #555" : undefined }} selected={c === "#f4c430"} />)}
              </div>
            </div>
            <div style={{ padding: "10px 13px", borderTop: `1px solid ${BD}` }}>
              <button style={{
                width: "100%", background: "transparent", border: `1px solid ${BDH}`, borderRadius: 5,
                padding: 6, fontSize: 11, color: T.textSecondary, cursor: "pointer", fontFamily: T.font,
              }}>
                ↺ Reset all Sub 1 overrides
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Sub 2 accordion ── */}
      <div style={{ borderBottom: `1px solid ${BD}` }}>
        <div onClick={() => setS2Open(!s2Open)} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 13px", cursor: "pointer", userSelect: "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#d4b94a" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Sub 2</span>
            <span style={{ fontSize: 10, color: T.accentLight, background: T.accentDim, borderRadius: 10, padding: "1px 7px" }}>2 overrides</span>
          </div>
          <span style={{ fontSize: 14, color: T.textTertiary, transform: s2Open ? "rotate(90deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>›</span>
        </div>
        {s2Open && (
          <div style={{ borderTop: `1px solid ${BD}` }}>
            <div style={{ padding: "7px 13px", fontSize: 10, color: T.textTertiary, background: "rgba(139,92,246,0.06)", borderBottom: `1px solid ${BD}` }}>
              Changes here override Global for Sub 2 only.
            </div>
            <div style={{ padding: "10px 13px" }}>
              <SectionLabel>Mode <span style={{ fontSize: 9, color: T.accentLight, fontWeight: 500, marginLeft: 4 }}>overriding global (Karaoke)</span></SectionLabel>
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                <Pill label="Karaoke" active={false} onClick={() => {}} />
                <Pill label="Word" active onClick={() => {}} />
                <Pill label="Phrase" active={false} onClick={() => {}} />
              </div>
              <div style={{ marginTop: 6 }}>
                <button style={{ fontSize: 10, color: T.accentLight, background: "transparent", border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: "2px 7px", cursor: "pointer", fontFamily: T.font }}>↺ Reset</button>
              </div>
            </div>
            <Divider />
            <div style={{ padding: "10px 13px" }}>
              <SectionLabel>Highlight <span style={{ fontSize: 9, color: T.accentLight, fontWeight: 500, marginLeft: 4 }}>overriding global (Green)</span></SectionLabel>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {HIGHLIGHT_COLORS.map(c => <SwatchBtn key={c} color={c} size={22} style={{ borderRadius: "50%", border: c === "#ffffff" ? "1px solid #555" : undefined }} selected={c === "#e63946"} />)}
              </div>
              <div style={{ marginTop: 6 }}>
                <button style={{ fontSize: 10, color: T.accentLight, background: "transparent", border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: "2px 7px", cursor: "pointer", fontFamily: T.font }}>↺ Reset</button>
              </div>
            </div>
            <div style={{ padding: "10px 13px", borderTop: `1px solid ${BD}` }}>
              <button style={{
                width: "100%", background: "transparent", border: `1px solid ${BDH}`, borderRadius: 5,
                padding: 6, fontSize: 11, color: T.textSecondary, cursor: "pointer", fontFamily: T.font,
              }}>
                ↺ Reset all Sub 2 overrides
              </button>
            </div>
          </div>
        )}
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}
