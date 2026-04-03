import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import T from "../styles/theme";
import { Card, PageHeader, SectionLabel, Select, InfoBanner } from "../components/shared";

const DAY_NAMES = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS_2026 = Array.from({ length: 12 }, (_, i) => ({ value: `2026-${String(i + 1).padStart(2, "0")}`, label: new Date(2026, i, 1).toLocaleString("en-US", { month: "long", year: "numeric" }) }));

const getWeekDates = (refDate) => {
  const d = new Date(refDate);
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return DAY_NAMES.map((name, i) => {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    return { dayName: name, iso: x.toISOString().split("T")[0], label: `${x.toLocaleString("en-US", { month: "short" })} ${x.getDate()}` };
  });
};
const getWeekLabel = (refDate) => { const wd = getWeekDates(refDate); return `${wd[0].label} – ${wd[5].label}`; };

// Parse a time slot string like "3:30 PM" into total minutes since midnight
const parseTimeToMinutes = (s) => {
  const [t, ap] = s.split(" ");
  let [h, m] = t.split(":").map(Number);
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + m;
};

// Sort a template's time slots chronologically, reordering grid columns to match
const sortTemplateByTime = (tmpl) => {
  const indices = tmpl.timeSlots.map((s, i) => ({ s, i, m: parseTimeToMinutes(s) }));
  indices.sort((a, b) => a.m - b.m);
  return {
    timeSlots: indices.map((x) => x.s),
    grid: Object.fromEntries(DAY_NAMES.map((day) => [day, indices.map((x) => tmpl.grid[day][x.i])])),
  };
};

export default function TrackerView({
  mainGame, mainGameTag, trackerData, setTrackerData,
  weeklyTemplate, setWeeklyTemplate, weekTemplateOverrides, setWeekTemplateOverrides,
  savedTemplates, setSavedTemplates, gamesDb,
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthJump, setMonthJump] = useState("");
  const [editTmpl, setEditTmpl] = useState(false);
  const fileRef = useRef(null);
  const popoverRef = useRef(null);
  const [popover, setPopover] = useState(null);
  const [popPos, setPopPos] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [editSnapshot, setEditSnapshot] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [dragRow, setDragRow] = useState(null);
  const [dragOverRow, setDragOverRow] = useState(null);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [showPresetDrop, setShowPresetDrop] = useState(false);
  const presetDropRef = useRef(null);
  const [editingTimeSlot, setEditingTimeSlot] = useState(null);
  const [timeSlotVal, setTimeSlotVal] = useState("");
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [newSlotVal, setNewSlotVal] = useState("");

  const refDate = new Date();
  refDate.setDate(refDate.getDate() + weekOffset * 7);
  const wd = getWeekDates(refDate);
  const mondayIso = wd[0].iso;
  const effectiveTemplate = weekTemplateOverrides?.[mondayIso] || weeklyTemplate;
  const hasOverride = !!(weekTemplateOverrides?.[mondayIso]);
  const wIsos = new Set(wd.map((d) => d.iso));
  const wEntries = trackerData.filter((e) => wIsos.has(e.date));
  const slotFilled = (iso, si) => wEntries.find((e) => e.date === iso && e.time && e.time.replace(/\s/g, "") === effectiveTemplate.timeSlots[si].replace(/\s/g, ""));
  const mw = wEntries.filter((e) => e.type === "main").length;
  const ow = wEntries.filter((e) => e.type === "other").length;

  const totalActiveCells = effectiveTemplate.timeSlots.reduce((acc, _, si) => {
    return acc + DAY_NAMES.reduce((a, day) => a + (effectiveTemplate.grid[day]?.[si] !== null ? 1 : 0), 0);
  }, 0);

  const currentPresetName = (() => {
    if (!hasOverride) return "Default";
    const match = (savedTemplates || []).find((p) => JSON.stringify(p.template) === JSON.stringify(effectiveTemplate));
    return match ? match.name : "Custom";
  })();

  // Resolve game display info from a hashtag
  const resolveGameDisplay = (hashtag) => {
    const g = gamesDb.find((x) => x.hashtag === hashtag);
    return g ? { name: g.name, color: g.color, tag: g.tag } : { name: hashtag, color: T.textMuted, tag: hashtag };
  };

  // Log a manual tracker entry
  const logManualEntry = (iso, dayName, si, game) => {
    setTrackerData((p) => [...p, {
      date: iso,
      day: dayName,
      time: effectiveTemplate.timeSlots[si],
      title: "Manual entry",
      game: game.hashtag,
      type: game.hashtag === mainGameTag ? "main" : "other",
      platforms: "Manual",
      mainGameAtTime: mainGame,
      source: "manual",
    }]);
  };

  // Remove a tracker entry
  const removeTrackerEntry = (entry) => {
    setTrackerData((p) => p.filter((e) => !(e.date === entry.date && e.time === entry.time && e.game === entry.game)));
    setPopover(null);
  };

  const toggleCell = (di, si) => {
    if (!editTmpl) return;
    pushUndo();
    setWeekTemplateOverrides((prev) => {
      const current = prev[mondayIso] || JSON.parse(JSON.stringify(weeklyTemplate));
      const updated = JSON.parse(JSON.stringify(current));
      const val = updated.grid[DAY_NAMES[di]][si];
      if (val === null) {
        updated.grid[DAY_NAMES[di]][si] = "main";
      } else {
        updated.grid[DAY_NAMES[di]][si] = val === "main" ? "other" : "main";
      }
      return { ...prev, [mondayIso]: updated };
    });
  };

  const removeCell = (di, si) => {
    pushUndo();
    setWeekTemplateOverrides((prev) => {
      const current = prev[mondayIso] || JSON.parse(JSON.stringify(weeklyTemplate));
      const updated = JSON.parse(JSON.stringify(current));
      updated.grid[DAY_NAMES[di]][si] = null;
      return { ...prev, [mondayIso]: updated };
    });
  };

  const handleCellClick = (di, si, e) => {
    if (editTmpl) { toggleCell(di, si); return; }
    const d = wd[di];
    const tmpl = effectiveTemplate.grid[d.dayName]?.[si] || "main";
    const isM = tmpl === "main";
    const fl = slotFilled(d.iso, si);
    const rect = e.currentTarget.getBoundingClientRect();

    if (fl) {
      setPopover({ di, si, iso: d.iso, dayName: d.dayName, type: "info", entry: fl, rect });
    } else if (isM) {
      const mainG = gamesDb.find((g) => g.hashtag === mainGameTag);
      if (mainG) logManualEntry(d.iso, d.dayName, si, mainG);
    } else {
      setPopover({ di, si, iso: d.iso, dayName: d.dayName, type: "pick", rect });
    }
  };

  // Close popover on Escape / click-outside
  useEffect(() => {
    if (!popover) return;
    const onKey = (e) => { if (e.key === "Escape") setPopover(null); };
    const onClick = (e) => { if (popoverRef.current && !popoverRef.current.contains(e.target)) setPopover(null); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [popover]);

  useEffect(() => { setPopover(null); }, [weekOffset]);

  useLayoutEffect(() => {
    if (!popover || !popoverRef.current) { setPopPos(null); return; }
    const el = popoverRef.current;
    const pr = popover.rect;
    const { width: popW, height: popH } = el.getBoundingClientRect();
    const viewH = window.innerHeight;
    const viewW = window.innerWidth;
    const showAbove = pr.bottom + popH + 8 > viewH;
    const left = Math.max(8, Math.min(pr.left + pr.width / 2 - popW / 2, viewW - popW - 8));
    const top = showAbove ? Math.max(8, pr.top - popH - 6) : pr.bottom + 6;
    setPopPos({ left, top });
  }, [popover]);

  useEffect(() => {
    if (!showPresetDrop) return;
    const onClick = (e) => { if (presetDropRef.current && !presetDropRef.current.contains(e.target)) setShowPresetDrop(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showPresetDrop]);

  // Time slot editing
  const editTimeSlot = (si, newTime) => {
    if (!newTime.trim()) return;
    pushUndo();
    setWeekTemplateOverrides((prev) => {
      const current = prev[mondayIso] || JSON.parse(JSON.stringify(weeklyTemplate));
      const updated = JSON.parse(JSON.stringify(current));
      updated.timeSlots[si] = newTime.trim();
      const sorted = sortTemplateByTime(updated);
      return { ...prev, [mondayIso]: sorted };
    });
    setEditingTimeSlot(null);
  };

  const addTimeSlot = (timeStr) => {
    if (!timeStr.trim()) return;
    pushUndo();
    setWeekTemplateOverrides((prev) => {
      const current = prev[mondayIso] || JSON.parse(JSON.stringify(weeklyTemplate));
      const updated = JSON.parse(JSON.stringify(current));
      updated.timeSlots.push(timeStr.trim());
      DAY_NAMES.forEach((day) => { updated.grid[day].push("main"); });
      const sorted = sortTemplateByTime(updated);
      return { ...prev, [mondayIso]: sorted };
    });
    setShowAddSlot(false);
    setNewSlotVal("");
  };

  const removeTimeSlot = (si) => {
    pushUndo();
    setWeekTemplateOverrides((prev) => {
      const current = prev[mondayIso] || JSON.parse(JSON.stringify(weeklyTemplate));
      const updated = JSON.parse(JSON.stringify(current));
      updated.timeSlots.splice(si, 1);
      DAY_NAMES.forEach((day) => { updated.grid[day].splice(si, 1); });
      return { ...prev, [mondayIso]: updated };
    });
  };

  // Template preset handlers
  const setAsDefault = () => {
    setWeeklyTemplate(JSON.parse(JSON.stringify(effectiveTemplate)));
  };
  const savePreset = () => {
    if (!presetName.trim()) return;
    setSavedTemplates((prev) => [...prev, { name: presetName.trim(), template: JSON.parse(JSON.stringify(effectiveTemplate)) }]);
    setPresetName("");
    setShowSaveAs(false);
  };
  const loadPreset = (template) => {
    setWeekTemplateOverrides((prev) => ({ ...prev, [mondayIso]: JSON.parse(JSON.stringify(template)) }));
    setShowPresetDrop(false);
  };
  const clearOverride = () => {
    setWeekTemplateOverrides((prev) => { const n = { ...prev }; delete n[mondayIso]; return n; });
    setShowPresetDrop(false);
  };
  const deletePreset = (idx) => {
    setSavedTemplates((prev) => prev.filter((_, i) => i !== idx));
  };

  const pushUndo = () => {
    const current = weekTemplateOverrides?.[mondayIso] || JSON.parse(JSON.stringify(weeklyTemplate));
    setUndoStack((prev) => [...prev, JSON.parse(JSON.stringify(current))]);
    setRedoStack([]);
  };

  const undoEdit = () => {
    if (undoStack.length === 0) return;
    const prev = [...undoStack];
    const snapshot = prev.pop();
    const current = weekTemplateOverrides?.[mondayIso] || JSON.parse(JSON.stringify(weeklyTemplate));
    setRedoStack((r) => [...r, JSON.parse(JSON.stringify(current))]);
    setUndoStack(prev);
    setWeekTemplateOverrides((o) => ({ ...o, [mondayIso]: snapshot }));
  };

  const redoEdit = () => {
    if (redoStack.length === 0) return;
    const prev = [...redoStack];
    const snapshot = prev.pop();
    const current = weekTemplateOverrides?.[mondayIso] || JSON.parse(JSON.stringify(weeklyTemplate));
    setUndoStack((u) => [...u, JSON.parse(JSON.stringify(current))]);
    setRedoStack(prev);
    setWeekTemplateOverrides((o) => ({ ...o, [mondayIso]: snapshot }));
  };

  const enterEditMode = () => {
    setEditSnapshot(JSON.parse(JSON.stringify(weekTemplateOverrides?.[mondayIso] || weeklyTemplate)));
    setUndoStack([]);
    setRedoStack([]);
    setEditTmpl(true);
  };

  const cancelEdit = () => {
    if (editSnapshot) {
      const snapStr = JSON.stringify(editSnapshot);
      const defaultStr = JSON.stringify(weeklyTemplate);
      if (snapStr === defaultStr) {
        setWeekTemplateOverrides((prev) => {
          const n = { ...prev };
          delete n[mondayIso];
          return n;
        });
      } else {
        setWeekTemplateOverrides((prev) => ({ ...prev, [mondayIso]: editSnapshot }));
      }
    }
    setEditSnapshot(null);
    setUndoStack([]);
    setRedoStack([]);
    setEditTmpl(false);
    setShowSaveAs(false);
  };

  const finishEdit = () => {
    setEditSnapshot(null);
    setUndoStack([]);
    setRedoStack([]);
    setEditTmpl(false);
    setShowSaveAs(false);
  };

  // Drag-to-reorder rows
  const reorderRow = (fromSi, toSi) => {
    if (fromSi === toSi) return;
    pushUndo();
    setWeekTemplateOverrides((prev) => {
      const current = prev[mondayIso] || JSON.parse(JSON.stringify(weeklyTemplate));
      const updated = JSON.parse(JSON.stringify(current));
      const [movedSlot] = updated.timeSlots.splice(fromSi, 1);
      updated.timeSlots.splice(toSi, 0, movedSlot);
      DAY_NAMES.forEach((day) => {
        const [movedCell] = updated.grid[day].splice(fromSi, 1);
        updated.grid[day].splice(toSi, 0, movedCell);
      });
      return { ...prev, [mondayIso]: updated };
    });
  };

  const exportCSV = () => {
    const h = "Date,Day,Time,Title,Game,Type,Platforms,MainGame,Source\n";
    const r = trackerData.map((e) => `${e.date},${e.day},${e.time},"${(e.title || "").replace(/"/g, '""')}",${e.game},${e.type},"${e.platforms || ""}",${e.mainGameAtTime || ""},${e.source || "unknown"}`).join("\n");
    const b = new Blob([h + r], { type: "text/csv" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u;
    a.download = `clipflow-tracker-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(u);
  };

  const importCSV = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = (ev) => {
      const lines = ev.target.result.split("\n").slice(1).filter((l) => l.trim());
      const entries = lines.map((l) => {
        const p = l.match(/(".*?"|[^,]+)/g) || [];
        const c = (s) => (s || "").replace(/^"|"$/g, "").replace(/""/g, '"').trim();
        return { date: c(p[0]), day: c(p[1]), time: c(p[2]), title: c(p[3]), game: c(p[4]), type: c(p[5]), platforms: c(p[6]), mainGameAtTime: c(p[7]), source: c(p[8]) || "unknown" };
      }).filter((x) => x.date && x.time);
      setTrackerData((p) => [...p, ...entries]);
    };
    rd.readAsText(f);
    e.target.value = "";
  };

  const jumpMonth = (v) => {
    if (!v) return;
    setMonthJump(v);
    const [y, m] = v.split("-").map(Number);
    const t = new Date(y, m - 1, 1);
    const now = new Date();
    setWeekOffset(Math.round((t - now) / (7 * 864e5)));
  };

  return (
    <div>
      <PageHeader title="Tracker" subtitle={`${wEntries.length}/${totalActiveCells} this week`} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {editTmpl ? (
            showSaveAs ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input value={presetName} onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePreset()} placeholder="Preset name..." autoFocus style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.accentBorder}`, background: "rgba(255,255,255,0.04)", color: T.text, fontSize: 12, fontFamily: T.font, outline: "none", width: 120 }} />
                <button onClick={savePreset} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: T.green, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save</button>
                <button onClick={() => setShowSaveAs(false)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={finishEdit} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Done</button>
                <button onClick={cancelEdit} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.redBorder}`, background: T.redDim, color: T.red, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                <button onClick={undoEdit} disabled={undoStack.length === 0} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: undoStack.length > 0 ? T.textSecondary : T.textMuted, fontSize: 13, cursor: undoStack.length > 0 ? "pointer" : "default", fontFamily: T.font, opacity: undoStack.length > 0 ? 1 : 0.4 }} title="Undo">{"\u21a9"}</button>
                <button onClick={redoEdit} disabled={redoStack.length === 0} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: redoStack.length > 0 ? T.textSecondary : T.textMuted, fontSize: 13, cursor: redoStack.length > 0 ? "pointer" : "default", fontFamily: T.font, opacity: redoStack.length > 0 ? 1 : 0.4 }} title="Redo">{"\u21aa"}</button>
                <button onClick={setAsDefault} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Set as Default</button>
                <button onClick={() => setShowSaveAs(true)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save As...</button>
              </div>
            )
          ) : (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button onClick={enterEditMode} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Edit Template</button>
              {/* Template preset dropdown */}
              <div style={{ position: "relative" }}>
                <button onClick={() => setShowPresetDrop(!showPresetDrop)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${currentPresetName === "Custom" ? T.yellowBorder : T.border}`, background: currentPresetName === "Custom" ? "rgba(251,191,36,0.06)" : "transparent", color: currentPresetName === "Custom" ? T.yellow : T.textTertiary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>
                  {currentPresetName} <span style={{ fontSize: 8, marginLeft: 2 }}>{"\u25bc"}</span>
                </button>
                {showPresetDrop && (
                  <div ref={presetDropRef} style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: T.surface, border: `1px solid ${T.borderHover}`, borderRadius: T.radius.md, padding: 4, minWidth: 160, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 100 }}>
                    <button onClick={clearOverride} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "none", background: currentPresetName === "Default" ? "rgba(139,92,246,0.1)" : "transparent", color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font, textAlign: "left", display: "flex", justifyContent: "space-between" }}>
                      Default {currentPresetName === "Default" && <span style={{ color: T.green }}>{"\u2713"}</span>}
                    </button>
                    <button onClick={() => { loadPreset({ timeSlots: [...effectiveTemplate.timeSlots], grid: Object.fromEntries(DAY_NAMES.map((d) => [d, effectiveTemplate.timeSlots.map(() => "main")])) }); }} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "none", background: "transparent", color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font, textAlign: "left" }}>
                      Blank (All Main)
                    </button>
                    <button onClick={() => { loadPreset({ timeSlots: [...effectiveTemplate.timeSlots], grid: Object.fromEntries(DAY_NAMES.map((d) => [d, effectiveTemplate.timeSlots.map(() => "other")])) }); }} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "none", background: "transparent", color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font, textAlign: "left" }}>
                      Blank (All Other)
                    </button>
                    {(savedTemplates || []).map((p, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center" }}>
                        <button onClick={() => loadPreset(p.template)} style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "none", background: currentPresetName === p.name ? "rgba(139,92,246,0.1)" : "transparent", color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font, textAlign: "left", display: "flex", justifyContent: "space-between" }}>
                          {p.name} {currentPresetName === p.name && <span style={{ color: T.green }}>{"\u2713"}</span>}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deletePreset(i); }} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 10, cursor: "pointer", padding: "4px 8px" }}>{"\u2715"}</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={exportCSV} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Export</button>
          <button onClick={() => fileRef.current?.click()} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Import</button>
          <input ref={fileRef} type="file" accept=".csv" onChange={importCSV} style={{ display: "none" }} />
        </div>
      </div>

      {/* Tracker stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[{ l: "This Week", v: `${wEntries.length}/${totalActiveCells}`, c: T.text }, { l: mainGame, v: String(mw), c: T.accent }, { l: "Other", v: String(ow), c: T.green }].map((s) => (
          <Card key={s.l} style={{ padding: 14, textAlign: "center" }}>
            <SectionLabel>{s.l}</SectionLabel>
            <div style={{ color: s.c, fontSize: 24, fontWeight: 800, fontFamily: T.mono, marginTop: 6 }}>{s.v}</div>
          </Card>
        ))}
      </div>

      {/* Week navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button onClick={() => { setWeekOffset((w) => w - 1); setPopover(null); }} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 14, cursor: "pointer", fontFamily: T.font }}>{"\u2190"}</button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: T.text, fontSize: 14, fontWeight: 700 }}>{getWeekLabel(refDate)}</span>
          {hasOverride && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(251,191,36,0.1)", border: `1px solid ${T.yellowBorder}`, color: T.yellow, fontSize: 10, fontWeight: 700 }}>Custom</span>}
          <Select value={monthJump} onChange={jumpMonth} options={[{ value: "", label: "Jump..." }, ...MONTHS_2026]} style={{ padding: "6px 10px", fontSize: 12 }} />
        </div>
        <button onClick={() => { setWeekOffset((w) => w + 1); setPopover(null); }} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 14, cursor: "pointer", fontFamily: T.font }}>{"\u2192"}</button>
      </div>

      {/* Weekly grid */}
      <div style={{ overflowX: "auto", overflowY: "hidden", position: "relative", borderRadius: T.radius.md }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 3, minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ color: T.textTertiary, fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "8px 6px", textAlign: "left", width: 72 }}>Time</th>
              {wd.map((d, i) => (
                <th key={i} style={{ color: T.textTertiary, fontSize: 10, fontWeight: 700, textTransform: "uppercase", textAlign: "center", padding: "8px 2px" }}>
                  <div>{d.dayName.slice(0, 3)}</div>
                  <div style={{ color: T.textMuted, fontSize: 9, marginTop: 2 }}>{d.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {effectiveTemplate.timeSlots.map((slot, si) => {
              const allNull = DAY_NAMES.every((day) => effectiveTemplate.grid[day]?.[si] === null);
              if (allNull && !editTmpl) return null;

              return (
                <tr
                  key={si}
                  draggable={editTmpl}
                  onDragStart={(e) => { if (!editTmpl) return; setDragRow(si); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { if (!editTmpl || dragRow === null) return; e.preventDefault(); setDragOverRow(si); }}
                  onDragLeave={() => { if (dragOverRow === si) setDragOverRow(null); }}
                  onDrop={(e) => { e.preventDefault(); if (dragRow !== null && dragRow !== si) reorderRow(dragRow, si); setDragRow(null); setDragOverRow(null); }}
                  onDragEnd={() => { setDragRow(null); setDragOverRow(null); }}
                  style={{
                    opacity: allNull ? 0.3 : dragRow === si ? 0.4 : 1,
                    borderTop: dragOverRow === si && dragRow !== null && dragRow !== si ? `2px solid ${T.accent}` : "none",
                  }}
                >
                  <td style={{ color: T.textSecondary, fontSize: 12, fontWeight: 600, fontFamily: T.mono, padding: "3px 6px", whiteSpace: "nowrap" }}>
                    {editTmpl ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ cursor: "grab", color: T.textMuted, fontSize: 12, userSelect: "none", padding: "0 2px" }} title="Drag to reorder">{"\u2807"}</span>
                        {editingTimeSlot === si ? (
                          <input value={timeSlotVal} onChange={(e) => setTimeSlotVal(e.target.value)} onBlur={() => editTimeSlot(si, timeSlotVal)} onKeyDown={(e) => { if (e.key === "Enter") editTimeSlot(si, timeSlotVal); if (e.key === "Escape") setEditingTimeSlot(null); }} autoFocus style={{ width: 72, padding: "2px 4px", borderRadius: 4, border: `1px solid ${T.accentBorder}`, background: "rgba(255,255,255,0.06)", color: T.text, fontSize: 11, fontFamily: T.mono, outline: "none" }} />
                        ) : (
                          <span onClick={() => { setEditingTimeSlot(si); setTimeSlotVal(slot); }} style={{ cursor: "pointer" }} title="Click to edit time">{slot}</span>
                        )}
                        <button onClick={() => removeTimeSlot(si)} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 9, cursor: "pointer", padding: "0 2px", opacity: 0.6 }} title="Remove row">{"\u00d7"}</button>
                      </div>
                    ) : slot}
                  </td>
                  {wd.map((d, di) => {
                    const val = effectiveTemplate.grid[d.dayName]?.[si];
                    const isNull = val === null;
                    const isM = val === "main";
                    const fl = !isNull ? slotFilled(d.iso, si) : null;
                    const cellKey = `${di}-${si}`;
                    const isHov = hoveredCell === cellKey;
                    const gameDisp = fl ? resolveGameDisplay(fl.game) : null;
                    const filledColor = gameDisp?.color || (isM ? T.accent : T.green);

                    if (isNull && !editTmpl) {
                      return <td key={di} style={{ padding: 2 }}><div style={{ height: 38 }} /></td>;
                    }

                    return (
                      <td key={di} style={{ padding: 2 }}>
                        <div
                          onClick={(e) => isNull && editTmpl ? toggleCell(di, si) : handleCellClick(di, si, e)}
                          onMouseEnter={() => setHoveredCell(cellKey)}
                          onMouseLeave={() => setHoveredCell(null)}
                          style={{
                            height: 38, borderRadius: 6, cursor: "pointer", transition: "all 0.15s ease",
                            position: "relative",
                            background: isNull
                              ? "transparent"
                              : fl
                                ? `${filledColor}${isHov ? "66" : "59"}`
                                : isHov
                                  ? (isM ? "rgba(139,92,246,0.15)" : "rgba(52,211,153,0.15)")
                                  : (isM ? "rgba(139,92,246,0.06)" : "rgba(52,211,153,0.06)"),
                            border: isNull
                              ? `1px dashed ${T.textMuted}33`
                              : editTmpl
                                ? `1px dashed ${isM ? "rgba(139,92,246,0.4)" : "rgba(52,211,153,0.4)"}`
                                : fl
                                  ? `1px solid ${filledColor}44`
                                  : isHov ? `1px solid ${isM ? "rgba(139,92,246,0.3)" : "rgba(52,211,153,0.3)"}` : "1px solid transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: fl ? 11 : 10, fontWeight: 700, fontFamily: fl ? T.mono : T.font,
                            color: isNull ? T.textMuted : fl ? "rgba(255,255,255,0.95)" : isHov ? (isM ? T.accent : T.green) : T.textMuted,
                            opacity: isNull ? 0.4 : 1,
                            transform: isHov && fl ? "scale(1.04)" : "none",
                          }}
                        >
                          {isNull ? "" : editTmpl ? (isM ? "M" : "O") : fl ? (gameDisp?.tag || "\u2713") : (isHov ? "+" : (isM ? "M" : "O"))}
                          {fl && !editTmpl && fl.source === "clipflow" && (
                            <div style={{ position: "absolute", bottom: 2, right: 3, width: 7, height: 7, borderRadius: "50%", background: T.cyan, boxShadow: `0 0 6px 2px ${T.cyan}88, 0 0 2px 1px ${T.cyan}aa` }} title="Published via ClipFlow" />
                          )}
                          {fl && !editTmpl && fl.source === "manual" && (
                            <div style={{ position: "absolute", bottom: 2, right: 3, width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.28)", boxShadow: "0 0 5px 1px rgba(255,255,255,0.12)" }} title="Logged manually" />
                          )}
                          {editTmpl && !isNull && isHov && (
                            <button onClick={(e) => { e.stopPropagation(); removeCell(di, si); }} style={{ position: "absolute", top: 1, right: 1, background: "rgba(248,113,113,0.2)", border: "none", borderRadius: 4, color: T.red, fontSize: 8, fontWeight: 700, cursor: "pointer", padding: "1px 3px", lineHeight: 1 }}>{"\u00d7"}</button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {editTmpl && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
            {showAddSlot ? (
              <>
                <input value={newSlotVal} onChange={(e) => setNewSlotVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTimeSlot(newSlotVal); if (e.key === "Escape") setShowAddSlot(false); }} placeholder="e.g. 10:30 AM" autoFocus style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.accentBorder}`, background: "rgba(255,255,255,0.04)", color: T.text, fontSize: 12, fontFamily: T.mono, outline: "none", width: 110 }} />
                <button onClick={() => addTimeSlot(newSlotVal)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: T.green, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Add</button>
                <button onClick={() => { setShowAddSlot(false); setNewSlotVal(""); }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
              </>
            ) : (
              <button onClick={() => setShowAddSlot(true)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px dashed ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>+ Add Time Slot</button>
            )}
          </div>
        )}
      </div>

      {/* Tracker Popover */}
      {popover && (() => {
        return (
          <div ref={popoverRef} style={{
            position: "fixed",
            left: popPos ? popPos.left : -9999,
            top: popPos ? popPos.top : -9999,
            visibility: popPos ? "visible" : "hidden",
            width: "auto", minWidth: 160, maxWidth: 280,
            zIndex: 2000,
            background: T.surface, borderRadius: T.radius.lg, padding: 16,
            border: `1px solid ${T.borderHover}`, boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
          }} onClick={(e) => e.stopPropagation()}>
            {popover.type === "pick" ? (
              <>
                <div style={{ color: T.textTertiary, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>Pick Game</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {gamesDb.filter((g) => g.hashtag !== mainGameTag && g.active !== false).map((g) => (
                    <button key={g.tag} onClick={() => { logManualEntry(popover.iso, popover.dayName, popover.si, g); setPopover(null); }}
                      style={{
                        padding: "6px 12px", borderRadius: 8, border: `1px solid ${g.color}44`,
                        background: `${g.color}1a`, color: g.color, fontSize: 12, fontWeight: 700,
                        fontFamily: T.mono, cursor: "pointer", transition: "all 0.1s ease",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = `${g.color}33`; e.currentTarget.style.transform = "scale(1.05)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = `${g.color}1a`; e.currentTarget.style.transform = "none"; }}
                    >
                      {g.tag}
                    </button>
                  ))}
                  {(() => {
                    const mg = gamesDb.find((g) => g.hashtag === mainGameTag && g.active !== false);
                    if (!mg) return null;
                    return (
                      <button onClick={() => { logManualEntry(popover.iso, popover.dayName, popover.si, mg); setPopover(null); }}
                        style={{
                          padding: "6px 12px", borderRadius: 8, border: `1px solid ${mg.color}44`,
                          background: `${mg.color}1a`, color: mg.color, fontSize: 12, fontWeight: 700,
                          fontFamily: T.mono, cursor: "pointer", transition: "all 0.1s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = `${mg.color}33`; e.currentTarget.style.transform = "scale(1.05)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = `${mg.color}1a`; e.currentTarget.style.transform = "none"; }}
                      >
                        {mg.tag}
                      </button>
                    );
                  })()}
                </div>
              </>
            ) : (
              <>
                {(() => {
                  const gd = resolveGameDisplay(popover.entry.game);
                  return (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                          background: `${gd.color}33`, color: gd.color, fontSize: 11, fontWeight: 800, fontFamily: T.mono,
                        }}>{gd.tag}</div>
                        <div>
                          <div style={{ color: T.text, fontSize: 14, fontWeight: 700 }}>{gd.name}</div>
                          <div style={{ color: T.textTertiary, fontSize: 11 }}>{popover.entry.time}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: popover.entry.source === "clipflow" ? T.cyan : "rgba(255,255,255,0.28)", boxShadow: popover.entry.source === "clipflow" ? `0 0 6px 2px ${T.cyan}88` : "0 0 5px 1px rgba(255,255,255,0.12)" }} />
                        <span style={{ color: popover.entry.source === "clipflow" ? T.cyan : T.textTertiary, fontSize: 11, fontWeight: 600 }}>
                          {popover.entry.source === "clipflow" ? (popover.entry.scheduled ? "Scheduled via ClipFlow" : "Published via ClipFlow") : "Logged manually"}
                        </span>
                      </div>
                      {popover.entry.source === "clipflow" && popover.entry.platforms && popover.entry.platforms !== "Manual" && (
                        <div style={{ color: T.textTertiary, fontSize: 11, marginBottom: 8 }}>{popover.entry.platforms}</div>
                      )}
                      <button onClick={() => removeTrackerEntry(popover.entry)}
                        style={{
                          width: "100%", padding: "8px 0", borderRadius: 8,
                          border: `1px solid ${T.redBorder}`, background: T.redDim,
                          color: T.red, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(248,113,113,0.15)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = T.redDim; }}
                      >Remove</button>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        );
      })()}

      {editTmpl && (
        <div style={{ marginTop: 14, padding: "10px 16px", borderRadius: T.radius.md, background: "rgba(251,191,36,0.06)", border: `1px solid ${T.yellowBorder}` }}>
          <span style={{ color: T.yellow, fontSize: 12 }}>{"\u270f\ufe0f"} Click cells to toggle Main (M) / Other (O). Hover for {"\u00d7"} to remove. Click time labels to edit.</span>
        </div>
      )}
      {!editTmpl && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <InfoBanner icon={"\ud83d\udcdd"}>Click empty cells to log uploads. Click filled cells to view or remove.</InfoBanner>
          <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "6px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.cyan, boxShadow: `0 0 6px 2px ${T.cyan}88` }} />
              <span style={{ color: T.textTertiary, fontSize: 11 }}>ClipFlow</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.28)", boxShadow: "0 0 5px 1px rgba(255,255,255,0.12)" }} />
              <span style={{ color: T.textTertiary, fontSize: 11 }}>Manual</span>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 60 }} />
    </div>
  );
}
