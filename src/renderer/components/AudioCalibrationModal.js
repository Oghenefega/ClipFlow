import React, { useState, useEffect, useRef, useCallback } from "react";
import T from "../styles/theme";
import { toFileUrl } from "./shared";
import { LABEL_OPTIONS, trackLabelText } from "../audioTrackLabels";

// #169/#271: Audio track calibration wizard, editor-style. The recording plays
// as the anchor (muted) while every track is a lane with its real waveform for
// the 20s sample window — a sweeping playhead shows where playback is, and
// clicking a lane solos that track's audio. Exactly one track must be labeled
// "voice" (shown as "Mic") — that track feeds transcription and waveforms.
//
// Props:
//   filePath   — source recording to sample
//   trackCount — number of audio tracks in the file
//   onComplete(setup) — called with { trackCount, tracks: [{index, label, customName?}] }
//   onCancel   — user backed out
//   hasExisting — a previous calibration exists (changes the intro copy)

const OFFSETS = [0.25, 0.5, 0.75];
const INFO_COL = 148; // px width of the lane label column

export default function AudioCalibrationModal({ filePath, trackCount, onComplete, onCancel, hasExisting }) {
  const [current, setCurrent] = useState(0); // 0-based track index
  const [labels, setLabels] = useState({}); // { trackIndex: label }
  const [customNames, setCustomNames] = useState({}); // { trackIndex: name } for "other"
  const [customDraft, setCustomDraft] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [offsetIdx, setOffsetIdx] = useState(0);
  const [samples, setSamples] = useState(null); // [{samplePath, sampleStart, sampleDuration, peaks} | {error}]
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const playheadRef = useRef(null);
  const stackRef = useRef(null);
  const rafRef = useRef(null);
  const playingRef = useRef(false);

  const fileName = (filePath || "").split(/[/\\]/).pop();
  const voiceIndex = Object.keys(labels).find((k) => labels[k] === "voice");
  const allLabeled = Object.keys(labels).length >= trackCount;
  const cur = samples?.[current];

  // #271: prefill from the saved setup so recalibrating doesn't start from
  // scratch — but ONLY when the layouts match. A different track count means
  // OBS changed; stale labels would be a wrong default begging to be confirmed.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const setup = await window.clipflow.storeGet("audioSetup");
        if (!alive || !setup || setup.trackCount !== trackCount || !Array.isArray(setup.tracks)) return;
        const seededLabels = {};
        const seededNames = {};
        for (const t of setup.tracks) {
          if (!Number.isInteger(t?.index) || t.index >= trackCount) continue;
          if (t.label && t.label !== "unknown") seededLabels[t.index] = t.label;
          if (t.customName) seededNames[t.index] = t.customName;
        }
        // User picks win over the seed if they somehow raced the load.
        setLabels((prev) => ({ ...seededLabels, ...prev }));
        setCustomNames((prev) => ({ ...seededNames, ...prev }));
        const firstUnlabeled = Array.from({ length: trackCount }, (_, i) => i).find((i) => seededLabels[i] === undefined);
        setCurrent((c) => (c === 0 && firstUnlabeled !== undefined ? firstUnlabeled : c));
      } catch (_) {}
    })();
    return () => { alive = false; };
  }, [filePath, trackCount]);

  const stopPlayback = useCallback(() => {
    const a = audioRef.current, v = videoRef.current;
    if (a) a.pause();
    if (v) v.pause();
    playingRef.current = false;
    setPlaying(false);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (playheadRef.current) playheadRef.current.style.opacity = "0";
  }, []);

  // Fetch ALL tracks' samples (+ waveform peaks) for the current offset in
  // parallel. Extraction is cached per (file, track, offset) in main.
  useEffect(() => {
    let alive = true;
    stopPlayback();
    setSamples(null);
    setLoading(true);
    (async () => {
      const results = await Promise.all(
        Array.from({ length: trackCount }, (_, i) =>
          window.clipflow.audioExtractTrackSample(filePath, i, OFFSETS[offsetIdx])
            .then((r) => (r?.success ? r : { error: r?.error || "Could not extract this track" }))
            .catch((e) => ({ error: e.message }))
        )
      );
      if (!alive) return;
      setSamples(results);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [filePath, trackCount, offsetIdx, stopPlayback]);

  // Point the (single, persistent) audio element at the solo'd track. If the
  // user switches lanes mid-play, resume the new track at the video's position
  // so the moment carries across — same window, different ears.
  useEffect(() => {
    const a = audioRef.current, v = videoRef.current;
    if (!a) return;
    if (!cur || cur.error) { stopPlayback(); return; }
    a.src = toFileUrl(cur.samplePath);
    a.load();
    if (playingRef.current && v) {
      const pos = Math.max(0, v.currentTime - cur.sampleStart);
      if (pos < cur.sampleDuration) {
        // Seek only once metadata exists — a seek on a still-loading element no-ops.
        const seekAndPlay = () => { a.currentTime = pos; a.play().catch(() => {}); };
        if (a.readyState >= 1) seekAndPlay();
        else a.addEventListener("loadedmetadata", seekAndPlay, { once: true });
      } else {
        stopPlayback();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, stopPlayback]);

  // Unmount cleanup — media elements MUST be unloaded or Chromium crashes,
  // and the temp sample files get cleaned up best-effort.
  useEffect(() => {
    return () => {
      const a = audioRef.current, v = videoRef.current;
      if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
      if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.clipflow?.audioCleanupSamples?.();
    };
  }, []);

  // Playhead sweep — the muted video is the clock; the lane column maps the
  // sample window. Driven outside React state to stay 60fps-cheap.
  const stepPlayhead = useCallback(() => {
    const v = videoRef.current, ph = playheadRef.current, stack = stackRef.current;
    const c = samples?.[current];
    if (!v || !ph || !stack || !c || c.error) return;
    const frac = Math.max(0, Math.min(1, (v.currentTime - c.sampleStart) / c.sampleDuration));
    ph.style.left = `${INFO_COL + frac * (stack.clientWidth - INFO_COL)}px`;
    if (playingRef.current) rafRef.current = requestAnimationFrame(stepPlayhead);
  }, [samples, current]);

  const togglePlay = () => {
    const a = audioRef.current, v = videoRef.current;
    if (!a || !cur || cur.error) return;
    if (playing) { stopPlayback(); return; }
    if (v) {
      try { v.currentTime = cur.sampleStart; v.play().catch(() => {}); } catch (_) {}
    }
    a.currentTime = 0;
    a.play().catch(() => {});
    playingRef.current = true;
    setPlaying(true);
    if (playheadRef.current) playheadRef.current.style.opacity = "1";
    rafRef.current = requestAnimationFrame(stepPlayhead);
  };

  const advanceFrom = (idx) => {
    if (idx < trackCount - 1) setCurrent(idx + 1);
  };

  const pickLabel = (label) => {
    if (label === "other") {
      // "Other…" needs a name before moving on — open the input, don't advance.
      setLabels((prev) => ({ ...prev, [current]: "other" }));
      setCustomDraft(customNames[current] || "");
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    setLabels((prev) => {
      const next = { ...prev };
      // Only one track can be the voice — picking it elsewhere moves it.
      if (label === "voice") {
        for (const k of Object.keys(next)) {
          if (next[k] === "voice") next[k] = "unknown";
        }
      }
      next[current] = label;
      return next;
    });
    // Leaving "other" for a real label drops the stale custom name.
    setCustomNames((prev) => {
      if (prev[current] === undefined) return prev;
      const next = { ...prev };
      delete next[current];
      return next;
    });
    advanceFrom(current);
  };

  const commitCustomName = () => {
    const name = customDraft.trim().slice(0, 24);
    setCustomNames((prev) => {
      const next = { ...prev };
      if (name) next[current] = name;
      else delete next[current];
      return next;
    });
    setCustomOpen(false);
    setCustomDraft("");
    advanceFrom(current);
  };

  const selectTrack = (i) => {
    if (i === current) return;
    setCustomOpen(false);
    setCurrent(i);
  };

  const finish = () => {
    stopPlayback();
    const tracks = [];
    for (let i = 0; i < trackCount; i++) {
      const t = { index: i, label: labels[i] || "unknown" };
      if (t.label === "other" && customNames[i]) t.customName = customNames[i];
      tracks.push(t);
    }
    onComplete({ trackCount, tracks });
  };

  const laneStateText = (i) => {
    if (labels[i] !== undefined) {
      const text = trackLabelText({ label: labels[i], customName: customNames[i] });
      return labels[i] === "voice" ? `${text} 🎙` : text;
    }
    return i === current ? "Labeling now…" : "Not yet";
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(var(--shade),calc(0.72 * var(--shadeK)))", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius?.md || 10, padding: 24, maxWidth: 640, width: "94%", maxHeight: "94vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(var(--shade),calc(0.6 * var(--shadeK)))" }}>
        <div style={{ color: T.text, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          🎧 Identify your audio tracks
        </div>
        <div style={{ color: T.textSecondary, fontSize: 12.5, marginBottom: 14, lineHeight: 1.5 }}>
          {hasExisting
            ? "This recording's audio layout doesn't match your saved setup — your OBS settings probably changed. "
            : "This recording has multiple audio tracks and Corva needs to know which one is your mic. "}
          Play the video and solo each lane — label what you hear. You'll only do this once — future recordings inherit the answer.
        </div>

        {/* Video anchor — muted; the solo'd track supplies the audio */}
        <div style={{ position: "relative", background: "#000", border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
          <video
            ref={videoRef}
            src={toFileUrl(filePath)}
            muted
            playsInline
            style={{ display: "block", width: "100%", height: 200, objectFit: "contain", background: "#000" }}
          />
          <div style={{ position: "absolute", top: 6, left: 10, right: 10, color: T.textTertiary, fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: "0 1px 3px rgba(var(--shade),calc(0.9 * var(--shadeK)))" }} title={fileName}>{fileName}</div>
          <div style={{ position: "absolute", bottom: 8, left: 10, color: T.accentLight, fontSize: 11, fontWeight: 600, background: "rgba(17,18,24,0.85)", border: `1px solid ${T.accentBorder}`, borderRadius: 999, padding: "3px 10px" }}>
            Soloing Track {current + 1}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <button
            onClick={togglePlay}
            disabled={loading || !cur || !!cur?.error}
            style={{
              padding: "7px 18px", borderRadius: 6, fontSize: 12.5, fontWeight: 700, cursor: loading || cur?.error ? "default" : "pointer", fontFamily: T.font,
              border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight,
              opacity: loading || !cur || cur?.error ? 0.5 : 1,
            }}
          >
            {loading ? "Preparing…" : playing ? "⏹ Stop" : "▶ Play"}
          </button>
          <button
            onClick={() => { setOffsetIdx((offsetIdx + 1) % OFFSETS.length); }}
            disabled={loading}
            style={{ padding: "7px 12px", borderRadius: 6, fontSize: 12, border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary, cursor: "pointer", fontFamily: T.font, opacity: loading ? 0.5 : 1 }}
          >
            Try another part
          </button>
          <span style={{ color: T.textTertiary, fontSize: 11, marginLeft: "auto" }}>video is muted — you hear only the solo'd track</span>
        </div>

        {/* Track stack — one lane per track, real waveforms, sweeping playhead */}
        <div ref={stackRef} style={{ position: "relative", border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
          {Array.from({ length: trackCount }, (_, i) => {
            const done = labels[i] !== undefined;
            const isCurrent = i === current;
            const s = samples?.[i];
            return (
              <div
                key={i}
                onClick={() => selectTrack(i)}
                style={{
                  display: "grid", gridTemplateColumns: `${INFO_COL}px 1fr`, cursor: "pointer",
                  borderBottom: i < trackCount - 1 ? `1px solid ${T.border}` : "none",
                  background: isCurrent ? T.accentDim : done ? "rgba(52,211,153,0.04)" : "rgba(var(--lift),0.01)",
                }}
              >
                <div style={{ padding: "6px 12px", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.6px", color: isCurrent ? T.accentLight : done ? T.green : T.textTertiary }}>
                    TRACK {i + 1}{done && !isCurrent ? " ✓" : ""}
                  </div>
                  <div style={{ fontSize: 11.5, color: isCurrent ? T.accentLight : done ? T.green : T.textTertiary, fontWeight: done || isCurrent ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {laneStateText(i)}
                  </div>
                </div>
                <div style={{ position: "relative", height: 38 }}>
                  {s?.peaks?.length ? (
                    <svg preserveAspectRatio="none" viewBox={`0 0 ${s.peaks.length * 3} 100`} style={{ display: "block", width: "100%", height: "100%" }}>
                      {(() => {
                        // Normalize per lane: real recordings sit far below full
                        // scale (measured ~-31 dBFS on Fega's tracks), so raw
                        // peaks render invisibly small. Shape matters here, not
                        // absolute level. Lanes under the floor (~-60 dBFS) are
                        // genuinely silent and stay flat.
                        const laneMax = Math.max(...s.peaks);
                        const scale = laneMax >= 0.001 ? 1 / laneMax : 1;
                        return s.peaks.map((v, j) => {
                          const h = Math.max(2, Math.min(1, v * scale) * 92);
                          return <rect key={j} x={j * 3} y={50 - h / 2} width={2} height={h} rx={1} fill="rgba(var(--lift),0.30)" />;
                        });
                      })()}
                    </svg>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", height: "100%", paddingLeft: 10, color: s?.error ? T.red : T.textMuted, fontSize: 10.5 }}>
                      {s?.error ? "Couldn't read this track" : "…"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={playheadRef} style={{ position: "absolute", top: 0, bottom: 0, left: INFO_COL, width: 1.5, background: T.accentLight, boxShadow: "0 0 6px rgba(167,139,250,0.8)", pointerEvents: "none", opacity: 0 }} />
        </div>

        {/* Label pills */}
        <div style={{ color: T.textSecondary, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
          What is track {current + 1}?
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {LABEL_OPTIONS.map((opt) => {
            const isActive = labels[current] === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => pickLabel(opt.value)}
                title={opt.hint || undefined}
                style={{
                  padding: "6px 14px", borderRadius: T.radius?.sm || 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
                  border: isActive ? `1px solid ${T.accentBorder}` : `1px solid ${T.border}`,
                  background: isActive ? T.accentDim : "rgba(var(--lift),0.03)",
                  color: isActive ? T.accentLight : T.textSecondary,
                }}
              >
                {opt.text}{opt.value === "voice" ? " 🎙" : ""}
                {opt.hint ? <span style={{ color: T.textTertiary, fontSize: 10.5, fontWeight: 400, marginLeft: 5 }}>{opt.hint}</span> : null}
              </button>
            );
          })}
        </div>
        {customOpen && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
            <input
              type="text"
              autoFocus
              value={customDraft}
              maxLength={24}
              placeholder="Name this track (e.g. Spotify, TeamSpeak)"
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitCustomName(); }}
              style={{ background: "rgba(var(--lift),0.04)", border: `1px solid ${T.accentBorder}`, borderRadius: 6, color: T.text, fontFamily: T.font, fontSize: 12.5, padding: "7px 10px", width: 230, outline: "none" }}
            />
            <button
              onClick={commitCustomName}
              style={{ padding: "7px 12px", borderRadius: 6, border: `1px solid ${T.greenBorder}`, background: T.greenDim, color: T.green, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
            >
              Set
            </button>
          </div>
        )}
        <div style={{ color: T.textTertiary, fontSize: 11.5, marginTop: 12, lineHeight: 1.5 }}>
          A flat lane has no sound in this part — hit <span style={{ color: T.textSecondary }}>Try another part</span> before labeling it Empty. One track must be labeled <span style={{ color: T.textSecondary }}>Mic</span> — that's the track subtitles are built from.
        </div>

        {/* Footer actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <button
            onClick={() => { stopPlayback(); onCancel(); }}
            style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
          >
            Cancel
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            {voiceIndex !== undefined && !allLabeled && (
              <button
                onClick={finish}
                style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(var(--lift),0.05)", color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
              >
                Skip the rest — Mic is found
              </button>
            )}
            <button
              onClick={finish}
              disabled={voiceIndex === undefined || !allLabeled}
              style={{
                padding: "8px 18px", borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: T.font,
                border: `1px solid ${T.accentBorder}`,
                background: voiceIndex !== undefined && allLabeled ? T.accentDim : "rgba(var(--lift),0.04)",
                color: voiceIndex !== undefined && allLabeled ? T.accentLight : T.textTertiary,
                cursor: voiceIndex !== undefined && allLabeled ? "pointer" : "default",
              }}
            >
              Done
            </button>
          </div>
        </div>
        {voiceIndex === undefined && Object.keys(labels).length > 0 && (
          <div style={{ color: T.textTertiary, fontSize: 11, marginTop: 10 }}>
            One track must be labeled "Mic" before finishing — that's the track subtitles are built from.
          </div>
        )}
        <audio ref={audioRef} onEnded={stopPlayback} style={{ display: "none" }} />
      </div>
    </div>
  );
}
