# Commercial Electron App Architecture Guide

Comprehensive research on building a paid Electron desktop app with backend components for licensing, API relay, auto-updates, and security.

---

## 1. Backend Architecture for Electron SaaS

### Do You Need a Backend?

Yes, but it can be minimal. Most commercial Electron apps need a remote server for exactly three things:

1. **License/subscription validation** -- verify the user has paid
2. **API credential relay** -- proxy third-party API calls that require secrets you can't ship in the binary
3. **Auto-update hosting** -- serve update files and metadata

Everything else should run locally. The "secret to good Electron apps" (per James Long / jlongster) is doing the bulk of work in a local background process. Data loads instantly, no network dependency, no caching headaches.

### Minimal Backend Stack

For ClipFlow's needs, the backend is a thin API server:

```
Electron App (client)
    |
    |-- License check on launch --> Your API server --> LemonSqueezy/Keygen API
    |-- Social media publish ----> Your API server --> YouTube/TikTok/Instagram APIs (secrets injected server-side)
    |-- Update check ------------> Static file host (S3/R2) with latest.yml
    |
    v
Local processing (FFmpeg, Whisper, file ops) stays 100% local
```

**Recommended stack for the backend:**
- Node.js + Express or Hono (you already know JS/TS)
- Deploy on Railway, Render, Fly.io, or a $5 VPS
- Cloudflare R2 or AWS S3 for update file hosting
- No database needed initially (license validation is stateless -- just relay to payment provider)

### How Notion, Linear, Obsidian Do It

| App | Framework | Backend | Key Pattern |
|-----|-----------|---------|-------------|
| **Notion** | Electron | Node.js/Express, PostgreSQL (sharded), Redis, AWS | Heavy backend -- collaborative editing, block storage |
| **Linear** | Electron | Node.js/TypeScript, PostgreSQL, Redis, GCP | Local-first sync via IndexedDB + WebSockets |
| **Obsidian** | Electron (custom, no React) | Local-first (no server needed for core) | Plain Markdown on disk; optional paid Sync service |
| **Figma** | Electron wrapper | Ruby/Sinatra + Rust (multiplayer), PostgreSQL | C++ rendering compiled to WebAssembly |
| **Screen Studio** | Electron (macOS only) | None (local app) | Native macOS performance focus |

**Key takeaway:** Obsidian is the closest model to ClipFlow. Core app is fully local. Backend only exists for optional paid services (Sync, Publish). This is the right pattern for ClipFlow.

---

## 2. License/Subscription Validation

### Option A: LemonSqueezy (Recommended for Indie)

**Why:** Built-in license key generation + validation API. Merchant of Record (handles global taxes). 5% + $0.50/txn. Acquired by Stripe in 2024.

**How it works:**
1. User buys on your LemonSqueezy checkout page
2. LemonSqueezy generates a license key, emails it to the customer
3. User enters the license key in your Electron app
4. Your app calls LemonSqueezy's License API to validate/activate
5. Each activation creates a "license key instance" with a unique ID -- save this locally
6. Periodically re-validate (e.g., on app launch) to check subscription status

**Important implementation details:**
- Hard-code your `store_id`, `product_id`, and `variant_id` in the client and verify them in the API response (prevents cross-product key reuse)
- Also verify the customer's email address during activation
- Save the `instance.id` locally for future validation/deactivation calls
- Handle offline gracefully: cache the last validation result with a timestamp, allow a grace period (e.g., 7 days) before requiring re-validation

**Docs:** https://docs.lemonsqueezy.com/guides/tutorials/license-keys

### Option B: Keygen.sh (More Control)

**Why:** Purpose-built software licensing API. Supports device activation, feature licensing, timed trials, offline validation. Flat monthly fee (no revenue percentage).

**Pricing:**
- Free Dev tier: 100 active licensed users, 10 releases
- Standard: ~$49/month for 1,000 ALUs
- Self-hosted Community Edition: free

**Electron-specific features:**
- License gate pattern: validate before showing main window
- Device activation: tie license to specific machines
- Entitlements: different feature sets per license tier
- Built-in auto-update distribution

**Example repos:**
- https://github.com/keygen-sh/example-electron-license-gate
- https://github.com/keygen-sh/example-electron-license-activation

### Option C: Paddle (Enterprise Scale)

5% + $0.50/txn. Merchant of Record. Best for advanced subscription logic (multi-tier, seat-based, usage billing). Overkill for indie.

### Comparison

| | LemonSqueezy | Keygen.sh | Paddle |
|---|---|---|---|
| **Cost** | 5% + $0.50/txn | $0-49/mo flat | 5% + $0.50/txn |
| **License API** | Built-in | Core product | Needs Keygen pairing |
| **Tax handling** | Yes (MoR) | No (pair with payment provider) | Yes (MoR) |
| **Best for** | Indie/small | Control freaks, offline-heavy | Enterprise SaaS |
| **Electron examples** | Generic API docs | Purpose-built Electron examples | Generic |

**Recommendation for ClipFlow:** Start with LemonSqueezy. Simplest path. Built-in license keys + Merchant of Record + reasonable fees. If you outgrow it or need offline-first licensing, migrate to Keygen.sh.

---

## 3. API Key Relay Pattern

### The Problem

ClipFlow needs to call YouTube, TikTok, and Instagram APIs that require client secrets (OAuth client_secret, API keys). You cannot ship these in the Electron binary -- anyone can extract them with `strings <binary>` or a hex editor. Obfuscation and encryption do not help; an attacker can hook the decryption function at runtime.

### The Solution: Server-Side Proxy

```
Electron App                    Your API Server                Third-Party API
-----------                     ---------------                ---------------
POST /api/youtube/upload   -->  Injects YouTube client_secret  -->  YouTube API
  (with user's OAuth token)     Validates user's license
                                Rate limits
                                Logs usage
                           <--  Returns response               <--  Response
```

**Implementation:**

```javascript
// Server-side (Express example)
app.post('/api/youtube/upload', validateLicense, async (req, res) => {
  const { userAccessToken, videoData } = req.body;

  const response = await fetch('https://www.googleapis.com/upload/youtube/v3/videos', {
    headers: {
      'Authorization': `Bearer ${userAccessToken}`,
      // Client secret stored in server env var, never sent to client
    },
    body: videoData,
  });

  res.json(await response.json());
});
```

**What stays on the server:**
- OAuth client_secret for each platform
- App-level API keys
- Anthropic API key (for AI features)

**What stays on the client:**
- User's OAuth access_token (obtained via OAuth flow, stored in OS keychain via `keytar` or `safeStorage`)
- User's license key

**OAuth flow for social platforms:**
1. Electron opens a BrowserWindow to the platform's OAuth consent screen
2. User authorizes --> platform redirects to your server's callback URL
3. Your server exchanges the auth code for access_token + refresh_token (using the client_secret that lives on the server)
4. Server sends the access_token back to the Electron app
5. Electron stores the access_token securely (electron `safeStorage` API or OS keychain)
6. For subsequent API calls, Electron sends the access_token to your relay server
7. Your relay server refreshes tokens as needed (using the client_secret)

### Complementary: Short-Lived Delegated Credentials

For the Anthropic API specifically, your server can issue short-lived, scoped tokens rather than proxying every request. But for social media APIs, the full relay pattern is necessary since those APIs require the client_secret for token refresh.

---

## 4. Auto-Updates

### Recommended: electron-updater + Generic HTTP Server

For a paid/commercial app, do NOT use:
- `update.electronjs.org` (open-source only)
- Private GitHub releases (rate-limited, awkward token management)

**Do use:** electron-updater with a generic HTTP(S) server.

**Setup:**

```yaml
# electron-builder.yml
publish:
  provider: generic
  url: https://releases.yourapp.com
```

**How it works:**
1. `electron-builder` generates installers + `latest.yml` metadata file
2. Upload both to your static file host (S3, R2, your own server)
3. `electron-updater` checks `latest.yml` on launch, downloads + installs if newer version exists
4. On Windows: NSIS installer handles the update
5. On macOS: DMG-based updates (app must be code-signed)

**Hosting options:**
- **Cloudflare R2** -- free egress, cheapest option
- **AWS S3** -- battle-tested, more expensive egress
- **Your own server** -- most control, can gate downloads behind license check

**Advanced: Gate updates behind license validation**

```javascript
// In your update server middleware
app.get('/releases/latest.yml', validateLicense, (req, res) => {
  res.sendFile('latest.yml');
});
```

This ensures only paying users receive updates.

**Other options:**
- **Keygen.sh** -- has a built-in electron-updater provider, combines licensing + distribution
- **electron-release-server** -- self-hosted dashboard, no GitHub dependency
- **Hazel/Nuts** -- simpler self-hosted options (pull from GitHub Releases)

---

## 5. Data Privacy for Platform Developer Programs

### What You Need Before Applying to Platform APIs

Every social media platform requires these before approving your developer app:

**Minimum requirements:**
1. **Privacy Policy** (publicly accessible URL)
   - What data you collect
   - How you use it
   - Who you share it with
   - How users can request deletion
   - How you store/protect data
   - Contact information

2. **Terms of Service** (publicly accessible URL)
   - Acceptable use
   - Limitations of liability
   - Intellectual property

3. **A real website** (not a landing page or login page)
   - TikTok specifically requires your Privacy Policy and ToS links be visible on the homepage without opening a menu

4. **Demo video(s)** showing end-to-end user flow
   - TikTok: at least 1 video, up to 5, max 50MB each
   - Instagram/Meta: screencast video justifying each permission requested

### Platform-Specific Requirements

**YouTube (Google):**
- Free API with quota system (10,000 units/day default)
- OAuth consent screen review required for publishing to users' channels
- Privacy policy URL required
- App verification for sensitive scopes

**TikTok:**
- Formal app review (3-4 day wait)
- Must have a fully developed, externally-facing website
- Content posted by unaudited clients is restricted to private viewing mode
- Must become a "Content Marketing Partner" and pass an audit to lift visibility restrictions
- Scope-based permissions -- each user must explicitly authorize

**Instagram (Meta):**
- App Review required for anything beyond basic profile access
- Detailed justification + screencast for each permission
- Development Mode vs. Live Mode distinction
- Must use Instagram Graph API (Basic Display API deprecated)

### Practical Advice

- Use a privacy policy generator (like https://app-privacy-policy-generator.firebaseapp.com/) as a starting point, then customize
- Host your privacy policy and ToS on your marketing website (e.g., clipflow.app/privacy, clipflow.app/terms)
- Be explicit about what data touches your server vs. stays local -- this is a selling point for a local-first app
- For GDPR compliance: implement data export and deletion mechanisms

---

## 6. Security Hardening

### Non-Negotiable Defaults (Electron 20+)

These are the defaults in modern Electron. Never change them unless you have an extremely good reason:

```javascript
new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,      // Renderer can't access Node.js
    contextIsolation: true,      // Preload runs in separate JS context
    sandbox: true,               // Chromium sandbox enabled
    webSecurity: true,           // Same-origin policy enforced
    allowRunningInsecureContent: false,
    enableRemoteModule: false,   // Remote module disabled
  }
});
```

### IPC Security (Critical)

Treat every IPC message from the renderer like an HTTP request from an untrusted client.

**Bad:**
```javascript
// DON'T: Exposes arbitrary command execution
contextBridge.exposeInMainWorld('api', {
  exec: (cmd) => ipcRenderer.invoke('exec', cmd),
  readFile: (path) => ipcRenderer.invoke('readFile', path),
});
```

**Good:**
```javascript
// DO: One specific method per operation, with defined parameters
contextBridge.exposeInMainWorld('clipflow', {
  getProjects: () => ipcRenderer.invoke('projects:list'),
  renameFile: (projectId, newName) => ipcRenderer.invoke('file:rename', projectId, newName),
  // Validate projectId and newName in the main process handler
});
```

### Content Security Policy

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://your-api-server.com">
```

- Avoid `unsafe-eval` (breaks many attack vectors)
- `unsafe-inline` for styles is often necessary with CSS-in-JS but try to eliminate it
- Whitelist only your own API server in `connect-src`

### Navigation & Popup Hardening

```javascript
// Block all navigation attempts in the renderer
mainWindow.webContents.on('will-navigate', (event) => {
  event.preventDefault();
});

// Block all popup windows
mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
```

### Secure Credential Storage

- Use Electron's `safeStorage` API (encrypts data using OS-level encryption)
- Or `keytar` for OS keychain access (Windows Credential Vault, macOS Keychain, Linux Secret Service)
- Never store tokens in plain text files or electron-store without encryption

### Code Signing

- **Windows:** Get an EV code signing certificate (prevents SmartScreen warnings). Costs ~$200-400/year.
- **macOS:** Apple Developer Program ($99/year). Required for auto-updates and notarization.
- Code signing is essential for a paid product -- unsigned apps trigger scary OS warnings that kill conversion.

### Additional Hardening

- Use custom protocol (`app://`) instead of `file://` for loading local content
- Validate URLs with Node's URL parser, not string comparisons (e.g., `startsWith('https://example.com')` can be fooled by `https://example.com.attacker.com`)
- Never load remote code with Node access
- Run Electronegativity (static analysis tool) to audit your app for security issues
- Use `session.defaultSession.webRequest.onHeadersReceived` to enforce security headers

---

## 7. Recommended Architecture for ClipFlow

### What to Build

```
+------------------------------------------+
|           ClipFlow Electron App           |
|                                           |
|  Renderer (React)                         |
|    |                                      |
|    |-- contextBridge (IPC) -->            |
|    |                                      |
|  Main Process (Node.js)                   |
|    |-- FFmpeg (local)                     |
|    |-- Whisper.cpp (local)                |
|    |-- File operations (local)            |
|    |-- electron-store (local, encrypted)  |
|    |-- License check (remote)             |
|    |-- Auto-update check (remote)         |
+------------------------------------------+
            |
            | HTTPS
            v
+------------------------------------------+
|        ClipFlow API Server               |
|        (Node.js + Express/Hono)          |
|                                           |
|  POST /auth/license/validate              |
|    --> LemonSqueezy License API           |
|                                           |
|  POST /api/youtube/upload                 |
|  POST /api/tiktok/publish                 |
|  POST /api/instagram/publish              |
|    --> Injects platform client_secrets    |
|    --> Forwards to platform APIs          |
|                                           |
|  GET /auth/oauth/:platform/callback       |
|    --> Exchanges auth codes for tokens    |
|                                           |
|  POST /api/ai/generate                    |
|    --> Injects Anthropic API key          |
|    --> Forwards to Claude API             |
|                                           |
+------------------------------------------+
            |
            | Static files
            v
+------------------------------------------+
|     Cloudflare R2 / S3                   |
|     (Auto-update files + latest.yml)     |
+------------------------------------------+
```

### Implementation Priority

1. **Phase 1 -- Payment + Licensing**
   - Set up LemonSqueezy product/checkout
   - Add license gate to Electron app (validate on launch, cache result)
   - Build marketing website with pricing, privacy policy, ToS

2. **Phase 2 -- API Relay Server**
   - Deploy Node.js API server
   - Move Anthropic API calls through relay (remove API key from client)
   - Implement OAuth flows for social platforms through relay

3. **Phase 3 -- Auto-Updates**
   - Configure electron-builder with generic publish provider
   - Set up R2/S3 bucket for update files
   - Add update check on app launch

4. **Phase 4 -- Platform Developer Programs**
   - Apply to YouTube, TikTok, Instagram developer programs
   - Prepare demo videos showing complete publishing flow
   - Ensure privacy policy covers all data handling

### Key Resources

- [Keygen: How to License and Distribute an Electron App](https://keygen.sh/blog/how-to-license-and-distribute-an-electron-app/)
- [Keygen: Electron Integration Guide](https://keygen.sh/integrate/electron/)
- [LemonSqueezy: License Keys Guide](https://docs.lemonsqueezy.com/guides/tutorials/license-keys)
- [Electron Official Security Docs](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Context Isolation Docs](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [electron-builder Auto Update Docs](https://www.electron.build/auto-update.html)
- [Electron Official Update Guide](https://www.electronjs.org/docs/latest/tutorial/updates)
- [jlongster: The Secret of Good Electron Apps](https://archive.jlongster.com/secret-of-good-electron-apps)
- [jlongster: Electron with Server Example](https://github.com/jlongster/electron-with-server-example)
- [Bishop Fox: Design a Reasonably Secure Electron Framework](https://bishopfox.com/blog/reasonably-secure-electron)
- [Doyensec: Electron Security Checklist (PDF)](https://doyensec.com/resources/us-17-Carettoni-Electronegativity-A-Study-Of-Electron-Security-wp.pdf)
- [LogRocket: Advanced Electron.js Architecture](https://blog.logrocket.com/advanced-electron-js-architecture/)
- [Offline License Keys for Electron](https://github.com/reZach/secure-electron-license-keys)
- [Web API Proxy (generic relay tool)](https://github.com/salsita/web-api-proxy)
- [Linear Architecture (Pragmatic Engineer)](https://newsletter.pragmaticengineer.com/p/linear)
- [Reverse Engineering Linear's Sync](https://marknotfound.com/posts/reverse-engineering-linears-sync-magic/)
- [Figma: Powered by WebAssembly](https://www.figma.com/blog/webassembly-cut-figmas-load-time-by-3x/)
- [TikTok Developer Guidelines](https://developers.tiktok.com/doc/our-guidelines-developer-guidelines)
- [TikTok App Review Guidelines](https://developers.tiktok.com/doc/app-review-guidelines)
- [Instagram Graph API Guide](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/)
- [Keygen.sh Pricing](https://keygen.sh/pricing/)
- [LemonSqueezy vs Alternatives (post-Stripe acquisition)](https://www.creem.io/blog/lemonsqueezy-alternatives-after-stripe-acquisition)
- [Cameron Nokes: Securely Store Secrets in Electron with node-keytar](https://cameronnokes.com/blog/how-to-securely-store-sensitive-information-in-electron-with-node-keytar/)
