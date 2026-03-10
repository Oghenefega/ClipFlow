import React from "react";
import T from "../../styles/theme";
import { SectionLabel } from "../../components/shared";
import useAIStore from "../stores/useAIStore";
import { Pill, Ib } from "../primitives/editorPrimitives";
import { BD, S2, S3 } from "../utils/constants";

export default function AIToolsDrawer({ gamesDb = [], anthropicApiKey = "" }) {
  const voiceMode = useAIStore((s) => s.voiceMode);
  const setVoiceMode = useAIStore((s) => s.setVoiceMode);
  const aiContext = useAIStore((s) => s.aiContext);
  const setAiContext = useAIStore((s) => s.setAiContext);
  const aiGame = useAIStore((s) => s.aiGame);
  const setAiGame = useAIStore((s) => s.setAiGame);
  const aiGenerating = useAIStore((s) => s.aiGenerating);
  const aiError = useAIStore((s) => s.aiError);
  const aiSuggestions = useAIStore((s) => s.aiSuggestions);
  const aiRejections = useAIStore((s) => s.aiRejections);
  const acceptedTitleIdx = useAIStore((s) => s.acceptedTitleIdx);
  const acceptedCaptionIdx = useAIStore((s) => s.acceptedCaptionIdx);
  const generate = useAIStore((s) => s.generate);
  const acceptTitle = useAIStore((s) => s.acceptTitle);
  const acceptCaption = useAIStore((s) => s.acceptCaption);
  const reject = useAIStore((s) => s.reject);

  const titles = aiSuggestions?.titles || [];
  const captions = aiSuggestions?.captions || [];

  const handleGenerate = () => generate(anthropicApiKey, gamesDb);

  return (
    <div>
      {/* Voice fingerprint bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", background: S2, borderBottom: `1px solid ${BD}`, gap: 8,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: T.textTertiary }}>Voice</span>
          <span style={{ fontSize: 10, color: T.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {voiceMode === "hype" ? "Hype — Gaming energy, punchy hooks" : "Chill — Laid-back, conversational"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <Pill label="🔥 Hype" active={voiceMode === "hype"} onClick={() => setVoiceMode("hype")} />
          <Pill label="😌 Chill" active={voiceMode === "chill"} onClick={() => setVoiceMode("chill")} />
        </div>
      </div>

      {/* Context textarea */}
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${BD}` }}>
        <textarea
          value={aiContext}
          onChange={e => setAiContext(e.target.value)}
          placeholder="Additional context (optional)…"
          rows={Math.max(2, aiContext.split('\n').length + 1)}
          style={{
            width: "100%", background: S2, border: `1px solid ${BD}`, borderRadius: 5,
            padding: "6px 9px", color: T.text, fontSize: 11, fontFamily: T.font,
            outline: "none", resize: "vertical", minHeight: 30, lineHeight: 1.5,
          }}
        />
      </div>

      {/* Game select + Generate */}
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${BD}`, display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={aiGame}
          onChange={(e) => setAiGame(e.target.value)}
          style={{
            background: S2, border: `1px solid ${BD}`, borderRadius: 5,
            padding: "6px 10px", fontSize: 11, color: T.textSecondary,
            cursor: "pointer", fontFamily: T.font, flexShrink: 0, outline: "none",
          }}
        >
          {gamesDb.map((g) => (
            <option key={g.tag} value={g.name}>{g.tag} — {g.name}</option>
          ))}
          <option value="Just Chatting / Off-topic">Just Chatting / Off-topic</option>
        </select>
        <button
          onClick={handleGenerate}
          disabled={aiGenerating || !anthropicApiKey}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            background: aiGenerating ? "rgba(255,255,255,0.06)" : (!anthropicApiKey ? "rgba(255,255,255,0.04)" : T.accent),
            color: aiGenerating || !anthropicApiKey ? T.textMuted : "#fff",
            border: "none", borderRadius: 5, padding: "6px 10px", fontSize: 11, fontWeight: 600,
            cursor: aiGenerating || !anthropicApiKey ? "default" : "pointer", fontFamily: T.font,
            opacity: !anthropicApiKey ? 0.5 : 1,
          }}
        >
          {aiGenerating ? "⏳ Generating..." : `✦ ${aiSuggestions ? "Regenerate" : "Generate"}`}
        </button>
      </div>

      {/* Error */}
      {aiError && (
        <div style={{ padding: "8px 12px", color: T.red, fontSize: 11, background: "rgba(248,113,113,0.08)", borderBottom: `1px solid ${BD}` }}>
          {aiError}
        </div>
      )}

      {/* Results or empty state */}
      {!aiSuggestions && !aiGenerating ? (
        <div style={{ padding: "28px 16px", textAlign: "center", color: T.textTertiary, fontSize: 12, lineHeight: 1.6 }}>
          {!anthropicApiKey ? (
            <>Set your <strong style={{ color: T.textSecondary }}>Anthropic API key</strong> in Settings first</>
          ) : (
            <>Set your game category,<br />add context if you want,<br />then hit <strong style={{ color: T.textSecondary }}>Generate</strong></>
          )}
        </div>
      ) : aiGenerating ? (
        <div style={{ padding: "28px 16px", textAlign: "center", color: T.textTertiary, fontSize: 12 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>✦</div>
          Generating titles & captions...
        </div>
      ) : (
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
          {/* Titles */}
          <SectionLabel>Titles ({titles.length})</SectionLabel>
          {titles.map((t, i) => {
            const text = t.title || t.text || "";
            const isRejected = aiRejections.includes(text);
            const isAccepted = acceptedTitleIdx === i;
            return (
              <div key={i} style={{
                background: S2, border: `1px solid ${isAccepted ? T.green : BD}`, borderRadius: 5,
                padding: "9px 10px", position: "relative", opacity: isRejected ? 0.35 : 1,
                transition: "opacity 0.2s, border 0.2s",
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: isAccepted ? T.green : T.text, lineHeight: 1.4, paddingRight: 50, marginBottom: 4 }}>
                  {text}
                </div>
                <div style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.4 }}>{t.why}</div>
                {isAccepted ? (
                  <div style={{ position: "absolute", top: 8, right: 8, fontSize: 10, color: T.green, fontWeight: 600 }}>✓ Applied</div>
                ) : !isRejected ? (
                  <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 3 }}>
                    <Ib title="Apply as title" onClick={() => acceptTitle(t, i)} style={{ width: 22, height: 22, fontSize: 10, border: `1px solid ${T.green}`, background: "rgba(52,211,153,0.1)", color: T.green }}>✓</Ib>
                    <Ib title="Dismiss" onClick={() => reject(text)} style={{ width: 22, height: 22, fontSize: 10, border: `1px solid ${BD}`, background: S3 }}>✕</Ib>
                  </div>
                ) : null}
              </div>
            );
          })}

          {/* Captions */}
          <SectionLabel style={{ marginTop: 6 }}>Captions ({captions.length})</SectionLabel>
          {captions.map((c, i) => {
            const text = c.caption || c.text || "";
            const isRejected = aiRejections.includes(text);
            const isAccepted = acceptedCaptionIdx === i;
            return (
              <div key={i} style={{
                background: S2, border: `1px solid ${isAccepted ? T.green : BD}`, borderRadius: 5,
                padding: "9px 10px", position: "relative", opacity: isRejected ? 0.35 : 1,
                transition: "opacity 0.2s, border 0.2s",
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: isAccepted ? T.green : T.text, lineHeight: 1.4, paddingRight: 50, marginBottom: 4 }}>
                  {text}
                </div>
                <div style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.4 }}>{c.why}</div>
                {isAccepted ? (
                  <div style={{ position: "absolute", top: 8, right: 8, fontSize: 10, color: T.green, fontWeight: 600 }}>✓ Applied</div>
                ) : !isRejected ? (
                  <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 3 }}>
                    <Ib title="Apply caption" onClick={() => acceptCaption(c, i)} style={{ width: 22, height: 22, fontSize: 10, border: `1px solid ${T.green}`, background: "rgba(52,211,153,0.1)", color: T.green }}>✓</Ib>
                    <Ib title="Dismiss" onClick={() => reject(text)} style={{ width: 22, height: 22, fontSize: 10, border: `1px solid ${BD}`, background: S3 }}>✕</Ib>
                  </div>
                ) : null}
              </div>
            );
          })}

          {/* Regenerate hint if rejections */}
          {aiRejections.length > 0 && (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <button
                onClick={handleGenerate}
                style={{
                  background: "transparent", border: `1px solid ${T.accentBorder}`, borderRadius: 5,
                  padding: "5px 14px", fontSize: 11, color: T.accentLight, cursor: "pointer", fontFamily: T.font,
                }}
              >
                ✦ Regenerate ({aiRejections.length} rejected)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
