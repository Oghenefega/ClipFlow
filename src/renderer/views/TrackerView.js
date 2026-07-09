import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import T from "../styles/theme";
import PlatformIcon from "../components/PlatformIcon";
import {
  ledgerTotal, rankForXp, weekEntries, paceInfo, computeRecap, localISO, addDaysISO,
  XP_PER_CLIP,
} from "../utils/trackerEngine";
import { renderRecapPng, downloadBlob, copyBlobToClipboard } from "../utils/recapCardImage";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PLATFORM_KEYS = ["tiktok", "youtube", "instagram", "facebook"];
const PLATFORM_LABELS = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram", facebook: "Facebook" };
const PLATFORM_BRAND_COLORS = { tiktok: "#00f2ea", youtube: "#FF0000", instagram: "#E1306C", facebook: "#1877F2" };

const getWeekDates = (refDate) => {
  const d = new Date(refDate);
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return DAY_NAMES.map((name, i) => {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    // Local date, not toISOString — entry dates and weekMeta keys are local-calendar
    // based; UTC would shift evening sessions onto the next day and miss the week key.
    const iso = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    return { dayName: name, iso, label: `${x.toLocaleString("en-US", { month: "short" })} ${x.getDate()}`, date: x };
  });
};

// Parse a time slot string like "3:30 PM" into total minutes since midnight
const parseTimeToMinutes = (s) => {
  const [t, ap] = s.split(" ");
  let [h, m] = t.split(":").map(Number);
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + m;
};

const shortSlot = (s) => (s || "").replace(" PM", "p").replace(" AM", "a").replace(":30", "·30");

// Sort a template's time slots chronologically, reordering grid columns to match
const sortTemplateByTime = (tmpl) => {
  const indices = tmpl.timeSlots.map((s, i) => ({ s, i, m: parseTimeToMinutes(s) }));
  indices.sort((a, b) => a.m - b.m);
  return {
    timeSlots: indices.map((x) => x.s),
    grid: Object.fromEntries(DAY_NAMES.map((day) => [day, indices.map((x) => tmpl.grid[day][x.i])])),
  };
};

const fmtNum = (n) => n.toLocaleString("en-US");

export default function TrackerView({
  mainGame, setMainGame, mainGameTag, gamesDb,
  trackerData, setTrackerData,
  weeklyTemplate, setWeeklyTemplate, weekTemplateOverrides, setWeekTemplateOverrides,
  savedTemplates, setSavedTemplates,
  weeklyTarget, setWeeklyTarget,
  weekMeta, setWeekMeta,
  xpLedger, awardXp,
  streakState,
}) {
  // Live clock: the tab pane stays mounted from app launch, so a frozen Date would
  // keep highlighting yesterday after midnight. Tick once a minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const wd = useMemo(() => getWeekDates(now), [now]);
  const monday = wd[0].iso;
  const todayIso = localISO(now);
  const todayIdx = wd.findIndex((d) => d.iso === todayIso);

  const activeGames = useMemo(() => gamesDb.filter((g) => g.active !== false), [gamesDb]);
  const currentGame = gamesDb.find((g) => g.name === mainGame);
  const gameColor = currentGame?.color || T.accent;
  const gameTag = currentGame?.tag || "";

  const thisWeekMeta = weekMeta?.[monday];
  const target = thisWeekMeta?.target ?? weeklyTarget;

  const thisWeekEntries = useMemo(() => weekEntries(trackerData, monday), [trackerData, monday]);
  const posted = thisWeekEntries.length;
  const mainCount = thisWeekEntries.filter((e) => e.type === "main").length;
  const varietyCount = posted - mainCount;

  const pace = useMemo(() => paceInfo({ posted, target, date: now }), [posted, target, now]);

  const totalXp = ledgerTotal(xpLedger);
  const rank = rankForXp(totalXp);
  const weekXp = posted * XP_PER_CLIP;

  const prevMonday = addDaysISO(monday, -7);
  const prevWeekOutcome = weekMeta?.[prevMonday]?.outcome;
  const streakOverVariant = prevWeekOutcome === "missed" && posted < target;

  const effectiveTemplate = weekTemplateOverrides?.[monday] || weeklyTemplate;
  const hasOverride = !!(weekTemplateOverrides?.[monday]);

  const recap = useMemo(() => computeRecap(thisWeekEntries), [thisWeekEntries]);
  const goalReached = target > 0 && posted >= target;

  // ---------- toast ----------
  const [toastMsg, setToastMsg] = useState(null);
  const toastTimer = useRef(null);
  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2200);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // ---------- rank-up detection ----------
  const prevRankName = useRef(rank.name);
  useEffect(() => {
    if (prevRankName.current !== rank.name) {
      toast(`Rank up — ${rank.name}`);
      prevRankName.current = rank.name;
    }
  }, [rank.name, toast]);

  // ---------- goal-reached moment ----------
  const prevGoalReached = useRef(goalReached);
  useEffect(() => {
    if (goalReached && !prevGoalReached.current) {
      toast("Goal reached — recap ready to share");
    }
    prevGoalReached.current = goalReached;
  }, [goalReached, toast]);

  // ---------- count-up animation ----------
  const [animPosted, setAnimPosted] = useState(0);
  const [animPct, setAnimPct] = useState(0);
  const [animXp, setAnimXp] = useState(0);
  const [ringReady, setRingReady] = useState(false);
  useEffect(() => {
    const pct = target > 0 ? Math.round(Math.min(1, posted / target) * 100) : 100;
    if (document.hidden) {
      setAnimPosted(posted); setAnimPct(pct); setAnimXp(totalXp); setRingReady(true);
      return;
    }
    let raf;
    const start = performance.now();
    const dur = 900;
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setAnimPosted(Math.round(posted * e));
      setAnimPct(Math.round(pct * e));
      setAnimXp(Math.round(totalXp * e));
      if (p < 1) raf = requestAnimationFrame(step);
      else { setAnimPosted(posted); setAnimPct(pct); setAnimXp(totalXp); setRingReady(true); }
    };
    setRingReady(true); // trigger CSS width/dashoffset transitions immediately
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- game switcher popover ----------
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);
  const pickerBtnRef = useRef(null);
  const [pickerPos, setPickerPos] = useState(null);
  useEffect(() => {
    if (!pickerOpen) return;
    const onClick = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setPickerOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [pickerOpen]);
  useLayoutEffect(() => {
    if (!pickerOpen || !pickerBtnRef.current) { setPickerPos(null); return; }
    const r = pickerBtnRef.current.getBoundingClientRect();
    setPickerPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
  }, [pickerOpen]);

  const switchGame = (g) => {
    setMainGame(g.name);
    setWeekMeta((prev) => ({ ...prev, [monday]: { ...(prev[monday] || { target: weeklyTarget }), nowPlaying: g.name } }));
    setPickerOpen(false);
    toast(`Now playing → ${g.name}`);
  };

  // ---------- target editing ----------
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetVal, setTargetVal] = useState(String(target));
  useEffect(() => { setTargetVal(String(target)); }, [target]);

  const commitTarget = () => {
    let v = parseInt(targetVal, 10);
    if (isNaN(v)) v = target;
    if (v < 1) v = 1;
    if (v > 400) v = 400;
    if (v < posted) {
      toast(`Can't set the target below the ${posted} you've already posted this week`);
      setTargetVal(String(target));
      setEditingTarget(false);
      return;
    }
    setWeekMeta((prev) => ({ ...prev, [monday]: { ...(prev[monday] || {}), target: v, nowPlaying: prev[monday]?.nowPlaying || mainGame } }));
    setWeeklyTarget(v);
    setEditingTarget(false);
    if (v !== target) toast(`Weekly target set to ${v}`);
  };

  // ---------- popovers (log / detail) ----------
  const popoverRef = useRef(null);
  const [popover, setPopover] = useState(null); // { type: 'log'|'detail', rect, ...ctx }
  const [popPos, setPopPos] = useState(null);
  const [logSelectedPlatforms, setLogSelectedPlatforms] = useState([]);

  const closePopover = () => { setPopover(null); setLogSelectedPlatforms([]); };

  useEffect(() => {
    if (!popover) return;
    const onKey = (e) => { if (e.key === "Escape") closePopover(); };
    const onClick = (e) => { if (popoverRef.current && !popoverRef.current.contains(e.target)) closePopover(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [popover]);

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

  const openLogPopover = (dayIso, dayName, slotTime, rect) => {
    setLogSelectedPlatforms([]);
    setPopover({ type: "log", dayIso, dayName, slotTime, rect });
  };
  const openDetailPopover = (entry, rect) => setPopover({ type: "detail", entry, rect });

  const togglePlatform = (key) => {
    setLogSelectedPlatforms((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const logClip = (game) => {
    if (!popover || popover.type !== "log") return;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const entry = {
      id,
      date: popover.dayIso,
      day: popover.dayName,
      time: popover.slotTime,
      title: "Manual entry",
      game: game.hashtag,
      type: game.hashtag === mainGameTag ? "main" : "other",
      platforms: "Manual",
      platformResults: logSelectedPlatforms.map((k) => ({ platform: k, accountId: null })),
      mainGameAtTime: mainGame,
      source: "manual",
    };
    setTrackerData((prev) => [...prev, entry]);
    awardXp(`clip:${id}`, XP_PER_CLIP, "clip", popover.dayIso);
    closePopover();
    toast(`Logged ${game.name} · ${shortSlot(popover.slotTime)}`);
  };

  const removeEntry = (entry) => {
    setTrackerData((prev) => prev.filter((e) => (e.id ? e.id !== entry.id : !(e.date === entry.date && e.time === entry.time && e.game === entry.game))));
    closePopover();
    toast("Clip removed");
  };

  const resolveGameDisplay = (hashtag) => {
    const g = gamesDb.find((x) => x.hashtag === hashtag);
    return g ? { name: g.name, color: g.color, tag: g.tag } : { name: hashtag, color: T.textMuted, tag: hashtag };
  };

  // ---------- template mini-editor overlay ----------
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTimeSlot, setEditingTimeSlot] = useState(null);
  const [timeSlotVal, setTimeSlotVal] = useState("");
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [newSlotVal, setNewSlotVal] = useState("");
  const [showPresetDrop, setShowPresetDrop] = useState(false);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [presetName, setPresetName] = useState("");
  const presetDropRef = useRef(null);

  useEffect(() => {
    if (!showPresetDrop) return;
    const onClick = (e) => { if (presetDropRef.current && !presetDropRef.current.contains(e.target)) setShowPresetDrop(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showPresetDrop]);

  const currentPresetName = (() => {
    if (!hasOverride) return "Default";
    const match = (savedTemplates || []).find((p) => JSON.stringify(p.template) === JSON.stringify(effectiveTemplate));
    return match ? match.name : "Custom";
  })();

  const editTimeSlot = (si, newTime) => {
    if (!newTime.trim()) return;
    setWeekTemplateOverrides((prev) => {
      const current = prev[monday] || JSON.parse(JSON.stringify(weeklyTemplate));
      const updated = JSON.parse(JSON.stringify(current));
      updated.timeSlots[si] = newTime.trim();
      return { ...prev, [monday]: sortTemplateByTime(updated) };
    });
    setEditingTimeSlot(null);
  };

  const addTimeSlot = (timeStr) => {
    if (!timeStr.trim()) return;
    setWeekTemplateOverrides((prev) => {
      const current = prev[monday] || JSON.parse(JSON.stringify(weeklyTemplate));
      const updated = JSON.parse(JSON.stringify(current));
      updated.timeSlots.push(timeStr.trim());
      DAY_NAMES.forEach((day) => { updated.grid[day].push("main"); });
      return { ...prev, [monday]: sortTemplateByTime(updated) };
    });
    setShowAddSlot(false);
    setNewSlotVal("");
  };

  const removeTimeSlot = (si) => {
    setWeekTemplateOverrides((prev) => {
      const current = prev[monday] || JSON.parse(JSON.stringify(weeklyTemplate));
      const updated = JSON.parse(JSON.stringify(current));
      updated.timeSlots.splice(si, 1);
      DAY_NAMES.forEach((day) => { updated.grid[day].splice(si, 1); });
      return { ...prev, [monday]: updated };
    });
  };

  const setAsDefault = () => setWeeklyTemplate(JSON.parse(JSON.stringify(effectiveTemplate)));
  const savePreset = () => {
    if (!presetName.trim()) return;
    setSavedTemplates((prev) => [...prev, { name: presetName.trim(), template: JSON.parse(JSON.stringify(effectiveTemplate)) }]);
    setPresetName("");
    setShowSaveAs(false);
  };
  const loadPreset = (template) => {
    setWeekTemplateOverrides((prev) => ({ ...prev, [monday]: JSON.parse(JSON.stringify(template)) }));
    setShowPresetDrop(false);
  };
  const clearOverride = () => {
    setWeekTemplateOverrides((prev) => { const n = { ...prev }; delete n[monday]; return n; });
    setShowPresetDrop(false);
  };
  const deletePreset = (idx) => setSavedTemplates((prev) => prev.filter((_, i) => i !== idx));

  // ---------- CSV export/import ----------
  const fileRef = useRef(null);
  const exportCSV = () => {
    const h = "Date,Day,Time,Title,Game,Type,Platforms,MainGame,Source,PlatformResults\n";
    const r = trackerData.map((e) => {
      const pr = JSON.stringify(e.platformResults || []).replace(/"/g, '""');
      return `${e.date},${e.day},${e.time},"${(e.title || "").replace(/"/g, '""')}",${e.game},${e.type},"${e.platforms || ""}",${e.mainGameAtTime || ""},${e.source || "unknown"},"${pr}"`;
    }).join("\n");
    const b = new Blob([h + r], { type: "text/csv" });
    downloadBlob(b, `clipflow-tracker-${todayIso}.csv`);
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
        let platformResults = [];
        try { platformResults = JSON.parse(c(p[9]) || "[]"); } catch (err) { platformResults = []; }
        return {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          date: c(p[0]), day: c(p[1]), time: c(p[2]), title: c(p[3]), game: c(p[4]), type: c(p[5]),
          platforms: c(p[6]), mainGameAtTime: c(p[7]), source: c(p[8]) || "unknown", platformResults,
        };
      }).filter((x) => x.date && x.time);
      setTrackerData((p) => [...p, ...entries]);
      toast(`Imported ${entries.length} entries`);
    };
    rd.readAsText(f);
    e.target.value = "";
  };

  // ---------- share recap ----------
  const [shareState, setShareState] = useState("idle"); // idle | saving | saved | copied
  const shareTimer = useRef(null);
  useEffect(() => () => clearTimeout(shareTimer.current), []);

  const handleShare = async () => {
    setShareState("saving");
    try {
      const blob = await renderRecapPng({
        game: mainGame,
        gameColor,
        clips: recap.clips,
        platformsUsed: recap.platformsUsed,
        perPlatform: recap.perPlatform,
        streak: streakState?.current || 0,
        rankName: rank.name,
        rankColor: T.tiers[rank.tier] || T.accent,
        weekLabel: `${wd[0].label} – ${wd[5].label}`,
      });
      downloadBlob(blob, `clipflow-recap-${monday}.png`);
      const copied = await copyBlobToClipboard(blob);
      setShareState(copied ? "copied" : "saved");
      toast(copied ? "Recap saved — copied to clipboard" : "Recap saved");
    } catch (e) {
      setShareState("idle");
      toast("Couldn't generate recap image");
      return;
    }
    clearTimeout(shareTimer.current);
    shareTimer.current = setTimeout(() => setShareState("idle"), 2000);
  };

  // ---------- ring geometry ----------
  const R = 62, C = 2 * Math.PI * R;
  const progFrac = target > 0 ? Math.min(1, posted / target) : 1;
  const dashOffset = ringReady ? C * (1 - progFrac) : C;
  const paceColor = pace.status === "green" ? T.green : pace.status === "yellow" ? T.yellow : T.red;
  const expFrac = target > 0 ? Math.min(1, pace.expected / target) : 0;
  const tickDeg = expFrac * 360;
  const tickHidden = expFrac <= 0 || expFrac >= 1;

  return (
    <div style={{ fontFamily: T.font, color: T.text }}>
      {/* Page head */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>Tracker</h1>
          <div style={{ fontSize: 12, color: T.textTertiary, fontWeight: 500, marginTop: 2 }}>ClipFlow · Now Playing</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 4, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 4 }}>
            <button style={{ background: T.surfaceHover, border: "none", color: T.text, fontFamily: T.font, fontSize: 12, fontWeight: 600, padding: "6px 13px", borderRadius: 6, cursor: "pointer" }}>This week</button>
            <button disabled title="Calendar view — coming in Phase 2" style={{ background: "none", border: "none", color: T.textTertiary, fontFamily: T.font, fontSize: 12, fontWeight: 600, padding: "6px 13px", borderRadius: 6, cursor: "default", display: "flex", alignItems: "center", gap: 6 }}>
              Calendar
              <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.textMuted, background: "rgba(255,255,255,0.05)", padding: "2px 5px", borderRadius: 999 }}>soon</span>
            </button>
          </div>
          <button onClick={exportCSV} style={ghostBtnStyle}>Export</button>
          <button onClick={() => fileRef.current?.click()} style={ghostBtnStyle}>Import</button>
          <input ref={fileRef} type="file" accept=".csv" onChange={importCSV} style={{ display: "none" }} />
        </div>
      </div>

      {/* Week strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 7 }}>
          NOW PLAYING <b style={{ color: gameColor }}>{mainGame}</b>
        </span>
        <span style={{ width: 3, height: 3, borderRadius: "50%", background: T.textMuted }} />
        <span style={{ fontSize: 12, color: T.textSecondary, fontWeight: 500 }}>Week of {wd[0].label} to {wd[5].label}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, background: T.accentDim, border: `1px solid ${T.accentBorder}`, color: T.accentLight, fontSize: 11, fontWeight: 600, padding: "6px 11px", borderRadius: 999 }}>
          <span style={{ color: T.accent, fontSize: 13, lineHeight: 1 }}>{"▲"}</span>
          <span><b>{streakState?.current || 0}</b> weeks</span>
        </div>
      </div>

      {/* Now Playing banner */}
      <div style={{
        position: "relative", border: `1px solid ${T.border}`, borderRadius: T.radius.lg, overflow: "hidden",
        marginBottom: 18, minHeight: 148, display: "flex", alignItems: "center", gap: 22, padding: "26px 28px",
        background: `radial-gradient(120% 140% at 8% 18%, ${gameColor}33 0%, transparent 55%), linear-gradient(105deg, ${gameColor}4d 0%, ${gameColor}0d 42%, rgba(17,18,24,0) 70%), ${T.surface}`,
      }}>
        <button ref={pickerBtnRef} onClick={() => setPickerOpen((o) => !o)} style={{
          position: "absolute", top: 18, right: 18, zIndex: 3, display: "flex", alignItems: "center", gap: 7,
          background: "rgba(10,11,16,0.55)", backdropFilter: "blur(6px)", border: `1px solid ${T.borderHover}`, color: T.text,
          fontFamily: T.font, fontSize: 11, fontWeight: 600, padding: "8px 13px", borderRadius: T.radius.md, cursor: "pointer",
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M4 7h13M14 4l3 3-3 3M20 17H7M10 14l-3 3 3 3" /></svg>
          Switch game
        </button>

        {pickerOpen && pickerPos && (
          <div ref={pickerRef} style={{
            position: "fixed", top: pickerPos.top, right: pickerPos.right, zIndex: 20, width: 300, maxHeight: 340, overflowY: "auto",
            background: "#0d0e15", border: `1px solid ${T.borderHover}`, borderRadius: T.radius.lg, padding: 10, boxShadow: "0 18px 50px rgba(0,0,0,0.6)",
          }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: T.textTertiary, fontWeight: 600, padding: "4px 6px 9px" }}>What are you playing this week</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {activeGames.map((g) => (
                <div key={g.tag} onClick={() => switchGame(g)} style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 6, cursor: "pointer",
                  border: `1px solid ${g.name === mainGame ? T.borderHover : "transparent"}`,
                  background: g.name === mainGame ? T.surfaceHover : "transparent",
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = g.name === mainGame ? T.surfaceHover : "transparent"; }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: "#0a0b10", background: g.color, flexShrink: 0 }}>{g.tag}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: T.text, lineHeight: 1.15 }}>{g.name}</div>
                    {g.name === mainGame && <div style={{ fontSize: 9, color: gameColor, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Main game</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{
          position: "relative", zIndex: 1, width: 96, height: 96, borderRadius: T.radius.md, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: T.mono, fontSize: 38, fontWeight: 700, letterSpacing: "-0.02em", color: "#0a0b10", flexShrink: 0,
          background: gameColor, boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
        }}>{gameTag}</div>

        <div style={{ position: "relative", zIndex: 1, flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", color: T.textTertiary, fontWeight: 600, marginBottom: 7, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: gameColor, boxShadow: `0 0 8px ${gameColor}`, animation: "tp-pulse 2.2s ease-in-out infinite" }} />
            Now playing
          </div>
          <h2 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 13, margin: "0 0 13px" }}>{mainGame}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 7, padding: "5px 12px 5px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600,
              background: `${T.tiers[rank.tier]}22`, border: `1px solid ${T.tiers[rank.tier]}66`, color: T.tiers[rank.tier],
            }}>
              <span style={{ width: 13, height: 13, borderRadius: 3, transform: "rotate(45deg)", display: "inline-block", background: T.tiers[rank.tier] }} />
              {rank.name}
            </div>
            <div style={{ fontSize: 11, color: T.textSecondary, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}` }}>
              <b style={{ color: T.text, fontWeight: 600 }}>{posted}</b> posted this week
            </div>
          </div>
        </div>
      </div>

      {/* Progress grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 14, marginBottom: 18 }}>
        {/* Goal card */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, padding: 20, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <SectionLbl>Weekly goal</SectionLbl>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: T.textTertiary, fontWeight: 600, marginRight: 8 }}>Target</span>
              {editingTarget ? (
                <input
                  type="number" min={1} max={400} value={targetVal} autoFocus
                  onChange={(e) => setTargetVal(e.target.value)}
                  onBlur={commitTarget}
                  onKeyDown={(e) => { if (e.key === "Enter") commitTarget(); if (e.key === "Escape") { setTargetVal(String(target)); setEditingTarget(false); } }}
                  style={{ width: 62, fontFamily: T.mono, fontSize: 19, fontWeight: 700, background: T.bg, border: `1px solid ${T.accent}`, color: T.text, borderRadius: 6, padding: "3px 8px", textAlign: "center", outline: "none" }}
                />
              ) : (
                <span onClick={() => setEditingTarget(true)} style={{ display: "inline-flex", alignItems: "baseline", fontFamily: T.mono, fontSize: 19, fontWeight: 700, color: T.text, cursor: "pointer", padding: "3px 9px", borderRadius: 6, border: "1px solid transparent" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHover; e.currentTarget.style.borderColor = T.border; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
                >{target}<span style={{ fontSize: 11, color: T.textTertiary, marginLeft: 6 }}>{"✎"}</span></span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ position: "relative", width: 142, height: 142, flexShrink: 0 }}>
              <svg width="142" height="142" viewBox="0 0 142 142" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="71" cy="71" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
                <circle cx="71" cy="71" r={R} fill="none" stroke={paceColor} strokeWidth="9" strokeLinecap="round"
                  strokeDasharray={C.toFixed(1)} strokeDashoffset={dashOffset.toFixed(1)}
                  style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1), stroke 0.4s" }} />
                {!tickHidden && (
                  <line x1="71" y1="9" x2="71" y2="20" stroke={T.bg} strokeWidth="3" strokeLinecap="round"
                    transform={`rotate(${tickDeg} 71 71)`} style={{ transition: "transform 0.9s cubic-bezier(.4,0,.2,1)" }} />
                )}
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: T.mono, fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: T.text }}>{animPosted}</span>
                <span style={{ fontFamily: T.mono, fontSize: 12, color: T.textTertiary, fontWeight: 500, marginTop: 3 }}>of {target}</span>
                <span style={{ fontSize: 10, color: paceColor, fontWeight: 600, marginTop: 5, letterSpacing: "0.04em" }}>{animPct}%</span>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.text, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: gameColor }} />{mainGame} <span style={{ fontFamily: T.mono, color: T.textSecondary, fontWeight: 500, marginLeft: 2 }}>{mainCount}</span>
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: T.textSecondary, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.textTertiary }} />Variety <span style={{ fontFamily: T.mono, marginLeft: 2 }}>{varietyCount}</span>
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden", display: "flex" }}>
                  <div style={{ height: "100%", background: gameColor, width: ringReady && posted ? `${Math.round((mainCount / posted) * 100)}%` : "0%", transition: "width 0.6s cubic-bezier(.4,0,.2,1), background 0.4s" }} />
                  <div style={{ height: "100%", background: "rgba(255,255,255,0.22)", width: ringReady && posted ? `${Math.round((varietyCount / posted) * 100)}%` : "0%", transition: "width 0.6s cubic-bezier(.4,0,.2,1)" }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 500 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: paceColor, flexShrink: 0 }} />
                <span>
                  <span style={{ color: paceColor, fontWeight: 600 }}>
                    {pace.diff === 0 ? "On pace" : pace.diff > 0 ? `${pace.diff} ahead of pace` : `${Math.abs(pace.diff)} behind pace`}
                  </span>{" "}
                  <span style={{ color: T.textSecondary }}>{"·"} {pace.expectedRounded} by now</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Rank card */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, padding: 20, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ position: "absolute", top: -50, right: -40, width: 160, height: 160, borderRadius: "50%", background: `radial-gradient(circle, ${T.tiers[rank.tier]}29, transparent 70%)`, pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, position: "relative" }}>
            <SectionLbl>Rank</SectionLbl>
            <span style={{ fontSize: 10, color: T.textTertiary, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: T.green, fontSize: 11 }}>{"▲"}</span> All-time {"·"} only climbs
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18, position: "relative" }}>
            <div style={{ width: 54, height: 54, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: 14, border: `1px solid ${T.tiers[rank.tier]}`, opacity: 0.35 }} />
              <span style={{ width: 34, height: 34, borderRadius: 8, transform: "rotate(45deg)", boxShadow: "0 6px 20px rgba(0,0,0,0.4)", background: T.tiers[rank.tier] }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1, color: T.tiers[rank.tier] }}>{rank.name}</div>
              <div style={{ fontSize: 11, color: T.textSecondary, fontWeight: 500, marginTop: 6 }}>
                <b style={{ color: T.text, fontWeight: 600, fontFamily: T.mono }}>{fmtNum(animXp)}</b> XP earned all-time
              </div>
            </div>
          </div>
          <div style={{ marginTop: "auto", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <span style={{ fontSize: 10, color: T.textTertiary, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>To next tier</span>
              <span style={{ fontSize: 11, color: T.textSecondary, fontWeight: 500, fontFamily: T.mono }}>{rank.top ? "Top tier reached" : `${fmtNum(rank.toNextXp)} XP to ${rank.nextName}`}</span>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, background: T.tiers[rank.tier], width: ringReady ? `${Math.round(rank.frac * 100)}%` : "0%", transition: "width 0.8s cubic-bezier(.4,0,.2,1), background 0.4s" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 11, fontSize: 11, fontWeight: 600, color: T.accentLight }}>
              <span style={{ fontFamily: T.mono }}>+{weekXp} XP this week</span>
              <span style={{ color: T.textTertiary, fontWeight: 500 }}>{"·"} {goalReached ? "goal bonus locks in at week's end" : "feeds your rank"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stakes bar */}
      <StakesBar posted={posted} target={target} streak={streakState?.current || 0} daysLeft={pace.daysLeft} now={now} streakOverVariant={streakOverVariant} gameColor={gameColor} />

      {/* Week log */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 0" }}>
          <SectionLbl>This week's log</SectionLbl>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: T.textTertiary, fontWeight: 500 }}>Click a slot to log {"·"} click a clip for detail</span>
            <button onClick={() => setShowTemplateEditor(true)} style={ghostBtnStyle}>Edit slots</button>
            {hasOverride && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(251,191,36,0.1)", border: `1px solid ${T.yellowBorder}`, color: T.yellow, fontSize: 10, fontWeight: 700 }}>Custom</span>}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 0, padding: "14px 12px 18px" }}>
          {wd.map((d, di) => {
            const isToday = di === todayIdx;
            const isFuture = todayIdx >= 0 ? di > todayIdx : false;
            const dayEntries = thisWeekEntries.filter((e) => e.date === d.iso);
            const norm = (t) => (t || "").replace(/\s/g, "");
            const safeMinutes = (t) => { const m = parseTimeToMinutes(t || "12:00 AM"); return isNaN(m) ? 0 : m; };
            const templateSlots = effectiveTemplate.timeSlots || [];
            const sortedSlots = templateSlots.slice().sort((a, b) => safeMinutes(a) - safeMinutes(b));
            const canLog = isToday || !isFuture;
            const slotTimesNorm = new Set(sortedSlots.map(norm));

            // Merge template slots (filled by a matching entry, or an open "+" tile) with any
            // entries whose time doesn't land on a template slot, into one time-ordered list.
            const dayRows = [];
            sortedSlots.forEach((slot) => {
              const matches = dayEntries.filter((e) => norm(e.time) === norm(slot));
              if (matches.length > 0) {
                matches.forEach((entry) => dayRows.push({ type: "entry", entry, minutes: safeMinutes(slot) }));
              } else if (canLog) {
                dayRows.push({ type: "slot", time: slot, minutes: safeMinutes(slot) });
              }
            });
            dayEntries.filter((e) => !slotTimesNorm.has(norm(e.time))).forEach((entry) => {
              dayRows.push({ type: "entry", entry, minutes: safeMinutes(entry.time) });
            });
            dayRows.sort((a, b) => a.minutes - b.minutes);

            return (
              <div key={d.iso} style={{
                padding: "0 8px", borderRight: di < 5 ? `1px solid ${T.border}` : "none", minHeight: 150,
                background: isToday ? `linear-gradient(180deg, ${T.accentDim}, transparent 60%)` : "transparent",
                borderRadius: isToday ? 6 : 0, opacity: isFuture ? 0.4 : 1,
              }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "4px 4px 10px" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: isToday ? T.accentLight : T.text }}>{DAY_SHORT[di]}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textTertiary }}>{d.label}</span>
                </div>
                {isToday && <span style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: T.accent, fontWeight: 700, display: "block", padding: "0 4px 8px" }}>Today</span>}
                {isFuture && <span style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textTertiary, fontWeight: 600, display: "block", padding: "0 4px 8px" }}>Upcoming</span>}

                {dayRows.map((row, i) => {
                  if (row.type === "entry") {
                    const entry = row.entry;
                    const gd = resolveGameDisplay(entry.game);
                    const isAuto = entry.source === "clipflow";
                    return (
                      <div key={entry.id || `${entry.date}-${entry.time}-${i}`}
                        onClick={(e) => openDetailPopover(entry, e.currentTarget.getBoundingClientRect())}
                        style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 7px", marginBottom: 5, cursor: "pointer" }}
                        onMouseEnter={(ev) => { ev.currentTarget.style.background = T.surfaceHover; ev.currentTarget.style.borderColor = T.borderHover; }}
                        onMouseLeave={(ev) => { ev.currentTarget.style.background = "rgba(255,255,255,0.03)"; ev.currentTarget.style.borderColor = T.border; }}
                      >
                        <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, color: "#0a0b10", flexShrink: 0, background: gd.color }}>{gd.tag}</span>
                        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.textTertiary, marginLeft: "auto" }}>{shortSlot(entry.time)}</span>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: isAuto ? T.cyan : "#fff", boxShadow: isAuto ? `0 0 6px ${T.cyan}88` : "0 0 5px rgba(255,255,255,0.35)" }} />
                      </div>
                    );
                  }
                  return (
                    <div key={`slot-${row.time}`}
                      onClick={(e) => openLogPopover(d.iso, d.dayName, row.time, e.currentTarget.getBoundingClientRect())}
                      style={{ display: "flex", alignItems: "center", gap: 5, border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 6, padding: "5px 7px", marginBottom: 5, cursor: "pointer", color: T.textMuted, minHeight: 25 }}
                      onMouseEnter={(ev) => { ev.currentTarget.style.borderColor = gameColor; ev.currentTarget.style.color = gameColor; ev.currentTarget.style.background = `${gameColor}1a`; }}
                      onMouseLeave={(ev) => { ev.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; ev.currentTarget.style.color = T.textMuted; ev.currentTarget.style.background = "transparent"; }}
                    >
                      <span style={{ fontSize: 13, lineHeight: 1, color: "inherit" }}>+</span>
                      <span style={{ fontFamily: T.mono, fontSize: 9, color: "inherit", marginLeft: "auto" }}>{shortSlot(row.time)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 4px 16px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: T.textTertiary, fontWeight: 500 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: T.cyan, boxShadow: `0 0 6px ${T.cyan}88` }} /> Auto-posted via ClipFlow
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: T.textTertiary, fontWeight: 500 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: "#fff", boxShadow: "0 0 5px rgba(255,255,255,0.35)" }} /> Logged manually
        </span>
      </div>

      {/* Recap card */}
      <div style={{
        position: "relative", border: `1px solid ${T.border}`, borderRadius: T.radius.lg, overflow: "hidden", padding: "24px 24px 22px",
        maxWidth: 340, display: "flex", flexDirection: "column", gap: 16,
        background: `radial-gradient(110% 130% at 92% 100%, ${gameColor}29 0%, transparent 58%), linear-gradient(115deg, ${gameColor}38 0%, ${gameColor}0a 50%, transparent 78%), ${T.surface}`,
      }}>
        {goalReached && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, background: `linear-gradient(90deg, ${gameColor}1f, transparent)`, border: `1px solid ${gameColor}`, borderRadius: T.radius.md, padding: "9px 14px", fontSize: 12, fontWeight: 600, color: gameColor }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" style={{ flexShrink: 0 }}><path d="M5 13l4 4L19 7" /></svg>
            Goal reached. Bonus XP banks at week's end. This recap is ready to post.
          </div>
        )}

        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", color: T.textTertiary, fontWeight: 600, marginBottom: 9 }}>Weekly recap {"·"} shareable</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            I posted <b style={{ color: gameColor }}>{recap.clips} clip{recap.clips === 1 ? "" : "s"}</b> to <b style={{ color: gameColor }}>{recap.platformsUsed} platform{recap.platformsUsed === 1 ? "" : "s"}</b> this week
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 600, color: T.textSecondary, letterSpacing: "0.02em" }}>
          <span style={{ width: 16, height: 16, borderRadius: 5, background: "linear-gradient(135deg, #a78bfa, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#0a0b10" strokeWidth="2.6"><path d="M4 7h16M4 12h10M4 17h6" /></svg>
          </span>
          Flowve
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {PLATFORM_KEYS.map((key) => (
            <div key={key} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: T.textSecondary, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                <PlatformIcon platform={key} size={14} />{PLATFORM_LABELS[key]}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 21, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>{recap.perPlatform[key] || 0}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <Pill><span style={{ color: T.accent, fontSize: 11 }}>{"▲"}</span>{streakState?.current || 0}-week streak</Pill>
          <Pill><span style={{ width: 7, height: 7, borderRadius: "50%", background: T.tiers[rank.tier] }} />{rank.name}</Pill>
          <Pill><span style={{ width: 7, height: 7, borderRadius: "50%", background: gameColor }} />{mainGame}</Pill>
        </div>

        <button onClick={handleShare} disabled={shareState === "saving"} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%",
          background: shareState === "copied" || shareState === "saved" ? T.green : T.text,
          color: shareState === "copied" || shareState === "saved" ? "#06281b" : "#0a0b10",
          border: "none", fontFamily: T.font, fontSize: 13, fontWeight: 700, padding: "11px 18px", borderRadius: T.radius.md,
          cursor: shareState === "saving" ? "default" : "pointer", transition: "background 0.18s",
        }}>
          {shareState === "copied" || shareState === "saved" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M5 13l4 4L19 7" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M8 12h8M8 12l3-3M8 12l3 3M16 5h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h2" /></svg>
          )}
          {shareState === "copied" ? "Saved — copied to clipboard" : shareState === "saved" ? "Saved" : shareState === "saving" ? "Saving…" : "Share recap"}
        </button>
      </div>

      <div style={{ height: 60 }} />

      {/* ---- Log / Detail popover ---- */}
      {popover && (
        <div ref={popoverRef} onClick={(e) => e.stopPropagation()} style={{
          position: "fixed", left: popPos ? popPos.left : -9999, top: popPos ? popPos.top : -9999,
          visibility: popPos ? "visible" : "hidden", width: 248, zIndex: 2000,
          background: "#0d0e15", borderRadius: T.radius.lg, padding: 14, border: `1px solid ${T.borderHover}`, boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
        }}>
          {popover.type === "log" ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 11 }}>Log a clip {"·"} {DAY_SHORT[wd.findIndex((d) => d.iso === popover.dayIso)]} {popover.slotTime}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
                {activeGames.map((g) => (
                  <div key={g.tag} onClick={() => logClip(g)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 9px", borderRadius: 6, cursor: "pointer", border: "1px solid transparent" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHover; e.currentTarget.style.borderColor = T.border; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
                  >
                    <span style={{ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: "#0a0b10", background: g.color }}>{g.tag}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: T.text }}>{g.name}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: T.textTertiary, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Platforms (optional)</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PLATFORM_KEYS.map((key) => {
                  const on = logSelectedPlatforms.includes(key);
                  const brand = PLATFORM_BRAND_COLORS[key];
                  return (
                    <button key={key} onClick={() => togglePlatform(key)} title={PLATFORM_LABELS[key]} style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: on ? `${brand}40` : T.surfaceHover,
                      border: `1px solid ${on ? brand : T.border}`,
                      fontFamily: T.font, fontSize: 10, fontWeight: 600, padding: "7px 10px", borderRadius: 999, cursor: "pointer",
                      transition: "background 0.15s, border-color 0.15s",
                    }}>
                      <PlatformIcon platform={key} size={14} style={{ opacity: on ? 1 : 0.45 }} />
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            (() => {
              const entry = popover.entry;
              const gd = resolveGameDisplay(entry.game);
              const isAuto = entry.source === "clipflow";
              const srcLabel = isAuto ? (entry.scheduled ? "Scheduled via ClipFlow" : "Published via ClipFlow") : "Logged manually";
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: `${gd.color}33`, color: gd.color, fontSize: 11, fontWeight: 800, fontFamily: T.mono }}>{gd.tag}</div>
                    <div>
                      <div style={{ color: T.text, fontSize: 14, fontWeight: 700 }}>{gd.name}</div>
                      <div style={{ color: T.textTertiary, fontSize: 11, fontFamily: T.mono }}>{DAY_SHORT[wd.findIndex((d) => d.iso === entry.date)] || entry.day} {"·"} {entry.time}</div>
                    </div>
                  </div>
                  {entry.platformResults && entry.platformResults.length > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                      {entry.platformResults.map((row, i) => {
                        const label = PLATFORM_LABELS[row.platform] || row.platform;
                        return row.url ? (
                          <span key={i} onClick={() => window.clipflow?.openExternal?.(row.url)} title={`${label} · view post`} style={{
                            position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
                            width: 30, height: 30, borderRadius: 8, cursor: "pointer",
                            background: T.accentDim, border: `1px solid ${T.accentBorder}`,
                          }}>
                            <PlatformIcon platform={row.platform} size={16} />
                            <span style={{ position: "absolute", bottom: -3, right: -3, width: 12, height: 12, borderRadius: "50%", background: "#0d0e15", color: T.accentLight, fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>{"↗"}</span>
                          </span>
                        ) : (
                          <span key={i} title={label} style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 30, height: 30, borderRadius: 8, opacity: 0.6,
                            background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`,
                          }}>
                            <PlatformIcon platform={row.platform} size={16} />
                          </span>
                        );
                      })}
                    </div>
                  ) : entry.platforms ? (
                    <div style={{ color: T.textTertiary, fontSize: 11, marginBottom: 10 }}>{entry.platforms}</div>
                  ) : null}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: isAuto ? T.cyan : "rgba(255,255,255,0.6)", boxShadow: isAuto ? `0 0 6px ${T.cyan}88` : "0 0 5px rgba(255,255,255,0.2)" }} />
                    <span style={{ color: isAuto ? T.cyan : T.textTertiary, fontSize: 11, fontWeight: 600 }}>{srcLabel}</span>
                  </div>
                  <button onClick={() => removeEntry(entry)} style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: `1px solid ${T.redBorder}`, background: T.redDim, color: T.red, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(248,113,113,0.15)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = T.redDim; }}
                  >Remove</button>
                </>
              );
            })()
          )}
        </div>
      )}

      {/* ---- Template mini-editor overlay ---- */}
      {showTemplateEditor && (
        <div style={{ position: "fixed", inset: 0, zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={() => setShowTemplateEditor(false)} style={{ position: "absolute", inset: 0, background: "rgba(5,6,10,0.6)" }} />
          <div style={{ position: "relative", width: 360, maxHeight: "80vh", overflowY: "auto", background: T.surface, border: `1px solid ${T.borderHover}`, borderRadius: T.radius.lg, padding: 18, boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Edit this week's slots</span>
              <button onClick={() => setShowTemplateEditor(false)} style={{ background: "none", border: "none", color: T.textTertiary, fontSize: 16, cursor: "pointer", lineHeight: 1 }}>{"×"}</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {effectiveTemplate.timeSlots.map((slot, si) => (
                <div key={si} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}` }}>
                  {editingTimeSlot === si ? (
                    <input value={timeSlotVal} onChange={(e) => setTimeSlotVal(e.target.value)}
                      onBlur={() => editTimeSlot(si, timeSlotVal)}
                      onKeyDown={(e) => { if (e.key === "Enter") editTimeSlot(si, timeSlotVal); if (e.key === "Escape") setEditingTimeSlot(null); }}
                      autoFocus style={{ flex: 1, padding: "3px 6px", borderRadius: 4, border: `1px solid ${T.accentBorder}`, background: "rgba(255,255,255,0.06)", color: T.text, fontSize: 12, fontFamily: T.mono, outline: "none" }} />
                  ) : (
                    <span onClick={() => { setEditingTimeSlot(si); setTimeSlotVal(slot); }} style={{ flex: 1, fontSize: 12, fontFamily: T.mono, color: T.text, cursor: "pointer" }}>{slot}</span>
                  )}
                  <button onClick={() => removeTimeSlot(si)} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 11, cursor: "pointer", padding: "0 2px" }}>{"×"}</button>
                </div>
              ))}
            </div>

            {showAddSlot ? (
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                <input value={newSlotVal} onChange={(e) => setNewSlotVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addTimeSlot(newSlotVal); if (e.key === "Escape") { setShowAddSlot(false); setNewSlotVal(""); } }}
                  placeholder="e.g. 10:30 AM" autoFocus
                  style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.accentBorder}`, background: "rgba(255,255,255,0.04)", color: T.text, fontSize: 12, fontFamily: T.mono, outline: "none" }} />
                <button onClick={() => addTimeSlot(newSlotVal)} style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: T.green, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Add</button>
              </div>
            ) : (
              <button onClick={() => setShowAddSlot(true)} style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px dashed ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font, marginBottom: 14 }}>+ Add time slot</button>
            )}

            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
              {showSaveAs ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input value={presetName} onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePreset()} placeholder="Preset name..." autoFocus
                    style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.accentBorder}`, background: "rgba(255,255,255,0.04)", color: T.text, fontSize: 12, fontFamily: T.font, outline: "none" }} />
                  <button onClick={savePreset} style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: T.green, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save</button>
                  <button onClick={() => setShowSaveAs(false)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <div ref={presetDropRef} style={{ position: "relative" }}>
                    <button onClick={() => setShowPresetDrop((o) => !o)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${currentPresetName === "Custom" ? T.yellowBorder : T.border}`, background: currentPresetName === "Custom" ? "rgba(251,191,36,0.06)" : "transparent", color: currentPresetName === "Custom" ? T.yellow : T.textTertiary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>
                      {currentPresetName} <span style={{ fontSize: 8, marginLeft: 2 }}>{"▼"}</span>
                    </button>
                    {showPresetDrop && (
                      <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: T.surface, border: `1px solid ${T.borderHover}`, borderRadius: T.radius.md, padding: 4, minWidth: 160, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 100 }}>
                        <button onClick={clearOverride} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "none", background: currentPresetName === "Default" ? "rgba(139,92,246,0.1)" : "transparent", color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font, textAlign: "left", display: "flex", justifyContent: "space-between" }}>
                          Default {currentPresetName === "Default" && <span style={{ color: T.green }}>{"✓"}</span>}
                        </button>
                        {(savedTemplates || []).map((p, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center" }}>
                            <button onClick={() => loadPreset(p.template)} style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "none", background: currentPresetName === p.name ? "rgba(139,92,246,0.1)" : "transparent", color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font, textAlign: "left", display: "flex", justifyContent: "space-between" }}>
                              {p.name} {currentPresetName === p.name && <span style={{ color: T.green }}>{"✓"}</span>}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); deletePreset(i); }} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 10, cursor: "pointer", padding: "4px 8px" }}>{"✕"}</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setShowSaveAs(true)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save as{"…"}</button>
                  <button onClick={setAsDefault} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Set as default</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- Toast ---- */}
      <div style={{
        position: "fixed", bottom: 26, left: "50%", transform: `translateX(-50%) translateY(${toastMsg ? 0 : 10}px)`,
        background: "#0d0e15", border: `1px solid ${T.borderHover}`, color: T.text, fontSize: 12, fontWeight: 500,
        padding: "11px 18px", borderRadius: T.radius.md, boxShadow: "0 14px 40px rgba(0,0,0,0.6)",
        opacity: toastMsg ? 1 : 0, pointerEvents: "none", transition: "opacity 0.25s, transform 0.25s",
        zIndex: 4000, display: "flex", alignItems: "center", gap: 9,
      }}>
        <span style={{ color: T.green }}>{"✓"}</span>
        <span>{toastMsg}</span>
      </div>

      <style>{`@keyframes tp-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .55; transform: scale(.8); } }`}</style>
    </div>
  );
}

// ---------- small internal subcomponents ----------

function SectionLbl({ children }) {
  return <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: T.textTertiary, fontWeight: 600 }}>{children}</span>;
}

function Pill({ children }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 600, color: T.text, padding: "6px 12px", borderRadius: 999, background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}` }}>
      {children}
    </span>
  );
}

function StakesBar({ posted, target, streak, daysLeft, now, streakOverVariant, gameColor }) {
  const remaining = Math.max(0, target - posted);
  const safe = remaining <= 0;
  const weekdayLabel = now.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric" });

  if (safe) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 12, borderRadius: T.radius.lg, padding: "14px 18px", marginBottom: 18,
        border: "1px solid rgba(52,211,153,0.32)", background: "linear-gradient(90deg, rgba(52,211,153,0.07), transparent 60%)",
      }}>
        <span style={{ fontSize: 18, lineHeight: 1, color: T.green, flexShrink: 0, animation: "tp-pulse 2.6s ease-in-out infinite" }}>{"▲"}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.35 }}>
          Streak safe {"—"} extends to <b style={{ fontFamily: T.mono, color: T.green }}>{streak + 1}</b> this week.
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: T.textTertiary, fontWeight: 500, flexShrink: 0, whiteSpace: "nowrap" }}>Goal reached {"·"} {target} of {target}</span>
      </div>
    );
  }

  const hitMoreLine = streak === 0
    ? <>Hit <b style={{ fontFamily: T.mono, color: gameColor }}>{remaining} more</b> by Saturday to start your streak.</>
    : <>Hit <b style={{ fontFamily: T.mono, color: gameColor }}>{remaining} more</b> by Saturday to keep your {streak}-week streak alive.</>;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, borderRadius: T.radius.lg, padding: "14px 18px", marginBottom: 18,
      border: "1px solid rgba(251,191,36,0.28)", background: T.surface,
    }}>
      <span style={{ fontSize: 18, lineHeight: 1, color: T.accent, flexShrink: 0, animation: "tp-pulse 2.6s ease-in-out infinite" }}>{"▲"}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.35 }}>
        {streakOverVariant ? <>Streak over {"—"} a new one starts now. </> : null}
        {hitMoreLine}
      </span>
      <span style={{ marginLeft: "auto", fontSize: 11, color: T.textTertiary, fontWeight: 500, flexShrink: 0, whiteSpace: "nowrap" }}>
        {weekdayLabel} {"·"} {daysLeft} day{daysLeft === 1 ? "" : "s"} left
      </span>
    </div>
  );
}

const ghostBtnStyle = {
  padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)",
  color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
};
