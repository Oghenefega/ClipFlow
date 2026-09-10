// #387: the Analytics tab — "what worked?", as opposed to the Tracker's "did I
// post?". Reads what analytics.js joined in the main process: every published
// clip with its per-platform view counts, plus the state of each platform's
// connection. Numbers come from the daily background pull; Refresh runs it now.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import T from "../styles/theme";
import { Card, PageHeader } from "../components/shared";
import PlatformIcon from "../components/PlatformIcon";

const PLATFORMS = ["youtube", "instagram", "facebook", "tiktok"];
const LABEL = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };
const SHORT = { youtube: "YT", instagram: "IG", facebook: "FB", tiktok: "TT" };
const TIKTOK_NOTE = "Arrives once TikTok approves the app";
const WINDOWS = [
  { id: "7d", days: 7, label: "7d" },
  { id: "30d", days: 30, label: "30d" },
  { id: "90d", days: 90, label: "90d" },
  { id: "all", days: null, label: "All" },
];
const SOURCE_ORDER = ["self", "ai_edited", "ai", "unknown"];
const SOURCE_LABEL = { self: "Written by you", ai_edited: "AI, edited", ai: "AI, as suggested", unknown: "Unknown" };

const pad2 = (n) => String(n).padStart(2, "0");
// Local calendar date N days back, as YYYY-MM-DD — the tracker's `date` format.
// Never via toISOString (that is UTC and shifts the day for EST evenings).
const localDateDaysAgo = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
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

const th = { fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: T.textTertiary, textAlign: "right", padding: "7px 10px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" };
const td = { padding: "6px 10px", textAlign: "right", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: T.text };
const cardTitle = { fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: T.textSecondary, margin: 0, padding: "11px 14px 9px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 };

export default function AnalyticsView({ gamesDb = [], active }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [windowKey, setWindowKey] = useState("30d");
  const [sort, setSort] = useState({ key: "total", dir: "desc" });

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
    return g ? { name: g.name, color: g.color } : { name: (raw || "?").toUpperCase(), color: T.textMuted };
  }, [gamesDb]);

  const win = WINDOWS.find((w) => w.id === windowKey) || WINDOWS[1];
  const clips = useMemo(() => {
    const all = data?.clips || [];
    if (!win.days) return all;
    const cutoff = localDateDaysAgo(win.days);
    return all.filter((c) => c.date >= cutoff);
  }, [data, win]);

  const totals = useMemo(() => {
    const t = { total: 0 };
    for (const p of PLATFORMS) t[p] = { views: 0, withViews: 0, withPost: 0 };
    for (const c of clips) {
      for (const p of PLATFORMS) {
        if (c.hasPost[p]) t[p].withPost++;
        if (c.views[p] != null) { t[p].views += c.views[p]; t[p].withViews++; }
      }
      t.total += c.total;
    }
    t.anyViews = PLATFORMS.some((p) => t[p].withViews > 0);
    return t;
  }, [clips]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (c) => {
      if (sort.key === "title") return c.title.toLowerCase();
      if (sort.key === "game") return gameOf(c.game).name.toLowerCase();
      if (sort.key === "date") return c.date;
      if (sort.key === "total") return c.total;
      return c.views[sort.key] ?? -1;
    };
    return [...clips].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x === y) return b.date < a.date ? -1 : 1;
      return (x < y ? -1 : 1) * dir;
    });
  }, [clips, sort, gameOf]);

  const byGame = useMemo(() => {
    const m = new Map();
    for (const c of clips) {
      const g = gameOf(c.game);
      const e = m.get(g.name) || { ...g, clips: 0, views: 0, withViews: 0 };
      e.clips++;
      e.views += c.total;
      if (PLATFORMS.some((p) => c.views[p] != null)) e.withViews++;
      m.set(g.name, e);
    }
    return [...m.values()].sort((a, b) => b.views - a.views);
  }, [clips, gameOf]);

  const bySource = useMemo(() => {
    const m = {};
    for (const c of clips) {
      const k = SOURCE_ORDER.includes(c.titleSource) ? c.titleSource : "unknown";
      const e = m[k] || { clips: 0, yt: 0, withYt: 0 };
      e.clips++;
      if (c.views.youtube != null) { e.yt += c.views.youtube; e.withYt++; }
      m[k] = e;
    }
    return SOURCE_ORDER.filter((k) => m[k]).map((k) => ({ key: k, ...m[k] }));
  }, [clips]);

  const lastFetched = useMemo(() => {
    let latest = null;
    for (const c of data?.clips || []) if (c.fetchedAt && (!latest || c.fetchedAt > latest)) latest = c.fetchedAt;
    return latest;
  }, [data]);

  const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "title" || key === "game" ? "asc" : "desc" }));
  const arrow = (key) => (sort.key === key ? <span style={{ fontSize: 9, marginLeft: 3 }}>{sort.dir === "desc" ? "▼" : "▲"}</span> : null);
  const Th = ({ k, children, left }) => (
    <th onClick={() => onSort(k)} style={{ ...th, textAlign: left ? "left" : "right", color: sort.key === k ? T.text : T.textTertiary }}>{children}{arrow(k)}</th>
  );

  const platformNote = (p) => {
    if (p === "tiktok") return { text: TIKTOK_NOTE, warn: false };
    const err = data?.platforms?.[p]?.error;
    if (err) return { text: err, warn: true };
    return { text: `${totals[p].withViews} of ${totals[p].withPost} clips`, warn: false };
  };

  return (
    <div>
      <PageHeader title="Analytics" style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", gap: 2, background: "rgba(var(--lift),0.03)", borderRadius: T.radius.md, padding: 3 }}>
          {WINDOWS.map((w) => (
            <button key={w.id} onClick={() => setWindowKey(w.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: windowKey === w.id ? "rgba(var(--lift),0.07)" : "transparent", color: windowKey === w.id ? T.text : T.textTertiary, fontSize: 12, fontWeight: 600, fontFamily: T.font }}>{w.label}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>
          {refreshing ? "Refreshing…" : lastFetched ? `Refreshed ${ago(lastFetched)}` : "Not refreshed yet"}
        </span>
        <button onClick={refresh} disabled={refreshing} style={{ fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 8, border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight, cursor: refreshing ? "default" : "pointer", fontFamily: T.font, opacity: refreshing ? 0.6 : 1 }}>Refresh</button>
      </PageHeader>

      {loadError && <p style={{ color: T.red, fontSize: 12, margin: "0 0 14px" }}>{loadError}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr repeat(4, 1fr)", gap: 10, marginBottom: 18 }}>
        <Card style={{ padding: "12px 14px", minHeight: 74, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: T.textTertiary }}>Total views</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1.1, marginTop: 8, color: totals.anyViews ? T.text : T.textTertiary }}>{totals.anyViews ? fmt(totals.total) : "—"}</div>
            <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 4 }}>{clips.length} clip{clips.length === 1 ? "" : "s"} · {win.days ? `${win.days} days` : "all time"}</div>
          </div>
        </Card>
        {PLATFORMS.map((p) => {
          const note = platformNote(p);
          const hasNumber = p !== "tiktok" && totals[p].withViews > 0;
          return (
            <Card key={p} style={{ padding: "12px 14px", minHeight: 74, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: T.textTertiary }}>
                <PlatformIcon platform={p} size={13} />{LABEL[p]}
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1.1, marginTop: 8, color: hasNumber ? T.text : T.textTertiary }}>{hasNumber ? fmt(totals[p].views) : "—"}</div>
                <div style={{ fontSize: 11, color: note.warn ? T.yellow : T.textTertiary, marginTop: 4, lineHeight: 1.4 }}>{note.text}</div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card style={{ overflow: "hidden", marginBottom: 14 }}>
        <h3 style={cardTitle}>Clips <span style={{ fontWeight: 600, color: T.textTertiary, letterSpacing: 0, textTransform: "none" }}>· {clips.length} published {win.days ? `in the last ${win.days} days` : "all time"}</span></h3>
        {clips.length === 0 ? (
          <p style={{ color: T.textTertiary, fontSize: 12, margin: 0, padding: "18px 14px" }}>
            {data?.clips?.length ? "No clips published in this window." : "Publish a clip and its views show up here after the next refresh."}
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <Th k="title" left>Title</Th>
                  <Th k="game" left>Game</Th>
                  <Th k="date">Date</Th>
                  {PLATFORMS.map((p) => (
                    <Th key={p} k={p}><PlatformIcon platform={p} size={12} style={{ display: "inline-block", verticalAlign: -2, marginRight: 4 }} />{SHORT[p]}</Th>
                  ))}
                  <Th k="total">Total</Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => {
                  const g = gameOf(c.game);
                  return (
                    <tr key={c.clipId}>
                      <td style={{ ...td, textAlign: "left", paddingLeft: 14, maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 }} title={c.title}>{c.title}</td>
                      <td style={{ ...td, textAlign: "left", color: T.textSecondary }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", marginRight: 6, background: g.color, boxShadow: `0 0 6px ${g.color}` }} />{g.name}
                      </td>
                      <td style={{ ...td, color: T.textTertiary }}>{fmtDate(c.date)}</td>
                      {PLATFORMS.map((p) => (
                        <td key={p} style={{ ...td, color: c.views[p] == null ? T.textTertiary : T.text }} title={p === "tiktok" ? TIKTOK_NOTE : undefined}>{fmt(c.views[p])}</td>
                      ))}
                      <td style={{ ...td, fontWeight: 700, color: c.fetchedAt ? T.text : T.textTertiary }}>{c.fetchedAt ? fmt(c.total) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 14 }}>
        <Card style={{ overflow: "hidden" }}>
          <h3 style={cardTitle}>By game</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left", paddingLeft: 14, cursor: "default" }}>Game</th>
                <th style={{ ...th, cursor: "default" }}>Clips</th>
                <th style={{ ...th, cursor: "default", color: T.text }}>Views</th>
                <th style={{ ...th, cursor: "default" }}>Avg / clip</th>
              </tr>
            </thead>
            <tbody>
              {byGame.length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: "left", paddingLeft: 14, color: T.textTertiary }}>—</td></tr>}
              {byGame.map((g) => (
                <tr key={g.name}>
                  <td style={{ ...td, textAlign: "left", paddingLeft: 14, color: T.textSecondary }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", marginRight: 6, background: g.color, boxShadow: `0 0 6px ${g.color}` }} />{g.name}
                  </td>
                  <td style={td}>{g.clips}</td>
                  <td style={td}>{fmt(g.views)}</td>
                  <td style={td}>{g.withViews ? fmt(Math.round(g.views / g.withViews)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card style={{ overflow: "hidden" }}>
          <h3 style={cardTitle}>By title source</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left", paddingLeft: 14, cursor: "default" }}>Title</th>
                <th style={{ ...th, cursor: "default" }}>Clips</th>
                <th style={{ ...th, cursor: "default" }}>Avg YT views</th>
              </tr>
            </thead>
            <tbody>
              {bySource.length === 0 && <tr><td colSpan={3} style={{ ...td, textAlign: "left", paddingLeft: 14, color: T.textTertiary }}>—</td></tr>}
              {bySource.map((s) => (
                <tr key={s.key}>
                  <td style={{ ...td, textAlign: "left", paddingLeft: 14, color: T.textSecondary }}>{SOURCE_LABEL[s.key]}</td>
                  <td style={td}>{s.clips}</td>
                  <td style={td}>{s.withYt ? fmt(Math.round(s.yt / s.withYt)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: T.textTertiary, padding: "8px 14px", borderTop: `1px solid ${T.border}` }}>YouTube only — that is the number the title generator ranks its examples by.</div>
        </Card>
      </div>
    </div>
  );
}
