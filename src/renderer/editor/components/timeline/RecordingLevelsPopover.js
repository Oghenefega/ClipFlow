import React, { useEffect, useState } from "react";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { Slider } from "../../../../components/ui/slider";
import useEditorStore from "../../stores/useEditorStore";
import { resolveClipAudioMix, mixableTracks, normalizeMix, MIX_DB_MIN, MIX_DB_MAX } from "../../models/audioMix";
import { trackLabelText } from "../../../audioTrackLabels";

const fmtDb = (db) => `${db > 0 ? "+" : ""}${db} dB`;
// The wizard's "Other…" option text invites a custom name; as a row name the
// ellipsis is just noise.
const rowName = (t) => (trackLabelText(t) || `Track ${t.index + 1}`).replace(/…$/, "");

/**
 * Recording levels (#272) — the Audio lane's popover. One slider per OBS track
 * of the source recording (named by the #169 calibration), −24…+24 dB. Edits
 * land on THIS clip; "Apply to every clip" makes them the recording's default.
 * Opens upward from the lane header, styled like the sound-block popover.
 *
 * While open, the preview's stems are loaded even at flat levels
 * (audioMixPanelOpen), so the first drag is audible at once.
 */
export default function RecordingLevelsPopover({ x, y, onClose }) {
  const audioMix = useEditorStore((s) => s.audioMix);
  const project = useEditorStore((s) => s.project);
  const info = useEditorStore((s) => s.audioMixInfo);
  const setPanelOpen = useEditorStore((s) => s.setAudioMixPanelOpen);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);

  useEffect(() => {
    setPanelOpen(true);
    return () => setPanelOpen(false);
  }, [setPanelOpen]);

  const eff = normalizeMix(resolveClipAudioMix({ audioMix }, project)) || {};
  const setup = info?.setup || null;
  const rows = mixableTracks(setup).filter((t) => info?.trackCount == null || t.index < info.trackCount);
  const projectMix = project?.audioMix && typeof project.audioMix === "object" ? project.audioMix : null;
  const ownLevels = audioMix !== null;

  const setDb = (index, db) => useEditorStore.getState().setAudioMixLevel(index, db);
  const apply = async () => {
    setApplying(true);
    setApplyError(null);
    const res = await useEditorStore.getState().applyAudioMixToRecording();
    setApplying(false);
    if (res?.error) setApplyError(res.error);
  };

  let notice = null;
  if (!setup) {
    if (info?.setupMismatch) {
      notice = "The audio setup in Settings was made for a different track layout — run it again for this recording to balance its tracks.";
    } else if (info && info.trackCount != null && info.trackCount <= 1) {
      notice = "This recording has a single audio track — nothing to balance.";
    } else if (info) {
      notice = "Run the audio setup in Settings to balance this recording's tracks.";
    } else {
      notice = "Checking the recording…";
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onPointerDown={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="fixed z-50 w-[272px] rounded-lg border border-border bg-popover shadow-xl p-3 space-y-3"
        style={{ left: x, top: y, transform: "translateY(-100%)" }}
      >
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-medium text-foreground flex-1">Recording levels</span>
          <span className="text-[11px] text-muted-foreground">
            {ownLevels ? "This clip" : projectMix ? "Recording" : ""}
          </span>
        </div>

        {notice ? (
          <p className="text-[11px] text-muted-foreground leading-snug">{notice}</p>
        ) : (
          <div className="space-y-2.5">
            {rows.map((t) => {
              const db = eff[String(t.index)] || 0;
              const silent = !!info?.peaks && info.peaks[t.index] === 0;
              return (
                <div key={t.index} className={silent ? "opacity-45" : ""}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-muted-foreground truncate">
                      {rowName(t)}{silent ? " · silent here" : ""}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <span className="text-[11px] text-foreground tabular-nums">{fmtDb(db)}</span>
                      {db !== 0 && (
                        <button
                          type="button"
                          className="text-muted-foreground/60 hover:text-foreground"
                          title="Back to 0 dB"
                          onClick={() => setDb(t.index, 0)}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  </div>
                  <Slider
                    value={[db]}
                    min={MIX_DB_MIN}
                    max={MIX_DB_MAX}
                    step={1}
                    onValueChange={([v]) => setDb(t.index, v)}
                  />
                </div>
              );
            })}
          </div>
        )}

        {info?.loading && <p className="text-[11px] text-muted-foreground/70">Preparing the tracks…</p>}
        {info?.error && <p className="text-[11px] text-amber-400/90">{info.error}</p>}
        {applyError && <p className="text-[11px] text-amber-400/90">{applyError}</p>}

        {setup && (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
              disabled={!ownLevels}
              title={projectMix ? "Drop this clip's own levels and use the recording's" : "Drop this clip's own levels"}
              onClick={() => useEditorStore.getState().resetAudioMix()}
            >
              {projectMix ? "Use the recording's" : "Reset"}
            </button>
            <button
              type="button"
              className="text-[11px] text-primary hover:opacity-80 disabled:opacity-40 disabled:hover:opacity-40"
              disabled={!ownLevels || applying}
              title="Make these the levels for every clip from this recording"
              onClick={apply}
            >
              {applying ? "Applying…" : "Apply to every clip"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
