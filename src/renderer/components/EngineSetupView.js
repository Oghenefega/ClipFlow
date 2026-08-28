import React, { useState, useEffect, useCallback, useRef } from "react";
import T from "../styles/theme";
import clipflowMark from "../assets/brand/clipflow-mark.png";

// #146 — "Set up ClipFlow's AI engine": first-run managed runtime download.
// Full-screen overlay in the OnboardingView slot. Design locked from the
// approved mockup (tasks/mocks/engine-setup.html): logo-derived ice-cyan →
// royal-blue accents (no generic AI purple), one constant glow behind the
// mark (breathing while working), color drains to grey when interrupted.
//
// The download itself lives in the main process (setup-runtime.js) — this
// screen can be hidden and reopened without touching the transfer.

const CY = "#45c8f5";
const CY_SOFT = "#7edcff";
const BLU = "#2469e3";
const BLU_DEEP = "#1a4fc4";

const fmtGB = (b) => (b == null ? "—" : `${(b / 1e9).toFixed(b >= 1e10 ? 0 : 1)} GB`);
const fmtSpeed = (bps) => (bps > 0 ? `${Math.round(bps / 1e6)} MB/s` : "");
const fmtEta = (sec) => {
  if (sec == null || !isFinite(sec)) return "";
  if (sec < 60) return `about ${Math.max(5, Math.round(sec / 5) * 5)} seconds left`;
  if (sec < 3600) return `about ${Math.round(sec / 60)} min left`;
  return `about ${(sec / 3600).toFixed(1)} hours left`;
};

const KEYFRAMES = `
@keyframes cfEngineBreathe { 0%,100%{ transform:scale(1); opacity:.75; } 50%{ transform:scale(1.15); opacity:1; } }
@keyframes cfEngineSlide { 0%{ margin-left:-36%; } 100%{ margin-left:100%; } }
`;

export default function EngineSetupView({ onClose }) {
  // ui: loading | offline | ready | download | unpack | verify | model | done | error
  const [ui, setUi] = useState("loading");
  const [state, setState] = useState(null);       // setup:getState payload
  const [prog, setProg] = useState(null);         // last setup:progress event
  const [errInfo, setErrInfo] = useState(null);   // { errorPhase, message, resumable }
  const [locError, setLocError] = useState(null); // "Install to" picker failure (#261)
  const startedRef = useRef(false);
  // Parent passes an inline onClose — keep it in a ref so loadState (and the
  // effects depending on it) stay stable across App re-renders. Without this
  // the mount effect re-fires on every parent render and, once the engine is
  // configured (which happens BEFORE the model phase), closes the overlay
  // mid-download. Caught live in the session-168+1 E2E.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const loadState = useCallback(async () => {
    setUi("loading");
    const r = await window.clipflow.setupGetState();
    if (!r?.success) { setErrInfo({ errorPhase: "manifest", message: r?.error || "Couldn't check setup state.", resumable: true }); setUi("offline"); return; }
    if (r.active) {
      // opened while main is mid-job — fall in behind the live phase
      startedRef.current = true;
      setState((prev) => (r.needed ? r : prev || r));
      const ph = r.active.phase;
      setUi(["download", "unpack", "verify", "model"].includes(ph) ? ph : "download");
      return;
    }
    if (!r.needed) { onCloseRef.current(true); return; }
    setState(r);
    setUi(r.manifestError ? "offline" : "ready");
  }, []);

  useEffect(() => { loadState(); }, [loadState]);

  useEffect(() => {
    const unsub = window.clipflow.onSetupProgress((data) => {
      if (data.phase === "error") {
        if (data.cancelled) {
          setErrInfo(null);
          loadState(); // refresh resumeBytes so the button reads "Resume download"
        } else {
          setErrInfo({ errorPhase: data.errorPhase, message: data.message, resumable: data.resumable });
          setUi("error");
        }
        return;
      }
      setProg(data);
      if (data.phase === "done") setUi("done");
      else setUi(data.phase);
    });
    return unsub;
  }, [loadState]);

  const start = async () => {
    startedRef.current = true;
    setErrInfo(null);
    setProg(null);
    setUi("download");
    const r = await window.clipflow.setupStart();
    // events drive the UI; the invoke result only matters if it failed before
    // any event could fire (e.g. a second concurrent start)
    if (r && !r.success && !r.cancelled && ui !== "error") {
      setErrInfo({ errorPhase: r.phase, message: r.error, resumable: true });
      setUi("error");
    }
  };

  const cancel = async () => { await window.clipflow.setupCancel(); };

  // #261: pick the engine's install drive/folder. Main owns the dialog and
  // the path logic; a fresh getState re-measures free space on the new drive.
  const chooseLocation = async () => {
    setLocError(null);
    const r = await window.clipflow.setupChooseLocation();
    if (r?.success) loadState();
    else if (r?.error) setLocError(r.error);
  };

  const v = state?.manifest?.variants?.[state?.variant];
  const diskShort = state && state.freeBytes != null && state.requiredBytes != null && state.freeBytes < state.requiredBytes;
  const working = ["download", "unpack", "verify", "model"].includes(ui);
  const interrupted = ui === "error";

  // ── shared bits ──────────────────────────────────────────────────────────
  const Mark = (
    <div style={{ position: "relative", width: 104, height: 104, marginBottom: 22 }}>
      <div style={{
        position: "absolute", inset: -34, borderRadius: "50%", filter: "blur(11px)",
        background: interrupted
          ? "radial-gradient(circle, rgba(140,146,165,.16) 0%, rgba(140,146,165,.07) 45%, transparent 70%)"
          : "radial-gradient(circle at 50% 42%, rgba(126,220,255,.34) 0%, rgba(69,200,245,.20) 34%, rgba(36,105,227,.14) 58%, transparent 74%)",
        animation: working ? "cfEngineBreathe 2.6s ease-in-out infinite" : "none",
        opacity: ui === "done" ? 1 : undefined,
      }} />
      <img src={clipflowMark} alt="" style={{
        position: "relative", width: 104, height: 104, objectFit: "contain",
        filter: interrupted
          ? "grayscale(1) brightness(.72) drop-shadow(0 7px 18px rgba(var(--shade),calc(.4 * var(--shadeK))))"
          : "drop-shadow(0 7px 18px rgba(10,30,70,.55))",
      }} />
    </div>
  );

  const stepState = (step) => {
    const order = { download: 0, unpack: 1, verify: 1, model: 2 };
    const idx = { download: 0, install: 1, model: 2 }[step];
    if (ui === "done") return "done";
    const cur = order[ui] ?? (errInfo ? order[errInfo.errorPhase] ?? 0 : 0);
    if (idx < cur) return "done";
    if (idx === cur) return "active";
    return "pending";
  };

  const Steps = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
      {[["download", "Download"], ["install", "Install"], ["model", "Speech model"]].map(([id, label], i) => {
        const s = stepState(id);
        return (
          <React.Fragment key={id}>
            {i > 0 && <div style={{ width: 26, height: 1, background: T.borderHover }} />}
            <div style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600,
              letterSpacing: "0.09em", textTransform: "uppercase",
              color: s === "active" ? CY : s === "done" ? T.textTertiary : T.textMuted,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: s === "active" ? CY : s === "done" ? T.green : T.textMuted,
                boxShadow: s === "active" ? `0 0 8px ${CY}cc` : "none",
              }} />
              {label}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );

  const Bar = ({ pct, grey }) => (
    <div style={{ height: 6, borderRadius: 3, background: T.surfaceHover, border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: 10 }}>
      <div style={{
        height: "100%", borderRadius: 3,
        width: pct == null ? "36%" : `${pct}%`,
        background: grey ? "linear-gradient(90deg,#5b5f6e,#7a7f92)" : `linear-gradient(90deg, ${BLU}, ${CY_SOFT})`,
        boxShadow: grey ? "none" : "0 0 12px rgba(69,200,245,.55)",
        transition: pct == null ? "none" : "width .3s",
        animation: pct == null ? "cfEngineSlide 1.4s ease-in-out infinite" : "none",
      }} />
    </div>
  );

  const btnStyle = {
    fontFamily: T.font, fontSize: 14, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer",
    padding: "11px 30px", borderRadius: 11,
    background: `linear-gradient(180deg, #3aa9ef, ${BLU_DEEP})`,
    // #328: literal white on purpose — the inner top edge of a blue gradient
    // button, not a tint of the canvas. Must not follow the theme.
    boxShadow: "0 4px 18px rgba(36,105,227,.38), inset 0 1px 0 rgba(255,255,255,.22)",
  };
  const ghostStyle = { fontSize: 12.5, color: T.textTertiary, background: "none", border: "none", cursor: "pointer", fontFamily: T.font };

  const Row = ({ k, children }) => (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, padding: "11px 0", borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
      <span style={{ color: T.textTertiary, flexShrink: 0 }}>{k}</span>
      <span style={{ color: T.text, fontWeight: 600, textAlign: "right" }}>{children}</span>
    </div>
  );

  // ── per-state content ─────────────────────────────────────────────────────
  let title, sub, body;

  if (ui === "loading") {
    title = "Set up Corva's AI engine";
    sub = "Checking this machine…";
    body = null;
  } else if (ui === "offline") {
    title = "Can't reach Corva's servers";
    sub = "The engine download needs internet for this one-time step. Check your connection and try again.";
    body = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 13 }}>
        <button style={btnStyle} onClick={loadState}>Try again</button>
        <button style={ghostStyle} onClick={() => onClose(false)}>Set up later</button>
      </div>
    );
  } else if (ui === "ready") {
    const isCpu = state.variant === "cpu";
    title = "Set up Corva's AI engine";
    sub = <>One-time download so transcription and clip detection run <b style={{ color: T.text }}>entirely on this PC</b> — your footage never leaves your machine.</>;
    body = (
      <>
        <div style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "4px 18px", marginBottom: 22, textAlign: "left" }}>
          <Row k="Graphics card">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: isCpu ? T.yellow : T.green }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: isCpu ? T.yellow : T.green, boxShadow: `0 0 7px ${isCpu ? T.yellow : T.green}` }} />
              {isCpu ? "No NVIDIA card found" : state.gpuName}
            </span>
          </Row>
          <Row k="Engine">{isCpu ? "Processor engine" : <>GPU engine <span style={{ color: T.textTertiary, fontWeight: 500 }}>· fastest</span></>}</Row>
          <Row k="Download">{fmtGB(v?.sizeBytes)} <span style={{ color: T.textTertiary, fontWeight: 500 }}>+ 1.6 GB speech model</span></Row>
          <Row k="Install to">
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 9, maxWidth: 310 }}>
              <span title={state.engineRoot} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5, fontWeight: 500, color: T.textSecondary }}>
                {state.engineRoot}
              </span>
              <button onClick={chooseLocation} style={{ ...ghostStyle, color: CY, fontWeight: 600, padding: 0, flexShrink: 0 }}>Change</button>
            </span>
          </Row>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, padding: "11px 0", fontSize: 13 }}>
            <span style={{ color: T.textTertiary, flexShrink: 0 }}>Space needed</span>
            <span style={{ color: T.text, fontWeight: 600 }}>
              {fmtGB(state.requiredBytes)} <span style={{ color: T.textTertiary, fontWeight: 500 }}>· {fmtGB(state.freeBytes)} free</span>{" "}
              <span style={{ color: diskShort ? T.red : T.green }}>{diskShort ? "✕" : "✓"}</span>
            </span>
          </div>
        </div>
        {isCpu && (
          <div style={{ width: "100%", display: "flex", gap: 10, alignItems: "flex-start", background: `${T.yellow}1a`, border: `1px solid ${T.yellow}38`, borderRadius: 11, padding: "11px 13px", margin: "-8px 0 22px", textAlign: "left" }}>
            <span style={{ color: T.yellow, fontWeight: 700 }}>⚠</span>
            <p style={{ fontSize: 12.5, lineHeight: 1.5, color: T.textSecondary, margin: 0 }}>
              <b style={{ color: T.yellow }}>Heads up — this will be slower.</b> Without an NVIDIA card, transcribing runs on your processor: a 2-minute clip takes around 8 minutes. Everything still works, it just takes patience.
            </p>
          </div>
        )}
        {locError && (
          <div style={{ width: "100%", display: "flex", gap: 10, alignItems: "flex-start", background: `${T.red}1a`, border: `1px solid ${T.red}38`, borderRadius: 11, padding: "11px 13px", margin: "-8px 0 22px", textAlign: "left" }}>
            <span style={{ color: T.red, fontWeight: 700 }}>✕</span>
            <p style={{ fontSize: 12.5, lineHeight: 1.5, color: T.textSecondary, margin: 0 }}>{locError}</p>
          </div>
        )}
        {diskShort && (
          <div style={{ width: "100%", display: "flex", gap: 10, alignItems: "flex-start", background: `${T.red}1a`, border: `1px solid ${T.red}38`, borderRadius: 11, padding: "11px 13px", margin: "-8px 0 22px", textAlign: "left" }}>
            <span style={{ color: T.red, fontWeight: 700 }}>✕</span>
            <p style={{ fontSize: 12.5, lineHeight: 1.5, color: T.textSecondary, margin: 0 }}>
              <b style={{ color: T.red }}>Not enough disk space on this drive.</b> Hit Change above to install on a different drive, or free up some room and hit Check again.
            </p>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 13 }}>
          {diskShort
            ? <button style={btnStyle} onClick={loadState}>Check again</button>
            : <button style={btnStyle} onClick={start}>{state.resumeBytes > 0 ? "Resume download" : "Download and install"}</button>}
          <button style={ghostStyle} onClick={() => onClose(false)}>Set up later</button>
        </div>
        <div style={{ marginTop: 26, fontSize: 11.5, color: T.textMuted }}>
          Downloads securely from Corva's servers · resumes automatically if interrupted
        </div>
      </>
    );
  } else if (ui === "download") {
    title = "Downloading the AI engine";
    sub = "You can hide this — the download continues either way.";
    body = (
      <>
        <div style={{ width: "100%", marginBottom: 22 }}>
          <Bar pct={prog?.pct ?? null} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: T.textTertiary }}>
            <span style={{ color: T.textSecondary, fontWeight: 600 }}>
              {prog?.bytesDone != null ? `${fmtGB(prog.bytesDone)} of ${fmtGB(prog.bytesTotal)}` : (prog?.message || "Starting…")}
            </span>
            <span>{[fmtSpeed(prog?.speedBps), fmtEta(prog?.etaSec)].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 13 }}>
          <button style={{ ...ghostStyle, fontSize: 13, color: T.textSecondary }} onClick={() => onClose(false)}>Hide — keep downloading in background</button>
          <button style={ghostStyle} onClick={cancel}>Cancel</button>
        </div>
      </>
    );
  } else if (ui === "unpack" || ui === "verify") {
    title = "Installing the AI engine";
    sub = "Unpacking and checking everything works. This takes a minute or two — no internet needed from here.";
    body = (
      <div style={{ width: "100%", marginBottom: 22 }}>
        <Bar pct={null} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: T.textTertiary }}>
          <span style={{ color: T.textSecondary, fontWeight: 600 }}>{ui === "verify" ? "Checking everything works…" : "Unpacking files…"}</span>
        </div>
      </div>
    );
  } else if (ui === "model") {
    title = "Downloading the speech model";
    sub = "The model that turns your voice into subtitles. Last step — after this, transcription is instant to start.";
    body = (
      <>
        <div style={{ width: "100%", marginBottom: 22 }}>
          <Bar pct={prog?.pct ?? null} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: T.textTertiary }}>
            <span style={{ color: T.textSecondary, fontWeight: 600 }}>
              {prog?.bytesDone != null && prog?.bytesTotal ? `${fmtGB(prog.bytesDone)} of ${fmtGB(prog.bytesTotal)}` : "Downloading…"}
            </span>
          </div>
        </div>
        <button style={{ ...ghostStyle, fontSize: 13, color: T.textSecondary }} onClick={() => onClose(false)}>Hide — keep downloading in background</button>
      </>
    );
  } else if (ui === "done") {
    title = "Your AI engine is ready";
    sub = <>Transcription and clip detection now run fully on this machine.<br /><b style={{ color: T.text }}>Your footage never leaves your PC.</b></>;
    body = <button style={btnStyle} onClick={() => onClose(true)}>Start creating</button>;
  } else if (ui === "error") {
    const dl = errInfo?.errorPhase === "download" || errInfo?.errorPhase === "manifest";
    title = dl ? "Download interrupted" : "Setup hit a snag";
    sub = dl
      ? "Looks like the connection dropped. Nothing is lost — the download picks up right where it stopped."
      : (errInfo?.message || "Something went wrong.");
    body = (
      <>
        {dl && (
          <div style={{ width: "100%", marginBottom: 22 }}>
            <Bar pct={prog?.pct ?? 0} grey />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: T.textTertiary }}>
              <span style={{ color: T.textSecondary, fontWeight: 600 }}>
                {prog?.bytesDone != null ? `${fmtGB(prog.bytesDone)} of ${fmtGB(prog.bytesTotal)} saved` : ""}
              </span>
              <span>paused</span>
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 13 }}>
          <button style={btnStyle} onClick={start}>{dl ? "Resume download" : "Try again"}</button>
          <button style={ghostStyle} onClick={() => onClose(false)}>Set up later</button>
        </div>
      </>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999, background: T.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: T.font, color: T.text,
    }}>
      <style>{KEYFRAMES}</style>
      {/* padding keeps the mark's glow (inset -34px, breathing to ~1.15x) inside
          this scroll container's clip box — overflowY:auto clips both axes */}
      <div style={{ width: 520, maxHeight: "90vh", overflowY: "auto", padding: "56px 0", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        {Mark}
        <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.01em", margin: "0 0 7px" }}>{title}</h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: T.textSecondary, maxWidth: 430, margin: "0 0 24px" }}>{sub}</p>
        {ui !== "loading" && ui !== "offline" && Steps}
        {body}
      </div>
    </div>
  );
}
