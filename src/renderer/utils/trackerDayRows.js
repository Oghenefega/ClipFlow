/**
 * trackerDayRows.js — turns one day's template slots plus whatever is actually
 * on that day (logged entries, scheduled clips, clips needing a retry) into the
 * single ordered list of rows the tracker's day column renders.
 *
 * The interesting part is CLAIMING: a card logged at 2:31 PM is the 2:30 PM
 * slot being filled, not a stray card next to an empty slot, so each item takes
 * the nearest slot within SLOT_CLAIM_WINDOW_MIN and that slot stops drawing its
 * own placeholder. Everything else falls out of that — an off-slot card keeps
 * its own row, and empty slots only show where posting is still possible
 * (never in the past, never on a past week).
 *
 * Pure logic for the Now Playing Tracker; CJS so jest runs it with no babel.
 * PURE — `now` always arrives as an argument, never Date.now().
 */

// How far from a slot a card can sit and still count as that slot's post.
const SLOT_CLAIM_WINDOW_MIN = 30;

/**
 * Minutes since midnight from a 12-hour label. Tolerates the legacy spaceless
 * form ("2:30PM"). Unparsable → null (never 0, which is a real time).
 */
function timeToMinutes(label) {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(String(label == null ? "" : label));
  if (!m) return null;
  const hour12 = parseInt(m[1], 10) % 12;
  const hour = m[3].toUpperCase() === "PM" ? hour12 + 12 : hour12;
  return hour * 60 + parseInt(m[2], 10);
}

/** Minutes since midnight → "2:30 PM" (no leading zero on the hour). */
function minutesToLabel12h(mins) {
  const total = ((Math.round(mins) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(total / 60);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const mm = String(total % 60).padStart(2, "0");
  return `${hour12}:${mm} ${hour24 < 12 ? "AM" : "PM"}`;
}

/** "2:30 PM" → "14:30". Unparsable → "". */
function label12hTo24h(label) {
  const mins = timeToMinutes(label);
  if (mins === null) return "";
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** "14:30" → "2:30 PM". Unparsable or out of range → "". */
function hhmmTo12hLabel(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm == null ? "" : hhmm).trim());
  if (!m) return "";
  const hour = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  if (hour > 23 || mins > 59) return "";
  return minutesToLabel12h(hour * 60 + mins);
}

/**
 * "2026-09-05" + "2:30 PM" → "2026-09-05T14:30:00" — no Z, no offset, so
 * `new Date(...)` reads it as LOCAL time. null when either half is unusable.
 */
function slotDateTimeIso(dayIso, slotLabel) {
  const hhmm = label12hTo24h(slotLabel);
  if (!dayIso || !hhmm) return null;
  return `${dayIso}T${hhmm}:00`;
}

/**
 * One slot index per item (or -1 for none): the nearest slot within `windowMin`
 * minutes, ties going to the earlier slot. Several items may claim one slot —
 * two posts at the same time is a real day, not an error.
 */
function claimSlots(slotMinutes, itemMinutes, windowMin = SLOT_CLAIM_WINDOW_MIN) {
  return (itemMinutes || []).map((mins) => {
    if (mins === null || mins === undefined) return -1;
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < slotMinutes.length; i++) {
      const dist = Math.abs(slotMinutes[i] - mins);
      if (dist < bestDist || (dist === bestDist && slotMinutes[i] < slotMinutes[best])) {
        best = i;
        bestDist = dist;
      }
    }
    return bestDist <= windowMin ? best : -1;
  });
}

/** Slot labels parsed and sorted by time; unparsable labels are dropped. */
function parseSlots(slots) {
  return (slots || [])
    .map((label) => ({ label, minutes: timeToMinutes(label) }))
    .filter((slot) => slot.minutes !== null)
    .sort((a, b) => a.minutes - b.minutes);
}

/**
 * The day's rows, ascending by minute. Item rows keep their own time (so a card
 * claiming the 2:30 slot still sorts at 2:31); slot rows are placeholders that
 * only survive when nobody claimed them AND posting into them is still possible.
 *
 * @param {object} args
 * @param {string[]} args.slots - template slot labels, any order
 * @param {Array<{kind: string, time: string, ref: any}>} args.items
 * @param {string} args.dayIso - the day these rows belong to, YYYY-MM-DD
 * @param {Date} args.now
 * @param {"current"|"future"|"past"} args.viewMode
 */
function buildDayRows({ slots, items, dayIso, now, viewMode, windowMin = SLOT_CLAIM_WINDOW_MIN }) {
  const parsed = parseSlots(slots);
  const list = items || [];
  const itemMinutes = list.map((item) => timeToMinutes(item && item.time));
  const claims = claimSlots(parsed.map((slot) => slot.minutes), itemMinutes, windowMin);
  const claimed = new Set(claims.filter((index) => index >= 0));

  const rows = list.map((item, i) => ({
    type: item.kind,
    item: item.ref,
    minutes: itemMinutes[i] === null ? 0 : itemMinutes[i],
    claimedSlot: claims[i] >= 0 ? parsed[claims[i]].label : null,
  }));

  if (viewMode !== "past") {
    parsed.forEach((slot, i) => {
      if (claimed.has(i)) return;
      if (viewMode === "current") {
        const iso = slotDateTimeIso(dayIso, slot.label);
        if (iso && new Date(iso) < now) return;
      }
      rows.push({ type: "slot", time: slot.label, minutes: slot.minutes });
    });
  }

  return rows.sort((a, b) => a.minutes - b.minutes);
}

/** Retro-logging is for the current week, today or earlier — never the future. */
function retroLogVisible({ dayIso, todayIso, viewMode }) {
  return viewMode === "current" && dayIso <= todayIso;
}

/**
 * The time to pre-fill a retro log with: the last slot that has already passed
 * and nobody claimed, else the clock now (today, floored to 5 minutes), else
 * the day's last slot.
 */
function suggestRetroLogTime({ slots, items, dayIso, todayIso, now }) {
  const parsed = parseSlots(slots);
  const itemMinutes = (items || []).map((item) => timeToMinutes(item && item.time));
  const claims = claimSlots(parsed.map((slot) => slot.minutes), itemMinutes);
  const claimed = new Set(claims.filter((index) => index >= 0));

  for (let i = parsed.length - 1; i >= 0; i--) {
    if (claimed.has(i)) continue;
    const iso = slotDateTimeIso(dayIso, parsed[i].label);
    if (iso && new Date(iso) < now) return parsed[i].label;
  }

  if (dayIso === todayIso) {
    return minutesToLabel12h(Math.floor((now.getHours() * 60 + now.getMinutes()) / 5) * 5);
  }
  if (parsed.length) return parsed[parsed.length - 1].label;
  return "12:00 PM";
}

module.exports = {
  SLOT_CLAIM_WINDOW_MIN,
  timeToMinutes,
  minutesToLabel12h,
  label12hTo24h,
  hhmmTo12hLabel,
  slotDateTimeIso,
  claimSlots,
  buildDayRows,
  retroLogVisible,
  suggestRetroLogTime,
};
