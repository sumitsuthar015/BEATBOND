# BeatBond Engineering Context

Discovery snapshot: 2026-11-03 (Asia/Calcutta)

## Stack and structure

| Area | Stack / location |
| --- | --- |
| Runtime | Node.js `>=20 <23`; CI uses Node 22. Root npm workspaces: `frontend`, `backend`. |
| Frontend | React 18, TypeScript 5.6, Vite 6, React Router 7, TanStack Query 5, Zustand 5, Tailwind 3, Radix UI, Sentry React 11. `frontend/src`. |
| Backend | Express 4, JavaScript ES modules, Mongoose 8, Clerk Express, Socket.IO 4, `ws` 8, Redis 6, Cloudinary 2, Sentry Node 11. `backend/src`. |
| Data | MongoDB/Mongoose. Schemas are in `backend/src/models`; controllers/services/routes are separated under matching `backend/src` folders. |
| Tests/build | Node test runner for backend, Vitest 5 for frontend, ESLint 9 and TypeScript/Vite build. GitHub Actions runs `npm ci`, `npm test`, and frontend build. |
| External services | Clerk auth, Cloudinary uploads, JioSaavn catalogue/relay, Apple Podcasts catalog/RSS, optional Redis, Groq AI, Mapbox, Web Push/VAPID, optional Sentry. |

The main frontend areas are `components`, `hooks`, `layout`, `lib`, `pages`, `providers`, and `stores`. Backend entry is `backend/src/index.js`; route files are `backend/src/routes/*.route.js`, controllers `backend/src/controller`, services `backend/src/services`, and shared helpers `backend/src/lib`. `saavn-relay` is a small separate provider relay. Android/iOS shells are generated under `frontend/android` and `frontend/ios`.

## How the main flows work

- **Auth:** Clerk React owns browser sessions. `frontend/src/providers/AuthProvider.tsx` initializes the auth store/token provider. Axios and socket clients request fresh Clerk tokens. `clerkMiddleware` runs in Express; `protectRoute` requires a user and provisions an account only through the consent-checked `/api/auth/callback`. Admin access checks the verified primary email against `ADMIN_EMAIL` (`backend/src/middleware/auth.middleware.js`).
- **Playback:** `usePlayerStore`, `useMusicStore`, and `useAudioStore` hold playback/catalog state. `AudioPlayer` uses a shared HTML audio element, tries fallback stream sources, saves listening activity, and supports podcast resume and chapters. Catalog requests use backend song/music/Saavn routes and the `@saavn-labs/sdk`; playback streams may be provider/CDN URLs.
- **Direct chat:** REST endpoints load history and perform edits, deletes, reactions, and reads. Authenticated JSON packets over the custom `/ws` WebSocket handle presence, typing, delivery, and new messages (`backend/src/lib/realtime.js`, `frontend/src/lib/realtimeSocket.ts`). Messages are persisted in MongoDB. Redis optionally shares events/presence across instances.
- **Voice notes and uploads:** `VoiceNoteRecorder` uses browser `MediaRecorder`, creates a bounded local recording, and posts multipart audio to `/api/messages/audio`. Backend `express-fileupload` writes temporary files; the controller checks recipient friendship/block status, byte size, duration, and file magic bytes, uploads to Cloudinary, persists a `Message`, broadcasts it, and removes its temp file. Cloudinary vars are `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
- **Other uploads:** profile photos, avatars, group images, and admin catalogue media use authenticated controllers, file-size/count limits, and image/audio validation helpers. Cloudinary is the shared media store.
- **Podcasts:** Apple catalog search/discovery returns show data. Public RSS feeds are checked against private-network/SSRF targets, parsed into Podcast/PodcastEpisode records, refreshed every 30 minutes with conditional headers/backoff, and chapters are parsed when present. User subscriptions, progress, and playback speed are stored in separate Mongoose models. Both legacy `/api/podcasts` and `/api/v1/podcasts` route groups currently exist.
- **Rooms:** Group Listening uses authenticated Socket.IO with server-owned playback snapshots, host authorization, handoff, drift correction, and optional Redis adapter/shared state. Without Redis, rooms are in process memory. Group chat uses MongoDB membership/history and realtime Socket.IO channels; access checks are membership-scoped.
- **Notifications:** MongoDB notifications cover messages and friend/system events. Web Push uses `web-push` and VAPID env vars, stores per-user subscriptions, and removes expired endpoints. Some push and realtime notification failures are logged and treated as non-blocking.
- **Health and monitoring:** `/health` reports DB, Cloudinary, Redis, and JioSaavn status (workspace implementation); Sentry is optional (`SENTRY_DSN`, `VITE_SENTRY_DSN`). HTTP responses carry a server-generated `X-Request-Id`; backend HTTP completion/failure/rate-limit events use structured JSON logs. Express reports API exceptions, React has an error boundary, and socket/media error reports are optional.

## Conventions to follow

- **Names/layout:** backend ES modules; route files use `.route.js`, models `.model.js`, most controllers `.controller.js`; frontend React components/pages use PascalCase, hooks `useX`, stores `useXStore`, and path alias `@/` maps to `frontend/src`.
- **HTTP errors:** handlers generally return `{ message: string }`; the Express error handler maps known 4xx errors to their message and hides 5xx details. Keep errors useful without returning secrets or internal traces.
- **Auth/authorization:** apply `protectRoute` at route or router level, then check resource ownership, friend/block state, or group membership in the controller/service. Apply `requireAdmin` for admin operations. Writes and provider-heavy reads commonly use `rateLimit`.
- **Validation:** input validation is mostly explicit/manual in controllers and services, with bounded Mongoose schemas and file-signature checks. No general schema-validation package is in the package manifests. Reuse existing helpers and add focused validation; do not assume every route has equivalent coverage.
- **State/data fetching:** Zustand for durable/global client state; TanStack Query for server-backed cache; Axios shared client for HTTP; socket wrappers for realtime.
- **UI/styling:** Tailwind utility classes, CSS variables in `frontend/src/index.css`, and Radix/shadcn-style primitives in `frontend/src/components/ui`. Use the shared toast/dialog patterns rather than adding dependencies.
- **i18n:** `frontend/src/lib/i18n.ts` is a small English/Hindi lookup used by shared navigation/settings strings. Coverage is partial; new user-facing strings should add English/Hindi keys and avoid sentence concatenation.
- **Tests:** backend uses `node:test` and module mocks in `backend/tests`; frontend uses Vitest colocated `*.test.ts(x)` files. Tests should mock external providers; current CI does not run authenticated browser E2E.
- **Config/secrets:** backend loads `backend/.env` locally through `loadEnv.js`; production platform env remains authoritative. Vite `VITE_*` values are public and fixed at build time. `.env` files are ignored; maintain `.env.example` without secrets.

## Feature status

Evidence combines README claims and code paths; “partial” means the user path exists but has known setup, provider, scale, or workflow limits. Workspace changes are not automatically live in production.

| Status | Feature groups | Evidence |
| --- | --- | --- |
| Implemented | Sign-in and consent, profiles/friends/blocking/privacy, direct/group messaging, voice notes, playlists/collaboration, likes, history/Wrapped, stories/comments/reports, map/location privacy, notifications/push, podcast discovery/RSS/progress, admin moderation, group listening core, player/queue/offline basics. | `frontend/src/providers/AuthProvider.tsx`; `backend/src/middleware/auth.middleware.js`; `backend/src/routes`; `backend/src/models`; `frontend/src/stores`; `frontend/src/pages`; `backend/src/lib/realtime.js`; `backend/src/lib/groupListening.js`; `backend/src/controller/audioMessage.controller.js`; `backend/src/services/podcast.service.js`; README feature table. |
| Partial | Full multilingual coverage; group-room scheduling/invites/chat and multi-instance correctness unless Redis is configured; crossfade/equalizer; native mobile release; artist self-service; provider reliability/licensing; consolidated API versioning; complete accessibility and UX-state coverage. | `frontend/src/lib/i18n.ts`; `backend/src/lib/groupListening.js`; `frontend/src/pages/group-listening/GroupListeningPage.tsx`; `frontend/src/layout/components/AudioPlayer.tsx`; `frontend/android`, `frontend/ios`; README feature table. |
| Missing / roadmap | E2E browser suite and seeded one-command CI; discovery feedback/daily mixes/radio; playlist folders/roles/insights; podcast transcripts/clips/bookmarks; community polls/games/time capsules/fan clubs; artist submission/dashboard/embeds; message search/pinning/drafts; teen-safe mode, device sessions, support and backup tooling. | No Playwright config or browser test suite found; absence in README status table and route/model/page inventory. |

## Top 10 risks / tech debt

1. **Production setup is outside repository control.** `VITE_API_URL`/`VITE_SOCKET_URL` are build-time values; Cloudinary and CORS origins must be set in the host. The production incident cannot be validated without host access. Evidence: `frontend/src/lib/axios.ts`, `frontend/src/stores/useChatStore.ts`, `.env.example`, Phase 0 deployment notes.
2. **Feature flags still need adoption by feature code.** The workspace has server evaluation, environment cohorts, and a persistent verified-admin override, but future endpoints/components must explicitly consume the flag before a feature is safely rolled out. Evidence: `backend/src/lib/featureFlags.js`, `backend/src/routes/featureFlags.route.js`, `backend/src/controller/featureFlag.controller.js`.
3. **Health checks perform external requests.** Cloudinary, Redis, and JioSaavn checks are cached briefly and rate-limited, but provider latency can still delay a cold health request; no per-provider metrics or readiness/liveness split exists. Evidence: `backend/src/lib/healthChecks.js`, `backend/src/routes/health.route.js`.
4. **Metrics and operational dashboards are absent.** HTTP request IDs and structured route-pattern logs exist in the workspace, but no aggregated metrics/dashboard covers sockets, uploads, limits, provider health, or scheduled jobs. Evidence: `backend/src/middleware/requestContext.middleware.js`, `backend/src/lib/logger.js`, `backend/src/index.js`, `.github/workflows`.
5. **No browser E2E or post-deploy smoke suite.** Current CI runs unit suites and a frontend build, not lint, signed-in flows, or provider-mocked browser checks. Evidence: `.github/workflows/ci.yml`, test file inventory.
6. **Validation standards vary by route.** Validation is manual and uneven; no common schema validator or API contract definitions are present. Security audit also identifies unresolved dependency advisories and CSP validation. Evidence: route/controller inventory, `SECURITY_AUDIT.md`.
7. **Unbounded or embedded collections may grow.** Playlist songs and several user/group arrays are embedded; history/message endpoints often use limits but a consistent cursor-pagination policy is not established. Evidence: `backend/src/models/playlist.model.js`, `user.model.js`, group models, controllers.
8. **Multi-instance behavior is optional and uneven.** Direct realtime and group rooms fall back to in-process state; Redis must be correctly provisioned for cross-instance delivery, and scale behavior needs deployment verification. Evidence: `backend/src/lib/realtimeRedis.js`, `groupListeningRedis.js`, `groupListening.js`.
9. **Realtime implementation is concentrated in large modules.** `backend/src/lib/realtime.js` combines authentication, presence, chat, read receipts, notifications, limits, and Redis bridge behavior, making changes prone to coupling.
10. **Provider and data lifecycle complexity.** Saavn/catalog availability and licensing are external; podcast has legacy and v1 APIs; schema/index evolution and rollback are not managed by an explicit migration framework. Evidence: `backend/src/services/saavn.service.js`, podcast routes/models, package manifests, README.

## Current workspace state

- Branch: `main`; HEAD at discovery start: `7ea8bec`.
- The workspace contains uncommitted Phase 0 implementation and docs from the preceding task and the approved continuation. No feature work is committed.
- Current Phase 0 verification: backend tests 85 passed, frontend tests 86 passed, lint 0 errors / 6 existing warnings, frontend build/type-check passed. No authenticated browser E2E or live deployment verification is available.

