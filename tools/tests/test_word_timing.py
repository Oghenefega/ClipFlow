"""
Unit tests for tools/word_timing.py — voting semantics and the fallback ladder, with the
model-backed voters stubbed out (no whisperx / vosk / sherpa-onnx needed).

Run from the repo root in any venv with numpy:
  python -m unittest tools/tests/test_word_timing.py
"""
import os
import sys
import types
import unittest
from unittest import mock

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import word_timing as wt  # noqa: E402

SR = 16000
SILENCE = np.zeros(SR * 3, dtype=np.float32)


def seg(*words):
    """Build one segment from (word, start, end) triples."""
    ws = [{"word": w, "start": s, "end": e, "probability": 1.0} for w, s, e in words]
    return [{"start": ws[0]["start"], "end": ws[-1]["end"], "text": " ".join(w["word"] for w in ws), "words": ws}]


def starts(segments):
    return [w["start"] for s in segments for w in s["words"]]


class MedianTests(unittest.TestCase):
    def test_even_count_uses_the_true_median(self):
        # raw 1.0 + three voters = 4 values; the true median averages the two middles.
        segs = seg(("hello", 1.0, 1.5))
        opinions = [([{"word": "hello", "start": 1.1}], 0.0),
                    ([{"word": "hello", "start": 1.2}], 0.0),
                    ([{"word": "hello", "start": 1.4}], 0.0)]
        out, stats = wt.apply_median(segs, opinions)
        self.assertAlmostEqual(starts(out)[0], 1.15, places=3)  # not 1.2 (upper middle)
        self.assertEqual(stats["median"], 1)

    def test_odd_count_is_the_strict_median(self):
        segs = seg(("hello", 1.0, 1.5))
        opinions = [([{"word": "hello", "start": 1.3}], 0.0),
                    ([{"word": "hello", "start": 1.6}], 0.0)]
        out, _ = wt.apply_median(segs, opinions)
        self.assertAlmostEqual(starts(out)[0], 1.3, places=3)

    def test_bias_is_subtracted_before_voting(self):
        segs = seg(("hello", 1.0, 1.5))
        opinions = [([{"word": "hello", "start": 1.3}], 0.1),
                    ([{"word": "hello", "start": 1.3}], 0.1)]
        out, _ = wt.apply_median(segs, opinions)
        self.assertAlmostEqual(starts(out)[0], 1.2, places=3)

    def test_single_placement_falls_back_to_the_gate(self):
        segs = seg(("hello", 1.0, 1.5), ("world", 1.5, 2.0))
        # "hello": one voter, inside WX_DISAGREE -> untouched. "world": one voter, beyond -> moved.
        opinions = [([{"word": "hello", "start": 1.05}, {"word": "world", "start": 1.8}], 0.0),
                    ([], 0.0)]
        out, stats = wt.apply_median(segs, opinions)
        self.assertEqual(starts(out), [1.0, 1.8])
        self.assertEqual(stats["gated"], 1)

    def test_unplaced_word_keeps_stable_ts(self):
        segs = seg(("hello", 1.0, 1.5))
        out, stats = wt.apply_median(segs, [([], 0.0), ([], 0.0)])
        self.assertEqual(starts(out), [1.0])
        self.assertEqual(stats["unmatched"], 1)

    def test_input_is_not_mutated(self):
        segs = seg(("hello", 1.0, 1.5))
        wt.apply_median(segs, [([{"word": "hello", "start": 1.4}], 0.0),
                               ([{"word": "hello", "start": 1.4}], 0.0)])
        self.assertEqual(segs[0]["words"][0]["start"], 1.0)


class LadderTests(unittest.TestCase):
    """refine_word_timing picks its method from which voters answered."""

    def _run(self, hubert, vosk, parakeet):
        one = [{"word": "hello", "start": 1.4}]
        with mock.patch.object(wt, "whisperx_word_starts", return_value=one if hubert else None), \
             mock.patch.object(wt, "vosk_word_starts", return_value=one if vosk else None), \
             mock.patch.object(wt, "parakeet_word_starts", return_value=one if parakeet else None):
            return wt.refine_word_timing(seg(("hello", 1.0, 1.5)), SILENCE, SR)

    def test_three_voters_median4(self):
        _, stats = self._run(True, True, True)
        self.assertEqual(stats["method"], "median4")
        self.assertEqual(stats["voters"], ["hubert", "vosk", "parakeet"])

    def test_two_voters_median3(self):
        for combo in [(True, True, False), (True, False, True), (False, True, True)]:
            _, stats = self._run(*combo)
            self.assertEqual(stats["method"], "median3", combo)

    def test_lone_forced_aligner_is_gated_with_snap(self):
        _, stats = self._run(True, False, False)
        self.assertEqual(stats["method"], "hubert+snap")
        _, stats = self._run(False, True, False)
        self.assertEqual(stats["method"], "vosk+snap")

    def test_lone_parakeet_is_not_trusted(self):
        out, stats = self._run(False, False, True)
        self.assertEqual(stats["method"], "snap")
        self.assertEqual(starts(out), [1.0])

    def test_no_voters_snap(self):
        _, stats = self._run(False, False, False)
        self.assertEqual(stats["method"], "snap")
        self.assertEqual(stats["voters"], [])

    def test_never_raises(self):
        with mock.patch.object(wt, "whisperx_word_starts", side_effect=RuntimeError("boom")):
            segs = seg(("hello", 1.0, 1.5))
            out, stats = wt.refine_word_timing(segs, SILENCE, SR)
            self.assertEqual(stats["method"], "none")
            self.assertEqual(starts(out), [1.0])


class ParakeetChunkTests(unittest.TestCase):
    def test_chunks_are_offset_and_tokens_joined(self):
        class FakeStream:
            result = types.SimpleNamespace(tokens=["▁hel", "lo", "▁there"], timestamps=[0.5, 0.6, 1.0])

            def accept_waveform(self, sr, samples):
                pass

        class FakeRec:
            def create_stream(self):
                return FakeStream()

            def decode_stream(self, s):
                pass

        audio = np.zeros(int(SR * (wt.PARAKEET_CHUNK + 10)), dtype=np.float32)  # two chunks
        with mock.patch.dict(wt._PARAKEET, {"model": FakeRec(), "failed": False}):
            out = wt.parakeet_word_starts(audio, SR)
        self.assertEqual([w["word"] for w in out], ["hello", "there", "hello", "there"])
        self.assertAlmostEqual(out[2]["start"], wt.PARAKEET_CHUNK + 0.5, places=3)
        self.assertAlmostEqual(out[3]["start"], wt.PARAKEET_CHUNK + 1.0, places=3)

    def test_unavailable_returns_none(self):
        with mock.patch.dict(wt._PARAKEET, {"model": None, "failed": True}):
            self.assertIsNone(wt.parakeet_word_starts(SILENCE, SR))


class EnforceOrderTests(unittest.TestCase):
    def test_min_length(self):
        segs = seg(("a", 1.0, 1.01), ("b", 1.5, 2.0))
        out = wt._enforce_order(segs)
        self.assertAlmostEqual(out[0]["words"][0]["end"], 1.0 + wt.MIN_WORD, places=3)

    def test_no_overlap_after_a_start_moved(self):
        segs = seg(("a", 1.0, 1.3), ("b", 1.2, 1.5))
        out = wt._enforce_order(segs)
        a, b = out[0]["words"]
        self.assertAlmostEqual(a["end"], b["start"], places=3)

    def test_segment_bounds_follow_words(self):
        segs = seg(("a", 1.0, 1.5))
        segs[0]["words"][0]["start"] = 0.8
        out = wt._enforce_order(segs)
        self.assertEqual(out[0]["start"], 0.8)


if __name__ == "__main__":
    unittest.main()
