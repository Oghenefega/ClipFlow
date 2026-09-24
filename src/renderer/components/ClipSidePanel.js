import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import T from "../styles/theme";

// #466/#467: one clip panel for Projects, Tracker and Analytics. It docks as a
// right-hand column beside the page (never over it), runs the full height of
// the tab, and its 9:16 preview grows to that height, so a clip is watchable
// at the size the window allows rather than at a fixed 250px.

const STICKY_TOP = 16;
const PAD = 18;
export const PANEL_GAP = 18;

function scrollPaneOf(el) {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if (o === "auto" || o === "scroll") return n;
  }
  return document.documentElement;
}

/**
 * The box a view lays out in: the width its container gives it, the visible
 * height of the tab's scroll pane, and where `ref` starts inside that pane.
 * Re-measured whenever either resizes, including a hidden tab being shown.
 */
export function usePaneBox(ref) {
  const [box, setBox] = useState({ w: 0, paneH: 0, top: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const pane = scrollPaneOf(el);
    const host = el.parentElement;
    const measure = () => {
      const cs = getComputedStyle(host);
      const w = Math.round(host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
      const top = Math.round(el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop);
      const next = { w, paneH: pane.clientHeight, top };
      setBox((prev) => (prev.w === next.w && prev.paneH === next.paneH && prev.top === next.top ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    ro.observe(pane);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

/**
 * Panel geometry for a view `w` wide in a pane `paneH` tall. The preview is 9:16
 * of the panel's inner height, capped so the page beside it keeps 40% of the
 * width. `below` reserves room under the preview (a seek bar).
 */
export function sidePanelSize({ w, paneH }, below = 0) {
  const h = Math.max(380, paneH - 32 - STICKY_TOP);
  const details = w < 1400 ? 300 : 340;
  const byHeight = Math.round(((h - 2 * PAD - below) * 9) / 16);
  const byWidth = Math.round(w * 0.6) - details - 3 * PAD - 2;
  const previewW = Math.max(180, Math.min(byHeight, byWidth));
  return { h, details, previewW, previewH: Math.round((previewW * 16) / 9), w: previewW + details + 3 * PAD + 2 };
}

/** Keys for the open panel: Esc closes, ← → step through the page's clips. */
export function usePanelKeys({ open, onClose, onPrev, onNext }) {
  const handlers = useRef({ onClose, onPrev, onNext });
  handlers.current = { onClose, onPrev, onNext };
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "Escape") handlers.current.onClose?.();
      else if (e.key === "ArrowLeft") { e.preventDefault(); handlers.current.onPrev?.(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); handlers.current.onNext?.(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}

/**
 * A rendered file in the panel. Every <video> must release its source on unmount
 * or Chromium's renderer eventually crashes; the element is captured when the
 * effect runs, because React has cleared the ref by the time cleanup runs (#451).
 */
export function PanelVideo({ src, poster }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    return () => {
      if (v) { try { v.pause(); v.removeAttribute("src"); v.load(); } catch (_) { /* already gone */ } }
    };
  }, []);
  return <video ref={ref} src={src} poster={poster} controls autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000", display: "block" }} />;
}

/** A poster with a play button, for a clip whose rendered file can play in the panel. */
export function PanelPoster({ src, canPlay, onPlay, tint, title }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: tint || "rgba(var(--lift),0.04)" }}>
      {src && <img src={src} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
      <button onClick={canPlay ? onPlay : undefined} disabled={!canPlay} title={title || (canPlay ? "Play" : "Rendered file not in the library")} style={{ position: "absolute", inset: 0, background: "transparent", border: "none", cursor: canPlay ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(10,11,16,0.72)", border: "1px solid rgba(255,255,255,0.22)", color: "#fff", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: 3, opacity: canPlay ? 1 : 0.4 }}>▶</span>
      </button>
    </div>
  );
}

/**
 * The docked panel: `preview` on the left at `size.previewW`, `children` (the
 * details) in a scrolling column on the right. Close with ×, Esc, or the caller.
 * `previewStyle` overrides the preview box (a player that draws its own frame).
 */
export default function ClipSidePanel({ size, preview, previewHeight, previewStyle, children, onClose, ...rest }) {
  return (
    <aside data-keep-panel="" {...rest} style={{
      position: "sticky", top: STICKY_TOP, width: size.w, height: size.h, flexShrink: 0, boxSizing: "border-box",
      display: "flex", gap: PAD, padding: PAD, fontFamily: T.font,
      background: `linear-gradient(180deg, rgba(var(--lift),0.022), rgba(var(--lift),0)), ${T.surface}`,
      border: `1px solid ${T.borderHover}`, borderRadius: 22,
      boxShadow: "0 2px 4px rgba(var(--shade),calc(0.5 * var(--shadeK))), 0 26px 60px -22px rgba(var(--shade),calc(0.85 * var(--shadeK)))",
    }}>
      <div style={{ width: size.previewW, height: previewHeight ?? size.previewH, flexShrink: 0, borderRadius: 18, overflow: "hidden", boxShadow: "0 20px 50px -20px rgba(var(--shade),calc(0.9 * var(--shadeK)))", ...previewStyle }}>
        {preview}
      </div>
      <div style={{ position: "relative", width: size.details, flexShrink: 0, minWidth: 0, overflowY: "auto", overflowX: "hidden" }}>
        <button onClick={onClose} title="Close (Esc)" style={{ position: "absolute", top: 0, right: 0, zIndex: 1, width: 28, height: 28, borderRadius: "50%", border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, fontSize: 15, cursor: "pointer", fontFamily: T.font }}>×</button>
        {children}
        <div style={{ fontSize: 10.5, color: T.textTertiary, marginTop: 14, display: "flex", alignItems: "center", gap: 5 }}>
          <Kbd>←</Kbd><Kbd>→</Kbd> previous / next {"·"} <Kbd>Esc</Kbd> close
        </div>
      </div>
    </aside>
  );
}

const Kbd = ({ children }) => (
  <span style={{ fontSize: 10, fontWeight: 700, padding: "0 5px", borderRadius: 4, border: `1px solid ${T.borderHover}`, color: T.textSecondary, lineHeight: "16px" }}>{children}</span>
);
