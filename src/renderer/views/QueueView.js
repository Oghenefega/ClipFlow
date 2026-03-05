import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import T from "../styles/theme";
import { Card, PageHeader, SectionLabel, Badge, Select, InfoBanner, extractGameTag, hasHashtag } from "../components/shared";

const DAY_NAMES = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const FULL_DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const TIME_SLOTS = ["12:30 PM","1:30 PM","2:30 PM","3:30 PM","4:30 PM","7:30 PM","8:30 PM","9:30 PM"];
const MONTHS_2026 = Array.from({ length: 12 }, (_, i) => ({ value: `2026-${String(i + 1).padStart(2, "0")}`, label: new Date(2026, i, 1).toLocaleString("en-US", { month: "long", year: "numeric" }) }));
const STAGGER_MS = 30000; // 30 seconds between platforms

const genTimeOptions = () => {
  const o = [];
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 5) {
    const hr = h % 12 || 12, ap = h < 12 ? "AM" : "PM";
    o.push({ value: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, label: `${hr}:${String(m).padStart(2, "0")} ${ap}` });
  }
  return o;
};
const TIME_OPTIONS = genTimeOptions();

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
const getUpcomingDates = () => {
  const d = [], n = new Date();
  for (let i = 0; i < 14; i++) {
    const x = new Date(n); x.setDate(n.getDate() + i);
    const dn = FULL_DAY_NAMES[x.getDay()];
    if (dn === "Sunday") continue;
    d.push({ label: `${dn} ${x.toLocaleString("en-US", { month: "short" })} ${x.getDate()}`, dayName: dn, iso: x.toISOString().split("T")[0] });
  }
  return d;
};

// Build caption from template, replacing {title} and #{gametitle}
const buildCaption = (template, clipTitle, gameHashtag) => {
  if (!template) return clipTitle;
  return template
    .replace(/\{title\}/g, clipTitle)
    .replace(/#\{gametitle\}/g, `#${gameHashtag || "gaming"}`);
};

// Build YouTube title: {clip title} #gamename #shorts
// If the clip title already has the game hashtag, just append #shorts
const buildYouTubeTitle = (clipTitle, gameHashtag) => {
  const tag = `#${gameHashtag}`;
  const hasTag = clipTitle.toLowerCase().includes(tag.toLowerCase());
  if (hasTag) return `${clipTitle} #shorts`;
  return `${clipTitle} ${tag} #shorts`;
};

// Snap a time string to the nearest TIME_SLOT for tracker grid matching
const SLOT_MINUTES = TIME_SLOTS.map((s) => {
  const [t, ap] = s.split(" ");
  let [h, m] = t.split(":").map(Number);
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + m;
});
const snapToSlot = (timeStr) => {
  // Parse a time like "3:45 PM" into minutes
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return timeStr;
  let h = parseInt(match[1]), m = parseInt(match[2]);
  const ap = match[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  const mins = h * 60 + m;
  // Find nearest slot
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < SLOT_MINUTES.length; i++) {
    const d = Math.abs(SLOT_MINUTES[i] - mins);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return TIME_SLOTS[best];
};

// Find the game name from a clip's hashtag
const findGameFromClip = (clipTitle, gamesDb) => {
  const tag = extractGameTag(clipTitle);
  if (!tag) return null;
  return gamesDb.find((g) => g.hashtag === tag) || null;
};

export default function QueueView({
  allClips, mainGame, mainGameTag, platforms, trackerData, setTrackerData,
  weeklyTemplate, setWeeklyTemplate, weekTemplateOverrides, setWeekTemplateOverrides,
  savedTemplates, setSavedTemplates, ytDescriptions, captionTemplates, gamesDb,
}) {
  const approved = Object.values(allClips).flat().filter((c) => (c.status === "approved" || c.status === "ready") && hasHashtag(c.title));
  const mainCount = approved.filter((c) => extractGameTag(c.title) === mainGameTag).length;
  const [selClip, setSelClip] = useState(null);
  const [schedAction, setSchedAction] = useState(null);
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("12:30");
  // publishStatus: { [clipId]: { state: "publishing"|"done"|"failed", platforms: { [key]: "pending"|"publishing"|"done"|"failed"|errorMsg } } }
  const [publishStatus, setPublishStatus] = useState({});
  const [scheduled, setScheduled] = useState({});
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthJump, setMonthJump] = useState("");
  const [editTmpl, setEditTmpl] = useState(false);
  const fileRef = useRef(null);
  const publishingRef = useRef(false);
  const popoverRef = useRef(null);
  const [popover, setPopover] = useState(null); // { di, si, iso, dayName, type:"pick"|"info", entry?, rect }
  const [popPos, setPopPos] = useState(null); // measured popover position
  const [hoveredCell, setHoveredCell] = useState(null); // "di-si"
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [showPresetDrop, setShowPresetDrop] = useState(false);
  const presetDropRef = useRef(null);
  const dates = getUpcomingDates();
  const activePlat = platforms.filter((p) => p.connected && p.vizardAccountId);
  const refDate = new Date();
  refDate.setDate(refDate.getDate() + weekOffset * 7);
  const wd = getWeekDates(refDate);
  const mondayIso = wd[0].iso;
  const effectiveTemplate = weekTemplateOverrides?.[mondayIso] || weeklyTemplate;
  const hasOverride = !!(weekTemplateOverrides?.[mondayIso]);
  const wIsos = new Set(wd.map((d) => d.iso));
  const wEntries = trackerData.filter((e) => wIsos.has(e.date));
  const slotFilled = (iso, si) => wEntries.find((e) => e.date === iso && e.time && e.time.replace(/\s/g, "") === TIME_SLOTS[si].replace(/\s/g, ""));
  const mw = wEntries.filter((e) => e.type === "main").length;
  const ow = wEntries.filter((e) => e.type === "other").length;

  // Determine current preset name for display
  const currentPresetName = (() => {
    if (!hasOverride) return "Default";
    const match = (savedTemplates || []).find((p) => JSON.stringify(p.template) === JSON.stringify(effectiveTemplate));
    return match ? match.name : "Custom";
  })();

  const logPost = (clip, date, day, time) => {
    const gt = extractGameTag(clip.title) || "unknown";
    const snapped = snapToSlot(time);
    setTrackerData((p) => [...p, { date, day, time: snapped, title: clip.title, game: gt, type: gt === mainGameTag ? "main" : "other", platforms: activePlat.map((p) => p.abbr + "-" + p.name).join(", "), mainGameAtTime: mainGame }]);
  };

  // Shared publish logic — handles both "Publish Now" and "Schedule" with optional publishTime
  const publishClip = async (clipId, scheduleOpts) => {
    if (publishingRef.current) return;
    const clip = approved.find((c) => c.id === clipId);
    if (!clip || !clip.videoId) {
      setPublishStatus((p) => ({ ...p, [clipId]: { state: "failed", error: "Missing videoId — clip may need re-processing", platforms: {} } }));
      return;
    }

    publishingRef.current = true;
    const game = findGameFromClip(clip.title, gamesDb);
    const gameName = game?.name || "";
    const gameHashtag = game?.hashtag || "";

    // Initialize platform statuses
    const platStatuses = {};
    activePlat.forEach((p) => { platStatuses[p.key] = "pending"; });
    setPublishStatus((prev) => ({ ...prev, [clipId]: { state: "publishing", platforms: { ...platStatuses } } }));
    setSelClip(null);
    setSchedAction(null);

    // Build base timestamp for scheduled publishing
    let baseTimestamp = null;
    if (scheduleOpts) {
      const [hh, mm] = scheduleOpts.time.split(":").map(Number);
      baseTimestamp = new Date(`${scheduleOpts.date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`).getTime();
    }

    let allSuccess = true;

    for (let i = 0; i < activePlat.length; i++) {
      const plat = activePlat[i];

      setPublishStatus((prev) => ({
        ...prev,
        [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: "publishing" } },
      }));

      try {
        // Build caption based on platform type
        const isYouTube = plat.platform === "YouTube";
        let post;
        if (isYouTube) {
          const ytDesc = ytDescriptions?.[gameName];
          post = ytDesc?.desc || clip.title;
        } else {
          const templateKey = plat.platform.toLowerCase().replace(/ /g, "");
          const template = captionTemplates?.[templateKey] || captionTemplates?.tiktok || "{title}";
          post = buildCaption(template, clip.title, gameHashtag);
        }

        const publishOpts = {
          finalVideoId: clip.videoId,
          socialAccountId: plat.vizardAccountId,
          title: isYouTube ? buildYouTubeTitle(clip.title, gameHashtag) : undefined,
          post,
        };
        if (baseTimestamp) publishOpts.publishTime = baseTimestamp + (i * STAGGER_MS);

        const result = await window.clipflow.vizardPublishClip(publishOpts);

        if (result.error || (result.code && result.code !== 2000)) {
          const errMsg = result.error || result.errMsg || `Error code ${result.code}`;
          setPublishStatus((prev) => ({
            ...prev,
            [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: errMsg } },
          }));
          allSuccess = false;
        } else {
          setPublishStatus((prev) => ({
            ...prev,
            [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: "done" } },
          }));
        }
      } catch (err) {
        setPublishStatus((prev) => ({
          ...prev,
          [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: err.message || "Network error" } },
        }));
        allSuccess = false;
      }

      // Wait 30s between platforms when publishing now (not needed for scheduled)
      if (!baseTimestamp && i < activePlat.length - 1) {
        await new Promise((r) => setTimeout(r, STAGGER_MS));
      }
    }

    // Final status
    setPublishStatus((prev) => ({
      ...prev,
      [clipId]: { ...prev[clipId], state: allSuccess ? "done" : "failed" },
    }));

    // Log to tracker
    if (scheduleOpts) {
      const d = dates.find((x) => x.iso === scheduleOpts.date);
      const tl = TIME_OPTIONS.find((x) => x.value === scheduleOpts.time)?.label || scheduleOpts.time;
      setScheduled((p) => ({ ...p, [clipId]: `${d?.label || scheduleOpts.date} at ${tl}` }));
      logPost(clip, scheduleOpts.date, d?.dayName || "", tl);
    } else {
      const now = new Date();
      logPost(clip, now.toISOString().split("T")[0], FULL_DAY_NAMES[now.getDay()], now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    }

    publishingRef.current = false;
  };

  const pubNow = (clipId) => publishClip(clipId, null);
  const schedClip = (clipId) => publishClip(clipId, { date: schedDate, time: schedTime });

  const toggleCell = (di, si) => {
    if (!editTmpl) return;
    setWeekTemplateOverrides((prev) => {
      const current = prev[mondayIso] || JSON.parse(JSON.stringify(weeklyTemplate));
      const updated = JSON.parse(JSON.stringify(current));
      updated[DAY_NAMES[di]][si] = updated[DAY_NAMES[di]][si] === "main" ? "other" : "main";
      return { ...prev, [mondayIso]: updated };
    });
  };

  // Resolve game display info from a hashtag (stored in tracker entries)
  const resolveGameDisplay = (hashtag) => {
    const g = gamesDb.find((x) => x.hashtag === hashtag);
    return g ? { name: g.name, color: g.color, tag: g.tag } : { name: hashtag, color: T.textMuted, tag: hashtag };
  };

  // Log a manual tracker entry
  const logManualEntry = (iso, dayName, si, game) => {
    setTrackerData((p) => [...p, {
      date: iso,
      day: dayName,
      time: TIME_SLOTS[si],
      title: "Manual entry",
      game: game.hashtag,
      type: game.hashtag === mainGameTag ? "main" : "other",
      platforms: "Manual",
      mainGameAtTime: mainGame,
    }]);
  };

  // Remove a tracker entry
  const removeTrackerEntry = (entry) => {
    setTrackerData((p) => p.filter((e) => !(e.date === entry.date && e.time === entry.time && e.game === entry.game)));
    setPopover(null);
  };

  // Handle cell click — routes based on mode and state
  const handleCellClick = (di, si, e) => {
    if (editTmpl) { toggleCell(di, si); return; }
    const d = wd[di];
    const tmpl = effectiveTemplate[d.dayName]?.[si] || "main";
    const isM = tmpl === "main";
    const fl = slotFilled(d.iso, si);
    const rect = e.currentTarget.getBoundingClientRect();

    if (fl) {
      // Filled cell → info popover
      setPopover({ di, si, iso: d.iso, dayName: d.dayName, type: "info", entry: fl, rect });
    } else if (isM) {
      // Empty main cell → immediately log main game
      const mainG = gamesDb.find((g) => g.hashtag === mainGameTag);
      if (mainG) logManualEntry(d.iso, d.dayName, si, mainG);
    } else {
      // Empty other cell → game picker popover
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

  // Close popover when week changes
  useEffect(() => { setPopover(null); }, [weekOffset]);

  // Auto-size and position popover after render
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

  // Close preset dropdown on click-outside
  useEffect(() => {
    if (!showPresetDrop) return;
    const onClick = (e) => { if (presetDropRef.current && !presetDropRef.current.contains(e.target)) setShowPresetDrop(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showPresetDrop]);

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

  const exportCSV = () => {
    const h = "Date,Day,Time,Title,Game,Type,Platforms,MainGame\n";
    const r = trackerData.map((e) => `${e.date},${e.day},${e.time},"${(e.title || "").replace(/"/g, '""')}",${e.game},${e.type},"${e.platforms || ""}",${e.mainGameAtTime || ""}`).join("\n");
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
        return { date: c(p[0]), day: c(p[1]), time: c(p[2]), title: c(p[3]), game: c(p[4]), type: c(p[5]), platforms: c(p[6]), mainGameAtTime: c(p[7]) };
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

  // Platform status display helper
  const getPlatStatusIcon = (status) => {
    if (status === "pending") return { icon: "\u23f3", color: T.textMuted };
    if (status === "publishing") return { icon: "\u2b06", color: T.yellow };
    if (status === "done") return { icon: "\u2705", color: T.green };
    // Any other string is an error message
    return { icon: "\u274c", color: T.red };
  };

  return (
    <div>
      <PageHeader title="Queue & Schedule" subtitle={`${approved.length} clips ready`} />

      {/* Main / Other stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <Card style={{ padding: 20, borderColor: T.accentBorder, background: T.accentGlow }}>
          <SectionLabel>{mainGame}</SectionLabel>
          <div style={{ color: T.text, fontSize: 34, fontWeight: 800, fontFamily: T.mono, marginTop: 8 }}>{mainCount}</div>
        </Card>
        <Card style={{ padding: 20, borderColor: T.greenBorder, background: T.greenDim }}>
          <SectionLabel>Other</SectionLabel>
          <div style={{ color: T.text, fontSize: 34, fontWeight: 800, fontFamily: T.mono, marginTop: 8 }}>{approved.length - mainCount}</div>
        </Card>
      </div>

      {/* Approved clips list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {approved.map((clip) => {
          const isM = extractGameTag(clip.title) === mainGameTag;
          const ps = publishStatus[clip.id];
          const isPub = ps?.state === "done";
          const isPublishing = ps?.state === "publishing";
          const isFailed = ps?.state === "failed";
          const isSch = scheduled[clip.id];
          const isSel = selClip === clip.id;
          const hasVideoId = !!clip.videoId;
          return (
            <div key={clip.id}>
              <Card onClick={() => { if (!isPublishing) { setSelClip(isSel ? null : clip.id); setSchedAction(null); } }} style={{ padding: "14px 18px", borderLeft: `3px solid ${isM ? T.accent : T.green}`, borderColor: isSel ? T.accentBorder : isPub ? T.greenBorder : isFailed ? T.redBorder : T.border, background: isSel ? T.accentGlow : isPub ? "rgba(52,211,153,0.03)" : T.surface, opacity: isPub ? 0.6 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ flex: 1, color: T.text, fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clip.title}</div>
                  {isPub && <span style={{ color: T.green, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Published</span>}
                  {isPublishing && <span style={{ color: T.yellow, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Publishing...</span>}
                  {isFailed && !isPub && <span style={{ color: T.red, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Failed</span>}
                  {isSch && !isPub && !isPublishing && !isFailed && <span style={{ color: T.accent, fontSize: 11, fontWeight: 600, fontFamily: T.mono, flexShrink: 0 }}>Scheduled {isSch}</span>}
                  {!hasVideoId && <span style={{ color: T.yellow, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>No video ID</span>}
                </div>
              </Card>

              {/* Publishing progress per platform */}
              {(isPublishing || isFailed) && ps?.platforms && (
                <Card style={{ padding: "14px 18px", marginTop: 4, borderColor: isPublishing ? T.yellowBorder : T.redBorder }}>
                  <SectionLabel>{isPublishing ? "Publishing to platforms..." : "Publish results"}</SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                    {activePlat.map((plat) => {
                      const status = ps.platforms[plat.key] || "pending";
                      const { icon, color } = getPlatStatusIcon(status);
                      const isError = status !== "pending" && status !== "publishing" && status !== "done";
                      return (
                        <div key={plat.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                          <span style={{ fontSize: 14, width: 20, textAlign: "center" }}>{icon}</span>
                          <span style={{ color: T.text, fontSize: 13, fontWeight: 600, minWidth: 100 }}>{plat.abbr} — {plat.name}</span>
                          <span style={{ color, fontSize: 12, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {status === "pending" ? "Waiting..." : status === "publishing" ? "Sending..." : status === "done" ? "Sent" : status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {isFailed && ps.error && (
                    <div style={{ marginTop: 10, color: T.red, fontSize: 12, fontWeight: 600 }}>{ps.error}</div>
                  )}
                </Card>
              )}

              {/* Publish/Schedule action panel */}
              {isSel && !isPub && !isPublishing && (
                <Card style={{ padding: "16px 20px", marginTop: 4, borderColor: T.accentBorder }}>
                  {!hasVideoId && (
                    <div style={{ marginBottom: 12 }}>
                      <InfoBanner color={T.yellow} icon={"\u26a0\ufe0f"}>This clip has no Vizard video ID. It may need to be re-processed before publishing.</InfoBanner>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginBottom: schedAction === "schedule" ? 14 : 0 }}>
                    <button onClick={() => pubNow(clip.id)} disabled={!hasVideoId || publishingRef.current} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: hasVideoId ? T.green : "rgba(255,255,255,0.04)", color: hasVideoId ? "#fff" : T.textMuted, fontSize: 13, fontWeight: 700, cursor: hasVideoId ? "pointer" : "default", fontFamily: T.font }}>Publish Now</button>
                    <button onClick={() => setSchedAction("schedule")} disabled={!hasVideoId} style={{ padding: "10px 20px", borderRadius: 8, border: schedAction === "schedule" ? `1px solid ${T.accentBorder}` : `1px solid ${T.border}`, background: schedAction === "schedule" ? T.accentDim : "rgba(255,255,255,0.03)", color: schedAction === "schedule" ? T.accentLight : T.textSecondary, fontSize: 13, fontWeight: 700, cursor: hasVideoId ? "pointer" : "default", fontFamily: T.font }}>Schedule</button>
                  </div>
                  {schedAction === "schedule" && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <Select value={schedDate} onChange={setSchedDate} options={[{ value: "", label: "Pick date..." }, ...dates.map((d) => ({ value: d.iso, label: d.label }))]} style={{ padding: "10px 14px", fontSize: 13 }} />
                      <Select value={schedTime} onChange={setSchedTime} options={TIME_OPTIONS} style={{ padding: "10px 14px", fontSize: 13 }} />
                      <button onClick={() => schedClip(clip.id)} disabled={!schedDate || publishingRef.current} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: schedDate ? T.accent : "rgba(255,255,255,0.04)", color: schedDate ? "#fff" : T.textMuted, fontSize: 13, fontWeight: 700, cursor: schedDate ? "pointer" : "default", fontFamily: T.font }}>Confirm</button>
                    </div>
                  )}
                </Card>
              )}
            </div>
          );
        })}
        {approved.length === 0 && (
          <Card style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{"\ud83d\udccb"}</div>
            <div style={{ color: T.textSecondary, fontSize: 15, fontWeight: 600 }}>No clips queued</div>
            <div style={{ color: T.textTertiary, fontSize: 13, marginTop: 8 }}>Approve clips in the Projects tab to see them here.</div>
          </Card>
        )}
      </div>

      {/* Publishing order */}
      <Card style={{ padding: "14px 20px", marginBottom: 28 }}>
        <SectionLabel>Publishing to {activePlat.length} accounts · 30s stagger</SectionLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {activePlat.map((p, i) => (
            <span key={i} style={{ background: "rgba(255,255,255,0.03)", padding: "5px 12px", borderRadius: 8, color: T.textSecondary, fontSize: 12, fontWeight: 600, border: `1px solid ${T.border}` }}>{i + 1}. {p.abbr} — {p.name}</span>
          ))}
        </div>
        {activePlat.length === 0 && (
          <div style={{ marginTop: 10 }}>
            <InfoBanner color={T.yellow} icon={"\u26a0\ufe0f"}>No connected platforms with Vizard account IDs. Check Settings.</InfoBanner>
          </div>
        )}
      </Card>

      {/* TRACKER */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h3 style={{ color: T.text, fontSize: 20, fontWeight: 800, margin: 0 }}>Tracker</h3>
            {editTmpl ? (
              showSaveAs ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input value={presetName} onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePreset()} placeholder="Preset name..." autoFocus style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.accentBorder}`, background: "rgba(255,255,255,0.04)", color: T.text, fontSize: 12, fontFamily: T.font, outline: "none", width: 120 }} />
                  <button onClick={savePreset} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: T.green, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save</button>
                  <button onClick={() => setShowSaveAs(false)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button onClick={() => { setEditTmpl(false); setShowSaveAs(false); }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Done</button>
                  <button onClick={setAsDefault} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Set as Default</button>
                  <button onClick={() => setShowSaveAs(true)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save As...</button>
                </div>
              )
            ) : (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={() => setEditTmpl(true)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Edit Template</button>
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
          {[{ l: "This Week", v: `${wEntries.length}/48`, c: T.text }, { l: mainGame, v: String(mw), c: T.accent }, { l: "Other", v: String(ow), c: T.green }].map((s) => (
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
        <div style={{ overflowX: "auto", position: "relative" }}>
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
              {TIME_SLOTS.map((slot, si) => (
                <tr key={si}>
                  <td style={{ color: T.textSecondary, fontSize: 12, fontWeight: 600, fontFamily: T.mono, padding: "3px 6px" }}>{slot}</td>
                  {wd.map((d, di) => {
                    const tmpl = effectiveTemplate[d.dayName]?.[si] || "main";
                    const isM = tmpl === "main";
                    const fl = slotFilled(d.iso, si);
                    const cellKey = `${di}-${si}`;
                    const isHov = hoveredCell === cellKey && !editTmpl;
                    const gameDisp = fl ? resolveGameDisplay(fl.game) : null;
                    const filledColor = gameDisp?.color || (isM ? T.accent : T.green);
                    return (
                      <td key={di} style={{ padding: 2 }}>
                        <div
                          onClick={(e) => handleCellClick(di, si, e)}
                          onMouseEnter={() => !editTmpl && setHoveredCell(cellKey)}
                          onMouseLeave={() => setHoveredCell(null)}
                          style={{
                            height: 38, borderRadius: 6, cursor: "pointer", transition: "all 0.15s ease",
                            background: fl
                              ? `${filledColor}${isHov ? "66" : "59"}` // filled: game color at ~35-40% opacity
                              : isHov
                                ? (isM ? "rgba(139,92,246,0.15)" : "rgba(52,211,153,0.15)")
                                : (isM ? "rgba(139,92,246,0.06)" : "rgba(52,211,153,0.06)"),
                            border: editTmpl
                              ? `1px dashed ${isM ? "rgba(139,92,246,0.4)" : "rgba(52,211,153,0.4)"}`
                              : fl
                                ? `1px solid ${filledColor}44`
                                : isHov ? `1px solid ${isM ? "rgba(139,92,246,0.3)" : "rgba(52,211,153,0.3)"}` : "1px solid transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: fl ? 11 : 10, fontWeight: 700, fontFamily: fl ? T.mono : T.font,
                            color: fl ? "rgba(255,255,255,0.95)" : isHov ? (isM ? T.accent : T.green) : T.textMuted,
                            transform: isHov && fl ? "scale(1.04)" : "none",
                          }}
                        >
                          {editTmpl ? (isM ? "M" : "O") : fl ? (gameDisp?.tag || "\u2713") : (isHov ? "+" : (isM ? "M" : "O"))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
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
                    {/* Also allow selecting main game from "other" slot */}
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
                  {/* Info popover for filled cells */}
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
                        <div style={{ color: T.textTertiary, fontSize: 11, marginBottom: 12 }}>
                          {popover.entry.platforms === "Manual" ? "Logged manually" : popover.entry.platforms || "—"}
                        </div>
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

        {editTmpl && <div style={{ marginTop: 12 }}><InfoBanner icon={"\u270f\ufe0f"}>Click cells to toggle Main (M) / Other (O).</InfoBanner></div>}
        {!editTmpl && <div style={{ marginTop: 12 }}><InfoBanner icon={"\ud83d\udcdd"}>Click empty cells to log uploads. Click filled cells to view or remove.</InfoBanner></div>}
      </div>
      {/* Bottom padding so tracker grid isn't cut off */}
      <div style={{ height: 60 }} />
    </div>
  );
}
