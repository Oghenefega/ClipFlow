const { execFile, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const https = require("https");
const ffmpeg = require("./ffmpeg");
const projects = require("./projects");
const whisper = require("./whisper");
const aiPrompt = require("./ai-prompt");
const gameProfiles = require("./game-profiles");
const feedback = require("./feedback");
const { PipelineLogger } = require("./pipeline-logger");

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
    const args = [scriptPath, videoPath, srtPath];

    logger.logCommand(pythonPath, args);

    const child = spawn(pythonPath, args, {
      timeout: 600000, // 10 min
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
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
 * @param {string} apiKey - Anthropic API key
 * @param {string} systemPrompt - Full system prompt (Sections A–F)
 * @param {Array} userContent - User message content array (text + images)
 * @param {PipelineLogger} logger
 * @returns {Promise<{ clips: Array, usage: { input_tokens, output_tokens } }>}
 */
function callClaudeApi(apiKey, systemPrompt, userContent, logger) {
  return new Promise((resolve, reject) => {
    const body = {
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    };

    const payload = JSON.stringify(body);
    logger.info(`Claude API request: ${(payload.length / 1024).toFixed(1)} KB payload`);

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const result = JSON.parse(data);

          if (result.error) {
            return reject(new Error(`Claude API error: ${result.error.message || JSON.stringify(result.error)}`));
          }

          // Log usage
          const usage = result.usage || {};
          logger.logApiUsage(
            usage.input_tokens || 0,
            usage.output_tokens || 0,
            "claude-sonnet-4-5-20250514"
          );

          // Extract JSON from response
          if (!result.content || result.content.length === 0) {
            return reject(new Error("Empty response from Claude"));
          }

          const textContent = result.content.find((c) => c.type === "text");
          if (!textContent) return reject(new Error("No text in Claude response"));

          // Parse JSON — may have markdown fences
          let jsonStr = textContent.text;
          const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) jsonStr = jsonMatch[1];
          jsonStr = jsonStr.trim();

          let clips;
          try {
            clips = JSON.parse(jsonStr);
          } catch (e) {
            logger.logOutput("RAW_RESPONSE", textContent.text);
            return reject(new Error(`Claude returned invalid JSON: ${e.message}`));
          }

          if (!Array.isArray(clips)) {
            return reject(new Error("Claude response is not a JSON array"));
          }

          resolve({ clips, usage });
        } catch (e) {
          reject(new Error(`Failed to parse Claude response: ${e.message}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error("Claude API request timed out after 120s"));
    });
    req.write(payload);
    req.end();
  });
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

  logger.info(`Source: ${sourceFile}`);
  logger.info(`Game: ${gameData.game} (${gameData.gameTag})`);

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
    const projResult = projects.createProject(watchFolder, {
      sourceFile,
      name: gameData.name || videoName,
      game: gameData.game || "Unknown",
      gameTag: gameData.gameTag || "",
      gameColor: gameData.gameColor || "#888",
      sourceDuration: probeResult.duration,
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
    const audioResult = await ffmpeg.extractAudio(sourceFile, wavPath);
    if (audioResult.error) throw new Error(`Audio extraction failed: ${audioResult.error}`);
    logger.endStep("Extract Audio", wavPath);

    // ============ Stage 3: Transcribe (BetterWhisperX) ============
    sendProgress("transcribing", 10, "Transcribing with BetterWhisperX...");
    logger.startStep("Transcription");
    const whisperOpts = {
      pythonPath: store.get("whisperPythonPath") || "",
      model: store.get("whisperModel") || "large-v3-turbo",
      language: "en",
      batchSize: 16,
      computeType: "float16",
      hfToken: store.get("hfToken") || "",
      hfHome: store.get("hfHome") || "D:\\whisper\\hf_cache",
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

    const apiKey = store.get("anthropicApiKey");
    if (!apiKey) throw new Error("Anthropic API key not configured. Go to Settings.");

    // Ensure game profile exists
    gameProfiles.ensureProfile(gameData.gameTag, gameData.game);

    // Get game context (AI-researched description from game library)
    const gamesDb = store.get("gamesDb") || {};
    const gameEntry = Object.values(gamesDb).find((g) => g.tag === gameData.gameTag);
    const gameContext = gameEntry?.aiContext || "";

    // Get few-shot examples from feedback DB
    await feedback.init();
    const approvedClips = feedback.getApprovedClips(gameData.gameTag, 20);

    const systemPrompt = aiPrompt.buildSystemPrompt({
      gameTag: gameData.gameTag,
      gameName: gameData.game,
      gameContext,
      approvedClips,
    });

    const userContent = aiPrompt.buildUserContent({
      claudeReadyText,
      frames,
    });

    const claudeResult = await callClaudeApi(apiKey, systemPrompt, userContent, logger);
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
        await cutClipFast(sourceFile, clipPath, startSec, endSec);
      } catch (e) {
        logger.info(`Clip ${i + 1} cut failed: ${e.message}`);
        continue;
      }

      // Generate thumbnail at midpoint
      const thumbTime = startSec + (endSec - startSec) / 2;
      try {
        await ffmpeg.generateThumbnail(sourceFile, thumbPath, thumbTime);
      } catch (e) { /* non-critical */ }

      // Extract subtitle segments from transcription for this clip
      const clipSubtitles = (transcription.segments || [])
        .filter((s) => s.start < endSec && s.end > startSec)
        .map((s) => ({
          start: Math.max(0, s.start - startSec),
          end: Math.min(endSec - startSec, s.end - startSec),
          text: s.text,
          words: (s.words || []).map((w) => ({
            ...w,
            start: Math.max(0, w.start - startSec),
            end: Math.min(endSec - startSec, w.end - startSec),
          })),
        }));

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
        subtitles: { sub1: clipSubtitles, sub2: [] },
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

    sendProgress("complete", 100, `Generated ${project.clips.length} clips`);
    logger.info(`Pipeline complete: ${project.clips.length} clips generated`);
    const logPath = logger.finalize();

    return {
      success: true,
      projectId: project.id,
      clipCount: project.clips.length,
      logPath,
      profileUpdateNeeded: thresholdReached,
      apiCost: logger.apiCost,
    };
  } catch (err) {
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
