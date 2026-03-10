import React from "react";
import T from "../../styles/theme";
import useSubtitleStore from "../stores/useSubtitleStore";
import usePlaybackStore from "../stores/usePlaybackStore";
import useEditorStore from "../stores/useEditorStore";
import { S2, BD } from "../utils/constants";

export default function TranscriptPanel() {
  const transcriptSearch = useSubtitleStore((s) => s.transcriptSearch);
  const setTranscriptSearch = useSubtitleStore((s) => s.setTranscriptSearch);
  const editingWordKey = useSubtitleStore((s) => s.editingWordKey);
  const setEditingWordKey = useSubtitleStore((s) => s.setEditingWordKey);
  const setActiveRow = useSubtitleStore((s) => s.setActiveRow);
  const setEditSegments = useSubtitleStore((s) => s.setEditSegments);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const seekTo = usePlaybackStore((s) => s.seekTo);
  const markDirty = useEditorStore((s) => s.markDirty);
  const transcriptRows = useSubtitleStore.getState().getTranscriptRows();

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, background: S2, border: `1px solid ${BD}`,
          borderRadius: 5, padding: "6px 10px", marginBottom: 12,
        }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke={T.textSecondary} strokeWidth="1.5"><circle cx="7" cy="7" r="4"/><path d="M10.5 10.5l3 3"/></svg>
          <input
            type="text"
            placeholder="Search transcript…"
            value={transcriptSearch}
            onChange={e => setTranscriptSearch(e.target.value)}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: T.text, fontSize: 12, fontFamily: T.font,
            }}
          />
        </div>

        <div style={{
          fontSize: 13, color: T.text, lineHeight: 1.8, whiteSpace: "pre-wrap",
          fontFamily: T.font, letterSpacing: "0.2px",
        }}>
          {transcriptRows
            .filter(row => !transcriptSearch || row.text.toLowerCase().includes(transcriptSearch.toLowerCase()))
            .map((row) => {
              const words = row.text.split(/\s+/);
              const segDur = row.endSec - row.startSec;
              const isActiveRow = currentTime >= row.startSec && currentTime <= row.endSec;
              return words.map((word, wi) => {
                const wordStart = row.startSec + (wi / words.length) * segDur;
                const wordEnd = row.startSec + ((wi + 1) / words.length) * segDur;
                const isActiveWord = isActiveRow && currentTime >= wordStart && currentTime < wordEnd;
                const wKey = `${row.id}-${wi}`;
                const isEditing = editingWordKey === wKey;

                if (isEditing) {
                  return (
                    <input
                      key={wKey}
                      autoFocus
                      defaultValue={word}
                      onBlur={e => {
                        const newWord = e.target.value.trim();
                        if (newWord && newWord !== word) {
                          const newWords = [...words];
                          newWords[wi] = newWord;
                          const newText = newWords.join(" ");
                          setEditSegments(prev => prev.map(s => s.id === row.id ? { ...s, text: newText } : s));
                          markDirty();
                        }
                        setEditingWordKey(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") e.target.blur();
                        if (e.key === "Escape") setEditingWordKey(null);
                      }}
                      onClick={e => e.stopPropagation()}
                      style={{
                        width: Math.max(30, word.length * 8), fontSize: 13, fontFamily: T.font,
                        color: T.accentLight, background: "rgba(139,92,246,0.15)",
                        border: `1px solid ${T.accentBorder}`, borderRadius: 3,
                        padding: "1px 3px", outline: "none", display: "inline",
                      }}
                    />
                  );
                }

                return (
                  <span
                    key={wKey}
                    onClick={() => {
                      setActiveRow(row.id);
                      seekTo(wordStart + 0.01);
                    }}
                    onDoubleClick={() => setEditingWordKey(wKey)}
                    style={{
                      cursor: "pointer", padding: "1px 0", borderRadius: 2,
                      background: isActiveWord ? T.accentDim : "transparent",
                      color: isActiveWord ? T.accentLight : T.text,
                      transition: "background 0.1s",
                    }}
                  >
                    {word}{" "}
                  </span>
                );
              });
            })
          }
        </div>
      </div>
    </div>
  );
}
