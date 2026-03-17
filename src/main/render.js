const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * Generate an ASS subtitle file from subtitle segments.
 * @param {Array} segments - [{ text, startSec, endSec, track }]
 * @param {string} outPath - Output .ass file path
 * @param {object} style - { fontSize, fontName, highlightColor, strokeWidth, position }
 */
function generateAssFile(segments, outPath, style = {}) {
  const {
    fontSize = 52,
    fontName = "Latina Essential",
    primaryColor = "&H00FFFFFF", // white
    highlightColor = "&H008ACE4C", // green (#4cce8a in BGR)
    strokeColor = "&H00000000", // black
    strokeWidth = 7,
    position = 7, // bottom-center (SSA alignment)
  } = style;

  // SSA/ASS alignment: 1=bottom-left, 2=bottom-center, 5=top-center, 7=top-left, etc.
  const alignment = position <= 2 ? 8 : position <= 5 ? 5 : 2; // map grid position to ASS

  const header = `[Script Info]
Title: ClipFlow Subtitles
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},${highlightColor},${strokeColor},&H80000000,-1,0,0,0,100,100,0,0,1,${strokeWidth},0,${alignment},40,40,80,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const fmtAssTime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
  };

  const events = segments
    .filter((s) => s.text && s.text.trim())
    .map((s) => {
      const start = fmtAssTime(s.startSec || 0);
      const end = fmtAssTime(s.endSec || 0);
      const text = s.text.replace(/\n/g, "\\N");
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    });

  const content = header + "\n" + events.join("\n") + "\n";

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, content, "utf-8");

  return outPath;
}

/**
 * Render a clip with subtitle burn-in and optional SFX mixing.
 * Uses ffmpeg filter_complex for compositing.
 *
 * @param {object} clipData - Clip object with subtitles, sfx, etc.
 * @param {object} projectData - Project with sourceFile, transcription
 * @param {string} outputPath - Final output MP4 path
 * @param {object} options - { subtitleStyle, onProgress }
 * @returns {Promise<{success, path, duration}>}
 */
function renderClip(clipData, projectData, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    const { onProgress } = options;
    const srcFile = clipData.filePath || projectData.sourceFile;

    if (!srcFile || !fs.existsSync(srcFile)) {
      return reject(new Error(`Source file not found: ${srcFile}`));
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const clipDuration = (clipData.endTime || 0) - (clipData.startTime || 0);

    // Build subtitle segments from clip data
    const subtitleSegments = [];
    if (clipData.subtitles?.sub1) {
      subtitleSegments.push(...clipData.subtitles.sub1);
    }
    if (clipData.subtitles?.sub2) {
      subtitleSegments.push(...clipData.subtitles.sub2);
    }

    // Generate ASS file if subtitles exist
    let assFile = null;
    if (subtitleSegments.length > 0) {
      assFile = outputPath.replace(/\.[^.]+$/, ".ass");
      generateAssFile(subtitleSegments, assFile, options.subtitleStyle || {});
    }

    // Build ffmpeg args
    const args = [
      "-i", srcFile,
    ];

    // Build filter complex
    const filters = [];

    if (assFile) {
      // Escape special characters in ASS path for ffmpeg filter
      const escapedAss = assFile.replace(/\\/g, "/").replace(/:/g, "\\:");
      filters.push(`ass='${escapedAss}'`);
    }

    if (filters.length > 0) {
      args.push("-vf", filters.join(","));
    }

    // Output encoding
    args.push(
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    );

    // Use spawn for progress tracking
    const proc = spawn("ffmpeg", args);
    let stderr = "";

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
      // Parse progress from ffmpeg output
      if (onProgress && clipDuration > 0) {
        const timeMatch = data.toString().match(/time=(\d+):(\d+):(\d+\.?\d*)/);
        if (timeMatch) {
          const h = parseInt(timeMatch[1]);
          const m = parseInt(timeMatch[2]);
          const s = parseFloat(timeMatch[3]);
          const currentSec = h * 3600 + m * 60 + s;
          const pct = Math.min(99, Math.round((currentSec / clipDuration) * 100));
          onProgress({ stage: "rendering", pct, detail: `${Math.round(currentSec)}s / ${Math.round(clipDuration)}s` });
        }
      }
    });

    proc.on("close", (code) => {
      // Clean up temp ASS file
      if (assFile && fs.existsSync(assFile)) {
        try { fs.unlinkSync(assFile); } catch (_) { /* ignore */ }
      }

      if (code !== 0) {
        return reject(new Error(`ffmpeg render failed (code ${code}): ${stderr.slice(-500)}`));
      }
      resolve({ success: true, path: outputPath, duration: clipDuration });
    });

    proc.on("error", (err) => {
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });
  });
}

/**
 * Batch render multiple clips from a project.
 * @param {Array} clips - Array of clip objects to render
 * @param {object} projectData - Project data
 * @param {string} outputDir - Output directory
 * @param {object} options - { subtitleStyle, onProgress }
 * @returns {Promise<Array<{clipId, success, path, error}>>}
 */
async function batchRender(clips, projectData, outputDir, options = {}) {
  const results = [];
  const total = clips.length;

  for (let i = 0; i < total; i++) {
    const clip = clips[i];
    const fileName = `${clip.title || `clip_${clip.id}`}.mp4`
      .replace(/[<>:"/\\|?*]/g, "_"); // sanitize filename
    const outputPath = path.join(outputDir, fileName);

    if (options.onProgress) {
      options.onProgress({
        stage: "rendering",
        pct: Math.round((i / total) * 100),
        detail: `Rendering clip ${i + 1} of ${total}`,
        clipId: clip.id,
      });
    }

    try {
      const result = await renderClip(clip, projectData, outputPath, {
        subtitleStyle: options.subtitleStyle,
        onProgress: (p) => {
          if (options.onProgress) {
            const overallPct = Math.round(((i + p.pct / 100) / total) * 100);
            options.onProgress({ ...p, pct: overallPct, detail: `Clip ${i + 1}/${total}: ${p.detail}` });
          }
        },
      });
      results.push({ clipId: clip.id, success: true, path: result.path });
    } catch (err) {
      results.push({ clipId: clip.id, success: false, error: err.message });
    }
  }

  return results;
}

module.exports = {
  renderClip,
  batchRender,
  generateAssFile,
};
