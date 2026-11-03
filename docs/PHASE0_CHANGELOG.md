# Phase 0: Foundations

## Changelog

- Added `docs/REPO_MAP.md` describing the app stack, auth and data paths, playback, chat, uploads, realtime, and current README implementation status.
- Added deterministic, server-evaluated feature flags with optional per-user percentage rollout through authenticated `GET /api/features`. An empty `FEATURE_FLAG_ROLLOUTS` config keeps all flags off.
- Added a verified-admin feature-flag panel with persistent MongoDB on/off overrides and a reset action to restore environment rollout behavior. New overrides apply to every signed-in user and take effect immediately; no existing collections or user data are migrated.
- Expanded `/health` with MongoDB, Cloudinary, Redis, and JioSaavn checks, short response caching, and rate limiting.
- Unified API, direct-chat WebSocket, and Socket.IO origin allowlists. Comma-separated origins work through `CLIENT_URL`, `FRONTEND_URL`, or `ALLOWED_ORIGINS`.
- Added optional Sentry reports for direct-chat and Group Listening socket failures and final media playback failures.
- Added server-generated request IDs, structured HTTP completion/error and first rate-limit-rejection logs, and request-ID tags on API Sentry errors. Logs use route patterns and omit raw paths, query strings, and user IDs.
- Suppressed successful CORS preflight (`OPTIONS`) and cache-hit (`304`) completion logs; failed preflights remain logged.
- Added a reusable accessible loading/empty/error `StatePanel` primitive and tests.
- Documented environment setup for single-origin and separately hosted deployments.

## Production messaging and voice-note findings

- The API and socket layers previously had a hardcoded production frontend origin and accepted only single-value `CLIENT_URL` and `FRONTEND_URL` settings. A different deployed frontend origin could fail HTTP CORS and WebSocket handshakes. The origin configuration is now shared and supports comma-separated values.
- `VITE_API_URL` and `VITE_SOCKET_URL` are compiled into the frontend at build time. A local `localhost` URL in the production frontend build prevents it from reaching the hosted backend. For same-origin deployments, leave both unset; for separate hosting, set both before building.
- Voice-note upload code already checks Cloudinary credentials and enforces duration, MIME type, and upload size. Local `backend/.env` credentials are not inherited by the hosting platform; all three Cloudinary variables must also be configured in the deployed backend environment.
- The actual live deployment origin, frontend build variables, host configuration, and provider credentials were not accessible from this repository session, so the deployed incident cannot be confirmed end to end from code alone.

## Migrations and environment variables

- No migration files or edits to existing schemas. The new FeatureFlag collection is additive.
- Added an additive `FeatureFlag` MongoDB collection. Rollback requires no data rewrite; removing the UI/API leaves the collection inert. Do not drop it automatically.
- Added optional `ALLOWED_ORIGINS` (comma-separated exact browser origins) and `FEATURE_FLAG_ROLLOUTS` (JSON map, empty by default) to `backend/.env.example`.
- Existing Cloudinary, CORS, and frontend endpoint variables are documented; no secrets were added.

## Manual QA checklist

- [ ] Set the production frontend origin in `CLIENT_URL` or `FRONTEND_URL`; add any extra preview origins in `ALLOWED_ORIGINS`.
- [ ] Confirm production frontend build variables point to the backend, or are unset for same-origin hosting.
- [ ] Sign in and confirm `GET /api/features` returns `{ "flags": {} }` by default.
- [ ] In a non-production environment, enable a test flag at 0%, 10%, and 100%; confirm stable assignment for the same signed-in user.
- [ ] As the verified admin, toggle a flag off/on and confirm the override persists after reload; confirm a non-admin cannot access admin flag endpoints.
- [ ] Reset an admin override and confirm the configured percentage rollout takes effect again.
- [ ] Confirm HTTP responses include `X-Request-Id` and structured logs contain no query strings or account IDs.
- [ ] Confirm `/health` reports MongoDB and the status of Cloudinary, Redis, and JioSaavn without exposing credentials.
- [ ] Send a direct text message and a short voice note between two test accounts; confirm persistence and playback.
- [ ] Open Group Listening and verify room creation/joining; check browser console and Sentry for socket failures when configured.
- [ ] Play a track with a broken primary stream and confirm the existing fallback source still works.



## Verification results

- `npm.cmd --prefix backend test`: **85 passed**.
- `npm.cmd --prefix frontend test`: **86 passed**.
- `npm.cmd --prefix frontend run lint`: **passed**, 0 errors and 6 existing warnings.
- `npm.cmd --prefix frontend run build`: **passed**, including TypeScript project checks; Vite reports existing large-chunk warnings.
- Manual deployment QA and browser E2E were not run. Production host variables, deployment logs, and authenticated test accounts were unavailable.
