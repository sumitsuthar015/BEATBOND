<h1 align="center">Realtime Beatbond Application ✨</h1><br>
# making more expensive 

## Social listening enhancements

- **Collaborative playlists:** playlist owners can invite friends from the playlist detail screen. Collaborators can add, remove, and reorder songs; only the owner can manage collaborators or delete the playlist.
- **Blend playlist and taste match:** open a friend's Blend from the Friends screen. It compares recent listening, shows the shared-song match percentage, and builds a playable mixed list. A friend's listening-history privacy setting is respected.
- **Group chats:** open the group-chat button in Messages, create a group with friends, and send live messages. Membership and history are stored in MongoDB; only members can join the realtime channel.
- **Richer direct chat:** typing indicators and emoji reactions already existed. Direct messages now also support recorded voice notes, uploaded to Cloudinary and limited to 60 seconds.
- **Music stories:** share the current song from Home. Stories appear to friends and expire after 24 hours.
- **Trending near you:** Home shows songs listened to nearby in the last 14 days. Results use opted-in, recently shared locations and only include listening histories the viewer may access. Nearby discovery uses a 50 km radius.

Cloudinary credentials are required for voice-note uploads. Nearby trends appear after location sharing is enabled on Friends Map. Blend results require the friend's listening history to be shared with friends.

### Deployment and operations

- Configure `CLIENT_URL` or `FRONTEND_URL` on the backend to the deployed frontend origin. `ALLOWED_ORIGINS` can contain additional comma-separated origins. API requests, direct-chat WebSockets, and Group Listening use the same allowlist.
- For separately hosted frontend/backend deployments, build the frontend with `VITE_API_URL=https://<backend-origin>/api` and `VITE_SOCKET_URL=https://<backend-origin>`. Leave these unset when both are served from one origin.
- Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the backend hosting environment for voice-note uploads. Local `backend/.env` values do not transfer to a hosting provider.
- `GET /health` reports MongoDB, Cloudinary, Redis, and JioSaavn provider status. MongoDB is required for an `ok` result; Cloudinary, Redis, and provider status are reported separately. The response is cached briefly and rate-limited.
- Feature flags are server-evaluated for the signed-in user at `GET /api/features`. `FEATURE_FLAG_ROLLOUTS` is a JSON object and defaults to `{}`, so flags start off. Example: `{"daily_mixes":{"enabled":true,"rolloutPercent":10}}` enables a stable 10% user cohort. The verified admin can view configured flags under Admin → Feature flags and set a persistent on/off override via `/api/admin/feature-flags`; an admin override affects all signed-in users. Keep unapproved flags off in production.
- Admin feature-flag API: `GET /api/admin/feature-flags` lists flags; `PATCH /api/admin/feature-flags/:name` accepts `{ "enabled": boolean }`; `DELETE /api/admin/feature-flags/:name` clears an override and restores the environment rollout. All require the verified admin account. `GET /api/features` returns the effective per-user boolean map.
- HTTP responses include a server-generated `X-Request-Id`. Backend completion, failures, and first rate-limit rejections per window are structured JSON logs keyed by route pattern; raw paths, query strings, and user identifiers are excluded. Successful CORS preflights and `304 Not Modified` cache responses are omitted to reduce routine log noise.
- Sentry reporting remains optional. Set `SENTRY_DSN` and `VITE_SENTRY_DSN` to receive API, socket, and terminal media playback error reports.

See [the repo map](docs/REPO_MAP.md) and [Phase 0 manual QA checklist](docs/PHASE0_CHANGELOG.md) for implementation notes.

## Group Listening

Group Listening uses an authenticated Socket.IO connection. A host creates a temporary five-character room code and shares it with listeners. The server owns the room's track and playback clock; it broadcasts a full snapshot after host actions and promotes the longest-present member if the host disconnects. Rooms are deleted when their last member leaves and are held in process memory.

Run the backend and frontend with `npm run dev` from the repository root. Sign in, open **Group Listening** from the home page, create a room, and share its code. The host chooses and plays songs using BeatBond's normal player; track changes, play/pause, and seeks are broadcast to listeners. There is no separate upload or audio URL step. Listeners' own player pauses while they are in the room and is restored when they leave or close the room page. Browsers that block autoplay show a **Tap to enable sound** button.

| Event | Direction | Purpose |
| --- | --- | --- |
| `time:ping` | client → server | Acknowledges with server time for client clock estimation. |
| `room:create` | client → server | Creates a room; acknowledgement returns its code and first snapshot. |
| `room:join` | client → server | Joins by code; acknowledgement returns the current snapshot or an error. |
| `room:leave` | client → server | Leaves the active room; disconnect also leaves automatically. |
| `host:load` | client → server | Host sets an HTTP(S) track URL, title, and optional duration. |
| `host:play` | client → server | Host starts playback. |
| `host:pause` | client → server | Host pauses at the current server position. |
| `host:seek` | client → server | Host sets a non-negative playback position. |
| `room:state` | server → room | Full room snapshot, including member list, playback state, position, and server timestamp. |

All host controls are authorized on the server and rate-limited per socket. Clients take five clock samples on connect, keep the lowest-round-trip sample, refresh it each minute, and correct playback drift above 0.6 seconds every three seconds. Verify room behavior with `npm --prefix backend test`.

## Podcasts

Podcast search and new/trending suggestions use the Apple Podcasts catalog. Selecting a show resolves its public RSS feed and stores show metadata and playable audio episodes in MongoDB. RSS feeds are refreshed every 30 minutes using conditional HTTP requests and retry backoff. Playback uses the shared BeatBond audio element; YouTube video playback is not used.

Sign in and open **Podcasts** to search, follow a show, and play its episodes. Progress is saved to the signed-in user's account while listening and when paused; playback resumes at the saved position. Podcast speed is available in the player and saved to the user's profile. Podcast chapter markers from Podcasting 2.0 feeds are shown in the player. The backend's existing `ADMIN_EMAIL` configuration controls who can add a custom public HTTPS RSS feed with `POST /api/v1/podcasts`.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/podcasts/search?q=...` | Search the Apple catalog. |
| `GET /api/podcasts/discover` | Load new and trending show suggestions. |
| `GET /api/podcasts/:collectionId/episodes` | Resolve and return a show's saved RSS audio episodes and user progress. |
| `GET /api/v1/podcasts/me/subscriptions` | Return followed RSS shows. |
| `GET /api/v1/podcasts/me/continue-listening` | Return unfinished episodes with saved progress. |
| `GET /api/v1/podcasts/me/new-episodes` | Return recent episodes for followed shows. |
| `PUT /api/v1/podcasts/episodes/:id/progress` | Save episode position or completion. |
| `GET /api/v1/podcasts/me/playback-preference` / `PUT /api/v1/podcasts/me/playback-preference` | Read or save podcast playback speed. |
| `POST /api/v1/podcasts` | Admin-only custom HTTPS RSS feed registration. |

Podcast persistence uses MongoDB models and Mongoose indexes; there is no separate SQL migration. The periodic RSS refresh starts with the backend server. Apple catalog search does not require an API key. Custom feeds must be reachable public HTTPS RSS URLs.

## Future enhancements implementation status

The following tracks the 30 items in `BeatBond_Future_Enhancements.pdf`. “Partial” means the app has a useful version, but the full production/provider/native workflow still needs external setup or more work.

| # | Enhancement | Status in this app |
| --- | --- | --- |
| 1 | Listen Together | Implemented: authenticated Socket.IO rooms, server-owned playback state, host controls, handoff, drift correction, late join and optional Redis adapter/state. |
| 2 | Collaborative playlists | Implemented: invite collaborators and add, remove, and reorder tracks. |
| 3 | Blend playlist and taste match | Implemented: privacy-aware shared listening comparison and playable Blend. |
| 4 | Group chats | Implemented: group conversations are in Messages, with member management and persistent history. |
| 5 | Richer chat | Implemented: typing, voice notes, emoji reactions, and message edit/read controls. Voice uploads need Cloudinary. |
| 6 | Music stories | Implemented: 24-hour stories with delete controls. |
| 7 | Trending near you | Implemented: location-sharing based trends with blurred/aggregated nearby results. |
| 8 | Sleep timer | Implemented: 15/30/60 minute and end-of-track timers. |
| 9 | Crossfade and gapless | Partial: gapless depends on the remote audio source; crossfade awaits reliable CORS support from catalogue streams. |
| 10 | Equalizer | Partial: UI/audio graph is not enabled because current cross-origin streams do not reliably allow Web Audio processing. |
| 11 | Cast | Partial: Playback menu can open the browser's native remote playback picker where supported; a branded receiver needs a Cast integration and receiver app. |
| 12 | AI playlist generator | Implemented: Groq ranks tracks from the existing catalogue after consent. Configure `GROQ_API_KEY` (optionally `GROQ_CHAT_MODEL`). |
| 13 | Wrapped | Implemented: monthly/yearly listening recap and shareable image. |
| 14 | Collaborative recommendations | Implemented: recommendations use co-listening signals from saved activity. |
| 15 | Mood detection | Partial: users can select a mood and build a matching playlist; automatic mood detection is not enabled. |
| 16 | Therapy chat linked to music | Partial: therapy chat can explicitly send the latest message to the consent-gated playlist generator. It is not a clinical service. |
| 17 | Push notifications | Implemented: browser push subscriptions and targeted alerts; configure VAPID keys. Followed-artist releases and saved-search updates are included. |
| 18 | Native mobile | Partial: Capacitor Android and iOS projects are generated. Android requires Android Studio/SDK; iOS requires macOS/Xcode for native builds and store release. |
| 19 | Multilingual | Partial: English and Hindi are selectable for shared navigation/settings strings; full app translation remains. |
| 20 | Artist accounts | Partial: artist profiles and admin verification exist; self-service artist applications, upload dashboard, and payouts remain. |
| 21 | Podcasts | Implemented: Apple podcast discovery/search backed by persisted RSS feeds, shared audio playback, episode queueing, resume progress, chapter markers, saved playback speed, and periodic feed refresh. Video playback is not used. |
| 22 | Reporting/moderation | Implemented: users report supported content; admins review, dismiss, or remove content from Moderation. |
| 23 | Deletion/export | Implemented: account deletion and rate-limited authenticated JSON export. |
| 24 | Helmet/shared rate limit | Partial: security response headers and Redis-shared limits are implemented; Helmet itself is not used. |
| 25 | Blur locations | Implemented: nearby trends use coarse/aggregated locations, not precise public pins. |
| 26 | Redis | Partial: Redis adapters/state and shared rate limiting activate when `REDIS_URL` is configured; deploy Redis to scale across instances. |
| 27 | Music-source dependence | Partial: playback/search can use the local catalogue when the upstream source has no result; provider licensing and availability remain external. |
| 28 | Tests/CI/Playwright | Partial: backend/frontend suites and production build run in GitHub Actions; authenticated browser E2E coverage with Playwright remains. |
| 29 | Error monitoring | Implemented as optional Sentry integration. Configure `SENTRY_DSN` and optional `VITE_SENTRY_DSN`. |
| 30 | Backend TypeScript | Not migrated: backend remains JavaScript; converting it safely is a separate repository-wide migration. |

Run local checks with `npm test`, `npm --prefix backend test`, `npm --prefix frontend test`, and `npm --prefix frontend run build`. Configure `REDIS_URL` for shared Socket.IO state/rate limits and VAPID keys for push delivery. The AI generator requires `GROQ_API_KEY`; image/audio uploads require Cloudinary credentials. The admin saved-search worker is `POST /api/search/saved/check-new-results`; schedule it with an authenticated admin token.
