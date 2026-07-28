// Render-ready IPC payload builder — reads CURRENT store state (unsaved edits
// included) so renders and viewer screenshots capture exactly what the preview
// shows. Used by the editor Topbar (doRender) and PreviewPanelNew (screenshot).
// Renderer-only ESM; the main process never requires this file.
import useEditorStore from "../stores/useEditorStore";
import useSubtitleStore from "../stores/useSubtitleStore";
import useCaptionStore from "../stores/useCaptionStore";
import useLayoutStore from "../stores/useLayoutStore";
import { visibleSubtitleSegments } from "../models/timeMapping";

export function buildRenderPayload() {
  const { clip, project } = useEditorStore.getState();
  if (!clip || !project) return null;

  const subState = useSubtitleStore.getState();
  const capState = useCaptionStore.getState();
  const layState = useLayoutStore.getState();
  const editorState = useEditorStore.getState();

  // Map subtitles from source-absolute to timeline time for the overlay renderer.
  // The renderer operates in timeline time (0-based), so we convert source coords
  // to timeline coords and remap field names for findActiveWord compatibility.
  const nleSegs = editorState.nleSegments || [];
  const rawEditSegments = subState.editSegments || [];
  let timelineSubs;
  if (nleSegs.length > 0) {
    const mapped = visibleSubtitleSegments(rawEditSegments, nleSegs);
    timelineSubs = mapped.map((seg) => ({
      ...seg,
      startSec: seg.timelineStartSec,
      endSec: seg.timelineEndSec,
      words: (seg.words || []).map((w) => ({
        ...w,
        start: w.timelineStart !== undefined ? w.timelineStart : w.start,
        end: w.timelineEnd !== undefined ? w.timelineEnd : w.end,
      })),
    }));
  } else {
    timelineSubs = rawEditSegments;
  }

  const renderClip = {
    ...clip,
    subtitles: timelineSubs,
    nleSegments: nleSegs,
    // #202: current (possibly unsaved) SFX/music placements — the render must
    // match the preview, not the last-saved clip record.
    sfx: editorState.audioPlacements || [],
  };
  // Full subtitle style — every property the overlay renderer needs
  // Includes both store names (subFontFamily) and engine names (fontFamily)
  const fullSubtitleStyle = {
    fontSize: subState.fontSize,
    fontFamily: subState.subFontFamily, subFontFamily: subState.subFontFamily,
    fontWeight: subState.subFontWeight, subFontWeight: subState.subFontWeight,
    bold: subState.subBold, subBold: subState.subBold,
    italic: subState.subItalic, subItalic: subState.subItalic,
    underline: subState.subUnderline, subUnderline: subState.subUnderline,
    subColor: subState.subColor, subMode: subState.subMode,
    highlightMode: subState.highlightMode,
    highlightColor: subState.highlightColor, showSubs: subState.showSubs,
    segmentMode: subState.segmentMode, syncOffset: subState.syncOffset,
    strokeOn: subState.strokeOn, strokeWidth: subState.strokeWidth,
    strokeColor: subState.strokeColor, strokeOpacity: subState.strokeOpacity,
    strokeBlur: subState.strokeBlur, strokeOffsetX: subState.strokeOffsetX, strokeOffsetY: subState.strokeOffsetY,
    shadowOn: subState.shadowOn, shadowColor: subState.shadowColor,
    shadowOpacity: subState.shadowOpacity, shadowBlur: subState.shadowBlur,
    shadowOffsetX: subState.shadowOffsetX, shadowOffsetY: subState.shadowOffsetY,
    glowOn: subState.glowOn, glowColor: subState.glowColor,
    glowOpacity: subState.glowOpacity, glowIntensity: subState.glowIntensity,
    glowBlur: subState.glowBlur, glowBlend: subState.glowBlend,
    glowOffsetX: subState.glowOffsetX, glowOffsetY: subState.glowOffsetY,
    bgOn: subState.bgOn, bgColor: subState.bgColor, bgOpacity: subState.bgOpacity,
    bgPaddingX: subState.bgPaddingX, bgPaddingY: subState.bgPaddingY, bgRadius: subState.bgRadius,
    effectOrder: subState.effectOrder,
    animateOn: subState.animateOn, animateScale: subState.animateScale,
    animateGrowFrom: subState.animateGrowFrom, animateSpeed: subState.animateSpeed,
    punctuationRemove: subState.punctuationRemove,
    yPercent: layState.subYPercent ?? 80,
  };
  // Full caption style
  const fullCaptionStyle = {
    fontFamily: capState.captionFontFamily, fontWeight: capState.captionFontWeight,
    fontSize: capState.captionFontSize, bold: capState.captionBold,
    italic: capState.captionItalic, underline: capState.captionUnderline,
    color: capState.captionColor, lineSpacing: capState.captionLineSpacing,
    strokeOn: capState.captionStrokeOn, strokeColor: capState.captionStrokeColor,
    strokeWidth: capState.captionStrokeWidth, strokeOpacity: capState.captionStrokeOpacity,
    strokeBlur: capState.captionStrokeBlur, strokeOffsetX: capState.captionStrokeOffsetX, strokeOffsetY: capState.captionStrokeOffsetY,
    shadowOn: capState.captionShadowOn, shadowColor: capState.captionShadowColor,
    shadowOpacity: capState.captionShadowOpacity, shadowBlur: capState.captionShadowBlur,
    shadowOffsetX: capState.captionShadowOffsetX, shadowOffsetY: capState.captionShadowOffsetY,
    glowOn: capState.captionGlowOn, glowColor: capState.captionGlowColor,
    glowOpacity: capState.captionGlowOpacity, glowIntensity: capState.captionGlowIntensity,
    glowBlur: capState.captionGlowBlur, glowBlend: capState.captionGlowBlend,
    glowOffsetX: capState.captionGlowOffsetX, glowOffsetY: capState.captionGlowOffsetY,
    bgOn: capState.captionBgOn, bgColor: capState.captionBgColor, bgOpacity: capState.captionBgOpacity,
    bgPaddingX: capState.captionBgPaddingX, bgPaddingY: capState.captionBgPaddingY, bgRadius: capState.captionBgRadius,
    effectOrder: capState.captionEffectOrder,
    yPercent: layState.capYPercent ?? 15,
    widthPercent: layState.capWidthPercent ?? 90,
  };
  // JSON round-trip to strip any non-serializable data (functions, proxies)
  // before sending over IPC — Electron's structured clone rejects them
  const safeClip = JSON.parse(JSON.stringify(renderClip));
  const safeProject = JSON.parse(JSON.stringify(project));
  const safeOptions = JSON.parse(JSON.stringify({
    subtitleStyle: fullSubtitleStyle,
    captionStyle: fullCaptionStyle,
    captionSegments: capState.captionSegments || [],
  }));
  return { safeClip, safeProject, safeOptions };
}
