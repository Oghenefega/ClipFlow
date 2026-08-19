import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import * as Sentry from "@sentry/electron/renderer";
import T from "../styles/theme";

// #248 Beta feedback reporter — variant-B labeled pill, right edge.
// Design locked from tasks/mocks/feedback-bubble.html (Fega, 2026-08-11).
// Copy strings are lifted verbatim from the mock's copy object — port,
// don't redesign. The pill never moves on its own except the error pulse.

const EASE = "cubic-bezier(.16,1,.3,1)";

const PROMPTS = [
  { cat: "problem", pill: "Having a problem?" },
  { cat: "idea", pill: "Got an idea?" },
  { cat: "feedback", pill: "Got feedback?" },
];

const COPY = {
  problem: {
    title: "Report a problem",
    ph: "What went wrong? What did you expect to happen?",
    point: "⌖  Point at the problem",
    consent: "Sends your words, the snapshot, the app version and the last few minutes of activity. Nothing else.",
  },
  idea: {
    title: "Share an idea",
    ph: "What should Corva do? What would it help with?",
    point: "⌖  Point at what you mean",
    consent: "Sends your words, the snapshot and the app version. Nothing else.",
  },
  feedback: {
    title: "Share feedback",
    ph: "What’s working? What could be better? Anything on your mind.",
    point: "⌖  Point at what you mean",
    consent: "Sends your words, the snapshot and the app version. Nothing else.",
  },
};

const VIEW_LABELS = {
  rename: "Rename", recordings: "Recordings", projects: "Projects",
  clips: "Projects", editor: "Editor", queue: "Queue", tracker: "Tracker",
  settings: "Settings",
};

const PILL_HEIGHT = 38;

// ── pick-mode helpers ──

const IDENTITY_TAGS = new Set(["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "LABEL", "IMG", "VIDEO"]);

const hasIdentity = (el) =>
  !!(el.getAttribute?.("aria-label") || el.title || el.id || el.dataset?.testid || IDENTITY_TAGS.has(el.tagName));

// Snap a raw hit (often a text span) to the nearest element a human would
// call "the thing" — a button, a labeled element, anything with identity.
const snapTarget = (el) => {
  let cur = el, depth = 0;
  while (cur && cur !== document.body && depth < 6) {
    if (hasIdentity(cur)) return cur;
    cur = cur.parentElement;
    depth += 1;
  }
  return el;
};

// Human-readable identity. Never reads input values — a pointed-at Settings
// field must not leak what's typed in it through the report text.
const describeEl = (el) => {
  const aria = el.getAttribute?.("aria-label");
  if (aria) return aria;
  if (el.title) return el.title;
  const ph = el.getAttribute?.("placeholder");
  if (ph) return ph;
  const txt = (el.innerText || "").trim().replace(/\s+/g, " ");
  if (txt && txt.length <= 48) return txt;
  if (txt) return `${txt.slice(0, 45)}…`;
  if (el.id) return `#${el.id}`;
  return `<${(el.tagName || "element").toLowerCase()}>`;
};

const domPath = (el) => {
  const parts = [];
  let cur = el, depth = 0;
  while (cur && cur !== document.body && depth < 6) {
    let s = cur.tagName.toLowerCase();
    if (cur.id) s += `#${cur.id}`;
    else if (typeof cur.className === "string" && cur.className.trim()) {
      s += `.${cur.className.trim().split(/\s+/).slice(0, 2).join(".")}`;
    }
    parts.unshift(s);
    cur = cur.parentElement;
    depth += 1;
  }
  return parts.join(" > ");
};

const base64ToBytes = (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

const nextPaint = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export default function FeedbackBubble({ view }) {
  // pill / peel
  const [tucked, setTucked] = useState(false);
  const [bottom, setBottom] = useState(88);
  const [pillText, setPillText] = useState(PROMPTS[0].pill);
  const [textVisible, setTextVisible] = useState(true);
  const [pillError, setPillError] = useState(false);
  const [peelError, setPeelError] = useState(false);
  const [pillHover, setPillHover] = useState(false);
  const [peelHover, setPeelHover] = useState(false);
  const [pillActive, setPillActive] = useState(false);
  // panel
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelBottom, setPanelBottom] = useState(138);
  const [category, setCategory] = useState("problem");
  const [draft, setDraft] = useState("");
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [target, setTarget] = useState(null); // { label, path, png, view }
  const [textFocus, setTextFocus] = useState(false);
  const [hoverKey, setHoverKey] = useState(null); // chip/button hover, one at a time
  // pick mode
  const [picking, setPicking] = useState(false);
  const [highlight, setHighlight] = useState(null); // { x, y, w, h }
  // context
  const [version, setVersion] = useState("");

  const promptIdxRef = useRef(0);
  const bottomRef = useRef(88);
  const tuckedRef = useRef(false);
  const viewRef = useRef(view);
  const suppressClickRef = useRef(false);
  const panelRef = useRef(null);
  const textareaRef = useRef(null);
  const errorTimersRef = useRef([]);
  const doneTimersRef = useRef([]);
  bottomRef.current = bottom;
  tuckedRef.current = tucked;
  viewRef.current = view;

  const persistBubble = useCallback((patch) => {
    try {
      window.clipflow?.storeSet?.("feedbackBubble", {
        tucked: tuckedRef.current,
        bottom: Math.round(bottomRef.current),
        ...patch,
      });
    } catch (_) { /* persistence is best-effort */ }
  }, []);

  // Load persisted state + app version once.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [saved, ver] = await Promise.all([
          window.clipflow?.storeGet?.("feedbackBubble"),
          window.clipflow?.getAppVersion?.(),
        ]);
        if (!alive) return;
        if (saved && typeof saved === "object") {
          if (saved.tucked) setTucked(true);
          if (Number.isFinite(saved.bottom)) {
            setBottom(Math.min(window.innerHeight - 80, Math.max(14, saved.bottom)));
          }
        }
        if (ver) setVersion(ver);
      } catch (_) { /* defaults stand */ }
    })();
    return () => { alive = false; };
  }, []);

  // 150ms text fade, straight from the mock's swapPillText.
  const swapPillText = useCallback((t) => {
    setTextVisible(false);
    setTimeout(() => { setPillText(t); setTextVisible(true); }, 150);
  }, []);

  const setPrompt = useCallback((i) => {
    promptIdxRef.current = i % PROMPTS.length;
    swapPillText(PROMPTS[promptIdxRef.current].pill);
  }, [swapPillText]);

  // The prompt rotates ON TAB SWITCH only — the mock's idle 6s auto-rotate
  // was mock-only so Fega could see rotation without clicking (locked call).
  const firstViewRef = useRef(true);
  useEffect(() => {
    if (firstViewRef.current) { firstViewRef.current = false; return; }
    if (pillError) { promptIdxRef.current = (promptIdxRef.current + 1) % PROMPTS.length; return; }
    setPrompt(promptIdxRef.current + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Error pulse — the only self-animation. Pipeline/publish failures only.
  useEffect(() => {
    const unsub = window.clipflow?.onFeedbackAppError?.(() => {
      const timers = errorTimersRef.current;
      promptIdxRef.current = 0; // next open preselects Problem
      if (tuckedRef.current) {
        setPeelError(true);
        timers.push(setTimeout(() => setPeelError(false), 4000));
      } else {
        swapPillText("Something just went wrong?");
        setPillError(true);
        timers.push(setTimeout(() => { setPillError(false); setPrompt(0); }, 4200));
      }
    });
    return () => {
      unsub?.();
      errorTimersRef.current.forEach(clearTimeout);
      errorTimersRef.current = [];
    };
  }, [setPrompt, swapPillText]);

  // ── panel ──

  const [imgTick, setImgTick] = useState(0);

  const openPanel = useCallback((fresh) => {
    if (fresh) setCategory(PROMPTS[promptIdxRef.current].cat);
    setDone(false);
    setPanelOpen(true);
  }, []);

  // Above the pill by default; flip below when there's no headroom. Runs
  // after render (a pre-render measure would miss the target row + snapshot
  // that a pick just added) and re-runs when content height changes —
  // "headroom check on every open, content-height aware" per the handoff.
  useLayoutEffect(() => {
    if (!panelOpen) return;
    const margin = 12;
    const ph = panelRef.current?.offsetHeight || 0;
    const above = bottomRef.current + PILL_HEIGHT + margin;
    const pb = above + ph > window.innerHeight - margin
      ? bottomRef.current - ph - margin
      : above;
    setPanelBottom(Math.max(margin, pb));
  }, [panelOpen, category, target, done, imgTick]);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  const resetForm = useCallback(() => {
    setDraft("");
    setTarget(null);
    setDone(false);
  }, []);

  useEffect(() => {
    if (panelOpen && !done) textareaRef.current?.focus();
  }, [panelOpen, done]);

  // Esc closes the panel (pick mode has its own Esc below).
  useEffect(() => {
    if (!panelOpen || picking) return undefined;
    const onKey = (e) => { if (e.key === "Escape") closePanel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelOpen, picking, closePanel]);

  useEffect(() => () => {
    doneTimersRef.current.forEach(clearTimeout);
  }, []);

  // ── drag along the edge (vertical only, never free-floating) ──

  const onPillPointerDown = (e) => {
    if (e.button !== 0) return;
    const startY = e.clientY;
    const b0 = bottomRef.current;
    let dragged = false;
    const move = (ev) => {
      const dy = startY - ev.clientY;
      if (!dragged && Math.abs(dy) > 4) { dragged = true; setPanelOpen(false); }
      if (dragged) {
        setBottom(Math.min(window.innerHeight - 80, Math.max(14, b0 + dy)));
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setPillActive(false);
      if (dragged) {
        suppressClickRef.current = true;
        setTimeout(() => { suppressClickRef.current = false; }, 0);
        persistBubble({});
      }
    };
    setPillActive(true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onPillClick = () => {
    if (suppressClickRef.current) return;
    if (panelOpen) closePanel();
    else openPanel(true);
  };

  const tuck = (e) => {
    e.stopPropagation();
    closePanel();
    setTucked(true);
    persistBubble({ tucked: true });
  };

  const untuck = () => {
    setTucked(false);
    persistBubble({ tucked: false });
  };

  // ── point at the problem ──

  const startPicking = () => {
    closePanel();
    setPicking(true);
  };

  useEffect(() => {
    if (!picking) return undefined;
    document.body.classList.add("cf-picking");
    let raf = 0;
    let busy = false;

    const isOwnUi = (el) => !!el?.closest?.("[data-feedback-ui]");

    const onMove = (e) => {
      if (busy) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || isOwnUi(el)) { setHighlight(null); return; }
        const t = snapTarget(el);
        const r = t.getBoundingClientRect();
        setHighlight({ x: r.x - 2, y: r.y - 2, w: r.width + 4, h: r.height + 4 });
      });
    };

    const onClick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      const raw = document.elementFromPoint(e.clientX, e.clientY);
      if (!raw || isOwnUi(raw)) return; // aiming — own UI clicks are swallowed
      busy = true;
      const el = snapTarget(raw);
      const r = el.getBoundingClientRect();
      const label = describeEl(el);
      const path = domPath(el);
      const pickedView = viewRef.current;

      // Capture with our overlay hidden (it would land in the snapshot) and,
      // on the Settings view, with key fields masked.
      setHighlight(null);
      const mask = pickedView === "settings";
      if (mask) document.body.classList.add("cf-snapshot-mask");
      let png = null;
      try {
        await nextPaint();
        const res = await window.clipflow?.feedbackReportSnapshot?.({
          x: r.x, y: r.y, width: r.width, height: r.height,
        });
        if (res?.error) console.error("[FeedbackBubble] snapshot failed:", res.error);
        png = res?.png || null;
      } catch (err) {
        console.error("[FeedbackBubble] snapshot IPC failed:", err);
        // report still goes out without a snapshot
      }
      if (mask) document.body.classList.remove("cf-snapshot-mask");

      try {
        el.classList.add("cf-pick-flash");
        setTimeout(() => el.classList.remove("cf-pick-flash"), 500);
      } catch (_) { /* SVG className edge cases */ }

      // One point per report — re-pointing replaces.
      setTarget({ label, path, png, view: pickedView });
      setPicking(false);
      openPanel(false);
    };

    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setPicking(false);
      openPanel(false);
    };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.classList.remove("cf-picking");
      document.body.classList.remove("cf-snapshot-mask");
      cancelAnimationFrame(raf);
      setHighlight(null);
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [picking, openPanel]);

  // ── send ──

  const canSend = !sending && (draft.trim().length > 0 || !!target);

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    const cat = category;
    let ctx = null;
    try {
      ctx = await window.clipflow?.feedbackReportContext?.({ includeActivity: cat === "problem" });
      if (ctx?.error) { console.error("[FeedbackBubble] context failed:", ctx.error); ctx = null; }
    } catch (err) {
      console.error("[FeedbackBubble] context IPC failed:", err);
      // send with what we have — a report must never vanish
    }

    try {
      const attachments = [];
      if (target?.png) {
        attachments.push({ filename: "snapshot.png", data: base64ToBytes(target.png), contentType: "image/png" });
      }
      if (cat === "problem" && ctx?.logTail) {
        attachments.push({ filename: "app-log-tail.txt", data: ctx.logTail, contentType: "text/plain" });
      }
      // Sentry's feedback schema drops event breadcrumbs server-side (verified
      // against a live event), so the last ~20 ride as an attachment — same
      // trail (nav() feeds it), different vehicle. The trail comes from MAIN
      // via feedback:context: the SDK's ScopeToMain integration forwards every
      // renderer breadcrumb over IPC and clears the renderer-side scope.
      if (cat === "problem" && ctx?.breadcrumbs?.length) {
        attachments.push({
          filename: "recent-activity.txt",
          data: ctx.breadcrumbs.map((b) => {
            const ts = b.timestamp ? new Date(b.timestamp * 1000).toISOString() : "";
            return `${ts} [${b.category}] ${b.message}`;
          }).join("\n"),
          contentType: "text/plain",
        });
      }

      const lines = [draft.trim() || "(no text — see snapshot)"];
      if (target) lines.push("", `Pointed at: ${target.label} [${target.view} view]`, `Element: ${target.path}`);
      if (cat === "problem" && ctx?.lastAppError) {
        lines.push("", `Last app error [${ctx.lastAppError.kind}] at ${ctx.lastAppError.at}: ${ctx.lastAppError.summary}`);
      }

      Sentry.captureFeedback(
        {
          message: lines.join("\n"),
          source: "clipflow-feedback-bubble",
          tags: {
            category: cat,
            view,
            appVersion: ctx?.appVersion || version || "unknown",
            os: ctx?.osVersion || "unknown",
            ...(ctx?.deviceId ? { deviceId: ctx.deviceId } : {}),
          },
        },
        { attachments }
      );

      setDone(true);
      doneTimersRef.current.push(setTimeout(() => {
        closePanel();
        doneTimersRef.current.push(setTimeout(resetForm, 250));
      }, 1800));
    } catch (err) {
      console.error("[FeedbackBubble] send failed:", err);
    } finally {
      setSending(false);
    }
  };

  // ── styles (mock variant B → T tokens) ──

  const c = COPY[category];
  const viewLabel = VIEW_LABELS[view] || view;
  const ctxLine = `${viewLabel} tab${version ? ` · v${version}` : ""}`;

  const fbWrapStyle = {
    position: "fixed", right: 18, bottom, zIndex: 940,
    display: "flex", alignItems: "center",
    transition: `opacity .22s ${EASE}, transform .22s ${EASE}`,
    opacity: tucked ? 0 : 1,
    transform: tucked ? "translateX(30px) scale(.4)" : "none",
    pointerEvents: tucked ? "none" : "auto",
    fontFamily: T.font,
  };

  const pillStyle = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    height: PILL_HEIGHT, padding: "0 15px 0 6px", borderRadius: 20,
    background: T.surfaceHover, border: `1px solid ${T.accentBorder}`,
    boxShadow: `0 0 14px ${T.accentGlow}, 0 4px 14px rgba(0,0,0,.4)`,
    cursor: "pointer", fontFamily: T.font, userSelect: "none", touchAction: "none",
    transition: `transform .18s ${EASE}, box-shadow .18s ${EASE}, border-color .18s ${EASE}`,
    transform: pillActive ? "scale(.97)" : pillHover ? "scale(1.06)" : "none",
    animation: pillError ? `cfFeedbackPulse 1.1s ${EASE} 3` : "none",
  };

  const peelStyle = {
    position: "fixed", right: 0, bottom, zIndex: 940,
    width: 22, height: 54, padding: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: T.surface, border: `1px solid ${T.borderHover}`, borderRight: "none",
    borderRadius: "9px 0 0 9px", cursor: "pointer", fontFamily: T.font,
    fontSize: 13, fontWeight: 800,
    color: peelError || peelHover ? T.accentLight : T.textTertiary,
    transform: tucked ? (peelHover ? "translateX(-2px)" : "translateX(0)") : "translateX(110%)",
    transition: `transform .22s ${EASE}, box-shadow .18s ${EASE}, color .15s ${EASE}`,
    boxShadow: peelHover ? `0 0 12px ${T.accentGlow}` : "none",
    animation: peelError ? `cfFeedbackPulse 1.1s ${EASE} 3` : "none",
  };

  const panelStyle = {
    position: "fixed", right: 18, bottom: panelBottom, width: 318, zIndex: 942,
    background: T.surface, border: `1px solid ${T.borderHover}`, borderRadius: 14,
    padding: 16, boxShadow: "0 20px 50px rgba(0,0,0,.55)", fontFamily: T.font,
    opacity: panelOpen ? 1 : 0,
    transform: panelOpen ? "translateY(0)" : "translateY(8px)",
    pointerEvents: panelOpen ? "auto" : "none",
    transition: `opacity .2s ${EASE}, transform .2s ${EASE}`,
  };

  const catStyle = (cat) => {
    const active = category === cat;
    const hovered = hoverKey === `cat-${cat}`;
    return {
      fontFamily: T.font, fontSize: 11.5, fontWeight: 700, borderRadius: 20,
      padding: "4px 12px", cursor: "pointer", transition: `all .15s ${EASE}`,
      border: `1px solid ${active ? T.accentBorder : hovered ? T.borderHover : T.border}`,
      background: active ? T.accentDim : "transparent",
      color: active ? T.accentLight : hovered ? T.text : T.textSecondary,
    };
  };

  return (
    <div data-feedback-ui="true">
      {/* pill */}
      <div
        style={fbWrapStyle}
        onMouseEnter={() => setPillHover(true)}
        onMouseLeave={() => setPillHover(false)}
      >
        <span style={{ position: "relative", display: "flex" }}>
          <button
            aria-label="Report a problem"
            style={pillStyle}
            onPointerDown={onPillPointerDown}
            onClick={onPillClick}
          >
            <span style={{
              width: 27, height: 27, borderRadius: "50%", background: T.accent,
              color: "#fff", fontSize: 14, fontWeight: 800, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>?</span>
            <span style={{
              fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap",
              color: pillError ? T.accentLight : T.text,
              transition: "opacity .15s ease", opacity: textVisible ? 1 : 0,
            }}>{pillText}</span>
          </button>
          <button
            title="Tuck away"
            onClick={tuck}
            style={{
              position: "absolute", top: -6, right: -6, width: 17, height: 17,
              borderRadius: "50%", border: `1px solid ${hoverKey === "dismiss" ? T.textTertiary : T.borderHover}`,
              background: T.surfaceHover, color: hoverKey === "dismiss" ? T.text : T.textSecondary,
              fontSize: 11, lineHeight: 1, cursor: "pointer", padding: 0, fontFamily: T.font,
              opacity: pillHover ? 1 : 0, transition: `opacity .15s ${EASE}`, zIndex: 2,
            }}
            onMouseEnter={() => setHoverKey("dismiss")}
            onMouseLeave={() => setHoverKey(null)}
          >×</button>
        </span>
      </div>

      {/* peel */}
      <button
        title="Report a problem"
        style={peelStyle}
        onClick={untuck}
        onMouseEnter={() => setPeelHover(true)}
        onMouseLeave={() => setPeelHover(false)}
      ><span>?</span></button>

      {/* report panel — always laid out (hidden via opacity) so openPanel can
          measure offsetHeight for the flip-below headroom check */}
      <div ref={panelRef} style={panelStyle}>
        {!done ? (
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-.2px", color: T.text }}>{c.title}</div>
            <div style={{ fontSize: 11, color: T.textTertiary, margin: "2px 0 10px" }}>{ctxLine}</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {PROMPTS.map(({ cat }) => (
                <button
                  key={cat}
                  style={catStyle(cat)}
                  onClick={() => setCategory(cat)}
                  onMouseEnter={() => setHoverKey(`cat-${cat}`)}
                  onMouseLeave={() => setHoverKey(null)}
                >{cat === "problem" ? "Problem" : cat === "idea" ? "Idea" : "Feedback"}</button>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="cf-feedback-textarea"
              value={draft}
              placeholder={c.ph}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setTextFocus(true)}
              onBlur={() => setTextFocus(false)}
              style={{
                width: "100%", height: 76, resize: "none", background: T.bg,
                border: `1px solid ${textFocus ? T.accentBorder : T.border}`, borderRadius: 9,
                color: T.text, fontFamily: T.font, fontSize: 12.5, padding: "9px 11px",
                outline: "none", lineHeight: 1.5, boxSizing: "border-box",
              }}
            />
            {target && (
              <div style={{ marginTop: 9 }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12,
                  fontWeight: 600, color: T.accentLight, background: T.accentDim,
                  border: `1px solid ${T.accentBorder}`, borderRadius: 20, padding: "4px 6px 4px 12px",
                  maxWidth: "100%",
                }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>⌖ <b>{target.label}</b></span>
                  <button
                    title="Remove"
                    onClick={() => setTarget(null)}
                    style={{ border: "none", background: "transparent", color: T.accentLight, fontSize: 13, cursor: "pointer", padding: "0 4px", fontFamily: T.font }}
                  >×</button>
                </span>
                {target.png && (
                  <div style={{ marginTop: 8, border: `1px solid ${T.accentBorder}`, borderRadius: 9, overflow: "hidden", background: T.bg, pointerEvents: "none" }}>
                    <img
                      src={`data:image/png;base64,${target.png}`}
                      alt="Snapshot of the pointed-at area"
                      onLoad={() => setImgTick((t) => t + 1)}
                      style={{ display: "block", width: "100%", maxHeight: 180, objectFit: "contain", background: T.bg }}
                    />
                    <div style={{ fontSize: 10.5, color: T.textTertiary, padding: "4px 9px", borderTop: `1px solid ${T.border}` }}>
                      Snapshot of this area is attached automatically
                    </div>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={startPicking}
              onMouseEnter={() => setHoverKey("point")}
              onMouseLeave={() => setHoverKey(null)}
              style={{
                width: "100%", marginTop: 9, fontFamily: T.font, fontSize: 12.5, fontWeight: 700,
                borderRadius: 9, padding: 8, cursor: "pointer",
                border: `1px dashed ${hoverKey === "point" ? T.accentBorder : T.borderHover}`,
                background: "transparent",
                color: hoverKey === "point" ? T.accentLight : T.textSecondary,
                transition: `all .15s ${EASE}`,
              }}
            >{c.point}</button>
            <div style={{ fontSize: 10.5, color: T.textTertiary, lineHeight: 1.5, marginTop: 11 }}>{c.consent}</div>
            <button
              onClick={send}
              disabled={!canSend}
              onMouseEnter={() => setHoverKey("send")}
              onMouseLeave={() => setHoverKey(null)}
              style={{
                width: "100%", marginTop: 11, fontFamily: T.font, fontSize: 13, fontWeight: 800,
                borderRadius: 9, padding: 9, cursor: canSend ? "pointer" : "default",
                border: `1px solid ${T.accentBorder}`,
                background: canSend && hoverKey === "send" ? T.accentLight : T.accent,
                color: "#fff", opacity: canSend ? 1 : 0.5, transition: `all .15s ${EASE}`,
              }}
            >{sending ? "Sending…" : "Send report"}</button>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "22px 0 14px" }}>
            <div style={{
              width: 38, height: 38, borderRadius: "50%", background: T.greenDim,
              border: `1px solid ${T.greenBorder}`, color: T.green, fontSize: 17,
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px",
            }}>✓</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Sent. Thank you!</div>
            <div style={{ fontSize: 11.5, color: T.textSecondary, marginTop: 3 }}>This goes straight to the developer.</div>
          </div>
        )}
      </div>

      {/* pick-mode hint */}
      {picking && (
        <div style={{
          position: "fixed", top: 52, left: "50%", transform: "translateX(-50%)",
          background: T.surfaceHover, border: `1px solid ${T.accentBorder}`, borderRadius: 20,
          padding: "6px 16px", fontSize: 12, fontWeight: 600, color: T.accentLight,
          zIndex: 960, pointerEvents: "none", fontFamily: T.font,
        }}>
          Click the thing that's misbehaving · Esc cancels
        </div>
      )}

      {/* pick-mode hover highlight */}
      {picking && highlight && (
        <div style={{
          position: "fixed", left: highlight.x, top: highlight.y,
          width: highlight.w, height: highlight.h,
          border: `2px solid ${T.accentLight}`, borderRadius: 4,
          pointerEvents: "none", zIndex: 959, boxSizing: "border-box",
          transition: "all .08s ease-out",
        }} />
      )}
    </div>
  );
}
