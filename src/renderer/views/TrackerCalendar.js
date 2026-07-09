// Tracker Calendar (Phase 2) — read-only navigation layer over Phase 1 state.
// Month grid (Mon..Sat) + week scoreboard rail + month stats, day drawer, week drill-in.
// Adds ZERO persisted state: every number is derived from trackerData, weekMeta, streakState,
// and the Queue's scheduled clips. Nothing here writes. Visual target = P3 "Hybrid" mock.
import React, { useState, useMemo, useEffect, useCallback } from "react";
import T from "../styles/theme";
import { localISO, mondayISO, addDaysISO } from "../utils/trackerEngine";
import {
  monthWeeks, groupByLocalDate, streakByWeek, weekAggregate, monthStats, liveWeekPaceColor,
} from "../utils/trackerCalendarModel";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PLATFORM_ABBR = { tiktok: "TT", youtube: "YT", instagram: "IG", facebook: "FB" };
const PACE_HEX = { green: T.green, yellow: T.yellow, red: T.red };

const parseISO = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); };
const shortSlot = (s) => (s || "").replace(" PM", "p").replace(" AM", "a").replace(":30", "·30");

// "Jul 6 to 11" — month prefix on the Saturday only when it crosses a month boundary.
const weekRangeLabel = (mondayIso) => {
  const mon = parseISO(mondayIso), sat = parseISO(addDaysISO(mondayIso, 5));
  const a = `${MONTHS_SHORT[mon.getMonth()]} ${mon.getDate()}`;
  const b = sat.getMonth() === mon.getMonth() ? `${sat.getDate()}` : `${MONTHS_SHORT[sat.getMonth()]} ${sat.getDate()}`;
  return `${a} to ${b}`;
};

export default function TrackerCalendar({ trackerData, weekMeta, streakState, gamesDb, scheduledClips, now, onOpenThisWeek }) {
  const todayIso = localISO(now);
  const todayMondayIso = mondayISO(now);

  const [ym, setYm] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() }));
  const [drawerDay, setDrawerDay] = useState(null); // iso string
  const [drillWeek, setDrillWeek] = useState(null);  // monday iso string

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setDrillWeek(null); setDrawerDay(null); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const resolveGame = useCallback((hashtag) => {
    const g = gamesDb.find((x) => x.hashtag === hashtag || x.name === hashtag || x.tag === hashtag);
    return g ? { name: g.name, color: g.color, tag: g.tag } : { name: hashtag || "Unknown", color: T.textTertiary, tag: (hashtag || "?").slice(0, 3).toUpperCase() };
  }, [gamesDb]);
  // Look up a week's frozen game by its nowPlaying name (weekMeta stores the game NAME).
  const resolveGameByName = useCallback((name) => {
    const g = gamesDb.find((x) => x.name === name);
    return g ? { name: g.name, color: g.color, tag: g.tag } : { name: name || "Unknown", color: T.textTertiary, tag: (name || "?").slice(0, 2).toUpperCase() };
  }, [gamesDb]);

  const entriesByDate = useMemo(() => groupByLocalDate(trackerData), [trackerData]);
  const scheduledByDate = useMemo(() => groupByLocalDate(scheduledClips), [scheduledClips]);
  const streakMap = useMemo(() => streakByWeek(weekMeta), [weekMeta]);
  const rows = useMemo(() => monthWeeks(ym.year, ym.month), [ym]);
  const stats = useMemo(
    () => monthStats({ rows, weekMeta, entriesByDate, streakState, todayMondayIso }),
    [rows, weekMeta, entriesByDate, streakState, todayMondayIso]
  );

  const goPrev = () => setYm(({ year, month }) => (month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }));
  const goNext = () => setYm(({ year, month }) => (month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }));
  const goToday = () => setYm({ year: now.getFullYear(), month: now.getMonth() });

  const aggFor = (mondayIso) => weekAggregate({ mondayIso, weekMeta, entriesByDate, scheduledByDate, streakMap, todayMondayIso, streakState });

  // ---- per-clip segment strip (8 slots): one segment per clip in its game color,
  // manual faded, scheduled hollow, remainder faint neutral. Never a full-cell tint. ----
  const segTrack = (dayIso, isFuture) => {
    const segs = [];
    if (!isFuture) {
      for (const e of entriesByDate.get(dayIso) || []) {
        if (segs.length >= 8) break;
        const isAuto = e.source === "clipflow";
        const color = resolveGame(e.game).color;
        segs.push(<i key={`e${segs.length}`} style={{ display: "block", borderRadius: 2, background: color, opacity: isAuto ? 1 : 0.45 }} />);
      }
    }
    for (const _s of scheduledByDate.get(dayIso) || []) {
      if (segs.length >= 8) break;
      segs.push(<i key={`s${segs.length}`} style={{ display: "block", borderRadius: 2, border: "1px solid rgba(255,255,255,0.3)" }} />);
    }
    while (segs.length < 8) segs.push(<i key={`o${segs.length}`} style={{ display: "block", borderRadius: 2, background: "rgba(255,255,255,0.05)" }} />);
    return <div style={{ marginTop: "auto", display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 2, height: 4 }}>{segs}</div>;
  };

  // honest plain-text mix summary for the cell tooltip (never encode game by hue alone)
  const mixTitle = (dayIso, isFuture) => {
    if (isFuture) {
      const n = scheduledByDate.get(dayIso)?.length || 0;
      return n > 0 ? `${n} scheduled · read-only, scheduling lives in the Queue` : "";
    }
    const list = entriesByDate.get(dayIso) || [];
    if (!list.length) return "";
    const byGame = {};
    for (const e of list) { const nm = resolveGame(e.game).name; byGame[nm] = (byGame[nm] || 0) + 1; }
    return `${list.length} clips · ${Object.entries(byGame).map(([k, v]) => `${k} ${v}`).join(" · ")}`;
  };

  const dayCell = (day) => {
    const isToday = day.iso === todayIso;
    const isFuture = day.iso > todayIso;
    const count = isFuture ? 0 : (entriesByDate.get(day.iso)?.length || 0);
    const sched = scheduledByDate.get(day.iso)?.length || 0;
    const canOpen = (!isFuture) || (isFuture && sched > 0);

    return (
      <div key={day.iso} title={mixTitle(day.iso, isFuture)}
        onClick={canOpen ? () => setDrawerDay(day.iso) : undefined}
        style={{
          minHeight: 62, padding: "7px 8px 8px", borderRight: `1px solid ${T.border}`,
          cursor: canOpen ? "pointer" : "default", display: "flex", flexDirection: "column",
          boxShadow: isToday ? "inset 0 0 0 1px rgba(139,92,246,0.38)" : "none",
          transition: "background .15s",
        }}
        onMouseEnter={(e) => { if (canOpen) e.currentTarget.style.background = T.surfaceHover; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 600, color: isToday ? T.accentLight : (day.inMonth ? T.textTertiary : T.textMuted) }}>{day.dayNum}</span>
          {isToday && <span style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: T.accentLight, fontWeight: 700 }}>Today</span>}
        </div>
        {count > 0 ? (
          <div style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 700, color: T.text, lineHeight: 1, margin: "5px 0 7px", letterSpacing: "-0.02em" }}>{count}</div>
        ) : isFuture && sched > 0 ? (
          <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.textTertiary, lineHeight: 1, margin: "5px 0 7px" }}>{sched}</div>
        ) : (
          <div style={{ minHeight: 16, margin: "5px 0 7px" }} />
        )}
        {segTrack(day.iso, isFuture)}
      </div>
    );
  };

  const weekChip = (mondayIso) => {
    const agg = aggFor(mondayIso);
    if (agg.state === "noData") {
      return <div style={{ borderLeft: `1px solid ${T.border}`, padding: "9px 12px", display: "flex", flexDirection: "column", justifyContent: "center", cursor: "default" }}>
        <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 500 }}>No data</span>
      </div>;
    }
    const game = agg.game ? resolveGameByName(agg.game) : null;
    let tag, tagColor, score, frac, barColor;
    if (agg.state === "hit") { tag = "Hit ✓"; tagColor = T.green; }
    else if (agg.state === "missed") { tag = "Missed"; tagColor = T.textTertiary; }
    else if (agg.state === "current") { tag = "Live"; tagColor = T.accentLight; }
    else { tag = "Preview"; tagColor = T.textMuted; }

    if (agg.state === "future") {
      score = <><span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.text }}>{agg.sched}</span><span style={{ fontSize: 10, color: T.textTertiary, fontWeight: 500 }}> sched</span></>;
      frac = agg.target ? Math.min(1, agg.sched / agg.target) : 0;
      barColor = "rgba(255,255,255,0.18)";
    } else {
      score = <><span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.text }}>{agg.posted}</span><span style={{ fontSize: 10, color: T.textTertiary, fontWeight: 500 }}>/{agg.target}</span></>;
      frac = agg.target ? Math.min(1, agg.posted / agg.target) : 0;
      if (agg.state === "hit") barColor = T.green;
      else if (agg.state === "missed") barColor = "rgba(248,113,113,0.6)";
      else { barColor = PACE_HEX[liveWeekPaceColor({ posted: agg.posted, target: agg.target, todayIso, mondayIso }).color]; }
    }

    return (
      <div onClick={() => setDrillWeek(mondayIso)}
        style={{ borderLeft: `1px solid ${T.border}`, padding: "9px 12px", cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "center", gap: 5, transition: "background .15s" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHover; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span>{score}</span>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: tagColor, marginLeft: "auto" }}>{tag}</span>
        </div>
        <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 2, width: `${Math.round(frac * 100)}%`, background: barColor }} />
        </div>
        {game && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: T.textSecondary, fontWeight: 500 }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: game.color, flexShrink: 0 }} />
            {game.name}
            {agg.state === "hit" && ` · streak ${agg.streakAfter}`}
            {agg.state === "missed" && " · streak reset"}
          </div>
        )}
      </div>
    );
  };

  const gridCols = "repeat(6,1fr) 148px";

  return (
    <div>
      {/* Month bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0 14px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={goPrev} style={mNavStyle}>{"‹"}</button>
          <button onClick={goNext} style={mNavStyle}>{"›"}</button>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", minWidth: 150 }}>{MONTHS[ym.month]} {ym.year}</div>
        <button onClick={goToday} style={{ ...ghostBtn, padding: "6px 12px" }}>Today</button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <span style={legendItem}><span style={{ width: 9, height: 4, borderRadius: 2, background: "#ff6b35", display: "inline-block" }} /><span style={{ width: 9, height: 4, borderRadius: 2, background: T.cyan, display: "inline-block", marginLeft: -4 }} />One segment per clip, its game's color</span>
          <span style={legendItem}><span style={{ width: 9, height: 4, borderRadius: 2, background: "none", border: "1px solid rgba(255,255,255,0.3)", display: "inline-block" }} />Scheduled</span>
        </div>
      </div>

      {/* Month stats line */}
      <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textTertiary, fontWeight: 500, marginBottom: 10, letterSpacing: "0.02em", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span><b style={statB}>{stats.clips}</b> clips</span><span style={statSep} />
        <span><b style={statB}>{stats.hits} of {stats.done}</b> weeks hit</span><span style={statSep} />
        <span>streak <b style={{ ...statB, color: T.accentLight }}>{stats.streak}</b></span><span style={statSep} />
        <span>best day <b style={statB}>{stats.bestDay}</b></span>
      </div>

      {/* Calendar grid */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: gridCols, borderBottom: `1px solid ${T.border}` }}>
          {DOW.map((d) => <span key={d} style={dowHead}>{d}</span>)}
          <span style={{ ...dowHead, borderLeft: `1px solid ${T.border}` }}>Week</span>
        </div>
        {rows.map((row) => (
          <div key={row.mondayISO} style={{ display: "grid", gridTemplateColumns: gridCols, borderBottom: `1px solid ${T.border}` }}>
            {row.days.map((day) => dayCell(day))}
            {weekChip(row.mondayISO)}
          </div>
        ))}
      </div>

      {/* Day drawer */}
      {drawerDay && (
        <DayDrawer
          dayIso={drawerDay} todayIso={todayIso}
          entries={entriesByDate.get(drawerDay) || []}
          scheduled={scheduledByDate.get(drawerDay) || []}
          weekAgg={aggFor(mondayISO(parseISO(drawerDay)))}
          resolveGame={resolveGame}
          onClose={() => setDrawerDay(null)}
        />
      )}

      {/* Week drill-in */}
      {drillWeek && (
        <WeekDrill
          mondayIso={drillWeek} todayIso={todayIso}
          agg={aggFor(drillWeek)}
          entriesByDate={entriesByDate} scheduledByDate={scheduledByDate}
          resolveGame={resolveGame} resolveGameByName={resolveGameByName}
          onClose={() => setDrillWeek(null)}
          onOpenThisWeek={() => { setDrillWeek(null); onOpenThisWeek(); }}
        />
      )}
    </div>
  );
}

// ---------- Day drawer ----------
function DayDrawer({ dayIso, todayIso, entries, scheduled, weekAgg, resolveGame, onClose }) {
  const d = parseISO(dayIso);
  const isFuture = dayIso > todayIso;
  const dow = DOW[(d.getDay() + 6) % 7];
  const gameName = weekAgg?.game || null;

  const platsFor = (entry) => {
    if (entry.platformResults && entry.platformResults.length) {
      return entry.platformResults.map((r) => PLATFORM_ABBR[r.platform] || (r.platform || "").slice(0, 2).toUpperCase()).join(" ");
    }
    return null; // pre-Phase-1 history: platforms unknown
  };
  const viewUrl = (entry) => entry.platformResults?.find((r) => r.url)?.url || null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 3000 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(5,6,10,0.55)" }} />
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 372, background: "#0d0e15", borderLeft: `1px solid ${T.borderHover}`, padding: 22, overflowY: "auto", animation: "tcSlide .22s cubic-bezier(.3,.8,.4,1)" }}>
        <button onClick={onClose} style={closeX}>{"✕"}</button>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>{dow} {MONTHS_SHORT[d.getMonth()]} {d.getDate()}</div>
        <div style={{ fontSize: 11, color: T.textSecondary, fontWeight: 500, marginTop: 5, marginBottom: 18 }}>
          {isFuture
            ? <><b style={drawerB}>{scheduled.length}</b> scheduled · nothing posted yet</>
            : <><b style={drawerB}>{entries.length}</b> posted{gameName ? <> · NOW PLAYING {gameName}</> : null}</>}
        </div>

        {!isFuture && entries.map((entry, i) => {
          const gd = resolveGame(entry.game);
          const isAuto = entry.source === "clipflow";
          const plats = platsFor(entry);
          const url = viewUrl(entry);
          return (
            <div key={entry.id || i} style={clipRow}>
              <span style={{ ...ctag, background: gd.color }}>{gd.tag}</span>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textTertiary }}>{shortSlot(entry.time)}</span>
              <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: isAuto ? T.cyan : "#fff", boxShadow: isAuto ? `0 0 6px ${T.cyan}88` : "none" }} />
              <span style={{ fontSize: 9, color: T.textTertiary, fontWeight: 500, marginLeft: "auto", textAlign: "right" }}>{plats || "platforms unknown"}</span>
              {url && <a onClick={() => window.clipflow?.openExternal?.(url)} style={viewLink}>View ↗</a>}
            </div>
          );
        })}

        {scheduled.length > 0 && (
          <>
            <div style={secLbl}>Scheduled{isFuture ? "" : " · later today or this week"}</div>
            {scheduled.map((c, i) => (
              <div key={i} style={{ ...clipRow, opacity: 0.6, borderStyle: "dashed" }}>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textTertiary }}>{shortSlot(c.time)}</span>
                <span style={{ fontSize: 10, color: T.textSecondary, marginLeft: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{c.title || "Scheduled clip"}</span>
              </div>
            ))}
          </>
        )}

        {!isFuture && entries.length === 0 && scheduled.length === 0 && (
          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 500, marginTop: 14 }}>Nothing logged this day.</div>
        )}
        <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 500, marginTop: 14, lineHeight: 1.5 }}>
          {isFuture
            ? "Read-only preview. Scheduling and edits live in the Queue."
            : "View ↗ opens the live post. Links exist where ClipFlow has the post ID."}
        </div>
      </div>
      <style>{`@keyframes tcSlide{from{transform:translateX(30px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
    </div>
  );
}

// ---------- Week drill-in ----------
function WeekDrill({ mondayIso, todayIso, agg, entriesByDate, scheduledByDate, resolveGame, resolveGameByName, onClose, onOpenThisWeek }) {
  const game = agg.game ? resolveGameByName(agg.game) : { name: "Unknown", color: T.textTertiary, tag: "?" };
  const recap = agg.recap;

  const banner = (() => {
    if (agg.state === "hit") {
      return { cls: "hit", ico: "✓", color: T.green, border: "rgba(52,211,153,0.3)", bg: "linear-gradient(90deg,rgba(52,211,153,0.09),transparent 70%)",
        text: <>Goal hit. <b style={obB}>{agg.posted} of {agg.target}</b> posted. Bonus XP banked, streak extended to <b style={obB}>{agg.streakAfter}</b>.</>,
        sub: `Frozen target · ${agg.target}` };
    }
    if (agg.state === "missed") {
      return { cls: "missed", ico: "▽", color: T.textTertiary, border: T.border, bg: "rgba(255,255,255,0.02)",
        text: <>Target {agg.target}, posted <b style={obB}>{agg.posted}</b>. Streak ended at {agg.lostStreak} week{agg.lostStreak === 1 ? "" : "s"}. Rank kept every XP, the next streak started the following Monday.</>,
        sub: `Frozen target · ${agg.target}` };
    }
    if (agg.state === "current") {
      return { cls: "current", ico: "●", color: T.accentLight, border: "rgba(139,92,246,0.3)", bg: "linear-gradient(90deg,rgba(139,92,246,0.12),transparent 70%)",
        text: <>This week, live now. <b style={obB}>{agg.posted} of {agg.target}</b> so far.</>,
        sub: `Streak on the line · ${agg.streakAfter}`, showOpen: true };
    }
    return { cls: "future", ico: "·", color: T.textTertiary, border: T.border, bg: "rgba(255,255,255,0.02)",
      text: <>Upcoming week. <b style={obB}>{agg.sched}</b> clip{agg.sched === 1 ? "" : "s"} scheduled so far. Read-only preview, scheduling lives in the Queue.</>,
      sub: agg.target ? `Target · ${agg.target}` : "" };
  })();

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 3100, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "48px 20px" }}>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,6,10,0.6)" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: 780, background: "#0d0e15", border: `1px solid ${T.borderHover}`, borderRadius: T.radius.xl || 20, padding: "26px 28px", boxShadow: "0 30px 90px rgba(0,0,0,0.7)", animation: "tcPop .2s ease-out" }}>
        <button onClick={onClose} style={{ ...closeX, top: 20, right: 20, width: 30, height: 30 }}>{"✕"}</button>

        {/* head */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", color: T.textTertiary, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, color: "#0a0b10", background: game.color }}>{game.tag}</span>
            NOW PLAYING {game.name.toUpperCase()} · READ-ONLY
          </div>
          <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>Week of <b style={{ color: game.color }}>{weekRangeLabel(mondayIso)}</b></h3>
        </div>

        {/* outcome banner */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, borderRadius: T.radius.md, padding: "12px 16px", marginBottom: 16, fontSize: 12.5, fontWeight: 600, lineHeight: 1.4, border: `1px solid ${banner.border}`, background: banner.bg, color: banner.cls === "missed" || banner.cls === "future" ? T.textSecondary : T.text }}>
          <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0, color: banner.color }}>{banner.ico}</span>
          <span>{banner.text}</span>
          {banner.showOpen && <button onClick={onOpenThisWeek} style={{ ...ghostBtn, marginLeft: "auto", flexShrink: 0, color: T.accentLight, borderColor: T.accentBorder }}>Open This week view</button>}
          {!banner.showOpen && banner.sub && <span style={{ marginLeft: "auto", fontSize: 10, color: T.textTertiary, fontWeight: 500, flexShrink: 0 }}>{banner.sub}</span>}
        </div>

        {/* read-only day columns */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, overflow: "hidden", marginBottom: 16, background: T.surface }}>
          {DOW.map((dn, di) => {
            const iso = addDaysISO(mondayIso, di);
            const d = parseISO(iso);
            const isFuture = iso > todayIso;
            const clips = isFuture ? [] : (entriesByDate.get(iso) || []);
            const sched = scheduledByDate.get(iso) || [];
            const shown = clips.slice(0, 5);
            return (
              <div key={dn} style={{ padding: "10px 8px", borderRight: di < 5 ? `1px solid ${T.border}` : "none", minHeight: 120, opacity: isFuture ? 0.45 : 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 2px 8px" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.text }}>{dn}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: T.textTertiary }}>{MONTHS_SHORT[d.getMonth()]} {d.getDate()}</span>
                </div>
                {shown.map((c, i) => {
                  const gd = resolveGame(c.game);
                  const isAuto = c.source === "clipflow";
                  return (
                    <div key={c.id || i} style={drChip}>
                      <span style={{ ...ctag, fontSize: 8, padding: "1px 4px" }}>{gd.tag}</span>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: isAuto ? T.cyan : "#fff" }} />
                      <span style={{ fontFamily: T.mono, fontSize: 8, color: T.textTertiary, marginLeft: "auto" }}>{shortSlot(c.time)}</span>
                    </div>
                  );
                })}
                {clips.length > 5 && <div style={{ fontFamily: T.mono, fontSize: 9, color: T.textMuted, padding: "2px 4px" }}>+{clips.length - 5} more</div>}
                {sched.slice(0, 3).map((c, i) => (
                  <div key={`s${i}`} style={{ ...drChip, opacity: 0.5, borderStyle: "dashed" }}>
                    <span style={{ fontFamily: T.mono, fontSize: 8, color: T.textTertiary }}>{shortSlot(c.time)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* frozen recap */}
        {(agg.state === "hit" || agg.state === "missed") && recap ? (
          <>
            <div style={{ position: "relative", border: `1px solid ${T.border}`, borderRadius: T.radius.md, overflow: "hidden", padding: "16px 18px", background: T.surface }}>
              <div style={{ position: "absolute", inset: 0, zIndex: 0, background: `linear-gradient(115deg, ${game.color}29 0%, transparent 60%)` }} />
              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>{recap.clips} clip{recap.clips === 1 ? "" : "s"} to <b style={{ color: game.color }}>{recap.platformsUsed} platform{recap.platformsUsed === 1 ? "" : "s"}</b> · {game.name}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 600, color: T.textSecondary }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: "linear-gradient(135deg,#a78bfa,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#0a0b10" strokeWidth="2.6"><path d="M4 7h16M4 12h10M4 17h6" /></svg>
                    </span>ClipFlow
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                  {["tiktok", "youtube", "instagram", "facebook"].map((k) => (
                    <div key={k} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.sm, padding: "9px 11px" }}>
                      <div style={{ fontSize: 9, color: T.textSecondary, fontWeight: 600, marginBottom: 5, textTransform: "capitalize" }}>{k === "tiktok" ? "TikTok" : k === "youtube" ? "YouTube" : k}</div>
                      <div style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>{recap.perPlatform?.[k] || 0}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 500, marginTop: 14, textAlign: "center" }}>Frozen at week rollover · this recap is exactly what the week looked like when it closed</div>
          </>
        ) : agg.state === "current" ? (
          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 500, marginTop: 4, textAlign: "center" }}>The live recap for this week sits on the This week view.</div>
        ) : (
          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 500, marginTop: 4, textAlign: "center" }}>No recap yet. This week has not happened.</div>
        )}
      </div>
      <style>{`@keyframes tcPop{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

// ---------- styles ----------
const mNavStyle = { width: 30, height: 30, background: T.surface, border: `1px solid ${T.border}`, color: T.textSecondary, borderRadius: T.radius.sm, cursor: "pointer", fontSize: 15, lineHeight: 1, fontFamily: "inherit" };
const ghostBtn = { background: "none", border: `1px solid ${T.border}`, color: T.textSecondary, fontFamily: "inherit", fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: T.radius.sm, cursor: "pointer" };
const legendItem = { display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: T.textTertiary, fontWeight: 500 };
const statB = { color: T.text, fontWeight: 600 };
const statSep = { width: 3, height: 3, borderRadius: "50%", background: T.textMuted, display: "inline-block" };
const dowHead = { padding: "11px 10px 9px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textTertiary, fontWeight: 600 };
const closeX = { position: "absolute", top: 18, right: 18, width: 28, height: 28, background: "none", border: `1px solid ${T.border}`, borderRadius: T.radius.sm, color: T.textTertiary, cursor: "pointer", fontSize: 13, fontFamily: "inherit", zIndex: 2 };
const clipRow = { display: "flex", alignItems: "center", gap: 9, background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, borderRadius: T.radius.sm, padding: "9px 11px", marginBottom: 6 };
const ctag = { fontFamily: T.mono, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, color: "#0a0b10", flexShrink: 0 };
const viewLink = { fontSize: 10, fontWeight: 600, color: T.accentLight, cursor: "pointer", flexShrink: 0, padding: "3px 8px", borderRadius: 4, border: `1px solid ${T.accentBorder}` };
const secLbl = { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textTertiary, fontWeight: 600, margin: "16px 0 8px" };
const drawerB = { color: T.text, fontWeight: 600, fontFamily: T.mono };
const drChip = { display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, borderRadius: 5, padding: "4px 6px", marginBottom: 4 };
const obB = { fontFamily: T.mono };
