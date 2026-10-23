# BeatBond security audit

Audit date: 2026-10-21

Scope: repository code, route definitions, local dependency lockfiles, ignored environment-file names, production frontend build, lint, and tests. Production credentials, hosted service configuration, database network policy, and deployment access were not inspected.

## Findings

### Critical

- No critical issue was confirmed in the inspected code.

### High

- **Unauthenticated scheduled mutation — fixed.** `POST /api/search/saved/check-new-results` previously updated all active users’ saved-search records without authentication. It now requires Clerk authentication and the verified admin allowlist.
- **Admin allowlist fail-open — fixed.** Missing `ADMIN_EMAIL` could compare equal to a missing Clerk primary email. Admin checks now fail closed, normalize email case, and require a verified primary address.
- **Client-controlled sign-in identity — fixed.** The callback previously accepted email, username, name, and image from the browser body. It now fetches those values from Clerk server-side and returns only a limited profile response.
- **Push endpoint SSRF / subscription reassignment — mitigated.** Subscriptions now require HTTPS and known browser push-service hosts, bounded endpoint/key fields, and cannot be claimed by a different account. This depends on the maintained push-provider host allowlist staying current.

### Medium

- **Unbounded request and upload inputs — fixed in the main API path.** JSON and form bodies now have limits. Uploads are bounded by count, size, and metadata; profile/admin images and admin audio are checked against file signatures. Admin upload temporary files are removed after processing, and the cleanup job now targets the configured temp directory.
- **Endpoint abuse — mitigated.** AI chat, profile/admin uploads, comments, push subscriptions, and Saavn provider routes now have per-process limits. WebSocket connections and events have per-user/per-event caps. These limits are local to one process; multi-instance consistency requires Redis-backed limiting.
- **Response hardening — improved.** Added content-type, frame, referrer, permissions, and production HSTS headers; disabled Express identification; bounded parsers; and made production error responses generic. A full Content Security Policy still needs validation against the deployed Clerk, Mapbox, Cloudinary, and media origins.
- **Playlist ID access — fixed.** `GET /api/playlists/:playlistId` previously allowed any signed-in user who knew an ID to read the playlist. It now returns playlists only to their owner. The current product flow uses account-owned playlists; public sharing would need an explicit visibility/share policy.
- **Dependency advisories — unresolved.** Repository `npm audit --omit=dev` reported 8 advisories (5 high, 3 moderate), primarily in the Tailwind 3/PostCSS selector parsing chain. The backend audit also reported `braces` through `chokidar`/`nodemon`; npm’s proposed force remedy downgrades Nodemon to 1.14.10. No breaking or forced dependency changes were applied.

### Low / Informational

- `.env` files are ignored, and safe backend/frontend `.env.example` templates were added. No real credential values are included in those templates.
- Frontend `VITE_*` variables are public by design. Keep only browser-safe publishable keys there; move privileged keys to the backend.
- No unsafe `dangerouslySetInnerHTML` use was found in the scanned frontend source.
- Database credential permissions, MongoDB TLS/network allowlists/backups, Clerk session configuration, Cloudinary access rules, repository visibility, production HTTPS, and monitoring were not verifiable from this workspace.

## Route access-control inventory

| Route group | Access observed after changes |
| --- | --- |
| `/api/admin/check` | Clerk-authenticated; returns admin status |
| Other `/api/admin/*` | Clerk-authenticated and verified `ADMIN_EMAIL` allowlist |
| `/api/stats/*` | Clerk-authenticated and verified admin allowlist |
| `/api/auth/callback` | Clerk-authenticated, current legal-consent check, per-user rate limit |
| `/api/users/*` | Clerk-authenticated; account/profile/chat writes use caller identity and resource checks; uploads rate-limited |
| `/api/friends/*`, `/api/avatar/*` | Clerk-authenticated |
| `/api/chat` | Clerk-authenticated, consent-gated, rate-limited; `/api/chat/health` is public and returns availability only |
| `/api/search/*` | Clerk-authenticated |
| `/api/search/history/*`, `/api/search/saved/*` | Clerk-authenticated and user-scoped; saved-search batch maintenance is admin-only |
| `/api/playlists/*` | Clerk-authenticated; create/update/delete are owner-scoped; read-by-ID visibility is listed above as unresolved |
| `/api/notifications/*` | Push public key is public; all user data/subscription routes are Clerk-authenticated and user-scoped |
| `/api/comments/*` | Song/user comment reads are public; creation/deletion require Clerk auth; deletion checks ownership |
| `/api/posts/*` | Clerk-authenticated; deletion checks post ownership |
| `/api/locations/context`, `/api/locations/search` | Public map metadata/search; live locations and preferences require Clerk auth and visibility checks |
| `/api/saavn/*` | Public third-party catalog proxy; all routes now rate-limited |
| `/api/music/recommendations/*` | Public third-party recommendation endpoint with a per-process limit |
| `/api/songs/*`, `/api/albums/*` | Catalog reads are public; likes require Clerk auth and are tied to caller identity |
| `/health/*` | Public service/database status only |

This inventory reflects route middleware and controller checks inspected in source; it is not a production penetration test.

## Secret scan

- No tracked `.env`, local/production env file, key, dump, or built `dist` file was found in the current Git index or in the checked history path names.
- Current source was checked for common private-key, cloud-token, and database-credential patterns. No matches were found after excluding dependency lockfiles and the placeholder env templates.
- Gitleaks is not installed in this environment. A complete secret-aware scan of every historical blob was therefore not verified. If repository access is shared, run Gitleaks across all refs and rotate any credential it identifies before considering history cleanup.
- Secret values were not printed or added to this report.

## Checks run

- `npm test`: **56 backend tests passed; 58 frontend tests passed.** Run with local networking enabled for the WebSocket integration test.
- `npm run build`: passed, including TypeScript and Vite production build. Vite reports the existing Mapbox bundle exceeds 500 kB.
- `npm run lint`: 0 errors, 6 existing warnings.
- `node --check` on changed backend JavaScript and `git diff --check`: passed.
- `npm audit --omit=dev`: 8 advisories (5 high, 3 moderate) across the workspace dependency graph. No forced update was applied.

## Deployment checklist

- Set `NODE_ENV=production`, `CLERK_SECRET_KEY`, `MONGODB_URI`, and the production `CLIENT_URL`/`FRONTEND_URL` values. The server now fails startup if Clerk or MongoDB credentials are absent.
- Set `TRUST_PROXY_HOPS` to the exact trusted proxy count for the host, or leave it unset when there is no trusted proxy.
- Set `ADMIN_EMAIL` to one verified Clerk primary email; verify the intended admin account before deployment.
- Keep Cloudinary, Redis, Groq, relay, and VAPID secrets in backend-only deployment secrets. Keep only publishable Clerk/Mapbox keys in frontend build variables.
- Restrict MongoDB users and network access to the application; require TLS and test backups/restore.
- Confirm the production origin allowlist and HTTPS behavior, then test login, uploads, push, chat, and all admin operations with dedicated accounts.
- Use a shared Redis-backed rate limiter if more than one backend instance serves traffic.
- Run Gitleaks over all repository refs and review hosted platform logs for accidentally recorded credentials before release.
- Review CSP directives against actual required third-party origins before enforcing a policy.

## Remaining limits

This audit did not rotate credentials, alter production infrastructure, inspect hosted settings, or rewrite Git history. It does not certify the application as completely secure. The playlist visibility policy, shared rate limiting, CSP, dependency advisory remediation, full historical secret scanning, and infrastructure controls remain follow-up work.
