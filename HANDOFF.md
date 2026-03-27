# ClipFlow — Session Handoff
_Last updated: 2026-03-27 (Provider Abstraction Layer + Dev Dashboard)_

## Current State
App builds clean and runs correctly. Both AI systems (LLM and transcription) are now behind provider abstraction interfaces with a hidden dev dashboard for switching providers at runtime.

## What Was Just Built

### Provider Abstraction Layer (commit d8d343d — previous session started, this session verified)
- **LLM Provider Interface** (`src/main/ai/llm-provider.js`) — common `chat()` contract, provider registry, config-driven selection via electron-store
- **Anthropic Native Adapter** (`src/main/ai/providers/anthropic.js`) — consolidated two duplicate HTTP wrappers (`callClaudeApi` + `anthropicRequest`) into one. Fixed missing 120s timeout on title/caption gen, game research, and profile update calls
- **OpenAI-Compatible Adapter** (`src/main/ai/providers/openai-compat.js`) — single adapter covering OpenAI, DeepSeek, Mistral, Gemini, xAI/Grok, Cohere, Perplexity, Together AI, Fireworks, Groq, Cerebras, SambaNova, NVIDIA NIM, OpenRouter, and any `/v1/chat/completions` endpoint. Handles message format conversion, image block translation, tool format translation
- **Cost Tracker** (`src/main/ai/cost-tracker.js`) — extracted from pipeline-logger, maps 14 models across 6 providers to per-1M-token pricing
- **Transcription Provider Interface** (`src/main/ai/transcription-provider.js`) — common `transcribe()` contract with word-level timestamp guarantee
- **stable-ts Provider** (`src/main/ai/transcription/stable-ts.js`) — full whisper.js logic extracted into provider interface
- **whisper.js** — converted to thin facade (delegates to active transcription provider)
- All 4 AI tasks (highlight detection, title/caption gen, game research, profile update) rewired to use provider registry
- Pipeline logger now uses cost-tracker for provider-aware pricing

### Dev Dashboard (commit dca729b)
- **Activation:** Click version number 7 times at bottom of Settings (Android developer options pattern)
- **Providers tab:** LLM provider selector (anthropic / openai-compat), config fields for OpenAI-compat (base URL, API key, model), Test Connection button with latency display, transcription provider selector
- **Store tab:** Filterable electron-store viewer/editor — browse all keys, view JSON values, edit inline, delete keys
- **Pipeline Logs tab:** View all pipeline run logs with status/cost, click to read full log content
- **devMode** persists in electron-store, Hide button to dismiss

## Key Decisions
- **Two adapters cover 95%+ of providers** — Anthropic needs native adapter for full features (prompt caching, tool use format, system-as-top-level-param). Everything else speaks OpenAI-compatible format
- **Provider config is developer-only** — users never see model/provider selection. Ships with Anthropic as default. Swapping is for dev/testing and future business decisions
- **Transcription stays local-only** — abstraction interface built but only stable-ts provider implemented. No cloud transcription adapters
- **Version click counter** for dev mode activation — invisible to users, easy for developer, persists across sessions
- **whisper.js kept as facade** — preserves all existing import paths, zero upstream changes needed

## Next Steps
1. Test the full pipeline end-to-end (process a recording, verify highlight detection works identically)
2. Test editor AI tools (generate titles/captions) to confirm provider abstraction is transparent
3. Test game research (Opus + web_search tool) still works
4. Try swapping to an OpenAI-compat provider via dev dashboard to validate the adapter works
5. Test actual video/reel publishing through ClipFlow's publish pipeline
6. Archive old broken Meta apps from developer dashboard
7. When ready for launch: Business Verification → App Review → Publish both Meta apps
8. Fix Issue #12 — Undo debounce captures intermediate drag states (carried over)

## Watch Out For
- **Stale Electron processes** — old instances from days ago can keep running and show outdated UI. Kill all electron processes before testing (`Get-Process -Name electron | Stop-Process -Force`)
- **Game research uses hardcoded `claude-opus-4-6`** — when switching to openai-compat provider, this task will try to use Opus model name against the OpenAI endpoint. The provider adapter uses the config model as fallback, but web_search tool has no OpenAI equivalent (silently skipped)
- **anthropicApiKey still exists in store** — kept for backward compat. Anthropic adapter reads it directly. OpenAI-compat adapter reads from `llmProviderConfig.apiKey`
- **Two Meta apps = two sets of credentials** — don't mix `instagramAppId` with `metaAppId`
- Instagram Business Login only works for Business/Creator accounts (Meta limitation)

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/` (rotated: app.log through app.5.log)
- Pipeline logs: `processing/logs/` — now include provider name and model in API usage section
- Dev dashboard: Settings → scroll to bottom → click version 7 times → purple "Dev Dashboard" card appears
- Provider registry state: dev dashboard Providers tab shows active provider and available providers
- Store viewer: dev dashboard Store tab — filter by key name, view/edit any electron-store value
- Instagram OAuth: scope `instagram-oauth`, Facebook OAuth: scope `meta`
- Token storage: encrypted via `token-store.js`
