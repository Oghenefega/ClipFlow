import React from "react";
import T from "../styles/theme";

// #461: one post of a repost pair, as a pill that takes you to it. Scheduled reads like
// a scheduled card (dashed yellow); one still waiting in the Queue opens the Queue
// (inside the Queue there is nowhere to go, so it is just a label).
export default function PostPill({ post, onGo, onQueue }) {
  const sched = post.state === "scheduled";
  const queued = post.state === "queued";
  const inert = queued && !onQueue;
  const day = post.date ? new Date(`${post.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  return (
    <button
      onClick={(e) => { e.stopPropagation(); queued ? onQueue?.() : onGo?.(); }}
      title={queued ? "Waiting in the Queue, not scheduled yet" : sched ? "Scheduled. Click to see it in the Tracker" : "Click to see it in the Tracker"}
      style={{
        padding: "2px 7px", borderRadius: 5, fontSize: 10.5, fontWeight: 600, fontFamily: T.font, cursor: inert ? "default" : "pointer", whiteSpace: "nowrap",
        color: queued ? T.textSecondary : sched ? T.yellow : T.accentLight,
        background: queued ? "rgba(var(--lift),0.04)" : sched ? T.yellowDim : T.accentDim,
        border: `1px ${sched ? "dashed" : "solid"} ${queued ? T.border : sched ? T.yellowBorder : T.accentBorder}`,
      }}
    >{queued ? "In Queue" : `${day} · ${post.time}`}</button>
  );
}
