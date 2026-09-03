"""
Word-start refinement for Corva subtitles (#356, #357).

Measured on Fega's 121 approved clips (tasks/specs/subtitle-timing-learning-2026-09-02.md,
section 10): stable-ts word starts are within 100 ms of his hand-fixed timing for 78% of
words. The misses are (a) the first word of an utterance stretched back over the pause or the
previous word's tail, and (b) inner/last words whose boundary inside continuous speech sits too
late or too early. Every word start becomes the median of four independent opinions:

  raw        stable-ts as transcribed (Whisper cross-attention + refine)              78.4% alone
  hubert     HuBERT-large CTC forced alignment of the SAME text, through whisperx.align
             (MIT, 1.2 GB, torchaudio HUBERT_ASR_LARGE)                                82.1%
  vosk       Kaldi HMM recogniser with its grammar pinned to the transcript
             (Apache-2.0, 205 MB, CPU only)                                            83.0%
  parakeet   NVIDIA parakeet-tdt-0.6b-v2 transducer via sherpa-onnx, free transcription
             matched to the words by text (CC-BY-4.0 model, Apache-2.0 runtime, CPU)   67.8%

Each voter alone is roughly as good as raw and disturbs 12-28% of the words Fega left alone,
but they miss DIFFERENT words (four technologies, four failure modes), so the plain per-word
median, scored through THIS function (study section 10f), lands 86.1% of words within 100 ms of
his finals (alpha.22's median of three 84.1%), fixes 55% of the first words and 66% of the
inner/last words he had to move, and disturbs 6-8% of the ones he left. Votes of five or more do
not beat four; Whisper-family voters (a second Whisper backbone, WhisperX-VAD) share raw's
failure mode and LOWER every set.

Ladder when a voter is missing (model not downloaded, package absent, CPU too slow), each row
scored the same way:
  3 opinions -> median4 (86.1%)
  2 opinions -> median3, strict median of raw + two (hubert+vosk 85.1%, vosk+parakeet 83.8%,
                hubert+parakeet 83.7%)
  1 opinion  -> hubert (81.7%) or vosk (83.3%) alone override raw where they disagree by more
                than WX_DISAGREE, silence-edge snap as tie-break; parakeet alone is not trusted
                -> snap only
  0 opinions -> silence-edge snap (79.6%; audio energy only: a long word whose span contains a
                quiet run followed by speech really starts at the end of that run)

Pure functions over the ClipFlow segment shape:
  [{start, end, text, words: [{word, start, end, probability}]}]
Times are seconds relative to the audio passed in (clip-relative). Nothing here mutates
its input. refine_word_timing never raises.
"""

import os
import sys
import statistics
import numpy as np

FRAME = 0.01          # energy frame, seconds
LONG_WORD = 0.3       # only words longer than this get the silence-edge snap
QUIET_REL_DB = 18.0   # quiet = below (local peak - this)
QUIET_ABS_DB = 6.0    # ... and below (noise floor + this)
QUIET_MIN_RUN = 0.06  # a quiet run must last this long to count
SNAP_LEAD = 0.02      # land the start this far before the speech edge
WX_DISAGREE = 0.15    # a lone aligner overrides stable-ts when they differ by more than this
MIN_WORD = 0.03

# Median bias of each voter against Fega's finals on the words he left alone (s233 dumps,
# identical on both clip halves). Subtracted before voting.
HB_BIAS = 0.025       # HuBERT-large starts run late
VK_BIAS = 0.0         # Vosk is centred
PK_BIAS = 0.02        # Parakeet token emission runs late

# Models. Override with the CORVA_* env vars (Session B points them inside the engine root);
# the defaults are Fega's dev machine.
ALIGN_MODEL = os.environ.get("CORVA_ALIGN_MODEL") or "HUBERT_ASR_LARGE"
VOSK_MODEL = os.environ.get("CORVA_VOSK_MODEL") or r"D:\whisper\vosk-models\vosk-model-en-us-0.22-lgraph"
PARAKEET_MODEL = os.environ.get("CORVA_PARAKEET_MODEL") or r"D:\whisper\sherpa-models\sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-fp16"
PARAKEET_CHUNK = 60.0  # seconds; a 5-minute chunk crashed sherpa-onnx with bad_alloc
PARAKEET_THREADS = max(1, min(8, os.cpu_count() or 1))


def _norm(word):
    return "".join(ch for ch in (word or "").lower() if ch.isalnum() or ch == "'")


def _log(msg):
    print(f"[TIMING] {msg}", file=sys.stderr)


# ── Energy envelope ──────────────────────────────────────────────────────────

def energy_db(audio_np, sr):
    """Per-FRAME RMS energy in dB. audio_np: float32 mono in [-1, 1]."""
    n = max(1, int(sr * FRAME))
    m = len(audio_np) // n
    if m == 0:
        return np.array([-100.0])
    frames = audio_np[: m * n].reshape(m, n)
    rms = np.sqrt((frames ** 2).mean(axis=1)) + 1e-7
    return 20.0 * np.log10(rms)


def silence_edge_start(db, noise_db, start, end):
    """
    Return the corrected start for a word spanning [start, end]: the end of the LAST quiet
    run inside the span that is followed by speech, minus SNAP_LEAD. Returns `start`
    unchanged when there is no such run.
    """
    i0 = max(0, int(start / FRAME))
    i1 = min(len(db) - 1, int(end / FRAME))
    if i1 - i0 < 3:
        return start
    seg = db[i0 : i1 + 1]
    thr = max(noise_db + QUIET_ABS_DB, float(seg.max()) - QUIET_REL_DB)
    quiet = seg < thr
    runs = []
    k = 0
    while k < len(quiet):
        if quiet[k]:
            j = k
            while j < len(quiet) and quiet[j]:
                j += 1
            if (j - k) * FRAME >= QUIET_MIN_RUN:
                runs.append((k, j))
            k = j
        else:
            k += 1
    runs = [r for r in runs if r[1] < len(quiet)]  # must be followed by speech inside the span
    if not runs:
        return start
    return max(start, (i0 + runs[-1][1]) * FRAME - SNAP_LEAD)


def snap_long_words(segments, audio_np, sr):
    """Silence-edge snap on its own, for every word longer than LONG_WORD."""
    db = energy_db(audio_np, sr)
    noise = float(np.percentile(db, 5))
    out = []
    moved = 0
    for seg in segments:
        words = []
        for w in seg.get("words", []):
            nw = dict(w)
            if (w["end"] - w["start"]) > LONG_WORD:
                ns = silence_edge_start(db, noise, w["start"], w["end"])
                if ns > w["start"] + 0.01:
                    nw["start"] = round(ns, 3)
                    moved += 1
            words.append(nw)
        out.append({**seg, "words": words})
    return _enforce_order(out), {"snapped": moved}


# ── HuBERT-large CTC forced alignment (whisperx.align) ───────────────────────

_ALIGN = {"model": None, "meta": None, "device": None, "failed": False}


def _load_align_model(device):
    if _ALIGN["failed"]:
        return None
    if _ALIGN["model"] is None or _ALIGN["device"] != device:
        try:
            import whisperx
            model, meta = whisperx.load_align_model(language_code="en", device=device, model_name=ALIGN_MODEL)
            _ALIGN.update(model=model, meta=meta, device=device)
        except Exception as e:  # whisperx not installed / model download failed
            _log(f"CTC aligner ({ALIGN_MODEL}) unavailable ({e})")
            _ALIGN["failed"] = True
            return None
    return _ALIGN


def whisperx_word_starts(segments, audio_np, sr, device):
    """
    Force-align the transcribed text with the CTC model (HuBERT-large by default) and return a
    flat, time-sorted list of {word, start} for every word it could place. None when unavailable.
    """
    al = _load_align_model(device)
    if al is None:
        return None
    import whisperx
    if sr != 16000:
        # whisperx expects 16 kHz; transcribe.py always feeds 16 kHz WAVs (ffmpeg.extractAudioRange)
        _log(f"CTC aligner skipped: audio is {sr} Hz, need 16000")
        return None
    text_segs = [
        {"text": s.get("text", ""), "start": s["start"], "end": s["end"]}
        for s in segments
        if (s.get("text") or "").strip() and s["end"] > s["start"]
    ]
    if not text_segs:
        return None
    try:
        res = whisperx.align(text_segs, al["model"], al["meta"], audio_np.astype(np.float32), device,
                             return_char_alignments=False)
    except Exception as e:
        _log(f"CTC align failed ({e})")
        return None
    out = []
    for s in res.get("segments", []):
        for w in s.get("words", []):
            if w.get("start") is not None:
                out.append({"word": w.get("word", ""), "start": float(w["start"])})
    out.sort(key=lambda w: w["start"])
    return out


# ── Vosk grammar-constrained recognition ─────────────────────────────────────

_VOSK = {"model": None, "failed": False}


def _load_vosk():
    if _VOSK["failed"]:
        return None
    if _VOSK["model"] is None:
        try:
            from vosk import Model, SetLogLevel
            SetLogLevel(-1)
            if not os.path.isdir(VOSK_MODEL):
                raise FileNotFoundError(VOSK_MODEL)
            _VOSK["model"] = Model(VOSK_MODEL)
        except Exception as e:  # vosk not installed / model folder missing
            _log(f"Vosk unavailable ({e})")
            _VOSK["failed"] = True
            return None
    return _VOSK["model"]


def vosk_word_starts(segments, audio_np, sr):
    """
    Recognise the clip with Vosk's grammar pinned to the transcript (poor man's forced
    alignment) and return a flat, time-sorted list of {word, start}. Words outside Vosk's
    lexicon come back as [unk] and are dropped, so that word has one opinion fewer.
    None when unavailable.
    """
    model = _load_vosk()
    if model is None:
        return None
    if sr != 16000:
        _log(f"Vosk skipped: audio is {sr} Hz, need 16000")
        return None
    text = " ".join(
        "".join(ch for ch in (s.get("text") or "").lower() if ch.isalnum() or ch in "' ")
        for s in segments
    )
    text = " ".join(text.split())
    if not text:
        return None
    try:
        import json
        from vosk import KaldiRecognizer
        rec = KaldiRecognizer(model, sr, json.dumps([text, "[unk]"]))
        rec.SetWords(True)
        pcm = (np.clip(audio_np, -1.0, 1.0) * 32767.0).astype(np.int16).tobytes()
        step = sr * 2  # one second of int16 mono
        found = []
        for i in range(0, len(pcm), step):
            if rec.AcceptWaveform(pcm[i : i + step]):
                found += json.loads(rec.Result()).get("result", [])
        found += json.loads(rec.FinalResult()).get("result", [])
    except Exception as e:
        _log(f"Vosk failed ({e})")
        return None
    out = [{"word": w["word"], "start": float(w["start"])} for w in found if w.get("word") != "[unk]"]
    out.sort(key=lambda w: w["start"])
    return out


# ── Parakeet transducer (sherpa-onnx), free transcription with token times ──

_PARAKEET = {"model": None, "failed": False}


def _parakeet_file(kind):
    """encoder/decoder/joiner file inside PARAKEET_MODEL, whichever precision was downloaded."""
    for suffix in (".int8.onnx", ".fp16.onnx", ".onnx"):
        p = os.path.join(PARAKEET_MODEL, kind + suffix)
        if os.path.exists(p):
            return p
    raise FileNotFoundError(os.path.join(PARAKEET_MODEL, kind + ".onnx"))


def _load_parakeet():
    if _PARAKEET["failed"]:
        return None
    if _PARAKEET["model"] is None:
        try:
            import sherpa_onnx
            _PARAKEET["model"] = sherpa_onnx.OfflineRecognizer.from_transducer(
                encoder=_parakeet_file("encoder"),
                decoder=_parakeet_file("decoder"),
                joiner=_parakeet_file("joiner"),
                tokens=os.path.join(PARAKEET_MODEL, "tokens.txt"),
                model_type="nemo_transducer",
                num_threads=PARAKEET_THREADS,
            )
        except Exception as e:  # sherpa-onnx not installed / model folder missing
            _log(f"Parakeet unavailable ({e})")
            _PARAKEET["failed"] = True
            return None
    return _PARAKEET["model"]


def parakeet_word_starts(audio_np, sr):
    """
    Transcribe the clip freely with Parakeet and return a flat, time-sorted list of
    {word, start} (start = the word's first token timestamp). The caller matches words by
    text; this is NOT forced alignment. Decoded in chunks of PARAKEET_CHUNK seconds.
    None when unavailable.
    """
    rec = _load_parakeet()
    if rec is None:
        return None
    audio = audio_np.astype(np.float32)
    n = int(PARAKEET_CHUNK * sr)
    out = []
    try:
        for i in range(0, len(audio), n):
            chunk = audio[i : i + n]
            if len(chunk) < sr // 10:  # < 100 ms tail: nothing to say
                continue
            offset = i / sr
            s = rec.create_stream()
            s.accept_waveform(sr, chunk)
            rec.decode_stream(s)
            for tok, tm in zip(s.result.tokens, s.result.timestamps):
                if tok.startswith("\u2581") or tok.startswith(" ") or not out or out[-1]["_chunk"] != i:
                    out.append({"word": tok.lstrip("\u2581 "), "start": float(tm) + offset, "_chunk": i})
                else:
                    out[-1]["word"] += tok
    except Exception as e:
        _log(f"Parakeet failed ({e})")
        return None
    out = [{"word": w["word"], "start": w["start"]} for w in out if w["word"]]
    out.sort(key=lambda w: w["start"])
    return out


# ── Voting ───────────────────────────────────────────────────────────────────

def _nearest(cands, word, t, window=1.0):
    n = _norm(word)
    best = None
    for c in cands:
        if _norm(c["word"]) != n:
            continue
        d = abs(c["start"] - t)
        if d < window and (best is None or d < best[0]):
            best = (d, c)
    return best[1] if best else None


def apply_second_opinion(segments, wx_words, audio_np, sr, bias):
    """
    Used when only ONE trusted aligner is available: it wins where it disagrees with
    stable-ts by more than WX_DISAGREE; otherwise a long word's silence-edge snap applies
    when the aligner agrees with the snapped position.
    """
    db = energy_db(audio_np, sr)
    noise = float(np.percentile(db, 5))
    out = []
    stats = {"aligner": 0, "snapped": 0, "unmatched": 0}
    for seg in segments:
        words = []
        for w in seg.get("words", []):
            nw = dict(w)
            m = _nearest(wx_words, w["word"], w["start"])
            if m is None:
                stats["unmatched"] += 1
            else:
                wx = m["start"] - bias
                if abs(wx - w["start"]) > WX_DISAGREE:
                    nw["start"] = round(max(0.0, wx), 3)
                    stats["aligner"] += 1
                elif (w["end"] - w["start"]) > LONG_WORD:
                    ns = silence_edge_start(db, noise, w["start"], w["end"])
                    if ns > w["start"] + 0.01 and abs(ns - wx) <= WX_DISAGREE:
                        nw["start"] = round(ns, 3)
                        stats["snapped"] += 1
            words.append(nw)
        out.append({**seg, "words": words})
    return _enforce_order(out), stats


def apply_median(segments, opinions):
    """
    Every word start becomes the median of stable-ts and each voter's (bias-corrected) start
    for the same word — the true median, so an even count averages the two middle values.
    `opinions` = [(words, bias), ...]. A word only one voter could place falls back to the
    gated rule; a word none placed keeps its stable-ts start.
    """
    out = []
    stats = {"median": 0, "gated": 0, "unmatched": 0}
    for seg in segments:
        words = []
        for w in seg.get("words", []):
            nw = dict(w)
            cands = []
            for op_words, bias in opinions:
                m = _nearest(op_words, w["word"], w["start"])
                if m is not None:
                    cands.append(m["start"] - bias)
            if len(cands) >= 2:
                ns = statistics.median(cands + [w["start"]])
                if abs(ns - w["start"]) > 0.005:
                    nw["start"] = round(max(0.0, ns), 3)
                    stats["median"] += 1
            elif len(cands) == 1:
                if abs(cands[0] - w["start"]) > WX_DISAGREE:
                    nw["start"] = round(max(0.0, cands[0]), 3)
                    stats["gated"] += 1
            else:
                stats["unmatched"] += 1
            words.append(nw)
        out.append({**seg, "words": words})
    return _enforce_order(out), stats


# ── Shared tidy-up ───────────────────────────────────────────────────────────

def _enforce_order(segments):
    """Keep every word at least MIN_WORD long and strictly ordered after a start moved."""
    flat = [w for s in segments for w in s.get("words", [])]
    for i, w in enumerate(flat):
        if w["end"] < w["start"] + MIN_WORD:
            w["end"] = round(w["start"] + MIN_WORD, 3)
        if i > 0 and flat[i - 1]["end"] > w["start"]:
            flat[i - 1]["end"] = round(max(flat[i - 1]["start"] + MIN_WORD, w["start"]), 3)
    for s in segments:
        if s.get("words"):
            s["start"] = min(s["start"], s["words"][0]["start"])
            s["end"] = max(s["end"], s["words"][-1]["end"])
    return segments


def refine_word_timing(segments, audio_np, sr, device="cpu", use_whisperx=True, use_vosk=True, use_parakeet=True):
    """
    Entry point used by transcribe.py after its own post-processing. Returns
    (segments, stats). Never raises: any failure leaves the input timings as they were.
    """
    try:
        opinions = []  # (name, words, bias)
        if use_whisperx:
            wx = whisperx_word_starts(segments, audio_np, sr, device)
            if wx:
                opinions.append(("hubert", wx, HB_BIAS))
        if use_vosk:
            vk = vosk_word_starts(segments, audio_np, sr)
            if vk:
                opinions.append(("vosk", vk, VK_BIAS))
        if use_parakeet:
            pk = parakeet_word_starts(audio_np, sr)
            if pk:
                opinions.append(("parakeet", pk, PK_BIAS))
        names = [n for n, _, _ in opinions]
        if len(opinions) >= 2:
            segs, stats = apply_median(segments, [(w, b) for _, w, b in opinions])
            stats["method"] = "median4" if len(opinions) == 3 else "median3"
        elif len(opinions) == 1 and names[0] in ("hubert", "vosk"):
            # Parakeet alone (67.8%) scores below the snap; only a forced aligner qualifies
            # as a lone second opinion.
            _, words, bias = opinions[0]
            segs, stats = apply_second_opinion(segments, words, audio_np, sr, bias)
            stats["method"] = f"{names[0]}+snap"
        else:
            segs, stats = snap_long_words(segments, audio_np, sr)
            stats["method"] = "snap"
        stats["voters"] = names
        return segs, stats
    except Exception as e:
        _log(f"refinement skipped ({e})")
        return segments, {"method": "none", "error": str(e)}
