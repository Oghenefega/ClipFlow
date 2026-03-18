import useSubtitleStore from "../stores/useSubtitleStore";
import useCaptionStore from "../stores/useCaptionStore";
import useLayoutStore from "../stores/useLayoutStore";

// ── Built-in default template ──
export const BUILTIN_TEMPLATE = {
  id: "fega-default", name: "Fega Default", builtIn: true,
  caption: { fontFamily: "Latina Essential", fontWeight: 900, fontSize: 30, color: "#ffffff", bold: true, italic: true, underline: false, yPercent: 15, widthPercent: 90 },
  subtitle: { fontFamily: "Latina Essential", fontWeight: 900, fontSize: 52, italic: true, bold: true, underline: false, strokeOn: true, strokeWidth: 7, shadowOn: false, shadowBlur: 8, bgOn: false, bgOpacity: 80, highlightColor: "#4cce8a", lineMode: "1L", subMode: "karaoke", yPercent: 80 },
};

export const DEFAULT_TEMPLATE_KEY = "defaultTemplateId";

export function applyTemplate(tpl) {
  const c = tpl.caption; const s = tpl.subtitle;
  const cs = useCaptionStore.getState(); const ss = useSubtitleStore.getState(); const ls = useLayoutStore.getState();
  cs.setCaptionFontFamily(c.fontFamily); cs.setCaptionFontWeight(c.fontWeight); cs.setCaptionFontSize(c.fontSize);
  cs.setCaptionColor(c.color); cs.setCaptionBold(c.bold); cs.setCaptionItalic(c.italic); cs.setCaptionUnderline(c.underline);
  ss.setSubFontFamily(s.fontFamily); ss.setSubFontWeight(s.fontWeight); ss.setFontSize(s.fontSize);
  ss.setSubItalic(s.italic); ss.setSubBold(s.bold); ss.setSubUnderline(s.underline);
  ss.setStrokeOn(s.strokeOn); ss.setStrokeWidth(s.strokeWidth); ss.setShadowOn(s.shadowOn); ss.setShadowBlur(s.shadowBlur);
  ss.setBgOn(s.bgOn); ss.setBgOpacity(s.bgOpacity); ss.setHighlightColor(s.highlightColor);
  ss.setLineMode(s.lineMode); ss.setSubMode(s.subMode);
  ls.setCapYPercent(c.yPercent); ls.setCapWidthPercent(c.widthPercent); ls.setSubYPercent(s.yPercent);
}

export function snapshotTemplate(name) {
  const sub = useSubtitleStore.getState();
  const cap = useCaptionStore.getState();
  const lay = useLayoutStore.getState();
  return {
    id: `tpl-${Date.now()}`, name, builtIn: false, createdAt: new Date().toISOString(),
    caption: { fontFamily: cap.captionFontFamily, fontWeight: cap.captionFontWeight, fontSize: cap.captionFontSize, color: cap.captionColor, bold: cap.captionBold, italic: cap.captionItalic, underline: cap.captionUnderline, yPercent: lay.capYPercent, widthPercent: lay.capWidthPercent },
    subtitle: { fontFamily: sub.subFontFamily, fontWeight: sub.subFontWeight, fontSize: sub.fontSize, italic: sub.subItalic, bold: sub.subBold, underline: sub.subUnderline, strokeOn: sub.strokeOn, strokeWidth: sub.strokeWidth, shadowOn: sub.shadowOn, shadowBlur: sub.shadowBlur, bgOn: sub.bgOn, bgOpacity: sub.bgOpacity, highlightColor: sub.highlightColor, lineMode: sub.lineMode, subMode: sub.subMode, yPercent: lay.subYPercent },
  };
}
