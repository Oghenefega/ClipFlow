import React, { useState, useRef, useEffect } from "react";
import posthog from "posthog-js";
import T from "../styles/theme";
import { Card, PageHeader, SectionLabel, Badge, Select, InfoBanner, extractGameTag, hasHashtag } from "../components/shared";
import CaptionsView from "./CaptionsView";

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

export default function QueueView({
  allClips, mainGame, mainGameTag, platforms, trackerData, setTrackerData,
  weeklyTemplate, weekTemplateOverrides,
  ytDescriptions, setYtDescriptions, captionTemplates, setCaptionTemplates,
  platformOptions, setPlatformOptions, gamesDb,
  requireHashtagInTitle = true,
}) {
  const scheduledClipIds = new Set(trackerData.map((t) => t.clipId).filter(Boolean));
  const scheduledTitles = new Set(trackerData.map((t) => t.title).filter(Boolean));
  const approved = Object.values(allClips).flat().filter((c) => (c.status === "approved" || c.status === "ready") && (!requireHashtagInTitle || hasHashtag(c.title)) && !scheduledClipIds.has(c.id) && !scheduledTitles.has(c.title));
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

  return (
    <div>
      <PageHeader title="Queue & Schedule" subtitle={`${approved.length} clips ready`} />

      <InfoBanner color={T.accent} icon={"🔌"}>
        Platform API publishing coming soon. Clips are logged to the tracker for now — upload rendered files manually.
      </InfoBanner>
      <div style={{ height: 12 }} />

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
          const hasVideoId = !!clip.renderPath;
          return (
            <div key={clip.id}>
              <Card onClick={() => { if (!isPublishing) { setSelClip(isSel ? null : clip.id); setSchedAction(null); } }} style={{ padding: "14px 18px", borderLeft: `3px solid ${isM ? T.accent : T.green}`, borderColor: isSel ? T.accentBorder : isPub ? T.greenBorder : isFailed ? T.redBorder : T.border, background: isSel ? T.accentGlow : isPub ? "rgba(52,211,153,0.03)" : T.surface, opacity: isPub ? 0.6 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ flex: 1, color: T.text, fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clip.title}</div>
                  {isPub && <span style={{ color: T.green, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Published</span>}
                  {isPublishing && <span style={{ color: T.yellow, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Publishing...</span>}
                  {isFailed && !isPub && <span style={{ color: T.red, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Failed</span>}
                  {isSch && !isPub && !isPublishing && !isFailed && <span style={{ color: T.accent, fontSize: 11, fontWeight: 600, fontFamily: T.mono, flexShrink: 0 }}>Scheduled {isSch}</span>}
                  {!hasVideoId && <span style={{ color: T.yellow, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>Not rendered</span>}
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
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={{ color, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {status === "pending" ? "Waiting..." : status === "publishing" ? (publishProgress?.detail || "Connecting...") : status === "done" ? "Sent" : status}
                            </span>
                            {status === "publishing" && publishProgress && (
                              <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                                <div style={{
                                  height: "100%",
                                  width: `${publishProgress.pct || 0}%`,
                                  borderRadius: 2,
                                  background: `linear-gradient(90deg, ${T.accent}, ${T.green})`,
                                  transition: "width 0.4s ease",
                                }} />
                              </div>
                            )}
                          </div>
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
                      <InfoBanner color={T.yellow} icon={"\u26a0\ufe0f"}>This clip hasn't been rendered yet. Open it in the Editor and click "Ready to Share" first.</InfoBanner>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginBottom: schedAction === "schedule" ? 14 : 0 }}>
                    <button onClick={() => pubNow(clip.id)} disabled={!hasVideoId || publishingRef.current} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: hasVideoId ? T.green : "rgba(255,255,255,0.04)", color: hasVideoId ? "#fff" : T.textMuted, fontSize: 13, fontWeight: 700, cursor: hasVideoId ? "pointer" : "default", fontFamily: T.font }}>Publish Now</button>
                    <button onClick={() => setSchedAction("schedule")} disabled={!hasVideoId} style={{ padding: "10px 20px", borderRadius: 8, border: schedAction === "schedule" ? `1px solid ${T.accentBorder}` : `1px solid ${T.border}`, background: schedAction === "schedule" ? T.accentDim : "rgba(255,255,255,0.03)", color: schedAction === "schedule" ? T.accentLight : T.textSecondary, fontSize: 13, fontWeight: 700, cursor: hasVideoId ? "pointer" : "default", fontFamily: T.font }}>Schedule</button>
                  </div>
                  {schedAction === "schedule" && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <Select value={schedDate} onChange={setSchedDate} options={[{ value: "", label: "Pick date..." }, ...dates.map((d) => ({ value: d.iso, label: d.label }))]} style={{ padding: "10px 14px", fontSize: 13 }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Select value={schedHour} onChange={setSchedHour} options={HOUR_OPTIONS} style={{ padding: "10px 10px", fontSize: 13, minWidth: 80 }} />
                        <span style={{ color: T.textMuted, fontSize: 16, fontWeight: 700 }}>:</span>
                        <Select value={schedMin} onChange={setSchedMin} options={MINUTE_OPTIONS} style={{ padding: "10px 10px", fontSize: 13, minWidth: 64 }} />
                      </div>
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

      {/* Publishing accounts */}
      <Card style={{ padding: "14px 20px", marginBottom: 28 }}>
        <SectionLabel>Publishing to {activePlat.length} accounts</SectionLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {activePlat.map((p, i) => (
            <span key={i} style={{ background: "rgba(255,255,255,0.03)", padding: "5px 12px", borderRadius: 8, color: T.textSecondary, fontSize: 12, fontWeight: 600, border: `1px solid ${T.border}` }}>{i + 1}. {p.abbr} — {p.name}</span>
          ))}
        </div>
        {activePlat.length === 0 && (
          <div style={{ marginTop: 10 }}>
            <InfoBanner color={T.yellow} icon={"\u26a0\ufe0f"}>No connected platforms. Check Settings.</InfoBanner>
          </div>
        )}
      </Card>

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
