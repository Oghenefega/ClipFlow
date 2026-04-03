const { execFile, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("./ffmpeg");
const projects = require("./projects");
const whisper = require("./whisper");
const aiPrompt = require("./ai-prompt");
const gameProfiles = require("./game-profiles");
const feedback = require("./feedback");
const database = require("./database");
const { PipelineLogger } = require("./pipeline-logger");
const { getProvider } = require("./ai/llm-provider");

/**
 * Update file_metadata status in SQLite.
 * @param {string} fileMetadataId - UUID of the file_metadata row
 * @param {string} status - New status value
 */
function updateFileStatus(fileMetadataId, status) {
  if (!fileMetadataId) return;
  try {
    const db = database.getDb();
    if (!db) return;
    // Never overwrite "split" status — split parents are inert and should not re-enter the pipeline
    const result = db.exec("SELECT status FROM file_metadata WHERE id = ?", [fileMetadataId]);
    const rows = database.toRows(result);
    if (rows.length > 0 && rows[0].status === "split") return;
    db.run("UPDATE file_metadata SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, fileMetadataId]);
    database.save();
  } catch (e) { /* non-critical — don't crash pipeline */ }
}

/**
 * Apply any pending retroactive renames that were queued while this file was in use.
 * @param {string} fileMetadataId - UUID of the file_metadata row
 */
function applyPendingRenames(fileMetadataId) {
  if (!fileMetadataId) return;
  try {
    const db = database.getDb();
    if (!db) return;
    const result = db.exec("SELECT has_pending_rename, pending_rename_data, current_path, status FROM file_metadata WHERE id = ?", [fileMetadataId]);
    const rows = database.toRows(result);
    if (rows.length === 0 || !rows[0].has_pending_rename) return;
    // Skip split parent files — they are no longer active in the pipeline
    if (rows[0].status === "split") return;

    const row = rows[0];
    const renameData = JSON.parse(row.pending_rename_data);
    if (!renameData || !renameData.newFilename) return;

    const oldPath = row.current_path;
    const newPath = path.join(path.dirname(oldPath), renameData.newFilename);

    // Rename the physical file
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
    }

    // Update the database record
    db.run(
      "UPDATE file_metadata SET current_filename = ?, current_path = ?, part_number = ?, has_pending_rename = 0, pending_rename_data = NULL, updated_at = datetime('now') WHERE id = ?",
      [renameData.newFilename, newPath, renameData.partNumber || null, fileMetadataId]
    );
    database.save();
  } catch (e) { /* non-critical */ }
}

// Default processing directory
const DEFAULT_PROCESSING_DIR = path.join(__dirname, "..", "..", "processing");

/**
 * Ensure all processing subdirectories exist.
 */
function ensureProcessingDirs(processingDir) {
  const subdirs = ["transcripts", "energy", "frames", "claude", "clips", "logs"];
  for (const sub of subdirs) {
    const dir = path.join(processingDir, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Slice word-level subtitles from the full source transcription for a clip's time range.
 * Offsets all timestamps to be clip-local (0-based).
 *
 * Words that overlap the clip boundaries are included if their midpoint falls within range.
 * Segments are rebuilt from the sliced words.
 *
 * @param {object} transcription - Source transcription { segments: [...], text: "..." }
 * @param {number} clipStart - Clip start time in source (seconds)
 * @param {number} clipEnd - Clip end time in source (seconds)
 * @returns {Array} - Segments with 0-based word timestamps for the clip
 */
function sliceSubtitlesFromSource(transcription, clipStart, clipEnd) {
  const segments = transcription?.segments || [];
  const slicedSegments = [];

  for (const seg of segments) {
    const segStart = seg.start || 0;
    const segEnd = seg.end || 0;

    // Skip segments entirely outside the clip range
    if (segEnd <= clipStart || segStart >= clipEnd) continue;

    // Collect words that fall within the clip range
    const words = seg.words || [];
    const slicedWords = [];

    for (const w of words) {
      const wStart = w.start ?? segStart;
      const wEnd = w.end ?? segEnd;
      const wMid = (wStart + wEnd) / 2;

      // Include word if its midpoint is within clip range
      if (wMid >= clipStart && wMid <= clipEnd) {
        slicedWords.push({
          word: w.word,
          start: Math.max(0, round3(wStart - clipStart)),
          end: Math.max(0, round3(wEnd - clipStart)),
          probability: w.probability ?? 1.0,
        });
      }
    }

    if (slicedWords.length === 0) continue;

    // Rebuild segment from sliced words
    const newStart = slicedWords[0].start;
    const newEnd = slicedWords[slicedWords.length - 1].end;
    const text = slicedWords.map((w) => w.word).join(" ");

    slicedSegments.push({
      start: newStart,
      end: newEnd,
      text,
      words: slicedWords,
    });
  }

  return slicedSegments;
}

/** Round to 3 decimal places (millisecond precision). */
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Run energy_scorer.py as a subprocess.
 * @param {string} pythonPath - Path to Python executable in venv
 * @param {string} videoPath - Source video file
 * @param {string} srtPath - SRT transcript file
 * @param {string} processingDir - Processing root directory
 * @param {PipelineLogger} logger
 * @returns {Promise<{ energyJson: Array, claudeReadyText: string }>}
 */
function runEnergyScorer(pythonPath, videoPath, srtPath, processingDir, logger) {
  return new Promise((resolve, reject) => {
    const scriptPath = "D:\\whisper\\energy_scorer.py";
    // -X utf8 forces Python UTF-8 mode so emoji energy labels (🔥⚡💤🔇) don't crash on Windows cp1252
    const args = ["-X", "utf8", scriptPath, videoPath, srtPath];

    logger.logCommand(pythonPath, args);

    const child = spawn(pythonPath, args, {
      timeout: 600000, // 10 min
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("close", (code) => {
      logger.logOutput("STDOUT", stdout);
      logger.logOutput("STDERR", stderr);

      if (code !== 0) {
        return reject(new Error(`energy_scorer.py exited with code ${code}: ${stderr.substring(0, 500)}`));
      }

      // Energy scorer outputs files next to the video.
      // We need to move them to our processing directory.
      const videoName = path.basename(videoPath, path.extname(videoPath));
      const videoDir = path.dirname(videoPath);

      // Find the output files
      const energyJsonSrc = path.join(videoDir, `${videoName}.energy.json`);
      const claudeReadySrc = path.join(videoDir, `${videoName}.claude_ready.txt`);

      const energyJsonDst = path.join(processingDir, "energy", `${videoName}.energy.json`);
      const claudeReadyDst = path.join(processingDir, "claude", `${videoName}.claude_ready.txt`);

      try {
        // Read and move energy.json
        if (!fs.existsSync(energyJsonSrc)) {
          return reject(new Error(`energy_scorer.py did not produce ${energyJsonSrc}`));
        }
        const energyJson = JSON.parse(fs.readFileSync(energyJsonSrc, "utf-8"));
        fs.copyFileSync(energyJsonSrc, energyJsonDst);
        // Clean up source location
        try { fs.unlinkSync(energyJsonSrc); } catch (e) { /* ignore */ }

        // Read and move claude_ready.txt
        let claudeReadyText = "";
        if (fs.existsSync(claudeReadySrc)) {
          claudeReadyText = fs.readFileSync(claudeReadySrc, "utf-8");
          fs.copyFileSync(claudeReadySrc, claudeReadyDst);
          try { fs.unlinkSync(claudeReadySrc); } catch (e) { /* ignore */ }
        }

        resolve({ energyJson, claudeReadyText });
      } catch (e) {
        reject(new Error(`Failed to read energy_scorer output: ${e.message}`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn energy_scorer.py: ${err.message}`));
    });
  });
}

/**
 * Generate SRT transcript from WhisperX output for energy_scorer.py compatibility.
 * @param {object} transcription - { segments: [{start, end, text}], text }
 * @param {string} outPath - Output .srt file path
 */
function writeSrt(transcription, outPath) {
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const segments = transcription.segments || [];
  const lines = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    lines.push(String(i + 1));
    lines.push(`${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}`);
    lines.push((seg.text || "").trim());
    lines.push("");
  }
  fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
}

function formatSrtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/**
 * Extract top N frames from peak energy segments.
 * @param {string} videoPath
 * @param {Array} energyJson - Parsed energy.json (merged with transcript)
 * @param {string} framesDir - Output directory
 * @param {string} videoName - Base video name (for filenames)
 * @param {number} topN - Max frames to extract (default 20)
 * @param {PipelineLogger} logger
 * @returns {Promise<Array<{path: string, timestamp: string, peakEnergy: number}>>}
 */
async function extractTopFrames(videoPath, energyJson, framesDir, videoName, topN, logger) {
  // Sort by peak_energy descending, take top N
  const sorted = [...energyJson]
    .filter((seg) => seg.peak_energy != null)
    .sort((a, b) => b.peak_energy - a.peak_energy)
    .slice(0, topN);

  const frames = [];
  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];
    // Midpoint of segment
    const start = seg.start || 0;
    const end = seg.end || start;
    const midpoint = start + (end - start) / 2;

    const framePath = path.join(framesDir, `${videoName}_frame_${String(i + 1).padStart(2, "0")}.jpg`);

    try {
      await extractFrame(videoPath, framePath, midpoint);
      frames.push({
        path: framePath,
        timestamp: seg.start_timestamp || aiPrompt.formatTimestamp(midpoint),
        peakEnergy: seg.peak_energy,
      });
    } catch (e) {
      logger.info(`Frame extraction failed at ${midpoint}s: ${e.message}`);
    }
  }

  return frames;
}

/**
 * Extract a single frame at a specific time (720p max).
 */
function extractFrame(videoPath, outPath, timeSeconds) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const args = [
      "-ss", String(timeSeconds),
      "-i", videoPath,
      "-frames:v", "1",
      "-q:v", "2",
      "-vf", "scale=1280:720",
      "-y",
      outPath,
    ];
    execFile("ffmpeg", args, { timeout: 30000 }, (err) => {
      if (err) return reject(new Error(`Frame extraction failed: ${err.message}`));
      resolve({ success: true, path: outPath });
    });
  });
}

/**
 * Call Claude API for highlight detection.
 * @param {string|Array} systemPrompt - Full system prompt (Sections A–F)
 * @param {Array} userContent - User message content array (text + images)
 * @param {PipelineLogger} logger
 * @returns {Promise<{ clips: Array, usage: { inputTokens: number, outputTokens: number } }>}
 */
async function callLLMForHighlights(systemPrompt, userContent, logger) {
  const provider = getProvider();
  const model = provider.defaultModel;

  logger.info(`LLM request via ${provider.name} (${model})`);

  const { text, usage } = await provider.chat({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
    maxTokens: 4096,
    timeout: 120000,
  });

  // Log usage
  logger.logApiUsage(usage.inputTokens, usage.outputTokens, model);

  if (!text) throw new Error("Empty response from LLM provider");

  // Robust JSON extraction — handles markdown fences, preamble text, etc.
  let clips;
  try {
    clips = aiPrompt.extractJSON(text, "array");
  } catch (e) {
    logger.logOutput("RAW_RESPONSE", text);
    throw new Error(`LLM returned invalid JSON: ${e.message}`);
  }

  if (!Array.isArray(clips)) {
    throw new Error("LLM response is not a JSON array");
  }

  return { clips, usage };
}

/**
 * Cut a clip using stream copy (fast, no re-encode).
 * Falls back to re-encode if stream copy fails.
 */
function cutClipFast(srcPath, outPath, startTime, endTime) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const args = [
      "-ss", String(startTime),
      "-to", String(endTime),
      "-i", srcPath,
      "-c", "copy",
      "-avoid_negative_ts", "make_zero",
      "-y",
      outPath,
    ];

    execFile("ffmpeg", args, { timeout: 600000 }, (err) => {
      if (err) {
        // Fallback to re-encode
        return ffmpeg.cutClip(srcPath, outPath, startTime, endTime)
          .then(resolve)
          .catch(reject);
      }
      resolve({ success: true, path: outPath, duration: endTime - startTime });
    });
  });
}

/**
 * Main AI pipeline orchestrator.
 *
 * @param {object} opts
 * @param {string} opts.sourceFile - Source video path
 * @param {object} opts.gameData - { game, gameTag, gameColor, name }
 * @param {string} opts.watchFolder - Watch folder path
 * @param {object} opts.store - electron-store instance
 * @param {function} opts.sendProgress - Progress callback (stage, pct, detail)
 * @returns {Promise<{ success: boolean, projectId: string, clipCount: number }>}
 */
async function runAIPipeline({ sourceFile, gameData, watchFolder, store, sendProgress }) {
  const processingDir = store.get("processingDir") || DEFAULT_PROCESSING_DIR;
  ensureProcessingDirs(processingDir);

  const videoName = path.basename(sourceFile, path.extname(sourceFile));
  const logger = new PipelineLogger(processingDir, videoName);
  const fileMetadataId = gameData.fileMetadataId || null;

  logger.info(`Source: ${sourceFile}`);
  logger.info(`Game: ${gameData.game} (${gameData.gameTag})`);
  if (fileMetadataId) logger.info(`File metadata ID: ${fileMetadataId}`);

  // Mark file as processing in SQLite
  updateFileStatus(fileMetadataId, "processing");

  try {
    // ============ Stage 0: Probe source file ============
    sendProgress("probing", 0, "Analyzing source file...");
    logger.startStep("Probe");
    const probeResult = await ffmpeg.probe(sourceFile);
    if (probeResult.error) throw new Error(`Probe failed: ${probeResult.error}`);
    logger.endStep("Probe", `${probeResult.duration.toFixed(1)}s, ${probeResult.width}x${probeResult.height}`);

    // ============ Stage 1: Create project ============
    sendProgress("creating", 3, "Creating project...");
    logger.startStep("Create Project");
    const projectTags = gameData.isTest ? ["test"] : [];
    const projResult = projects.createProject(watchFolder, {
      sourceFile,
      name: gameData.name || videoName,
      game: gameData.game || "Unknown",
      gameTag: gameData.gameTag || "",
      gameColor: gameData.gameColor || "#888",
      fileMetadataId: fileMetadataId,
      sourceDuration: probeResult.duration,
      tags: projectTags,
    });
    if (projResult.error) throw new Error(projResult.error);
    const project = projResult.project;
    logger.endStep("Create Project", project.id);

    // ============ Stage 2: Extract audio ============
    sendProgress("extracting", 5, "Extracting audio...");
    logger.startStep("Extract Audio");
    project.status = "transcribing";
    projects.saveProject(watchFolder, project);

    const wavPath = path.join(projects.getProjectsRoot(watchFolder), project.id, "audio.wav");
    const audioTrack = store.get("transcriptionAudioTrack") ?? 1;
    const audioResult = await ffmpeg.extractAudio(sourceFile, wavPath, audioTrack);
    if (audioResult.error) throw new Error(`Audio extraction failed: ${audioResult.error}`);
    logger.endStep("Extract Audio", wavPath);

    // ============ Stage 3: Transcribe (stable-ts) ============
    sendProgress("transcribing", 10, "Transcribing with stable-ts...");
    logger.startStep("Transcription");

    // Build game-aware vocabulary prompt for Whisper
    const gamesDb = store.get("gamesDb") || [];
    const gameEntry = (Array.isArray(gamesDb) ? gamesDb : Object.values(gamesDb)).find((g) => g.tag === gameData.gameTag);
    const entryType = gameEntry?.entryType || "game";
    let gameVocab = "";
    if (entryType === "game" && gameData.game) {
      // Include game name + hashtag as vocabulary hints
      gameVocab = `, ${gameData.game}`;
      if (gameEntry?.hashtag) gameVocab += `, ${gameEntry.hashtag}`;
    }

    const whisperOpts = {
      pythonPath: store.get("whisperPythonPath") || "",
      model: store.get("whisperModel") || "large-v3-turbo",
      language: "en",
      batchSize: 16,
      computeType: "float16",
      hfToken: store.get("hfToken") || "",
      hfHome: store.get("hfHome") || "D:\\whisper\\hf_cache",
      gameVocab,
      onProgress: (pct) => {
        sendProgress("transcribing", 10 + Math.round(pct * 0.3), `Transcribing... ${pct}%`);
      },
    };

    const transcription = await whisper.transcribe(wavPath, whisperOpts);
    if (transcription.error) throw new Error(`Transcription failed: ${transcription.error}`);
    project.transcription = transcription;
    project.status = "analyzing";
    projects.saveProject(watchFolder, project);
    logger.endStep("Transcription", `${(transcription.segments || []).length} segments`);

    // Write SRT for energy_scorer.py
    const srtPath = path.join(processingDir, "transcripts", `${videoName}.srt`);
    writeSrt(transcription, srtPath);
    logger.info(`SRT written to ${srtPath}`);

    // ============ Stage 4: Energy Analysis (energy_scorer.py) ============
    sendProgress("energy", 42, "Analyzing audio energy...");
    logger.startStep("Energy Analysis");
    const pythonPath = store.get("whisperPythonPath") || "D:\\whisper\\betterwhisperx-venv\\Scripts\\python.exe";
    const { energyJson, claudeReadyText } = await runEnergyScorer(
      pythonPath, sourceFile, srtPath, processingDir, logger
    );
    logger.endStep("Energy Analysis", `${energyJson.length} segments analyzed`);

    // ============ Stage 5: Frame Extraction (top 20 peaks) ============
    sendProgress("frames", 55, "Extracting peak energy frames...");
    logger.startStep("Frame Extraction");
    const framesDir = path.join(processingDir, "frames");
    const frames = await extractTopFrames(sourceFile, energyJson, framesDir, videoName, 20, logger);
    logger.endStep("Frame Extraction", `${frames.length} frames extracted`);

    // ============ Stage 6: Claude API Call ============
    sendProgress("claude", 65, "Claude is analyzing highlights...");
    logger.startStep("Claude Analysis");

    // Ensure game profile exists (skip for content types)
    if (entryType === "game") {
      gameProfiles.ensureProfile(gameData.gameTag, gameData.game);
    }

    // Get game context (AI-researched description from game library)
    const gameContext = gameEntry?.aiContext || "";

    // Get few-shot examples from feedback DB
    const approvedClips = feedback.getApprovedClips(gameData.gameTag, 20);

    const creatorProfile = store.get("creatorProfile") || undefined;

    const systemPrompt = aiPrompt.buildSystemPrompt({
      gameTag: gameData.gameTag,
      gameName: gameData.game,
      gameContext,
      entryType,
      approvedClips,
      creatorProfile,
    });

    const userContent = aiPrompt.buildUserContent({
      claudeReadyText,
      frames,
    });

    const claudeResult = await callLLMForHighlights(systemPrompt, userContent, logger);
    const aiClips = claudeResult.clips;
    logger.endStep("Claude Analysis", `${aiClips.length} clips identified`);

    // ============ Stage 7: Cut Clips ============
    sendProgress("cutting", 75, `Cutting ${aiClips.length} clips...`);
    logger.startStep("Clip Cutting");
    project.status = "clipping";
    projects.saveProject(watchFolder, project);

    const clipsDir = projects.getClipsDir(watchFolder, project.id);
    const totalClips = aiClips.length;

    for (let i = 0; i < totalClips; i++) {
      const clip = aiClips[i];
      const clipNum = String(i + 1).padStart(3, "0");
      const clipFileName = `clip_${clipNum}.mp4`;
      const clipPath = path.join(clipsDir, clipFileName);
      const thumbPath = path.join(clipsDir, `clip_${clipNum}_thumb.jpg`);

      const startSec = aiPrompt.parseTimestamp(clip.start);
      const endSec = aiPrompt.parseTimestamp(clip.end);

      const pct = 75 + Math.round((i / totalClips) * 20);
      sendProgress("cutting", pct, `Cutting clip ${i + 1}/${totalClips}...`);

      try {
        await ffmpeg.cutClip(sourceFile, clipPath, startSec, endSec);
      } catch (e) {
        logger.info(`Clip ${i + 1} cut failed: ${e.message}`);
        continue;
      }

      // Generate thumbnail at midpoint
      const thumbTime = startSec + (endSec - startSec) / 2;
      try {
        await ffmpeg.generateThumbnail(sourceFile, thumbPath, thumbTime);
      } catch (e) { /* non-critical */ }

      // Slice word-level timestamps from source transcription for this clip's time range
      // Offset all timestamps to be clip-local (0-based)
      const clipSubs = sliceSubtitlesFromSource(transcription, startSec, endSec);

      project.clips.push({
        id: projects.generateClipId(),
        title: clip.title || "",
        caption: clip.title || "",
        startTime: startSec,
        endTime: endSec,
        highlightScore: Math.round((clip.confidence || 0) * 100),
        highlightReason: clip.why || "",
        peakQuote: clip.peak_quote || "",
        energyLevel: clip.energy_level || "",
        confidence: clip.confidence || 0,
        hasFrame: clip.has_frame || false,
        status: "none",
        subtitles: { sub1: clipSubs, sub2: [] },
        sfx: [],
        media: [],
        renderStatus: "pending",
        renderPath: null,
        filePath: clipPath,
        thumbnailPath: fs.existsSync(thumbPath) ? thumbPath : null,
        createdAt: new Date().toISOString(),
      });
    }

    logger.endStep("Clip Cutting", `${project.clips.length} clips cut successfully`);

    // ============ Stage 7b: Per-Clip Retranscription ============
    // Source-level transcription can hallucinate on long gaming audio.
    // Each clip is short (30-90s) — retranscribing directly on the clip audio
    // produces far more accurate word-level subtitles with no slicing artifacts.
    sendProgress("transcribing-clips", 95, "Retranscribing clips for accurate subtitles...");
    logger.startStep("Clip Retranscription");
    let retranscribeCount = 0;
    for (let i = 0; i < project.clips.length; i++) {
      const clip = project.clips[i];
      if (!clip.filePath || !fs.existsSync(clip.filePath)) continue;
      try {
        const clipWav = clip.filePath.replace(/\.[^.]+$/, "-retranscribe.wav");
        await ffmpeg.extractAudio(clip.filePath, clipWav, audioTrack);
        const clipTranscription = await whisper.transcribe(clipWav, whisperOpts);
        try { fs.unlinkSync(clipWav); } catch (_) {}
        clip.transcription = clipTranscription;
        retranscribeCount++;
        const pct = 95 + Math.round(((i + 1) / project.clips.length) * 2);
        sendProgress("transcribing-clips", pct, `Retranscribed clip ${i + 1}/${project.clips.length}`);
      } catch (e) {
        // Flag the clip so the user knows retranscription failed
        clip.transcriptionFailed = true;
        clip.transcriptionError = e.message;
        logger.warn(`Clip ${i + 1} retranscription failed: ${e.message}`);
      }
    }
    logger.endStep("Clip Retranscription", `${retranscribeCount}/${project.clips.length} clips retranscribed`);

    // ============ Stage 8: Save Project ============
    sendProgress("saving", 97, "Saving project...");
    logger.startStep("Save Project");
    project.status = "ready";
    projects.saveProject(watchFolder, project);
    logger.endStep("Save Project");

    // Clean up wav file
    try { fs.unlinkSync(wavPath); } catch (e) { /* ignore */ }

    // Increment game session count (for profile auto-update)
    const thresholdReached = gameProfiles.incrementSessionCount(gameData.gameTag);

    // Mark file as done in SQLite + apply any queued retroactive renames
    updateFileStatus(fileMetadataId, "done");
    applyPendingRenames(fileMetadataId);

    sendProgress("complete", 100, `Generated ${project.clips.length} clips`);
    logger.info(`Pipeline complete: ${project.clips.length} clips generated`);
    const logPath = logger.finalize();

    return {
      success: true,
      projectId: project.id,
      clipCount: project.clips.length,
      logPath,
      profileUpdateNeeded: thresholdReached,
      gameTag: gameData.gameTag,
      apiCost: logger.apiCost,
    };
  } catch (err) {
    // Revert status back to renamed on failure
    updateFileStatus(fileMetadataId, "renamed");
    applyPendingRenames(fileMetadataId);

    logger.failStep("Pipeline", err.message);
    logger.finalize();
    sendProgress("failed", 0, err.message);
    return { error: err.message };
  }
}

module.exports = {
  runAIPipeline,
  ensureProcessingDirs,
  DEFAULT_PROCESSING_DIR,
};
