# Commercial-Readiness Audit — Security, Reliability, Publish Integrity

> Routed by Wick (GM) 2026-07-11. Origin: Fega brought a generic "vibecoding audit" prompt
> from Twitter; Wick adapted it for ClipFlow's actual architecture (Electron desktop app,
> no backend server). This is an AUDIT session, not a fix session — findings report first,
> zero code changes.

## When to run
- **Gate:** after Fega's remaining Phase 1 verification check (real publish through the Queue)
  and after the Phase 2 Calendar build ships. Don't preempt those.
- **Deadline logic:** must complete BEFORE a beta date is set. This audit is a gate for
  commercial launch (strangers installing the app), NOT for Fega's own posting restart —
  do not freeze the pipeline over it.

## Context the auditor needs
- ClipFlow: Windows Electron desktop app (Electron 28 + React 18, sql.js SQLite, Zustand,
  FFmpeg, Whisper via local Python, Claude API). **No backend server.** Publishes to TikTok,
  YouTube, Instagram, Facebook via OAuth.
- Pre-launch commercial product converting from Fega's personal tool. The threat model shift:
  until now every install was the developer's own machine and accounts. After launch, paying
  strangers hold their own OAuth tokens inside this app, and any bundled developer secret
  ships to every customer.
- **Prior audit coverage (do not duplicate):** the session-85 packaged-app audit covered
  asar/bundling breakage (Bucket A, shipped) and other-machine hardcodes (Bucket B, filed as
  launch-ops: #145 ffmpeg bundling, #146 python bundling, #147 hfHome, #68 energy_scorer path).
  Reference those issues where relevant; don't re-report them as new findings. That audit's
  own listed coverage gap — **publish/OAuth flows entirely unaudited** — is this audit's core.
- A separate UX audit exists at `tasks/ux-audit-2026-07-01.md` — skim to avoid re-reporting.

## The audit prompt

Perform a comprehensive audit of ClipFlow. Trace real flows end to end (record → detect →
subtitle → render → publish → tracker log), not files in isolation. Do not modify code.
Investigate, in priority order:

### 1. Secrets and credential storage (highest priority)
- Where are the four platforms' OAuth access/refresh tokens and the Claude API key stored?
  Are any secrets hardcoded in source, committed to git history, bundled into the installer,
  or written to logs / error messages / crash output?
- Would a paying customer's install contain the developer's own keys, client secrets, or
  account identifiers? (Check electron-builder output, not just source: inspect what actually
  lands in the asar / resources.)
- Is anything sensitive readable as plain text on disk (SQLite file, electron-store JSON,
  localStorage, temp files)? What's the realistic exposure if a customer's machine is shared
  or their disk is read?
- OAuth client secrets for TikTok/YouTube/IG/Facebook: a desktop app cannot keep a client
  secret confidential. Document how each platform flow handles this (PKCE? embedded secret?)
  and whether the current shape survives commercial distribution.

### 2. Electron security posture
- BrowserWindow flags: nodeIntegration, contextIsolation, sandbox, webSecurity — for the main
  window AND the offscreen overlay-render window.
- IPC surface: enumerate every ipcMain.handle/on channel; which take renderer-supplied paths,
  URLs, or shell-bound strings without validation?
- Command injection through FFmpeg/FFprobe/Whisper invocations — especially file names and
  subtitle text that originate from user files (OBS filenames, CSV imports, pasted titles).
  Check spawn arg arrays vs string concatenation.
- Path traversal on any file read/write that uses user-influenced names.
- shell.openExternal and any navigation to non-local URLs (post links from platformResults
  are platform-supplied data — verify they're validated before opening).
- Installer/auto-update integrity: is the installer signed, and is there any update channel
  that could be spoofed?

### 3. Publish pipeline integrity (maps directly to the reliability milestone)
- Non-idempotent publish: can a retry, crash, double click, or scheduler re-fire post the
  same clip twice to a platform? Trace publishClip + retryFailed + the scheduler
  (scheduler fires only while app is open — what happens on wake/restart with overdue posts?).
- Partial success (2 of 4 platforms succeed): is state recorded honestly (platformResults),
  is retry of only-the-failed safe, can the UI ever show success that didn't happen?
- Token expiry/revocation mid-publish: detection, error surfacing, and refresh behavior.
- Network loss at each step; infinite "Processing…" states; whether pollPublishStatus
  (TikTok) can hang or spin forever.
- Duplicate protection between immediate publish and scheduled publish of the same clip.

### 4. Reliability and data integrity
- Unhandled promise rejections and swallowed errors (grep empty catch blocks / console.warn-
  only failures), especially in the AI pipeline, render path, and publish queue.
- SQLite via sql.js is in-memory: when is it persisted to disk, and what's lost on crash or
  power cut mid-write? Is the write atomic (temp+rename) or can the DB file corrupt?
- Long-running FFmpeg/Whisper jobs: cancellation coverage (the #140 cancel work shipped for
  render — do generate/transcribe have equivalents?), temp-file accumulation, orphaned
  processes on app quit, memory growth across many clips in one session.
- Assumptions about platform API responses (nullability, ordering, rate limits, error shapes)
  that will break under real customer volume.

### 5. Desktop UX robustness (lighter pass — do NOT run web checks)
- Keyboard access and focus handling in modals and the subtitle editor; Esc/entrapment.
- Error states that give the user a way forward vs dead ends.
- Long file names, very large libraries/backlogs, zero-state screens.
- Consistency of loading/disabled/destructive states across views.
- SKIP entirely: CSRF, CORS, cookies, session handling, responsive mobile layouts,
  screen-reader WCAG depth — web-app checks that don't apply to this architecture.

## Report format (every finding)
- **Severity:** Critical / High / Medium / Low / Informational
- **Category:** Security / Race Condition / Reliability / Data Integrity / UX
- **Location:** exact file, function, line
- **Issue / Impact:** what's wrong + what realistically happens to a PAYING user in production
- **Evidence:** code path or reproducible condition (confirmed vs theoretical — label it)
- **Reproduction:** steps where applicable
- **Fix:** specific and actionable
- **Confidence:** Confirmed / High Confidence / Needs Verification

## Output
1. Full findings report → `tasks/commercial-audit-YYYY-MM-DD.md` (grouped by severity).
2. Prioritized remediation plan.
3. Quick wins (safe, low regression risk) — candidates for a same-session fix batch AFTER
   the report is approved.
4. Issues needing architectural work → file as GitHub issues, `milestone: commercial-launch`
   (read `.claude/docs/issue-filing.md` first), alongside the existing launch-ops set.
5. Release recommendation: Safe to ship / Ship with known risks / Do not ship — with
   justification. "Ship" here means commercial beta to strangers, not Fega's own use.

## Ground rules
- Adversarial on security, systematic on reliability, honest on confidence. No speculative
  findings without evidence; no padding the report to look thorough.
- Zero code changes during the audit. Fixes are a separate approved session.
- Fega is a non-coder: the report's severity summary at the top must be readable by him
  (plain language, what-it-means-for-launch), with the technical detail below it.
