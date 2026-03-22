import React, { useMemo } from "react";
import { fmtTime } from "../../utils/timeUtils";
import { LABEL_W, RULER_H, RULER_BG, RULER_TEXT, END_PADDING } from "./timelineConstants";

export default React.memo(function Ruler({ duration, clipContentWidth, leftOffset = 0 }) {
  const rulerTicks = useMemo(() => {
    if (duration <= 0) return [];
    const majorInterval = Math.max(0.5, Math.round((duration / (clipContentWidth / 60)) * 2) / 2);
    const ticks = [];
    for (let t = 0; t <= duration; t += majorInterval / 2) {
      const isMajor = Math.abs(t % majorInterval) < 0.01 || Math.abs(t % majorInterval - majorInterval) < 0.01;
      // Display time subtracts leftOffset so the original 0 point stays labeled as 0
      const displayTime = t - leftOffset;
      ticks.push({ time: t, displayTime, px: LABEL_W + (t / duration) * clipContentWidth, major: isMajor });
    }
    return ticks;
  }, [duration, clipContentWidth, leftOffset]);

  return (
    <div
      className="flex items-stretch"
      style={{ height: RULER_H, borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      onPointerDown={(e) => { if (e.button === 2) e.stopPropagation(); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="shrink-0 z-10"
        style={{ width: LABEL_W, position: "sticky", left: 0, background: RULER_BG }}
      />
      <div className="relative flex-1" style={{ minWidth: clipContentWidth + END_PADDING, background: RULER_BG }}>
        {rulerTicks.map((tick, i) => {
          const x = tick.px - LABEL_W;
          return (
            <div
              key={i}
              className="absolute bottom-0 flex flex-col items-center"
              style={{ left: x }}
            >
              {tick.major && (
                <span
                  className="text-[9px] font-mono leading-none mb-0.5 -translate-x-1/2 whitespace-nowrap"
                  style={{ color: RULER_TEXT }}
                >
                  {Math.abs(tick.displayTime) < 60
                    ? `${tick.displayTime < 0 ? "-" : ""}${Math.abs(tick.displayTime).toFixed(Math.abs(tick.displayTime) % 1 === 0 ? 0 : 1)}s`
                    : fmtTime(tick.displayTime)
                  }
                </span>
              )}
              <div style={{ width: 1, height: tick.major ? 8 : 4, background: "rgba(255,255,255,0.15)" }} />
            </div>
          );
        })}
      </div>
    </div>
  );
});
