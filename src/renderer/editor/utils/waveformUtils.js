/**
 * Extract waveform peaks from a video/audio file using Web Audio API.
 * Returns an array of normalized amplitude values (0–1) or null on failure.
 *
 * @param {string} filePath — absolute file path
 * @param {number} peakCount — number of peaks to extract (default 800)
 * @returns {Promise<Float32Array|null>}
 */
export async function extractWaveformPeaks(filePath, peakCount = 800) {
  try {
    // Fetch the file as an ArrayBuffer
    // Electron file:// protocol should work if webSecurity is relaxed,
    // otherwise fall back to IPC-based file reading
    const url = `file://${filePath.replace(/\\/g, "/")}`;
    let arrayBuffer;

    try {
      const response = await fetch(url);
      arrayBuffer = await response.arrayBuffer();
    } catch (err) {
      console.warn("Waveform: Cannot read file:", err.message);
      return null;
    }

    // Decode audio from the buffer
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    audioCtx.close();

    // Get the first channel's raw data
    const rawData = audioBuffer.getChannelData(0);
    const samplesPerPeak = Math.floor(rawData.length / peakCount);
    const peaks = new Float32Array(peakCount);

    for (let i = 0; i < peakCount; i++) {
      const start = i * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, rawData.length);
      let max = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(rawData[j]);
        if (abs > max) max = abs;
      }
      peaks[i] = max;
    }

    // Normalize to 0–1
    let globalMax = 0;
    for (let i = 0; i < peaks.length; i++) {
      if (peaks[i] > globalMax) globalMax = peaks[i];
    }
    if (globalMax > 0) {
      for (let i = 0; i < peaks.length; i++) {
        peaks[i] = peaks[i] / globalMax;
      }
    }

    return peaks;
  } catch (err) {
    console.warn("Waveform extraction failed:", err.message);
    return null;
  }
}
