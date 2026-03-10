/**
 * Format seconds to "MM:SS.d" display string
 */
export const fmtTime = (sec) => {
  if (!sec || sec < 0) return "00:00.0";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
};

/**
 * Parse "MM:SS.d" or "SS.d" string back to seconds
 */
export const parseTime = (str) => {
  if (!str) return 0;
  const parts = str.split(":");
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(str) || 0;
};

/**
 * Convert time (seconds) to pixel position given a zoom factor
 * Base: 500px = full duration at zoom 1x
 */
export const timeToPixels = (time, duration, zoom, baseWidth = 500) => {
  if (!duration) return 0;
  return (time / duration) * baseWidth * zoom;
};

/**
 * Convert pixel position back to time (seconds)
 */
export const pixelsToTime = (px, duration, zoom, baseWidth = 500) => {
  if (!duration || !zoom) return 0;
  return (px / (baseWidth * zoom)) * duration;
};
