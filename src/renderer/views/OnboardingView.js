import React, { useState, useRef } from "react";
import T from "../styles/theme";
import { Card, PrimaryButton } from "../components/shared";

// ── Archetype definitions ──
const ARCHETYPES = [
  { id: "hype", label: "Hype", subtitle: "Big reactions, chaos, screaming at the screen", color: "#f97316" },
  { id: "competitive", label: "Competitive", subtitle: "Clutch plays, ranked grind, outplaying opponents", color: "#3b82f6" },
  { id: "chill", label: "Chill", subtitle: "Commentary, vibes, storytelling", color: "#34d399" },
  { id: "variety", label: "Variety", subtitle: "A mix of everything", color: T.accent },
];

// ── Moment types ──
const MOMENT_TYPES = {
  funny: { label: "Funny moments", desc: "Hilarious and entertaining moments" },
  clutch: { label: "Clutch plays", desc: "Intense, game-changing plays" },
  emotional: { label: "Emotional reactions", desc: "Surprise, shock, excitement, frustration" },
  fails: { label: "Fails & bloopers", desc: "Funny mistakes and unexpected failures" },
  skillful: { label: "Skillful plays", desc: "Impressive technique and game knowledge" },
  educational: { label: "Educational moments", desc: "Tips, strategies, explanations" },
};

// ── Default moment order per archetype ──
const ARCHETYPE_MOMENT_ORDER = {
  hype: ["funny", "emotional", "fails", "clutch", "skillful", "educational"],
  competitive: ["clutch", "skillful", "emotional", "funny", "fails", "educational"],
  chill: ["educational", "funny", "emotional", "skillful", "clutch", "fails"],
  variety: ["funny", "clutch", "emotional", "fails", "skillful", "educational"],
};

// ── Default voice mode per archetype ──
const ARCHETYPE_VOICE = {
  hype: "hype",
  competitive: "chill",
  chill: "chill",
  variety: "hype",
};

// ── Shared styles ──
const stepDot = (active) => ({
  width: 8, height: 8, borderRadius: "50%",
  background: active ? T.accent : "rgba(255,255,255,0.15)",
  transition: "background 0.2s",
});

const skipLink = {
  background: "none", border: "none", color: T.textTertiary, fontSize: 13,
  cursor: "pointer", fontFamily: T.font, padding: "8px 0",
  transition: "color 0.15s",
};

const navBtn = (variant) => ({
  padding: "10px 28px", borderRadius: T.radius.md, fontSize: 14, fontWeight: 600,
  cursor: "pointer", fontFamily: T.font, border: "none", transition: "all 0.15s",
  ...(variant === "primary"
    ? { background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`, color: "#fff", boxShadow: "0 2px 12px rgba(139,92,246,0.3)" }
    : { background: "rgba(255,255,255,0.06)", color: T.textSecondary }),
});

export default function OnboardingView({ onComplete }) {
  const [step, setStep] = useState(0);

  // Step 1 state
  const [archetype, setArchetype] = useState(null);

  // Step 2 state — initialized when moving to step 2
  const [moments, setMoments] = useState(ARCHETYPE_MOMENT_ORDER.variety);

  // Step 3 state
  const [description, setDescription] = useState("");
  const [voiceMode, setVoiceMode] = useState("hype");

  // Safety fallback: track that wizard was shown
  const wizardShown = useRef(false);
  wizardShown.current = true;

  const handleSkip = () => {
    finishOnboarding({
      archetype: "variety",
      description: "",
      signaturePhrases: [],
      momentPriorities: [...ARCHETYPE_MOMENT_ORDER.variety],
      voiceMode: "hype",
    });
  };

  const handleNext = () => {
    if (step === 0) {
      // Moving from archetype to moments — pre-populate order
      const selected = archetype || "variety";
      setMoments([...ARCHETYPE_MOMENT_ORDER[selected]]);
      setVoiceMode(ARCHETYPE_VOICE[selected]);
      setStep(1);
    } else if (step === 1) {
      setStep(2);
    }
  };

  const handleFinish = () => {
    finishOnboarding({
      archetype: archetype || "variety",
      description: description.trim(),
      signaturePhrases: [],
      momentPriorities: [...moments],
      voiceMode,
    });
  };

  const finishOnboarding = async (profile) => {
    try {
      if (window.clipflow?.storeSet) {
        await window.clipflow.storeSet("creatorProfile", profile);
        await window.clipflow.storeSet("onboardingComplete", true);
      }
    } catch (e) {
      console.error("Failed to save onboarding profile:", e);
    }
    // Always proceed — don't trap user if store write fails
    onComplete(profile);
  };

  const moveMoment = (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= moments.length) return;
    const next = [...moments];
    [next[index], next[target]] = [next[target], next[index]];
    setMoments(next);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: T.bg, display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: T.font, color: T.text,
    }}>
      <div style={{ width: 520, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, margin: "0 auto 16px",
            background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, boxShadow: "0 4px 20px rgba(139,92,246,0.35)",
          }}>
            &#9889;
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.3px" }}>
            {step === 0 && "What's your content vibe?"}
            {step === 1 && "What moments matter most?"}
            {step === 2 && "Describe your style"}
          </h1>
          <p style={{ color: T.textSecondary, fontSize: 14, margin: "8px 0 0", lineHeight: 1.5 }}>
            {step === 0 && "Pick the style that best matches your content. This helps ClipFlow find the right moments."}
            {step === 1 && "Drag to reorder. Top = highest priority for clip detection."}
            {step === 2 && "Optional. Tell ClipFlow about your streaming personality."}
          </p>
        </div>

        {/* Step content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {step === 0 && <ArchetypeStep archetype={archetype} setArchetype={setArchetype} />}
          {step === 1 && <MomentsStep moments={moments} onMove={moveMoment} />}
          {step === 2 && (
            <PersonalityStep
              description={description} setDescription={setDescription}
              voiceMode={voiceMode} setVoiceMode={setVoiceMode}
            />
          )}
        </div>

        {/* Footer nav */}
        <div style={{ marginTop: 28, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button style={skipLink} onClick={handleSkip}>Skip setup</button>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {[0, 1, 2].map((i) => <div key={i} style={stepDot(i <= step)} />)}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button style={navBtn("secondary")} onClick={() => setStep(step - 1)}>Back</button>
            )}
            {step < 2 ? (
              <button style={navBtn("primary")} onClick={handleNext}>
                {step === 0 && !archetype ? "Next" : "Next"}
              </button>
            ) : (
              <button style={navBtn("primary")} onClick={handleFinish}>Finish</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Archetype Picker ──
function ArchetypeStep({ archetype, setArchetype }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {ARCHETYPES.map((a) => {
        const selected = archetype === a.id;
        const isHover = hovered === a.id;
        return (
          <Card
            key={a.id}
            onClick={() => setArchetype(a.id)}
            borderColor={selected ? a.color : isHover ? T.borderHover : T.border}
            style={{
              padding: "20px 18px",
              background: selected ? `${a.color}12` : isHover ? T.surfaceHover : T.surface,
              transition: "all 0.15s",
              position: "relative",
            }}
          >
            <div
              onMouseEnter={() => setHovered(a.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}
            >
              {selected && (
                <div style={{
                  position: "absolute", top: 12, right: 12, width: 22, height: 22,
                  borderRadius: "50%", background: a.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
              <div style={{
                fontSize: 16, fontWeight: 700, color: selected ? a.color : T.text,
                marginBottom: 6, transition: "color 0.15s",
              }}>
                {a.label}
              </div>
              <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.4 }}>
                {a.subtitle}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── Step 2: Moment Priority Ranking ──
function MomentsStep({ moments, onMove }) {
  const [hovered, setHovered] = useState(null);

  const arrowBtn = (disabled) => ({
    background: "none", border: "none", padding: "2px 6px",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.15 : 0.5,
    fontSize: 16, color: T.text, lineHeight: 1,
    transition: "opacity 0.15s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {moments.map((id, i) => {
        const m = MOMENT_TYPES[id];
        if (!m) return null;
        const isHover = hovered === id;
        return (
          <div
            key={id}
            onMouseEnter={() => setHovered(id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px", borderRadius: T.radius.md,
              background: isHover ? T.surfaceHover : T.surface,
              border: `1px solid ${isHover ? T.borderHover : T.border}`,
              transition: "all 0.15s",
            }}
          >
            {/* Rank number */}
            <div style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
              background: i === 0 ? T.accentDim : "rgba(255,255,255,0.04)",
              border: `1px solid ${i === 0 ? T.accentBorder : T.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: i === 0 ? T.accent : T.textSecondary,
              fontFamily: T.mono,
            }}>
              {i + 1}
            </div>

            {/* Label + description */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{m.label}</div>
              <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 2 }}>{m.desc}</div>
            </div>

            {/* Up/Down arrows */}
            <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
              <button style={arrowBtn(i === 0)} onClick={() => onMove(i, -1)} disabled={i === 0}>
                &#9650;
              </button>
              <button style={arrowBtn(i === moments.length - 1)} onClick={() => onMove(i, 1)} disabled={i === moments.length - 1}>
                &#9660;
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Step 3: Personality Description + Voice Mode ──
function PersonalityStep({ description, setDescription, voiceMode, setVoiceMode }) {
  const voiceOptions = [
    { id: "hype", label: "Hype", desc: "Punchy, exclamatory titles" },
    { id: "chill", label: "Chill", desc: "Conversational, understated titles" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Description */}
      <div>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          Tell ClipFlow about your streaming personality
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g., I play shooters terribly on purpose and scream a lot, or I do chill commentary and explain what is going on"
          style={{
            width: "100%", minHeight: 100, resize: "vertical", boxSizing: "border-box",
            background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`,
            borderRadius: T.radius.md, padding: "12px 14px", color: T.text,
            fontSize: 13, fontFamily: T.font, lineHeight: 1.5, outline: "none",
          }}
        />
        <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 6 }}>
          This helps the AI understand what kind of moments to look for. You can always change this later in Settings.
        </div>
      </div>

      {/* Voice mode */}
      <div>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          Default title style
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          {voiceOptions.map((v) => {
            const selected = voiceMode === v.id;
            return (
              <div
                key={v.id}
                onClick={() => setVoiceMode(v.id)}
                style={{
                  flex: 1, padding: "14px 16px", borderRadius: T.radius.md,
                  background: selected ? T.accentDim : T.surface,
                  border: `1px solid ${selected ? T.accentBorder : T.border}`,
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: selected ? T.accent : T.text }}>
                  {v.label}
                </div>
                <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>
                  {v.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
