import React, { useState, useEffect, useRef } from "react";
import T from "../styles/theme";

// ============ CONSTANTS ============
const COLOR_PRESETS = [
  "#ff6b35", "#00b4d8", "#ff4655", "#ffd23f", "#fca311",
  "#06d6a0", "#9b5de5", "#ff6eb4", "#4cc9f0", "#80ed99",
];

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// ============ SUBCOMPONENTS ============
const PulseDot = ({ color = T.green, size = 8 }) => (
  <span style={{ position: "relative", display: "inline-block", width: size, height: size }}>
    <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color }} />
  </span>
);

const GamePill = ({ tag, color, size = "md" }) => {
  const s = size === "sm" ? { px: 6, py: 2, fs: 9 } : { px: 10, py: 4, fs: 11 };
  return (
    <span
      style={{
        display: "inline-flex",
        padding: `${s.py}px ${s.px}px`,
        background: `${color}18`,
        border: `1px solid ${color}44`,
        borderRadius: 6,
        fontSize: s.fs,
        fontWeight: 700,
        color,
        fontFamily: T.mono,
        letterSpacing: "1px",
      }}
    >
      {tag}
    </span>
  );
};

const Card = ({ children, style: x, onClick, borderColor }) => (
  <div
    onClick={onClick}
    style={{
      background: T.surface,
      borderRadius: T.radius.lg,
      border: `1px solid ${borderColor || T.border}`,
      cursor: onClick ? "pointer" : "default",
      ...x,
    }}
  >
    {children}
  </div>
);

const MiniSpinbox = ({ value, onChange, min = 1, max = 999, label }) => {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(String(value));
  const timerRef = useRef(null);
  const intRef = useRef(null);
  const valRef = useRef(value);

  useEffect(() => {
    valRef.current = value;
    setEditVal(String(value));
  }, [value]);

  const startHold = (d) => {
    const step = () => {
      valRef.current = Math.max(min, Math.min(max, valRef.current + d));
      onChange(valRef.current);
    };
    step();
    timerRef.current = setTimeout(() => {
      intRef.current = setInterval(step, 80);
    }, 350);
  };

  const stopHold = () => {
    clearTimeout(timerRef.current);
    clearInterval(intRef.current);
  };

  const commitEdit = () => {
    const n = parseInt(editVal);
    if (!isNaN(n) && n >= min && n <= max) onChange(n);
    setEditing(false);
  };

  const btnStyle = {
    width: 28,
    height: 28,
    borderRadius: 6,
    border: `1px solid ${T.border}`,
    background: "rgba(255,255,255,0.03)",
    color: T.textSecondary,
    fontSize: 14,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: T.font,
    userSelect: "none",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {label && (
        <span style={{ color: T.textTertiary, fontSize: 11, fontWeight: 600, marginRight: 4 }}>
          {label}
        </span>
      )}
      <button onMouseDown={() => startHold(-1)} onMouseUp={stopHold} onMouseLeave={stopHold} style={btnStyle}>
        −
      </button>
      {editing ? (
        <input
          value={editVal}
          onChange={(e) => setEditVal(e.target.value.replace(/\D/g, ""))}
          onBlur={commitEdit}
          onKeyDown={(e) => e.key === "Enter" && commitEdit()}
          autoFocus
          style={{
            width: 42,
            textAlign: "center",
            background: "rgba(255,255,255,0.06)",
            border: `1px solid ${T.accentBorder}`,
            borderRadius: 6,
            padding: 4,
            color: T.text,
            fontSize: 14,
            fontWeight: 700,
            fontFamily: T.mono,
            outline: "none",
          }}
        />
      ) : (
        <div
          onClick={() => {
            setEditing(true);
            setEditVal(String(value));
          }}
          style={{
            width: 36,
            textAlign: "center",
            color: T.text,
            fontSize: 14,
            fontWeight: 700,
            fontFamily: T.mono,
            cursor: "text",
            padding: "4px 0",
          }}
        >
          {value}
        </div>
      )}
      <button onMouseDown={() => startHold(1)} onMouseUp={stopHold} onMouseLeave={stopHold} style={btnStyle}>
        +
      </button>
    </div>
  );
};

// ============ ADD GAME MODAL ============
const AddGameModal = ({ onConfirm, onClose }) => {
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [hashtag, setHashtag] = useState("");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [hex, setHex] = useState(COLOR_PRESETS[0]);
  const [hue, setHue] = useState(12);
  const [phase, setPhase] = useState("form"); // "form" | "generating" | "success"

  const today = new Date().toISOString().slice(0, 10);
  const previewName = `${today} ${tag.toUpperCase() || "TAG"} Day1 Pt1.mp4`;

  const handlePresetClick = (preset) => {
    setColor(preset);
    setHex(preset);
  };

  const handleHueChange = (val) => {
    const h = parseInt(val);
    setHue(h);
    const newHex = hslToHex(h, 80, 60);
    setColor(newHex);
    setHex(newHex);
  };

  const handleHexInput = (val) => {
    setHex(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      setColor(val);
    }
  };

  const canConfirm = name.trim().length > 0 && tag.trim().length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    setPhase("generating");
    setTimeout(() => {
      setPhase("success");
      setTimeout(() => {
        onConfirm({
          name: name.trim(),
          tag: tag.trim().toUpperCase(),
          exe: [],
          color,
          dayCount: 0,
          hashtag: hashtag.trim().toLowerCase() || name.trim().toLowerCase().replace(/\s+/g, ""),
        });
        onClose();
      }, 1000);
    }, 1500);
  };

  const overlayStyle = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const modalStyle = {
    width: 480,
    background: T.surface,
    borderRadius: T.radius.xl,
    border: `1px solid ${T.border}`,
    padding: 28,
    boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
  };

  const inputStyle = {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${T.border}`,
    borderRadius: T.radius.md,
    padding: "10px 14px",
    color: T.text,
    fontSize: 14,
    fontFamily: T.font,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle = {
    color: T.textSecondary,
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 6,
    display: "block",
  };

  if (phase === "generating") {
    return (
      <div style={overlayStyle}>
        <div style={{ ...modalStyle, textAlign: "center", padding: "48px 28px" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✨</div>
          <div style={{ color: T.text, fontSize: 16, fontWeight: 700 }}>Adding {name}...</div>
          <div style={{ color: T.textSecondary, fontSize: 13, marginTop: 8 }}>Setting up game data</div>
        </div>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div style={overlayStyle}>
        <div style={{ ...modalStyle, textAlign: "center", padding: "48px 28px" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
          <div style={{ color: T.green, fontSize: 16, fontWeight: 700 }}>{name} added!</div>
          <div style={{
            display: "inline-flex",
            marginTop: 12,
            padding: "4px 12px",
            background: `${color}18`,
            border: `1px solid ${color}44`,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            color,
            fontFamily: T.mono,
            letterSpacing: "1px",
          }}>
            {tag.toUpperCase()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Add Game</div>
            <div style={{ color: T.textSecondary, fontSize: 13, marginTop: 2 }}>Configure a new game for renaming</div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              background: "transparent",
              color: T.textSecondary,
              fontSize: 20,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: T.font,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Name + Tag row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Game Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Arc Raiders"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>
              Tag <span style={{ color: T.textTertiary, fontWeight: 400 }}>(max 4)</span>
            </label>
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value.slice(0, 4))}
              placeholder="AR"
              style={{ ...inputStyle, fontFamily: T.mono, textTransform: "uppercase", letterSpacing: "1px" }}
            />
          </div>
        </div>

        {/* Hashtag */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>
            Hashtag <span style={{ color: T.textTertiary, fontWeight: 400 }}>(optional)</span>
          </label>
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: T.textTertiary,
              fontSize: 14,
              fontFamily: T.mono,
              pointerEvents: "none",
            }}>
              #
            </span>
            <input
              value={hashtag}
              onChange={(e) => setHashtag(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())}
              placeholder="arcraiders"
              style={{ ...inputStyle, paddingLeft: 28 }}
            />
          </div>
        </div>

        {/* Color picker */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Color</label>
          {/* Presets */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {COLOR_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => handlePresetClick(p)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: p,
                  border: color === p ? `2px solid ${T.text}` : "2px solid transparent",
                  cursor: "pointer",
                  padding: 0,
                  outline: "none",
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
          {/* Hue slider */}
          <input
            type="range"
            min={0}
            max={360}
            value={hue}
            onChange={(e) => handleHueChange(e.target.value)}
            style={{
              width: "100%",
              height: 10,
              borderRadius: 5,
              appearance: "none",
              background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
              cursor: "pointer",
              outline: "none",
              marginBottom: 10,
              display: "block",
            }}
          />
          {/* Hex input + swatch */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: color,
              border: `1px solid ${T.border}`,
              flexShrink: 0,
            }} />
            <input
              value={hex}
              onChange={(e) => handleHexInput(e.target.value)}
              placeholder="#ff6b35"
              style={{ ...inputStyle, fontFamily: T.mono, fontSize: 13 }}
            />
          </div>
        </div>

        {/* Preview */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: `1px solid ${T.border}`,
          borderRadius: T.radius.md,
          padding: "12px 16px",
          marginBottom: 24,
        }}>
          <div style={{
            color: T.textTertiary,
            fontSize: 11,
            fontWeight: 600,
            marginBottom: 4,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}>
            Preview
          </div>
          <div style={{ color: T.yellow, fontFamily: T.mono, fontSize: 13, fontWeight: 700 }}>
            {previewName}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px 0",
              borderRadius: T.radius.md,
              border: `1px solid ${T.border}`,
              background: "transparent",
              color: T.textSecondary,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: T.font,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              flex: 2,
              padding: "12px 0",
              borderRadius: T.radius.md,
              border: "none",
              background: canConfirm
                ? `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`
                : "rgba(255,255,255,0.04)",
              color: canConfirm ? "#fff" : T.textMuted,
              fontSize: 14,
              fontWeight: 700,
              cursor: canConfirm ? "pointer" : "default",
              fontFamily: T.font,
              boxShadow: canConfirm ? "0 4px 20px rgba(139,92,246,0.3)" : "none",
            }}
          >
            Add Game
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ RENAME VIEW ============
export default function RenameView({ gamesDb, onAddGame }) {
  const [watchFolder, setWatchFolder] = useState(
    "W:\\YouTube Gaming Recordings Onward\\Vertical Recordings Onwards"
  );
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [subTab, setSubTab] = useState("pending");
  const [renaming, setRenaming] = useState(false);
  const [renameDone, setRenameDone] = useState(false);
  const [showAddGame, setShowAddGame] = useState(false);

  // Try to connect to real file system via Electron bridge
  const isElectron = typeof window !== "undefined" && window.clipflow;

  useEffect(() => {
    if (isElectron) {
      // Start file watcher
      window.clipflow.startWatching(watchFolder);
      window.clipflow.onFileAdded((file) => {
        setPending((prev) => {
          // Don't add duplicates
          if (prev.find((p) => p.fileName === file.name)) return prev;
          // Auto-detect game from filename patterns or default
          const detected = detectGame(file.name, gamesDb);
          return [
            ...prev,
            {
              id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              fileName: file.name,
              filePath: file.path,
              game: detected.game,
              tag: detected.tag,
              color: detected.color,
              day: detected.day,
              part: prev.filter((p) => p.tag === detected.tag && p.day === detected.day).length + 1,
              createdAt: file.createdAt,
            },
          ];
        });
      });

      return () => {
        window.clipflow.removeFileListeners();
      };
    }
  }, [watchFolder, isElectron, gamesDb]);

  const detectGame = (fileName, games) => {
    // Default — in production, OBS log parser provides the exe
    const defaultGame = games[0] || { name: "Unknown", tag: "??", color: "#888", dayCount: 1 };
    return {
      game: defaultGame.name,
      tag: defaultGame.tag,
      color: defaultGame.color,
      day: defaultGame.dayCount + 1,
    };
  };

  const getProposed = (r) => `${r.fileName.slice(0, 10)} ${r.tag} Day${r.day} Pt${r.part}.mp4`;

  const updatePending = (id, field, value) => {
    setPending((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const u = { ...r, [field]: value };
        if (field === "game") {
          const g = gamesDb.find((x) => x.name === value);
          if (g) {
            u.tag = g.tag;
            u.color = g.color;
          }
        }
        return u;
      })
    );
  };

  const renameOne = async (id) => {
    const r = pending.find((x) => x.id === id);
    if (!r) return;

    const newName = getProposed(r);

    // Real rename via Electron
    if (isElectron && r.filePath) {
      const dir = r.filePath.substring(0, r.filePath.lastIndexOf("\\"));
      const monthFolder = r.fileName.slice(0, 7); // "2026-03"
      const targetDir = `${dir}\\${monthFolder}`;
      const newPath = `${targetDir}\\${newName}`;
      const result = await window.clipflow.renameFile(r.filePath, newPath);
      if (result.error) {
        console.error("Rename failed:", result.error);
        return;
      }
    }

    setHistory((prev) => [
      {
        id: `h-${Date.now()}`,
        oldName: r.fileName,
        newName,
        game: r.game,
        tag: r.tag,
        color: r.color,
        day: r.day,
        part: r.part,
        time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        undone: false,
      },
      ...prev,
    ]);
    setPending((prev) => prev.filter((x) => x.id !== id));
  };

  const hideOne = (id) => setPending((prev) => prev.filter((x) => x.id !== id));

  // Auto-correct duplicate names then rename all
  const renameAll = async () => {
    setRenaming(true);

    // Sort by creation time
    const sorted = [...pending].sort(
      (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
    );

    // Group by tag+day to detect duplicates
    const groups = {};
    sorted.forEach((r) => {
      const key = `${r.tag}-Day${r.day}`;
      if (!groups[key]) groups[key] = { minPart: r.part, items: [] };
      groups[key].items.push(r);
      if (r.part < groups[key].minPart) groups[key].minPart = r.part;
    });

    // Auto-correct: assign sequential parts within each group
    const corrected = [];
    for (const g of Object.values(groups)) {
      for (let idx = 0; idx < g.items.length; idx++) {
        const r = g.items[idx];
        const part = g.items.length > 1 ? g.minPart + idx : r.part;
        const newName = `${r.fileName.slice(0, 10)} ${r.tag} Day${r.day} Pt${part}.mp4`;

        // Real rename
        if (isElectron && r.filePath) {
          const dir = r.filePath.substring(0, r.filePath.lastIndexOf("\\"));
          const monthFolder = r.fileName.slice(0, 7);
          const targetDir = `${dir}\\${monthFolder}`;
          const newPath = `${targetDir}\\${newName}`;
          await window.clipflow.renameFile(r.filePath, newPath);
        }

        corrected.push({
          id: `h-${Date.now()}-${r.id}`,
          oldName: r.fileName,
          newName,
          game: r.game,
          tag: r.tag,
          color: r.color,
          day: r.day,
          part,
          time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
          undone: false,
        });
      }
    }

    setHistory((prev) => [...corrected, ...prev]);
    setPending([]);
    setRenaming(false);
    setRenameDone(true);
    setTimeout(() => setRenameDone(false), 3000);
  };

  const toggleUndo = (h) => {
    if (!h.undone) {
      setPending((prev) => [
        ...prev,
        {
          id: `r-undo-${h.id}`,
          fileName: h.oldName,
          game: h.game,
          tag: h.tag,
          color: h.color,
          day: h.day || 1,
          part: h.part || 1,
          detectedExe: "",
        },
      ]);
    } else {
      setPending((prev) => prev.filter((r) => r.id !== `r-undo-${h.id}`));
    }
    setHistory((prev) => prev.map((x) => (x.id === h.id ? { ...x, undone: !x.undone } : x)));
  };

  const refresh = () => {
    if (isElectron) {
      // Re-trigger watcher scan
      window.clipflow.stopWatching().then(() => {
        window.clipflow.startWatching(watchFolder);
      });
    }
  };

  const tabs = [
    { id: "pending", label: "Pending", count: pending.length },
    { id: "history", label: "History", count: history.length },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.6px" }}>
              Rename
            </h2>
            <p style={{ color: T.textSecondary, fontSize: 14, margin: "6px 0 0" }}>
              OBS recordings → structured names
            </p>
          </div>
          <button
            onClick={refresh}
            style={{
              padding: "8px 14px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.border}`,
              background: "rgba(255,255,255,0.03)",
              color: T.textSecondary,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: T.font,
            }}
          >
            🔄 Refresh
          </button>
          <button
            onClick={() => setShowAddGame(true)}
            style={{
              padding: "8px 14px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.accentBorder}`,
              background: T.accentDim,
              color: T.accentLight,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: T.font,
            }}
          >
            ✨ Add Game
          </button>
        </div>
      </div>

      {/* Watch status */}
      <Card
        style={{
          padding: "16px 20px",
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PulseDot />
          <span style={{ color: T.green, fontSize: 13, fontWeight: 600 }}>WATCHING</span>
          <span
            style={{
              color: T.textMuted,
              fontSize: 11,
              fontFamily: T.mono,
              maxWidth: 300,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {watchFolder}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <PulseDot color={T.cyan} />
          <span style={{ color: T.cyan, fontSize: 12, fontWeight: 600 }}>OBS LOG</span>
        </div>
      </Card>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
        {[
          { l: "Total", v: "—", c: T.text },
          { l: "Today", v: String(pending.length), c: T.green },
          { l: "Games", v: String(gamesDb.length), c: T.accent },
          { l: "Day", v: "—", c: T.yellow },
        ].map((s) => (
          <Card key={s.l} style={{ padding: 14, textAlign: "center" }}>
            <div style={{ color: s.c, fontSize: 24, fontWeight: 800, fontFamily: T.mono }}>{s.v}</div>
            <div
              style={{
                color: T.textTertiary,
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginTop: 4,
              }}
            >
              {s.l}
            </div>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.03)", borderRadius: T.radius.md, padding: 4 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: subTab === t.id ? "rgba(255,255,255,0.07)" : "transparent",
              color: subTab === t.id ? T.text : T.textTertiary,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: T.font,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {t.label}
            <span
              style={{
                background: subTab === t.id ? T.accentDim : "rgba(255,255,255,0.04)",
                color: subTab === t.id ? T.accentLight : T.textTertiary,
                padding: "2px 8px",
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ marginTop: 16 }}>
        {subTab === "pending" && (
          <>
            {pending.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pending.map((r) => (
                  <Card key={r.id} style={{ padding: "18px 20px" }} borderColor={`${r.color}44`}>
                    <div style={{ color: T.textTertiary, fontSize: 12, fontFamily: T.mono, marginBottom: 8 }}>
                      {r.fileName}
                    </div>
                    <div
                      style={{
                        color: T.yellow,
                        fontSize: 16,
                        fontWeight: 700,
                        fontFamily: T.mono,
                        marginBottom: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span style={{ color: T.textMuted }}>→</span>
                      {getProposed(r)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <GamePill tag={r.tag} color={r.color} size="sm" />
                        <select
                          value={r.game}
                          onChange={(e) => updatePending(r.id, "game", e.target.value)}
                          style={{
                            background: T.surface,
                            border: `1px solid ${T.border}`,
                            borderRadius: T.radius.md,
                            padding: "8px 12px",
                            color: T.text,
                            fontSize: 13,
                            fontFamily: T.font,
                            outline: "none",
                            cursor: "pointer",
                            minWidth: 140,
                          }}
                        >
                          {gamesDb.map((g) => (
                            <option key={g.name} value={g.name} style={{ background: T.surface, color: T.text }}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <MiniSpinbox label="Day" value={r.day} onChange={(v) => updatePending(r.id, "day", v)} />
                      <MiniSpinbox label="Pt" value={r.part} onChange={(v) => updatePending(r.id, "part", v)} />
                      <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                        <button
                          onClick={() => renameOne(r.id)}
                          style={{
                            padding: "8px 14px",
                            borderRadius: 8,
                            border: "none",
                            background: T.greenDim,
                            color: T.green,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: T.font,
                          }}
                        >
                          RENAME
                        </button>
                        <button
                          onClick={() => hideOne(r.id)}
                          style={{
                            padding: "8px 14px",
                            borderRadius: 8,
                            border: "none",
                            background: T.redDim,
                            color: T.red,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: T.font,
                          }}
                        >
                          HIDE
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
                <button
                  onClick={renameAll}
                  disabled={renaming}
                  style={{
                    width: "100%",
                    padding: "16px 24px",
                    borderRadius: T.radius.md,
                    border: "none",
                    background: renaming
                      ? "rgba(255,255,255,0.04)"
                      : `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
                    color: renaming ? T.textMuted : "#fff",
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: T.font,
                    cursor: renaming ? "default" : "pointer",
                    boxShadow: renaming ? "none" : "0 4px 24px rgba(139,92,246,0.3)",
                  }}
                >
                  {renaming ? "Renaming..." : `Rename All ${pending.length} Files`}
                </button>
              </div>
            ) : (
              <Card style={{ padding: "40px 20px", textAlign: "center" }}>
                {renameDone ? (
                  <>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                    <div style={{ color: T.green, fontSize: 16, fontWeight: 700 }}>All files renamed!</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>📁</div>
                    <div style={{ color: T.textTertiary, fontSize: 14 }}>
                      No pending files — watching for new recordings...
                    </div>
                  </>
                )}
              </Card>
            )}
          </>
        )}

        {subTab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {history.length === 0 ? (
              <Card style={{ padding: 40, textAlign: "center" }}>
                <div style={{ color: T.textTertiary }}>No rename history yet</div>
              </Card>
            ) : (
              history.map((h) => (
                <Card key={h.id} style={{ padding: "14px 18px", opacity: h.undone ? 0.45 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <GamePill tag={h.tag} color={h.color} size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          color: T.textTertiary,
                          fontSize: 12,
                          fontFamily: T.mono,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h.oldName}
                      </div>
                      <div
                        style={{
                          color: h.undone ? T.red : T.green,
                          fontSize: 14,
                          fontWeight: 600,
                          fontFamily: T.mono,
                          marginTop: 2,
                          textDecoration: h.undone ? "line-through" : "none",
                        }}
                      >
                        {h.newName}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleUndo(h)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 8,
                        border: `1px solid ${h.undone ? T.greenBorder : T.yellowBorder}`,
                        background: h.undone ? T.greenDim : T.yellowDim,
                        color: h.undone ? T.green : T.yellow,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: T.font,
                      }}
                    >
                      {h.undone ? "REDO" : "UNDO"}
                    </button>
                    <span style={{ color: T.textMuted, fontSize: 11, fontFamily: T.mono, flexShrink: 0 }}>
                      {h.time}
                    </span>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      {/* Info banner */}
      <div
        style={{
          marginTop: 16,
          background: T.yellowDim,
          border: `1px solid ${T.yellowBorder}`,
          borderRadius: T.radius.md,
          padding: "14px 18px",
        }}
      >
        <p style={{ color: T.yellow, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          ⚠️ Files are never auto-renamed. Review game, day & part, then hit Rename.
        </p>
      </div>

      {/* Add Game Modal */}
      {showAddGame && (
        <AddGameModal
          onConfirm={(game) => {
            if (onAddGame) onAddGame(game);
          }}
          onClose={() => setShowAddGame(false)}
        />
      )}
    </div>
  );
}
