"""
Pre-download the Whisper model into HF_HOME with parseable progress (#146).

Run by the Finish Setup flow (src/main/setup-runtime.js) through the freshly
installed engine runtime, so the first real transcription isn't ambushed by a
~1.6 GB model fetch. Uses faster_whisper's own download path (same repo
resolution and file set stable_whisper.load_faster_whisper hits later), so the
cache lands exactly where transcribe.py will look for it.

Protocol on stdout (parsed by setup-runtime.js):
    TOTAL <bytes>          expected total, 0 if unknown
    PROGRESS <pct> <bytes> repeated while downloading
    DONE                   success

HF_HOME must be set by the caller (Node passes it in env).
"""

import argparse
import fnmatch
import os
import sys
import threading
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="large-v3-turbo")
    args = parser.parse_args()

    os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")

    from faster_whisper.utils import download_model
    try:
        from faster_whisper.utils import _MODELS
    except ImportError:  # renamed upstream — size estimate degrades, download still works
        _MODELS = {}

    repo_id = _MODELS.get(args.model, args.model)

    # Best-effort expected size: the same file patterns faster_whisper downloads.
    total = 0
    try:
        from huggingface_hub import HfApi
        patterns = ["config.json", "preprocessor_config.json", "model.bin",
                    "tokenizer.json", "vocabulary.*"]
        info = HfApi().model_info(repo_id, files_metadata=True)
        total = sum(
            (s.size or 0) for s in info.siblings
            if any(fnmatch.fnmatch(s.rfilename, p) for p in patterns)
        )
    except Exception:
        total = 0
    print(f"TOTAL {total}", flush=True)

    # Progress = bytes appearing in this repo's HF cache dir, polled on a
    # thread. (huggingface_hub's per-file tqdm hooks aren't wired for
    # machine-readable aggregate progress; directory growth is simple and
    # robust, and the single model.bin dominates the total anyway.)
    hf_home = os.environ.get("HF_HOME") or os.path.expanduser("~/.cache/huggingface")
    hub_dir = os.path.join(hf_home, "hub")
    repo_frag = "models--" + repo_id.replace("/", "--")
    done = threading.Event()

    def poll():
        while not done.is_set():
            got = 0
            for root, _dirs, files in os.walk(hub_dir):
                if repo_frag not in root:
                    continue
                for name in files:
                    try:
                        got += os.path.getsize(os.path.join(root, name))
                    except OSError:
                        pass
            if total > 0:
                pct = min(99, int(got * 100 / total))
                print(f"PROGRESS {pct} {got}", flush=True)
            time.sleep(0.7)

    threading.Thread(target=poll, daemon=True).start()
    download_model(args.model)  # honors HF_HOME via huggingface_hub
    done.set()

    print(f"PROGRESS 100 {total}", flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - single exit point for Node's stderr tail
        print(f"ERROR {exc}", file=sys.stderr, flush=True)
        sys.exit(1)
