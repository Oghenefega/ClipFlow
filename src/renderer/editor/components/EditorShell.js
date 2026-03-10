import React, { useState, useRef, useCallback, useEffect } from "react";
import T from "../../styles/theme";
import useEditorStore from "../stores/useEditorStore";
import useLayoutStore from "../stores/useLayoutStore";
import useSubtitleStore from "../stores/useSubtitleStore";
import usePlaybackStore from "../stores/usePlaybackStore";
import { LP_MIN, LP_MAX, DRAWER_MIN, DRAWER_MAX, TL_MIN, TL_MAX, BD } from "../utils/constants";
import Topbar from "./Topbar";
import LeftPanel from "./LeftPanel";
import PreviewPanel from "./PreviewPanel";
import RightZone from "./RightZone";
import Timeline from "./Timeline";
import RenderOverlay from "./RenderOverlay";

export default function EditorShell({ onBack, gamesDb, anthropicApiKey }) {
  const clip = useEditorStore((s) => s.clip);

  // ── Render state (local — transient UI) ──
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState({ stage: "", pct: 0, detail: "" });
  const [renderResult, setRenderResult] = useState(null);

  // ── Resize refs ──
  const lpResizing = useRef(false);
  const drawerResizing = useRef(false);
  const tlResizing = useRef(false);

  // ── Resize: left panel ──
  const onLpResizeStart = useCallback((e) => {
    e.preventDefault();
    lpResizing.current = true;
    const startX = e.clientX;
    const startW = useLayoutStore.getState().lpWidth;
    const onMove = (ev) => {
      if (!lpResizing.current) return;
      const newW = Math.max(LP_MIN, Math.min(LP_MAX, startW + (ev.clientX - startX)));
      useLayoutStore.getState().setLpWidth(newW);
    };
    const onUp = () => { lpResizing.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // ── Resize: drawer ──
  const onDrawerResizeStart = useCallback((e) => {
    e.preventDefault();
    drawerResizing.current = true;
    const startX = e.clientX;
    const startW = useLayoutStore.getState().drawerWidth;
    const onMove = (ev) => {
      if (!drawerResizing.current) return;
      const newW = Math.max(DRAWER_MIN, Math.min(DRAWER_MAX, startW - (ev.clientX - startX)));
      useLayoutStore.getState().setDrawerWidth(newW);
    };
    const onUp = () => { drawerResizing.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // ── Resize: timeline ──
  const onTlResizeStart = useCallback((e) => {
    e.preventDefault();
    tlResizing.current = true;
    const startY = e.clientY;
    const startH = useLayoutStore.getState().tlHeight;
    const onMove = (ev) => {
      if (!tlResizing.current) return;
      const newH = Math.max(TL_MIN, Math.min(TL_MAX, startH - (ev.clientY - startY)));
      useLayoutStore.getState().setTlHeight(newH);
    };
    const onUp = () => { tlResizing.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // ── Render handler ──
  const handleRender = useCallback(async () => {
    const { clip: c, project } = useEditorStore.getState();
    if (!c || !project || rendering) return;
    setRendering(true);
    setRenderProgress({ stage: "rendering", pct: 0, detail: "Starting render..." });
    setRenderResult(null);

    const onProgress = (p) => setRenderProgress(p);
    window.clipflow?.onRenderProgress?.(onProgress);

    try {
      const subStore = useSubtitleStore.getState();
      const subtitleStyle = {
        fontSize: subStore.fontSize,
        fontName: "Montserrat",
        highlightColor: `&H00${subStore.highlightColor.slice(5, 7)}${subStore.highlightColor.slice(3, 5)}${subStore.highlightColor.slice(1, 3)}`,
        strokeWidth: subStore.strokeOn ? subStore.strokeWidth : 0,
        position: subStore.subPos,
      };

      const result = await window.clipflow.renderClip(c, project, null, { subtitleStyle });

      if (result.error) {
        setRenderResult({ success: false, error: result.error });
      } else {
        setRenderResult({ success: true, path: result.path });
      }
    } catch (e) {
      setRenderResult({ success: false, error: e.message });
    }

    window.clipflow?.removeRenderProgressListener?.();
    setRendering(false);
  }, [rendering]);

  // ── No clip loaded ──
  if (!clip) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", height: "100%", width: "100%",
        alignItems: "center", justifyContent: "center", background: T.bg, color: T.textTertiary,
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🎬</div>
        <div style={{ fontSize: 14 }}>No clip loaded</div>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", width: "100%",
      overflow: "hidden", background: T.bg, position: "relative",
    }}>
      <Topbar onBack={onBack} handleRender={handleRender} rendering={rendering} renderProgress={renderProgress} />

      {/* Editor body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0, position: "relative" }}>
        <LeftPanel onResizeStart={onLpResizeStart} />
        <PreviewPanel />
        <RightZone onDrawerResizeStart={onDrawerResizeStart} gamesDb={gamesDb} anthropicApiKey={anthropicApiKey} />
      </div>

      {/* Timeline */}
      <Timeline onTlResizeStart={onTlResizeStart} />

      {/* Render overlay */}
      <RenderOverlay rendering={rendering} renderProgress={renderProgress} renderResult={renderResult} setRenderResult={setRenderResult} />
    </div>
  );
}
