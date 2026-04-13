# Social Media Platform API Research (March 2026)

Research for ClipFlow's multi-platform video publishing feature. Covers API capabilities, app review processes, rate limits, and architectural options.

---

## 1. YouTube (Data API v3)

**API:** YouTube Data API v3 — `videos.insert` endpoint
**Auth:** OAuth 2.0 (service accounts NOT supported — returns `NoLinkedYouTubeAccount`)
**Scope:** `https://www.googleapis.com/auth/youtube.upload`

### App Review
- The `youtube.upload` scope is classified as **sensitive** (not restricted), so you need Google OAuth App Verification but NOT a third-party security assessment.
- **Timeline:** 3-5 business days for initial verification; 2-4 weeks for re-verification when adding scopes.
- **Unverified cap:** 100 users max until verified. Unverified app warning screen shown to users.
- **Requirements:** Domain ownership verification, privacy policy hosted on your domain, home page with app description, demo video showing scope usage, branding compliance.

### Critical Gotcha
**All videos uploaded from unverified API projects created after July 28, 2020 are forced to PRIVATE.** This is the #1 blocker — you cannot upload public videos until your app passes Google's verification. No workaround.

### Quota & Rate Limits
- Default: **10,000 units/day** per Google Cloud project.
- A single video upload costs **1,600 units** = max **6 uploads/day** on default quota.
- Quota resets at midnight Pacific Time.
- You MUST request a quota increase (separate process with its own screencasts/forms) for any real production use.

### Video Upload Flow
- Resumable upload supported via `videos.insert` with `uploadType=resumable`.
- Max file size: 256 GB (with resumable upload).
- Supported formats: Most common video formats (MP4/H.264 recommended).
- Upload initiated with POST, then chunks sent via PUT with byte ranges.

### Requirements Summary
| Item | Details |
|------|---------|
| Business entity | Not strictly required, but recommended for verification |
| Privacy policy | Required, hosted on verified domain |
| Terms of service | Recommended |
| Demo video | Required for verification |
| Cost | Free (API itself), but quota increase may require justification |

---

## 2. TikTok (Content Posting API)

**API:** TikTok Content Posting API
**Auth:** OAuth 2.0
**Scopes:** `video.upload` + `video.publish` (for direct posting)

### Two Posting Modes
1. **Direct Post** — content goes live immediately
2. **Upload to Inbox** — content queued in creator's draft inbox for review before publishing

### App Review
- **Personal accounts not eligible** — must operate under a recognized business/developer entity.
- Register app at developers.tiktok.com, add Content Posting API product.
- **Timeline:** 5-10 business days (2026). Can take up to 2 weeks.
- **Requirements:** Demo video showing full upload flow, privacy policy URL, clear data handling description, domain/URL ownership verification for pull-from-URL uploads.
- **Demo video must show:** actual UI, all selected products/scopes in use. Remove unused scopes before review or it delays approval.

### Unaudited Client Restrictions
- Uploads forced to **SELF_ONLY** (private) viewership.
- Max **5 users** can post per 24-hour window.
- All posting user accounts must be set to private.

### Rate Limits
- Upload Video Init: **6 requests/minute** per user token
- Direct Post Init: **6 requests/minute** per user token
- Get Video Status: **30 requests/minute** per user token
- Daily posting cap: ~**15-20 posts/day per creator account** (shared across all API clients using Direct Post)
- 24-hour active creator cap based on usage estimates in audit application

### Video Upload Flow
- **File Upload:** Videos >64MB must use chunked upload (min 1 chunk, max 1000). Chunks: 5-64MB each (final chunk can be up to 128MB). Chunks must be uploaded **sequentially**.
- **Pull from URL:** Set `source=PULL_FROM_URL`, TikTok downloads from your URL. URL must be HTTPS, no redirects, domain must be verified in developer portal.
- Upload URL valid for **1 hour** after issuance.
- Supported formats: MP4 + H.264

### UX Requirements
- Upload page must display the creator's TikTok nickname.
- No watermarks, logos, or promotional branding on uploaded content.
- App must facilitate authentic, original content (no cross-platform content copying).

---

## 3. Instagram (Reels via Graph API)

**API:** Instagram Graph API (part of Meta's API ecosystem)
**Auth:** OAuth 2.0 (server-side only — never expose App Secret client-side)
**Permission:** `instagram_content_publish`

### Publishing Flow
1. `POST /{ig-user-id}/media` with `media_type=REELS` and `video_url` — creates container
2. Poll container status until ready
3. `POST /{ig-user-id}/media_publish` with container ID — publishes

**Important:** Video upload calls use `rupload.facebook.com` host (not `graph.facebook.com`). Resumable upload supported via `upload_type=resumable`.

### Account Requirements
- **Business or Creator account only** — personal accounts cannot use the API.
- Must be linked to a Facebook Page.
- Page Publishing Authorization (PPA) must be completed if required for the connected Page.

### App Review (Meta)
- Requires Meta App Review for `instagram_content_publish` permission.
- **Timeline:** 2-7 business days for well-prepared submission. Rejections add 3-5 days per resubmission.
- **Requirements:** Facebook Business Verification, privacy policy, screencast demo for each permission, non-admin test user account for Meta's reviewers.
- **Common rejection reasons:** Requesting unnecessary permissions, vague privacy policy, poor demo video, unclear permission justification.

### Rate Limits
- **50 posts per 24 hours** (feed posts, Reels, and stories combined).
- Some sources report up to 100 API-published posts per 24-hour moving period. Carousels count as single post.

### Video Specs
- Reels: up to 90 seconds (some accounts 60s), up to 15 minutes via some tools.
- Max size: 100MB (Reels), up to 1GB for standard video.
- Format: MP4 recommended, H.264 codec.
- Media must be hosted on a **publicly accessible URL** at upload time (Meta cURLs it).

### Gotchas
- Videos must be hosted on a public URL — you can't upload from local file directly. You need to either host on your own server or use the resumable upload flow via `rupload.facebook.com`.
- Trial Reels feature (shares only to non-followers) available via `trial_params`.
- Instagram API only publishes individual videos as Reels (no other video types).

---

## 4. Facebook (Video via Graph API)

**API:** Facebook Graph API (currently v22.0, 2025)
**Auth:** OAuth 2.0
**Permissions:** `pages_manage_posts`, `pages_read_engagement`

### Video Upload
- Standard upload: videos encoded as `multipart/form-data`, published to `graph-video.facebook.com`.
- **Standard upload limits:** 1GB size, 20 minutes duration.
- **Resumable upload limits:** 1.5GB size, 45 minutes duration (Graph API v2.3+).
- Aspect ratio must be between 9:16 and 16:9.

### Facebook Reels Specs (2025-2026)
- Recommended: 1080x1920 (9:16), min 720x1280.
- Max file size: ~4GB.
- Format: MP4 or MOV, H.264 codec, AAC Stereo audio.
- 30fps or higher recommended.

### Major 2025 Change
As of June 2025, **all Facebook videos are now shared as Reels** — Meta unified its video ecosystem with no length or format restrictions.

### Token Management
- Short-lived tokens: 1-2 hours.
- Long-lived user tokens: 60 days.
- Page tokens from long-lived user tokens: **never expire** (unless underlying user token invalidated).
- System Users (business-grade): never-expiring tokens with comprehensive permissions.

### App Review
- Same Meta App Review process as Instagram (combined).
- Required for any public-facing app posting to Pages on behalf of others.
- **Timeline:** 2-7 business days.

### Rate Limits
- HTTP 429 when exceeded. Must implement exponential backoff.
- Specific limits vary by endpoint and are tied to your app's usage tier.

---

## 5. X/Twitter (API v2 Media Upload + Post)

**API:** X API v2 — `POST /2/media/upload` + `POST /2/posts`
**Auth:** OAuth 2.0 with PKCE (recommended for new apps). Requires `media.write` scope.
**Note:** v1.1 deprecation was scheduled for June 2025. Migrate to v2.

### Video Upload Flow (Chunked)
1. **INIT** — `POST /2/media/upload` with `media_type`, `total_bytes`, `media_category`
2. **APPEND** — Upload file chunks via `POST /2/media/upload/:id/append`
3. **FINALIZE** — `POST /2/media/upload/:id/finalize` to get `media_id`
4. **STATUS** — Poll `GET /2/media/upload` until processing `succeeded` or `failed`
5. **Post** — `POST /2/posts` with `media_ids` array

### Video Specs
- Max file size: ~512MB
- Format: MP4 (`video/mp4`)
- Media categories: `tweet_video` (standard) or `amplify_video` (longer videos, verified users)

### Pricing (THIS IS THE BIG GOTCHA)
X API is now **paid** for any meaningful use:

| Tier | Monthly Cost | Writes/Month | Reads/Month |
|------|-------------|--------------|-------------|
| Free | $0 | 500 posts | ~100 |
| Basic | $200 | 50,000 | 15,000 |
| Pro | $5,000 | 300,000 | 1,000,000 |
| Enterprise | $42,000+ | Custom | Custom |
| Pay-Per-Use (new, Feb 2026) | Credits | Variable | Up to 2M cap |

**Pay-Per-Use** is now the default for new developers. Legacy tiers (Basic/Pro) are available to existing users only. Equivalent of Basic usage on pay-per-use costs ~$575/month.

### Free Tier Rate Limits (Very Restrictive)
| Endpoint | 24hr Limit |
|----------|-----------|
| `/initialize` | 17-34 requests |
| `/append` | 85-170 requests |
| `/finalize` | 17-34 requests |
| `/status` | 170 requests |

**Realistically: ~17 video uploads per day on free tier, assuming optimal chunking.**

### Gotchas
- Free tier is write-only — you cannot read back what you posted or check engagement.
- Use case description during onboarding is **contractually binding** — changing your use case requires X approval.
- No formal "app review" like Meta/Google, but your developer account can be suspended for policy violations.
- Bearer token (app-only auth) NOT supported for media upload — must be user-level OAuth.

---

## 6. Kick

**API:** Kick Public API (launched March 2025 at docs.kick.com)
**Status:** NO VIDEO UPLOAD API EXISTS

### What's Available
- OAuth scopes: `user:read`, `channel:read`, `channel:write`, `chat:write`, `streamkey:read`, `events:subscribe`
- Read channel info, categories, user profiles
- Chat messaging (post as user or bot)
- Stream control, webhooks/events
- Read-only clip retrieval (GET endpoints only)

### What's NOT Available
- **No video upload endpoint**
- **No clip creation/posting endpoint**
- No `clip:write` or `video:upload` scope
- No content publishing of any kind

### Outlook
Kick launched a $100,000 developer bounty fund and has "more endpoints in the pipeline." Over 1,000 developers are building on the platform. Monitor [docs.kick.com](https://docs.kick.com) and [KickEngineering/KickDevDocs](https://github.com/KickEngineering/KickDevDocs) for future additions.

### Recommendation for ClipFlow
**Skip Kick integration for now.** Revisit when/if they add a content posting API. Could potentially use browser automation as a hack, but this is fragile and against most ToS.

---

## 7. Aggregator APIs / Middleware Layer

### Should You Use One?

**Pros:**
- Single integration point for 10+ platforms
- They handle OAuth flows, rate limiting, format conversion, API version changes
- Faster time-to-market
- They deal with app review processes (they already have approved apps)

**Cons:**
- Per-post or per-month costs add up at scale
- You're dependent on their uptime and their API approval status
- Less control over platform-specific features
- If they lose API access to a platform, you lose it too
- Adds latency (your app -> aggregator -> platform)

### Top Options

| Service | Platforms | Pricing | Video Support | Notes |
|---------|-----------|---------|---------------|-------|
| **Ayrshare** | 13 (incl. TikTok, YouTube, IG) | Free (20 posts/mo, no video) / $149/mo Premium | Yes (Premium+) | Most popular API-first option. Node.js SDK. |
| **Late (getlate.dev)** | 9 (Twitter, IG, TikTok, Threads, etc.) | From $19/mo | Yes | 99.97% uptime, sub-50ms response. Newer entrant. |
| **Outstand** | 10+ | Not specified | Yes | Unified data model, auto retry, webhook events. |
| **Upload-Post.com** | Multiple | Not specified | Yes | Focused on posting/scheduling. |

### Recommendation for ClipFlow
**Start with direct API integration, not an aggregator.** Reasons:
1. ClipFlow targets a specific niche (gaming content creators) — you need full control over platform-specific features (YouTube Shorts metadata, TikTok Duet/Stitch settings, etc.)
2. Aggregators add a recurring per-post cost that scales with your user base
3. You're building a commercial product — owning the integrations means no third-party dependency risk
4. You only need 5 platforms initially, not 13+

**However:** Consider using an aggregator as a **fallback** or for platforms where you don't want to maintain a direct integration (e.g., if you add LinkedIn or Pinterest later).

---

## 8. How Buffer/Hootsuite Handle It Architecturally

### Buffer
- Started as PHP monolith, migrated to **Service-Oriented Architecture** with Docker/Kubernetes
- Handles 800K+ posts/day
- Each social platform gets its own service/adapter behind a unified internal API
- "Exemplar services" pattern — build a few quality reference services, then replicate

### Hootsuite
- Migrated from LAMP stack to **reactive microservices** (Scala/Lightbend stack)
- **700+ microservices** across 50+ engineering teams
- API gateway pattern: centralized auth, rate limiting, data normalization
- Kubernetes + Terraform infrastructure

### The Common Pattern (Relevant for ClipFlow)
Both use a **platform adapter** architecture:
```
User Request -> Scheduler Queue -> Platform Adapter (YouTube/TikTok/etc.) -> Platform API
                                        |
                                   Unified Internal Schema
                                        |
                                   Rate Limiter + Retry Logic
                                        |
                                   Token Manager (OAuth refresh)
```

Key components:
1. **Unified post schema** — internal data model that maps to all platforms
2. **Platform adapters** — one per platform, handles format conversion + API calls
3. **Token manager** — stores/refreshes OAuth tokens, handles re-auth flows
4. **Rate limiter** — per-platform, per-user bucket with automatic backoff
5. **Scheduler queue** — timezone-aware, handles retries on failure

---

## 9. Open-Source Projects Worth Studying

### Postiz (Best Reference)
- **GitHub:** [gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app)
- Next.js + Node.js, PostgreSQL, Redis
- 17+ platforms including TikTok, YouTube
- Apache 2.0 license
- AI-powered content generation
- **Most stars, most active, best architecture reference**

### Mixpost
- **GitHub:** [inovector/mixpost](https://github.com/inovector/mixpost)
- Laravel/PHP-based, self-hosted
- Supports Facebook Reels, Instagram Reels, YouTube Shorts, TikTok
- Buffer alternative — no subscriptions, no limits
- Unified inbox for comments/mentions

### Socioboard 5.0
- **GitHub:** [socioboard/Socioboard-5.0](https://github.com/socioboard/Socioboard-5.0)
- 9 social networks, 20K+ users
- Web app + mobile apps
- Extensible via plugins

### Recommendation
**Study Postiz first** — it's the most modern, uses a similar tech stack (Node.js), and has the broadest platform support. Look at how they handle:
- OAuth token storage and refresh
- Platform-specific video upload flows
- Rate limiting and retry logic
- Scheduling and timezone handling

---

## 10. Summary: Implementation Priority for ClipFlow

### Phase 1 (Ship First)
| Platform | Difficulty | Review Time | Blocker? |
|----------|-----------|-------------|----------|
| YouTube | Medium | 3-5 days (sensitive scope) | Quota limit (6 uploads/day default) |
| TikTok | Medium | 5-10 days | Unaudited = private only |
| X/Twitter | Easy (no review) | Instant (pay $200/mo) | Cost — $200/mo minimum for Basic |

### Phase 2
| Platform | Difficulty | Review Time | Blocker? |
|----------|-----------|-------------|----------|
| Instagram | Hard | 2-7 days | Must host video on public URL |
| Facebook | Hard | 2-7 days | Same Meta review as Instagram |

### Phase 3 (When Available)
| Platform | Difficulty | Review Time | Blocker? |
|----------|-----------|-------------|----------|
| Kick | N/A | N/A | No upload API exists yet |

### Immediate Action Items
1. Register developer accounts on all platforms NOW — some reviews take weeks
2. Set up a Google Cloud project and request YouTube API quota increase early
3. Register a TikTok developer account and submit for Content Posting API audit
4. Create a Meta developer account, set up Facebook Business Verification
5. Budget $200/mo minimum for X/Twitter API access (Basic tier or equivalent pay-per-use)
6. Write privacy policy and terms of service — required by ALL platforms
7. Set up a domain with HTTPS hosting for privacy policy + video hosting (Instagram requires public URLs)

---

## Sources

- [YouTube Data API v3 — Upload a Video](https://developers.google.com/youtube/v3/guides/uploading_a_video)
- [YouTube Data API — Videos: insert](https://developers.google.com/youtube/v3/docs/videos/insert)
- [Google OAuth Sensitive Scope Verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Google OAuth App Verification Help Center](https://support.google.com/cloud/answer/13463073?hl=en)
- [Google OAuth Verification: Costs, Timelines, Process (Nylas)](https://www.nylas.com/blog/google-oauth-app-verification/)
- [TikTok Content Posting API — Get Started](https://developers.tiktok.com/doc/content-posting-api-get-started)
- [TikTok Content Posting API — Upload Video](https://developers.tiktok.com/doc/content-posting-api-reference-upload-video)
- [TikTok App Review Guidelines](https://developers.tiktok.com/doc/app-review-guidelines)
- [TikTok API Rate Limits](https://developers.tiktok.com/doc/tiktok-api-v2-rate-limit)
- [TikTok Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines)
- [TikTok Content Posting API Developer Guide 2026 (TokPortal)](https://www.tokportal.com/learn/tiktok-content-posting-api-developer-guide)
- [Instagram Content Publishing — Meta Developer Docs](https://developers.facebook.com/docs/instagram-platform/content-publishing/)
- [Instagram Graph API Complete Guide (Elfsight)](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/)
- [Instagram Reels API Guide (Phyllo)](https://www.getphyllo.com/post/a-complete-guide-to-the-instagram-reels-api)
- [Meta App Review — Submission Guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide)
- [Meta App Review Introduction](https://developers.facebook.com/docs/resp-plat-initiatives/app-review/introduction)
- [Meta App Approval Guide (Saurabh Dhar)](https://www.saurabhdhar.com/blog/meta-app-approval-guide)
- [Facebook Video API — Publishing](https://developers.facebook.com/docs/video-api/guides/publishing/)
- [Facebook Graph API — Upload File/Video](https://developers.facebook.com/docs/graph-api/guides/upload/)
- [Facebook Graph API Rate Limiting](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/)
- [Meta Permissions Reference](https://developers.facebook.com/docs/permissions/)
- [X API v2 Media Upload Announcement](https://devcommunity.x.com/t/announcing-media-upload-endpoints-in-the-x-api-v2/234175)
- [X API Chunked Media Upload](https://docs.x.com/x-api/media/quickstart/media-upload-chunked)
- [X Media Best Practices](https://developer.x.com/en/docs/x-api/v1/media/upload-media/uploading-media/media-best-practices)
- [X API Pricing](https://docs.x.com/x-api/getting-started/pricing)
- [X API Pricing 2026 (Zernio)](https://zernio.com/blog/twitter-api-pricing)
- [X API Pay-Per-Use Launch](https://devcommunity.x.com/t/announcing-the-launch-of-x-api-pay-per-use-pricing/256476)
- [X Free Tier Media Upload Rate Limits](https://devcommunity.x.com/t/what-are-the-rate-limits-for-media-upload-when-used-with-twitter-api-v2-free-tier/245725)
- [Kick Developer Portal](https://dev.kick.com/)
- [Kick Dev Docs (GitHub)](https://github.com/KickEngineering/KickDevDocs)
- [Kick API Developer Fund (Tubefilter)](https://www.tubefilter.com/2025/03/07/kick-launches-api-developer-fund-third-party-streamer-tools/)
- [Ayrshare — Social Media APIs](https://www.ayrshare.com/)
- [Ayrshare Pricing](https://www.ayrshare.com/pricing/)
- [10 Best Unified Social Media APIs for Developers 2026 (Outstand)](https://www.outstand.so/blog/best-unified-social-media-apis-for-devs)
- [Late — Unified Social Media API](https://getlate.dev/)
- [Buffer SOA Architecture](https://buffer.com/resources/implementing-service-oriented-architecture-at-buffer/)
- [Hootsuite Reactive Systems (ACM Queue)](https://queue.acm.org/detail.cfm?id=3131240)
- [Hootsuite 700+ Microservices (OpsLevel)](https://www.opslevel.com/case-studies/hootsuite)
- [Social Media API Integration: Tech Debt Trap (Cloud Campaign)](https://www.cloudcampaign.com/blog/social-media-api-integration)
- [Postiz — Open Source Social Media Scheduler](https://github.com/gitroomhq/postiz-app)
- [Mixpost — Self-Hosted Social Media Management](https://github.com/inovector/mixpost)
- [Socioboard 5.0](https://github.com/socioboard/Socioboard-5.0)
- [Open Source Social Media Scheduler Tools (Postiz Blog)](https://postiz.com/blog/open-source-social-media-scheduler)
