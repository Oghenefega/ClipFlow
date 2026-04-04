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

export default function QueueView({
  allClips, localProjects, mainGame, mainGameTag, platforms, trackerData, setTrackerData,
  weeklyTemplate, weekTemplateOverrides,
  ytDescriptions, setYtDescriptions, captionTemplates, setCaptionTemplates,
  platformOptions, setPlatformOptions, gamesDb,
  requireHashtagInTitle = true,
}) {
  const scheduledClipIds = new Set(trackerData.map((t) => t.clipId).filter(Boolean));
  const scheduledTitles = new Set(trackerData.map((t) => t.title).filter(Boolean));
  // Preserve projectId on each clip for IPC calls (dequeue, title edit)
  const approved = Object.entries(allClips).flatMap(([projectId, clips]) =>
    clips.filter((c) => (c.status === "approved" || c.status === "ready") && (!requireHashtagInTitle || hasHashtag(c.title)) && !scheduledClipIds.has(c.id) && !scheduledTitles.has(c.title))
      .map((c) => ({ ...c, _projectId: projectId }))
  ).sort((a, b) => (a.queueOrder ?? Infinity) - (b.queueOrder ?? Infinity) || new Date(a.createdAt) - new Date(b.createdAt));
  // Build projectId→name lookup
  const projectNames = React.useMemo(() => {
    const map = {};
    for (const p of (localProjects || [])) map[p.id] = p.name || p.sourceName || p.id;
    return map;
  }, [localProjects]);
  const mainCount = approved.filter((c) => extractGameTag(c.title) === mainGameTag).length;
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
    const gt = extractGameTag(clip.title) || "unknown";
    const snapped = snapToSlot(time, effectiveTemplate.timeSlots);
    setTrackerData((p) => [...p, { date, day, time: snapped, title: clip.title, clipId: clip.id, game: gt, type: gt === mainGameTag ? "main" : "other", platforms: activePlat.map((p) => p.abbr + "-" + p.name).join(", "), mainGameAtTime: mainGame, source: "clipflow", scheduled: !!isScheduled }]);
  };

  // Shared publish logic — handles both "Publish Now" and "Schedule" with optional publishTime
  const publishClip = async (clipId, scheduleOpts) => {
    if (publishingRef.current) return;
    const clip = approved.find((c) => c.id === clipId);
    if (!clip || !clip.renderPath) {
      setPublishStatus((p) => ({ ...p, [clipId]: { state: "failed", error: "Clip not rendered — render it first from the Editor", platforms: {} } }));
      return;
    }

    publishingRef.current = true;
    posthog.capture("clipflow_publish_triggered");

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
        if (plat.platform === "TikTok" && window.clipflow?.tiktokPublish) {
          // Build caption from template
          const gameTag = extractGameTag(clip.title) || "";
          let caption = clip.title || "";
          if (captionTemplates?.tiktok) {
            caption = captionTemplates.tiktok
              .replace("{title}", clip.title || "")
              .replace("#{gametitle}", gameTag ? `#${gameTag}` : "");
          }

          const result = await window.clipflow.tiktokPublish({
            accountId: plat.key,
            videoPath: clip.renderPath,
            title: clip.title,
            caption,
            clipId: clip.id,
            postMode: platformOptions?.tiktokPostMode || "direct_post",
          });

          if (result?.error) {
            console.error(`[Publish] TikTok failed for ${plat.key}:`, result.error);
            setPublishStatus((prev) => ({
              ...prev,
              [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: result.error } },
            }));
            allSuccess = false;
          } else {
            console.log(`[Publish] TikTok success for ${plat.key}:`, result);
            setPublishStatus((prev) => ({
              ...prev,
              [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: "done" } },
            }));
          }
        } else if (plat.platform === "Instagram" && window.clipflow?.instagramPublish) {
          // Instagram Reel publish (IG Business Login or legacy Meta account)
          const gameTag = extractGameTag(clip.title) || "";
          let caption = clip.title || "";
          if (captionTemplates?.instagram) {
            caption = captionTemplates.instagram
              .replace("{title}", clip.title || "")
              .replace("#{gametitle}", gameTag ? `#${gameTag}` : "");
          }

          const result = await window.clipflow.instagramPublish({
            accountId: plat.key,
            videoPath: clip.renderPath,
            title: clip.title,
            caption,
            clipId: clip.id,
          });

          if (result?.error) {
            console.error(`[Publish] Instagram failed for ${plat.key}:`, result.error);
            setPublishStatus((prev) => ({
              ...prev,
              [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: result.error } },
            }));
            allSuccess = false;
          } else {
            console.log(`[Publish] Instagram success for ${plat.key}:`, result);
            setPublishStatus((prev) => ({
              ...prev,
              [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: "done" } },
            }));
          }
        } else if (plat.platform === "Facebook" && window.clipflow?.facebookPublish) {
          // Facebook Page video publish
          const gameTag = extractGameTag(clip.title) || "";
          let caption = clip.title || "";
          if (captionTemplates?.facebook) {
            caption = captionTemplates.facebook
              .replace("{title}", clip.title || "")
              .replace("#{gametitle}", gameTag ? `#${gameTag}` : "");
          }

          const result = await window.clipflow.facebookPublish({
            accountId: plat.key,
            videoPath: clip.renderPath,
            title: clip.title,
            caption,
            clipId: clip.id,
          });

          if (result?.error) {
            console.error(`[Publish] Facebook failed for ${plat.key}:`, result.error);
            setPublishStatus((prev) => ({
              ...prev,
              [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: result.error } },
            }));
            allSuccess = false;
          } else {
            console.log(`[Publish] Facebook success for ${plat.key}:`, result);
            setPublishStatus((prev) => ({
              ...prev,
              [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: "done" } },
            }));
          }
        } else if ((plat.platform === "Meta") && plat.igAccountId && window.clipflow?.instagramPublish) {
          // Legacy Meta accounts — publish to Instagram (backwards compat)
          const gameTag = extractGameTag(clip.title) || "";
          let caption = clip.title || "";
          if (captionTemplates?.instagram) {
            caption = captionTemplates.instagram
              .replace("{title}", clip.title || "")
              .replace("#{gametitle}", gameTag ? `#${gameTag}` : "");
          }

          const result = await window.clipflow.instagramPublish({
            accountId: plat.key,
            videoPath: clip.renderPath,
            title: clip.title,
            caption,
            clipId: clip.id,
          });

          if (result?.error) {
            setPublishStatus((prev) => ({
              ...prev,
              [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: result.error } },
            }));
            allSuccess = false;
          } else {
            setPublishStatus((prev) => ({
              ...prev,
              [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: "done" } },
            }));
          }
        } else if (plat.platform === "YouTube" && window.clipflow?.youtubePublish) {
          // YouTube publish
          const result = await window.clipflow.youtubePublish({
            accountId: plat.key,
            videoPath: clip.renderPath,
            title: clip.title,
            caption: clip.title || "",
            clipId: clip.id,
            tags: [],
          });

          if (result?.error) {
            console.error(`[Publish] YouTube failed for ${plat.key}:`, result.error);
            setPublishStatus((prev) => ({
              ...prev,
              [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: result.error } },
            }));
            allSuccess = false;
          } else {
            console.log(`[Publish] YouTube success for ${plat.key}:`, result);
            setPublishStatus((prev) => ({
              ...prev,
              [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: "done" } },
            }));
          }
        } else {
          // Platform not yet supported
          console.log("Publishing not yet wired for", plat.platform, { platform: plat.key, clipTitle: clip.title });
          setPublishStatus((prev) => ({
            ...prev,
            [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: "done" } },
          }));
        }
      } catch (err) {
        console.error(`[Publish] Error for ${plat.key}:`, err);
        setPublishStatus((prev) => ({
          ...prev,
          [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: err.message || "Failed" } },
        }));
        allSuccess = false;
      }

    }

    // Final status
    setPublishStatus((prev) => ({
      ...prev,
      [clipId]: { ...prev[clipId], state: allSuccess ? "done" : "failed" },
    }));

    // Log to tracker — auto-fill the matching cell with the correct game tag
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

  const pubNow = (clipId) => publishClip(clipId, null);
  const schedClip = (clipId) => publishClip(clipId, { date: schedDate, time: schedTime });


  // Platform status display helper
  const getPlatStatusIcon = (status) => {
    if (status === "pending") return { icon: "\u23f3", color: T.textMuted };
    if (status === "publishing") return { icon: "\u2b06", color: T.yellow };
    if (status === "done") return { icon: "\u2705", color: T.green };
    // Any other string is an error message
    return { icon: "\u274c", color: T.red };
  };

  // Compute stats
  const publishedToday = publishLogs.filter((l) => l.status === "success" && new Date(l.timestamp).toDateString() === new Date().toDateString()).length;
  const failedCount = approved.filter((c) => publishStatus[c.id]?.state === "failed").length;
  const scheduledCount = Object.keys(scheduled).length;

  // Status badge helper
  const statusBadge = (clip) => {
    const ps = publishStatus[clip.id];
    const isPub = ps?.state === "done";
    const isPublishing = ps?.state === "publishing";
    const isFailed = ps?.state === "failed";
    const isSch = scheduled[clip.id];
    const hasVideo = !!clip.renderPath;
    if (isPub) return { label: "Published", bg: "rgba(52,211,153,0.1)", color: T.green };
    if (isPublishing) return { label: "Publishing...", bg: "rgba(251,191,36,0.1)", color: T.yellow };
    if (isFailed) return { label: "Failed", bg: "rgba(248,113,113,0.1)", color: T.red };
    if (isSch) return { label: `Sched ${isSch}`, bg: "rgba(251,191,36,0.1)", color: T.yellow };
    if (!hasVideo) return { label: "Not rendered", bg: "rgba(251,191,36,0.1)", color: T.yellow };
    return { label: "Queued", bg: T.accentDim, color: T.accentLight };
  };

  return (
    <div>
      <PageHeader title="Queue & Schedule" subtitle={`${approved.length} clips ready`} />

      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        <Card style={{ padding: "14px 16px" }}>
          <SectionLabel>Queued</SectionLabel>
          <div style={{ color: T.accentLight, fontSize: 26, fontWeight: 800, fontFamily: T.mono, marginTop: 4 }}>{approved.length}</div>
        </Card>
        <Card style={{ padding: "14px 16px" }}>
          <SectionLabel>Scheduled</SectionLabel>
          <div style={{ color: T.yellow, fontSize: 26, fontWeight: 800, fontFamily: T.mono, marginTop: 4 }}>{scheduledCount}</div>
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

      {/* Dashboard table */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={clipIds} strategy={verticalListSortingStrategy}>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
        {/* Table header */}
        <div style={{ display: "grid", gridTemplateColumns: "28px 48px 1fr 70px 110px 90px 80px", gap: 0, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${T.border}` }}>
          {["", "Clip", "Title", "Game", "Platforms", "Status", ""].map((h, i) => (
            <span key={i} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.textTertiary }}>{h}</span>
          ))}
        </div>

        {approved.length === 0 && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{"\ud83d\udccb"}</div>
            <div style={{ color: T.textSecondary, fontSize: 15, fontWeight: 600 }}>No clips queued</div>
            <div style={{ color: T.textTertiary, fontSize: 13, marginTop: 8 }}>Approve clips in the Projects tab to see them here.</div>
          </div>
        )}

        {approved.map((clip) => {
          const isM = extractGameTag(clip.title) === mainGameTag;
          const gameTag = extractGameTag(clip.title);
          const ps = publishStatus[clip.id];
          const isPub = ps?.state === "done";
          const isPublishing = ps?.state === "publishing";
          const isFailed = ps?.state === "failed";
          const isSel = selClip === clip.id;
          const hasVideoId = !!clip.renderPath;
          const duration = clip.endTime && clip.startTime ? clip.endTime - clip.startTime : 0;
          const durationStr = duration > 0 ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}` : "";
          const projName = projectNames[clip._projectId] || "";
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
                    {/* Platform icons */}
                    <div style={{ display: "flex", gap: 3 }}>
                      {activePlat.map((p) => (
                        <span key={p.key} style={{ width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, background: p.platform === "TikTok" ? "#000" : p.platform === "Instagram" ? "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)" : p.platform === "YouTube" ? "#c4302b" : p.platform === "Facebook" ? "#1877f2" : "rgba(255,255,255,0.1)", color: "#fff", border: p.platform === "TikTok" ? "1px solid rgba(255,255,255,0.15)" : "none" }}>{p.abbr?.[0] || p.platform[0]}</span>
                      ))}
                    </div>
                    {/* Status */}
                    <div><span style={{ padding: "3px 9px", borderRadius: 20, fontSize: 9, fontWeight: 700, background: badge.bg, color: badge.color, whiteSpace: "nowrap" }}>{badge.label}</span></div>
                    {/* Action button */}
                    <div style={{ textAlign: "right" }}>
                      {!isPub && !isPublishing && hasVideoId && (
                        <button onClick={(e) => { e.stopPropagation(); pubNow(clip.id); }} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: T.green, color: "#0a0b10", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Publish</button>
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

                          {/* Platform icons row */}
                          <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center" }}>
                            <span style={{ fontSize: 10, color: T.textTertiary, marginRight: 2 }}>Publish to:</span>
                            {activePlat.map((p) => (
                              <span key={p.key} style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, background: p.platform === "TikTok" ? "#000" : p.platform === "Instagram" ? "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)" : p.platform === "YouTube" ? "#c4302b" : p.platform === "Facebook" ? "#1877f2" : "rgba(255,255,255,0.1)", color: "#fff", border: p.platform === "TikTok" ? "1px solid rgba(255,255,255,0.15)" : "none" }}>{p.abbr?.[0] || p.platform[0]}</span>
                            ))}
                          </div>

                          {/* Publishing progress (if active) */}
                          {(isPublishing || isFailed) && ps?.platforms && (
                            <div style={{ background: T.surface, border: `1px solid ${isPublishing ? T.yellowBorder : T.redBorder}`, borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
                              <SectionLabel>{isPublishing ? "Publishing..." : "Publish results"}</SectionLabel>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                                {activePlat.map((plat) => {
                                  const st = ps.platforms[plat.key] || "pending";
                                  const { icon, color } = getPlatStatusIcon(st);
                                  return (
                                    <div key={plat.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
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
                            <div style={{ flex: 1 }} />
                            {schedAction !== "schedule" && (
                              <button onClick={() => setSchedAction("schedule")} disabled={!hasVideoId} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: hasVideoId ? T.textSecondary : T.textMuted, fontSize: 11, fontWeight: 700, cursor: hasVideoId ? "pointer" : "default", fontFamily: T.font }}>Schedule</button>
                            )}
                            {!isPub && !isPublishing && (
                              <button onClick={() => pubNow(clip.id)} disabled={!hasVideoId || publishingRef.current} style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: hasVideoId ? T.green : "rgba(255,255,255,0.04)", color: hasVideoId ? "#0a0b10" : T.textMuted, fontSize: 11, fontWeight: 700, cursor: hasVideoId ? "pointer" : "default", fontFamily: T.font }}>Publish Now</button>
                            )}
                          </div>
                          {/* Schedule picker */}
                          {schedAction === "schedule" && (
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                              <Select value={schedDate} onChange={setSchedDate} options={[{ value: "", label: "Pick date..." }, ...dates.map((d) => ({ value: d.iso, label: d.label }))]} style={{ padding: "8px 12px", fontSize: 12 }} />
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <Select value={schedHour} onChange={setSchedHour} options={HOUR_OPTIONS} style={{ padding: "8px 8px", fontSize: 12, minWidth: 70 }} />
                                <span style={{ color: T.textMuted, fontSize: 14, fontWeight: 700 }}>:</span>
                                <Select value={schedMin} onChange={setSchedMin} options={MINUTE_OPTIONS} style={{ padding: "8px 8px", fontSize: 12, minWidth: 56 }} />
                              </div>
                              <button onClick={() => schedClip(clip.id)} disabled={!schedDate || publishingRef.current} style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: schedDate ? T.accent : "rgba(255,255,255,0.04)", color: schedDate ? "#fff" : T.textMuted, fontSize: 11, fontWeight: 700, cursor: schedDate ? "pointer" : "default", fontFamily: T.font }}>Confirm</button>
                              <button onClick={() => setSchedAction(null)} style={{ padding: "8px 12px", borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
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
