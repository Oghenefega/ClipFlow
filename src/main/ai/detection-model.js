/**
 * #480: the model clip detection runs on, when the active provider is Anthropic.
 * One place so the pipeline and the replay test kit (tasks/spikes/replay-score)
 * always run the same thing.
 *
 * Sonnet 5.5 at effort high, with the clip count stated as a number in the prompt,
 * matched Sonnet 4.6's recall in the replay test (84/90 vs 83/90) with fewer
 * rejected picks and 20% lower cost (tasks/specs/detection-input-science.md
 * Step 6b). Its thinking is always on and counts toward max_tokens, hence the
 * larger budget and timeout. Every other Anthropic call keeps the provider's
 * default model: only detection was tested.
 */
module.exports = {
  model: "claude-sonnet-5-5",
  effort: "high",
  maxTokens: 16000,
  timeout: 240000,
};
