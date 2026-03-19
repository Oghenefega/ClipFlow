const path = require("path");
const fs = require("fs");

/**
 * Structured logger for AI pipeline runs.
 * Creates per-video log files in the processing/logs/ directory.
 */
class PipelineLogger {
  constructor(processingDir, videoName) {
    const logsDir = path.join(processingDir, "logs");
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

    const timestamp = Date.now();
    const safeName = videoName.replace(/[^a-zA-Z0-9_-]/g, "_");
    this.logPath = path.join(logsDir, `${safeName}_${timestamp}.log`);
    this.videoName = videoName;
    this.entries = [];
    this.stepTimers = {};
    this.apiCost = 0;
    this.apiTokens = { input: 0, output: 0 };
    this.success = true;
    this.startTime = Date.now();
  }

  /** Start timing a pipeline step */
  startStep(stepName) {
    this.stepTimers[stepName] = Date.now();
    this._append(`[START] ${stepName}`);
  }

  /** End timing a pipeline step */
  endStep(stepName, detail) {
    const elapsed = this.stepTimers[stepName]
      ? ((Date.now() - this.stepTimers[stepName]) / 1000).toFixed(1)
      : "?";
    this._append(`[DONE]  ${stepName} (${elapsed}s)${detail ? ` — ${detail}` : ""}`);
  }

  /** Log a step failure */
  failStep(stepName, error) {
    const elapsed = this.stepTimers[stepName]
      ? ((Date.now() - this.stepTimers[stepName]) / 1000).toFixed(1)
      : "?";
    this.success = false;
    this._append(`[FAIL]  ${stepName} (${elapsed}s)`);
    this._append(`        Error: ${error}`);
  }

  /** Log a subprocess command */
  logCommand(cmd, args) {
    this._append(`[CMD]   ${cmd} ${(args || []).join(" ")}`);
  }

  /** Log subprocess output */
  logOutput(label, text) {
    if (!text) return;
    const trimmed = String(text).trim();
    if (trimmed.length > 2000) {
      this._append(`[${label}]  (${trimmed.length} chars, truncated)`);
      this._append(trimmed.substring(0, 2000) + "...");
    } else {
      this._append(`[${label}]  ${trimmed}`);
    }
  }

  /** Log Claude API usage */
  logApiUsage(inputTokens, outputTokens, model) {
    this.apiTokens.input = inputTokens;
    this.apiTokens.output = outputTokens;
    // Sonnet 4.6 pricing: $3/M input, $15/M output
    const inputCost = (inputTokens / 1_000_000) * 3;
    const outputCost = (outputTokens / 1_000_000) * 15;
    this.apiCost = inputCost + outputCost;
    this._append(`[API]   Model: ${model}`);
    this._append(`        Input: ${inputTokens} tokens ($${inputCost.toFixed(4)})`);
    this._append(`        Output: ${outputTokens} tokens ($${outputCost.toFixed(4)})`);
    this._append(`        Total: $${this.apiCost.toFixed(4)}`);
  }

  /** Log info message */
  info(msg) {
    this._append(`[INFO]  ${msg}`);
  }

  /** Finalize and write the log file */
  finalize() {
    const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const header = [
      `=== ClipFlow AI Pipeline Log ===`,
      `Video: ${this.videoName}`,
      `Date: ${new Date(this.startTime).toLocaleString()}`,
      `Status: ${this.success ? "SUCCESS" : "FAILED"}`,
      `Total time: ${totalTime}s`,
      `API cost: $${this.apiCost.toFixed(4)} (${this.apiTokens.input} in / ${this.apiTokens.output} out)`,
      `${"=".repeat(40)}`,
      "",
    ].join("\n");

    const content = header + this.entries.join("\n") + "\n";
    fs.writeFileSync(this.logPath, content, "utf-8");
    return this.logPath;
  }

  /** Get a summary object for the log viewer */
  getSummary() {
    return {
      path: this.logPath,
      videoName: this.videoName,
      success: this.success,
      apiCost: this.apiCost,
      apiTokens: this.apiTokens,
      totalTimeMs: Date.now() - this.startTime,
      date: new Date(this.startTime).toLocaleString(),
    };
  }

  _append(line) {
    const now = new Date();
    const ts = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
    this.entries.push(`${ts} ${line}`);
  }
}

/**
 * List all log files in the processing/logs/ directory.
 * Returns summaries sorted by date (newest first).
 */
function listLogs(processingDir) {
  const logsDir = path.join(processingDir, "logs");
  if (!fs.existsSync(logsDir)) return [];

  const files = fs.readdirSync(logsDir)
    .filter((f) => f.endsWith(".log"))
    .map((f) => {
      const fullPath = path.join(logsDir, f);
      const stats = fs.statSync(fullPath);
      // Parse first few lines for summary
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");
      const statusLine = lines.find((l) => l.startsWith("Status:")) || "";
      const costLine = lines.find((l) => l.startsWith("API cost:")) || "";
      const videoLine = lines.find((l) => l.startsWith("Video:")) || "";

      const costMatch = costLine.match(/\$(\d+\.\d+)/);
      return {
        filename: f,
        path: fullPath,
        videoName: videoLine.replace("Video: ", "").trim(),
        success: statusLine.includes("SUCCESS"),
        partialFailure: statusLine.includes("PARTIAL"),
        apiCost: costMatch ? parseFloat(costMatch[1]) : 0,
        date: stats.mtime.toLocaleString(),
        size: stats.size,
      };
    });

  files.sort((a, b) => new Date(b.date) - new Date(a.date));
  return files;
}

/**
 * Read a log file's full content.
 */
function readLog(logPath) {
  if (!fs.existsSync(logPath)) return null;
  return fs.readFileSync(logPath, "utf-8");
}

/**
 * Delete logs older than N days.
 */
function deleteOldLogs(processingDir, retentionDays = 30) {
  const logsDir = path.join(processingDir, "logs");
  if (!fs.existsSync(logsDir)) return 0;

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let deleted = 0;

  for (const f of fs.readdirSync(logsDir)) {
    const fullPath = path.join(logsDir, f);
    const stats = fs.statSync(fullPath);
    if (stats.mtime.getTime() < cutoff) {
      fs.unlinkSync(fullPath);
      deleted++;
    }
  }
  return deleted;
}

/**
 * Get monthly cost total from log files.
 */
function getMonthlyCost(processingDir) {
  const logs = listLogs(processingDir);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let total = 0;
  let videoCount = 0;
  for (const log of logs) {
    if (new Date(log.date) >= monthStart) {
      total += log.apiCost;
      videoCount++;
    }
  }
  return { total: Math.round(total * 100) / 100, videoCount };
}

module.exports = {
  PipelineLogger,
  listLogs,
  readLog,
  deleteOldLogs,
  getMonthlyCost,
};
