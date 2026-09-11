// #387 → #397: the Analytics tab — "what worked?", as opposed to the Tracker's
// "did I post?". Reads what analytics.js joined in the main process (every
// published clip with per-platform counts, links, engagement and daily
// snapshots) and joins the clip's project in the renderer (thumbnail, rendered
// file, cut length) from localProjects, the way App.js builds allClips.
//
// The page reads top to bottom as: how am I doing (tiles) → what's working
// (insight sentences) → which clips (thumbnail grid ranked against the median)
// → why (learn cards). The spreadsheet survives, collapsed at the bottom.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import T from "../styles/theme";
import PLATFORM_BRAND from "../styles/platformBrand";
import { Card, PageHeader, toFileUrl, CopyIconButton } from "../components/shared";
import PlatformIcon from "../components/PlatformIcon";
import { downloadBlob } from "../utils/recapCardImage";
import {
  PLATFORMS, PLATFORM_LABEL, LENGTH_BUCKETS, DAYS, HOUR_BANDS,
  median, withViews, lengthBucket, slotGrid, rollup, platformTotals,
  windowDelta, dailyTotals, clipMilestones, snapshotDays, buildInsights, fmtK,
} from "../../shared/analyticsInsights";

const WINDOWS = [
  { id: "7d", days: 7, label: "7d" },
  { id: "30d", days: 30, label: "30d" },
  { id: "90d", days: 90, label: "90d" },
  { id: "all", days: null, label: "All" },
];
const SOURCE_ORDER = ["self", "ai_edited", "ai", "unknown"];
const SOURCE_LABEL = { self: "Hand-written", ai_edited: "AI, edited", ai: "AI as-is", unknown: "Unknown" };
const GRID_STEP = 16;
// #401: the clip panel docks as a right column (never over the grid). Its height
// is the window minus the 36px title bar, the 56px nav and a little breathing
// room, so it scrolls on its own while the grid scrolls underneath.
const PANEL_W = 620;
const PANEL_H = "calc(100vh - 136px)";
const SORTS = [{ id: "top", label: "Top" }, { id: "newest", label: "Newest" }, { id: "oldest", label: "Oldest" }];
const TYPE_FILTERS = [{ id: "all", label: "All categories" }, { id: "main", label: "Main" }, { id: "other", label: "Variety" }];

const pad2 = (n) => String(n).padStart(2, "0");
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// Local calendar date N days back — never via toISOString (UTC shifts EST evenings).
const localDateDaysAgo = (days) => { const d = new Date(); d.setDate(d.getDate() - days); return localDay(d); };
const fmt = (n) => (n == null ? "—" : n.toLocaleString());
const fmtDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const ago = (iso) => {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const m = Math.round(ms / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};
const stripTags = (t) => String(t || "").replace(/#\w+/g, "").trim();
// "2:37 PM" → minutes since midnight, so same-day clips sort by post time.
const timeMinutes = (t) => {
  const m = /(\d+):(\d+)\s*(AM|PM)?/i.exec(t || "");
  if (!m) return 0;
  const h = (Number(m[1]) % 12) + (/pm/i.test(m[3] || "") ? 12 : 0);
  return h * 60 + Number(m[2]);
};
const postedOrder = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : timeMinutes(a.time) - timeMinutes(b.time));
const mix = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
const csvQuote = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;

// ---- shared bits ------------------------------------------------------------

const cardTitle = { fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: T.textSecondary, margin: 0, display: "flex", alignItems: "center", gap: 8 };
const cardHint = { fontSize: 11, fontWeight: 500, letterSpacing: 0, textTransform: "none", color: T.textTertiary, marginLeft: "auto" };
const foot = { fontSize: 11, color: T.textTertiary, marginTop: 8, lineHeight: 1.45 };
const shadowCard = "0 1px 2px rgba(var(--shade),calc(0.5 * var(--shadeK))), 0 14px 34px -16px rgba(var(--shade),calc(0.7 * var(--shadeK)))";
const shadowLift = `0 2px 4px rgba(var(--shade),calc(0.5 * var(--shadeK))), 0 26px 60px -22px rgba(var(--shade),calc(0.85 * var(--shadeK))), 0 0 0 1px ${T.accentBorder}`;
const glass = `linear-gradient(180deg, rgba(var(--lift),0.022), rgba(var(--lift),0)), ${T.surface}`;

const Btn = ({ children, onClick, primary, disabled, title, style: x }) => (
  <button onClick={onClick} disabled={disabled} title={title} style={{
    display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 10, fontSize: 12, fontWeight: 600, fontFamily: T.font,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
    background: primary ? T.accent : "rgba(var(--lift),0.04)", color: primary ? "#fff" : T.text,
    border: `1px solid ${primary ? T.accent : T.border}`, ...x,
  }}>{children}</button>
);

const Dot = ({ color, size = 7, glow }) => (
  <span style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0, boxShadow: glow ? `0 0 6px ${color}` : "none" }} />
);

/** Horizontal median bars — the one chart form every learn card uses. */
function Bars({ rows, max }) {
  if (rows.length === 0) return <div style={{ fontSize: 12, color: T.textTertiary, padding: "6px 0" }}>Nothing ranked yet.</div>;
  return rows.map((r) => (
    <div key={r.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 118px) 1fr 50px", gap: 8, alignItems: "center", fontSize: 12, padding: "3px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, color: T.text }} title={r.label}>
        {r.color && <Dot color={r.color} size={6} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
        <span style={{ color: T.textTertiary, fontSize: 10.5, flexShrink: 0 }}>{r.n}</span>
      </div>
      <div style={{ height: 14, background: "rgba(var(--lift),0.05)", borderRadius: "0 4px 4px 0", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${max > 0 ? (r.median / max) * 100 : 0}%`, borderRadius: "0 4px 4px 0", background: r.n < 3 ? "rgba(var(--lift),0.18)" : T.accent, transition: "width 0.3s ease" }} />
      </div>
      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.textSecondary }}>{fmtK(r.median)}</div>
    </div>
  ));
}

function Sparkline({ points, width = 84, height = 24, color }) {
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.total), 1);
  const min = Math.min(...points.map((p) => p.total));
  const span = Math.max(max - min, 1);
  const d = points.map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * width).toFixed(1)} ${(height - 3 - ((p.total - min) / span) * (height - 6)).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.6" />
      <circle cx={width} cy={(height - 3 - ((last.total - min) / span) * (height - 6)).toFixed(1)} r="3" fill={color} />
    </svg>
  );
}

// ---- clip card --------------------------------------------------------------

function ClipCard({ clip, medianAll, selected, onClick }) {
  const [hover, setHover] = useState(false);
  const x = medianAll > 0 ? clip.total / medianAll : 0;
  const hot = x >= 2, cold = x < 0.7;
  const color = clip.gameColor;
  return (
    <div data-keep-panel="" onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      padding: 6, borderRadius: 18, cursor: "pointer", position: "relative",
      background: `radial-gradient(90% 120% at 100% 0%, ${mix(color, 14)} 0%, transparent 55%), linear-gradient(160deg, ${mix(color, 10)} 0%, ${mix(color, 3)} 45%, rgba(var(--lift),0.02) 70%), ${T.surface}`,
      border: `1px solid ${selected ? T.accentBorder : hover ? mix(color, 45) : mix(color, 24)}`,
      boxShadow: selected ? `0 0 0 2px ${T.accentDim}, ${shadowCard}` : hover ? shadowLift : shadowCard,
      transform: hover ? "translateY(-2px)" : "none",
      transition: "border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
    }}>
      <div style={{ position: "relative", aspectRatio: "9/16", borderRadius: 13, overflow: "hidden", background: mix(color, 16) }}>
        {clip.thumbnailPath && <img src={toFileUrl(clip.thumbnailPath)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 90% at 50% 20%, transparent 55%, rgba(var(--shade),calc(.45 * var(--shadeK))))", pointerEvents: "none" }} />
        <span style={{ position: "absolute", top: 6, left: 6, fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 6, backdropFilter: "blur(4px)",
          background: "rgba(10,11,16,0.78)", color: hot ? T.green : cold ? "rgba(255,255,255,0.6)" : "#fff", border: `1px solid ${hot ? T.greenBorder : "transparent"}` }}>
          {x >= 1 ? `${x.toFixed(1)}× median` : `${Math.round(x * 100)}% of median`}
        </span>
        {clip.duration > 0 && <span style={{ position: "absolute", right: 6, bottom: 6, fontSize: 10.5, padding: "1px 5px", borderRadius: 5, background: "rgba(10,11,16,0.72)", color: "rgba(255,255,255,0.8)" }}>{Math.round(clip.duration)}s</span>}
      </div>
      <div style={{ padding: "9px 5px 4px" }}>
        <div title={clip.title} style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, color: T.text, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 31 }}>{stripTags(clip.title) || clip.title}</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 5, letterSpacing: "-0.2px", color: T.text }}>{fmtK(clip.total)}<span style={{ fontSize: 10.5, fontWeight: 400, color: T.textTertiary, marginLeft: 4 }}>views</span></div>
        <div style={{ fontSize: 10.5, color: T.textTertiary, marginTop: 8, display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
          <Dot color={color} size={6} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clip.gameName} · {fmtDate(clip.date)}</span>
        </div>
      </div>
    </div>
  );
}

// ---- clip drawer ------------------------------------------------------------

// Every <video> must release its source on unmount or Chromium's renderer
// eventually crashes — same teardown as ProjectsView's ClipVideoPlayer. Its own
// component so the cleanup runs on unmount ONLY: keyed on `playing` it ran
// against the freshly mounted element and stripped the src before the first
// frame (#401 "play does nothing").
function DrawerVideo({ src }) {
  const ref = useRef(null);
  useEffect(() => () => {
    const v = ref.current;
    if (v) { try { v.pause(); v.removeAttribute("src"); v.load(); } catch (_) { /* already gone */ } }
  }, []);
  return <video ref={ref} src={src} controls autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000", display: "block" }} />;
}

function ClipDrawer({ clip, medianAll, related, onClose, onOpenInEditor, onSelect }) {
  const [playing, setPlaying] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [capPlatform, setCapPlatform] = useState(null);
  useEffect(() => { setPlaying(false); setCaptionOpen(false); setCapPlatform(null); }, [clip?.clipId]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!clip) return null;

  const x = medianAll > 0 ? clip.total / medianAll : 0;
  const color = clip.gameColor;
  const ms = clipMilestones(clip);
  const eng = (k) => PLATFORMS.reduce((a, p) => a + (clip.engagement?.[p]?.[k] || 0), 0);
  const likes = eng("likes"), comments = eng("comments");
  const open = (url) => url && window.clipflow?.openExternal?.(url);
  const chip = (text, accent) => (
    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 7, background: accent ? T.accentDim : "rgba(var(--lift),0.05)", border: `1px solid ${accent ? T.accentBorder : T.border}`, color: accent ? T.accentLight : T.textSecondary, display: "inline-flex", gap: 5, alignItems: "center" }}>{text}</span>
  );
  const h4 = { fontSize: 10.5, color: T.textTertiary, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 6px" };
  const box = { fontSize: 12, color: T.textSecondary, lineHeight: 1.5, background: "rgba(var(--lift),0.03)", border: `1px solid ${T.border}`, borderRadius: 12, padding: "8px 10px", whiteSpace: "pre-wrap", wordBreak: "break-word" };

  // #401: what each platform actually received. Platforms the clip went to, the
  // logged text where the publish log has it, the tracker's single caption otherwise.
  const postedOn = PLATFORMS.filter((p) => clip.posted?.[p] || clip.hasPost[p]);
  const cp = capPlatform && postedOn.includes(capPlatform) ? capPlatform : postedOn[0] || null;
  const logged = cp ? clip.posted?.[cp] : null;
  const capText = logged ? logged.caption : clip.caption;
  const longCaption = (capText || "").length > 320 || (capText || "").split("\n").length > 7;
  const copyRow = (label, value, body) => (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
        <span style={{ fontSize: 10.5, color: T.textTertiary, fontWeight: 600 }}>{label}</span>
        {!!value && <CopyIconButton value={value} title={`Copy ${label.toLowerCase()}`} size={12} />}
      </div>
      {body}
    </div>
  );

  return (
    <aside data-keep-panel="" style={{
      position: "sticky", top: 12, width: PANEL_W, height: PANEL_H, flexShrink: 0, overflow: "auto",
      background: glass, border: `1px solid ${T.borderHover}`, borderRadius: 22,
      boxShadow: shadowLift, padding: "18px 20px 24px", fontFamily: T.font, boxSizing: "border-box",
    }}>
      <button onClick={onClose} title="Close (Esc)" style={{ position: "absolute", top: 12, right: 14, width: 28, height: 28, borderRadius: "50%", border: `1px solid ${T.border}`, background: "rgba(var(--lift),0.04)", color: T.textSecondary, fontSize: 15, cursor: "pointer", fontFamily: T.font }}>×</button>

      <div style={{ display: "grid", gridTemplateColumns: "250px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        {/* Left: poster + platform breakdown + history */}
        <div>
          <div style={{ position: "relative", aspectRatio: "9/16", borderRadius: 18, overflow: "hidden", background: mix(color, 16), boxShadow: "0 20px 50px -20px rgba(var(--shade),calc(0.9 * var(--shadeK)))" }}>
            {playing && clip.renderPath ? (
              <DrawerVideo key={clip.clipId} src={toFileUrl(clip.renderPath)} />
            ) : (
              <>
                {clip.thumbnailPath && <img src={toFileUrl(clip.thumbnailPath)} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                <button onClick={() => clip.renderPath && setPlaying(true)} disabled={!clip.renderPath} title={clip.renderPath ? "Play" : "Rendered file not in the library"} style={{ position: "absolute", inset: 0, background: "transparent", border: "none", cursor: clip.renderPath ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(10,11,16,0.72)", border: "1px solid rgba(255,255,255,0.22)", color: "#fff", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: 3, opacity: clip.renderPath ? 1 : 0.4 }}>▶</span>
                </button>
              </>
            )}
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 52px 44px 46px", gap: 6, fontSize: 10.5, color: T.textTertiary, paddingBottom: 4 }}>
              <span>Platform</span><span style={{ textAlign: "right" }}>views</span><span style={{ textAlign: "right" }}>likes</span><span style={{ textAlign: "right" }}>link</span>
            </div>
            {PLATFORMS.map((p) => {
              const v = clip.views[p];
              const url = clip.urls?.[p];
              const posted = clip.hasPost[p];
              return (
                <div key={p} style={{ display: "grid", gridTemplateColumns: "1fr 52px 44px 46px", gap: 6, alignItems: "center", padding: "6px 0", borderTop: `1px solid ${T.border}`, fontSize: 12, opacity: posted ? 1 : 0.45 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: T.text }}><Dot color={PLATFORM_BRAND[p].bar} /> {PLATFORM_LABEL[p]}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: v == null ? T.textTertiary : T.text, fontWeight: 600 }}>{v == null ? (posted ? "…" : "—") : fmtK(v)}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.textSecondary }}>{clip.engagement?.[p]?.likes != null ? fmtK(clip.engagement[p].likes) : "—"}</span>
                  <span style={{ textAlign: "right" }}>
                    {url ? <a onClick={(e) => { e.preventDefault(); open(url); }} href={url} style={{ color: T.accentLight, fontSize: 11.5, cursor: "pointer" }}>open ↗</a>
                      : <span style={{ color: T.textTertiary, fontSize: 11 }} title={posted ? (p === "tiktok" ? "Link arrives with TikTok's approval" : "Link arrives with the next refresh") : "Not posted here"}>{posted ? "soon" : "—"}</span>}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={h4}>Views over time</div>
            {ms ? (
              <div style={box}>
                <span style={{ color: T.text, fontWeight: 600 }}>Day 2: {ms.day2 == null ? "—" : fmtK(ms.day2)}</span> · <span style={{ color: T.text, fontWeight: 600 }}>Day 7: {ms.day7 == null ? "—" : fmtK(ms.day7)}</span> · <span style={{ color: T.text, fontWeight: 600 }}>Now: {fmtK(ms.now)}</span>
                <div style={{ marginTop: 6 }}>
                  <Sparkline points={clip.history.map(([day, total]) => ({ day, total }))} width={226} height={34} color={T.accentLight} />
                  <div style={{ fontSize: 10.5, color: T.textTertiary, marginTop: 2 }}>{clip.history.length} daily snapshot{clip.history.length === 1 ? "" : "s"}, {fmtDate(ms.firstDay)} → {fmtDate(ms.lastDay)}</div>
                </div>
              </div>
            ) : (
              <div style={{ ...box, color: T.textTertiary }}>Daily snapshots start with the next refresh. Day 2, day 7 and the curve fill in from there.</div>
            )}
          </div>
        </div>

        {/* Right: title, chips, headline number, actions, caption, related */}
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.3, letterSpacing: "-0.2px", margin: 0, paddingRight: 30, color: T.text }}>{stripTags(clip.title) || clip.title}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0" }}>
            {chip(<><Dot color={color} size={6} /> {clip.gameName}</>)}
            {chip(`${fmtDate(clip.date)}${clip.time ? ` · ${clip.time}` : ""}`)}
            {clip.duration > 0 && chip(`${Math.round(clip.duration)}s`)}
            {chip(`${SOURCE_LABEL[SOURCE_ORDER.includes(clip.titleSource) ? clip.titleSource : "unknown"]} title`, clip.titleSource === "self")}
            {clip.repostOf && chip("Repost")}
            {clip.source === "import" && chip("Import")}
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-1px", lineHeight: 1, color: T.text }}>
            {clip.fetchedAt ? fmtK(clip.total) : "—"}<span style={{ fontSize: 12, color: T.textTertiary, fontWeight: 400, marginLeft: 8, letterSpacing: 0 }}>views across {PLATFORMS.filter((p) => clip.views[p] != null).length} platform{PLATFORMS.filter((p) => clip.views[p] != null).length === 1 ? "" : "s"}</span>
          </div>
          <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 6 }}>
            {clip.fetchedAt && medianAll > 0 && (x >= 1
              ? <span style={{ color: T.green, fontWeight: 600 }}>{x.toFixed(1)}× your median</span>
              : <span style={{ color: T.red, fontWeight: 600 }}>{Math.round(x * 100)}% of your median</span>)}
            {clip.fetchedAt && medianAll > 0 && " · "}{fmtK(likes)} likes · {fmtK(comments)} comments
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
            <Btn primary onClick={() => onOpenInEditor?.(clip.projectId, clip.clipId)} disabled={!clip.projectId || !onOpenInEditor} title={clip.projectId ? "Open this clip in the editor" : "Project not found in the library"}>Open in editor</Btn>
            <Btn onClick={() => window.clipflow?.revealInFolder?.(clip.renderPath)} disabled={!clip.renderPath} title={clip.renderPath ? "Show the rendered file in Explorer" : "Rendered file not in the library"}>Show in folder</Btn>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {PLATFORMS.map((p) => {
              const url = clip.urls?.[p];
              return (
                <Btn key={p} onClick={() => open(url)} disabled={!url} title={url || (clip.hasPost[p] ? (p === "tiktok" ? "Link arrives with TikTok's approval" : "Link arrives with the next refresh") : "Not posted here")}>
                  <PlatformIcon platform={p} size={13} /> {PLATFORM_LABEL[p]} ↗
                </Btn>
              );
            })}
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ ...h4, display: "flex", alignItems: "center", gap: 8 }}>As posted<span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, marginLeft: "auto" }}>copy what worked</span></div>
            {postedOn.length > 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                {postedOn.map((p) => (
                  <button key={p} onClick={() => setCapPlatform(p)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, fontFamily: T.font, cursor: "pointer",
                    background: p === cp ? "rgba(var(--lift),0.07)" : "transparent", color: p === cp ? T.text : T.textTertiary, border: `1px solid ${p === cp ? T.border : "transparent"}` }}>
                    <PlatformIcon platform={p} size={12} /> {PLATFORM_LABEL[p]}
                  </button>
                ))}
              </div>
            )}
            {copyRow("Caption", capText, (
              <>
                {/* Captions carry the full description block (links, schedule, gear list) — clamp so the related clips stay in reach. */}
                <div style={{ ...box, ...(captionOpen || !longCaption ? {} : { display: "-webkit-box", WebkitLineClamp: 7, WebkitBoxOrient: "vertical", overflow: "hidden" }) }}>
                  {capText || <span style={{ color: T.textTertiary }}>No caption stored for this post.</span>}
                </div>
                {longCaption && (
                  <button onClick={() => setCaptionOpen((o) => !o)} style={{ background: "transparent", border: "none", color: T.accentLight, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: T.font, padding: "6px 2px 0" }}>{captionOpen ? "Show less" : "Show the whole caption"}</button>
                )}
              </>
            ))}
            {logged?.tags && copyRow("YouTube tags", logged.tags.join(", "), <div style={box}>{logged.tags.join(", ")}</div>)}
            {cp && !logged && <div style={{ fontSize: 10.5, color: T.textTertiary, marginTop: 6 }}>From the tracker — this post predates the per-platform log, so every platform shows the same text.</div>}
          </div>

          {related.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={h4}>Same game, this window</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {related.map((r) => (
                  <div key={r.clipId} onClick={() => onSelect(r.clipId)} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11.5, cursor: "pointer", padding: 4, borderRadius: 9 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(var(--lift),0.04)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ width: 34, aspectRatio: "9/16", borderRadius: 7, overflow: "hidden", flexShrink: 0, background: mix(color, 16) }}>
                      {r.thumbnailPath && <img src={toFileUrl(r.thumbnailPath)} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                    </div>
                    <span style={{ color: T.textSecondary, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{stripTags(r.title) || r.title} · <span style={{ color: T.text, fontWeight: 600 }}>{fmtK(r.total)}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ---- the tab ----------------------------------------------------------------

export default function AnalyticsView({ gamesDb = [], active, localProjects = [], onOpenInEditor }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [windowKey, setWindowKey] = useState("30d");
  const [selectedId, setSelectedId] = useState(null);
  const [shown, setShown] = useState(GRID_STEP);
  const [tableOpen, setTableOpen] = useState(false);
  const [sort, setSort] = useState({ key: "total", dir: "desc" });
  // #401: grid order and filters. The ranking (and every median) stays by views.
  const [sortKey, setSortKey] = useState("top");
  const [gameFilter, setGameFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const r = await window.clipflow.analyticsGet();
      if (r?.error) setLoadError(r.error);
      else { setData(r.data); setLoadError(null); }
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  // The pane is always mounted; the boot-time pull lands ~30s after launch,
  // so re-read whenever the tab is opened rather than only on mount.
  useEffect(() => { if (active) load(); }, [active, load]);
  // Leaving the tab closes the drawer so no <video> stays mounted off-screen.
  useEffect(() => { if (!active) setSelectedId(null); }, [active]);

  const refresh = async () => {
    setRefreshing(true);
    try { await window.clipflow.analyticsRefresh(); } catch (_) { /* surfaced by platforms[].error on reload */ }
    await load();
    setRefreshing(false);
  };

  // Same lookup the Tracker uses: entry.game is the lowercased tag for auto-posts
  // and the hashtag for manual logs; fall back to the raw tag, uppercased.
  const gameOf = useCallback((raw) => {
    const key = (raw || "").toLowerCase();
    const g = gamesDb.find((x) => [x.hashtag, x.tag, x.name].some((v) => (v || "").toLowerCase() === key));
    return g ? { name: g.name, color: g.color } : { name: (raw || "?").toUpperCase(), color: "#8a9bb8" };
  }, [gamesDb]);

  // clipId → what only the project knows: thumbnail, rendered file, cut length.
  const projectIndex = useMemo(() => {
    const m = new Map();
    for (const p of localProjects) {
      for (const c of p.clips || []) {
        const segs = Array.isArray(c.nleSegments) && c.nleSegments.length > 0
          ? c.nleSegments.reduce((a, s) => a + Math.max(0, (s.sourceEnd ?? 0) - (s.sourceStart ?? 0)), 0)
          : Math.max(0, (c.endTime ?? 0) - (c.startTime ?? 0));
        m.set(c.id, { projectId: p.id, thumbnailPath: c.thumbnailPath || null, renderPath: c.renderPath || null, duration: segs });
      }
    }
    return m;
  }, [localProjects]);

  const allClips = useMemo(() => (data?.clips || []).map((c) => {
    const g = gameOf(c.game);
    return { ...c, ...(projectIndex.get(c.clipId) || { projectId: null, thumbnailPath: null, renderPath: null, duration: 0 }), gameName: g.name, gameColor: g.color };
  }), [data, projectIndex, gameOf]);

  const win = WINDOWS.find((w) => w.id === windowKey) || WINDOWS[1];
  const today = localDay();
  const clips = useMemo(() => {
    if (!win.days) return allClips;
    const cutoff = localDateDaysAgo(win.days - 1);
    return allClips.filter((c) => c.date >= cutoff);
  }, [allClips, win]);

  const ranked = useMemo(() => withViews(clips).sort((a, b) => b.total - a.total || (b.date < a.date ? -1 : 1)), [clips]);
  const medianAll = useMemo(() => median(ranked.map((c) => c.total)), [ranked]);
  const gameNames = useMemo(() => [...new Set(ranked.map((c) => c.gameName))].sort((a, b) => a.localeCompare(b)), [ranked]);
  const gridClips = useMemo(() => {
    let list = ranked;
    if (gameFilter !== "all") list = list.filter((c) => c.gameName === gameFilter);
    if (typeFilter !== "all") list = list.filter((c) => (c.type === "main" ? "main" : "other") === typeFilter);
    if (platformFilter !== "all") list = list.filter((c) => c.hasPost[platformFilter]);
    if (sortKey === "newest") list = [...list].sort((a, b) => postedOrder(b, a));
    else if (sortKey === "oldest") list = [...list].sort(postedOrder);
    return list;
  }, [ranked, gameFilter, typeFilter, platformFilter, sortKey]);
  const filtered = gameFilter !== "all" || typeFilter !== "all" || platformFilter !== "all";
  const totals = useMemo(() => platformTotals(clips), [clips]);
  const delta = useMemo(() => windowDelta(allClips, win.days, today), [allClips, win.days, today]);
  const growth = useMemo(() => dailyTotals(allClips, win.days, today), [allClips, win.days, today]);
  const insights = useMemo(() => buildInsights(clips, { delta }), [clips, delta]);
  const byGame = useMemo(() => rollup(clips, (c) => c.gameName).map((g) => ({ ...g, label: g.key, color: g.clips[0].gameColor })), [clips]);
  const bySource = useMemo(() => {
    const r = rollup(clips, (c) => (SOURCE_ORDER.includes(c.titleSource) ? c.titleSource : "unknown"));
    return r.map((g) => ({ ...g, label: SOURCE_LABEL[g.key] }));
  }, [clips]);
  const byLength = useMemo(() => {
    const r = rollup(clips, (c) => lengthBucket(c.duration));
    return LENGTH_BUCKETS.map((k) => r.find((g) => g.key === k)).filter(Boolean).map((g) => ({ ...g, label: g.key }));
  }, [clips]);
  const slots = useMemo(() => slotGrid(clips, 2), [clips]);
  const firstSnapshot = useMemo(() => snapshotDays(allClips)[0] || null, [allClips]);

  const selected = useMemo(() => allClips.find((c) => c.clipId === selectedId) || null, [allClips, selectedId]);
  const related = useMemo(() => (selected ? ranked.filter((c) => c.clipId !== selected.clipId && c.gameName === selected.gameName).slice(0, 4) : []), [selected, ranked]);
  const closeDrawer = useCallback(() => setSelectedId(null), []);
  // #401: a click on the grid side closes the docked panel. Cards, table rows and
  // the grid controls opt out with data-keep-panel so one click swaps or filters.
  const clickAway = useCallback((e) => { if (!e.target.closest("[data-keep-panel]")) setSelectedId(null); }, []);

  const lastFetched = useMemo(() => {
    let latest = null;
    for (const c of data?.clips || []) if (c.fetchedAt && (!latest || c.fetchedAt > latest)) latest = c.fetchedAt;
    return latest;
  }, [data]);

  // Table (collapsed by default)
  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (c) => {
      if (sort.key === "title") return c.title.toLowerCase();
      if (sort.key === "game") return c.gameName.toLowerCase();
      if (sort.key === "date") return c.date;
      if (sort.key === "total") return c.total;
      return c.views[sort.key] ?? -1;
    };
    return [...clips].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x === y) return b.date < a.date ? -1 : 1;
      return (x < y ? -1 : 1) * dir;
    });
  }, [clips, sort]);
  const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "title" || key === "game" ? "asc" : "desc" }));
  const th = { fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: T.textTertiary, textAlign: "right", padding: "7px 10px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" };
  const td = { padding: "6px 10px", textAlign: "right", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: T.text };
  const Th = ({ k, children, left }) => (
    <th onClick={() => onSort(k)} style={{ ...th, textAlign: left ? "left" : "right", color: sort.key === k ? T.text : T.textTertiary }}>{children}{sort.key === k && <span style={{ fontSize: 9, marginLeft: 3 }}>{sort.dir === "desc" ? "▼" : "▲"}</span>}</th>
  );
  const exportCSV = () => {
    const h = "Title,Game,Date,Time,Length s,Title by,YouTube,Facebook,Instagram,TikTok,Total,YouTube link,Facebook link,Instagram link,TikTok link\n";
    const rows = sorted.map((c) => [
      csvQuote(c.title), csvQuote(c.gameName), c.date, csvQuote(c.time), Math.round(c.duration || 0), SOURCE_LABEL[SOURCE_ORDER.includes(c.titleSource) ? c.titleSource : "unknown"],
      ...PLATFORMS.map((p) => c.views[p] ?? ""), c.fetchedAt ? c.total : "", ...PLATFORMS.map((p) => csvQuote(c.urls?.[p] || "")),
    ].join(",")).join("\n");
    downloadBlob(new Blob([h + rows], { type: "text/csv" }), `corva-analytics-${today}.csv`);
  };

  const platformNote = (p) => {
    const err = data?.platforms?.[p]?.error;
    if (err) return { text: err, warn: true };
    if (totals.platforms[p].clips === 0) return { text: "no views fetched yet", warn: false };
    return { text: `${Math.round(totals.platforms[p].share * 100)}% of views · ${totals.platforms[p].clips} clip${totals.platforms[p].clips === 1 ? "" : "s"}`, warn: false };
  };
  const windowLabel = win.days ? `last ${win.days} days` : "all time";
  const tile = { padding: "12px 14px", minHeight: 82, display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", overflow: "hidden", background: glass, boxShadow: shadowCard };
  const tileLabel = { fontSize: 10, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: T.textTertiary, display: "flex", alignItems: "center", gap: 6 };
  const tileValue = (on) => ({ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1.1, marginTop: 8, color: on ? T.text : T.textTertiary });
  const sel = { fontSize: 12, fontWeight: 600, fontFamily: T.font, color: T.text, background: "rgba(var(--lift),0.04)", border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 8px", cursor: "pointer", maxWidth: 170 };
  // With the panel docked the content column narrows (562px at a 1280 window), so
  // the fixed-column rows wrap instead of crushing.
  const narrow = !!selected;

  return (
    <div style={{ maxWidth: narrow ? 1440 + PANEL_W + 18 : 1440, margin: "0 auto", display: "flex", gap: 18, alignItems: "flex-start" }}>
    <div style={{ flex: 1, minWidth: 0 }} onClick={narrow ? clickAway : undefined}>
      <PageHeader title="Analytics" style={{ marginBottom: 18 }}>
       {/* One wrapping box so the switcher and Refresh drop to a second line beside a docked panel instead of running off the edge (#401). */}
       <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 14, rowGap: 8 }}>
        <span style={{ fontSize: 12, color: T.textTertiary, whiteSpace: "nowrap" }}>{clips.length} clip{clips.length === 1 ? "" : "s"} · {windowLabel}</span>
        <div style={{ display: "flex", gap: 2, background: "rgba(var(--lift),0.03)", borderRadius: T.radius.md, padding: 3, marginLeft: "auto" }}>
          {WINDOWS.map((w) => (
            <button key={w.id} onClick={() => { setWindowKey(w.id); setShown(GRID_STEP); setGameFilter("all"); }} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: windowKey === w.id ? "rgba(var(--lift),0.07)" : "transparent", color: windowKey === w.id ? T.text : T.textTertiary, fontSize: 12, fontWeight: 600, fontFamily: T.font }}>{w.label}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>
          {refreshing ? "Refreshing…" : lastFetched ? `Refreshed ${ago(lastFetched)}` : "Not refreshed yet"}
        </span>
        <button onClick={refresh} disabled={refreshing} style={{ fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 8, border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight, cursor: refreshing ? "default" : "pointer", fontFamily: T.font, opacity: refreshing ? 0.6 : 1 }}>Refresh</button>
       </div>
      </PageHeader>

      {loadError && <p style={{ color: T.red, fontSize: 12, margin: "0 0 14px" }}>{loadError}</p>}

      {/* Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "repeat(auto-fit, minmax(150px, 1fr))" : "1.5fr 1fr repeat(4, 1fr)", gap: 10, marginBottom: 10 }}>
        <Card style={tile}>
          <div style={tileLabel}>Total views</div>
          <div>
            <div style={{ ...tileValue(totals.total > 0), fontSize: 30 }}>{totals.total > 0 ? fmtK(totals.total) : "—"}</div>
            <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 4, display: "flex", gap: 6, alignItems: "baseline" }}>
              {delta ? <><span style={{ color: delta.pct >= 0 ? T.green : T.red, fontWeight: 700 }}>{delta.pct >= 0 ? "▲" : "▼"} {Math.abs(delta.pct)}%</span><span>vs previous {delta.days} days</span></>
                : <span title={firstSnapshot ? `Daily snapshots since ${firstSnapshot}` : "Daily snapshots start with the next refresh"}>{firstSnapshot ? `snapshots since ${fmtDate(firstSnapshot)}` : "delta after two days of snapshots"}</span>}
            </div>
          </div>
          {growth.length >= 2 && <div style={{ position: "absolute", right: 12, bottom: 12 }}><Sparkline points={growth} color={T.accentLight} /></div>}
        </Card>
        <Card style={tile}>
          <div style={tileLabel}>Median per clip</div>
          <div>
            <div style={tileValue(medianAll > 0)}>{medianAll > 0 ? fmtK(medianAll) : "—"}</div>
            <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 4 }}>{ranked.length} of {clips.length} clips ranked</div>
          </div>
        </Card>
        {PLATFORMS.map((p) => {
          const note = platformNote(p);
          const on = totals.platforms[p].clips > 0;
          return (
            <Card key={p} style={tile}>
              <span style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: PLATFORM_BRAND[p].bar }} />
              <div style={tileLabel}><PlatformIcon platform={p} size={13} />{PLATFORM_LABEL[p]}</div>
              <div>
                <div style={tileValue(on)}>{on ? fmtK(totals.platforms[p].views) : "—"}</div>
                <div style={{ fontSize: 11, color: note.warn ? T.yellow : T.textTertiary, marginTop: 4, lineHeight: 1.4 }}>{note.text}</div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Insight sentences */}
      {insights.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: narrow ? "repeat(auto-fit, minmax(230px, 1fr))" : `repeat(${Math.min(insights.length, 4)}, 1fr)`, gap: 10, marginBottom: 10 }}>
          {insights.map((ins) => (
            <Card key={ins.key} style={{ padding: "11px 13px", background: glass, boxShadow: shadowCard }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: ins.star ? T.yellow : T.accentLight, marginBottom: 5 }}>{ins.star ? "★ " : ""}{ins.label}</div>
              <p style={{ fontSize: 12.5, color: T.text, lineHeight: 1.45, margin: 0 }}>{ins.parts.map((pt, i) => (pt.bold ? <strong key={i} style={{ fontWeight: 700 }}>{pt.text}</strong> : <span key={i}>{pt.text}</span>))}</p>
              <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 5 }}>{ins.why}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Top clips */}
      <Card style={{ padding: "12px 14px 14px", background: glass, boxShadow: shadowCard, marginBottom: 10 }}>
        <div data-keep-panel="" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <h3 style={{ ...cardTitle, marginRight: 4 }}>{sortKey === "top" ? "Top clips" : "Clips"}<span style={{ ...cardHint, marginLeft: 8 }}>{filtered ? `${gridClips.length} of ${ranked.length}` : "ranked against your median for this window"}</span></h3>
          <div style={{ display: "flex", gap: 2, background: "rgba(var(--lift),0.03)", borderRadius: T.radius.md, padding: 3, marginLeft: "auto" }}>
            {SORTS.map((s) => (
              <button key={s.id} onClick={() => { setSortKey(s.id); setShown(GRID_STEP); }} style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: sortKey === s.id ? "rgba(var(--lift),0.07)" : "transparent", color: sortKey === s.id ? T.text : T.textTertiary, fontSize: 12, fontWeight: 600, fontFamily: T.font }}>{s.label}</button>
            ))}
          </div>
          <select value={gameFilter} onChange={(e) => { setGameFilter(e.target.value); setShown(GRID_STEP); }} style={sel} title="Game">
            <option value="all">All games</option>
            {gameNames.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setShown(GRID_STEP); }} style={sel} title="Category">
            {TYPE_FILTERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select value={platformFilter} onChange={(e) => { setPlatformFilter(e.target.value); setShown(GRID_STEP); }} style={sel} title="Posted on">
            <option value="all">All platforms</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>Posted on {PLATFORM_LABEL[p]}</option>)}
          </select>
        </div>
        {gridClips.length === 0 ? (
          <p style={{ color: T.textTertiary, fontSize: 12, margin: 0, padding: "10px 0" }}>
            {ranked.length > 0 ? "No clips match these filters." : clips.length === 0 ? (data?.clips?.length ? "No clips published in this window." : "Publish a clip and its views show up here after the next refresh.") : "Views for these clips arrive with the next refresh."}
          </p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 10 }}>
              {gridClips.slice(0, shown).map((c) => (
                <ClipCard key={c.clipId} clip={c} medianAll={medianAll} selected={c.clipId === selectedId} onClick={() => setSelectedId(c.clipId)} />
              ))}
            </div>
            {gridClips.length > shown && (
              <div data-keep-panel="" style={{ textAlign: "center", marginTop: 12 }}>
                <Btn onClick={() => setShown((n) => n + GRID_STEP)}>Show {Math.min(GRID_STEP, gridClips.length - shown)} more of {gridClips.length}</Btn>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Learn */}
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "repeat(auto-fit, minmax(250px, 1fr))" : "1.1fr 1fr 1fr 1.3fr", gap: 10, alignItems: "start", marginBottom: 10 }}>
        <Card style={{ padding: "12px 14px", background: glass, boxShadow: shadowCard }}>
          <h3 style={{ ...cardTitle, marginBottom: 8 }}>By game<span style={cardHint}>median views</span></h3>
          <Bars rows={byGame} max={Math.max(0, ...byGame.map((g) => g.median))} />
          <div style={foot}>Medians, so one runaway clip can't drag a game up. Grey = fewer than 3 clips, treat as a hint.</div>
        </Card>
        <Card style={{ padding: "12px 14px", background: glass, boxShadow: shadowCard }}>
          <h3 style={{ ...cardTitle, marginBottom: 8 }}>By title<span style={cardHint}>who wrote it</span></h3>
          <Bars rows={bySource} max={Math.max(0, ...bySource.map((g) => g.median))} />
          <div style={foot}>"Unknown" are imports and reposts that never went through the title generator.</div>
        </Card>
        <Card style={{ padding: "12px 14px", background: glass, boxShadow: shadowCard }}>
          <h3 style={{ ...cardTitle, marginBottom: 8 }}>By length<span style={cardHint}>median views</span></h3>
          <Bars rows={byLength} max={Math.max(0, ...byLength.map((g) => g.median))} />
          <div style={foot}>Length is the cut-down timeline, not the raw recording span.</div>
        </Card>
        <Card style={{ padding: "12px 14px", background: glass, boxShadow: shadowCard }}>
          <h3 style={{ ...cardTitle, marginBottom: 8 }}>Best posting slots<span style={cardHint}>median views · local time</span></h3>
          <div style={{ display: "grid", gridTemplateColumns: "34px repeat(7, 1fr)", gap: 3, fontSize: 10.5, color: T.textTertiary }}>
            <span />{DAYS.map((d) => <span key={d} style={{ textAlign: "center", paddingBottom: 2 }}>{d}</span>)}
            {HOUR_BANDS.map((b) => (
              <React.Fragment key={b.key}>
                <span style={{ alignSelf: "center", textAlign: "right", paddingRight: 4 }}>{b.key}</span>
                {DAYS.map((d) => {
                  const cell = slots.grid.find((g) => g.day === d && g.band === b.key);
                  const best = slots.best.includes(cell);
                  const pct = cell.n > 0 && slots.max > 0 ? 10 + (cell.median / slots.max) * 75 : 3;
                  return <span key={d} title={`${d} ${b.label}: ${cell.n} clip${cell.n === 1 ? "" : "s"}${cell.n ? `, median ${fmtK(cell.median)}` : ""}`} style={{ height: 18, borderRadius: 4, background: mix(T.accent, pct), boxShadow: best ? `inset 0 0 0 1.5px ${T.green}` : "none" }} />;
                })}
              </React.Fragment>
            ))}
          </div>
          <div style={foot}>Darker = more views for clips posted in that slot. Green ring = your best three. Needs a few clips per slot to trust.</div>
        </Card>
      </div>

      {/* Growth */}
      <Card style={{ padding: "12px 14px", background: glass, boxShadow: shadowCard, marginBottom: 10 }}>
        <h3 style={{ ...cardTitle, marginBottom: 8 }}>Growth<span style={cardHint}>views across all platforms, by day</span></h3>
        {growth.length >= 2 ? (
          <GrowthLine points={growth} />
        ) : (
          <div style={{ fontSize: 12, color: T.textTertiary, padding: "4px 0" }}>
            {firstSnapshot ? `Collecting daily snapshots since ${fmtDate(firstSnapshot)} — the line appears once there are two days.` : "Daily snapshots start with the next refresh. Once two days exist this shows views per day and the tiles show their change against the previous window."}
          </div>
        )}
      </Card>

      {/* Table */}
      <Card style={{ overflow: "hidden", background: glass, boxShadow: shadowCard }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
          <button onClick={() => setTableOpen((o) => !o)} style={{ background: "transparent", border: "none", color: T.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font, padding: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10 }}>{tableOpen ? "▼" : "▶"}</span>All {clips.length} clips as a table
          </button>
          <span style={{ marginLeft: "auto" }} /><Btn onClick={exportCSV} disabled={clips.length === 0}>Export CSV</Btn>
        </div>
        {tableOpen && (
          <div style={{ overflowX: "auto", borderTop: `1px solid ${T.border}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr>
                <Th k="title" left>Title</Th><Th k="game" left>Game</Th><Th k="date">Date</Th>
                {PLATFORMS.map((p) => <Th key={p} k={p}><PlatformIcon platform={p} size={12} style={{ display: "inline-block", verticalAlign: -2, marginRight: 4 }} />{PLATFORM_LABEL[p]}</Th>)}
                <Th k="total">Total</Th>
              </tr></thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.clipId} data-keep-panel="" onClick={() => setSelectedId(c.clipId)} style={{ cursor: "pointer" }}>
                    <td style={{ ...td, textAlign: "left", paddingLeft: 14, maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 }} title={c.title}>{c.title}</td>
                    <td style={{ ...td, textAlign: "left", color: T.textSecondary }}><Dot color={c.gameColor} glow /> <span style={{ marginLeft: 4 }}>{c.gameName}</span></td>
                    <td style={{ ...td, color: T.textTertiary }}>{fmtDate(c.date)}</td>
                    {PLATFORMS.map((p) => <td key={p} style={{ ...td, color: c.views[p] == null ? T.textTertiary : T.text }}>{fmt(c.views[p])}</td>)}
                    <td style={{ ...td, fontWeight: 700, color: c.fetchedAt ? T.text : T.textTertiary }}>{c.fetchedAt ? fmt(c.total) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </div>
      {selected && (
        <ClipDrawer clip={selected} medianAll={medianAll} related={related} onClose={closeDrawer} onOpenInEditor={onOpenInEditor} onSelect={setSelectedId} />
      )}
    </div>
  );
}

/**
 * One line, one series — the accent hue, endpoint labelled, hairline grid.
 * The svg stretches to the card (preserveAspectRatio none, non-scaling
 * stroke); labels are HTML so they never stretch with it.
 */
function GrowthLine({ points }) {
  const W = 1000, H = 100, padT = 10, padB = 6;
  const max = Math.max(...points.map((p) => p.total), 1);
  const min = Math.min(...points.map((p) => p.total));
  const span = Math.max(max - min, 1);
  const xs = (i) => (i / Math.max(points.length - 1, 1)) * W;
  const ys = (v) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const d = points.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)} ${ys(p.total).toFixed(1)}`).join(" ");
  const last = points[points.length - 1], first = points[0];
  const lastPct = (ys(last.total) / H) * 100;
  return (
    <div style={{ position: "relative", paddingRight: 64, paddingBottom: 16 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={W} y1={padT + f * (H - padT - padB)} y2={padT + f * (H - padT - padB)} stroke="rgba(var(--lift),0.06)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        <path d={`${d} L${W} ${H} L0 ${H} Z`} fill={T.accent} opacity="0.1" />
        <path d={d} fill="none" stroke={T.accentLight} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span style={{ position: "absolute", right: 64, top: `calc(${lastPct}% - 4px)`, width: 8, height: 8, borderRadius: "50%", background: T.accentLight, transform: "translateX(50%)", boxShadow: `0 0 0 2px ${T.surface}` }} />
      <span style={{ position: "absolute", right: 0, top: `calc(${lastPct}% - 8px)`, fontSize: 12, fontWeight: 700, color: T.text }}>{fmtK(last.total)}</span>
      <span style={{ position: "absolute", left: 0, bottom: 0, fontSize: 10.5, color: T.textTertiary }}>{fmtDate(first.day)}</span>
      <span style={{ position: "absolute", right: 64, bottom: 0, fontSize: 10.5, color: T.textTertiary }}>{fmtDate(last.day)}</span>
    </div>
  );
}
