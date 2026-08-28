import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import T from "../styles/theme";
import PlatformIcon from "../components/PlatformIcon";
import { toFileUrl } from "../components/shared";
import {
  ledgerTotal, rankForXp, weekEntries, paceInfo, computeRecap, localISO, addDaysISO, mondayISO,
  XP_PER_CLIP,
} from "../utils/trackerEngine";
import { renderRecapPng, downloadBlob, copyBlobToClipboard } from "../utils/recapCardImage";
import { streakByWeek, weekAggregate, groupByLocalDate } from "../utils/trackerCalendarModel";

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

// Slot times are compared as whitespace-free strings all over this view ("3:30 PM" vs
// "3:30PM" both occur); one helper so the drag code matches the week-log grid's rule.
const norm12 = (t) => (t || "").replace(/\s/g, "").toUpperCase();

// #282 edge-of-calendar week travel: how wide the hot strip is, how long the cursor
// must dwell before the first flip, and how fast it repeats while held there.
const EDGE_PX = 30;
const EDGE_DWELL_MS = 550;
const EDGE_REPEAT_MS = 800;
// No dragover for this long means the cursor left the window — stop travelling.
const EDGE_STALE_MS = 1200;

// Game colours in gamesDb are 6-digit hex, but the unknown-game fallback is already an
// rgba() string — so alpha can't just be appended. Falls back to plain white at the same
// alpha, which is what an untagged clip should look like anyway.
const rgba = (c, a) => {
  if (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c)) {
    const n = parseInt(c.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  return `rgba(var(--lift),${a})`;
};

// #328: the remaining literal "#0a0b10"s in this file are dark text sitting on
// a GAME colour (g.color / gd.color / gameColor). Game colours are the user's
// data and identical in every theme, so the text on them is too — do not swap
// those for T.onSolid, which flips to white and would vanish on a pale tag.

// The card already wears the game's tag pill and colour, so the title's trailing
// #rocketleague is pure noise at 10px. Keep the raw title if it was ONLY hashtags.
const cleanTitle = (t) => (t || "").replace(/\s*#[A-Za-z0-9_]+/g, "").trim() || (t || "");

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
  scheduledClips,
  needsRetryClips,
  gameArt = {},
  clipIndex,
  onOpenInEditor,
  onOpenQueue,
  onRescheduleClip,
  onRepostClip,
}) {
  // #276: the Calendar sub-view folded into week navigation — one view, offset in
  // weeks from today. 0 = live current week, negative = frozen past, positive = preview.
  const [weekOffset, setWeekOffset] = useState(0);
  // Live clock: the tab pane stays mounted from app launch, so a frozen Date would
  // keep highlighting yesterday after midnight. Tick once a minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const wd = useMemo(() => {
    const ref = new Date(now);
    ref.setDate(ref.getDate() + weekOffset * 7);
    return getWeekDates(ref);
  }, [now, weekOffset]);
  const monday = wd[0].iso; // Monday of the VIEWED week — everything below keys off it
  const curMonday = useMemo(() => mondayISO(now), [now]);
  const todayIso = localISO(now);
  const todayIdx = wd.findIndex((d) => d.iso === todayIso);
  const viewMode = weekOffset === 0 ? "current" : weekOffset > 0 ? "future" : "past";

  const activeGames = useMemo(() => gamesDb.filter((g) => g.active !== false), [gamesDb]);
  // #276: past weeks render the game frozen in that week's snapshot, not today's pick.
  const viewedGameName = (viewMode === "past" && weekMeta?.[monday]?.nowPlaying) || mainGame;
  const currentGame = gamesDb.find((g) => g.name === viewedGameName);
  const gameColor = currentGame?.color || T.accent;
  const gameTag = currentGame?.tag || "";

  const thisWeekMeta = weekMeta?.[monday];
  // #276: a past week with no frozen snapshot is "untracked" — it must not borrow
  // today's target and read as missed. null target = no goal existed that week.
  const target = viewMode === "past" ? (thisWeekMeta?.target ?? null) : (thisWeekMeta?.target ?? weeklyTarget);

  const thisWeekEntries = useMemo(() => weekEntries(trackerData, monday), [trackerData, monday]);
  const posted = thisWeekEntries.length;
  // #218: scheduled clips are a PREVIEW — deliberately not folded into thisWeekEntries,
  // so they never touch `posted`, the pace ring, the streak or XP. Nothing is banked
  // until the scheduler actually publishes and QueueView's logPost writes the entry.
  const schedByDate = useMemo(() => {
    const m = new Map();
    for (const c of scheduledClips || []) {
      if (!m.has(c.date)) m.set(c.date, []);
      m.get(c.date).push(c);
    }
    return m;
  }, [scheduledClips]);
  // #315: clips that partly published and are waiting on a retry. Kept OUT of
  // schedByDate on purpose — they must not count as "scheduled" in the week
  // aggregate any more than they count as posted. They are a visual only, so the
  // clip stops vanishing from the calendar between firing and being fixed.
  const retryByDate = useMemo(() => {
    const m = new Map();
    for (const c of needsRetryClips || []) {
      if (!m.has(c.date)) m.set(c.date, []);
      m.get(c.date).push(c);
    }
    return m;
  }, [needsRetryClips]);
  // #276: one aggregate call gives the viewed week its state machine — current /
  // future / hit / missed / untracked / noData — plus frozen streak numbers and the
  // Mon..Sun scheduled count, exactly as the retired Calendar derived them.
  const streakMap = useMemo(() => streakByWeek(weekMeta), [weekMeta]);
  const entriesByDate = useMemo(() => groupByLocalDate(trackerData), [trackerData]);
  const weekAgg = useMemo(() => weekAggregate({
    mondayIso: monday, weekMeta, entriesByDate, scheduledByDate: schedByDate,
    streakMap, todayMondayIso: curMonday, streakState,
  }), [monday, weekMeta, entriesByDate, schedByDate, streakMap, curMonday, streakState]);
  // Main vs variety is computed live against the current Now Playing game (not the
  // stored write-time `type`), so switching games mid-week re-buckets the whole week.
  // entry.game holds the lowercased short tag ("rl") for auto-posts and the hashtag
  // ("rocketleague") for manual logs — match either.
  const mainTagLc = (currentGame?.tag || "").toLowerCase();
  const mainHashtagLc = (currentGame?.hashtag || "").toLowerCase();
  const mainCount = thisWeekEntries.filter((e) => {
    const g = (e.game || "").toLowerCase();
    return g && (g === mainTagLc || g === mainHashtagLc);
  }).length;
  const varietyCount = posted - mainCount;

  const pace = useMemo(() => paceInfo({ posted, target, date: now }), [posted, target, now]);

  const totalXp = ledgerTotal(xpLedger);
  const rank = rankForXp(totalXp);
  const weekXp = posted * XP_PER_CLIP;

  const prevMonday = addDaysISO(monday, -7);
  const prevWeekOutcome = weekMeta?.[prevMonday]?.outcome;
  const streakOverVariant = prevWeekOutcome === "missed" && posted < target;
  // Context for the calm "streak lost" stakes state (Phase 2 decision 10): how long the
  // ended streak was, and what last week actually posted against its frozen target.
  const lostStreakLen = streakMap[prevMonday]?.lostStreak || 0;
  const prevWeekPosted = useMemo(() => weekEntries(trackerData, prevMonday).length, [trackerData, prevMonday]);
  const prevWeekTarget = weekMeta?.[prevMonday]?.target ?? weeklyTarget;

  const effectiveTemplate = weekTemplateOverrides?.[monday] || weeklyTemplate;
  const hasOverride = !!(weekTemplateOverrides?.[monday]);

  // #276: past weeks show the recap frozen at rollover; live computation is the
  // fallback for the current week (and past weeks from before recaps existed).
  const recap = useMemo(
    () => (viewMode === "past" && thisWeekMeta?.recap) ? thisWeekMeta.recap : computeRecap(thisWeekEntries),
    [viewMode, thisWeekMeta, thisWeekEntries]
  );
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
    // #276: arrowing into a past hit week flips goalReached too — only the live
    // week's transition is a moment worth celebrating.
    if (viewMode !== "current") return;
    if (goalReached && !prevGoalReached.current) {
      toast("Goal reached — recap ready to share");
    }
    prevGoalReached.current = goalReached;
  }, [goalReached, toast, viewMode]);

  // ---------- count-up animation ----------
  const [animPosted, setAnimPosted] = useState(0);
  const [animPct, setAnimPct] = useState(0);
  const [animXp, setAnimXp] = useState(0);
  const [ringReady, setRingReady] = useState(false);
  // Last values the counters actually displayed — each animation run starts from here,
  // so the counters re-animate whenever posted/target/totalXp change (data loading in
  // after mount, a new post logged live) instead of freezing at their mount-time values.
  const animFromRef = useRef({ posted: 0, pct: 0, xp: 0 });
  // #276: the ring counts posted clips on current/past weeks, scheduled clips on
  // future ones. A past untracked week has target null — 0%, never a full ring.
  const ringCount = viewMode === "future" ? weekAgg.sched : posted;
  useEffect(() => {
    const pct = target > 0 ? Math.round(Math.min(1, ringCount / target) * 100) : (viewMode === "current" ? 100 : 0);
    const done = () => {
      setAnimPosted(ringCount); setAnimPct(pct); setAnimXp(totalXp); setRingReady(true);
      animFromRef.current = { posted: ringCount, pct, xp: totalXp };
    };
    if (document.hidden) {
      done();
      return;
    }
    const from = { ...animFromRef.current };
    let raf;
    const start = performance.now();
    const dur = 900;
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const shown = {
        posted: Math.round(from.posted + (ringCount - from.posted) * e),
        pct: Math.round(from.pct + (pct - from.pct) * e),
        xp: Math.round(from.xp + (totalXp - from.xp) * e),
      };
      setAnimPosted(shown.posted);
      setAnimPct(shown.pct);
      setAnimXp(shown.xp);
      animFromRef.current = shown;
      if (p < 1) raf = requestAnimationFrame(step);
      else done();
    };
    setRingReady(true); // trigger CSS width/dashoffset transitions immediately
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ringCount, target, totalXp, viewMode]);

  // ---------- game switcher popover ----------
  // #281: the Now Playing card's Switch button only appears on hover, so the card
  // needs to know it's hovered (inline styles — no CSS class to hang :hover on).
  const [npHover, setNpHover] = useState(false);
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

  // #306: Repost — App copies the clip and its rendered file into a fresh
  // unscheduled clip, then we hand off to the Queue, where it is now waiting.
  // The Tracker itself grows no scheduling actions (tracker-now-playing.md): it
  // starts the copy and gets out of the way.
  const [reposting, setReposting] = useState(false);
  const [repostErr, setRepostErr] = useState(null);
  const doRepost = async (projectId, clipId) => {
    if (reposting) return;
    setReposting(true);
    setRepostErr(null);
    try {
      const res = await onRepostClip?.(projectId, clipId);
      if (res?.error) { setRepostErr(res.error); return; }
      closePopover();
      onOpenQueue?.();
    } catch (e) {
      setRepostErr(e.message || "Repost failed");
    } finally {
      setReposting(false);
    }
  };

  useEffect(() => { setRepostErr(null); }, [popover]);

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
    const place = () => {
      const { width: popW, height: popH } = el.getBoundingClientRect();
      const viewH = window.innerHeight;
      const viewW = window.innerWidth;
      const showAbove = pr.bottom + popH + 8 > viewH;
      const left = Math.max(8, Math.min(pr.left + pr.width / 2 - popW / 2, viewW - popW - 8));
      // Clamp into the viewport either way. The detail popover grew ~2.5× when it gained
      // the title and clip frame (#218), and flipping alone let the bottom edge hang off
      // the window when the card sat low in the week log.
      const top = Math.max(8, Math.min(showAbove ? pr.top - popH - 6 : pr.bottom + 6, viewH - popH - 8));
      setPopPos({ left, top });
    };
    place();
    // Content settles after mount (font swap, image decode), so re-place on any resize
    // of the popover rather than trusting the first measurement.
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [popover]);

  const openLogPopover = (dayIso, dayName, slotTime, rect) => {
    setLogSelectedPlatforms([]);
    setPopover({ type: "log", dayIso, dayName, slotTime, rect });
  };
  // One popover for both card kinds; `isSched` swaps the source line and the footer
  // action (Remove makes no sense for something that hasn't posted yet).
  const openDetailPopover = (entry, isSched, rect) => setPopover({ type: "detail", entry, isSched, rect });

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
      type: game.tag === mainGameTag ? "main" : "other",
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

  // entry.game holds the lowercased short tag ("rl") for auto-posts and the hashtag
  // ("rocketleague") for manual logs — match either, case-insensitively, like the
  // mainCount calculation above. Fallback tag is uppercased for display.
  const resolveGameDisplay = (raw) => {
    const key = (raw || "").toLowerCase();
    const g = gamesDb.find((x) => [x.hashtag, x.tag, x.name].some((v) => (v || "").toLowerCase() === key));
    return g ? { name: g.name, color: g.color, tag: g.tag } : { name: raw, color: T.textMuted, tag: (raw || "?").toUpperCase() };
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
  // #225 Part A: readable report columns. Real game names, Main/Variety,
  // Yes/No scheduled, one URL column per platform (stored url first, else
  // derivable postId patterns — never fabricated). PlatformResults JSON stays
  // last: it is the import round-trip payload; the human columns are derived
  // views of it.
  const fileRef = useRef(null);
  const SOURCE_LABELS = { clipflow: "Corva", import: "Imported", manual: "Manual", vizard: "Vizard" };
  const csvQuote = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const platformUrl = (e, platform) => {
    const r = (e.platformResults || []).find((x) => (x.platform || "").toLowerCase() === platform);
    if (!r) return "";
    if (r.url) return r.url;
    if (r.postId) {
      if (platform === "youtube") return `https://www.youtube.com/watch?v=${r.postId}`;
      // Legacy pre-Reels Facebook rows: pageId = accountId minus the fb_ prefix.
      if (platform === "facebook" && r.accountId) return `https://www.facebook.com/${String(r.accountId).replace(/^fb_/, "")}/videos/${r.postId}`;
    }
    return "";
  };
  const exportCSV = () => {
    const h = "Date,Day,Time,Title,Game,Type,Scheduled,Source,MainGame,YouTube,TikTok,Instagram,Facebook,PlatformResults\n";
    const r = trackerData.map((e) => [
      e.date, e.day, e.time,
      csvQuote(e.title || ""),
      csvQuote(resolveGameDisplay(e.game).name),
      e.type === "main" ? "Main" : "Variety",
      e.scheduled ? "Yes" : "No",
      SOURCE_LABELS[e.source] || e.source || "Unknown",
      csvQuote(e.mainGameAtTime || ""),
      csvQuote(platformUrl(e, "youtube")),
      csvQuote(platformUrl(e, "tiktok")),
      csvQuote(platformUrl(e, "instagram")),
      csvQuote(platformUrl(e, "facebook")),
      csvQuote(JSON.stringify(e.platformResults || [])),
    ].join(",")).join("\n");
    const b = new Blob([h + r], { type: "text/csv" });
    downloadBlob(b, `corva-tracker-${todayIso}.csv`);
  };

  // Header-aware import (#225): maps columns by header name so BOTH the legacy
  // 10-column layout and the new layout load cleanly. URL columns are ignored —
  // PlatformResults is the source of truth. Locked rule: CSV imports earn no XP.
  const splitCsvLine = (line) => {
    const out = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const importCSV = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = (ev) => {
      const lines = ev.target.result.split(/\r?\n/).filter((l) => l.trim());
      if (!lines.length) { toast("Imported 0 entries"); return; }
      const header = splitCsvLine(lines[0]).map((s) => s.toLowerCase());
      const col = (row, name) => { const i = header.indexOf(name); return i >= 0 ? (row[i] || "") : ""; };
      const SOURCE_RAW = { clipflow: "clipflow", imported: "import", manual: "manual", vizard: "vizard" };
      const entries = lines.slice(1).map((l) => {
        const row = splitCsvLine(l);
        let platformResults = [];
        try { platformResults = JSON.parse(col(row, "platformresults") || "[]"); } catch (err) { platformResults = []; }
        if (!Array.isArray(platformResults)) platformResults = [];
        // New-layout Game holds the display name; store the hashtag key the
        // per-game math matches on. Legacy tags resolve through the same lookup.
        const rawGame = col(row, "game");
        const g = gamesDb.find((x) => [x.name, x.hashtag, x.tag].some((v) => (v || "").toLowerCase() === rawGame.toLowerCase()));
        const rawType = col(row, "type").toLowerCase();
        const rawSource = col(row, "source");
        const entry = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          date: col(row, "date"), day: col(row, "day"), time: col(row, "time"), title: col(row, "title"),
          game: g ? (g.hashtag || g.tag) : rawGame,
          type: rawType === "variety" ? "other" : (rawType || "other"),
          platforms: col(row, "platforms") || platformResults.map((x) => (x.platform || "").replace(/^./, (c0) => c0.toUpperCase())).filter(Boolean).join(", "),
          mainGameAtTime: col(row, "maingame"),
          source: SOURCE_RAW[rawSource.toLowerCase()] || rawSource || "unknown",
          platformResults,
        };
        const sched = col(row, "scheduled").toLowerCase();
        if (sched === "yes") entry.scheduled = true;
        else if (sched === "no") entry.scheduled = false;
        return entry;
      }).filter((x) => x.date && x.time);
      setTrackerData((p) => [...p, ...entries]);
      toast(`Imported ${entries.length} entries`);
    };
    rd.readAsText(f);
    e.target.value = "";
  };

  // ---------- Weekly Rundown (shareable recap) ----------
  const [shareState, setShareState] = useState("idle"); // idle | saving | saved | copied
  const shareTimer = useRef(null);
  useEffect(() => () => clearTimeout(shareTimer.current), []);
  // Modal preview-first flow: header button opens the Rundown popup; the PNG only
  // downloads when the user clicks Download inside it.
  const [showRundown, setShowRundown] = useState(false);
  useEffect(() => {
    if (!showRundown) return;
    const onKey = (e) => { if (e.key === "Escape") setShowRundown(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showRundown]);

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
      downloadBlob(blob, `corva-rundown-${monday}.png`);
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

  // ---------- week navigation (#276) ----------
  // Anything anchored to the viewed week (popovers, the game picker, the slot
  // editor) closes on navigation so it can't act on a week it wasn't opened for.
  const goWeek = (delta) => {
    setWeekOffset((o) => o + delta);
    closePopover();
    setPickerOpen(false);
    setShowTemplateEditor(false);
  };

  // ---------- drag a scheduled clip to another slot (#282) ----------
  // Only clips that haven't published yet move: they carry `scheduledAt` on the clip
  // object and nothing has gone out to a platform. Posted entries are history.
  // The payload lives in a ref, not in dataTransfer — the source card unmounts when
  // the week flips mid-drag, and Chromium won't re-read dataTransfer for us anyway.
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [edgeDir, setEdgeDir] = useState(0); // -1 left, 0 none, 1 right
  const edgeDirRef = useRef(0);
  const edgeTimerRef = useRef(null);
  const lastEdgeMoveRef = useRef(0);
  const logCardRef = useRef(null);

  const stopEdgeTimer = () => { clearTimeout(edgeTimerRef.current); edgeTimerRef.current = null; };

  const endClipDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
    setEdgeDir(0);
    edgeDirRef.current = 0;
    stopEdgeTimer();
  }, []);

  // Two cleanup paths, because one isn't enough here. `dragend` fires on the source
  // card — but flipping the week unmounts that card, and events on a detached node
  // never reach the document. The backstop is mousemove: the OS suppresses mouse
  // events for the whole drag, so seeing one again proves the drag is over. The
  // grace window ignores the mousemove that initiated the drag in the first place.
  const dragStartedAt = useRef(0);
  useEffect(() => {
    if (!dragging) return;
    const onEnd = () => endClipDrag();
    const onMouseMove = () => { if (Date.now() - dragStartedAt.current > 300) endClipDrag(); };
    document.addEventListener("dragend", onEnd);
    document.addEventListener("mousemove", onMouseMove);
    return () => {
      document.removeEventListener("dragend", onEnd);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, [dragging, endClipDrag]);
  useEffect(() => stopEdgeTimer, []);

  const startClipDrag = (sched, e) => {
    dragRef.current = { projectId: sched.projectId, clipId: sched.clipId, date: sched.date, time: sched.time, title: sched.title };
    e.dataTransfer.effectAllowed = "move";
    // Firefox/Chromium won't start a drag at all without payload on the transfer.
    try { e.dataTransfer.setData("text/plain", sched.clipId || "clip"); } catch (err) { /* no-op */ }
    dragStartedAt.current = Date.now();
    setDragging(true);
  };

  // Hold the cursor at either edge of the calendar and the week travels, so a clip can
  // be moved into a week that isn't on screen (Fega, 2026-08-21). Dwell first, then
  // repeat, so brushing past an edge on the way to Monday never flips anything.
  const armEdge = (dir) => {
    stopEdgeTimer();
    edgeDirRef.current = dir;
    setEdgeDir(dir);
    if (!dir) return;
    const tick = (delay) => {
      edgeTimerRef.current = setTimeout(() => {
        if (!dragRef.current || edgeDirRef.current !== dir) return;
        // Chromium keeps firing dragover (~every 350ms) while a drag hovers a target,
        // even stationary. Silence means the cursor left the window — without this the
        // week would keep marching on in the background for the rest of the drag.
        if (Date.now() - lastEdgeMoveRef.current > EDGE_STALE_MS) { armEdge(0); return; }
        goWeek(dir);
        tick(EDGE_REPEAT_MS);
      }, delay);
    };
    tick(EDGE_DWELL_MS);
  };

  const onLogDragOver = (e) => {
    if (!dragRef.current || !logCardRef.current) return;
    lastEdgeMoveRef.current = Date.now();
    const r = logCardRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const dir = x < EDGE_PX ? -1 : x > r.width - EDGE_PX ? 1 : 0;
    if (dir !== edgeDirRef.current) armEdge(dir);
  };

  // dragleave fires constantly while crossing child elements; only a leave that lands
  // outside the card should disarm, or the timer would keep flipping off-screen.
  const onLogDragLeave = (e) => {
    if (!dragRef.current) return;
    const el = logCardRef.current;
    if (el && e.relatedTarget && el.contains(e.relatedTarget)) return;
    armEdge(0);
  };

  const slotDateTime = (dayIso, slotTime) => {
    const mins = parseTimeToMinutes(slotTime);
    if (isNaN(mins)) return null;
    return `${dayIso}T${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}:00`;
  };

  const dropOnSlot = (dayIso, dayName, slotTime) => {
    const d = dragRef.current;
    if (!d) return;
    const iso = slotDateTime(dayIso, slotTime);
    endClipDrag();
    if (!iso) return;
    if (d.date === dayIso && norm12(d.time) === norm12(slotTime)) return; // dropped where it already was
    if (new Date(iso).getTime() <= Date.now()) { toast("That slot has already passed"); return; }
    onRescheduleClip?.(d.projectId, d.clipId, iso);
    toast(`Moved to ${DAY_SHORT[DAY_NAMES.indexOf(dayName)]} ${"·"} ${shortSlot(slotTime)}`);
  };

  // ---------- ring geometry ----------
  const R = 36, C = 2 * Math.PI * R; // #279: 88px ring (was 142) — height budget
  const progFrac = target > 0 ? Math.min(1, ringCount / target) : (viewMode === "current" ? 1 : 0);
  const dashOffset = ringReady ? C * (1 - progFrac) : C;
  // #276: ring color by mode — live pace for the current week, frozen verdict for
  // past weeks (green hit / red miss / neutral untracked), scheduled yellow for future.
  const outcome = weekAgg.state; // current | future | hit | missed | untracked | noData
  const paceColor = viewMode === "current"
    ? (pace.status === "green" ? T.green : pace.status === "yellow" ? T.yellow : T.red)
    : viewMode === "future" ? T.yellow
      : outcome === "hit" ? T.green : outcome === "missed" ? T.red : T.textTertiary;
  const expFrac = viewMode === "current" && target > 0 ? Math.min(1, pace.expected / target) : 0;
  const tickDeg = expFrac * 360;
  const tickHidden = expFrac <= 0 || expFrac >= 1;

  return (
    <div style={{ fontFamily: T.font, color: T.text }}>
      {/* Header row — #281: the week nav moved onto the week-log card (it steers the
          calendar, so it belongs on it) and the "NOW PLAYING <game>" echo is gone —
          the Now Playing card directly below says the same thing, larger, with art. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: -8, marginBottom: 8, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>Tracker</h1>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {viewMode === "current" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 7, background: T.accentDim, border: `1px solid ${T.accentBorder}`, color: T.accentLight, fontSize: 11, fontWeight: 600, padding: "6px 11px", borderRadius: 999 }}>
              <span style={{ color: T.accent, fontSize: 13, lineHeight: 1 }}>{"▲"}</span>
              <span><b>{streakState?.current || 0}</b> weeks</span>
            </div>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700, padding: "6px 11px", borderRadius: 999,
              background: outcome === "hit" ? T.greenDim : outcome === "missed" ? T.redDim : "rgba(var(--lift),0.04)",
              border: `1px solid ${outcome === "hit" ? T.greenBorder : outcome === "missed" ? T.redBorder : T.border}`,
              color: outcome === "hit" ? T.green : outcome === "missed" ? T.red : viewMode === "future" ? T.yellow : T.textTertiary,
            }}>
              {viewMode === "future"
                ? <span>UPCOMING {"·"} {weekAgg.sched} scheduled</span>
                : outcome === "hit"
                  ? <span>HIT{weekAgg.streakAfter > 0 ? ` · ${weekAgg.streakAfter}-week streak` : ""}</span>
                  : outcome === "missed"
                    ? <span>MISSED{weekAgg.lostStreak > 0 ? ` · streak ended at ${weekAgg.lostStreak}` : ""}</span>
                    : <span>UNTRACKED</span>}
            </div>
          )}
          {viewMode === "current" && <button onClick={() => setShowRundown(true)} style={{
            display: "flex", alignItems: "center", gap: 7, background: T.text, color: T.onSolid, border: "none",
            fontFamily: T.font, fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: T.radius.md, cursor: "pointer",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M8 12h8M8 12l3-3M8 12l3 3M16 5h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h2" /></svg>
            Rundown
          </button>}
          <button onClick={exportCSV} style={ghostBtnStyle}>Export</button>
          <button onClick={() => fileRef.current?.click()} style={ghostBtnStyle}>Import</button>
          <input ref={fileRef} type="file" accept=".csv" onChange={importCSV} style={{ display: "none" }} />
        </div>
      </div>

      {/* Top row — #279: Now Playing + Weekly goal + Rank share ONE row so the week
          log (the main content) fits without scrolling even on short windows */}
      <div style={{ display: "grid", gridTemplateColumns: "0.95fr 1.15fr 0.95fr", gap: 14, marginBottom: 12 }}>
      {/* Now Playing card — #281: an album-cover card. The poster is the card's left
          edge at full height (was a 54x72 tile) and the two pills it used to carry are
          gone: the rank pill duplicated the Rank card one column over, and "N posted
          this week" duplicated the goal ring. Wash/border/hover-lift are the Projects
          list-row treatment (ProjectsView.js:1536-1570) so the tabs read as one app. */}
      <div
        onMouseEnter={() => setNpHover(true)}
        onMouseLeave={() => setNpHover(false)}
        style={{
          position: "relative", borderRadius: T.radius.lg, overflow: "hidden",
          display: "flex", alignItems: "stretch", gap: 0, padding: 0,
          background: `radial-gradient(90% 160% at 100% 0%, ${gameColor}1f 0%, transparent 55%), linear-gradient(100deg, ${gameColor}1a 0%, ${gameColor}06 42%, rgba(var(--lift),0.02) 68%), ${T.surface}`,
          border: `1px solid ${npHover ? `${gameColor}70` : `${gameColor}3d`}`,
          boxShadow: npHover ? "0 2px 4px rgba(var(--shade),calc(.5 * var(--shadeK))), 0 24px 56px -22px rgba(var(--shade),calc(.85 * var(--shadeK)))" : "none",
          transform: npHover ? "translateY(-1px)" : "none",
          transition: "border-color .18s ease, box-shadow .18s ease, transform .18s ease",
        }}>
        {pickerOpen && pickerPos && (
          <div ref={pickerRef} style={{
            position: "fixed", top: pickerPos.top, right: pickerPos.right, zIndex: 20, width: 300, maxHeight: 340, overflowY: "auto",
            background: T.surface, border: `1px solid ${T.borderHover}`, borderRadius: T.radius.lg, padding: 10, boxShadow: "0 18px 50px rgba(var(--shade),calc(0.6 * var(--shadeK)))",
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

        {/* Poster: the same cached Steam key art the Projects tab uses, now full-bleed
            down the card's left edge. The tag-on-colour block sits behind the image, so
            it is both the no-art fallback and what shows through if the path goes stale
            (external drive unplugged, art re-fetched). */}
        <div style={{
          position: "relative", flex: "0 0 92px", alignSelf: "stretch", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: T.mono, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "#0a0b10",
          background: gameColor,
        }}>
          {gameTag}
          {gameArt[viewedGameName]?.path && (
            <img
              src={`${toFileUrl(gameArt[viewedGameName].path)}?v=${gameArt[viewedGameName].v}`} alt=""
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          )}
          {/* vignette + a fade into the card so the poster reads as part of the surface
              rather than a photo pasted onto it */}
          <span style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(120% 90% at 50% 20%, transparent 40%, rgba(var(--shade),calc(0.45 * var(--shadeK)))), linear-gradient(90deg, transparent 58%, rgba(17,18,24,0.8) 100%)" }} />
        </div>

        <div style={{ position: "relative", zIndex: 1, flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 16px 16px 15px" }}>
          {/* Switch is a hover-reveal corner control (the Projects rows do the same with
              Review/Open) — it stays pinned open while the game picker is. */}
          {viewMode === "current" && (
            <button ref={pickerBtnRef} onClick={() => setPickerOpen((o) => !o)} style={{
              position: "absolute", top: 12, right: 12, display: "flex", alignItems: "center", gap: 5,
              background: "rgba(var(--bgRgb),0.55)", border: `1px solid ${T.borderHover}`,
              color: T.text, fontFamily: T.font, fontSize: 10, fontWeight: 600, padding: "4px 9px", borderRadius: 999, cursor: "pointer",
              opacity: npHover || pickerOpen ? 1 : 0, transition: "opacity .15s ease",
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M4 7h13M14 4l3 3-3 3M20 17H7M10 14l-3 3 3 3" /></svg>
              Switch
            </button>
          )}
          <div style={{ fontSize: 9.5, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.11em", color: T.textTertiary, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: gameColor, boxShadow: `0 0 8px ${gameColor}`, animation: viewMode === "current" ? "tp-pulse 2.2s ease-in-out infinite" : "none", opacity: viewMode === "current" ? 1 : 0.6, flexShrink: 0 }} />
            <span>{viewMode === "past" ? "Was playing" : "Now playing"}</span>
          </div>
          <h2 style={{
            fontSize: 21, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.08, margin: 0,
            overflowWrap: "break-word", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{viewedGameName}</h2>
        </div>
      </div>

        {/* Goal card */}
        <div style={{ background: PANEL_BG, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, padding: 14, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <SectionLbl>Weekly goal</SectionLbl>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: T.textTertiary, fontWeight: 600, marginRight: 8 }}>Target</span>
              {viewMode !== "current" ? (
                // #276: past targets are frozen (— when the week predates tracking);
                // future weeks preview today's default. Only the live week edits.
                <span style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 700, color: target == null ? T.textMuted : T.text, padding: "2px 7px" }}>{target ?? "—"}</span>
              ) : editingTarget ? (
                <input
                  type="number" min={1} max={400} value={targetVal} autoFocus
                  onChange={(e) => setTargetVal(e.target.value)}
                  onBlur={commitTarget}
                  onKeyDown={(e) => { if (e.key === "Enter") commitTarget(); if (e.key === "Escape") { setTargetVal(String(target)); setEditingTarget(false); } }}
                  style={{ width: 56, fontFamily: T.mono, fontSize: 16, fontWeight: 700, background: T.bg, border: `1px solid ${T.accent}`, color: T.text, borderRadius: 6, padding: "2px 7px", textAlign: "center", outline: "none" }}
                />
              ) : (
                <span onClick={() => setEditingTarget(true)} style={{ display: "inline-flex", alignItems: "baseline", fontFamily: T.mono, fontSize: 16, fontWeight: 700, color: T.text, cursor: "pointer", padding: "2px 7px", borderRadius: 6, border: "1px solid transparent" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHover; e.currentTarget.style.borderColor = T.border; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
                >{target}<span style={{ fontSize: 11, color: T.textTertiary, marginLeft: 6 }}>{"✎"}</span></span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
              <svg width="88" height="88" viewBox="0 0 88 88" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="44" cy="44" r={R} fill="none" stroke="rgba(var(--lift),0.06)" strokeWidth="7" />
                <circle cx="44" cy="44" r={R} fill="none" stroke={paceColor} strokeWidth="7" strokeLinecap="round"
                  strokeDasharray={C.toFixed(1)} strokeDashoffset={dashOffset.toFixed(1)}
                  style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1), stroke 0.4s" }} />
                {!tickHidden && (
                  <line x1="44" y1="8" x2="44" y2="16" stroke={T.bg} strokeWidth="3" strokeLinecap="round"
                    transform={`rotate(${tickDeg} 44 44)`} style={{ transition: "transform 0.9s cubic-bezier(.4,0,.2,1)" }} />
                )}
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: T.text }}>{animPosted}</span>
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.textTertiary, fontWeight: 500, marginTop: 2 }}>{target != null ? `of ${target}` : "posted"}</span>
                <span style={{ fontSize: 10, color: paceColor, fontWeight: 600, marginTop: 3, letterSpacing: "0.04em" }}>
                  {viewMode === "current" ? `${animPct}%`
                    : viewMode === "future" ? "scheduled"
                      : outcome === "hit" ? "HIT" : outcome === "missed" ? "MISSED" : "untracked"}
                </span>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.text, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: gameColor }} />{viewedGameName} <span style={{ fontFamily: T.mono, color: T.textSecondary, fontWeight: 500, marginLeft: 2 }}>{mainCount}</span>
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: T.textSecondary, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.textTertiary }} />Variety <span style={{ fontFamily: T.mono, marginLeft: 2 }}>{varietyCount}</span>
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(var(--lift),0.06)", overflow: "hidden", display: "flex" }}>
                  <div style={{ height: "100%", background: gameColor, width: ringReady && posted ? `${Math.round((mainCount / posted) * 100)}%` : "0%", transition: "width 0.6s cubic-bezier(.4,0,.2,1), background 0.4s" }} />
                  <div style={{ height: "100%", background: "rgba(var(--lift),0.22)", width: ringReady && posted ? `${Math.round((varietyCount / posted) * 100)}%` : "0%", transition: "width 0.6s cubic-bezier(.4,0,.2,1)" }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 500 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: paceColor, flexShrink: 0 }} />
                {viewMode === "current" ? (
                  <span>
                    <span style={{ color: paceColor, fontWeight: 600 }}>
                      {pace.diff === 0 ? "On pace" : pace.diff > 0 ? `${pace.diff} ahead of pace` : `${Math.abs(pace.diff)} behind pace`}
                    </span>{" "}
                    <span style={{ color: T.textSecondary }}>{"·"} {pace.expectedRounded} by now</span>
                  </span>
                ) : viewMode === "future" ? (
                  <span style={{ color: T.textSecondary }}><span style={{ color: paceColor, fontWeight: 600 }}>{weekAgg.sched} scheduled</span> {"·"} nothing posted yet</span>
                ) : (
                  <span style={{ color: T.textSecondary }}>
                    <span style={{ color: paceColor, fontWeight: 600 }}>
                      {outcome === "hit" ? "Goal hit" : outcome === "missed" ? "Goal missed" : "No goal tracked"}
                    </span>{" "}
                    {target != null ? <>{"·"} {posted} of {target} posted</> : <>{"·"} {posted} posted</>}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Rank card */}
        <div style={{ background: PANEL_BG, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, padding: 14, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ position: "absolute", top: -50, right: -40, width: 160, height: 160, borderRadius: "50%", background: `radial-gradient(circle, ${T.tiers[rank.tier]}29, transparent 70%)`, pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, position: "relative" }}>
            <SectionLbl>Rank</SectionLbl>
            <span style={{ fontSize: 10, color: T.textTertiary, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: T.green, fontSize: 11 }}>{"▲"}</span> All-time {"·"} only climbs
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, position: "relative" }}>
            <div style={{ width: 38, height: 38, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: 10, border: `1px solid ${T.tiers[rank.tier]}`, opacity: 0.35 }} />
              <span style={{ width: 24, height: 24, borderRadius: 6, transform: "rotate(45deg)", boxShadow: "0 6px 20px rgba(var(--shade),calc(0.4 * var(--shadeK)))", background: T.tiers[rank.tier] }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1, color: T.tiers[rank.tier] }}>{rank.name}</div>
              <div style={{ fontSize: 11, color: T.textSecondary, fontWeight: 500, marginTop: 4 }}>
                <b style={{ color: T.text, fontWeight: 600, fontFamily: T.mono }}>{fmtNum(animXp)}</b> XP earned all-time
              </div>
            </div>
          </div>
          <div style={{ marginTop: "auto", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: T.textTertiary, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>To next tier</span>
              <span style={{ fontSize: 11, color: T.textSecondary, fontWeight: 500, fontFamily: T.mono }}>{rank.top ? "Top tier reached" : `${fmtNum(rank.toNextXp)} XP to ${rank.nextName}`}</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: "rgba(var(--lift),0.06)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, background: T.tiers[rank.tier], width: ringReady ? `${Math.round(rank.frac * 100)}%` : "0%", transition: "width 0.8s cubic-bezier(.4,0,.2,1), background 0.4s" }} />
            </div>
            {viewMode !== "future" && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, fontSize: 11, fontWeight: 600, color: T.accentLight }}>
                <span style={{ fontFamily: T.mono }}>+{weekXp} XP {viewMode === "past" ? "earned that week" : "this week"}</span>
                {viewMode === "current" && <span style={{ color: T.textTertiary, fontWeight: 500 }}>{"·"} {goalReached ? "goal bonus locks in at week's end" : "feeds your rank"}</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stakes bar (live week) / frozen-outcome or preview bar (#276) */}
      {viewMode === "current" ? (
        <StakesBar posted={posted} target={target} streak={streakState?.current || 0} daysLeft={pace.daysLeft} now={now} streakOverVariant={streakOverVariant} lostStreakLen={lostStreakLen} prevWeekPosted={prevWeekPosted} prevWeekTarget={prevWeekTarget} gameColor={gameColor} />
      ) : (
        <WeekStateBar mode={viewMode} outcome={outcome} posted={posted} target={target} sched={weekAgg.sched} recap={recap} streakAfter={weekAgg.streakAfter} lostStreak={weekAgg.lostStreak} onOpenQueue={onOpenQueue} />
      )}

      {/* Week log — last element; the pane's own bottom padding is the closing gap.
          #281: the week nav lives on this card now (it steers this grid) and the legend
          moved to the footer — the old header tried to carry the section label, three
          legend keys, a hint line, Edit slots AND the Custom chip on one row. */}
      <div ref={logCardRef} onDragOver={onLogDragOver} onDragLeave={onLogDragLeave} style={{ position: "relative", background: PANEL_BG, border: `1px solid ${T.border}`, borderRadius: T.radius.lg }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px 7px", borderBottom: `1px solid ${T.border}`, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => goWeek(-1)} title="Previous week" style={weekNavBtnStyle}>{"‹"}</button>
            <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em", color: T.text, minWidth: 150, textAlign: "center" }}>{wd[0].label} {"–"} {wd[5].label}</span>
            <button onClick={() => goWeek(1)} title="Next week" style={weekNavBtnStyle}>{"›"}</button>
            {weekOffset === 0 ? (
              <SectionLbl>This week</SectionLbl>
            ) : (
              <button onClick={() => goWeek(-weekOffset)} style={{ ...weekNavBtnStyle, width: "auto", height: 22, padding: "0 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginLeft: 4, color: T.accentLight, borderColor: T.accentBorder, background: T.accentDim }}>Back to this week</button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {viewMode === "current" && <button onClick={() => setShowTemplateEditor(true)} style={ghostBtnStyle}>Edit slots</button>}
            {viewMode === "current" && hasOverride && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(251,191,36,0.1)", border: `1px solid ${T.yellowBorder}`, color: T.yellow, fontSize: 10, fontWeight: 700 }}>Custom</span>}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 0, padding: "5px 12px 6px" }}>
          {wd.map((d, di) => {
            const isToday = di === todayIdx;
            // #276: every day of a future week is upcoming; past weeks have no future days.
            const isFuture = viewMode === "future" ? true : (todayIdx >= 0 ? di > todayIdx : false);
            const dayEntries = thisWeekEntries.filter((e) => e.date === d.iso);
            const norm = (t) => (t || "").replace(/\s/g, "");
            const safeMinutes = (t) => { const m = parseTimeToMinutes(t || "12:00 AM"); return isNaN(m) ? 0 : m; };
            const templateSlots = effectiveTemplate.timeSlots || [];
            const sortedSlots = templateSlots.slice().sort((a, b) => safeMinutes(a) - safeMinutes(b));
            const slotTimesNorm = new Set(sortedSlots.map(norm));
            // #218: clips scheduled from the Queue. They live on the clip as `scheduledAt`
            // and never reach trackerData until the scheduler fires, so this list is the
            // ONLY way the week log can show what's coming.
            const daySched = schedByDate.get(d.iso) || [];
            const dayRetry = retryByDate.get(d.iso) || [];

            // Merge template slots (filled by an entry or a scheduled clip, else an open
            // "+" tile) with anything whose time doesn't land on a template slot, into one
            // time-ordered list. Open slots now render on future days too — an empty
            // Fri/Sat column said nothing about what was still unbooked.
            const dayRows = [];
            sortedSlots.forEach((slot) => {
              const matches = dayEntries.filter((e) => norm(e.time) === norm(slot));
              const schedMatches = daySched.filter((s) => norm(s.time) === norm(slot));
              const retryMatches = dayRetry.filter((r) => norm(r.time) === norm(slot));
              matches.forEach((entry) => dayRows.push({ type: "entry", entry, minutes: safeMinutes(slot) }));
              schedMatches.forEach((sched) => dayRows.push({ type: "sched", sched, minutes: safeMinutes(slot) }));
              retryMatches.forEach((retry) => dayRows.push({ type: "retry", retry, minutes: safeMinutes(slot) }));
              // #276: a frozen past week has nothing left to book — no open slots.
              if (matches.length === 0 && schedMatches.length === 0 && retryMatches.length === 0 && viewMode !== "past") {
                dayRows.push({ type: "slot", time: slot, minutes: safeMinutes(slot) });
              }
            });
            dayEntries.filter((e) => !slotTimesNorm.has(norm(e.time))).forEach((entry) => {
              dayRows.push({ type: "entry", entry, minutes: safeMinutes(entry.time) });
            });
            daySched.filter((s) => !slotTimesNorm.has(norm(s.time))).forEach((sched) => {
              dayRows.push({ type: "sched", sched, minutes: safeMinutes(sched.time) });
            });
            dayRetry.filter((r) => !slotTimesNorm.has(norm(r.time))).forEach((retry) => {
              dayRows.push({ type: "retry", retry, minutes: safeMinutes(retry.time) });
            });
            dayRows.sort((a, b) => a.minutes - b.minutes);

            return (
              <div key={d.iso} style={{
                padding: "0 8px", borderRight: di < 5 ? `1px solid ${T.border}` : "none", minHeight: 100,
                background: isToday ? `linear-gradient(180deg, ${T.accentDim}, transparent 60%)` : "transparent",
                // Future days used to be empty, so 0.4 cost nothing. They now carry
                // scheduled clips and open slots, and at 0.4 the ghost cards (already
                // 0.62 themselves) were unreadable (#218).
                borderRadius: isToday ? 6 : 0, opacity: isFuture ? 0.72 : 1,
              }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "2px 4px 6px" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: isToday ? T.accentLight : T.text }}>{DAY_SHORT[di]}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textTertiary }}>{d.label}</span>
                </div>
                {isFuture && <span style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textTertiary, fontWeight: 600, display: "block", padding: "0 4px 8px" }}>Upcoming</span>}

                {dayRows.map((row, i) => {
                  // Posted and scheduled share one card: same shape, same game tint and
                  // corner glow, differing only in dot colour and border (#218). The
                  // published title is what actually tells Fega which clip this was —
                  // it has been stored on every entry since logPost, just never shown.
                  if (row.type === "entry" || row.type === "sched" || row.type === "retry") {
                    const isSched = row.type === "sched";
                    // #315: partly published, waiting on a retry. Not a preview and not
                    // history — it is live on some platforms right now, which is why it
                    // shows solid rather than ghosted like a scheduled card.
                    const isRetry = row.type === "retry";
                    const item = isSched ? row.sched : isRetry ? row.retry : row.entry;
                    const gd = resolveGameDisplay(item.game);
                    const isAuto = !isSched && !isRetry && item.source === "clipflow";
                    const dotColor = isRetry ? T.red : isSched ? T.yellow : (isAuto ? T.cyan : "#fff");
                    const ring = isRetry ? rgba(T.red, 0.45) : isSched ? T.yellowBorder : rgba(gd.color, 0.26);
                    // #282: only a not-yet-published clip can be moved — it still has its
                    // own `scheduledAt` and nothing has gone out to a platform. Posted
                    // entries (auto or manual) are history and stay put, and a half-posted
                    // one can't be moved to a slot it is already past.
                    const movable = isSched && !!item.clipId && !!item.projectId && !!onRescheduleClip;
                    const retryTitle = isRetry
                      ? `${item.title || "Clip"} — went out on ${item.postedCount} platform${item.postedCount === 1 ? "" : "s"}, ${item.failedCount} still failing. Click to retry in the Queue.`
                      : null;
                    return (
                      <div key={(isSched ? "s" : isRetry ? "r" : "e") + (item.id || item.clipId || `${item.date}-${item.time}-${i}`)}
                        title={retryTitle || (movable ? `${item.title || "Scheduled clip"} — drag to another slot to move it` : (item.title || ""))}
                        draggable={movable}
                        onDragStart={movable ? (e) => startClipDrag(item, e) : undefined}
                        onClick={(e) => (isRetry ? onOpenQueue?.() : openDetailPopover(item, isSched, e.currentTarget.getBoundingClientRect()))}
                        style={{
                          position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", gap: 3,
                          background: isRetry ? T.redDim : rgba(gd.color, isSched ? 0.05 : 0.09),
                          border: `1px ${isSched ? "dashed" : "solid"} ${ring}`,
                          borderRadius: 6, padding: "4px 6px", marginBottom: 3, cursor: movable ? "grab" : "pointer",
                          opacity: isSched ? 0.62 : 1, transition: "opacity .15s, border-color .15s",
                        }}
                        onMouseEnter={(ev) => { ev.currentTarget.style.opacity = 1; ev.currentTarget.style.borderColor = isRetry ? T.red : rgba(gd.color, 0.5); }}
                        onMouseLeave={(ev) => { ev.currentTarget.style.opacity = isSched ? 0.62 : 1; ev.currentTarget.style.borderColor = ring; }}
                      >
                        <span style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(90px 50px at 0% 0%, ${rgba(gd.color, isSched ? 0.14 : 0.34)}, transparent 72%)` }} />
                        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, color: "#0a0b10", flexShrink: 0, background: gd.color }}>{gd.tag}</span>
                          {/* #306: this post is a repeat of an earlier one — worth
                              seeing at a glance when reading a week's stats. */}
                          {item.repostOf && (
                            <span title="Repost" style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 4, flexShrink: 0, color: T.accentLight, background: T.accentDim, border: `1px solid ${T.accentBorder}` }}>REPOST</span>
                          )}
                          {/* #315: this one is half-posted. The badge is the whole point
                              of the card — without it a red dot just looks like a variant. */}
                          {isRetry && (
                            <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 4, flexShrink: 0, color: T.red, background: T.redDim, border: `1px solid ${rgba(T.red, 0.35)}` }}>RETRY</span>
                          )}
                          <span style={{ fontFamily: T.mono, fontSize: 9, color: T.textTertiary, marginLeft: "auto" }}>{shortSlot(item.time)}</span>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: dotColor, boxShadow: `0 0 6px ${isSched ? "rgba(251,191,36,0.55)" : (isAuto ? `${T.cyan}88` : "rgba(var(--lift),0.35)")}` }} />
                        </div>
                        {item.title && (
                          <div style={{
                            position: "relative", fontSize: 10, lineHeight: 1.35, fontWeight: 500,
                            color: "rgba(var(--lift),0.78)", display: "-webkit-box", WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word",
                          }}>{cleanTitle(item.title)}</div>
                        )}
                      </div>
                    );
                  }
                  // #276: on a future week open slots are a read-only preview of what's
                  // unbooked — logging (and scheduling) stays out of reach on purpose.
                  const slotInteractive = viewMode === "current";
                  // #282: a drop is only legal on a slot that hasn't happened yet —
                  // a past `scheduledAt` would make the Queue's scheduler publish it on
                  // its very next tick. Past weeks render no open slots at all.
                  const slotIso = slotDateTime(d.iso, row.time);
                  const droppable = viewMode !== "past" && !!slotIso && new Date(slotIso).getTime() > now.getTime();
                  const resetSlot = (el) => {
                    el.style.borderColor = "rgba(var(--lift),0.08)"; el.style.borderStyle = "dashed";
                    el.style.color = T.textMuted; el.style.background = "transparent"; el.style.boxShadow = "none";
                  };
                  return (
                    <div key={`slot-${row.time}`}
                      onClick={slotInteractive ? (e) => openLogPopover(d.iso, d.dayName, row.time, e.currentTarget.getBoundingClientRect()) : undefined}
                      onDragOver={droppable ? (ev) => {
                        if (!dragRef.current) return;
                        ev.preventDefault();
                        ev.dataTransfer.dropEffect = "move";
                        const el = ev.currentTarget;
                        el.style.borderColor = T.yellow; el.style.borderStyle = "solid"; el.style.color = T.yellow;
                        el.style.background = "rgba(251,191,36,0.14)";
                        el.style.boxShadow = "0 0 16px -4px rgba(251,191,36,0.55)";
                      } : undefined}
                      onDragLeave={droppable ? (ev) => resetSlot(ev.currentTarget) : undefined}
                      onDrop={droppable ? (ev) => { ev.preventDefault(); resetSlot(ev.currentTarget); dropOnSlot(d.iso, d.dayName, row.time); } : undefined}
                      style={{ display: "flex", alignItems: "center", gap: 5, border: "1px dashed rgba(var(--lift),0.08)", borderRadius: 6, padding: "4px 6px", marginBottom: 3, cursor: slotInteractive ? "pointer" : "default", color: T.textMuted, minHeight: 22 }}
                      onMouseEnter={slotInteractive ? (ev) => { ev.currentTarget.style.borderColor = gameColor; ev.currentTarget.style.color = gameColor; ev.currentTarget.style.background = `${gameColor}1a`; } : undefined}
                      onMouseLeave={slotInteractive ? (ev) => resetSlot(ev.currentTarget) : undefined}
                    >
                      {/* no "+" on read-only weeks — an inert add-affordance reads as broken */}
                      <span style={{ fontSize: 13, lineHeight: 1, color: "inherit" }}>{slotInteractive ? "+" : "○"}</span>
                      <span style={{ fontFamily: T.mono, fontSize: 9, color: "inherit", marginLeft: "auto" }}>{shortSlot(row.time)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* #281: legend + hint live under the grid now, out of the header's way. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 14px", borderTop: `1px solid ${T.border}`, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: T.textTertiary, fontWeight: 500 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: T.cyan, boxShadow: `0 0 6px ${T.cyan}88` }} /> Auto-posted
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: T.textTertiary, fontWeight: 500 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: T.text, boxShadow: "0 0 5px rgba(var(--lift),0.35)" }} /> Manual
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: T.textTertiary, fontWeight: 500 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: T.yellow, boxShadow: "0 0 6px rgba(251,191,36,0.55)" }} /> Scheduled
            </span>
            {/* #315: only worth a legend slot when one is actually on screen. */}
            {(needsRetryClips || []).length > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: T.textTertiary, fontWeight: 500 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: T.red, boxShadow: `0 0 6px ${rgba(T.red, 0.55)}` }} /> Half posted {"—"} needs retry
              </span>
            )}
          </div>
          <span style={{ fontSize: 10.5, color: T.textTertiary, fontWeight: 500 }}>
            {viewMode === "current"
              ? <>Click a slot to log {"·"} click a clip for detail {"·"} <b style={{ color: T.textSecondary, fontWeight: 600 }}>drag a scheduled clip to move it</b></>
              : viewMode === "future"
                ? <>Click a clip for detail {"·"} <b style={{ color: T.textSecondary, fontWeight: 600 }}>drag a scheduled clip to move it</b></>
                : "Read-only — click a clip for detail"}
          </span>
        </div>

        {/* #282: drag a clip to either edge and the week flips — the strips are pure
            signal (pointerEvents none) so the Mon/Sat slots underneath stay droppable;
            the flip itself is driven by cursor position in onLogDragOver. */}
        {dragging && [-1, 1].map((dir) => (
          <div key={dir} style={{
            position: "absolute", top: 0, bottom: 0, [dir < 0 ? "left" : "right"]: 0, width: EDGE_PX,
            pointerEvents: "none", zIndex: 5, borderRadius: dir < 0 ? "14px 0 0 14px" : "0 14px 14px 0",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: edgeDir === dir
              ? `linear-gradient(${dir < 0 ? 90 : 270}deg, ${T.accent}59, transparent)`
              : `linear-gradient(${dir < 0 ? 90 : 270}deg, rgba(var(--lift),0.05), transparent)`,
            color: edgeDir === dir ? T.accentLight : T.textMuted,
            fontSize: 20, fontWeight: 700, lineHeight: 1,
            transition: "background .18s ease, color .18s ease",
          }}>{dir < 0 ? "‹" : "›"}</div>
        ))}
      </div>


      {/* ---- Log / Detail popover ---- */}
      {popover && (
        <div ref={popoverRef} onClick={(e) => e.stopPropagation()} style={{
          position: "fixed", left: popPos ? popPos.left : -9999, top: popPos ? popPos.top : -9999,
          visibility: popPos ? "visible" : "hidden", width: 248, zIndex: 2000,
          background: T.surface, borderRadius: T.radius.lg, padding: 14, border: `1px solid ${T.borderHover}`, boxShadow: "0 20px 60px rgba(var(--shade),calc(0.7 * var(--shadeK)))",
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
              const isSched = !!popover.isSched;
              const gd = resolveGameDisplay(entry.game);
              const isAuto = !isSched && entry.source === "clipflow";
              const srcLabel = isSched
                ? "Scheduled — not posted yet"
                : (isAuto ? (entry.scheduled ? "Scheduled via Corva" : "Published via Corva") : "Logged manually");
              // A scheduled clip carries its own paths; a posted one is looked up by the
              // clipId logPost stored. Either can come back empty — the project may be
              // deleted or the clip drive unplugged — so every clip action is optional.
              const link = isSched ? entry : (entry.clipId ? clipIndex?.get(entry.clipId) : null);
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: `${gd.color}33`, color: gd.color, fontSize: 11, fontWeight: 800, fontFamily: T.mono }}>{gd.tag}</div>
                    <div>
                      <div style={{ color: T.text, fontSize: 14, fontWeight: 700 }}>{gd.name}</div>
                      <div style={{ color: T.textTertiary, fontSize: 11, fontFamily: T.mono }}>{DAY_SHORT[wd.findIndex((d) => d.iso === entry.date)] || entry.day} {"·"} {entry.time}</div>
                    </div>
                  </div>
                  {entry.title && (
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text, lineHeight: 1.4, margin: "2px 0 10px" }}>{cleanTitle(entry.title)}</div>
                  )}
                  {link?.thumbnailPath && (
                    // Fixed-height box, NOT a bare <img>: the popover measures itself in a
                    // layout effect to decide whether to flip above the card, and an image
                    // that only gains height once decoded made it grow off the bottom of
                    // the window after positioning. The box also doubles as the fallback —
                    // the clip library is on an external drive, so when it's unplugged the
                    // frame is simply a tinted block instead of a broken-image glyph.
                    <div style={{ width: "100%", height: 132, borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 10, overflow: "hidden", background: rgba(gd.color, 0.16) }}>
                      <img
                        src={toFileUrl(link.thumbnailPath)} alt=""
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </div>
                  )}
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
                            <span style={{ position: "absolute", bottom: -3, right: -3, width: 12, height: 12, borderRadius: "50%", background: T.surface, color: T.accentLight, fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>{"↗"}</span>
                          </span>
                        ) : (
                          <span key={i} title={label} style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 30, height: 30, borderRadius: 8, opacity: 0.6,
                            background: "rgba(var(--lift),0.04)", border: `1px solid ${T.border}`,
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
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: isSched ? T.yellow : (isAuto ? T.cyan : "rgba(var(--lift),0.6)"), boxShadow: isSched ? "0 0 6px rgba(251,191,36,0.55)" : (isAuto ? `0 0 6px ${T.cyan}88` : "0 0 5px rgba(var(--lift),0.2)") }} />
                    <span style={{ color: isSched ? T.yellow : (isAuto ? T.cyan : T.textTertiary), fontSize: 11, fontWeight: 600 }}>{srcLabel}</span>
                  </div>
                  {(link?.projectId || link?.renderPath) && (
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      {link.projectId && (
                        <button onClick={() => { closePopover(); onOpenInEditor?.(link.projectId, entry.clipId); }} style={popBtn(T.accentBorder, T.accentDim, T.accentLight)}>
                          Open in editor
                        </button>
                      )}
                      {link.renderPath && (
                        <button title="Show in Explorer" onClick={() => window.clipflow?.revealInFolder?.(link.renderPath)} style={{ ...popBtn(T.border, "rgba(var(--lift),0.04)", T.textSecondary), flex: "0 0 34px", padding: "8px 0" }}>
                          {"📁"}
                        </button>
                      )}
                    </div>
                  )}
                  {isSched ? (
                    <>
                      <button onClick={() => { closePopover(); onOpenQueue?.(); }} style={popBtn(T.yellowBorder, T.yellowDim, T.yellow)}>Manage in Queue</button>
                      {/* #282: the drag is an accelerator, not the only way to move a
                          clip — the Queue button above is still the full control. */}
                      <div style={{ fontSize: 10, color: T.textTertiary, textAlign: "center", marginTop: 7 }}>or drag the card to another slot</div>
                    </>
                  ) : (
                    <>
                      {/* #306: Repost creates a fresh copy of the clip and hands off to
                          the Queue — the Tracker still grows no scheduling actions
                          (tasks/specs/tracker-now-playing.md). Offered on frozen weeks
                          too: reposting older content is the point, and it never touches
                          the published record. */}
                      <div style={{ display: "flex", gap: 6 }}>
                        {link?.projectId && link?.renderPath && (
                          <button
                            onClick={() => doRepost(link.projectId, entry.clipId)}
                            disabled={reposting}
                            title="Copy this clip back into the queue to post again"
                            style={{ ...popBtn(T.accentBorder, T.accentDim, T.accentLight), cursor: reposting ? "default" : "pointer" }}
                          >{reposting ? "Reposting…" : "Repost"}</button>
                        )}
                        {/* #276: frozen weeks are read-only — no removing history */}
                        {viewMode === "current" && (
                          <button onClick={() => removeEntry(entry)} style={popBtn(T.redBorder, T.redDim, T.red)}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(248,113,113,0.15)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = T.redDim; }}
                          >Remove</button>
                        )}
                      </div>
                      {repostErr && (
                        <div style={{ marginTop: 7, fontSize: 11, color: T.red, textAlign: "center", lineHeight: 1.35 }}>{repostErr}</div>
                      )}
                    </>
                  )}
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
          <div style={{ position: "relative", width: 360, maxHeight: "80vh", overflowY: "auto", background: T.surface, border: `1px solid ${T.borderHover}`, borderRadius: T.radius.lg, padding: 18, boxShadow: "0 20px 60px rgba(var(--shade),calc(0.7 * var(--shadeK)))" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Edit this week's slots</span>
              <button onClick={() => setShowTemplateEditor(false)} style={{ background: "none", border: "none", color: T.textTertiary, fontSize: 16, cursor: "pointer", lineHeight: 1 }}>{"×"}</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {effectiveTemplate.timeSlots.map((slot, si) => (
                <div key={si} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "rgba(var(--lift),0.03)", border: `1px solid ${T.border}` }}>
                  {editingTimeSlot === si ? (
                    <input value={timeSlotVal} onChange={(e) => setTimeSlotVal(e.target.value)}
                      onBlur={() => editTimeSlot(si, timeSlotVal)}
                      onKeyDown={(e) => { if (e.key === "Enter") editTimeSlot(si, timeSlotVal); if (e.key === "Escape") setEditingTimeSlot(null); }}
                      autoFocus style={{ flex: 1, padding: "3px 6px", borderRadius: 4, border: `1px solid ${T.accentBorder}`, background: "rgba(var(--lift),0.06)", color: T.text, fontSize: 12, fontFamily: T.mono, outline: "none" }} />
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
                  style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.accentBorder}`, background: "rgba(var(--lift),0.04)", color: T.text, fontSize: 12, fontFamily: T.mono, outline: "none" }} />
                <button onClick={() => addTimeSlot(newSlotVal)} style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: T.green, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Add</button>
              </div>
            ) : (
              <button onClick={() => setShowAddSlot(true)} style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px dashed ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font, marginBottom: 14 }}>+ Add time slot</button>
            )}

            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
              {showSaveAs ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input value={presetName} onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePreset()} placeholder="Preset name..." autoFocus
                    style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.accentBorder}`, background: "rgba(var(--lift),0.04)", color: T.text, fontSize: 12, fontFamily: T.font, outline: "none" }} />
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
                      <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: T.surface, border: `1px solid ${T.borderHover}`, borderRadius: T.radius.md, padding: 4, minWidth: 160, boxShadow: "0 8px 32px rgba(var(--shade),calc(0.5 * var(--shadeK)))", zIndex: 100 }}>
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
                  <button onClick={() => setShowSaveAs(true)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(var(--lift),0.03)", color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save as{"…"}</button>
                  <button onClick={setAsDefault} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(var(--lift),0.03)", color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Set as default</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- ClipFlow Rundown modal (preview first, download on click) ---- */}
      {showRundown && (
        <div onClick={() => setShowRundown(false)} style={{
          position: "fixed", inset: 0, zIndex: 3000, background: "rgba(var(--shade),calc(0.72 * var(--shadeK)))",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            position: "relative", width: 380, maxWidth: "92vw", border: `1px solid ${T.borderHover}`, borderRadius: T.radius.lg,
            overflow: "hidden", padding: "24px 24px 22px", display: "flex", flexDirection: "column", gap: 16,
            background: `radial-gradient(110% 130% at 92% 100%, ${gameColor}29 0%, transparent 58%), linear-gradient(115deg, ${gameColor}38 0%, ${gameColor}0a 50%, transparent 78%), ${T.surface}`,
            boxShadow: "0 30px 90px rgba(var(--shade),calc(0.7 * var(--shadeK)))",
          }}>
            <span onClick={() => setShowRundown(false)} title="Close" style={{
              position: "absolute", top: 12, right: 14, color: T.textTertiary, fontSize: 15, cursor: "pointer", lineHeight: 1, padding: 4,
            }}>{"✕"}</span>

            {goalReached && (
              <div style={{ display: "flex", alignItems: "center", gap: 9, background: `linear-gradient(90deg, ${gameColor}1f, transparent)`, border: `1px solid ${gameColor}`, borderRadius: T.radius.md, padding: "9px 14px", fontSize: 12, fontWeight: 600, color: gameColor }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" style={{ flexShrink: 0 }}><path d="M5 13l4 4L19 7" /></svg>
                Goal reached. Bonus XP banks at week's end. This rundown is ready to post.
              </div>
            )}

            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", color: T.textTertiary, fontWeight: 600, marginBottom: 9 }}>Corva Rundown {"·"} {wd[0].label} – {wd[5].label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                I posted <b style={{ color: gameColor }}>{recap.clips} clip{recap.clips === 1 ? "" : "s"}</b> to <b style={{ color: gameColor }}>{recap.platformsUsed} platform{recap.platformsUsed === 1 ? "" : "s"}</b> this week
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 600, color: T.textSecondary, letterSpacing: "0.02em" }}>
              <span style={{ width: 16, height: 16, borderRadius: 5, background: `linear-gradient(135deg, ${T.accentLight}, ${T.accent})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={T.onSolid} strokeWidth="2.6"><path d="M4 7h16M4 12h10M4 17h6" /></svg>
              </span>
              Corva
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {PLATFORM_KEYS.map((key) => (
                <div key={key} style={{ background: "rgba(var(--lift),0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, color: T.textSecondary, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                    <PlatformIcon platform={key} size={14} />{PLATFORM_LABELS[key]}
                  </div>
                  <div style={{ fontSize: 21, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>{recap.perPlatform[key] || 0}</div>
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
              color: shareState === "copied" || shareState === "saved" ? "#06281b" : T.onSolid,
              border: "none", fontFamily: T.font, fontSize: 13, fontWeight: 700, padding: "11px 18px", borderRadius: T.radius.md,
              cursor: shareState === "saving" ? "default" : "pointer", transition: "background 0.18s",
            }}>
              {shareState === "copied" || shareState === "saved" ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M8 12h8M8 12l3-3M8 12l3 3M16 5h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h2" /></svg>
              )}
              {shareState === "copied" ? "Saved — copied to clipboard" : shareState === "saved" ? "Saved" : shareState === "saving" ? "Saving…" : "Download PNG"}
            </button>
          </div>
        </div>
      )}

      {/* ---- Toast ---- */}
      <div style={{
        position: "fixed", bottom: 26, left: "50%", transform: `translateX(-50%) translateY(${toastMsg ? 0 : 10}px)`,
        background: T.surface, border: `1px solid ${T.borderHover}`, color: T.text, fontSize: 12, fontWeight: 500,
        padding: "11px 18px", borderRadius: T.radius.md, boxShadow: "0 14px 40px rgba(var(--shade),calc(0.6 * var(--shadeK)))",
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
    <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 600, color: T.text, padding: "6px 12px", borderRadius: 999, background: "rgba(var(--lift),0.05)", border: `1px solid ${T.border}` }}>
      {children}
    </span>
  );
}

// #276: the StakesBar slot on a non-live week — frozen verdict for past weeks,
// read-only preview note (with the one allowed exit to the Queue) for future ones.
function WeekStateBar({ mode, outcome, posted, target, sched, recap, streakAfter, lostStreak, onOpenQueue }) {
  if (mode === "future") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: T.radius.lg, padding: "6px 12px", marginBottom: 8, border: `1px solid ${T.yellowBorder}`, background: T.surface }}>
        <span style={{ fontSize: 18, lineHeight: 1, color: T.yellow, flexShrink: 0 }}>{"◔"}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, lineHeight: 1.35 }}>
          Preview — <b style={{ fontFamily: T.mono, color: T.text }}>{sched}</b> clip{sched === 1 ? "" : "s"} scheduled for this week so far.
        </span>
        <button onClick={() => onOpenQueue?.()} style={{ marginLeft: "auto", flexShrink: 0, padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.yellowBorder}`, background: T.yellowDim, color: T.yellow, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Manage in Queue</button>
      </div>
    );
  }
  const hit = outcome === "hit";
  const missed = outcome === "missed";
  const line = hit
    ? <>Goal hit — <b style={{ fontFamily: T.mono, color: T.green }}>{posted} of {target}</b> posted.{streakAfter > 0 ? <> Streak stood at <b style={{ fontFamily: T.mono, color: T.text }}>{streakAfter}</b>.</> : null}</>
    : missed
      ? <>Missed — <b style={{ fontFamily: T.mono, color: T.red }}>{posted} of {target}</b> posted.{lostStreak > 0 ? <> A <b style={{ fontFamily: T.mono, color: T.text }}>{lostStreak}-week</b> streak ended here.</> : null}</>
      : posted > 0
        ? <>No weekly goal existed yet — <b style={{ fontFamily: T.mono, color: T.text }}>{posted}</b> posted, no judgement.</>
        : <>Nothing was posted this week.</>;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, borderRadius: T.radius.lg, padding: "6px 12px", marginBottom: 8,
      border: `1px solid ${hit ? T.greenBorder : missed ? T.redBorder : T.border}`,
      background: hit ? "linear-gradient(90deg, rgba(52,211,153,0.07), transparent 60%)" : T.surface,
    }}>
      <span style={{ fontSize: 18, lineHeight: 1, color: hit ? T.green : missed ? T.red : T.textTertiary, flexShrink: 0 }}>{hit ? "▲" : missed ? "▽" : "—"}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, lineHeight: 1.35 }}>{line}</span>
      {recap && recap.clips > 0 && (
        <span style={{ marginLeft: "auto", fontSize: 11, color: T.textTertiary, fontWeight: 500, flexShrink: 0, whiteSpace: "nowrap" }}>
          {recap.clips} clip{recap.clips === 1 ? "" : "s"} {"·"} {recap.platformsUsed} platform{recap.platformsUsed === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

function StakesBar({ posted, target, streak, daysLeft, now, streakOverVariant, lostStreakLen, prevWeekPosted, prevWeekTarget, gameColor }) {
  const remaining = Math.max(0, target - posted);
  const safe = remaining <= 0;
  const weekdayLabel = now.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric" });

  // Calm "streak lost" state (locked Phase 2 design): the Monday after a miss. Muted flame,
  // neutral border, no shame. Rank untouched is the reassurance beat. Only when a streak
  // actually ended — after back-to-back misses there is nothing to mourn, so the normal
  // "start your streak" line below reads right.
  if (streakOverVariant && lostStreakLen > 0) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 12, borderRadius: T.radius.lg, padding: "6px 12px", marginBottom: 8,
        border: `1px solid ${T.border}`, background: T.surface,
      }}>
        <span style={{ fontSize: 18, lineHeight: 1, color: T.textTertiary, flexShrink: 0 }}>{"▽"}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, lineHeight: 1.35 }}>
          Streak ended at <b style={{ fontFamily: T.mono, color: T.text }}>{lostStreakLen} week{lostStreakLen === 1 ? "" : "s"}</b>. <span style={{ color: T.accentLight }}>Your rank kept every XP.</span> New streak starts with this week's goal.
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: T.textTertiary, fontWeight: 500, flexShrink: 0, whiteSpace: "nowrap" }}>Last week {"·"} {prevWeekPosted} of {prevWeekTarget}</span>
      </div>
    );
  }

  if (safe) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 12, borderRadius: T.radius.lg, padding: "6px 12px", marginBottom: 8,
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
      display: "flex", alignItems: "center", gap: 12, borderRadius: T.radius.lg, padding: "6px 12px", marginBottom: 8,
      border: "1px solid rgba(251,191,36,0.28)", background: T.surface,
    }}>
      <span style={{ fontSize: 18, lineHeight: 1, color: T.accent, flexShrink: 0, animation: "tp-pulse 2.6s ease-in-out infinite" }}>{"▲"}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.35 }}>
        {hitMoreLine}
      </span>
      <span style={{ marginLeft: "auto", fontSize: 11, color: T.textTertiary, fontWeight: 500, flexShrink: 0, whiteSpace: "nowrap" }}>
        {weekdayLabel} {"·"} {daysLeft} day{daysLeft === 1 ? "" : "s"} left
      </span>
    </div>
  );
}

// #281: the Projects tab's panel treatment — a whisper of a top highlight over the
// surface colour, so a flat card catches light at its top edge (ProjectsView.js:842).
const PANEL_BG = `linear-gradient(180deg, rgba(var(--lift),0.022), rgba(var(--lift),0)), ${T.surface}`;

// #276 week nav arrows — square ghost buttons flanking the week label.
const weekNavBtnStyle = {
  width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center",
  borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(var(--lift),0.03)",
  color: T.textSecondary, fontSize: 14, lineHeight: 1, cursor: "pointer", fontFamily: T.font, fontWeight: 700, padding: 0,
};

const ghostBtnStyle = {
  padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(var(--lift),0.03)",
  color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
};

// Footer buttons in the clip-detail popover (#218). width covers the standalone
// buttons (Remove / Manage in Queue); flex-basis 0 wins over it inside the action row.
const popBtn = (border, bg, color) => ({
  flex: 1, width: "100%", padding: "8px 0", borderRadius: 8, border: `1px solid ${border}`, background: bg,
  color, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font, textAlign: "center",
});
