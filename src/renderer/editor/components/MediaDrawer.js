import React, { useState, useEffect } from "react";
import T from "../../styles/theme";
import { BD, BDH, S2, S3 } from "../utils/constants";

export default function MediaDrawer() {
  const [mediaFilter, setMediaFilter] = useState("all");
  const [sfxFiles, setSfxFiles] = useState([]);

  // Load SFX files from folder on mount
  useEffect(() => {
    const loadSfx = async () => {
      if (!window.clipflow?.storeGetAll) return;
      try {
        const all = await window.clipflow.storeGetAll();
        const folder = all.sfxFolder;
        if (!folder) return;
        const files = await window.clipflow.readDir(folder);
        if (files && !files.error) {
          const media = files
            .filter((f) => !f.isDirectory && /\.(mp3|wav|ogg|png|jpg|gif|mp4)$/i.test(f.name))
            .map((f, i) => {
              const ext = f.name.split(".").pop().toUpperCase();
              const type = /^(mp3|wav|ogg)$/i.test(ext) ? "audio" : /^gif$/i.test(ext) ? "gif" : "image";
              return { id: `sfx_${i}`, name: f.name.replace(/\.[^.]+$/, ""), type, ext, path: f.path };
            });
          setSfxFiles(media);
        }
      } catch (e) { /* ignore */ }
    };
    loadSfx();
  }, []);

  const mediaAssets = sfxFiles;
  const filtered = mediaFilter === "all" ? mediaAssets : mediaAssets.filter(a => a.type === mediaFilter);
  const typeBadgeColors = {
    image: { bg: "rgba(139,92,246,0.2)", color: T.accentLight },
    gif: { bg: "rgba(251,191,36,0.15)", color: T.yellow },
    audio: { bg: "rgba(52,211,153,0.15)", color: T.green },
  };

  return (
    <div>
      {/* Upload drop zone */}
      <div style={{
        margin: 12, border: `1.5px dashed ${BDH}`, borderRadius: T.radius.md,
        padding: "18px 12px", textAlign: "center", cursor: "pointer",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
      }}>
        <span style={{ fontSize: 22, opacity: 0.35 }}>⊞</span>
        <span style={{ fontSize: 12, color: T.textSecondary }}>Drop files here or <span style={{ color: T.accentLight, cursor: "pointer" }}>browse</span></span>
        <span style={{ fontSize: 10, color: T.textTertiary }}>Images · GIFs · Audio</span>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${BD}`, padding: "0 12px", gap: 2 }}>
        {["all", "image", "gif", "audio"].map(f => (
          <button
            key={f}
            onClick={() => setMediaFilter(f)}
            style={{
              padding: "7px 10px", fontSize: 11, fontWeight: 500,
              color: mediaFilter === f ? T.text : T.textSecondary,
              borderBottom: `2px solid ${mediaFilter === f ? T.accent : "transparent"}`,
              background: "transparent", border: "none", cursor: "pointer", fontFamily: T.font,
            }}
          >
            {f === "all" ? "All" : f === "image" ? "Images" : f === "gif" ? "GIFs" : "Audio"}
          </button>
        ))}
      </div>

      {/* Asset grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "10px 12px", overflowY: "auto" }}>
        {filtered.map(asset => {
          const tc = typeBadgeColors[asset.type];
          const isAudio = asset.type === "audio";
          return (
            <div
              key={asset.id}
              style={{
                background: S2, border: `1px solid ${BD}`, borderRadius: 5,
                overflow: "hidden", position: "relative", cursor: "pointer",
                gridColumn: isAudio ? "span 2" : undefined,
              }}
            >
              {/* Thumbnail */}
              <div style={{
                width: "100%", height: 70, background: isAudio
                  ? "linear-gradient(135deg, #1a1a2e, #16213e)"
                  : asset.type === "gif" ? S3 : "linear-gradient(135deg, #7c5cbf, #4a3080)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {isAudio ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 2, height: 30 }}>
                    {[8,18,24,14,28,16,20,10].map((h, i) => (
                      <span key={i} style={{ display: "block", width: 3, height: h, background: T.accent, borderRadius: 2 }} />
                    ))}
                  </div>
                ) : asset.type === "gif" ? (
                  <span style={{ fontSize: 16 }}>{asset.name === "Hype" ? "🔥" : "💀"}</span>
                ) : (
                  <span style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>F</span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 7px", gap: 4 }}>
                <span style={{ fontSize: 10, color: T.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{asset.name}</span>
                <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: tc?.bg, color: tc?.color, flexShrink: 0 }}>{asset.ext}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
