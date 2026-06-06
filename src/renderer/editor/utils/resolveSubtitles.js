/**
 * Shared subtitle resolver — the single source of truth behind BOTH the editor
 * (useSubtitleStore.initSegments) and the Projects preview (resolvePreviewSegments),
 * so the two can never diverge again (#110).
 *
 * Owns three of the four historical divergence surfaces:
 *   1. Source selection — the 5-source priority chain (editor-saved → clip.transcription
 *      → pipeline sub1 → legacy array → project.transcription).
 *   2. Extras merge — source-wide project.transcription to cover clip *extends*.
 *      EDITOR-ONLY: gated behind `includeExtras`. The preview shows the saved clip range,
 *      so it never needs extends and must NOT pull them in.
 *   3. Cleanup + word repair — mega-segment filter, segment dedup, consecutive-word dedup,
 *      then mergeWordTokens → validateWords → cleanWordTimestamps.
 *
 * Chunking (surface 4) stays at each caller's display edge (editor: applyTemplate /
 * setSegmentMode; preview: segmentWords), keyed off the returned `isPreChunked` flag.
 *
 * Extracted VERBATIM from initSegments so the editor's output stays byte-identical.
 * Pure function — no React, no Zustand. Logging is gated behind `verbose` so the editor
 * keeps its `[initSegments] …` Sentry breadcrumbs while preview cards resolve silently.
 */

import { cleanWordTimestamps } from "./cleanWordTimestamps";
import { mergeWordTokens, validateWords } from "./wordRepair";

/**
 * @param {Object} clip - clip object (subtitles, transcription, startTime, endTime, duration)
 * @param {Object} project - parent project (project.transcription fallback / extras)
 * @param {Object} [opts]
 * @param {boolean} [opts.includeExtras=false] - merge source-wide extras for extends (editor-only)
 * @param {boolean} [opts.verbose=false] - emit the `[initSegments] …` debug/breadcrumb logs
 * @returns {{ segments: Array<{start:number,end:number,text:string,words:Array}>,
 *   isPreChunked: boolean, clipOrigin: number, source: string|null }}
 *   `segments` are SOURCE-ABSOLUTE and repaired; `source` is null when no data exists.
 */
export function resolveClipSubtitles(clip, project, { includeExtras = false, verbose = false } = {}) {
  if (!clip) {
    return { segments: [], isPreChunked: false, clipOrigin: 0, source: null };
  }
  const log = verbose ? console.log : () => {};
  const warn = verbose ? console.warn : () => {};

  // Priority: 1) clip.transcription (re-transcribed, IF still valid for current duration),
  //           2) clip.subtitles.sub1 (pipeline-generated or editor-saved),
  //           3) project.transcription (source-level, already source-absolute)
  const hasClipTranscription = !!clip?.transcription?.segments?.length;
  const hasClipSubtitles = clip?.subtitles?.sub1?.length > 0;
  const hasProjectTranscription = !!project?.transcription?.segments?.length;
  const clipOrigin = clip.startTime || 0; // source-absolute origin for this clip

  // Detect stale transcription: if its time span significantly exceeds clip duration,
  // it was made before a trim and no longer matches the current video file
  let transcriptionIsStale = false;
  if (hasClipTranscription) {
    const segs = clip.transcription.segments;
    const lastEnd = Math.max(...segs.map(s => s.end || 0));
    const clipDur = clip.duration || 0;
    if (clipDur > 0 && lastEnd > clipDur * 1.5) {
      warn(`[initSegments] Stale transcription detected: spans ${lastEnd.toFixed(1)}s but clip is ${clipDur.toFixed(1)}s — skipping`);
      transcriptionIsStale = true;
    }
  }

  let segments;
  let sourceOffset = 0;          // amount to ADD to convert raw timestamps → source-absolute
  let rawIsSourceAbsolute = false; // whether raw data is already in source time

  // #78: editor-saved edits (_format "source-absolute", written only by the editor
  // save path) are the user's authoritative copy and must win over raw
  // clip.transcription, which the editor never updates. Pipeline-born sub1 has no
  // _format, so fresh never-edited clips still prefer the accurate retranscription.
  const hasEditorSavedSubs = hasClipSubtitles && clip.subtitles._format === "source-absolute";

  if (hasEditorSavedSubs) {
    // Editor-saved: already source-absolute, clip-bounded (#84 filter on save).
    // sub1 objects are persisted editSegments — they carry display-STRING start/end
    // ("00:05.0") alongside the numeric startSec/endSec. The shared primaryRaw map
    // below does `s.start + sourceOffset`; reading the strings makes that string
    // concatenation → NaN downstream → dropped segments → empty panel (#78/#84).
    // Normalize to the numeric {start,end} shape the pipeline expects (words are
    // already numeric, source-absolute).
    segments = clip.subtitles.sub1.map((s) => ({
      start: s.startSec,
      end: s.endSec,
      text: s.text,
      words: s.words,
    }));
    sourceOffset = 0;
    rawIsSourceAbsolute = true;
  } else if (hasClipTranscription && !transcriptionIsStale) {
    // Re-transcribed: clip-relative (0-based) → add clipOrigin for source-absolute
    segments = clip.transcription.segments;
    sourceOffset = clipOrigin;
    rawIsSourceAbsolute = false;
  } else if (hasClipSubtitles) {
    // Pipeline-generated sub1 (no _format): clip-relative (0-based)
    segments = clip.subtitles.sub1;
    sourceOffset = clipOrigin;
    rawIsSourceAbsolute = false;
  } else if (Array.isArray(clip?.subtitles) && clip.subtitles.length > 0) {
    // Legacy: editor saved as flat array before format fix (clip-relative)
    segments = clip.subtitles;
    sourceOffset = clipOrigin;
    rawIsSourceAbsolute = false;
  } else if (hasProjectTranscription) {
    // Source-level transcription: already source-absolute
    segments = project.transcription.segments;
    sourceOffset = 0;
    rawIsSourceAbsolute = true;
  } else {
    return { segments: [], isPreChunked: false, clipOrigin, source: null };
  }

  const effectiveSource = hasEditorSavedSubs
    ? "clip-subtitles-edited"
    : hasClipTranscription && !transcriptionIsStale
      ? "clip-transcription"
      : hasClipSubtitles
        ? "clip-subtitles"
        : Array.isArray(clip?.subtitles) && clip.subtitles.length > 0
          ? "clip-subtitles-legacy"
          : "project-transcription";
  log(`[initSegments] source=${effectiveSource}, sourceOffset=${sourceOffset.toFixed(2)}, rawIsSourceAbsolute=${rawIsSourceAbsolute}, segments=${segments.length}`);

  // ─── Normalize primary segments to source-absolute time ───────────────
  // After this step everything downstream works in source-absolute, so the
  // primary-vs-extras distinction disappears before the cleanup pipeline runs.
  // Number() guards against a timestamp persisted as a string (e.g. legacy data
  // where startSec was saved as "5.2" instead of 5.2). "5.2" + sourceOffset
  // string-concatenates, then a downstream .toFixed() throws — the Sentry
  // "x.toFixed is not a function" crash in initSegments. All five source branches
  // converge here, so this is the single choke point that protects every one.
  // Number("5.2") === 5.2; Number(5.2) is an identity no-op for healthy data.
  const primaryRaw = segments.map((s) => ({
    start: Number(s.start) + sourceOffset,
    end: Number(s.end) + sourceOffset,
    text: s.text,
    words: (s.words || []).map((w) => ({
      word: w.word,
      start: Number(w.start ?? s.start) + sourceOffset,
      end: Number(w.end ?? s.end) + sourceOffset,
      probability: w.probability ?? 1,
    })),
  }));

  // ─── Pull source-wide extras when primary is clip-bounded ─────────────
  // Primary clip.transcription / clip.subtitles covers only [clip.startTime,
  // clip.endTime]. If the user extends the clip past those bounds we need
  // project.transcription (source-wide) to populate the newly-visible audio.
  // Union happens BEFORE the cleanup pipeline so extras get the SAME
  // mega-segment filter / dedup / word-repair the primary data gets —
  // otherwise whisperx artifacts in project.transcription leak only into
  // extended regions, creating inconsistent subtitle quality within a clip.
  // EDITOR-ONLY: the preview shows the saved clip range and never extends, so
  // includeExtras is false there (don't let source-wide segments leak in).
  const primaryIsProjectTranscription = effectiveSource === "project-transcription";
  let extrasRaw = [];
  if (includeExtras && hasProjectTranscription && !primaryIsProjectTranscription) {
    const overlapsPrimary = (start, end) =>
      primaryRaw.some((p) => start < p.end && end > p.start);
    extrasRaw = project.transcription.segments
      .filter((s) => !overlapsPrimary(s.start, s.end))
      .map((s) => ({
        start: s.start, // project.transcription is already source-absolute
        end: s.end,
        text: s.text,
        words: (s.words || []).map((w) => ({
          word: w.word,
          start: w.start ?? s.start,
          end: w.end ?? s.end,
          probability: w.probability ?? 1,
        })),
      }));
    if (extrasRaw.length > 0) {
      log(`[initSegments] Merged ${extrasRaw.length} source-wide segments from project.transcription for extends coverage`);
    }
  }

  const unionRaw = [...primaryRaw, ...extrasRaw].sort((a, b) => a.start - b.start);

  // ─── Cleanup pipeline (runs once over the unioned raw segments) ───────

  // Filter out "mega-segments" — transcription artifacts where stable-ts/Whisper
  // outputs a single segment spanning the entire audio with all words crammed in,
  // alongside proper sentence-level segments. The mega-segment has compressed
  // word timestamps that cause ghost subtitles racing ahead during pauses.
  const clipDur = clip.endTime && clip.startTime ? (clip.endTime - clip.startTime) : (clip.duration || 0);
  // #115: editor-saved subs are the user's authoritative, already-curated copy —
  // skip the whisperx-artifact cleanups (mega-filter here, segment dedup + empty-drop
  // below) that would delete legit hand-split short segments or new blank ones. Raw
  // transcription still gets the full cleanup on its first load (hasEditorSavedSubs false).
  const filteredSegments = (!hasEditorSavedSubs && unionRaw.length > 1)
    ? unionRaw.filter((s) => {
        const segDur = (s.end || 0) - (s.start || 0);
        const wordCount = s.words?.length || 0;
        const isMega = segDur > 0 && clipDur > 0 && segDur > clipDur * 0.85 && wordCount > 20;
        if (isMega) {
          warn(`[initSegments] Filtering mega-segment: ${segDur.toFixed(1)}s, ${wordCount} words (clip ${clipDur.toFixed(1)}s)`);
        }
        return !isMega;
      })
    : unionRaw;

  // Remove overlapping duplicate segments — whisperx sometimes emits two segments
  // covering the same time range with the same words
  const stripPunct = (t) => (t || "").toLowerCase().replace(/[.,!?;:'"]+/g, "").trim();
  // #115: skip the segment dedup for editor-saved data — a hand-split short phrase
  // ("This guy" → "This" + "guy" ~0.12-0.24s apart) trips the 0.3s start+end test and
  // the second half is silently dropped, then lost permanently on the next autosave.
  let deduped;
  if (hasEditorSavedSubs) {
    deduped = filteredSegments;
  } else {
    deduped = [];
    for (const s of filteredSegments) {
      const overlap = deduped.find(
        (d) => Math.abs(d.start - s.start) < 0.3 && Math.abs(d.end - s.end) < 0.3
      );
      if (!overlap) deduped.push(s);
    }
    if (deduped.length < filteredSegments.length) {
      log(`[initSegments] Removed ${filteredSegments.length - deduped.length} duplicate overlapping segments`);
    }
  }

  // Remove consecutive duplicate words within segments — whisperx sometimes
  // outputs the same word twice with slightly different timestamps (e.g. "friendly," then "friendly")
  for (const s of deduped) {
    if (!s.words || s.words.length < 2) continue;
    const cleaned = [s.words[0]];
    for (let i = 1; i < s.words.length; i++) {
      const prev = s.words[i - 1];
      const curr = s.words[i];
      if (stripPunct(curr.word) === stripPunct(prev.word) && Math.abs(curr.start - prev.end) < 0.5) {
        // Keep the first occurrence but extend its end time
        cleaned[cleaned.length - 1] = { ...cleaned[cleaned.length - 1], end: curr.end };
      } else {
        cleaned.push(curr);
      }
    }
    if (cleaned.length < s.words.length) {
      log(`[initSegments] Deduped ${s.words.length - cleaned.length} consecutive duplicate words in segment "${(s.text || "").slice(0, 30)}"`);
      s.words = cleaned;
      s.text = cleaned.map((w) => w.word).join(" ");
    }
  }

  // ─── Final repaired, source-absolute segments ─────────────────────────
  // Timestamps stay source-absolute; each caller converts to its own display
  // domain at the edge. Word repair (token merge → clamp → timestamp clean) runs
  // here so the editor and the preview see identical words.
  const resolvedSegments = deduped
    .map((s, i) => {
      const segStartSec = s.start;
      const segEndSec = s.end;

      const rawWords = mergeWordTokens(s.words, s.text);
      const validatedWords = validateWords(rawWords, segStartSec, segEndSec);
      const repairedWords = cleanWordTimestamps(validatedWords, {
        segStart: segStartSec,
        segEnd: segEndSec,
      });

      if (i === 0) {
        log(`[initSegments] First seg (source-abs): [${segStartSec.toFixed(2)}-${segEndSec.toFixed(2)}], text="${(s.text || "").slice(0, 40)}"`);
        if (repairedWords.length > 0) {
          log(`[initSegments] First word: "${repairedWords[0].word}" at ${repairedWords[0].start.toFixed(3)}-${repairedWords[0].end.toFixed(3)}`);
        }
      }

      // Rebuild segment text from surviving words (boundary trim may have removed some).
      // mergeWordTokens rebuilds each word from segmentText.split(/\s+/) → bare words
      // with NO leading space, so they must be joined WITH a space. Editor-saved clips
      // set _skipNextSegmentation, so this text is final for them (no applyTemplate
      // re-chunk to fix it) — join("") here collapsed words into "andreconnecting".
      const segText = repairedWords.length > 0
        ? repairedWords.map((w) => w.word).join(" ").trim()
        : s.text;

      return {
        start: segStartSec,   // SOURCE-ABSOLUTE
        end: segEndSec,       // SOURCE-ABSOLUTE
        text: segText || s.text,
        words: repairedWords, // word.start/end are SOURCE-ABSOLUTE
      };
    })
    // #115: keep blank segments for editor-saved data — a newly-created (still-empty)
    // subtitle must persist so the user can type into it on reopen. Raw transcription
    // still drops empties left by boundary trim.
    .filter((s) => hasEditorSavedSubs || s.words.length > 0 || (s.text || "").trim().length > 0);

  return {
    segments: resolvedSegments,
    isPreChunked: hasEditorSavedSubs,
    clipOrigin,
    source: effectiveSource,
  };
}
