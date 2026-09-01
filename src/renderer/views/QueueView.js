import React, { useState, useRef, useEffect, useMemo } from "react";
import posthog from "posthog-js";
import T from "../styles/theme";
import PLATFORM_BRAND from "../styles/platformBrand";
import { Card, PageHeader, SectionLabel, Badge, Select, InfoBanner, Checkbox, GamePill, CopyIconButton, TagInput, extractGameTag, toFileUrl } from "../components/shared";
// #329: shared with the main-process publish scheduler — see src/shared/captionResolve.js.
import { resolveTags, resolveCaption, resolveYtGameKey, getEffectiveCaption as resolveEffectiveCaption, accountToPlatformKey, getEnabledPlatforms as resolveEnabledPlatforms } from "../../shared/captionResolve";
import CaptionsView from "./CaptionsView";
import ImportReviewModal from "../components/ImportReviewModal";
import TestChip from "../components/TestChip";
import PlatformIcon from "../components/PlatformIcon";
import { localISO } from "../utils/trackerEngine";
import { TAGS_MAX, parseTags, tagsLength, tagsToText } from "../utils/ytTags";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Small stroke-style trash glyph (lucide Trash2 path) — QueueView doesn't pull
// in lucide-react, and an emoji trash renders in fixed color on dark rows.
const TrashIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

// #204: the two hover-revealed row actions. Same stroke style as TrashIcon.
const FolderIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z" />
  </svg>
);

const EditorIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M10 9.5v5l4.5-2.5Z" />
  </svg>
);

// Shared style for the hover-revealed icon buttons (Show in folder / Open in
// editor) and their wrapper. Hidden by default; the row's mouseenter flips
// opacity + pointerEvents directly, the same way it already swaps the row wash —
// no hover state, so mousing down a long queue never re-renders the list.
const ROW_ACTS_HIDDEN = { display: "flex", gap: 4, opacity: 0, pointerEvents: "none", transition: "opacity 0.15s" };
// textTertiary, not the trash's textMuted: the trash is always on screen and
// wants to recede, these two only exist while the row is hovered and have to be
// legible the moment they appear.
const rowActBtn = {
  width: 24, height: 24, flexShrink: 0, borderRadius: 6, border: "none", background: "transparent",
  color: T.textTertiary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  transition: "color 0.15s, background 0.15s",
};
const setRowActions = (e, shown) => {
  const el = e.currentTarget.querySelector("[data-rowacts]");
  if (!el) return;
  el.style.opacity = shown ? "1" : "0";
  el.style.pointerEvents = shown ? "auto" : "none";
};

// #204: reveal the render in Explorer / jump to the clip in the editor, so a
// queued clip can be watched or located without hunting for its project first.
function RowActions({ clip, onOpenInEditor }) {
  const hover = (e, on) => {
    e.currentTarget.style.color = on ? T.text : T.textTertiary;
    e.currentTarget.style.background = on ? "rgba(var(--lift),0.07)" : "transparent";
  };
  return (
    <div data-rowacts style={ROW_ACTS_HIDDEN}>
      {clip.renderPath && (
        <button
          onClick={(e) => { e.stopPropagation(); window.clipflow?.revealInFolder(clip.renderPath); }}
          title="Show the rendered video in Explorer"
          style={rowActBtn}
          onMouseEnter={(e) => hover(e, true)}
          onMouseLeave={(e) => hover(e, false)}
        ><FolderIcon /></button>
      )}
      {/* #240: imports have no editing path — a clip posts as-is or gets culled. */}
      {clip._projectId && clip.source !== "import" && onOpenInEditor && (
        <button
          onClick={(e) => { e.stopPropagation(); onOpenInEditor(clip._projectId, clip.id); }}
          title="Open this clip in the editor"
          style={rowActBtn}
          onMouseEnter={(e) => hover(e, true)}
          onMouseLeave={(e) => hover(e, false)}
        ><EditorIcon /></button>
      )}
    </div>
  );
}

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

// #229: iOS-style snapping wheel — replaces the hour/minute dropdowns on the
// schedule row (mock: tasks/mocks/queue-time-wheel.html, variant A). One
// column of values; the centered row is the selection. Controlled: external
// value changes (the auto-suggest seed) scroll the wheel, user scrolling
// calls onChange with the newly centered value.
const WHEEL_ROW_H = 26;
const WHEEL_VISIBLE = 3;

function WheelColumn({ options, value, onChange, width, isPast }) {
  const scRef = useRef(null);
  const idxRef = useRef(-1);
  const settleRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [selIdx, setSelIdx] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));

  // Seed / external value change → jump the scroller there. idxRef guards the
  // loop: a scroll the user just made already updated idxRef before onChange
  // reached the parent, so the echo of our own change never re-scrolls.
  useEffect(() => {
    const i = options.findIndex((o) => o.value === value);
    if (i >= 0 && i !== idxRef.current && scRef.current) {
      idxRef.current = i;
      setSelIdx(i);
      scRef.current.scrollTop = i * WHEEL_ROW_H;
    }
  }, [value, options]);

  // Mouse wheel = exactly one notch per tick. Native listener because React's
  // root-attached wheel handlers are passive — preventDefault would be ignored.
  useEffect(() => {
    const el = scRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const target = Math.max(0, Math.min(options.length - 1, idxRef.current + (e.deltaY > 0 ? 1 : -1)));
      el.scrollTo({ top: target * WHEEL_ROW_H, behavior: "smooth" });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [options.length]);

  const handleScroll = () => {
    const el = scRef.current;
    if (!el) return;
    const i = Math.max(0, Math.min(options.length - 1, Math.round(el.scrollTop / WHEEL_ROW_H)));
    if (i !== idxRef.current) {
      idxRef.current = i;
      setSelIdx(i);
      onChangeRef.current(options[i].value);
    }
    // Drag/momentum settle → snap the nearest row to center.
    clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      if (scRef.current) scRef.current.scrollTo({ top: idxRef.current * WHEEL_ROW_H, behavior: "smooth" });
    }, 90);
  };

  const pad = (WHEEL_ROW_H * (WHEEL_VISIBLE - 1)) / 2;
  return (
    <div style={{ position: "relative", overflow: "hidden", width, height: WHEEL_ROW_H * WHEEL_VISIBLE }}>
      <div
        ref={scRef}
        onScroll={handleScroll}
        style={{ height: "100%", overflowY: "auto", scrollSnapType: "y mandatory", scrollbarWidth: "none", paddingTop: pad, paddingBottom: pad }}
      >
        {options.map((o, i) => (
          <div
            key={o.value}
            onClick={() => scRef.current?.scrollTo({ top: i * WHEEL_ROW_H, behavior: "smooth" })}
            style={{
              height: WHEEL_ROW_H, display: "flex", alignItems: "center", justifyContent: "center",
              scrollSnapAlign: "center", fontSize: 12, cursor: "pointer", userSelect: "none", fontFamily: T.font,
              color: i === selIdx ? T.text : T.textTertiary, fontWeight: i === selIdx ? 700 : 400,
              opacity: isPast && isPast(o.value) ? 0.22 : 1, transition: "color 0.12s, opacity 0.12s",
            }}
          >
            {o.label}
          </div>
        ))}
      </div>
      {/* Center selection band */}
      <div style={{ position: "absolute", left: 2, right: 2, top: "50%", height: WHEEL_ROW_H, transform: "translateY(-50%)", borderRadius: 5, background: T.accentDim, border: `1px solid ${T.accentBorder}`, pointerEvents: "none" }} />
      {/* Fade the off-center rows into the wrap background */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `linear-gradient(to bottom, ${T.bg} 0%, transparent 32%, transparent 68%, ${T.bg} 100%)` }} />
    </div>
  );
}

function TimeWheel({ hour, min, onHour, onMin, date }) {
  // Ghost hours already behind the clock on the selected day. ":55" so an hour
  // fades only once ALL its pickable minutes are gone — matches the #228 save
  // gate, where "00" on today's date is start-of-today and long past.
  const isPastHour = (hv) => !!date && new Date(`${date}T${hv}:55:00`) <= new Date();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "0 6px" }}>
      <WheelColumn options={HOUR_OPTIONS} value={hour} onChange={onHour} width={62} isPast={isPastHour} />
      <span style={{ color: T.textTertiary, fontSize: 13, fontWeight: 700, padding: "0 1px" }}>:</span>
      <WheelColumn options={MINUTE_OPTIONS} value={min} onChange={onMin} width={44} />
    </div>
  );
}
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
    return { dayName: name, iso: localISO(x), label: `${x.toLocaleString("en-US", { month: "short" })} ${x.getDate()}` };
  });
};
const getUpcomingDates = () => {
  const d = [], n = new Date();
  for (let i = 0; i < 14; i++) {
    const x = new Date(n); x.setDate(n.getDate() + i);
    const dn = FULL_DAY_NAMES[x.getDay()];
    if (dn === "Sunday") continue;
    d.push({ label: `${dn} ${x.toLocaleString("en-US", { month: "short" })} ${x.getDate()}`, dayName: dn, iso: localISO(x) });
  }
  return d;
};

function SortableRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return children({ ref: setNodeRef, style: { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }, attributes, listeners });
}

// ── Phase 2: Per-platform control constants ──
const PLATFORM_CHAR_LIMITS = { tiktok: 2200, instagram: 2200, facebook: 63206, youtube_title: 100, youtube_desc: 5000 };
const PLATFORM_KEYS = ["tiktok", "instagram", "facebook", "youtube"];
// `bg`/`border` describe the solid brand chip; the spread adds the block dressing
// (#325) — name colour, 2px top edge, border and header wash. See platformBrand.js.
const PLATFORM_META = {
  tiktok:    { label: "TikTok",    abbr: "TT", bg: "#000",     border: "rgba(var(--lift),0.15)", ...PLATFORM_BRAND.tiktok },
  instagram: { label: "Instagram", abbr: "IG", bg: "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)", border: "none", ...PLATFORM_BRAND.instagram },
  facebook:  { label: "Facebook",  abbr: "FB", bg: "#1877f2",  border: "none", ...PLATFORM_BRAND.facebook },
  youtube:   { label: "YouTube",   abbr: "YT", bg: "#c4302b",  border: "none", ...PLATFORM_BRAND.youtube },
};

// #325: the label voice for every field inside a queue card — small, uppercase,
// wide-tracked, dim. Values carry the brightness instead. One object so a label
// can never drift back into looking like a value.
const FIELD_LABEL = { fontSize: 10, fontWeight: 800, letterSpacing: 0.7, color: T.labelStrong, textTransform: "uppercase" };

// Human-friendly labels for TikTok privacy_level enum values returned by creator_info.
// Used in the per-clip TikTok options panel dropdown.
const TIKTOK_PRIVACY_LABELS = {
  PUBLIC_TO_EVERYONE: "Public",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

// #71: A clip is "placeholder-named" if its title is the unedited "Clip N" default
// the pipeline assigned. Manual rename or AI Titles overwrite the title to something
// else and silence the warning. Strict pattern — anything past the number opts out.
const PLACEHOLDER_TITLE_RE = /^Clip \d+$/;
const isPlaceholderTitle = (title) => PLACEHOLDER_TITLE_RE.test((title || "").trim());

// #293: how many past posts the Queue's Published section holds. The Tracker tab
// keeps the full history — this is a reference shelf for copying settings forward,
// not an archive, and it must not push the actual work down the page.
const PUBLISHED_LIMIT = 20;

// #293: one field on the read-only Published card. Mirrors the queue card's
// description box minus every edit affordance — no click-to-edit, no hover border,
// no cursor:text, no Edit glyph — so it can't be mistaken for something changeable.
const ReadOnlyField = ({ label, value, multiline }) => (
  <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <div style={FIELD_LABEL}>{label}</div>
      {!!value && <CopyIconButton value={value} title={`Copy ${label.toLowerCase()}`} />}
    </div>
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, background: "rgba(var(--lift),0.03)", padding: "8px 11px", fontSize: 13, color: T.textSecondary, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: multiline ? 200 : undefined, overflowY: multiline ? "auto" : undefined }}>
      {value || <span style={{ color: T.textMuted, fontStyle: "italic" }}>Empty</span>}
    </div>
  </div>
);

// #329: resolveYtGameKey / resolveTags / resolveCaption / accountToPlatformKey now
// live in src/shared/captionResolve.js - the main-process publish scheduler builds
// the same payload with no renderer, and a second copy here would drift.

// Character count color
function charCountColor(len, max) {
  const pct = len / max;
  if (pct > 1) return T.red;
  if (pct > 0.8) return T.yellow;
  return T.textTertiary;
}

// TikTok per-clip options panel — guideline-compliant UX for Content Posting API
// audit (https://developers.tiktok.com/doc/content-sharing-guidelines/).
//
// Wave 2 scope (this revision):
//   A1 — "Posting as <nickname> (@<handle>)" header
//   A2 — privacy dropdown sourced from creator_info, no default value
//
// Later waves will add interaction toggles, commercial disclosure, etc.
function TiktokOptionsPanel({ clip, account, onSave, onCreatorInfoLoaded }) {
  const [creatorInfo, setCreatorInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch creator info on mount (and whenever the account changes).
  // `cancelled` guard prevents setState after unmount if the user closes the
  // panel mid-fetch. On success, also pushes the data up via callback so the
  // parent's publish-button gate can apply A7 (duration check) synchronously.
  useEffect(() => {
    if (!account?.key) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.clipflow?.tiktokQueryCreatorInfo({ accountId: account.key })
      .then((r) => {
        if (cancelled) return;
        if (r?.error) {
          setError(r.error);
          setCreatorInfo(null);
        } else {
          const info = r.creatorInfo || null;
          setCreatorInfo(info);
          setError(null);
          if (info && onCreatorInfoLoaded) onCreatorInfoLoaded(account.key, info);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message || "Failed to load TikTok options");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [account?.key, onCreatorInfoLoaded]);

  if (loading) {
    return (
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}`, fontSize: 11, color: T.textTertiary }}>
        Loading TikTok options…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}`, fontSize: 11, color: T.red, background: T.redDim }}>
        Couldn't load TikTok options — {error}. Publishing to TikTok is blocked until this resolves.
      </div>
    );
  }

  // A1: prefer creator_info's canonical fields (matches what TikTok's guideline
  // calls "the creator's nickname"); fall back to the stored account record if
  // for some reason the API returned an empty value.
  const nickname = creatorInfo?.creator_nickname || account.displayName || "TikTok";
  const handle = creatorInfo?.creator_username || account.name || "";

  // A2 + A5 cross-constraint: branded content can NOT be private, so SELF_ONLY
  // is filtered out of the dropdown whenever Branded Content is active. The
  // auto-clear at toggle-time handles the "already picked SELF_ONLY" case so
  // the dropdown can never display a now-invalid current value.
  const brandedActive = clip.tiktokIsBrandedContent === true;
  const rawPrivacyOptions = Array.isArray(creatorInfo?.privacy_level_options) ? creatorInfo.privacy_level_options : [];
  const privacyOptions = brandedActive ? rawPrivacyOptions.filter((o) => o !== "SELF_ONLY") : rawPrivacyOptions;

  // A2: per guideline, dropdown has NO default value — user must actively pick.
  // We surface this by border-coloring the select red until set, plus a small
  // "Required" hint adjacent to it.
  const privacySet = !!clip.tiktokPrivacy;

  // A5 state derivations
  const disclosureOn = clip.tiktokCommercialDisclosure === true;
  const yourBrandOn = clip.tiktokIsYourBrand === true;
  const subOptionPicked = yourBrandOn || brandedActive;

  // A7 — in-panel duration check. Surfaces a visible error inline so the user
  // sees the problem without having to click Publish. Parent's gate also blocks
  // publish using the same data via the onCreatorInfoLoaded callback.
  const maxDurationSec = creatorInfo?.max_video_post_duration_sec;
  const clipDurationSec = Number(clip.duration);
  const durationTooLong = !!maxDurationSec && Number.isFinite(clipDurationSec) && clipDurationSec > maxDurationSec;

  // Toggling Branded Content ON while SELF_ONLY is selected must clear the
  // privacy back to unset (forces re-pick). Other state changes don't need
  // similar handling.
  const handleBrandedContentToggle = () => {
    const next = !brandedActive;
    const partial = { tiktokIsBrandedContent: next };
    if (next && clip.tiktokPrivacy === "SELF_ONLY") partial.tiktokPrivacy = null;
    onSave(partial);
  };

  // Toggling the master disclosure OFF resets both sub-options back to false
  // so re-enabling later starts from a clean state (matches TikTok's UX where
  // unchecking the master collapses + clears the section).
  const handleDisclosureMasterToggle = () => {
    const next = !disclosureOn;
    if (next) onSave({ tiktokCommercialDisclosure: true });
    else onSave({ tiktokCommercialDisclosure: false, tiktokIsYourBrand: false, tiktokIsBrandedContent: false });
  };

  return (
    <>
      {/* A1 — Posting-as header */}
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: T.labelStrong, fontWeight: 700, letterSpacing: 0.3 }}>Posting as</span>
        <span style={{ fontSize: 13, color: T.text, fontWeight: 700 }}>{nickname}</span>
        {handle && (
          <span style={{ fontSize: 12.5, color: T.textSecondary, fontFamily: T.mono }}>@{handle}</span>
        )}
      </div>

      {/* A2 — Privacy dropdown. Uses the custom Select component instead of a
          native <select> because Chromium's default option rendering has poor
          contrast on dark backgrounds (text barely readable until hovered). */}
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: T.labelStrong, fontWeight: 700, minWidth: 50, letterSpacing: 0.3 }}>Privacy</span>
        <Select
          value={clip.tiktokPrivacy || ""}
          onChange={(value) => onSave({ tiktokPrivacy: value || null })}
          options={[
            { value: "", label: "— Select privacy —" },
            ...privacyOptions.map((opt) => ({ value: opt, label: TIKTOK_PRIVACY_LABELS[opt] || opt })),
          ]}
          style={{ minWidth: 160 }}
        />
        {!privacySet && (
          <span style={{ fontSize: 10, color: T.red, fontWeight: 700 }}>Required</span>
        )}
      </div>

      {/* A3 + A6 — Interaction toggles (Disable Duet/Stitch/Comment).
          Each toggle is a pill: OFF (transparent) = allow, ON (green) = disable.
          If creator_info reports the feature disabled at account level, the toggle
          is locked ON with reduced opacity and not-allowed cursor (A6 force-on). */}
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 11, color: T.labelStrong, fontWeight: 700, marginBottom: 7, letterSpacing: 0.3 }}>Interactions</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <TiktokInteractionToggle
            label="Disable Duet"
            userOn={clip.tiktokDisableDuet === true}
            forceOn={creatorInfo?.duet_disabled === true}
            onToggle={() => onSave({ tiktokDisableDuet: !(clip.tiktokDisableDuet === true) })}
          />
          <TiktokInteractionToggle
            label="Disable Stitch"
            userOn={clip.tiktokDisableStitch === true}
            forceOn={creatorInfo?.stitch_disabled === true}
            onToggle={() => onSave({ tiktokDisableStitch: !(clip.tiktokDisableStitch === true) })}
          />
          <TiktokInteractionToggle
            label="Disable Comment"
            userOn={clip.tiktokDisableComment === true}
            forceOn={creatorInfo?.comment_disabled === true}
            onToggle={() => onSave({ tiktokDisableComment: !(clip.tiktokDisableComment === true) })}
          />
        </div>
      </div>

      {/* A7 — Duration check. Rendered as an inline error banner inside the
          panel when the clip exceeds the account's max video duration. Publish
          gate (parent) enforces the same check at the button level. */}
      {durationTooLong && (
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.redBorder}`, background: T.redDim, fontSize: 10, color: T.red, fontWeight: 700 }}>
          This clip is {Math.round(clipDurationSec)}s — your TikTok account only allows posts up to {maxDurationSec}s. Trim the clip or use a shorter render.
        </div>
      )}

      {/* A4 — Music Usage Confirmation disclosure (with conditional Branded
          Content Policy variant per A5 rule 4/5). Verbatim wording per the
          Content Sharing Guidelines; links open in the OS default browser
          via the openExternal IPC.
          Renders ABOVE A5 (Commercial Disclosure) so the panel follows the
          guideline's Point 1→5 order (Round-2 audit fix). */}
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}`, fontSize: 12, color: T.textSecondary, lineHeight: 1.55 }}>
        By posting, you agree to TikTok&apos;s{" "}
        {brandedActive && (
          <>
            <a
              href="https://www.tiktok.com/legal/page/global/bc-policy/en"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.clipflow?.openExternal?.("https://www.tiktok.com/legal/page/global/bc-policy/en");
              }}
              style={{ color: T.accent, textDecoration: "underline", cursor: "pointer" }}
            >Branded Content Policy</a>{" and "}
          </>
        )}
        <a
          href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.clipflow?.openExternal?.("https://www.tiktok.com/legal/page/global/music-usage-confirmation/en");
          }}
          style={{ color: T.accent, textDecoration: "underline", cursor: "pointer" }}
        >Music Usage Confirmation</a>.
      </div>

      {/* A5 — Commercial Content Disclosure.
          Master toggle (OFF by default) reveals two sub-options when on.
          Conditional label shows what TikTok will visibly tag the post as.
          When the user enables this but doesn't pick a sub-option, the
          publish button is gated via getTiktokBlockReason (verbatim tooltip
          per the guideline). */}
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}` }}>
        <div
          onClick={(e) => { e.stopPropagation(); handleDisclosureMasterToggle(); }}
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        >
          <Checkbox checked={disclosureOn} size={16} />
          <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>Disclose commercial content</span>
        </div>
        {disclosureOn && (
          <div style={{ marginTop: 8, marginLeft: 24, display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Sub-option: Your Brand */}
            <div
              onClick={(e) => { e.stopPropagation(); onSave({ tiktokIsYourBrand: !yourBrandOn }); }}
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
            >
              <Checkbox checked={yourBrandOn} size={14} />
              <span style={{ fontSize: 12.5, color: T.text, fontWeight: 600 }}>Your Brand</span>
              <span style={{ fontSize: 11.5, color: T.textSecondary }}>— you&apos;re promoting yourself or your own product</span>
            </div>
            {/* Sub-option: Branded Content */}
            <div
              onClick={(e) => { e.stopPropagation(); handleBrandedContentToggle(); }}
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
            >
              <Checkbox checked={brandedActive} size={14} />
              <span style={{ fontSize: 12.5, color: T.text, fontWeight: 600 }}>Branded Content</span>
              <span style={{ fontSize: 11.5, color: T.textSecondary }}>— paid partnership with a third party</span>
            </div>
            {/* Conditional label hint or "Required" prompt */}
            {!subOptionPicked && (
              <div style={{ marginTop: 6, fontSize: 11.5, color: T.red, fontWeight: 700 }}>
                Required — pick at least one sub-option above.
              </div>
            )}
            {brandedActive && (
              <div style={{ marginTop: 6, fontSize: 11.5, color: T.textSecondary, fontStyle: "italic" }}>
                Your post will be labeled as &quot;Paid partnership&quot;.
              </div>
            )}
            {yourBrandOn && !brandedActive && (
              <div style={{ marginTop: 6, fontSize: 11.5, color: T.textSecondary, fontStyle: "italic" }}>
                Your post will be labeled as &quot;Promotional content&quot;.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// Pill-style toggle for the TikTok interaction section. Three states:
//   off:      transparent bg, grey text                 (= "allow")
//   on:       green bg + green text                     (= user-disabled)
//   force-on: green bg + reduced opacity + lock cursor  (= TikTok-disabled at account level)
//
// Force-on is non-clickable and surfaces a tooltip explaining the constraint.
function TiktokInteractionToggle({ label, userOn, forceOn, onToggle }) {
  const on = userOn || forceOn;
  const locked = forceOn;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (!locked) onToggle(); }}
      disabled={locked}
      title={locked
        ? `${label} is enforced by your TikTok account settings — change it in the TikTok app to control it here.`
        : (on ? `Click to allow this interaction on the post.` : `Click to disable this interaction on the post.`)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px",
        borderRadius: 20,
        border: `1px solid ${on ? T.green : T.border}`,
        background: on ? "rgba(74,222,128,0.12)" : "transparent",
        color: on ? T.green : T.textSecondary,
        opacity: locked ? 0.6 : 1,
        cursor: locked ? "not-allowed" : "pointer",
        fontSize: 11, fontWeight: 700, lineHeight: 1, transition: "all 0.15s", fontFamily: T.font,
      }}
    >
      {/* A6 lock indicator — icon + LOCKED kept as their own centered flex box so the
          small text shares the label's midline instead of riding above it. */}
      {locked && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, lineHeight: 1 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, lineHeight: 1 }}>LOCKED</span>
        </span>
      )}
      <span style={{ lineHeight: 1 }}>{label}</span>
    </button>
  );
}

// #329: mainGame / setTrackerData / awardXp / onScheduledPublishFailure /
// refreshOauthAccounts are gone from this list on purpose. The tracker row, its XP and
// the failure banner are all written or raised by the main process now, so the Queue no
// longer needs the setters - it reads trackerData, it does not author it.
export default function QueueView({
  allClips, localProjects, setLocalProjects, mainGameTag, platforms, trackerData,
  weeklyTemplate, weekTemplateOverrides,
  ytDescriptions, setYtDescriptions, captionTemplates, setCaptionTemplates, streamSchedule,
  platformOptions, setPlatformOptions, gamesDb, setGamesDb, streamingMode, onOpenInEditor, onCreateGame,
  focusFailedSignal, onRepostClip,
}) {
  // Mirror a successful projectUpdateClip into local React state so derived UI
  // (filters, scheduled section, override displays) updates without a tab reload.
  const updateClipInState = React.useCallback((projectId, clipId, updates) => {
    if (!setLocalProjects) return;
    setLocalProjects((prev) => prev.map((p) =>
      p.id !== projectId ? p : { ...p, clips: (p.clips || []).map((c) =>
        c.id !== clipId ? c : { ...c, ...updates })
    }));
  }, [setLocalProjects]);
  const scheduledClipIds = new Set(trackerData.map((t) => t.clipId).filter(Boolean));
  // #347: title matching is a shim for legacy tracker entries (pre-2026-03-12)
  // that recorded no clipId. Matching modern entries' titles too made any new
  // clip that reused a published title silently vanish from the queue.
  const scheduledTitles = new Set(trackerData.filter((t) => !t.clipId).map((t) => t.title).filter(Boolean));
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
      // A rendered, approved, unpublished, unscheduled clip ALWAYS shows. The
      // hashtag check belongs only to the editor's override-able send-to-queue
      // warning (EditorLayout onSendToQueue) — it must not also hide clips here,
      // and a title #hashtag is unrelated to a clip's game/"Just Chatting" tag (#139).
      .filter((c) => (c.status === "approved" || c.status === "ready")
        && !scheduledClipIds.has(c.id)
        // #240: imports dedupe by id only. The title knockout exists for legacy
        // clips that changed ids across re-renders; OpusClip-era names repeat,
        // so title-matching would silently eat sibling imports.
        // #306: a repost is deliberately the same title as the post it repeats —
        // without this exemption the title knockout would eat every repost on sight.
        // The id knockout still applies, so it leaves the queue once IT publishes.
        && (c.source === "import" || c.repostOf || !scheduledTitles.has(c.title)));
  }).sort((a, b) => (a.queueOrder ?? Infinity) - (b.queueOrder ?? Infinity) || new Date(a.createdAt) - new Date(b.createdAt));
  const isClipTest = (clip) => !!(clip && clip._projectId && projectInfo[clip._projectId]?.testMode);
  // Game pill color — the clip's real game hue (parent project first, then
  // gamesDb by tag/hashtag/name), accent as last resort. Keeps the Queue pills
  // consistent with the Projects tab instead of the old purple/green pair.
  const gameColorFor = (clip) => {
    const projColor = clip._projectId ? projectInfo[clip._projectId]?.gameColor : "";
    if (projColor) return projColor;
    const g = (gamesDb || []).find((g) =>
      (g.tag || "").toLowerCase() === clip.gameTag ||
      (g.hashtag || "").toLowerCase() === clip.gameTag ||
      (g.name || "").toLowerCase().replace(/\s+/g, "") === clip.gameTag
    );
    return g?.color || T.accent;
  };
  const mainCount = approved.filter((c) => c.gameTag === mainGameTagLc).length;
  const [selClip, setSelClip] = useState(null);
  const [schedAction, setSchedAction] = useState(null);
  const [schedDate, setSchedDate] = useState("");
  const [schedHour, setSchedHour] = useState("12");
  const [schedMin, setSchedMin] = useState("30");
  const schedTime = `${schedHour.padStart(2, "0")}:${schedMin.padStart(2, "0")}`;
  // publishStatus: { [clipId]: { state: "publishing"|"done"|"failed", platforms: { [key]: "pending"|"publishing"|"done"|"failed"|errorMsg } } }
  const [publishStatus, setPublishStatus] = useState({});
  // TikTok creator_info, cached by accountId. Populated by TiktokOptionsPanel
  // on mount (it fetches from main process); read by getTiktokBlockReason so the
  // publish gate can enforce the A7 duration check synchronously at render time.
  // If an account's info hasn't been fetched yet (panel never opened), the gate
  // skips duration validation — TikTok itself rejects too-long videos at init.
  const [tiktokCreatorInfo, setTiktokCreatorInfo] = useState({});
  const onTiktokCreatorInfoLoaded = React.useCallback((accountId, info) => {
    if (!accountId || !info) return;
    setTiktokCreatorInfo((prev) => ({ ...prev, [accountId]: info }));
  }, []);
  // Hydrate publishStatus from clip.publishState (persisted to disk) on mount and as new
  // clips appear, so failed-publish clips remain retryable across app restarts. We track
  // hydrated clipIds in a ref to avoid clobbering live in-memory state once a publish run
  // for that clip is in progress.
  const hydratedPublishRef = useRef(new Set());
  useEffect(() => {
    setPublishStatus((prev) => {
      let next = prev;
      const ensureCopy = () => { if (next === prev) next = { ...prev }; };
      for (const clip of approved) {
        const live = prev[clip.id];
        // Never disturb a clip that's mid-publish in this session.
        if (live && live.state === "publishing") { hydratedPublishRef.current.add(clip.id); continue; }
        const ps = clip.publishState;
        const isEmpty = !ps || Object.keys(ps).length === 0;
        if (isEmpty) {
          // Persisted publish history was cleared (e.g. the clip was re-queued and
          // re-rendered). Drop any stale failed/done markers so the card shows a clean
          // slate, and allow re-hydration if it's published again later.
          hydratedPublishRef.current.delete(clip.id);
          if (live) { ensureCopy(); delete next[clip.id]; }
          continue;
        }
        // Non-empty persisted state: hydrate once from disk. Live in-session state wins.
        if (hydratedPublishRef.current.has(clip.id)) continue;
        hydratedPublishRef.current.add(clip.id);
        if (live) continue;
        const platforms = {};
        let anyFailed = false;
        for (const [k, v] of Object.entries(ps)) {
          if (v === "success") platforms[k] = "done";
          else if (v && typeof v === "object" && v.error) { platforms[k] = v.error; anyFailed = true; }
        }
        ensureCopy();
        next[clip.id] = { state: anyFailed ? "failed" : "done", platforms };
      }
      return next;
    });
  }, [approved]);
  // #329: the auto-fire scheduler MOVED TO THE MAIN PROCESS (src/main/publish.js).
  //
  // It used to be a 60s tick right here, which meant scheduled clips only went out
  // while this window was open - and Chromium throttles timers on a hidden window, so
  // even minimising was a risk. Main has every input it needs (settings in the store,
  // clips on disk, tokens in the token store), keeps ticking with no renderer at all,
  // and still claims through projectClaimScheduledPublish, so there is exactly one
  // arbitration point and no double-posts.
  //
  // DO NOT reintroduce a tick here. Two schedulers racing is worse than none.
  // This view now only learns what main did: publish:clipChanged refreshes the card,
  // tracker:appended lands the row (App.js), publish:failed raises the banner.
  const [scheduled, setScheduled] = useState({});
  const publishingRef = useRef(false);
  // Per-platform publish results captured during this session's publish runs, keyed by
  // clipId → platformKey → { platform, accountId, postId?, url? }. Read by logPost so
  // tracker entries record the platforms that actually succeeded (not all connected).
  const publishResultsRef = useRef({});
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
  // #291: per-clip YouTube tags. ytTagsError holds the clipId whose last save was
  // refused for being over YouTube's 500-char budget — the editor stays open so
  // the typed list isn't thrown away.
  const [editingYtTags, setEditingYtTags] = useState(null); // clipId
  // The committed pills and the word still being typed, held apart so the
  // character counter can price both (see TagInput in components/shared).
  const [editYtTags, setEditYtTags] = useState([]);
  const [editYtTagsDraft, setEditYtTagsDraft] = useState("");
  const [ytTagsError, setYtTagsError] = useState(null); // clipId
  // Phase 3: scheduling state
  const [confirmClipId, setConfirmClipId] = useState(null); // Phase 4: publish confirmation modal
  const [confirmSchedOpts, setConfirmSchedOpts] = useState(null);
  // Phase 5: filter/sort
  const [filterGame, setFilterGame] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all"); // all, unscheduled, scheduled, published, failed, unrendered
  // #293: the Published shelf — collapsed by default, and which past clip is expanded.
  const [publishedOpen, setPublishedOpen] = useState(false);
  const [selPublished, setSelPublished] = useState(null); // clipId
  const [sortBy, setSortBy] = useState("queue"); // queue, date, game, scheduled

  // #244: banner "Review" lands on the Queue pre-filtered to failed clips.
  useEffect(() => {
    if (focusFailedSignal > 0) setFilterStatus("failed");
  }, [focusFailedSignal]);

  // ── Queue imports (#240) — bring finished pre-ClipFlow clips into the queue ──
  const [importReview, setImportReview] = useState(null); // { rows, excluded } | { error }
  const [importDragOver, setImportDragOver] = useState(false);
  // dragenter/dragleave fire for every child crossed — a depth counter is the
  // standard fix so the overlay doesn't flicker while dragging across rows.
  const importDragDepth = useRef(0);

  const startImport = async (paths) => {
    const clean = (paths || []).filter(Boolean);
    if (clean.length === 0) return;
    const res = await window.clipflow?.queueImportsInspect?.(clean);
    if (!res || res.error) { setImportReview({ error: res?.error || "Import inspection failed" }); return; }
    setImportReview({
      rows: res.rows.filter((r) => r.verdict === "ok"),
      excluded: res.rows.filter((r) => r.verdict !== "ok"),
    });
  };

  const pickImportFiles = async () => {
    const picked = await window.clipflow?.openFileDialog?.({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Videos", extensions: ["mp4", "mov"] }],
    });
    if (!picked) return;
    startImport(Array.isArray(picked) ? picked : [picked]);
  };

  const handleImportDragEnter = (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
    e.preventDefault();
    importDragDepth.current += 1;
    setImportDragOver(true);
  };
  const handleImportDragOver = (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
    e.preventDefault(); // without this the browser navigates to the file
  };
  const handleImportDragLeave = () => {
    importDragDepth.current = Math.max(0, importDragDepth.current - 1);
    if (importDragDepth.current === 0) setImportDragOver(false);
  };
  const handleImportDrop = (e) => {
    e.preventDefault();
    importDragDepth.current = 0;
    setImportDragOver(false);
    const paths = Array.from(e.dataTransfer?.files || []).map((f) => {
      try { return window.clipflow.getPathForFile(f); } catch (_) { return null; }
    }).filter(Boolean);
    startImport(paths);
  };

  // Re-read the project list after a confirm so the fresh import projects and
  // clips land in state in the same shape App.js loads at boot.
  const refreshProjectsAfterImport = async () => {
    try {
      const r = await window.clipflow?.projectList?.();
      if (r?.projects && setLocalProjects) setLocalProjects(r.projects);
    } catch (_) { /* next app launch picks them up regardless */ }
  };

  // Dequeue a clip (set status to "dequeued" so it leaves the queue but can be re-approved)
  const dequeueClip = async (clip) => {
    if (!clip._projectId) return;
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { status: "dequeued" });
      if (!r?.error) updateClipInState(clip._projectId, clip.id, { status: "dequeued" });
    } catch (e) { console.error("Dequeue failed:", e); }
  };

  // Remove-or-delete popover opened by the trash icon on queue rows. Rendered
  // at component root — NOT inside the dnd-kit rows, whose transforms would
  // re-anchor a position:fixed popover (same trap as the pre-portal Selects).
  const [deleteAsk, setDeleteAsk] = useState(null); // { clip, x, y }

  useEffect(() => {
    if (!deleteAsk) return;
    const close = () => setDeleteAsk(null);
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", onKey); };
  }, [deleteAsk]);

  // Remove from queue AND delete the rendered MP4 from disk. The clip itself
  // (and every hand edit on it) stays in the project — Queue-tab actions must
  // NEVER delete clip records (session 123 data-loss lesson).
  const removeAndDeleteRender = async (clip) => {
    if (!clip._projectId) return;
    try {
      await dequeueClip(clip);
      const r = await window.clipflow?.projectDeleteClipRender?.(clip._projectId, clip.id);
      if (r?.error) { console.error("Delete render failed:", r.error); return; }
      updateClipInState(clip._projectId, clip.id, { renderPath: null, renderStatus: "pending" });
      if (selClip === clip.id) setSelClip(null);
    } catch (e) { console.error("Delete render failed:", e); }
  };

  // Save inline title edit
  const saveTitle = async (clip) => {
    const trimmed = editTitleValue.trim();
    if (!trimmed || trimmed === clip.title || !clip._projectId) { setEditingTitle(null); return; }
    const updates = { title: trimmed };
    // Frozen custom captions/YouTube title don't auto-follow title changes — propagate the
    // old→new title text into them so they don't go stale when the clip is renamed.
    const oldTitle = (clip.title || "").trim();
    if (oldTitle) {
      if (clip.captionOverrides) {
        let changed = false;
        const newOverrides = {};
        for (const [pk, val] of Object.entries(clip.captionOverrides)) {
          if (typeof val === "string" && val.includes(oldTitle)) {
            newOverrides[pk] = val.split(oldTitle).join(trimmed);
            changed = true;
          } else {
            newOverrides[pk] = val;
          }
        }
        if (changed) updates.captionOverrides = newOverrides;
      }
      if (typeof clip.youtubeTitle === "string" && clip.youtubeTitle && clip.youtubeTitle.includes(oldTitle)) {
        updates.youtubeTitle = clip.youtubeTitle.split(oldTitle).join(trimmed);
      }
    }
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, updates);
      // #188 renames the render + thumbnail files on disk to follow the title —
      // mirror the returned paths too, or this session keeps publishing the old
      // filename ("Video file not found" on every platform).
      if (!r?.error) {
        const pathFields = r?.clip ? { renderPath: r.clip.renderPath, thumbnailPath: r.clip.thumbnailPath } : {};
        updateClipInState(clip._projectId, clip.id, { ...updates, ...pathFields });
      }
    } catch (e) { console.error("Title update failed:", e); }
    setEditingTitle(null);
  };

  // Phase 2: Toggle a platform on/off for a clip
  const togglePlatform = async (clip, platformKey) => {
    if (!clip._projectId) return;
    const current = clip.platformToggles || {};
    const updated = { ...current, [platformKey]: current[platformKey] === false ? true : false };
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { platformToggles: updated });
      if (!r?.error) updateClipInState(clip._projectId, clip.id, { platformToggles: updated });
    } catch (e) { console.error("Platform toggle failed:", e); }
  };

  // Phase 2: Save caption override for a platform. Fires on textarea blur
  // (click anywhere outside the box) — there is no Save button. A brief
  // "Saved ✓" chip next to the field label confirms the write.
  const [captionSavedFlash, setCaptionSavedFlash] = useState(null); // "clipId:platformKey"
  const captionFlashTimer = useRef(null);
  useEffect(() => () => clearTimeout(captionFlashTimer.current), []);
  const saveCaptionOverride = async (clip, platformKey, value) => {
    if (!clip._projectId) return;
    const resolved = resolveCaption(platformKey, clip, captionTemplates, ytDescriptions, gamesDb, streamSchedule);
    const current = clip.captionOverrides || {};
    // If value matches template, clear the override
    const updated = { ...current, [platformKey]: value === resolved ? undefined : value };
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { captionOverrides: updated });
      if (!r?.error) {
        updateClipInState(clip._projectId, clip.id, { captionOverrides: updated });
        setCaptionSavedFlash(`${clip.id}:${platformKey}`);
        clearTimeout(captionFlashTimer.current);
        captionFlashTimer.current = setTimeout(() => setCaptionSavedFlash(null), 1600);
      }
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
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { captionOverrides: updated });
      if (!r?.error) updateClipInState(clip._projectId, clip.id, { captionOverrides: updated });
    } catch (e) { console.error("Caption reset failed:", e); }
    setEditingCaption(null);
  };

  // Phase 2: Save YouTube title
  const saveYoutubeTitle = async (clip, value) => {
    if (!clip._projectId) return;
    const ytTitle = value.trim() || null; // null = fallback to clip.title
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { youtubeTitle: ytTitle });
      if (!r?.error) updateClipInState(clip._projectId, clip.id, { youtubeTitle: ytTitle });
    } catch (e) { console.error("YouTube title save failed:", e); }
    setEditingYtTitle(null);
  };

  // Phase 2: Save YouTube privacy
  const saveYoutubePrivacy = async (clip, value) => {
    if (!clip._projectId) return;
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { youtubePrivacy: value });
      if (!r?.error) updateClipInState(clip._projectId, clip.id, { youtubePrivacy: value });
    } catch (e) { console.error("YouTube privacy save failed:", e); }
  };

  // #291: the game's tag list for a clip, ignoring any per-clip override — the
  // value "Reset to game tags" goes back to, and what a save is compared against.
  const gameTagsFor = (clip) => resolveTags({ ...clip, youtubeTags: undefined }, ytDescriptions, gamesDb);

  // #291: save the per-clip YouTube tag list. Normalised by the same rules as the
  // Captions editor (shared ytTags util). A list identical to the game's clears the
  // override so the clip follows the game again — the trick saveCaptionOverride
  // uses for descriptions.
  const saveYoutubeTags = async (clip, value) => {
    if (!clip._projectId) return;
    const parsed = parseTags(value);
    // Over budget: refuse the write and leave the editor open with the text intact.
    // Publishing this would fail at the very end of a render, which is the worst
    // possible moment to find out.
    if (tagsLength(parsed) > TAGS_MAX) { setYtTagsError(clip.id); return; }
    const gameTags = gameTagsFor(clip);
    const matchesGame = parsed.length === gameTags.length && parsed.every((t, i) => t === gameTags[i]);
    const next = matchesGame ? null : parsed;
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { youtubeTags: next });
      if (!r?.error) {
        updateClipInState(clip._projectId, clip.id, { youtubeTags: next });
        setCaptionSavedFlash(`${clip.id}:youtube-tags`);
        clearTimeout(captionFlashTimer.current);
        captionFlashTimer.current = setTimeout(() => setCaptionSavedFlash(null), 1600);
      }
    } catch (e) { console.error("YouTube tags save failed:", e); }
    setYtTagsError(null);
    setEditingYtTags(null);
  };

  // #291: drop the per-clip list — back to whatever the game says today.
  const resetYoutubeTags = async (clip) => {
    if (!clip._projectId) return;
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { youtubeTags: null });
      if (!r?.error) updateClipInState(clip._projectId, clip.id, { youtubeTags: null });
    } catch (e) { console.error("YouTube tags reset failed:", e); }
    setYtTagsError(null);
    setEditingYtTags(null);
  };

  // TikTok Content Posting API audit: persist any subset of the per-clip TikTok
  // flat fields (tiktokPrivacy / tiktokDisable* / tiktokCommercialDisclosure /
  // tiktokIsYourBrand / tiktokIsBrandedContent). The TiktokOptionsPanel calls
  // this on each user interaction.
  const saveTiktokFields = async (clip, partial) => {
    if (!clip._projectId || !partial || typeof partial !== "object") return;
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, partial);
      if (!r?.error) updateClipInState(clip._projectId, clip.id, partial);
    } catch (e) { console.error("TikTok fields save failed:", e); }
  };

  // #329: the four settings the shared resolvers need, in the shape they expect.
  // Main reads the same four keys straight out of electron-store.
  const captionSettings = { captionTemplates, ytDescriptions, gamesDb, streamSchedule };

  // Phase 2: Get effective caption for a clip+platform (override or resolved template)
  const getEffectiveCaption = (clip, platformKey) => resolveEffectiveCaption(clip, platformKey, captionSettings);

  // Phase 2: Get which platform keys are enabled for a clip
  const getEnabledPlatforms = (clip) => resolveEnabledPlatforms(clip, activePlat);

  // TikTok Content Posting API audit: returns a human-readable reason string if
  // publishing should be blocked because the clip's TikTok options are incomplete
  // or invalid, or null if TikTok publishing is allowed (or TikTok isn't enabled).
  // Covers privacy (Wave 2), commercial-disclosure validation (Wave 5), and
  // duration check (Wave 6). Capacity (A8) is handled post-publish via error
  // translation since creator_info doesn't expose a pre-flight capacity flag.
  const getTiktokBlockReason = (clip) => {
    const enabled = getEnabledPlatforms(clip);
    if (!enabled.includes("tiktok")) return null;
    if (!clip.tiktokPrivacy) return "Pick a TikTok privacy level in the TikTok panel before publishing.";
    if (clip.tiktokCommercialDisclosure === true) {
      const youBrand = clip.tiktokIsYourBrand === true;
      const branded = clip.tiktokIsBrandedContent === true;
      // Verbatim wording from TikTok's Content Sharing Guidelines.
      if (!youBrand && !branded) {
        return "You need to indicate if your content promotes yourself, a third party, or both.";
      }
      if (branded && clip.tiktokPrivacy === "SELF_ONLY") {
        return "Branded content cannot be set to private — please choose a different privacy level.";
      }
    }
    // A7 — duration check. Skipped when creator_info hasn't been loaded yet
    // (panel not yet opened) since the value isn't available pre-flight; in
    // that case TikTok's own API rejects too-long videos at init.
    const tiktokAccount = activePlat.find((p) => accountToPlatformKey(p) === "tiktok");
    const info = tiktokAccount ? tiktokCreatorInfo[tiktokAccount.key] : null;
    const maxSec = info?.max_video_post_duration_sec;
    const clipDuration = Number(clip.duration);
    if (maxSec && Number.isFinite(clipDuration) && clipDuration > maxSec) {
      return `This clip is ${Math.round(clipDuration)}s — your TikTok account only allows posts up to ${maxSec}s.`;
    }
    return null;
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
    // #156: scheduling is an explicit "publish this (again)" instruction, so it re-arms
    // the clip by clearing publishedAt. Without this the dedup guard would permanently
    // block a deliberate repost of an already-published clip.
    const updates = { scheduledAt, publishedAt: null };
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, updates);
      if (!r?.error) updateClipInState(clip._projectId, clip.id, updates);
    } catch (e) { console.error("Schedule save failed:", e); }
    setSchedAction(null);
  };

  // Phase 3: Unschedule a clip
  const unscheduleClip = async (clip) => {
    if (!clip._projectId) return;
    try {
      const r = await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { scheduledAt: null });
      if (!r?.error) updateClipInState(clip._projectId, clip.id, { scheduledAt: null });
    } catch (e) { console.error("Unschedule failed:", e); }
  };

  // #243: every slot already claimed, keyed "YYYY-MM-DDTHH:MM" → occupant.
  // Two sources: approved clips' scheduledAt (all projects) and tracker entries
  // (auto-published and manual logs). Shared by auto-suggest and the schedule
  // picker's conflict warning.
  const getTakenSlots = () => {
    const taken = new Map();
    approved.forEach((c) => {
      if (c.scheduledAt) taken.set(c.scheduledAt.slice(0, 16), { title: c.title, kind: "scheduled" });
    });
    trackerData.forEach((t) => {
      if (t.date && t.time) {
        const m = t.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (m) {
          let h = parseInt(m[1]), min = parseInt(m[2]);
          const ap = m[3].toUpperCase();
          if (ap === "PM" && h !== 12) h += 12;
          if (ap === "AM" && h === 12) h = 0;
          const key = `${t.date}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
          if (!taken.has(key)) taken.set(key, { title: t.title || t.game, kind: "published" });
        }
      }
    });
    return taken;
  };

  // Phase 3: Auto-suggest next available time slot from weekly template
  const autoSuggestSlot = () => {
    const dates = getUpcomingDates();
    const wd = getWeekDates(new Date());
    const mondayIso = wd[0].iso;
    const tmpl = weekTemplateOverrides?.[mondayIso] || weeklyTemplate;
    if (!tmpl?.timeSlots?.length || !dates.length) return null;
    const takenSlots = getTakenSlots();
    const now = new Date();
    for (const d of dates) {
      for (const slot of tmpl.timeSlots) {
        const m = slot.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!m) continue;
        let h = parseInt(m[1]), min = parseInt(m[2]);
        const ap = m[3].toUpperCase();
        if (ap === "PM" && h !== 12) h += 12;
        if (ap === "AM" && h === 12) h = 0;
        const key = `${d.iso}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
        // #228: upcoming dates start TODAY, so today's already-passed template
        // slots kept being suggested all evening. The string parses as LOCAL time.
        if (new Date(`${key}:00`) <= now) continue;
        if (!takenSlots.has(key)) {
          return { date: d.iso, hour: String(h).padStart(2, "0"), min: String(min).padStart(2, "0"), label: `${d.label} at ${slot}` };
        }
      }
    }
    return null;
  };

  // Phase 4: Retry publishing only failed platforms for a clip
  // opts (#187): { restrictToKey } retries a single platform instead of every
  // failed one; { videoPath, qualityNote } publish a different file than the
  // clip's render (the manual Instagram 720p copy) and record which one shipped.
  // #244 layer 3: one click re-publishes every failed clip — the recovery path
  // after reconnecting a dead account. Sequential on purpose: retryFailed owns
  // publishingRef, and parallel platform uploads would fight over it.
  const [retryingAll, setRetryingAll] = useState(false);
  const retryAllFailed = async () => {
    if (retryingAll || publishingRef.current) return;
    setRetryingAll(true);
    const failedIds = approved.filter((c) => publishStatus[c.id]?.state === "failed").map((c) => c.id);
    for (const id of failedIds) {
      await retryFailed(id);
    }
    setRetryingAll(false);
  };

  const retryFailed = async (clipId, opts = {}) => {
    const clip = approved.find((c) => c.id === clipId);
    const ps = publishStatus[clipId];
    if (!clip || !ps?.platforms) return { allSuccess: false };
    // #60: Hard-block publish for test clips.
    if (isClipTest(clip)) {
      setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], state: "failed", error: "Test clip — publishing blocked. Untoggle TEST on the project first." } }));
      return { allSuccess: false };
    }
    publishingRef.current = true;
    const failedKeys = Object.entries(ps.platforms)
      .filter(([k, st]) => st !== "done" && st !== "pending" && st !== "publishing" && (!opts.restrictToKey || k === opts.restrictToKey))
      .map(([k]) => k);
    if (failedKeys.length === 0) { publishingRef.current = false; return { allSuccess: false }; }
    const publishPath = opts.videoPath || clip.renderPath;
    setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], state: "publishing" } }));
    let nextPublishState = { ...(clip.publishState || {}) };
    // #189: platform key → the resolution a post actually went out at, when it wasn't
    // the render's. Only Instagram sets it, and only via its automatic fallback.
    let nextDownscaled = { ...(clip.downscaledPosts || {}) };
    let allSuccess = true;
    // #156: same publishedAt stamp as publishClip — a retry that lands means the clip
    // has now gone out, and the scheduler must not treat it as still pending.
    let anySuccess = false;
    // #315: seeded from the clip, so a retry NEVER overwrites an existing stamp.
    // publishedAt means "first moment the audience could see this", and on a
    // partial failure that already happened — hours ago, on the platforms that
    // worked. Re-stamping it here moved the clip's whole history to the retry.
    let publishedStamped = !!clip.publishedAt;
    for (const platKey of failedKeys) {
      const plat = activePlat.find((p) => p.key === platKey);
      if (!plat) continue;
      const pk = accountToPlatformKey(plat);
      const caption = getEffectiveCaption(clip, pk);
      setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [platKey]: "publishing" } } }));
      try {
        let result;
        if (plat.platform === "TikTok" && window.clipflow?.tiktokPublish) {
          result = await window.clipflow.tiktokPublish({
            accountId: plat.key, videoPath: publishPath, title: clip.title,
            caption, clipId: clip.id,
            postMode: platformOptions?.tiktokPostMode || "direct_post",
            isTest: isClipTest(clip),
            tiktokFields: {
              privacy: clip.tiktokPrivacy || null,
              disableDuet: clip.tiktokDisableDuet === true,
              disableStitch: clip.tiktokDisableStitch === true,
              disableComment: clip.tiktokDisableComment === true,
              commercialDisclosure: clip.tiktokCommercialDisclosure === true,
              isYourBrand: clip.tiktokIsYourBrand === true,
              isBrandedContent: clip.tiktokIsBrandedContent === true,
            },
          });
        } else if ((plat.platform === "Instagram" || (plat.platform === "Meta" && plat.igAccountId)) && window.clipflow?.instagramPublish) {
          result = await window.clipflow.instagramPublish({ accountId: plat.key, videoPath: publishPath, title: clip.title, caption, clipId: clip.id, isTest: isClipTest(clip), qualityNote: opts.qualityNote || "" });
        } else if (plat.platform === "Facebook" && window.clipflow?.facebookPublish) {
          result = await window.clipflow.facebookPublish({ accountId: plat.key, videoPath: publishPath, title: clip.title, caption, clipId: clip.id, isTest: isClipTest(clip) });
        } else if (plat.platform === "YouTube" && window.clipflow?.youtubePublish) {
          result = await window.clipflow.youtubePublish({ accountId: plat.key, videoPath: publishPath, title: clip.title, caption, clipId: clip.id, tags: resolveTags(clip, ytDescriptions, gamesDb), youtubeTitle: clip.youtubeTitle || clip.title, privacyStatus: clip.youtubePrivacy || "public", isTest: isClipTest(clip) });
        }
        if (result?.error) {
          setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [platKey]: result.error } } }));
          nextPublishState[platKey] = { error: String(result.error), at: new Date().toISOString() };
          allSuccess = false;
        } else {
          setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [platKey]: "done" } } }));
          nextPublishState[platKey] = "success";
          if (result?.downscaled) nextDownscaled[platKey] = result.downscaledTo || "720p";
          anySuccess = true;
          const postId = result?.postId || result?.post_id || result?.mediaId || result?.videoId || null;
          const url = result?.url || (plat.platform === "YouTube" && result?.videoId ? `https://www.youtube.com/watch?v=${result.videoId}` : null);
          publishResultsRef.current[clip.id] = {
            ...(publishResultsRef.current[clip.id] || {}),
            [pk]: { platform: pk, accountId: plat.key, ...(postId ? { postId } : {}), ...(url ? { url } : {}) },
          };
        }
      } catch (err) {
        setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [platKey]: err.message || "Failed" } } }));
        nextPublishState[platKey] = { error: err.message || "Failed", at: new Date().toISOString() };
        allSuccess = false;
      }
      try {
        const updates = { publishState: { ...nextPublishState } };
        if (anySuccess && !publishedStamped) updates.publishedAt = new Date().toISOString();
        if (Object.keys(nextDownscaled).length) updates.downscaledPosts = { ...nextDownscaled };
        await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, updates);
        updateClipInState(clip._projectId, clip.id, updates);
        if (updates.publishedAt) publishedStamped = true;
      } catch (_) { /* non-fatal */ }
    }
    setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], state: allSuccess ? "done" : "failed" } }));
    publishingRef.current = false;
    loadPublishLogs();

    // If retry brought every enabled platform on this clip to success, the publish run
    // is now complete — log to tracker so the clip moves out of the queue.
    if (allSuccess) {
      const enabledKeys = getEnabledPlatforms(clip)
        .map((pk) => activePlat.find((p) => accountToPlatformKey(p) === pk)?.key)
        .filter(Boolean);
      const everyDone = enabledKeys.every((k) => nextPublishState[k] === "success");
      if (everyDone) logPostAtFirstSuccess(clip);
    }
    return { allSuccess };
  };

  // #187: true only when a *failed* platform is Instagram — the 720p button is
  // scoped to the one platform that needs it, and never appears pre-emptively.
  const hasFailedInstagram = (clipId) => {
    const ps = publishStatus[clipId];
    if (!ps?.platforms) return false;
    return Object.entries(ps.platforms).some(([k, st]) => {
      if (st === "done" || st === "pending" || st === "publishing") return false;
      const plat = activePlat.find((p) => p.key === k);
      return plat && (plat.platform === "Instagram" || (plat.platform === "Meta" && plat.igAccountId));
    });
  };

  // #187: manual, click-only Instagram fallback. Meta's upload endpoint can't
  // process a 1080p clip over ~55s inside its own ~35s processing timeout, and
  // resolution is the only lever that moves it (bitrate, frame rate, codec and
  // chunked upload were all measured and ruled out — see #185/#186). Renders stay
  // 1080p and full quality is always attempted first; this exists only because
  // Fega clicked it, and the lighter copy is deleted once the post lands.
  const sendInstagramLightCopy = async (clipId) => {
    const clip = approved.find((c) => c.id === clipId);
    const ps = publishStatus[clipId];
    if (!clip || !ps?.platforms || publishingRef.current) return;
    const igKey = Object.entries(ps.platforms).find(([k, st]) => {
      if (st === "done" || st === "pending" || st === "publishing") return false;
      const plat = activePlat.find((p) => p.key === k);
      return plat && (plat.platform === "Instagram" || (plat.platform === "Meta" && plat.igAccountId));
    })?.[0];
    if (!igKey) return;

    setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], state: "publishing", platforms: { ...prev[clipId].platforms, [igKey]: "publishing" } } }));
    const made = await window.clipflow?.makeLightCopy({ videoPath: clip.renderPath, shortSide: 720 });
    if (!made || made.error) {
      setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], state: "failed", platforms: { ...prev[clipId].platforms, [igKey]: made?.error || "Could not make a 720p copy" } } }));
      return;
    }
    const { allSuccess } = await retryFailed(clipId, { restrictToKey: igKey, videoPath: made.path, qualityNote: "720p copy" });
    // Keep the copy on failure so it can be inspected; it's temp either way.
    if (allSuccess) await window.clipflow?.discardLightCopy({ path: made.path });
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

  // #327: `time` is recorded VERBATIM. Manual publishes pass the real clock
  // time (logPostAtFirstSuccess), scheduled ones pass the slot the user picked
  // — both are already the truth. This used to snap to the nearest weekly-
  // template slot, which filed a 2:45 PM post as 2:30 PM; TrackerView renders
  // off-slot times as their own rows, so exact times need no snapping.
  // #329: the row itself is built and written in the MAIN process now.
  //
  // Publishing can happen with no renderer at all (streaming mode), so the tracker row
  // had to stop being a thing only this component knew how to make. Main runs the same
  // builder either way (src/shared/trackerRow.js) with the same resolvers the upload
  // just used, so a clip posted during a stream files identically to one posted here.
  //
  // It also fixes a quieter hazard: trackerData is persisted from App.js as a
  // whole-array overwrite, so a row main appended while this window was open used to be
  // erasable by our next save. Main holds appended rows pending until it sees them come
  // back, and unions in anything a save dropped - a published clip can never go missing.
  //
  // XP and the #183 training row ride along on the same call, with their #240/#306
  // fences intact. The row arrives back through the tracker:appended listener in App.js.
  const logPost = (clip, date, day, time, isScheduled) => {
    const gt = (clip.gameTag || extractGameTag(clip.title) || "unknown").toLowerCase();
    window.clipflow?.trackerRecordPublish?.({
      clip,
      captured: publishResultsRef.current[clip.id] || {},
      date, day, time, isScheduled: !!isScheduled,
      training: (clip.source !== "import" && !clip.repostOf)
        ? { clipId: clip.id, projectId: clip._projectId, game: clip.game || gt, title: clip.title || "", caption: clip.caption || "" }
        : null,
    }).catch(() => {});
    delete publishResultsRef.current[clip.id];
  };

  /**
   * Log an unscheduled publish at the moment the AUDIENCE first got the clip (#315).
   *
   * That moment is `publishedAt` — stamped on the first platform that landed and never
   * overwritten since — which on a partial failure can be hours before the run that
   * finally completed. Filing the clip under the completing run instead put a 12:30p post
   * in the 2:30p slot. When nothing had gone out before this run, the stamp IS this run,
   * so the fallback agrees with it either way.
   *
   * One helper rather than two copies: publishClip and retryFailed are the same decision
   * reached down two paths, and they drifted apart once already.
   */
  const logPostAtFirstSuccess = (clip) => {
    const stamped = clip.publishedAt ? new Date(clip.publishedAt) : null;
    const when = stamped && !isNaN(stamped.getTime()) ? stamped : new Date();
    logPost(
      clip,
      localISO(when),
      FULL_DAY_NAMES[when.getDay()],
      when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      false
    );
  };

  // Shared publish logic — handles both "Publish Now" and "Schedule" with optional publishTime
  // Phase 2: respects per-clip platformToggles, captionOverrides, youtubeTitle, youtubePrivacy
  // #244: returns { allSuccess, failures } — failures are THIS run's per-platform
  // errors only (publishState may hold older ones). The scheduler uses the return
  // to notify loudly; manual callers ignore it.
  const publishClip = async (clipId, scheduleOpts, freshClip, opts = {}) => {
    if (publishingRef.current) return;
    const clip = freshClip || approved.find((c) => c.id === clipId);
    if (!clip || !clip.renderPath) {
      const err = "Clip not rendered — render it first from the Editor";
      setPublishStatus((p) => ({ ...p, [clipId]: { state: "failed", error: err, platforms: {} } }));
      return { allSuccess: false, failures: [{ platform: "all platforms", error: err }] };
    }
    // #60: Hard-block publish for test clips.
    if (isClipTest(clip)) {
      setPublishStatus((p) => ({ ...p, [clipId]: { state: "failed", error: "Test clip — publishing blocked. Untoggle TEST on the project first.", platforms: {} } }));
      return { allSuccess: false, failures: [] };
    }

    // Phase 2: Filter platforms by per-clip toggles
    const toggles = clip.platformToggles || {};
    const enabledPlat = activePlat.filter((p) => {
      const key = accountToPlatformKey(p);
      return key && toggles[key] !== false;
    });

    if (enabledPlat.length === 0) {
      const err = "No platforms enabled — toggle at least one platform on";
      setPublishStatus((p) => ({ ...p, [clipId]: { state: "failed", error: err, platforms: {} } }));
      return { allSuccess: false, failures: [{ platform: "all platforms", error: err }] };
    }

    publishingRef.current = true;
    posthog.capture("clipflow_publish_triggered");

    // #182: publishing supersedes any pending schedule. Disarm it before uploading
    // so the auto-fire scheduler can't post this clip again at its original slot,
    // and the queue stops showing a schedule badge that will never fire. On the
    // auto-fire path the claim already cleared it on disk, but `clip` here is a
    // pre-claim render snapshot, so this re-clears redundantly — an idempotent
    // write, cheap enough not to be worth threading the live value through.
    if (clip.scheduledAt) {
      try {
        await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, { scheduledAt: null });
        updateClipInState(clip._projectId, clip.id, { scheduledAt: null });
      } catch (_) { /* non-fatal — publishedAt below is the durable dedup signal */ }
    }

    // Initialize platform statuses
    const platStatuses = {};
    enabledPlat.forEach((p) => { platStatuses[p.key] = "pending"; });
    setPublishStatus((prev) => ({ ...prev, [clipId]: { state: "publishing", platforms: { ...platStatuses } } }));
    // Keep the clip expanded so the per-platform publish results panel (and the
    // TikTok A9 "may take a few minutes" notice on success) stay visible. The
    // previous `setSelClip(null)` here auto-collapsed and hid the live status.
    setSelClip(clipId);
    setSchedAction(null);

    // Track per-platform persistence on the clip itself so failures survive app restart
    // and the clip stays visible/retryable in the queue (#retry-failed-publishes).
    let nextPublishState = { ...(clip.publishState || {}) };
    // #189: platform key → the resolution a post actually went out at, when it wasn't
    // the render's. Only Instagram sets it, and only via its automatic fallback.
    let nextDownscaled = { ...(clip.downscaledPosts || {}) };
    let allSuccess = true;
    // #244: this run's failures, for the scheduler's loud-failure path.
    const runFailures = [];
    // #156: publishedAt is the durable "already went out" marker the scheduler's claim
    // checks. Stamped on the first real success rather than after the loop, so a crash
    // mid-run still can't leave the clip eligible to auto-fire and post twice.
    let anySuccess = false;
    // #315: seeded from the clip, so a re-publish NEVER overwrites an existing stamp —
    // same rule as retryFailed. Reached when a partly-published clip is put through
    // Publish now rather than Retry: the platforms that already worked went out at the
    // original moment, and that moment is what the Tracker files the clip under.
    let publishedStamped = !!clip.publishedAt;

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
            caption, clipId: clip.id,
            postMode: platformOptions?.tiktokPostMode || "direct_post",
            isTest: isClipTest(clip),
            scheduled: opts.scheduled === true,
            tiktokFields: {
              privacy: clip.tiktokPrivacy || null,
              disableDuet: clip.tiktokDisableDuet === true,
              disableStitch: clip.tiktokDisableStitch === true,
              disableComment: clip.tiktokDisableComment === true,
              commercialDisclosure: clip.tiktokCommercialDisclosure === true,
              isYourBrand: clip.tiktokIsYourBrand === true,
              isBrandedContent: clip.tiktokIsBrandedContent === true,
            },
          });
        } else if ((plat.platform === "Instagram" || (plat.platform === "Meta" && plat.igAccountId)) && window.clipflow?.instagramPublish) {
          result = await window.clipflow.instagramPublish({
            accountId: plat.key, videoPath: clip.renderPath, title: clip.title,
            caption, clipId: clip.id, isTest: isClipTest(clip),
            scheduled: opts.scheduled === true,
          });
        } else if (plat.platform === "Facebook" && window.clipflow?.facebookPublish) {
          result = await window.clipflow.facebookPublish({
            accountId: plat.key, videoPath: clip.renderPath, title: clip.title,
            caption, clipId: clip.id, isTest: isClipTest(clip),
            scheduled: opts.scheduled === true,
          });
        } else if (plat.platform === "YouTube" && window.clipflow?.youtubePublish) {
          result = await window.clipflow.youtubePublish({
            accountId: plat.key, videoPath: clip.renderPath,
            title: clip.title, caption, clipId: clip.id, tags: resolveTags(clip, ytDescriptions, gamesDb),
            youtubeTitle: clip.youtubeTitle || clip.title,
            privacyStatus: clip.youtubePrivacy || "public",
            isTest: isClipTest(clip),
            scheduled: opts.scheduled === true,
          });
        } else {
          console.log("Publishing not yet wired for", plat.platform);
          const msg = `${plat.platform} publishing isn't supported yet`;
          setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: msg } } }));
          nextPublishState[plat.key] = { error: msg, at: new Date().toISOString() };
          runFailures.push({ platform: plat.platform, error: msg });
          allSuccess = false;
          continue;
        }

        if (result?.error) {
          console.error(`[Publish] ${plat.platform} failed for ${plat.key}:`, result.error);
          setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: result.error } } }));
          nextPublishState[plat.key] = { error: String(result.error), at: new Date().toISOString() };
          runFailures.push({ platform: plat.platform, error: String(result.error) });
          allSuccess = false;
        } else {
          console.log(`[Publish] ${plat.platform} success for ${plat.key}:`, result);
          setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: "done" } } }));
          nextPublishState[plat.key] = "success";
          if (result?.downscaled) nextDownscaled[plat.key] = result.downscaledTo || "720p";
          anySuccess = true;
          const postId = result?.postId || result?.post_id || result?.mediaId || result?.videoId || null;
          const url = result?.url || (plat.platform === "YouTube" && result?.videoId ? `https://www.youtube.com/watch?v=${result.videoId}` : null);
          publishResultsRef.current[clip.id] = {
            ...(publishResultsRef.current[clip.id] || {}),
            [platKey]: { platform: platKey, accountId: plat.key, ...(postId ? { postId } : {}), ...(url ? { url } : {}) },
          };
        }
      } catch (err) {
        console.error(`[Publish] Error for ${plat.key}:`, err);
        setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], platforms: { ...prev[clipId].platforms, [plat.key]: err.message || "Failed" } } }));
        nextPublishState[plat.key] = { error: err.message || "Failed", at: new Date().toISOString() };
        runFailures.push({ platform: plat.platform, error: err.message || "Failed" });
        allSuccess = false;
      }
      // Persist this platform's outcome on the clip after each attempt so a mid-loop
      // app close still leaves the clip in a recoverable state.
      try {
        const updates = { publishState: { ...nextPublishState } };
        if (anySuccess && !publishedStamped) updates.publishedAt = new Date().toISOString();
        if (Object.keys(nextDownscaled).length) updates.downscaledPosts = { ...nextDownscaled };
        await window.clipflow?.projectUpdateClip(clip._projectId, clip.id, updates);
        updateClipInState(clip._projectId, clip.id, updates);
        if (updates.publishedAt) publishedStamped = true;
      } catch (_) { /* non-fatal — in-memory publishStatus is the source of truth for this session */ }
    }

    // Final status
    setPublishStatus((prev) => ({ ...prev, [clipId]: { ...prev[clipId], state: allSuccess ? "done" : "failed" } }));

    // Tracker entry only on full success — partial failures must remain visible in the
    // queue so the user can retry the failed platforms (#retry-failed-publishes).
    if (allSuccess) {
      if (scheduleOpts) {
        const d = dates.find((x) => x.iso === scheduleOpts.date);
        const tl = TIME_OPTIONS.find((x) => x.value === scheduleOpts.time)?.label || scheduleOpts.time;
        setScheduled((p) => ({ ...p, [clipId]: `${d?.label || scheduleOpts.date} at ${tl}` }));
        logPost(clip, scheduleOpts.date, d?.dayName || "", tl, true);
      } else {
        logPostAtFirstSuccess(clip);
      }
    }

    publishingRef.current = false;
    setPublishProgress(null);
    loadPublishLogs(); // Refresh logs after publish
    return { allSuccess, failures: runFailures };
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
  // Unique VIDEOS published today, not platform posts — one clip pushed to 4
  // platforms writes 4 success logs but is still 1 video (matches how the
  // other three stat cards count). clipTitle is the legacy-log fallback key.
  const publishedToday = new Set(
    publishLogs
      .filter((l) => l.status === "success" && new Date(l.timestamp).toDateString() === new Date().toDateString())
      .map((l) => l.clipId || l.clipTitle || "unknown")
  ).size;
  const failedCount = approved.filter((c) => publishStatus[c.id]?.state === "failed").length;

  // #293: the published clips, newest first. `approved` deliberately excludes anything
  // the tracker knows about (see the knockout above) — that filter is exactly what makes
  // a clip disappear once it goes out. This rebuilds the other side of it: the tracker
  // entry IS the published record, joined back to the clip it came from. Nothing was
  // deleted, so the clip still carries its thumbnail, render and per-clip settings.
  // Reverse insertion order = publish order (logPost appends), which is what "recent"
  // means here — a scheduled post's `date` is the slot it was aimed at, not when it ran.
  // Capped: the tracker holds the full history, the Queue is a work surface.
  // #306: Repost — App copies the clip + its rendered file and reloads the project
  // list; the new card appearing in Unscheduled below is the confirmation. Failures
  // (missing render file, deleted project) are shown on the row that was clicked.
  const [reposting, setReposting] = useState(null);   // clipId in flight
  const [repostErr, setRepostErr] = useState(null);   // { clipId, message }
  const handleRepost = async (clip) => {
    if (reposting) return;
    setReposting(clip.id);
    setRepostErr(null);
    try {
      const res = await onRepostClip?.(clip._projectId, clip.id);
      if (res?.error) setRepostErr({ clipId: clip.id, message: res.error });
    } catch (e) {
      setRepostErr({ clipId: clip.id, message: e.message || "Repost failed" });
    } finally {
      setReposting(null);
    }
  };

  const publishedClips = useMemo(() => {
    const byId = new Map();
    for (const [projectId, clips] of Object.entries(allClips || {})) {
      for (const c of clips) byId.set(c.id, { ...c, _projectId: projectId });
    }
    const out = [];
    for (let i = trackerData.length - 1; i >= 0 && out.length < PUBLISHED_LIMIT; i--) {
      const t = trackerData[i];
      const clip = t?.clipId ? byId.get(t.clipId) : null;
      // No clip means the project was deleted since. The tracker keeps the record;
      // there is nothing here to copy settings from, so skip it.
      if (!clip) continue;
      const projGameTag = projectInfo[clip._projectId]?.gameTag || "";
      out.push({
        ...clip,
        gameTag: (clip.gameTag || "").toLowerCase() || projGameTag || extractGameTag(clip.title) || "",
        _tracker: t,
      });
    }
    return out;
  }, [trackerData, allClips, projectInfo]);

  // #324: the Captions panel follows the selected clip's game. Resolution goes
  // through resolveYtGameKey — the same match the publish path uses — so the
  // panel can never show a different game's description than the one that would
  // actually go out. `name` prefers the ytDescriptions key that exists today and
  // falls back to the gamesDb display name, which is how a game with no
  // description yet still gets a scoped (empty) panel instead of a dead one.
  const scopeGame = useMemo(() => {
    if (!selClip) return null;
    const clip = approved.find((c) => c.id === selClip) || publishedClips.find((c) => c.id === selClip);
    if (!clip) return null;
    const { gameTag, game, key } = resolveYtGameKey(clip, ytDescriptions, gamesDb);
    const name = key || game?.name || null;
    if (!name) return null;
    const tag = (game?.tag || gameTag || name).toUpperCase();
    return { name, tag, color: gameColorFor(clip) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selClip, approved, publishedClips, ytDescriptions, gamesDb, projectInfo]);

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
  // #293: the published section takes the game filter but not the status filter —
  // "published" IS its status. filterClips is left alone so the existing chip keeps
  // surfacing the odd clip that published but never got a tracker entry (a partial
  // failure, or a tracker row deleted by hand); that clip stays in the lists above.
  const filteredPublished = filterGame === "all" ? publishedClips : publishedClips.filter((c) => c.gameTag === filterGame);
  const showPublished = filterStatus === "all" || filterStatus === "published";

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
    // "Not rendered" outranks the schedule date (#346): a scheduled clip with no
    // video can't publish, and the merged schedule/status cell already shows the
    // date — the pill's job there is to say what the date can't.
    if (!hasVideo) return { label: "Not rendered", bg: "rgba(251,191,36,0.1)", color: T.yellow };
    if (clip.scheduledAt) {
      const d = new Date(clip.scheduledAt);
      const label = `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
      return { label, bg: "rgba(251,191,36,0.1)", color: T.yellow };
    }
    return { label: "Queued", bg: T.accentDim, color: T.accentLight };
  };

  // Format scheduledAt for display
  const formatSchedule = (isoStr) => {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  };

  return (
    <div onDragEnter={handleImportDragEnter} onDragOver={handleImportDragOver} onDragLeave={handleImportDragLeave} onDrop={handleImportDrop}>
      <PageHeader title="Queue & Schedule" subtitle={`${approved.length} clips ready`} style={{ marginBottom: 18 }}>
        {/* #329: "I am about to stream" - drop the UI now rather than hunting for the
            window close. Only offered when the setting is on, because with it off this
            would just quit the app. */}
        {streamingMode && (
          <button
            onClick={() => window.clipflow?.streamingEnter?.()}
            title="Close the window and keep publishing in the background. Corva stays in the system tray."
            style={{
              padding: "9px 16px", borderRadius: 8, cursor: "pointer",
              background: "rgba(var(--lift),0.06)", border: `1px solid ${T.border}`,
              color: T.textSecondary, fontSize: 12, fontWeight: 700, fontFamily: T.font,
            }}
          >
            Go quiet for streaming
          </button>
        )}
      </PageHeader>

      {/* #240: drop-anywhere import target. pointerEvents:none keeps the
          overlay from stealing the drop — the root div handles it. */}
      {importDragOver && (
        <div style={{ position: "fixed", inset: 12, zIndex: 9998, borderRadius: 14, background: "rgba(139,92,246,0.08)", border: `2px dashed ${T.accent}`, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ background: T.surface, border: `1px solid ${T.accentBorder}`, borderRadius: 10, padding: "14px 22px", fontSize: 14, fontWeight: 700, color: T.accentLight }}>
            Drop videos to import into the queue
          </div>
        </div>
      )}

      {/* #240: review grid — nothing is copied or queued until Confirm */}
      {importReview && !importReview.error && (
        <ImportReviewModal
          initialRows={importReview.rows}
          excluded={importReview.excluded}
          gamesDb={gamesDb}
          onCreateGame={onCreateGame}
          onClose={() => setImportReview(null)}
          onDone={async (res) => {
            await refreshProjectsAfterImport();
            if (!res?.partial) setImportReview(null);
          }}
        />
      )}
      {importReview?.error && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(var(--shade),calc(0.7 * var(--shadeK)))", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setImportReview(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 24px", maxWidth: 440 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 8 }}>Can't import yet</div>
            <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.5, marginBottom: 14 }}>{importReview.error}</div>
            <div style={{ textAlign: "right" }}>
              <button onClick={() => setImportReview(null)} style={{ padding: "7px 16px", borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* #324: queue on the left, Captions & Descriptions pinned on the right.
          `minmax(0,1fr)` (not `1fr`) is load-bearing — the queue rows are full of
          nowrap/ellipsis text that would otherwise push the track wider than the
          window and shove the panel off-screen. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 440px", gap: 18, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>

      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <Card style={{ padding: "10px 14px" }}>
          <SectionLabel>Unscheduled</SectionLabel>
          <div style={{ color: T.accentLight, fontSize: 22, fontWeight: 800, fontFamily: T.mono, marginTop: 2 }}>{unscheduledClips.length}</div>
        </Card>
        <Card style={{ padding: "10px 14px" }}>
          <SectionLabel>Scheduled</SectionLabel>
          <div style={{ color: T.yellow, fontSize: 22, fontWeight: 800, fontFamily: T.mono, marginTop: 2 }}>{scheduledClips.length}</div>
        </Card>
        <Card style={{ padding: "10px 14px" }}>
          <SectionLabel>Published Today</SectionLabel>
          <div style={{ color: T.green, fontSize: 22, fontWeight: 800, fontFamily: T.mono, marginTop: 2 }}>{publishedToday}</div>
        </Card>
        <Card style={{ padding: "10px 14px" }}>
          <SectionLabel>Failed</SectionLabel>
          <div style={{ color: T.red, fontSize: 22, fontWeight: 800, fontFamily: T.mono, marginTop: 2 }}>{failedCount}</div>
        </Card>
      </div>

      {/* Phase 5: Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
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
        {/* #244 layer 3: one-click recovery after reconnecting a dead account */}
        {failedCount > 0 && (
          <button
            onClick={retryAllFailed}
            disabled={retryingAll}
            style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 7, border: `1px solid ${T.redBorder}`, background: T.redDim, color: T.red, fontSize: 11, fontWeight: 700, cursor: retryingAll ? "default" : "pointer", fontFamily: T.font, opacity: retryingAll ? 0.6 : 1 }}
          >
            {retryingAll ? "Retrying…" : `Retry all failed (${failedCount})`}
          </button>
        )}
      </div>

      {/* Phase 4: Publish confirmation modal */}
      {confirmClipId && (() => {
        const clip = approved.find((c) => c.id === confirmClipId);
        if (!clip) return null;
        const enabledKeys = getEnabledPlatforms(clip);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(var(--shade),calc(0.7 * var(--shadeK)))", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={cancelConfirm}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "24px 28px", maxWidth: 480, width: "90%", maxHeight: "80vh", overflow: "auto" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 16 }}>Confirm Publish</div>
              {/* Clip summary */}
              <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
                <div style={{ width: 60, flexShrink: 0 }}>
                  <div style={{ aspectRatio: "9/16", borderRadius: 8, overflow: "hidden", background: "rgba(var(--lift),0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {clip.thumbnailPath ? <img src={toFileUrl(clip.thumbnailPath)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: T.textMuted, fontSize: 20 }}>{"\uD83C\uDFAC"}</span>}
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
                    <div key={pk} style={{ borderRadius: 6, border: `1px solid ${T.border}`, padding: "8px 12px", background: "rgba(var(--lift),0.02)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <PlatformIcon platform={pk} size={14} />
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
                  style={{ padding: "8px 22px", borderRadius: 7, border: "none", background: isClipTest(clip) ? "rgba(var(--lift),0.04)" : T.green, color: isClipTest(clip) ? T.textMuted : T.onSolid, fontSize: 12, fontWeight: 700, cursor: isClipTest(clip) ? "not-allowed" : "pointer", fontFamily: T.font }}
                >{isClipTest(clip) ? "Blocked (Test)" : "Publish"}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Remove-or-delete popover (trash icon on queue rows). Fixed-position at
          component root, above the portaled Select menus (zIndex 10000). */}
      {deleteAsk && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", left: deleteAsk.x, top: deleteAsk.y, zIndex: 10001, width: 240, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(var(--shade),calc(0.55 * var(--shadeK)))", padding: 6, fontFamily: T.font }}
        >
          <button
            onClick={() => { dequeueClip(deleteAsk.clip); setDeleteAsk(null); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: T.font }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(var(--lift),0.05)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Remove from queue</div>
            <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 2 }}>
              {deleteAsk.clip.source === "import"
                ? "The imported copy stays in ClipFlow Imports; it won't be offered for import again."
                : "Clip and files stay — re-queue it from the editor anytime."}
            </div>
          </button>
          <button
            onClick={() => { removeAndDeleteRender(deleteAsk.clip); setDeleteAsk(null); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: T.font }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.10)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: T.red }}>{deleteAsk.clip.source === "import" ? "Remove + delete imported copy" : "Remove + delete rendered video"}</div>
            <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 2 }}>
              {deleteAsk.clip.source === "import"
                ? "Takes it off the queue and deletes the copy in ClipFlow Imports. Your original file is never touched."
                : "Takes it off the queue and deletes the rendered MP4 from disk. The clip and your edits stay in Projects."}
            </div>
          </button>
        </div>
      )}

      {/* Dashboard table — Phase 3: split into Unscheduled / Scheduled sections */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={clipIds} strategy={verticalListSortingStrategy}>

      {/* UNSCHEDULED SECTION */}
      {showUnscheduled && (
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
        {/* Section header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(var(--lift),0.02)", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.accentLight }}>Unscheduled</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted }}>{filteredUnscheduled.length} clip{filteredUnscheduled.length !== 1 ? "s" : ""}</span>
          </div>
          {/* #240: entry point for finished clips made outside ClipFlow */}
          <button
            onClick={pickImportFiles}
            title="Import finished vertical clips made outside Corva — they become schedulable queue entries. You can also drag files anywhere onto this tab."
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 7, border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5" /><path d="m5 12 7-7 7 7" />
            </svg>
            Import clips
          </button>
        </div>
        {/* Table header */}
        <div style={{ display: "grid", gridTemplateColumns: "28px 48px 1fr 70px 110px 84px 150px", gap: 0, padding: "8px 14px", borderBottom: `1px solid ${T.border}` }}>
          {["", "Clip", "Title", "Game", "Platforms", "Status", ""].map((h, i) => (
            <span key={i} style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.textMuted }}>{h}</span>
          ))}
        </div>

        {filteredUnscheduled.length === 0 && (
          <div style={{ padding: 30, textAlign: "center" }}>
            <div style={{ color: T.textTertiary, fontSize: 13 }}>{approved.length === 0 ? "No clips queued — approve clips in the Projects tab, or drop finished videos here to import them." : "No unscheduled clips matching filter."}</div>
          </div>
        )}

        {filteredUnscheduled.map((clip) => {
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
          // Game-hue row wash — same recipe as the Projects launch-pad rows.
          const gc = gameColorFor(clip);
          const rowBg = `radial-gradient(90% 160% at 100% 0%, ${gc}1f 0%, transparent 55%), linear-gradient(100deg, ${gc}1a 0%, ${gc}06 40%, rgba(var(--lift),0.02) 65%)`;
          const rowBgHover = `linear-gradient(rgba(var(--lift),0.025), rgba(var(--lift),0.025)), ${rowBg}`;
          // Selected keeps the game hue (stronger wash) instead of snapping to
          // the purple accent; the expanded settings panel stays neutral.
          const rowBgSel = `radial-gradient(90% 160% at 100% 0%, ${gc}33 0%, transparent 55%), linear-gradient(100deg, ${gc}2b 0%, ${gc}0d 40%, rgba(var(--lift),0.03) 65%)`;

          return (
            <SortableRow key={clip.id} id={clip.id}>
              {({ ref, style: sortStyle, attributes, listeners }) => (
                <div ref={ref} style={sortStyle} {...attributes}>
                  {/* Table row */}
                  <div
                    onClick={() => { if (!isPublishing) { setSelClip(isSel ? null : clip.id); setSchedAction(null); } }}
                    style={{ display: "grid", gridTemplateColumns: "28px 48px 1fr 70px 110px 84px 150px", gap: 0, padding: "7px 14px", alignItems: "center", borderBottom: `1px solid ${T.border}`, cursor: "pointer", background: isSel ? rowBgSel : rowBg, transition: "background 0.15s", opacity: isPub ? 0.6 : 1 }}
                    onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = rowBgHover; setRowActions(e, true); }}
                    onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = rowBg; setRowActions(e, false); }}
                  >
                    {/* Drag handle */}
                    <div {...listeners} onClick={(e) => e.stopPropagation()} style={{ cursor: "grab", color: T.textMuted, fontSize: 14 }}>{"\u2630"}</div>
                    {/* Thumbnail */}
                    <div style={{ width: 28, height: 50, borderRadius: 6, overflow: "hidden", background: "rgba(var(--lift),0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {clip.thumbnailPath ? (
                        <img src={toFileUrl(clip.thumbnailPath)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span style={{ color: T.textMuted, fontSize: 16 }}>{"\uD83C\uDFAC"}</span>
                      )}
                    </div>
                    {/* Title + sub */}
                    <div style={{ minWidth: 0, paddingRight: 8 }}>
                      <div style={{ color: T.text, fontSize: 13, fontWeight: 700, letterSpacing: "-0.1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clip.title}</div>
                      <div style={{ color: T.textTertiary, fontSize: 10, marginTop: 2 }}>{durationStr}{projName ? ` \u00B7 ${projName}` : ""}</div>
                    </div>
                    {/* Game tag */}
                    <div>{gameTag && <GamePill tag={(gameTag.length > 6 ? gameTag.slice(0, 6) : gameTag).toUpperCase()} color={gameColorFor(clip)} size="sm" variant="solid" />}</div>
                    {/* Platform icons — dimmed if toggled off */}
                    <div style={{ display: "flex", gap: 3 }}>
                      {activePlat.map((p) => {
                        const pk = accountToPlatformKey(p);
                        const isOn = pk && (clip.platformToggles || {})[pk] !== false;
                        return (
                          <PlatformIcon key={p.key} platform={pk} size={20} style={{ opacity: isOn ? 1 : 0.25, transition: "opacity 0.15s" }} />
                        );
                      })}
                    </div>
                    {/* Status */}
                    <div><span style={{ padding: "3px 9px", borderRadius: 20, fontSize: 9, fontWeight: 700, background: badge.bg, color: badge.color, whiteSpace: "nowrap" }}>{badge.label}</span></div>
                    {/* Action buttons */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                      <RowActions clip={clip} onOpenInEditor={onOpenInEditor} />
                      {!isPub && !isPublishing && hasVideoId && (
                        isClipTest(clip) ? (
                          <TestChip isTest disabled size="sm" title="Test clip — publishing blocked. Untoggle TEST on the project to go live." />
                        ) : (() => {
                          const tikBlock = getTiktokBlockReason(clip);
                          return (
                            <button
                              onClick={(e) => { e.stopPropagation(); if (!tikBlock) pubNow(clip.id); }}
                              disabled={!!tikBlock}
                              title={tikBlock || undefined}
                              style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: tikBlock ? "rgba(var(--lift),0.04)" : T.green, color: tikBlock ? T.textMuted : T.onSolid, fontSize: 10, fontWeight: 700, cursor: tikBlock ? "not-allowed" : "pointer", fontFamily: T.font }}
                            >Publish</button>
                          );
                        })()
                      )}
                      {!isPublishing && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteAsk({ clip, x: Math.min(e.clientX, window.innerWidth - 260), y: Math.min(e.clientY, window.innerHeight - 160) }); }}
                          title="Remove from queue / delete clip"
                          style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 6, border: "none", background: "transparent", color: T.textMuted, opacity: 0.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = T.red; e.currentTarget.style.background = "rgba(239,68,68,0.12)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.color = T.textMuted; e.currentTarget.style.background = "transparent"; }}
                        ><TrashIcon /></button>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isSel && (
                    <div style={{ padding: "20px 24px", background: "rgba(var(--lift),0.02)", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", gap: 24 }}>
                        {/* Large thumbnail */}
                        <div style={{ width: 120, flexShrink: 0 }}>
                          <div style={{ aspectRatio: "9/16", borderRadius: 10, overflow: "hidden", background: "rgba(var(--lift),0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {clip.thumbnailPath ? (
                              <img src={toFileUrl(clip.thumbnailPath)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                              style={{ width: "100%", background: "rgba(var(--lift),0.06)", border: `1px solid ${T.accentBorder}`, borderRadius: 6, padding: "6px 10px", color: T.text, fontSize: 20, fontWeight: 800, letterSpacing: "-0.45px", fontFamily: T.font, outline: "none", marginBottom: 8 }}
                            />
                          ) : (
                            <div
                              onDoubleClick={() => { setEditingTitle(clip.id); setEditTitleValue(clip.title); }}
                              style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}
                            >
                              {/* #325: the clip title is the loudest thing on the card. */}
                              <span style={{ color: T.text, fontSize: 20, fontWeight: 800, letterSpacing: "-0.45px", cursor: "text", lineHeight: 1.2 }} title="Double-click to edit">{clip.title}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingTitle(clip.id); setEditTitleValue(clip.title); }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = T.text; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = T.textTertiary; }}
                                title="Edit title"
                                style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 3, border: "none", background: "transparent", color: T.textTertiary, cursor: "pointer", transition: "color 0.15s" }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                              </button>
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 10, fontSize: 12, color: T.textSecondary, marginBottom: 14, alignItems: "center" }}>
                            <span style={{ fontFamily: T.mono, fontWeight: 700, color: T.labelStrong }}>{durationStr}</span>
                            {gameTag && <GamePill tag={gameTag.toUpperCase()} color={gameColorFor(clip)} variant="solid" />}
                            {projName && <span>{projName}</span>}
                          </div>

                          {/* Phase 2: Platform toggle pills */}
                          <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ ...FIELD_LABEL, color: T.textTertiary, marginRight: 3 }}>Platforms</span>
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
                                    borderRadius: 20, border: `1px solid ${isOn ? "rgba(var(--lift),0.12)" : T.border}`,
                                    background: isOn ? "rgba(var(--lift),0.06)" : "transparent",
                                    opacity: isOn ? 1 : 0.4, cursor: "pointer", transition: "all 0.15s", fontFamily: T.font,
                                  }}
                                >
                                  <PlatformIcon platform={pk} size={18} />
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

                                  // #325: brand identity comes from the header wash, the block's
                                  // border and a 2px top edge — deliberately not a left-edge colour bar.
                                  return (
                                    <div key={pk} style={{ borderRadius: 8, border: `1px solid ${meta.edge}`, boxShadow: `inset 0 2px 0 ${meta.bar}`, background: "rgba(var(--lift),0.02)", overflow: "hidden" }}>
                                      {/* Caption card header */}
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${T.border}`, background: meta.band }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                          <PlatformIcon platform={pk} size={16} />
                                          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: -0.1, color: meta.accent }}>{meta.label}</span>
                                          {hasOverride && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: T.accent, background: T.accentDim, padding: "1px 7px", borderRadius: 5 }}>CUSTOM</span>}
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: T.mono, color: charCountColor(caption.length, charLimit) }}>
                                          {caption.length}/{charLimit}
                                        </span>
                                      </div>

                                      {/* YouTube: separate title field */}
                                      {isYt && (
                                        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                                          <span style={{ ...FIELD_LABEL, minWidth: 52, flexShrink: 0 }}>Title</span>
                                          {isEditingYtTitleThis ? (
                                            <input
                                              autoFocus
                                              value={editYtTitleValue}
                                              onChange={(e) => setEditYtTitleValue(e.target.value)}
                                              onBlur={() => saveYoutubeTitle(clip, editYtTitleValue)}
                                              onKeyDown={(e) => { if (e.key === "Enter") saveYoutubeTitle(clip, editYtTitleValue); if (e.key === "Escape") setEditingYtTitle(null); }}
                                              maxLength={100}
                                              style={{ flex: 1, background: "rgba(var(--lift),0.06)", border: `1px solid ${T.accentBorder}`, borderRadius: 4, padding: "4px 8px", color: T.text, fontSize: 11, fontFamily: T.font, outline: "none" }}
                                            />
                                          ) : (
                                            <div
                                              onClick={(e) => { e.stopPropagation(); setEditingYtTitle(clip.id); setEditYtTitleValue(ytTitleVal); }}
                                              style={{ flex: 1, fontSize: 12.5, color: T.text, cursor: "text", padding: "4px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                            >{ytTitleVal}</div>
                                          )}
                                          <span style={{ fontSize: 10, fontFamily: T.mono, color: charCountColor(ytTitleVal.length, PLATFORM_CHAR_LIMITS.youtube_title) }}>{ytTitleVal.length}/100</span>
                                        </div>
                                      )}

                                      {/* YouTube: privacy selector */}
                                      {isYt && (
                                        <div style={{ padding: "6px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                                          <span style={{ ...FIELD_LABEL, minWidth: 52, flexShrink: 0 }}>Privacy</span>
                                          {/* Custom Select (not native <select>) — Chromium's native
                                              option popup renders near-unreadable on the dark theme,
                                              same reason the TikTok privacy picker uses it. */}
                                          <div onClick={(e) => e.stopPropagation()}>
                                            <Select
                                              value={clip.youtubePrivacy || "public"}
                                              onChange={(value) => saveYoutubePrivacy(clip, value)}
                                              options={[
                                                { value: "public", label: "Public" },
                                                { value: "unlisted", label: "Unlisted" },
                                                { value: "private", label: "Private" },
                                              ]}
                                              style={{ padding: 0, fontSize: 11, minWidth: 110 }}
                                            />
                                          </div>
                                        </div>
                                      )}

                                      {/* Caption body — rendered ABOVE the platform-specific
                                          options so it sits near the top of the card (close to the
                                          title), and styled as a clearly editable field. */}
                                      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}` }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                          <div style={FIELD_LABEL}>{isYt ? "Description" : "Caption"}</div>
                                          {captionSavedFlash === `${clip.id}:${pk}` && (
                                            <span style={{ fontSize: 10.5, fontWeight: 700, color: T.green, display: "inline-flex", alignItems: "center", gap: 3 }}>
                                              <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.green, boxShadow: `0 0 6px ${T.green}`, display: "inline-block" }} />
                                              Saved
                                            </span>
                                          )}
                                        </div>
                                        {isEditingThis ? (
                                          <textarea
                                            autoFocus
                                            // Open at content height (≥120px, matching the read view)
                                            // and auto-grow while typing — never the old 2-line box.
                                            // dataset.sized guards the inline ref re-running on every
                                            // keystroke render so a manual drag-resize isn't undone.
                                            ref={(el) => {
                                              if (el && !el.dataset.sized) {
                                                el.dataset.sized = "1";
                                                el.style.height = Math.max(120, el.scrollHeight + 2) + "px";
                                              }
                                            }}
                                            value={editCaptionValue}
                                            onChange={(e) => {
                                              setEditCaptionValue(e.target.value);
                                              const el = e.target;
                                              if (el.scrollHeight > el.clientHeight) el.style.height = Math.max(120, el.scrollHeight + 2) + "px";
                                            }}
                                            onKeyDown={(e) => { if (e.key === "Escape") setEditingCaption(null); }}
                                            // Click anywhere outside the box = save. Escape unmounts the
                                            // textarea without firing blur, so it still cancels cleanly.
                                            onBlur={() => saveCaptionOverride(clip, pk, editCaptionValue)}
                                            style={{ width: "100%", minHeight: 120, background: "rgba(var(--lift),0.06)", border: `1px solid ${T.accentBorder}`, borderRadius: 8, padding: "8px 10px", color: T.text, fontSize: 13, fontFamily: T.font, outline: "none", resize: "vertical", lineHeight: 1.55 }}
                                          />
                                        ) : (
                                          <div
                                            onClick={(e) => { e.stopPropagation(); setEditingCaption({ clipId: clip.id, platform: pk }); setEditCaptionValue(caption); }}
                                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.accentBorder; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.borderHover; }}
                                            style={{ position: "relative", border: `1px solid ${T.borderHover}`, borderRadius: 8, background: "rgba(var(--lift),0.045)", padding: "10px 54px 10px 12px", fontSize: 13, color: T.text, lineHeight: 1.55, cursor: "text", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "hidden", transition: "border-color 0.15s" }}
                                            title="Click to edit"
                                          >
                                            {caption || <span style={{ color: T.textMuted, fontStyle: "italic" }}>No caption — click to add</span>}
                                            <span style={{ position: "absolute", top: 8, right: 10, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: T.textTertiary, pointerEvents: "none" }}>
                                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
                                                <path d="M12 20h9" />
                                                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                              </svg>
                                              Edit
                                            </span>
                                          </div>
                                        )}
                                        {/* Char count + cancel — saving happens on click-outside (textarea blur).
                                            Cancel uses onMouseDown + preventDefault so it runs BEFORE the
                                            textarea's blur would save; Escape does the same from the keyboard. */}
                                        {isEditingThis && (
                                          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                                            <span style={{ fontSize: 11, fontFamily: T.mono, color: charCountColor(editCaptionValue.length, charLimit) }}>{editCaptionValue.length}/{charLimit}</span>
                                            <span style={{ fontSize: 10.5, color: T.textTertiary }}>click outside to save</span>
                                            <div style={{ flex: 1 }} />
                                            <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setEditingCaption(null); }} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                                          </div>
                                        )}
                                        {!isEditingThis && hasOverride && (
                                          <div style={{ marginTop: 8 }}>
                                            <button onClick={(e) => { e.stopPropagation(); resetCaptionOverride(clip, pk); }} style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary, fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Reset to template</button>
                                          </div>
                                        )}
                                      </div>

                                      {/* #291: YouTube tags — under the description, not above it.
                                          Reads through to the game's list (Captions & Descriptions)
                                          until this clip is given its own. */}
                                      {isYt && (() => {
                                        const tags = resolveTags(clip, ytDescriptions, gamesDb);
                                        const hasTagOverride = Array.isArray(clip.youtubeTags);
                                        const isEditingTags = editingYtTags === clip.id;
                                        // Price the half-typed word too, so the counter can't read under
                                        // budget on a list that is about to be refused.
                                        const shown = isEditingTags ? parseTags([...editYtTags, editYtTagsDraft].join(",")) : tags;
                                        const len = tagsLength(shown);
                                        const over = len > TAGS_MAX;
                                        const refused = ytTagsError === clip.id;
                                        return (
                                          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}` }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                              <div style={FIELD_LABEL}>Tags</div>
                                              {tags.length > 0 && !isEditingTags && <CopyIconButton value={tagsToText(tags)} title="Copy tags" />}
                                              {hasTagOverride && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: T.accent, background: T.accentDim, padding: "1px 7px", borderRadius: 5 }}>CUSTOM</span>}
                                              {captionSavedFlash === `${clip.id}:youtube-tags` && (
                                                <span style={{ fontSize: 10.5, fontWeight: 700, color: T.green, display: "inline-flex", alignItems: "center", gap: 3 }}>
                                                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.green, boxShadow: `0 0 6px ${T.green}`, display: "inline-block" }} />
                                                  Saved
                                                </span>
                                              )}
                                              <div style={{ flex: 1 }} />
                                              <span style={{ fontSize: 10, fontFamily: T.mono, color: over ? T.red : T.textTertiary }}>{len}/{TAGS_MAX}</span>
                                            </div>
                                            {isEditingTags ? (
                                              <TagInput
                                                autoFocus
                                                tags={editYtTags}
                                                draft={editYtTagsDraft}
                                                invalid={over}
                                                placeholder="rocket league, rocket league clips, gaming shorts"
                                                onChange={(next, d) => { setEditYtTags(next); setEditYtTagsDraft(d); }}
                                                onEscape={() => { setEditingYtTags(null); setYtTagsError(null); }}
                                                // Saved from the argument, not from state: the click that
                                                // leaves the field commits the last word in the same event.
                                                onCommitBlur={(finalTags) => saveYoutubeTags(clip, tagsToText(finalTags))}
                                              />
                                            ) : (
                                              <div
                                                onClick={(e) => { e.stopPropagation(); setYtTagsError(null); setEditingYtTags(clip.id); setEditYtTags(tags); setEditYtTagsDraft(""); }}
                                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.accentBorder; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.borderHover; }}
                                                style={{ position: "relative", border: `1px solid ${T.borderHover}`, borderRadius: 8, background: "rgba(var(--lift),0.045)", padding: "8px 54px 8px 10px", minHeight: 20, cursor: "text", display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", transition: "border-color 0.15s" }}
                                                title="Click to edit"
                                              >
                                                {tags.length === 0 ? (
                                                  <span style={{ fontSize: 12.5, color: T.textMuted, fontStyle: "italic" }}>No tags — click to add</span>
                                                ) : tags.map((t) => (
                                                  <span key={t} style={{ fontSize: 11.5, color: T.textSecondary, background: "rgba(var(--lift),0.05)", border: `1px solid ${T.border}`, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" }}>{t}</span>
                                                ))}
                                                <span style={{ position: "absolute", top: 7, right: 10, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: T.textTertiary, pointerEvents: "none" }}>
                                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
                                                    <path d="M12 20h9" />
                                                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                                  </svg>
                                                  Edit
                                                </span>
                                              </div>
                                            )}
                                            {isEditingTags && (
                                              <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                                                <span style={{ fontSize: 10.5, color: over ? T.red : T.textTertiary }}>
                                                  {over
                                                    ? `Over YouTube's ${TAGS_MAX}-character limit by ${len - TAGS_MAX}${refused ? " — not saved" : ""}. Shorten the list.`
                                                    : "Comma or Enter adds a tag · click outside to save"}
                                                </span>
                                                <div style={{ flex: 1 }} />
                                                <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setEditingYtTags(null); setYtTagsError(null); }} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                                              </div>
                                            )}
                                            {!isEditingTags && hasTagOverride && (
                                              <div style={{ marginTop: 8 }}>
                                                <button onClick={(e) => { e.stopPropagation(); resetYoutubeTags(clip); }} style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textSecondary, fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Reset to game tags</button>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}

                                      {/* TikTok: per-clip options panel (Content Posting API audit) */}
                                      {pk === "tiktok" && (() => {
                                        const tiktokAccount = activePlat.find((p) => accountToPlatformKey(p) === "tiktok");
                                        if (!tiktokAccount) return null;
                                        return (
                                          <TiktokOptionsPanel
                                            clip={clip}
                                            account={tiktokAccount}
                                            onSave={(partial) => saveTiktokFields(clip, partial)}
                                            onCreatorInfoLoaded={onTiktokCreatorInfoLoaded}
                                          />
                                        );
                                      })()}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}

                          {/* Publishing progress (if active) — only shows enabled platforms.
                              After success we keep the panel visible with green styling so
                              the per-platform statuses and the TikTok "processing" notice
                              (A9) stay readable until the user navigates away. */}
                          {(isPublishing || isFailed || isPub) && ps?.platforms && (() => {
                            // A9 / Point 5d: show the "may take a few minutes" notice while the
                            // TikTok post is in-flight (publishing) OR done — not only after the
                            // status poll completes. The audit denial cited this notice being
                            // absent during the long "Processing on TikTok…" window.
                            const tiktokAccepted = Object.entries(ps.platforms).some(([k, st]) => {
                              const p = activePlat.find((ap) => ap.key === k);
                              return p?.platform === "TikTok" && (st === "publishing" || st === "done");
                            });
                            const borderColor = isPublishing ? T.yellowBorder : isFailed ? T.redBorder : T.greenBorder;
                            const heading = isPublishing ? "Publishing..." : isFailed ? "Publish results" : "Published";
                            return (
                              <div style={{ background: T.surface, border: `1px solid ${borderColor}`, borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
                                <SectionLabel>{heading}</SectionLabel>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                                  {Object.keys(ps.platforms).map((platKey) => {
                                    const plat = activePlat.find((p) => p.key === platKey);
                                    if (!plat) return null;
                                    const st = ps.platforms[platKey] || "pending";
                                    const { icon, color } = getPlatStatusIcon(st);
                                    // #189: this post went out as an automatic 720p copy because
                                    // Instagram refused the full-size render. Persisted on the clip,
                                    // so the badge is still here after a restart.
                                    const downscaledTo = clip.downscaledPosts?.[platKey];
                                    return (
                                      <div key={platKey} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                                        <span style={{ fontSize: 12 }}>{icon}</span>
                                        <span style={{ color: T.text, fontSize: 11, fontWeight: 600, minWidth: 80 }}>{plat.abbr} — {plat.name}</span>
                                        <span style={{ color, fontSize: 11, fontWeight: 600 }}>{st === "pending" ? "Waiting..." : st === "publishing" ? "Processing…" : st === "done" ? "Sent" : st}</span>
                                        {downscaledTo && <span title={`Instagram couldn't process the full-size render, so Corva sent a ${downscaledTo} copy automatically. Your render is untouched.`} style={{ padding: "1px 6px", borderRadius: 4, border: `1px solid ${T.yellowBorder}`, background: T.yellowDim, color: T.yellow, fontSize: 10, fontWeight: 700 }}>{downscaledTo}</span>}
                                      </div>
                                    );
                                  })}
                                </div>
                                {/* #189: the live upload detail from the platform modules. Collected
                                    since publishing was built and never shown until now — it's where
                                    the automatic 720p switch announces itself while it happens. */}
                                {isPublishing && publishProgress?.detail && (
                                  <div style={{ marginTop: 8, color: T.textSecondary, fontSize: 11, fontWeight: 600 }}>{publishProgress.detail}</div>
                                )}
                                {isFailed && ps.error && <div style={{ marginTop: 8, color: T.red, fontSize: 11, fontWeight: 600 }}>{ps.error}</div>}
                                {/* A9 / Point 5d — TikTok processing notice per Content Sharing
                                    Guidelines. Rendered as a prominent info banner so it's clearly
                                    visible on screen during processing (audit requirement). */}
                                {tiktokAccepted && (
                                  <div style={{ marginTop: 10 }}>
                                    <InfoBanner color={T.accent} icon={"⏳"}>
                                      Your TikTok post may take a few minutes to process and appear on your profile.
                                    </InfoBanner>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

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
                              <>
                                <button onClick={() => retryFailed(clip.id)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.redBorder}`, background: T.redDim, color: T.red, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Retry Failed</button>
                                {hasFailedInstagram(clip.id) && <button onClick={() => sendInstagramLightCopy(clip.id)} title="Instagram cannot process long 1080p clips. This sends it a 720p copy — your render stays 1080p." style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.borderLight}`, background: T.bgInput, color: T.textDim, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Send IG a 720p copy</button>}
                              </>
                            )}
                            <div style={{ flex: 1 }} />
                            {schedAction !== "schedule" && !clip.scheduledAt && (
                              <button onClick={() => { setSchedAction("schedule"); const sug = autoSuggestSlot(); if (sug) { setSchedDate(sug.date); setSchedHour(sug.hour); setSchedMin(sug.min); } }} disabled={!hasVideoId} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.border}`, background: "rgba(var(--lift),0.03)", color: hasVideoId ? T.textSecondary : T.textMuted, fontSize: 11, fontWeight: 700, cursor: hasVideoId ? "pointer" : "default", fontFamily: T.font }}>Schedule</button>
                            )}
                            {!isPub && !isPublishing && (
                              isClipTest(clip) ? (
                                <TestChip isTest disabled size="md" title="Test clip — publishing blocked. Untoggle TEST on the project to go live." />
                              ) : (() => {
                                const tikBlock = getTiktokBlockReason(clip);
                                const canPub = hasVideoId && !publishingRef.current && !tikBlock;
                                return (
                                  <button
                                    onClick={() => { if (canPub) pubNow(clip.id); }}
                                    disabled={!canPub}
                                    title={tikBlock || (!hasVideoId ? "Render the clip before publishing." : undefined)}
                                    style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: canPub ? T.green : "rgba(var(--lift),0.04)", color: canPub ? T.onSolid : T.textMuted, fontSize: 11, fontWeight: 700, cursor: canPub ? "pointer" : "not-allowed", fontFamily: T.font }}
                                  >Publish Now</button>
                                );
                              })()
                            )}
                          </div>
                          {/* Phase 3: Schedule picker with auto-suggest */}
                          {schedAction === "schedule" && (() => {
                            // #228: a picked time in the past greys the save —
                            // the scheduler would fire it immediately.
                            const schedPast = !!schedDate && new Date(`${schedDate}T${schedHour}:${schedMin}:00`) <= new Date();
                            const canSave = !!schedDate && !schedPast;
                            // #243: warn (don't block) when the picked time is
                            // already held by a scheduled clip or a tracker entry.
                            const conflict = schedDate ? getTakenSlots().get(`${schedDate}T${schedHour}:${schedMin}`) : null;
                            return (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                <Select value={schedDate} onChange={setSchedDate} options={[{ value: "", label: "Pick date..." }, ...dates.map((d) => ({ value: d.iso, label: d.label }))]} style={{ padding: "8px 12px", fontSize: 12 }} />
                                <TimeWheel hour={schedHour} min={schedMin} onHour={setSchedHour} onMin={setSchedMin} date={schedDate} />
                                <button onClick={() => { if (canSave) scheduleClipOnly(clip, schedDate, `${schedHour}:${schedMin}`); }} disabled={!canSave} title={schedPast ? "That time has already passed" : undefined} style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: canSave ? T.accent : "rgba(var(--lift),0.04)", color: canSave ? "#fff" : T.textMuted, fontSize: 11, fontWeight: 700, cursor: canSave ? "pointer" : "default", fontFamily: T.font }}>Save Schedule</button>
                                <button onClick={() => setSchedAction(null)} style={{ padding: "8px 12px", borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                              </div>
                              {schedPast && <div style={{ fontSize: 10, color: T.red, marginTop: 6 }}>That time has already passed — pick a future time.</div>}
                              {!schedPast && conflict && (
                                <div style={{ fontSize: 10, color: T.yellow, marginTop: 6 }}>
                                  {"⚠ "}{conflict.kind === "scheduled" ? `Another clip is already scheduled for this time: "${conflict.title}"` : `A post already went out at this time: "${conflict.title}"`}
                                </div>
                              )}
                              {(() => { const sug = autoSuggestSlot(); return sug ? <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 6 }}>Suggested: {sug.label}</div> : null; })()}
                            </div>
                            );
                          })()}
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
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(251,191,36,0.03)", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.yellow }}>Scheduled</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted }}>{filteredScheduled.length} clip{filteredScheduled.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 70px 150px 150px", gap: 0, padding: "8px 14px", borderBottom: `1px solid ${T.border}` }}>
          {["Clip", "Title", "Game", "Schedule / Status", ""].map((h, i) => (
            <span key={i} style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.textMuted }}>{h}</span>
          ))}
        </div>

        {filteredScheduled.map((clip) => {
          const gameTag = clip.gameTag;
          const ps = publishStatus[clip.id];
          const isPub = ps?.state === "done";
          const isPublishing = ps?.state === "publishing";
          const isFailed = ps?.state === "failed";
          const isSel = selClip === clip.id;
          const hasVideoId = !!clip.renderPath;
          const badge = statusBadge(clip);
          // Game-hue row wash — same recipe as the Projects launch-pad rows.
          const gc = gameColorFor(clip);
          const rowBg = `radial-gradient(90% 160% at 100% 0%, ${gc}1f 0%, transparent 55%), linear-gradient(100deg, ${gc}1a 0%, ${gc}06 40%, rgba(var(--lift),0.02) 65%)`;
          const rowBgHover = `linear-gradient(rgba(var(--lift),0.025), rgba(var(--lift),0.025)), ${rowBg}`;
          // Selected keeps the game hue (stronger wash) instead of snapping to
          // the purple accent; the expanded settings panel stays neutral.
          const rowBgSel = `radial-gradient(90% 160% at 100% 0%, ${gc}33 0%, transparent 55%), linear-gradient(100deg, ${gc}2b 0%, ${gc}0d 40%, rgba(var(--lift),0.03) 65%)`;

          return (
            <div key={clip.id}>
              <div
                onClick={() => { if (!isPublishing) { setSelClip(isSel ? null : clip.id); setSchedAction(null); } }}
                style={{ display: "grid", gridTemplateColumns: "48px 1fr 70px 150px 150px", gap: 0, padding: "7px 14px", alignItems: "center", borderBottom: `1px solid ${T.border}`, cursor: "pointer", background: isSel ? rowBgSel : rowBg, transition: "background 0.15s", opacity: isPub ? 0.6 : 1 }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = rowBgHover; setRowActions(e, true); }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = rowBg; setRowActions(e, false); }}
              >
                {/* Thumbnail */}
                <div style={{ width: 28, height: 50, borderRadius: 6, overflow: "hidden", background: "rgba(var(--lift),0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {clip.thumbnailPath ? <img src={toFileUrl(clip.thumbnailPath)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: T.textMuted, fontSize: 16 }}>{"\uD83C\uDFAC"}</span>}
                </div>
                {/* Title */}
                <div style={{ minWidth: 0, paddingRight: 8 }}>
                  <div style={{ color: T.text, fontSize: 13, fontWeight: 700, letterSpacing: "-0.1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clip.title}</div>
                </div>
                {/* Game */}
                <div>{gameTag && <GamePill tag={(gameTag.length > 6 ? gameTag.slice(0, 6) : gameTag).toUpperCase()} color={gameColorFor(clip)} size="sm" variant="solid" />}</div>
                {/* Schedule / status — one cell (#346). Both columns used to render
                    the same timestamp; the pill now only appears when it says
                    something the date doesn't. */}
                {isPub || isPublishing || isFailed || !hasVideoId ? (
                  <div><span style={{ padding: "3px 9px", borderRadius: 20, fontSize: 9, fontWeight: 700, background: badge.bg, color: badge.color, whiteSpace: "nowrap" }}>{badge.label}</span></div>
                ) : (
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.yellow }}>{formatSchedule(clip.scheduledAt)}</div>
                )}
                {/* Action */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                  <RowActions clip={clip} onOpenInEditor={onOpenInEditor} />
                  {!isPub && !isPublishing && hasVideoId && (() => {
                    const tikBlock = getTiktokBlockReason(clip);
                    return (
                      <button
                        onClick={(e) => { e.stopPropagation(); if (!tikBlock) pubNow(clip.id); }}
                        disabled={!!tikBlock}
                        title={tikBlock || undefined}
                        style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: tikBlock ? "rgba(var(--lift),0.04)" : T.green, color: tikBlock ? T.textMuted : T.onSolid, fontSize: 10, fontWeight: 700, cursor: tikBlock ? "not-allowed" : "pointer", fontFamily: T.font }}
                      >Publish</button>
                    );
                  })()}
                  {!isPublishing && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteAsk({ clip, x: Math.min(e.clientX, window.innerWidth - 260), y: Math.min(e.clientY, window.innerHeight - 160) }); }}
                      title="Remove from queue / delete clip"
                      style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 6, border: "none", background: "transparent", color: T.textMuted, opacity: 0.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = T.red; e.currentTarget.style.background = "rgba(239,68,68,0.12)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.color = T.textMuted; e.currentTarget.style.background = "transparent"; }}
                    ><TrashIcon /></button>
                  )}
                </div>
              </div>

              {/* Expanded detail — reuse same panel structure */}
              {isSel && (
                <div style={{ padding: "20px 24px", background: "rgba(var(--lift),0.02)", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", gap: 24 }}>
                    <div style={{ width: 120, flexShrink: 0 }}>
                      <div style={{ aspectRatio: "9/16", borderRadius: 10, overflow: "hidden", background: "rgba(var(--lift),0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {clip.thumbnailPath ? <img src={toFileUrl(clip.thumbnailPath)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: T.textMuted, fontSize: 32 }}>{"\uD83C\uDFAC"}</span>}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: T.text, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{clip.title}</div>
                      <div style={{ display: "flex", gap: 10, fontSize: 11, color: T.textTertiary, marginBottom: 8, alignItems: "center" }}>
                        {gameTag && <GamePill tag={gameTag.toUpperCase()} color={gameColorFor(clip)} variant="solid" />}
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
                              style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px 4px 6px", borderRadius: 20, border: `1px solid ${isOn ? "rgba(var(--lift),0.12)" : T.border}`, background: isOn ? "rgba(var(--lift),0.06)" : "transparent", opacity: isOn ? 1 : 0.4, cursor: "pointer", transition: "all 0.15s", fontFamily: T.font }}>
                              <PlatformIcon platform={pk} size={18} />
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
                        {hasFailedInstagram(clip.id) && <button onClick={() => sendInstagramLightCopy(clip.id)} title="Instagram cannot process long 1080p clips. This sends it a 720p copy — your render stays 1080p." style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.borderLight}`, background: T.bgInput, color: T.textDim, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Send IG a 720p copy</button>}
                        <div style={{ flex: 1 }} />
                        {!isPub && !isPublishing && (() => {
                          const tikBlock = getTiktokBlockReason(clip);
                          const canPub = hasVideoId && !publishingRef.current && !tikBlock;
                          return (
                            <button
                              onClick={() => { if (canPub) pubNow(clip.id); }}
                              disabled={!canPub}
                              title={tikBlock || (!hasVideoId ? "Render the clip before publishing." : undefined)}
                              style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: canPub ? T.green : "rgba(var(--lift),0.04)", color: canPub ? T.onSolid : T.textMuted, fontSize: 11, fontWeight: 700, cursor: canPub ? "pointer" : "not-allowed", fontFamily: T.font }}
                            >Publish Now</button>
                          );
                        })()}
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

      {/* #293: PUBLISHED — a read-only shelf of what already went out, so a past clip's
          title / description / tags can be copied onto a new one. Deliberately NOT the
          queue card: no publish, schedule, retry, dequeue, and nothing editable. Editing
          tags here would write a per-clip override, which silently changes what a REPOST
          of that clip would send. Copy buttons only.
          #306: Repost is the one action here, and it does not break that stance — it
          never touches the published record, it creates a separate new clip. */}
      {showPublished && publishedClips.length > 0 && (() => {
        const expanded = publishedOpen || filterStatus === "published";
        return (
          <Card style={{ padding: "14px 20px", marginBottom: 14 }}>
            <div
              onClick={() => { setPublishedOpen(!expanded); if (expanded) setSelPublished(null); }}
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
            >
              <SectionLabel>Published</SectionLabel>
              <span style={{ fontSize: 11, fontWeight: 800, fontFamily: T.mono, color: T.green, background: "rgba(52,211,153,0.1)", padding: "1px 7px", borderRadius: 5 }}>{filteredPublished.length}</span>
              <span style={{ fontSize: 11, color: T.textTertiary }}>read-only — copy settings onto a new clip</span>
              <div style={{ flex: 1 }} />
              <span style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(var(--lift),0.03)", color: T.textSecondary, fontSize: 11, fontWeight: 700 }}>{expanded ? "Hide" : "Show"}</span>
            </div>

            {expanded && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {filteredPublished.length === 0 && (
                  <div style={{ color: T.textTertiary, fontSize: 12, padding: "10px 0" }}>No published clips for this game.</div>
                )}
                {filteredPublished.map((clip) => {
                  const t = clip._tracker;
                  // Present only on posts published after #293 shipped. Absent = fall back
                  // to recomputing, and SAY SO — never dress a reconstruction up as history.
                  const snap = t.published;
                  const isOpen = selPublished === clip.id;
                  const gc = gameColorFor(clip);
                  const ytTitle = snap ? snap.youtubeTitle : (clip.youtubeTitle || clip.title || "");
                  const desc = snap ? snap.description : getEffectiveCaption(clip, "youtube");
                  const tags = snap ? (snap.tags || []) : resolveTags(clip, ytDescriptions, gamesDb);
                  const tagsCustom = snap ? !!snap.tagsCustom : Array.isArray(clip.youtubeTags);
                  const gameName = (gamesDb || []).find((g) =>
                    (g.tag || "").toLowerCase() === clip.gameTag || (g.hashtag || "").toLowerCase() === clip.gameTag
                  )?.name || "";
                  // Noon, not midnight — t.date is a local ISO day and parsing it bare
                  // would land on UTC midnight and read as the day before in EST.
                  const when = t.date ? new Date(`${t.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                  const rowBg = `linear-gradient(100deg, ${gc}14 0%, ${gc}05 40%, rgba(var(--lift),0.015) 65%)`;

                  return (
                    <div key={clip.id} style={{ border: `1px solid ${isOpen ? T.borderHover : T.border}`, borderRadius: 9, background: rowBg, overflow: "hidden" }}>
                      <div
                        onClick={() => setSelPublished(isOpen ? null : clip.id)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 12px", cursor: "pointer" }}
                      >
                        <div style={{ width: 17, flexShrink: 0, aspectRatio: "9/16", borderRadius: 3, overflow: "hidden", background: "rgba(var(--lift),0.04)" }}>
                          {clip.thumbnailPath && (
                            <img src={toFileUrl(clip.thumbnailPath)} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          )}
                        </div>
                        {clip.gameTag && <GamePill tag={clip.gameTag.toUpperCase()} color={gc} size="sm" />}
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clip.title}</span>
                        {(t.platformResults || []).map((row, i) => (
                          row.url ? (
                            <span key={i} onClick={(e) => { e.stopPropagation(); window.clipflow?.openExternal?.(row.url); }} title={`${row.platform} · view post`} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, cursor: "pointer", background: T.accentDim, border: `1px solid ${T.accentBorder}` }}>
                              <PlatformIcon platform={row.platform} size={12} />
                            </span>
                          ) : (
                            <span key={i} title={row.platform} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, opacity: 0.55, background: "rgba(var(--lift),0.04)", border: `1px solid ${T.border}` }}>
                              <PlatformIcon platform={row.platform} size={12} />
                            </span>
                          )
                        ))}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRepost(clip); }}
                          disabled={!!reposting}
                          title="Copy this clip back into the queue to post again"
                          style={{ padding: "3px 9px", borderRadius: 6, border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight, fontSize: 10.5, fontWeight: 700, cursor: reposting ? "default" : "pointer", fontFamily: T.font, opacity: reposting && reposting !== clip.id ? 0.4 : 1, whiteSpace: "nowrap" }}
                        >{reposting === clip.id ? "Reposting…" : "Repost"}</button>
                        <span style={{ fontSize: 10.5, color: T.textTertiary, fontFamily: T.mono, whiteSpace: "nowrap", minWidth: 84, textAlign: "right" }}>{when}{t.time ? ` · ${t.time}` : ""}</span>
                      </div>
                      {repostErr?.clipId === clip.id && (
                        <div style={{ padding: "5px 12px", borderTop: `1px solid ${T.border}`, color: T.red, fontSize: 11 }}>{repostErr.message}</div>
                      )}

                      {isOpen && (
                        <div style={{ borderTop: `1px solid ${T.border}`, background: "rgba(var(--shade),calc(0.16 * var(--shadeK)))" }}>
                          {/* Provenance, once, for all three blocks below. A recomputed
                              view drifts the moment the game's lists are edited. */}
                          <div style={{ padding: "7px 12px", borderBottom: `1px solid ${T.border}`, fontSize: 10.5, fontWeight: 600, color: snap ? T.green : T.yellow }}>
                            {snap
                              ? "Exactly what was published."
                              : "Published before Corva started recording this — showing what these settings resolve to today, which may have changed since."}
                          </div>

                          <ReadOnlyField label="YouTube title" value={ytTitle} />
                          <ReadOnlyField label="Description" value={desc} multiline />

                          <div style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                              <div style={FIELD_LABEL}>Tags</div>
                              {tags.length > 0 && <CopyIconButton value={tagsToText(tags)} title="Copy tags" />}
                              {tagsCustom
                                ? <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: T.accent, background: T.accentDim, padding: "1px 7px", borderRadius: 5 }}>CUSTOM</span>
                                : <span style={{ fontSize: 10, color: T.textTertiary }}>from {gameName || "the game"}&rsquo;s list</span>}
                            </div>
                            {tags.length === 0 ? (
                              <span style={{ fontSize: 12.5, color: T.textMuted, fontStyle: "italic" }}>No tags</span>
                            ) : (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                                {tags.map((tag) => (
                                  <span key={tag} style={{ fontSize: 11, color: T.textSecondary, background: "rgba(var(--lift),0.05)", border: `1px solid ${T.border}`, borderRadius: 5, padding: "2px 7px" }}>{tag}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })()}

      {/* PUBLISH LOG */}
      <Card style={{ padding: "14px 20px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SectionLabel>Publish Log</SectionLabel>
          <button onClick={() => { setShowLogs(!showLogs); if (!showLogs) loadPublishLogs(); }} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(var(--lift),0.03)", color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>{showLogs ? "Hide" : `Show (${publishLogs.length})`}</button>
        </div>
        {showLogs && (
          <div style={{ marginTop: 12, maxHeight: 300, overflowY: "auto" }}>
            {publishLogs.length === 0 && <div style={{ color: T.textTertiary, fontSize: 12, padding: "10px 0" }}>No publish attempts yet.</div>}
            {publishLogs.map((log, i) => {
              const statusColor = log.status === "success" ? T.green : log.status === "failed" ? T.red : log.status === "uploading" || log.status === "started" ? T.yellow : T.textMuted;
              const time = new Date(log.timestamp).toLocaleString();
              return (
                <div key={i} style={{ padding: "8px 12px", borderRadius: 6, background: "rgba(var(--lift),0.02)", border: `1px solid ${T.border}`, marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ color: T.text, fontSize: 12, fontWeight: 600, maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.clipTitle || "Unknown clip"}</span>
                    <span style={{ color: statusColor, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{log.status}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: T.textTertiary }}>
                    <span>{log.platform} → {log.accountName || log.accountId}</span>
                    <span>{time}</span>
                  </div>
                  {/* #189: which file actually went out. Present on both halves of an
                      automatic Instagram fallback — the refused full-size attempt and the
                      720p copy that replaced it — so the resolution of any past post is
                      answerable without guessing. */}
                  {log.qualityNote && <div style={{ color: T.yellow, fontSize: 11, marginTop: 4, fontWeight: 600 }}>{log.qualityNote}</div>}
                  {log.error && <div style={{ color: T.red, fontSize: 11, marginTop: 4, fontFamily: T.mono, wordBreak: "break-all" }}>{log.error}</div>}
                  {log.publishId && <div style={{ color: T.textMuted, fontSize: 10, marginTop: 2, fontFamily: T.mono }}>publish_id: {log.publishId}</div>}
                  {log.postId && <div style={{ color: T.green, fontSize: 10, marginTop: 2, fontFamily: T.mono }}>post_id: {log.postId}</div>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

        </div>{/* /left column */}

        {/* #324: Captions & Descriptions. Was a full-width block below the
            Publish Log — three scrolls down and every game on screen at once. */}
        <CaptionsView
          ytDescriptions={ytDescriptions}
          setYtDescriptions={setYtDescriptions}
          captionTemplates={captionTemplates}
          setCaptionTemplates={setCaptionTemplates}
          platformOptions={platformOptions}
          setPlatformOptions={setPlatformOptions}
          gamesDb={gamesDb}
          setGamesDb={setGamesDb}
          scopeGame={scopeGame}
        />
      </div>{/* /queue grid */}
      <div style={{ height: 24 }} />
    </div>
  );
}
