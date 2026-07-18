import React, { useState, useEffect, useRef, useCallback } from "react";
import T from "../styles/theme";
import { toFileUrl } from "./shared";

// #169: Audio track calibration wizard. Plays each audio track of a multi-track
// recording (muted video + isolated track audio) and asks the user to label
// what they hear. Exactly one track must be labeled "voice" — that track feeds
// transcription and waveforms. Everything else is optional context.
//
// Props:
//   filePath   — source recording to sample
//   trackCount — number of audio tracks in the file
//   onComplete(setup) — called with { trackCount, tracks: [{index, label}] }
//   onCancel   — user backed out
//   hasExisting — a previous calibration exists (changes the intro copy)

const LABEL_OPTIONS = [
  { value: "voice", text: "My voice", hint: "the mic — subtitles come from this" },
  { value: "game", text: "Game / desktop" },
  { value: "music", text: "Music" },
  { value: "comms", text: "Voice chat" },
  { value: "mix", text: "Everything mixed" },
  { value: "other", text: "Other" },
  { value: "empty", text: "Empty / silent" },
];

const OFFSETS = [0.25, 0.5, 0.75];

export default function AudioCalibrationModal({ filePath, trackCount, onComplete, onCancel, hasExisting }) {
  const [current, setCurrent] = useState(0); // 0-based track index
  const [labels, setLabels] = useState({}); // { trackIndex: label }
  const [offsetIdx, setOffsetIdx] = useState(0);
  const [sample, setSample] = useState(null); // { samplePath, sampleStart }
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  const fileName = (filePath || "").split(/[/\\]/).pop();
  const voiceIndex = Object.keys(labels).find((k) => labels[k] === "voice");
  const allLabeled = Object.keys(labels).length >= trackCount;

  const stopPlayback = useCallback(() => {
    const a = audioRef.current, v = videoRef.current;
    if (a) a.pause();
    if (v) v.pause();
    setPlaying(false);
  }, []);

  // Fetch the sample for the current track + offset. Clears playback first.
  useEffect(() => {
    let alive = true;
    stopPlayback();
    setSample(null);
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const r = await window.clipflow.audioExtractTrackSample(filePath, current, OFFSETS[offsetIdx]);
        if (!alive) return;
        if (r?.success) setSample({ samplePath: r.samplePath, sampleStart: r.sampleStart });
        else setError(r?.error || "Could not extract this track");
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [filePath, current, offsetIdx, stopPlayback]);

  // Unmount cleanup — media elements MUST be unloaded or Chromium crashes,
  // and the temp sample files get cleaned up best-effort.
  useEffect(() => {
    return () => {
      const a = audioRef.current, v = videoRef.current;
      if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
      if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
      window.clipflow?.audioCleanupSamples?.();
    };
  }, []);

  const togglePlay = () => {
    const a = audioRef.current, v = videoRef.current;
    if (!a || !sample) return;
    if (playing) { stopPlayback(); return; }
    if (v) {
      try { v.currentTime = sample.sampleStart; v.play().catch(() => {}); } catch (_) {}
    }
    a.currentTime = 0;
    a.play().catch(() => {});
    setPlaying(true);
  };

  const pickLabel = (label) => {
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
    stopPlayback();
    if (current < trackCount - 1) {
      setOffsetIdx(0);
      setCurrent(current + 1);
    }
  };

  const finish = () => {
    stopPlayback();
    const tracks = [];
    for (let i = 0; i < trackCount; i++) {
      tracks.push({ index: i, label: labels[i] || "unknown" });
    }
    onComplete({ trackCount, tracks });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius?.md || 10, padding: 24, maxWidth: 560, width: "92%", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
        <div style={{ color: T.text, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          🎧 Identify your audio tracks
        </div>
        <div style={{ color: T.textSecondary, fontSize: 12.5, marginBottom: 14, lineHeight: 1.5 }}>
          {hasExisting
            ? "This recording's audio layout doesn't match your saved setup — your OBS settings probably changed. "
            : "This recording has multiple audio tracks and ClipFlow needs to know which one is your voice. "}
          Play each track and tell ClipFlow what you hear. You'll only do this once — future recordings inherit the answer.
        </div>

        {/* Muted video context + play control */}
        <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
          <video
            ref={videoRef}
            src={toFileUrl(filePath)}
            muted
            playsInline
            style={{ width: 200, borderRadius: 8, border: `1px solid ${T.border}`, background: "#000", alignSelf: "flex-start" }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: T.textTertiary, fontSize: 11, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={fileName}>{fileName}</div>
            <div style={{ color: T.text, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
              Track {current + 1} <span style={{ color: T.textTertiary, fontWeight: 400 }}>of {trackCount}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={togglePlay}
                disabled={loading || !!error}
                style={{
                  padding: "7px 18px", borderRadius: 6, fontSize: 12.5, fontWeight: 700, cursor: loading || error ? "default" : "pointer", fontFamily: T.font,
                  border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight,
                  opacity: loading || error ? 0.5 : 1,
                }}
              >
                {loading ? "Preparing…" : playing ? "⏹ Stop" : "▶ Play this track"}
              </button>
              <button
                onClick={() => { setOffsetIdx((offsetIdx + 1) % OFFSETS.length); }}
                disabled={loading}
                style={{ padding: "7px 12px", borderRadius: 6, fontSize: 12, border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary, cursor: "pointer", fontFamily: T.font, opacity: loading ? 0.5 : 1 }}
              >
                Try another part
              </button>
            </div>
            {error && (
              <div style={{ color: T.red, fontSize: 11.5, marginTop: 8 }}>{error}</div>
            )}
            {sample && (
              <audio
                ref={audioRef}
                src={toFileUrl(sample.samplePath)}
                onEnded={stopPlayback}
                style={{ display: "none" }}
              />
            )}
          </div>
        </div>

        {/* Label pills */}
        <div style={{ color: T.textSecondary, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
          What did you hear?
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
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
                  background: isActive ? T.accentDim : "rgba(255,255,255,0.03)",
                  color: isActive ? T.accentLight : T.textSecondary,
                }}
              >
                {opt.text}{opt.value === "voice" ? " 🎙" : ""}
              </button>
            );
          })}
        </div>

        {/* Track progress dots */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 16 }}>
          {Array.from({ length: trackCount }, (_, i) => {
            const done = labels[i] !== undefined;
            const isCurrent = i === current;
            return (
              <button
                key={i}
                onClick={() => { stopPlayback(); setOffsetIdx(0); setCurrent(i); }}
                title={`Track ${i + 1}${done ? ` — ${LABEL_OPTIONS.find((o) => o.value === labels[i])?.text || labels[i]}` : ""}`}
                style={{
                  width: isCurrent ? 22 : 8, height: 8, borderRadius: 4, border: "none", cursor: "pointer", padding: 0,
                  background: done ? T.green : isCurrent ? T.accentLight : "rgba(255,255,255,0.15)",
                  boxShadow: done ? `0 0 6px ${T.green}` : "none",
                  transition: "all 0.15s ease",
                }}
              />
            );
          })}
          {voiceIndex !== undefined && (
            <span style={{ color: T.textTertiary, fontSize: 11, marginLeft: 8 }}>
              Voice = Track {Number(voiceIndex) + 1} 🎙
            </span>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
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
                style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.05)", color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
              >
                Skip the rest — voice is found
              </button>
            )}
            <button
              onClick={finish}
              disabled={voiceIndex === undefined || !allLabeled}
              style={{
                padding: "8px 18px", borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: T.font,
                border: `1px solid ${T.accentBorder}`,
                background: voiceIndex !== undefined && allLabeled ? T.accentDim : "rgba(255,255,255,0.04)",
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
            One track must be labeled "My voice" before finishing — that's the track subtitles are built from.
          </div>
        )}
      </div>
    </div>
  );
}
