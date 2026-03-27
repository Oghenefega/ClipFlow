/**
 * Provider-aware cost tracking for LLM API calls.
 * Maps (model) → (inputCost, outputCost) per 1M tokens.
 *
 * Add new models/providers as simple entries — no code changes needed.
 */

// Pricing per 1M tokens (USD)
const PRICING = {
  // Anthropic
  "claude-sonnet-4-6":     { input: 3,    output: 15 },
  "claude-sonnet-4-5":     { input: 3,    output: 15 },
  "claude-opus-4-6":       { input: 15,   output: 75 },
  "claude-opus-4-5":       { input: 15,   output: 75 },
  "claude-haiku-3-5":      { input: 0.80, output: 4 },

  // OpenAI
  "gpt-4o":                { input: 2.50, output: 10 },
  "gpt-4o-mini":           { input: 0.15, output: 0.60 },
  "gpt-4.1":               { input: 2,    output: 8 },
  "gpt-4.1-mini":          { input: 0.40, output: 1.60 },
  "gpt-4.1-nano":          { input: 0.10, output: 0.40 },

  // DeepSeek
  "deepseek-chat":         { input: 0.27, output: 1.10 },
  "deepseek-reasoner":     { input: 0.55, output: 2.19 },

  // Google Gemini
  "gemini-2.5-pro":        { input: 1.25, output: 10 },
  "gemini-2.5-flash":      { input: 0.15, output: 0.60 },

  // Mistral
  "mistral-large-latest":  { input: 2,    output: 6 },
  "mistral-small-latest":  { input: 0.10, output: 0.30 },

  // xAI
  "grok-3":                { input: 3,    output: 15 },
  "grok-3-mini":           { input: 0.30, output: 0.50 },
};

/**
 * Calculate cost for a given model and token usage.
 * Returns 0 for unknown models (logged but not blocked).
 *
 * @param {string} model - Model identifier (e.g. "claude-sonnet-4-6")
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @returns {{ inputCost: number, outputCost: number, totalCost: number, known: boolean }}
 */
function getCost(model, inputTokens, outputTokens) {
  const pricing = PRICING[model];
  if (!pricing) {
    return { inputCost: 0, outputCost: 0, totalCost: 0, known: false };
  }
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return { inputCost, outputCost, totalCost: inputCost + outputCost, known: true };
}

/**
 * Check if a model has known pricing.
 * @param {string} model
 * @returns {boolean}
 */
function hasPricing(model) {
  return model in PRICING;
}

module.exports = { getCost, hasPricing, PRICING };
