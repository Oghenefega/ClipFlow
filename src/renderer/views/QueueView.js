import React, { useState, useRef, useEffect, useMemo } from "react";
import posthog from "posthog-js";
import T from "../styles/theme";
import { Card, PageHeader, SectionLabel, Badge, Select, InfoBanner, extractGameTag, hasHashtag } from "../components/shared";
import CaptionsView from "./CaptionsView";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const DAY_NAMES = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const FULL_DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// Hour options: 8 AM through 12 AM (midnight) = hours 8..23 then 0
const HOUR_OPTIONS = (() => {
  const o = [];
  for (let h = 8; h < 24; h++) {
    const hr = h % 12 || 12, ap = h < 12 ? "AM" : "PM";
    o.push({ value: String(h).padStart(2, "0"), label: `${hr} ${ap}` });
  }
  // Add 12 AM (midnight) at the end
  o.push({ value: "00", label: "12 AM" });
  return o;
})();
// Minute options: 00-55 in 5-minute increments
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const m = i * 5;
  return { value: String(m).padStart(2, "0"), label: String(m).padStart(2, "0") };
});
// Legacy TIME_OPTIONS for display/lookup (used in tracker logging)
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

// Parse a time slot string like "3:30 PM" into total minutes since midnight
const parseTimeToMinutes = (s) => {
  const [t, ap] = s.split(" ");
  let [h, m] = t.split(":").map(Number);
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + m;
};

// Snap a time string to the nearest slot in the provided timeSlots array
const snapToSlot = (timeStr, timeSlots) => {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return timeStr;
  let h = parseInt(match[1]), m = parseInt(match[2]);
  const ap = match[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  const mins = h * 60 + m;
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < timeSlots.length; i++) {
    const d = Math.abs(parseTimeToMinutes(timeSlots[i]) - mins);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return timeSlots[best];
};

function SortableRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return children({ ref: setNodeRef, style: { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }, attributes, listeners });
}

// ── Phase 2: Per-platform control constants ──
const PLATFORM_CHAR_LIMITS = { tiktok: 2200, instagram: 2200, facebook: 63206, youtube_title: 100, youtube_desc: 5000 };
const PLATFORM_KEYS = ["tiktok", "instagram", "facebook", "youtube"];
const PLATFORM_META = {
  tiktok:    { label: "TikTok",    abbr: "TT", bg: "#000",     border: "rgba(255,255,255,0.15)" },
  instagram: { label: "Instagram", abbr: "IG", bg: "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)", border: "none" },
  facebook:  { label: "Facebook",  abbr: "FB", bg: "#1877f2",  border: "none" },
  youtube:   { label: "YouTube",   abbr: "YT", bg: "#c4302b",  border: "none" },
};

// #71: A clip is "placeholder-named" if its title is the unedited "Clip N" default
// the pipeline assigned. Manual rename or AI Titles overwrite the title to something
// else and silence the warning. Strict pattern — anything past the number opts out.
const PLACEHOLDER_TITLE_RE = /^Clip \d+$/;
const isPlaceholderTitle = (title) => PLACEHOLDER_TITLE_RE.test((title || "").trim());

// Resolve caption for a platform using template + clip data, respecting overrides
function resolveCaption(platformKey, clip, captionTemplates, ytDescriptions) {
  // Prefer clip.gameTag (first-class field, lowercased); fall back to title hashtag for legacy clips.
  const gameTag = (clip.gameTag || extractGameTag(clip.title) || "").toLowerCase();
  // YouTube description comes from ytDescriptions per-game system
  if (platformKey === "youtube") {
    const gameKey = Object.keys(ytDescriptions || {}).find((k) => {
      const tag = (ytDescriptions[k]?.tag || k || "").toLowerCase();
      return tag === gameTag.toLowerCase() || k.toLowerCase() === gameTag.toLowerCase();
    });
    if (gameKey && ytDescriptions[gameKey]?.desc) {
      return ytDescriptions[gameKey].desc
        .replace(/\{title\}/g, clip.title || "")
        .replace(/#{gametitle}/g, gameTag ? `#${gameTag}` : "");
    }
    return clip.title || "";
  }
  // TikTok / Instagram / Facebook — use captionTemplates
  const template = captionTemplates?.[platformKey];
  if (!template) return clip.title || "";
  return template
    .replace(/\{title\}/g, clip.title || "")
    .replace(/#{gametitle}/g, gameTag ? `#${gameTag}` : "");
}

// Map connected account to platform key
function accountToPlatformKey(account) {
  const p = (account.platform || "").toLowerCase();
  if (p === "tiktok") return "tiktok";
  if (p === "instagram") return "instagram";
  if (p === "facebook") return "facebook";
  if (p === "youtube") return "youtube";
  if (p === "meta" && account.igAccountId) return "instagram";
  return null;
}

// Character count color
function charCountColor(len, max) {
  const pct = len / max;
  if (pct > 1) return T.red;
  if (pct > 0.8) return T.yellow;
  return T.textTertiary;
}

export default function QueueView({
  allClips, localProjects, mainGame, mainGameTag, platforms, trackerData, setTrackerData,
  weeklyTemplate, weekTemplateOverrides,
  ytDescriptions, setYtDescriptions, captionTemplates, setCaptionTemplates,
  platformOptions, setPlatformOptions, gamesDb,
  requireHashtagInTitle = true,
}) {
  const scheduledClipIds = new Set(trackerData.map((t) => t.clipId).filter(Boolean));
  const scheduledTitles = new Set(trackerData.map((t) => t.title).filter(Boolean));
  // projectId → metadata (gameTag, gameColor, name, testMode). gameTag is lowercased
  // once here so all downstream comparisons can use === without case juggling.
  const projectInfo = React.useMemo(() => {
    const map = {};
    for (const p of (localProjects || [])) {
      map[p.id] = {
        name: p.name || p.sourceName || p.id,
        gameTag: (p.gameTag || "").toLowerCase(),
        gameColor: p.gameColor || "",
        testMode: p.testMode === true || (Array.isArray(p.tags) && p.tags.includes("test")),
      };
    }
    return map;
  }, [localProjects]);
  // Preserve projectId on each clip for IPC calls. Promote gameTag to a first-class
  // field on the clip (lowercased) — derived from clip.gameTag if present, else from
  // the parent project, else legacy fallback by parsing the title hashtag.
  const mainGameTagLc = (mainGameTag || "").toLowerCase();
  const approved = Object.entries(allClips).flatMap(([projectId, clips]) => {
    const projGameTag = projectInfo[projectId]?.gameTag || "";
    return clips
      .map((c) => {
        const clipTag = (c.gameTag || "").toLowerCase() || projGameTag || extractGameTag(c.title) || "";
        return { ...c, _projectId: projectId, gameTag: clipTag };
      })
      .filter((c) => (c.status === "approved" || c.status === "ready")
        && (!requireHashtagInTitle || hasHashtag(c.title) || !!c.gameTag)
        && !scheduledClipIds.has(c.id)
        && !scheduledTitles.has(c.title));
  }).sort((a, b) => (a.queueOrder ?? Infinity) - (b.queueOrder ?? Infinity) || new Date(a.createdAt) - new Date(b.createdAt));
  const isClipTest = (clip) => !!(clip && clip._projectId && projectInfo[clip._projectId]?.testMode);
  const mainCount = approved.filter((c) => c.gameTag === mainGameTagLc).length;
  const [selClip, setSelClip] = useState(null);
  const [schedAction, setSchedAction] = useState(null);
  const [schedDate, setSchedDate] = useState("");
  const [schedHour, setSchedHour] = useState("12");
  const [schedMin, setSchedMin] = useState("30");
  const schedTime = `${schedHour.padStart(2, "0")}:${schedMin.padStart(2, "0")}`;
  // publishStatus: { [clipId]: { state: "publishing"|"done"|"failed", platforms: { [key]: "pending"|"publishing"|"done"|"failed"|errorMsg } } }
  const [publishStatus, setPublishStatus] = useState({});
  const [scheduled, setScheduled] = useState({});
  const publishingRef = useRef(false);
  const [publishLogs, setPublishLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [publishProgress, setPublishProgress] = useState(null); // { stage, pct, detail }
  const [editingTitle, setEditingTitle] = useState(null); // clipId being edited
  const [editTitleValue, setEditTitleValue] = useState("");
  // Phase 2: per-platform caption editing state
  const [editingCaption, setEditingCaption] = useState(null); // { clipId, platform }
  const [editCaptionValue, setEditCaptionValue] = useState("");
  const [editingYtTitle, setEditingYtTitle] = useState(null); // clipId
  const [editYtTitleValue, setEditYtTitleValue] = useState("");
  // Phase 3: scheduling state
  const [confirmClipId, setConfirmClipId] = useState(null); // Phase 4: publish confirmation modal
  const [confirmSchedOpts, setConfirmSchedOpts] = useState(null);
  // Phase 5: filter/sort
  const [filterGame, setFilterGame] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all"); // all, unscheduled, scheduled, published, failed, unrendered
  const [sortBy, setSortBy] = useState("queue"); // queue, date, game, scheduled

  // Dequeue a clip (set status to "dequeued" so it leaves the queue but can be re-approved)
  const dequeueClip = async (clip) => {
    if (!clip._projectId) return;
    try {
      await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { status: "dequeued" });
    } catch (e) { console.error("Dequeue failed:", e); }
  };

  // Save inline title edit
  const saveTitle = async (clip) => {
    const trimmed = editTitleValue.trim();
    if (!trimmed || trimmed === clip.title || !clip._projectId) { setEditingTitle(null); return; }
    try {
      await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { title: trimmed });
    } catch (e) { console.error("Title update failed:", e); }
    setEditingTitle(null);
  };

  // Phase 2: Toggle a platform on/off for a clip
  const togglePlatform = async (clip, platformKey) => {
    if (!clip._projectId) return;
    const current = clip.platformToggles || {};
    const updated = { ...current, [platformKey]: current[platformKey] === false ? true : false };
    try {
      await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { platformToggles: updated });
    } catch (e) { console.error("Platform toggle failed:", e); }
  };

  // Phase 2: Save caption override for a platform
  const saveCaptionOverride = async (clip, platformKey, value) => {
    if (!clip._projectId) return;
    const resolved = resolveCaption(platformKey, clip, captionTemplates, ytDescriptions);
    const current = clip.captionOverrides || {};
    // If value matches template, clear the override
    const updated = { ...current, [platformKey]: value === resolved ? undefined : value };
    try {
      await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { captionOverrides: updated });
    } catch (e) { console.error("Caption override save failed:", e); }
    setEditingCaption(null);
  };

  // Phase 2: Reset caption override (back to template)
  const resetCaptionOverride = async (clip, platformKey) => {
    if (!clip._projectId) return;
    const current = clip.captionOverrides || {};
    const updated = { ...current };
    delete updated[platformKey];
    try {
      await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { captionOverrides: updated });
    } catch (e) { console.error("Caption reset failed:", e); }
    setEditingCaption(null);
  };

  // Phase 2: Save YouTube title
  const saveYoutubeTitle = async (clip, value) => {
    if (!clip._projectId) return;
    const ytTitle = value.trim() || null; // null = fallback to clip.title
    try {
      await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { youtubeTitle: ytTitle });
    } catch (e) { console.error("YouTube title save failed:", e); }
    setEditingYtTitle(null);
  };

  // Phase 2: Save YouTube privacy
  const saveYoutubePrivacy = async (clip, value) => {
    if (!clip._projectId) return;
    try {
      await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { youtubePrivacy: value });
    } catch (e) { console.error("YouTube privacy save failed:", e); }
  };

  // Phase 2: Get effective caption for a clip+platform (override or resolved template)
  const getEffectiveCaption = (clip, platformKey) => {
    if (clip.captionOverrides?.[platformKey] != null) return clip.captionOverrides[platformKey];
    return resolveCaption(platformKey, clip, captionTemplates, ytDescriptions);
  };

  // Phase 2: Get which platform keys are enabled for a clip
  const getEnabledPlatforms = (clip) => {
    const toggles = clip.platformToggles || {};
    return activePlat
      .map((p) => accountToPlatformKey(p))
      .filter((k) => k && toggles[k] !== false)
      .filter((v, i, a) => a.indexOf(v) === i); // dedupe
  };

  // Phase 3: Schedule a clip (persist scheduledAt on clip object, don't publish yet)
  const scheduleClipOnly = async (clip, date, time) => {
    if (!clip._projectId) return;
    // #71: Scheduling a placeholder-named clip means it'll auto-publish later as
    // "Clip 3" unless the user renames it first. Warn explicitly.
    if (isPlaceholderTitle(clip.title)) {
      const ok = window.confirm(`This clip still has a placeholder name (${clip.title}). It will publish to social platforms with this title at the scheduled time.\n\nSchedule anyway?`);
      if (!ok) return;
    }
    const scheduledAt = `${date}T${time}:00`;
    try {
      await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { scheduledAt });
    } catch (e) { console.error("Schedule save failed:", e); }
    setSchedAction(null);
  };

  // Phase 3: Unschedule a clip
  const unscheduleClip = async (clip) => {
    if (!clip._projectId) return;
    try {
      await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { scheduledAt: null });
    } catch (e) { console.error("Unschedule failed:", e); }
  };

  // Phase 3: Auto-suggest next available time slot from weekly template
  const autoSuggestSlot = () => {
    const dates = getUpcomingDates();
    const wd = getWeekDates(new Date());
    const mondayIso = wd[0].iso;
    const tmpl = weekTemplateOverrides?.[mondayIso] || weeklyTemplate;
    if (!tmpl?.timeSlots?.length || !dates.length) return null;
    // Find existing scheduled times for each date
    const takenSlots = new Set();
    approved.forEach((c) => {
      if (c.scheduledAt) takenSlots.add(c.scheduledAt.slice(0, 16)); // "YYYY-MM-DDTHH:MM"
    });
    trackerData.forEach((t) => {
      if (t.date && t.time) {
        const m = t.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (m) {
          let h = parseInt(m[1]), min = parseInt(m[2]);
          const ap = m[3].toUpperCase();
          if (ap === "PM" && h !== 12) h += 12;
          if (ap === "AM" && h === 12) h = 0;
          takenSlots.add(`${t.date}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
        }
      }
    });
    for (const d of dates) {
      for (const slot of tmpl.timeSlots) {
        const m = slot.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!m) continue;
        let h = parseInt(m[1]), min = parseInt(m[2]);
        const ap = m[3].toUpperCase();
        if (ap === "PM" && h !== 12) h += 12;
        if (ap === "AM" && h === 12) h = 0;
        const key = `${d.iso}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
        if (!takenSlots.has(key)) {
          return { date: d.iso, hour: String(h).padStart(2, "0"), min: String(min).padStart(2, "0"), label: `${d.label} at ${slot}` };
        }
      }
    }
    return null;
  };

  // Phase 4: Retry publishing only failed platforms for a clip
  const retryFailed = async (clipId) => {
    const clip = approved.find((c) => c.id === clipId);
    const ps = publishStatus[clipId];
    if (!clip || !ps?.platforms) return;
    // #60: Hard-block publish for test clips.
    if (isClipTest(clip)) {
      setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], state: "failed", error: "Test clip — publishing blocked. Untoggle TEST on the project first." } }));
      return;
    }
    publishingRef.current = true;
    const failedKeys = Object.entries(ps.platforms).filter(([, st]) => st !== "done" && st !== "pending" && st !== "publishing").map(([k]) => k);
    if (failedKeys.length === 0) { publishingRef.current = false; return; }
    setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], state: "publishing" } }));
    let allSuccess = true;
    for (const platKey of failedKeys) {
      const plat = activePlat.find((p) => p.key === platKey);
      if (!plat) continue;
      const pk = accountToPlatformKey(plat);
      const caption = getEffectiveCaption(clip, pk);
      setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [platKey]: "publishing" } } }));
      try {
        let result;
        if (plat.platform === "TikTok" && window.clipflow?.tiktokPublish) {
          result = await window.clipflow.tiktokPublish({ accountId: plat.key, videoPath: clip.renderPath, title: clip.title, caption, clipId: clip.id, postMode: platformOptions?.tiktokPostMode || "direct_post", isTest: isClipTest(clip) });
        } else if ((plat.platform === "Instagram" || (plat.platform === "Meta" && plat.igAccountId)) && window.clipflow?.instagramPublish) {
          result = await window.clipflow.instagramPublish({ accountId: plat.key, videoPath: clip.renderPath, title: clip.title, caption, clipId: clip.id, isTest: isClipTest(clip) });
        } else if (plat.platform === "Facebook" && window.clipflow?.facebookPublish) {
          result = await window.clipflow.facebookPublish({ accountId: plat.key, videoPath: clip.renderPath, title: clip.title, caption, clipId: clip.id, isTest: isClipTest(clip) });
        } else if (plat.platform === "YouTube" && window.clipflow?.youtubePublish) {
          result = await window.clipflow.youtubePublish({ accountId: plat.key, videoPath: clip.renderPath, title: clip.title, caption, clipId: clip.id, tags: [], youtubeTitle: clip.youtubeTitle || clip.title, privacyStatus: clip.youtubePrivacy || "public", isTest: isClipTest(clip) });
        }
        if (result?.error) {
          setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [platKey]: result.error } } }));
          allSuccess = false;
        } else {
          setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [platKey]: "done" } } }));
        }
      } catch (err) {
        setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [platKey]: err.message || "Failed" } } }));
        allSuccess = false;
      }
    }
    setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], state: allSuccess ? "done" : "failed" } }));
    publishingRef.current = false;
    loadPublishLogs();
  };

  // Phase 4: Open confirmation modal before publishing
  const requestPublish = (clipId, schedOpts) => {
    setConfirmClipId(clipId);
    setConfirmSchedOpts(schedOpts || null);
  };
  const confirmPublish = () => {
    if (confirmClipId) publishClip(confirmClipId, confirmSchedOpts);
    setConfirmClipId(null);
    setConfirmSchedOpts(null);
  };
  const cancelConfirm = () => { setConfirmClipId(null); setConfirmSchedOpts(null); };

  // Drag-to-reorder
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const clipIds = useMemo(() => approved.map((c) => c.id), [approved]);
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = approved.findIndex((c) => c.id === active.id);
    const newIdx = approved.findIndex((c) => c.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    // Recompute order values and persist
    const reordered = [...approved];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);
    for (let i = 0; i < reordered.length; i++) {
      const c = reordered[i];
      if (c._projectId && c.queueOrder !== i) {
        window.clipflow?.projectUpdateClip(c._projectId, c.id, { queueOrder: i }).catch(() => {});
      }
    }
  };

  // Load publish logs on mount and after any publish
  const loadPublishLogs = async () => {
    if (window.clipflow?.getPublishLogs) {
      try {
        const logs = await window.clipflow.getPublishLogs(20);
        setPublishLogs(logs);
      } catch (e) { console.error("Failed to load publish logs:", e); }
    }
  };
  useEffect(() => { loadPublishLogs(); }, []);

  // Listen for publish progress events (all platforms)
  useEffect(() => {
    const progressHandler = (data) => setPublishProgress(data);
    if (window.clipflow?.onTiktokPublishProgress) window.clipflow.onTiktokPublishProgress(progressHandler);
    if (window.clipflow?.onInstagramPublishProgress) window.clipflow.onInstagramPublishProgress(progressHandler);
    if (window.clipflow?.onFacebookPublishProgress) window.clipflow.onFacebookPublishProgress(progressHandler);
    if (window.clipflow?.onYoutubePublishProgress) window.clipflow.onYoutubePublishProgress(progressHandler);
    return () => {
      if (window.clipflow?.removeTiktokPublishProgressListener) window.clipflow.removeTiktokPublishProgressListener();
      if (window.clipflow?.removeInstagramPublishProgressListener) window.clipflow.removeInstagramPublishProgressListener();
      if (window.clipflow?.removeFacebookPublishProgressListener) window.clipflow.removeFacebookPublishProgressListener();
      if (window.clipflow?.removeYoutubePublishProgressListener) window.clipflow.removeYoutubePublishProgressListener();
    };
  }, []);

  const dates = getUpcomingDates();
  const activePlat = platforms.filter((p) => p.connected);
  const wd = getWeekDates(new Date());
  const mondayIso = wd[0].iso;
  const effectiveTemplate = weekTemplateOverrides?.[mondayIso] || weeklyTemplate;

  const logPost = (clip, date, day, time, isScheduled) => {
    const gt = (clip.gameTag || extractGameTag(clip.title) || "unknown").toLowerCase();
    const snapped = snapToSlot(time, effectiveTemplate.timeSlots);
    setTrackerData((p) => [...p, { date, day, time: snapped, title: clip.title, clipId: clip.id, game: gt, type: gt === mainGameTagLc ? "main" : "other", platforms: activePlat.map((p) => p.abbr + "-" + p.name).join(", "), mainGameAtTime: mainGame, source: "clipflow", scheduled: !!isScheduled }]);
  };

  // Shared publish logic — handles both "Publish Now" and "Schedule" with optional publishTime
  // Phase 2: respects per-clip platformToggles, captionOverrides, youtubeTitle, youtubePrivacy
  const publishClip = async (clipId, scheduleOpts) => {
    if (publishingRef.current) return;
    const clip = approved.find((c) => c.id === clipId);
    if (!clip || !clip.renderPath) {
      setPublishStatus((p) => ({ ...p, [clipId]: { state: "failed", error: "Clip not rendered — render it first from the Editor", platforms: {} } }));
      return;
    }
    // #60: Hard-block publish for test clips.
    if (isClipTest(clip)) {
      setPublishStatus((p) => ({ ...p, [clipId]: { state: "failed", error: "Test clip — publishing blocked. Untoggle TEST on the project first.", platforms: {} } }));
      return;
    }

    // Phase 2: Filter platforms by per-clip toggles
    const toggles = clip.platformToggles || {};
    const enabledPlat = activePlat.filter((p) => {
      const key = accountToPlatformKey(p);
      return key && toggles[key] !== false;
    });

    if (enabledPlat.length === 0) {
      setPublishStatus((p) => ({ ...p, [clipId]: { state: "failed", error: "No platforms enabled — toggle at least one platform on", platforms: {} } }));
      return;
    }

    publishingRef.current = true;
    posthog.capture("clipflow_publish_triggered");

    // Initialize platform statuses
    const platStatuses = {};
    enabledPlat.forEach((p) => { platStatuses[p.key] = "pending"; });
    setPublishStatus((prev) => ({ ...prev, [clipId]: { state: "publishing", platforms: { ...platStatuses } } }));
    setSelClip(null);
    setSchedAction(null);

    let allSuccess = true;

    for (let i = 0; i < enabledPlat.length; i++) {
      const plat = enabledPlat[i];
      const platKey = accountToPlatformKey(plat);

      setPublishStatus((prev) => ({
        ...prev,
        [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: "publishing" } },
      }));

      // Phase 2: Use per-clip caption override if set, otherwise resolve from template
      const caption = getEffectiveCaption(clip, platKey);

      try {
        let result;
        if (plat.platform === "TikTok" && window.clipflow?.tiktokPublish) {
          result = await window.clipflow.tiktokPublish({
            accountId: plat.key, videoPath: clip.renderPath, title: clip.title,
            caption, clipId: clip.id, postMode: platformOptions?.tiktokPostMode || "direct_post",
            isTest: isClipTest(clip),
          });
        } else if ((plat.platform === "Instagram" || (plat.platform === "Meta" && plat.igAccountId)) && window.clipflow?.instagramPublish) {
          result = await window.clipflow.instagramPublish({
            accountId: plat.key, videoPath: clip.renderPath, title: clip.title,
            caption, clipId: clip.id, isTest: isClipTest(clip),
          });
        } else if (plat.platform === "Facebook" && window.clipflow?.facebookPublish) {
          result = await window.clipflow.facebookPublish({
            accountId: plat.key, videoPath: clip.renderPath, title: clip.title,
            caption, clipId: clip.id, isTest: isClipTest(clip),
          });
        } else if (plat.platform === "YouTube" && window.clipflow?.youtubePublish) {
          result = await window.clipflow.youtubePublish({
            accountId: plat.key, videoPath: clip.renderPath,
            title: clip.title, caption, clipId: clip.id, tags: [],
            youtubeTitle: clip.youtubeTitle || clip.title,
            privacyStatus: clip.youtubePrivacy || "public",
            isTest: isClipTest(clip),
          });
        } else {
          console.log("Publishing not yet wired for", plat.platform);
          setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: "done" } } }));
          continue;
        }

        if (result?.error) {
          console.error(`[Publish] ${plat.platform} failed for ${plat.key}:`, result.error);
          setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: result.error } } }));
          allSuccess = false;
        } else {
          console.log(`[Publish] ${plat.platform} success for ${plat.key}:`, result);
          setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: "done" } } }));
        }
      } catch (err) {
        console.error(`[Publish] Error for ${plat.key}:`, err);
        setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: err.message || "Failed" } } }));
        allSuccess = false;
      }
    }

    // Final status
    setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], state: allSuccess ? "done" : "failed" } }));

    // Log to tracker
    if (scheduleOpts) {
      const d = dates.find((x) => x.iso === scheduleOpts.date);
      const tl = TIME_OPTIONS.find((x) => x.value === scheduleOpts.time)?.label || scheduleOpts.time;
      setScheduled((p) => ({ ...p, [clipId]: `${d?.label || scheduleOpts.date} at ${tl}` }));
      logPost(clip, scheduleOpts.date, d?.dayName || "", tl, true);
    } else {
      const now = new Date();
      logPost(clip, now.toISOString().split("T")[0], FULL_DAY_NAMES[now.getDay()], now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), false);
    }

    publishingRef.current = false;
    setPublishProgress(null);
    loadPublishLogs(); // Refresh logs after publish
  };

  // Phase 4: Route through confirmation modal
  const pubNow = (clipId) => requestPublish(clipId, null);
  const schedAndPublish = (clipId) => requestPublish(clipId, { date: schedDate, time: schedTime });


  // Platform status display helper
  const getPlatStatusIcon = (status) => {
    if (status === "pending") return { icon: "\u23f3", color: T.textMuted };
    if (status === "publishing") return { icon: "\u2b06", color: T.yellow };
    if (status === "done") return { icon: "\u2705", color: T.green };
    // Any other string is an error message
    return { icon: "\u274c", color: T.red };
  };

  // Phase 3: Split approved into unscheduled and scheduled
  const unscheduledClips = approved.filter((c) => !c.scheduledAt);
  const scheduledClips = approved.filter((c) => !!c.scheduledAt).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  // Compute stats
  const publishedToday = publishLogs.filter((l) => l.status === "success" && new Date(l.timestamp).toDateString() === new Date().toDateString()).length;
  const failedCount = approved.filter((c) => publishStatus[c.id]?.state === "failed").length;

  // Phase 5: Collect unique game tags for filter (lowercased — clip.gameTag is canonical)
  const gameTagSet = useMemo(() => {
    const s = new Set();
    approved.forEach((c) => { if (c.gameTag) s.add(c.gameTag); });
    return Array.from(s).sort();
  }, [approved]);

  // Phase 5: Apply filters
  const filterClips = (clips) => {
    let result = clips;
    if (filterGame !== "all") result = result.filter((c) => c.gameTag === filterGame);
    if (filterStatus === "published") result = result.filter((c) => publishStatus[c.id]?.state === "done");
    else if (filterStatus === "failed") result = result.filter((c) => publishStatus[c.id]?.state === "failed");
    else if (filterStatus === "unrendered") result = result.filter((c) => !c.renderPath);
    // "all", "unscheduled", "scheduled" handled by which list is shown
    return result;
  };
  const filteredUnscheduled = filterClips(unscheduledClips);
  const filteredScheduled = filterClips(scheduledClips);
  const showUnscheduled = filterStatus !== "scheduled";
  const showScheduled = filterStatus !== "unscheduled";

  // Status badge helper — Phase 3: show schedule time
  const statusBadge = (clip) => {
    const ps = publishStatus[clip.id];
    const isPub = ps?.state === "done";
    const isPublishing = ps?.state === "publishing";
    const isFailed = ps?.state === "failed";
    const hasVideo = !!clip.renderPath;
    if (isPub) return { label: "Published", bg: "rgba(52,211,153,0.1)", color: T.green };
    if (isPublishing) return { label: "Publishing...", bg: "rgba(251,191,36,0.1)", color: T.yellow };
    if (isFailed) return { label: "Failed", bg: "rgba(248,113,113,0.1)", color: T.red };
    if (clip.scheduledAt) {
      const d = new Date(clip.scheduledAt);
      const label = `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
      return { label, bg: "rgba(251,191,36,0.1)", color: T.yellow };
    }
    if (!hasVideo) return { label: "Not rendered", bg: "rgba(251,191,36,0.1)", color: T.yellow };
    return { label: "Queued", bg: T.accentDim, color: T.accentLight };
  };

  // Format scheduledAt for display
  const formatSchedule = (isoStr) => {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  };

  return (
    <div>
      <PageHeader title="Queue & Schedule" subtitle={`${approved.length} clips ready`} />

      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        <Card style={{ padding: "14px 16px" }}>
          <SectionLabel>Unscheduled</SectionLabel>
          <div style={{ color: T.accentLight, fontSize: 26, fontWeight: 800, fontFamily: T.mono, marginTop: 4 }}>{unscheduledClips.length}</div>
        </Card>
        <Card style={{ padding: "14px 16px" }}>
          <SectionLabel>Scheduled</SectionLabel>
          <div style={{ color: T.yellow, fontSize: 26, fontWeight: 800, fontFamily: T.mono, marginTop: 4 }}>{scheduledClips.length}</div>
        </Card>
        <Card style={{ padding: "14px 16px" }}>
          <SectionLabel>Published Today</SectionLabel>
          <div style={{ color: T.green, fontSize: 26, fontWeight: 800, fontFamily: T.mono, marginTop: 4 }}>{publishedToday}</div>
        </Card>
        <Card style={{ padding: "14px 16px" }}>
          <SectionLabel>Failed</SectionLabel>
          <div style={{ color: T.red, fontSize: 26, fontWeight: 800, fontFamily: T.mono, marginTop: 4 }}>{failedCount}</div>
        </Card>
      </div>

      {/* Phase 5: Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.textTertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>Filter:</span>
        <Select value={filterStatus} onChange={setFilterStatus} options={[
          { value: "all", label: "All" },
          { value: "unscheduled", label: "Unscheduled" },
          { value: "scheduled", label: "Scheduled" },
          { value: "published", label: "Published" },
          { value: "failed", label: "Failed" },
          { value: "unrendered", label: "Not rendered" },
        ]} style={{ padding: "5px 10px", fontSize: 11 }} />
        {gameTagSet.length > 1 && (
          <Select value={filterGame} onChange={setFilterGame} options={[
            { value: "all", label: "All games" },
            ...gameTagSet.map((g) => ({ value: g, label: g })),
          ]} style={{ padding: "5px 10px", fontSize: 11 }} />
        )}
      </div>

      {/* Phase 4: Publish confirmation modal */}
      {confirmClipId && (() => {
        const clip = approved.find((c) => c.id === confirmClipId);
        if (!clip) return null;
        const enabledKeys = getEnabledPlatforms(clip);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={cancelConfirm}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "24px 28px", maxWidth: 480, width: "90%", maxHeight: "80vh", overflow: "auto" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 16 }}>Confirm Publish</div>
              {/* Clip summary */}
              <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
                <div style={{ width: 60, flexShrink: 0 }}>
                  <div style={{ aspectRatio: "9/16", borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {clip.thumbnailPath ? <img src={`file://${clip.thumbnailPath.replace(/\\/g, "/")}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: T.textMuted, fontSize: 20 }}>{"\uD83C\uDFAC"}</span>}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>{clip.title}</div>
                  {confirmSchedOpts && <div style={{ fontSize: 11, color: T.yellow, fontWeight: 600, marginBottom: 8 }}>Scheduled: {confirmSchedOpts.date} at {confirmSchedOpts.time}</div>}
                  <div style={{ fontSize: 10, color: T.textTertiary }}>Publishing to {enabledKeys.length} platform{enabledKeys.length !== 1 ? "s" : ""}</div>
                </div>
              </div>
              {/* Per-platform caption preview */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {enabledKeys.map((pk) => {
                  const meta = PLATFORM_META[pk];
                  const caption = getEffectiveCaption(clip, pk);
                  const isYt = pk === "youtube";
                  return (
                    <div key={pk} style={{ borderRadius: 6, border: `1px solid ${T.border}`, padding: "8px 12px", background: "rgba(255,255,255,0.02)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ width: 14, height: 14, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 6, fontWeight: 800, background: meta.bg, color: "#fff" }}>{meta.abbr[0]}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{meta.label}</span>
                        {isYt && <span style={{ fontSize: 10, color: T.textTertiary, marginLeft: "auto" }}>Title: {clip.youtubeTitle || clip.title}</span>}
                      </div>
                      <div style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 60, overflow: "hidden" }}>{caption}</div>
                    </div>
                  );
                })}
              </div>
              {/* #71: Placeholder-title warning */}
              {isPlaceholderTitle(clip.title) && (
                <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 7, border: `1px solid ${T.yellowBorder}`, background: T.yellowDim, color: T.yellow, fontSize: 11, fontWeight: 600 }}>
                  This clip still has a placeholder name (<span style={{ fontFamily: T.mono }}>{clip.title}</span>). Run AI Titles and Captions first, or rename it manually before publishing.
                </div>
              )}
              {/* #60: Test-mode banner */}
              {isClipTest(clip) && (
                <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 7, border: `1px dashed rgba(250,204,21,0.45)`, background: "rgba(250,204,21,0.08)", color: "#facc15", fontSize: 11, fontWeight: 600 }}>
                  This clip belongs to a TEST project — publishing is blocked. Untoggle TEST on the project in the Projects tab to go live.
                </div>
              )}
              {/* Actions */}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={cancelConfirm} style={{ padding: "8px 18px", borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                <button
                  onClick={confirmPublish}
                  disabled={isClipTest(clip)}
                  title={isClipTest(clip) ? "Test clip — publishing blocked." : undefined}
                  style={{ padding: "8px 22px", borderRadius: 7, border: "none", background: isClipTest(clip) ? "rgba(255,255,255,0.04)" : T.green, color: isClipTest(clip) ? T.textMuted : "#0a0b10", fontSize: 12, fontWeight: 700, cursor: isClipTest(clip) ? "not-allowed" : "pointer", fontFamily: T.font }}
                >{isClipTest(clip) ? "Blocked (Test)" : "Publish"}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Dashboard table — Phase 3: split into Unscheduled / Scheduled sections */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={clipIds} strategy={verticalListSortingStrategy}>

      {/* UNSCHEDULED SECTION */}
      {showUnscheduled && (
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
        {/* Section header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.accentLight }}>Unscheduled</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted }}>{filteredUnscheduled.length} clip{filteredUnscheduled.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        {/* Table header */}
        <div style={{ display: "grid", gridTemplateColumns: "28px 48px 1fr 70px 110px 90px 80px", gap: 0, padding: "8px 14px", borderBottom: `1px solid ${T.border}` }}>
          {["", "Clip", "Title", "Game", "Platforms", "Status", ""].map((h, i) => (
            <span key={i} style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.textMuted }}>{h}</span>
          ))}
        </div>

        {filteredUnscheduled.length === 0 && (
          <div style={{ padding: 30, textAlign: "center" }}>
            <div style={{ color: T.textTertiary, fontSize: 13 }}>{approved.length === 0 ? "No clips queued — approve clips in the Projects tab." : "No unscheduled clips matching filter."}</div>
          </div>
        )}

        {filteredUnscheduled.map((clip) => {
          const isM = clip.gameTag === mainGameTagLc;
          const gameTag = clip.gameTag;
          const ps = publishStatus[clip.id];
          const isPub = ps?.state === "done";
          const isPublishing = ps?.state === "publishing";
          const isFailed = ps?.state === "failed";
          const isSel = selClip === clip.id;
          const hasVideoId = !!clip.renderPath;
          const duration = clip.endTime && clip.startTime ? clip.endTime - clip.startTime : 0;
          const durationStr = duration > 0 ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}` : "";
          const projName = projectInfo[clip._projectId]?.name || "";
          const badge = statusBadge(clip);

          return (
            <SortableRow key={clip.id} id={clip.id}>
              {({ ref, style: sortStyle, attributes, listeners }) => (
                <div ref={ref} style={sortStyle} {...attributes}>
                  {/* Table row */}
                  <div
                    onClick={() => { if (!isPublishing) { setSelClip(isSel ? null : clip.id); setSchedAction(null); } }}
                    style={{ display: "grid", gridTemplateColumns: "28px 48px 1fr 70px 110px 90px 80px", gap: 0, padding: "10px 14px", alignItems: "center", borderBottom: `1px solid ${T.border}`, cursor: "pointer", background: isSel ? T.accentGlow : "transparent", transition: "background 0.15s", opacity: isPub ? 0.6 : 1 }}
                    onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.015)"; }}
                    onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* Drag handle */}
                    <div {...listeners} onClick={(e) => e.stopPropagation()} style={{ cursor: "grab", color: T.textMuted, fontSize: 14 }}>{"\u2630"}</div>
                    {/* Thumbnail */}
                    <div style={{ width: 34, height: 60, borderRadius: 6, overflow: "hidden", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {clip.thumbnailPath ? (
                        <img src={`file://${clip.thumbnailPath.replace(/\\/g, "/")}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span style={{ color: T.textMuted, fontSize: 16 }}>{"\uD83C\uDFAC"}</span>
                      )}
                    </div>
                    {/* Title + sub */}
                    <div style={{ minWidth: 0, paddingRight: 8 }}>
                      <div style={{ color: T.text, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clip.title}</div>
                      <div style={{ color: T.textTertiary, fontSize: 10, marginTop: 2 }}>{durationStr}{projName ? ` \u00B7 ${projName}` : ""}</div>
                    </div>
                    {/* Game tag */}
                    <div>{gameTag && <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: isM ? T.accentDim : "rgba(52,211,153,0.12)", color: isM ? T.accentLight : T.green }}>{gameTag.length > 6 ? gameTag.slice(0, 6) : gameTag}</span>}</div>
                    {/* Platform icons — dimmed if toggled off */}
                    <div style={{ display: "flex", gap: 3 }}>
                      {activePlat.map((p) => {
                        const pk = accountToPlatformKey(p);
                        const isOn = pk && (clip.platformToggles || {})[pk] !== false;
                        return (
                          <span key={p.key} style={{ width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, background: p.platform === "TikTok" ? "#000" : p.platform === "Instagram" ? "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)" : p.platform === "YouTube" ? "#c4302b" : p.platform === "Facebook" ? "#1877f2" : "rgba(255,255,255,0.1)", color: "#fff", border: p.platform === "TikTok" ? "1px solid rgba(255,255,255,0.15)" : "none", opacity: isOn ? 1 : 0.25, transition: "opacity 0.15s" }}>{p.abbr?.[0] || p.platform[0]}</span>
                        );
                      })}
                    </div>
                    {/* Status */}
                    <div><span style={{ padding: "3px 9px", borderRadius: 20, fontSize: 9, fontWeight: 700, background: badge.bg, color: badge.color, whiteSpace: "nowrap" }}>{badge.label}</span></div>
                    {/* Action button */}
                    <div style={{ textAlign: "right" }}>
                      {!isPub && !isPublishing && hasVideoId && (
                        isClipTest(clip) ? (
                          <button disabled title="Test clip — publishing blocked. Untoggle TEST on the project to go live." style={{ padding: "5px 12px", borderRadius: 6, border: `1px dashed ${T.borderHover}`, background: "transparent", color: T.textMuted, fontSize: 10, fontWeight: 700, cursor: "not-allowed", fontFamily: T.font }}>Test</button>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); pubNow(clip.id); }} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: T.green, color: "#0a0b10", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Publish</button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isSel && (
                    <div style={{ padding: "20px 24px", background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", gap: 24 }}>
                        {/* Large thumbnail */}
                        <div style={{ width: 120, flexShrink: 0 }}>
                          <div style={{ aspectRatio: "9/16", borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {clip.thumbnailPath ? (
                              <img src={`file://${clip.thumbnailPath.replace(/\\/g, "/")}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <span style={{ color: T.textMuted, fontSize: 32 }}>{"\uD83C\uDFAC"}</span>
                            )}
                          </div>
                        </div>
                        {/* Detail content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Editable title */}
                          {editingTitle === clip.id ? (
                            <input
                              autoFocus
                              value={editTitleValue}
                              onChange={(e) => setEditTitleValue(e.target.value)}
                              onBlur={() => saveTitle(clip)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveTitle(clip); if (e.key === "Escape") setEditingTitle(null); }}
                              style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.accentBorder}`, borderRadius: 6, padding: "6px 10px", color: T.text, fontSize: 15, fontWeight: 700, fontFamily: T.font, outline: "none", marginBottom: 8 }}
                            />
                          ) : (
                            <div
                              onDoubleClick={() => { setEditingTitle(clip.id); setEditTitleValue(clip.title); }}
                              style={{ color: T.text, fontSize: 15, fontWeight: 700, marginBottom: 6, cursor: "text", lineHeight: 1.3 }}
                              title="Double-click to edit"
                            >{clip.title}</div>
                          )}
                          <div style={{ display: "flex", gap: 10, fontSize: 11, color: T.textTertiary, marginBottom: 12, alignItems: "center" }}>
                            <span style={{ fontFamily: T.mono }}>{durationStr}</span>
                            {gameTag && <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: isM ? T.accentDim : "rgba(52,211,153,0.12)", color: isM ? T.accentLight : T.green }}>{gameTag}</span>}
                            {projName && <span>{projName}</span>}
                          </div>

                          {/* Phase 2: Platform toggle pills */}
                          <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, color: T.textTertiary, marginRight: 2 }}>Platforms:</span>
                            {activePlat.map((p) => {
                              const pk = accountToPlatformKey(p);
                              if (!pk) return null;
                              const meta = PLATFORM_META[pk];
                              const isOn = (clip.platformToggles || {})[pk] !== false;
                              return (
                                <button
                                  key={p.key}
                                  onClick={(e) => { e.stopPropagation(); togglePlatform(clip, pk); }}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 5, padding: "4px 10px 4px 6px",
                                    borderRadius: 20, border: `1px solid ${isOn ? "rgba(255,255,255,0.12)" : T.border}`,
                                    background: isOn ? "rgba(255,255,255,0.06)" : "transparent",
                                    opacity: isOn ? 1 : 0.4, cursor: "pointer", transition: "all 0.15s", fontFamily: T.font,
                                  }}
                                >
                                  <span style={{ width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, background: meta.bg, color: "#fff", border: pk === "tiktok" ? "1px solid rgba(255,255,255,0.15)" : "none", flexShrink: 0 }}>{meta.abbr[0]}</span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: isOn ? T.text : T.textTertiary }}>{meta.label}</span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Phase 2: Caption preview cards per enabled platform */}
                          {(() => {
                            const enabledKeys = getEnabledPlatforms(clip);
                            if (enabledKeys.length === 0) return (
                              <div style={{ padding: "10px 14px", borderRadius: 8, background: T.redDim, border: `1px solid ${T.redBorder}`, marginBottom: 14, fontSize: 11, color: T.red, fontWeight: 600 }}>
                                All platforms disabled — toggle at least one to publish.
                              </div>
                            );
                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                                {enabledKeys.map((pk) => {
                                  const meta = PLATFORM_META[pk];
                                  const isYt = pk === "youtube";
                                  const caption = getEffectiveCaption(clip, pk);
                                  const hasOverride = clip.captionOverrides?.[pk] != null;
                                  const isEditingThis = editingCaption?.clipId === clip.id && editingCaption?.platform === pk;
                                  const isEditingYtTitleThis = isYt && editingYtTitle === clip.id;
                                  const charLimit = isYt ? PLATFORM_CHAR_LIMITS.youtube_desc : PLATFORM_CHAR_LIMITS[pk];
                                  const ytTitleVal = clip.youtubeTitle || clip.title || "";

                                  return (
                                    <div key={pk} style={{ borderRadius: 8, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
                                      {/* Caption card header */}
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${T.border}` }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                          <span style={{ width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 800, background: meta.bg, color: "#fff", border: pk === "tiktok" ? "1px solid rgba(255,255,255,0.12)" : "none" }}>{meta.abbr[0]}</span>
                                          <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{meta.label}</span>
                                          {hasOverride && <span style={{ fontSize: 9, fontWeight: 700, color: T.accent, background: T.accentDim, padding: "1px 6px", borderRadius: 4 }}>Custom</span>}
                                        </div>
                                        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: T.mono, color: charCountColor(caption.length, charLimit) }}>
                                          {caption.length}/{charLimit}
                                        </span>
                                      </div>

                                      {/* YouTube: separate title field */}
                                      {isYt && (
                                        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                                          <span style={{ fontSize: 10, color: T.textTertiary, fontWeight: 600, minWidth: 32 }}>Title</span>
                                          {isEditingYtTitleThis ? (
                                            <input
                                              autoFocus
                                              value={editYtTitleValue}
                                              onChange={(e) => setEditYtTitleValue(e.target.value)}
                                              onBlur={() => saveYoutubeTitle(clip, editYtTitleValue)}
                                              onKeyDown={(e) => { if (e.key === "Enter") saveYoutubeTitle(clip, editYtTitleValue); if (e.key === "Escape") setEditingYtTitle(null); }}
                                              maxLength={100}
                                              style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.accentBorder}`, borderRadius: 4, padding: "4px 8px", color: T.text, fontSize: 11, fontFamily: T.font, outline: "none" }}
                                            />
                                          ) : (
                                            <div
                                              onClick={(e) => { e.stopPropagation(); setEditingYtTitle(clip.id); setEditYtTitleValue(ytTitleVal); }}
                                              style={{ flex: 1, fontSize: 11, color: T.text, cursor: "text", padding: "4px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                            >{ytTitleVal}</div>
                                          )}
                                          <span style={{ fontSize: 10, fontFamily: T.mono, color: charCountColor(ytTitleVal.length, PLATFORM_CHAR_LIMITS.youtube_title) }}>{ytTitleVal.length}/100</span>
                                        </div>
                                      )}

                                      {/* YouTube: privacy selector */}
                                      {isYt && (
                                        <div style={{ padding: "6px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                                          <span style={{ fontSize: 10, color: T.textTertiary, fontWeight: 600, minWidth: 32 }}>Privacy</span>
                                          <select
                                            value={clip.youtubePrivacy || "public"}
                                            onChange={(e) => { e.stopPropagation(); saveYoutubePrivacy(clip, e.target.value); }}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 4, padding: "3px 8px", color: T.text, fontSize: 11, fontFamily: T.font, outline: "none", cursor: "pointer" }}
                                          >
                                            <option value="public">Public</option>
                                            <option value="unlisted">Unlisted</option>
                                            <option value="private">Private</option>
                                          </select>
                                        </div>
                                      )}

                                      {/* Caption body */}
                                      <div style={{ padding: "8px 12px" }}>
                                        {isYt && <div style={{ fontSize: 10, color: T.textTertiary, fontWeight: 600, marginBottom: 4 }}>Description</div>}
                                        {isEditingThis ? (
                                          <textarea
                                            autoFocus
                                            value={editCaptionValue}
                                            onChange={(e) => setEditCaptionValue(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Escape") setEditingCaption(null); }}
                                            style={{ width: "100%", minHeight: 60, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.accentBorder}`, borderRadius: 4, padding: "6px 8px", color: T.text, fontSize: 11, fontFamily: T.font, outline: "none", resize: "vertical", lineHeight: 1.5 }}
                                          />
                                        ) : (
                                          <div
                                            onClick={(e) => { e.stopPropagation(); setEditingCaption({ clipId: clip.id, platform: pk }); setEditCaptionValue(caption); }}
                                            style={{ fontSize: 11, color: T.textSecondary, lineHeight: 1.5, cursor: "text", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 80, overflow: "hidden" }}
                                            title="Click to edit"
                                          >{caption || <span style={{ color: T.textMuted, fontStyle: "italic" }}>No caption — click to add</span>}</div>
                                        )}
                                        {/* Edit/Save/Reset actions */}
                                        {isEditingThis && (
                                          <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                                            <span style={{ fontSize: 10, fontFamily: T.mono, color: charCountColor(editCaptionValue.length, charLimit) }}>{editCaptionValue.length}/{charLimit}</span>
                                            <div style={{ flex: 1 }} />
                                            <button onClick={(e) => { e.stopPropagation(); saveCaptionOverride(clip, pk, editCaptionValue); }} style={{ padding: "3px 10px", borderRadius: 4, border: "none", background: T.accent, color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save</button>
                                            <button onClick={(e) => { e.stopPropagation(); setEditingCaption(null); }} style={{ padding: "3px 10px", borderRadius: 4, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                                          </div>
                                        )}
                                        {!isEditingThis && hasOverride && (
                                          <div style={{ marginTop: 6 }}>
                                            <button onClick={(e) => { e.stopPropagation(); resetCaptionOverride(clip, pk); }} style={{ padding: "2px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 9, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Reset to template</button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}

                          {/* Publishing progress (if active) — only shows enabled platforms */}
                          {(isPublishing || isFailed) && ps?.platforms && (
                            <div style={{ background: T.surface, border: `1px solid ${isPublishing ? T.yellowBorder : T.redBorder}`, borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
                              <SectionLabel>{isPublishing ? "Publishing..." : "Publish results"}</SectionLabel>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                                {Object.keys(ps.platforms).map((platKey) => {
                                  const plat = activePlat.find((p) => p.key === platKey);
                                  if (!plat) return null;
                                  const st = ps.platforms[platKey] || "pending";
                                  const { icon, color } = getPlatStatusIcon(st);
                                  return (
                                    <div key={platKey} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                                      <span style={{ fontSize: 12 }}>{icon}</span>
                                      <span style={{ color: T.text, fontSize: 11, fontWeight: 600, minWidth: 80 }}>{plat.abbr} — {plat.name}</span>
                                      <span style={{ color, fontSize: 11, fontWeight: 600 }}>{st === "pending" ? "Waiting..." : st === "publishing" ? (publishProgress?.detail || "Connecting...") : st === "done" ? "Sent" : st}</span>
                                    </div>
                                  );
                                })}
                              </div>
                              {isFailed && ps.error && <div style={{ marginTop: 8, color: T.red, fontSize: 11, fontWeight: 600 }}>{ps.error}</div>}
                            </div>
                          )}

                          {/* Not rendered warning */}
                          {!hasVideoId && (
                            <div style={{ marginBottom: 14 }}>
                              <InfoBanner color={T.yellow} icon={"\u26a0\ufe0f"}>This clip hasn't been rendered yet. Open it in the Editor and click "Ready to Share" first.</InfoBanner>
                            </div>
                          )}

                          {/* Actions */}
                          <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 14, borderTop: `1px solid ${T.border}`, flexWrap: "wrap" }}>
                            <button
                              onClick={() => dequeueClip(clip)}
                              style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font, transition: "all 0.15s" }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textTertiary; }}
                            >Remove</button>
                            {/* Phase 3: Unschedule if scheduled */}
                            {clip.scheduledAt && (
                              <button onClick={() => unscheduleClip(clip)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.yellowBorder}`, background: T.yellowDim, color: T.yellow, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Unschedule</button>
                            )}
                            {/* Phase 4: Retry failed */}
                            {isFailed && (
                              <button onClick={() => retryFailed(clip.id)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.redBorder}`, background: T.redDim, color: T.red, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Retry Failed</button>
                            )}
                            <div style={{ flex: 1 }} />
                            {schedAction !== "schedule" && !clip.scheduledAt && (
                              <button onClick={() => { setSchedAction("schedule"); const sug = autoSuggestSlot(); if (sug) { setSchedDate(sug.date); setSchedHour(sug.hour); setSchedMin(sug.min); } }} disabled={!hasVideoId} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: hasVideoId ? T.textSecondary : T.textMuted, fontSize: 11, fontWeight: 700, cursor: hasVideoId ? "pointer" : "default", fontFamily: T.font }}>Schedule</button>
                            )}
                            {!isPub && !isPublishing && (
                              <button
                                onClick={() => pubNow(clip.id)}
                                disabled={!hasVideoId || publishingRef.current || isClipTest(clip)}
                                title={isClipTest(clip) ? "Test clip — publishing blocked. Untoggle TEST on the project to go live." : undefined}
                                style={{ padding: "7px 14px", borderRadius: 7, border: isClipTest(clip) ? `1px dashed ${T.borderHover}` : "none", background: isClipTest(clip) ? "transparent" : (hasVideoId ? T.green : "rgba(255,255,255,0.04)"), color: isClipTest(clip) ? T.textMuted : (hasVideoId ? "#0a0b10" : T.textMuted), fontSize: 11, fontWeight: 700, cursor: isClipTest(clip) ? "not-allowed" : (hasVideoId ? "pointer" : "default"), fontFamily: T.font }}
                              >{isClipTest(clip) ? "Test — cannot publish" : "Publish Now"}</button>
                            )}
                          </div>
                          {/* Phase 3: Schedule picker with auto-suggest */}
                          {schedAction === "schedule" && (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                <Select value={schedDate} onChange={setSchedDate} options={[{ value: "", label: "Pick date..." }, ...dates.map((d) => ({ value: d.iso, label: d.label }))]} style={{ padding: "8px 12px", fontSize: 12 }} />
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <Select value={schedHour} onChange={setSchedHour} options={HOUR_OPTIONS} style={{ padding: "8px 8px", fontSize: 12, minWidth: 70 }} />
                                  <span style={{ color: T.textMuted, fontSize: 14, fontWeight: 700 }}>:</span>
                                  <Select value={schedMin} onChange={setSchedMin} options={MINUTE_OPTIONS} style={{ padding: "8px 8px", fontSize: 12, minWidth: 56 }} />
                                </div>
                                <button onClick={() => { scheduleClipOnly(clip, schedDate, `${schedHour}:${schedMin}`); }} disabled={!schedDate} style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: schedDate ? T.accent : "rgba(255,255,255,0.04)", color: schedDate ? "#fff" : T.textMuted, fontSize: 11, fontWeight: 700, cursor: schedDate ? "pointer" : "default", fontFamily: T.font }}>Save Schedule</button>
                                <button onClick={() => setSchedAction(null)} style={{ padding: "8px 12px", borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                              </div>
                              {(() => { const sug = autoSuggestSlot(); return sug ? <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 6 }}>Suggested: {sug.label}</div> : null; })()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </SortableRow>
          );
        })}
      </Card>
      )}

      {/* SCHEDULED SECTION */}
      {showScheduled && scheduledClips.length > 0 && (
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(251,191,36,0.03)", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.yellow }}>Scheduled</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted }}>{filteredScheduled.length} clip{filteredScheduled.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 70px 140px 90px 80px", gap: 0, padding: "8px 14px", borderBottom: `1px solid ${T.border}` }}>
          {["Clip", "Title", "Game", "Scheduled For", "Status", ""].map((h, i) => (
            <span key={i} style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.textMuted }}>{h}</span>
          ))}
        </div>

        {filteredScheduled.map((clip) => {
          const isM = clip.gameTag === mainGameTagLc;
          const gameTag = clip.gameTag;
          const ps = publishStatus[clip.id];
          const isPub = ps?.state === "done";
          const isPublishing = ps?.state === "publishing";
          const isFailed = ps?.state === "failed";
          const isSel = selClip === clip.id;
          const hasVideoId = !!clip.renderPath;
          const badge = statusBadge(clip);

          return (
            <div key={clip.id}>
              <div
                onClick={() => { if (!isPublishing) { setSelClip(isSel ? null : clip.id); setSchedAction(null); } }}
                style={{ display: "grid", gridTemplateColumns: "48px 1fr 70px 140px 90px 80px", gap: 0, padding: "10px 14px", alignItems: "center", borderBottom: `1px solid ${T.border}`, cursor: "pointer", background: isSel ? T.accentGlow : "transparent", transition: "background 0.15s", opacity: isPub ? 0.6 : 1 }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.015)"; }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
              >
                {/* Thumbnail */}
                <div style={{ width: 34, height: 60, borderRadius: 6, overflow: "hidden", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {clip.thumbnailPath ? <img src={`file://${clip.thumbnailPath.replace(/\\/g, "/")}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: T.textMuted, fontSize: 16 }}>{"\uD83C\uDFAC"}</span>}
                </div>
                {/* Title */}
                <div style={{ minWidth: 0, paddingRight: 8 }}>
                  <div style={{ color: T.text, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clip.title}</div>
                </div>
                {/* Game */}
                <div>{gameTag && <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: isM ? T.accentDim : "rgba(52,211,153,0.12)", color: isM ? T.accentLight : T.green }}>{gameTag.length > 6 ? gameTag.slice(0, 6) : gameTag}</span>}</div>
                {/* Scheduled time */}
                <div style={{ fontSize: 11, fontWeight: 600, color: T.yellow }}>{formatSchedule(clip.scheduledAt)}</div>
                {/* Status */}
                <div><span style={{ padding: "3px 9px", borderRadius: 20, fontSize: 9, fontWeight: 700, background: badge.bg, color: badge.color, whiteSpace: "nowrap" }}>{badge.label}</span></div>
                {/* Action */}
                <div style={{ textAlign: "right" }}>
                  {!isPub && !isPublishing && hasVideoId && (
                    <button onClick={(e) => { e.stopPropagation(); pubNow(clip.id); }} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: T.green, color: "#0a0b10", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Publish</button>
                  )}
                </div>
              </div>

              {/* Expanded detail — reuse same panel structure */}
              {isSel && (
                <div style={{ padding: "20px 24px", background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", gap: 24 }}>
                    <div style={{ width: 120, flexShrink: 0 }}>
                      <div style={{ aspectRatio: "9/16", borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {clip.thumbnailPath ? <img src={`file://${clip.thumbnailPath.replace(/\\/g, "/")}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: T.textMuted, fontSize: 32 }}>{"\uD83C\uDFAC"}</span>}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: T.text, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{clip.title}</div>
                      <div style={{ display: "flex", gap: 10, fontSize: 11, color: T.textTertiary, marginBottom: 8, alignItems: "center" }}>
                        {gameTag && <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: isM ? T.accentDim : "rgba(52,211,153,0.12)", color: isM ? T.accentLight : T.green }}>{gameTag}</span>}
                        <span style={{ color: T.yellow, fontWeight: 600 }}>{formatSchedule(clip.scheduledAt)}</span>
                      </div>
                      {/* Platform toggles */}
                      <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, color: T.textTertiary, marginRight: 2 }}>Platforms:</span>
                        {activePlat.map((p) => {
                          const pk = accountToPlatformKey(p);
                          if (!pk) return null;
                          const meta = PLATFORM_META[pk];
                          const isOn = (clip.platformToggles || {})[pk] !== false;
                          return (
                            <button key={p.key} onClick={(e) => { e.stopPropagation(); togglePlatform(clip, pk); }}
                              style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px 4px 6px", borderRadius: 20, border: `1px solid ${isOn ? "rgba(255,255,255,0.12)" : T.border}`, background: isOn ? "rgba(255,255,255,0.06)" : "transparent", opacity: isOn ? 1 : 0.4, cursor: "pointer", transition: "all 0.15s", fontFamily: T.font }}>
                              <span style={{ width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, background: meta.bg, color: "#fff", border: pk === "tiktok" ? "1px solid rgba(255,255,255,0.15)" : "none", flexShrink: 0 }}>{meta.abbr[0]}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: isOn ? T.text : T.textTertiary }}>{meta.label}</span>
                            </button>
                          );
                        })}
                      </div>
                      {/* Actions */}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 14, borderTop: `1px solid ${T.border}`, flexWrap: "wrap" }}>
                        <button onClick={() => dequeueClip(clip)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font, transition: "all 0.15s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textTertiary; }}
                        >Remove</button>
                        <button onClick={() => unscheduleClip(clip)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.yellowBorder}`, background: T.yellowDim, color: T.yellow, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Unschedule</button>
                        {isFailed && <button onClick={() => retryFailed(clip.id)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.redBorder}`, background: T.redDim, color: T.red, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Retry Failed</button>}
                        <div style={{ flex: 1 }} />
                        {!isPub && !isPublishing && (
                          <button onClick={() => pubNow(clip.id)} disabled={!hasVideoId || publishingRef.current} style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: hasVideoId ? T.green : "rgba(255,255,255,0.04)", color: hasVideoId ? "#0a0b10" : T.textMuted, fontSize: 11, fontWeight: 700, cursor: hasVideoId ? "pointer" : "default", fontFamily: T.font }}>Publish Now</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>
      )}

      </SortableContext>
      </DndContext>

      {/* PUBLISH LOG */}
      <Card style={{ padding: "14px 20px", marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SectionLabel>Publish Log</SectionLabel>
          <button onClick={() => { setShowLogs(!showLogs); if (!showLogs) loadPublishLogs(); }} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>{showLogs ? "Hide" : `Show (${publishLogs.length})`}</button>
        </div>
        {showLogs && (
          <div style={{ marginTop: 12, maxHeight: 300, overflowY: "auto" }}>
            {publishLogs.length === 0 && <div style={{ color: T.textTertiary, fontSize: 12, padding: "10px 0" }}>No publish attempts yet.</div>}
            {publishLogs.map((log, i) => {
              const statusColor = log.status === "success" ? T.green : log.status === "failed" ? T.red : log.status === "uploading" || log.status === "started" ? T.yellow : T.textMuted;
              const time = new Date(log.timestamp).toLocaleString();
              return (
                <div key={i} style={{ padding: "8px 12px", borderRadius: 6, background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`, marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ color: T.text, fontSize: 12, fontWeight: 600, maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.clipTitle || "Unknown clip"}</span>
                    <span style={{ color: statusColor, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{log.status}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: T.textTertiary }}>
                    <span>{log.platform} → {log.accountName || log.accountId}</span>
                    <span>{time}</span>
                  </div>
                  {log.error && <div style={{ color: T.red, fontSize: 11, marginTop: 4, fontFamily: T.mono, wordBreak: "break-all" }}>{log.error}</div>}
                  {log.publishId && <div style={{ color: T.textMuted, fontSize: 10, marginTop: 2, fontFamily: T.mono }}>publish_id: {log.publishId}</div>}
                  {log.postId && <div style={{ color: T.green, fontSize: 10, marginTop: 2, fontFamily: T.mono }}>post_id: {log.postId}</div>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* CAPTIONS & DESCRIPTIONS */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 28 }}>
        <CaptionsView
          ytDescriptions={ytDescriptions}
          setYtDescriptions={setYtDescriptions}
          captionTemplates={captionTemplates}
          setCaptionTemplates={setCaptionTemplates}
          platformOptions={platformOptions}
          setPlatformOptions={setPlatformOptions}
          gamesDb={gamesDb}
        />
      </div>
      <div style={{ height: 60 }} />
    </div>
  );
}
