// #357: the transcribe child only gets a model env var once Finish Setup has
// left a verified marker in that model's dir under the engine root.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { timingModelEnv, timingModelDir, TIMING_MODELS, MODEL_MARKER } = require("../app-paths");

function tmpStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "corva-timing-"));
  return { root, store: { get: (k) => (k === "engineRoot" ? root : undefined) } };
}

function mark(dir, sha256) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, MODEL_MARKER), JSON.stringify({ sha256 }));
}

describe("timingModelEnv", () => {
  test("no store or no markers -> nothing (word_timing.py keeps its defaults)", () => {
    expect(timingModelEnv(null)).toEqual({});
    const { store } = tmpStore();
    expect(timingModelEnv(store)).toEqual({});
  });

  test("a marked model exports its variable; HuBERT points at the TORCH_HOME root, not the checkpoints dir", () => {
    const { root, store } = tmpStore();
    mark(timingModelDir(store, "vosk"), "abc");
    mark(timingModelDir(store, "hubert"), "def");
    expect(timingModelEnv(store)).toEqual({
      CORVA_VOSK_MODEL: path.join(root, "models", "vosk"),
      TORCH_HOME: path.join(root, "torch_home"),
    });
    expect(timingModelDir(store, "hubert")).toBe(path.join(root, "torch_home", "hub", "checkpoints"));
  });

  test("a corrupt marker counts as not installed", () => {
    const { store } = tmpStore();
    const dir = timingModelDir(store, "parakeet");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, MODEL_MARKER), "{not json");
    expect(timingModelEnv(store)).toEqual({});
    expect(Object.keys(TIMING_MODELS)).toEqual(["hubert", "vosk", "parakeet"]);
  });
});
