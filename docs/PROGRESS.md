# BeatBond Roadmap Progress

Updated: 2026-11-03 (Asia/Calcutta)

Branch/commit reference: `main` at `7ea8bec`. Worktree has uncommitted Phase 0 changes from the prior task. No new feature/code changes are being made during Phase -1. Status reflects source and documentation inspection; production deployment behavior is not verified.

Legend: **Done** = present in the codebase/worktree; **Partial** = a limited version exists; **Not started** = no implementation found; **Needs provider** = adapter/provider/legal dependency remains.

## Phase -1 — Discovery

- [x] Inspect stack, routes, models, auth, realtime, uploads, config, tests, and CI.
- [x] Write `docs/ENGINEERING_CONTEXT.md` with conventions, status/evidence, and top risks.
- [x] Create this roadmap checklist with status and workspace branch/commit context.
- [x] User reviewed Phase -1 documents and approved work with “go”.

## Phase 0 — Foundations

- [x] Feature-flag service with server evaluation, percentage rollout, and admin toggle — verified-admin UI/API override stored in additive `FeatureFlag` collection, with reset-to-environment support; config defaults off. Future feature handlers must still consume their flags. Evidence: `backend/src/lib/featureFlags.js`, `backend/src/controller/featureFlag.controller.js`, `backend/src/models/featureFlag.model.js`, `frontend/src/pages/admin/components/FeatureFlagsTabContent.tsx`.
- [x] Health checks, structured logging, error monitoring hooks — DB/Cloudinary/Redis/JioSaavn checks, server request IDs, route-pattern JSON logs, and optional Sentry API/UI/socket/media hooks are in place. Metrics/dashboards remain later ops work. Evidence: `backend/src/lib/healthChecks.js`, `backend/src/routes/health.route.js`, `backend/src/middleware/requestContext.middleware.js`, `backend/src/lib/logger.js`, `frontend/src/main.tsx`.
- [~] Production messaging and voice-note configuration — shared CORS origin handling, setup notes, upload checks, and tests exist; **live host variables, actual deployed domain, and end-to-end production behavior are not verified**. Evidence: `backend/src/lib/allowedOrigins.js`, `backend/src/controller/audioMessage.controller.js`, `.env.example`, `docs/PHASE0_CHANGELOG.md`.
- [x] Shared skeleton/empty/error/toast/confirm UI primitives — shared accessible `StatePanel` for loading/empty/error added alongside existing skeleton, toast, and confirm dialog primitives. Evidence: `frontend/src/components/ui/state-panel.tsx`, `frontend/src/components/ui/skeleton.tsx`, `frontend/src/App.tsx`.

## Phase 1 — Test safety net

- [ ] E2E flows for sign-in, playback, direct chat, voice upload, playlist create/edit, and room join — no browser E2E framework/config found.
- [~] Seeded test data and one-command CI — `npm test` runs backend/frontend unit suites; CI has no deterministic browser seed/data workflow and does not run lint. Evidence: root `package.json`, `.github/workflows/ci.yml`.
- [ ] Post-deploy smoke-test script.

## Phase 2 — Core listening experience

- [~] Queue reorder, play next, add to queue, save queue as playlist — player queue exists; full requested queue-management workflow needs verification/implementation. Evidence: `frontend/src/stores/usePlayerStore.ts`, `frontend/src/layout/components/PlaybackControls.tsx`.
- [~] Gapless/crossfade — partial per README; crossfade depends on stream CORS and is not complete. Evidence: `frontend/src/layout/components/AudioPlayer.tsx`, README feature table.
- [~] Volume normalization — equalizer/audio graph is partial; no verified loudness-normalization pipeline found. Evidence: `frontend/src/layout/components/AudioPlayer.tsx`, README.
- [~] Sleep timer with fade-out and wake-up alarm — sleep timer exists; fade-out and chosen-playlist alarm are not found. Evidence: `frontend/src/stores/usePreferencesStore.ts`, `frontend/src/layout/components/PlaybackControls.tsx`.
- [~] Cross-device resume — podcast progress/resume exists; music playback position sync across devices is not found. Evidence: `backend/src/models/podcastProgress.model.js`, `frontend/src/layout/components/AudioPlayer.tsx`.
- [~] Audio quality and explicit filter — stream-quality settings and explicit search filtering exist; account-wide explicit filter behavior needs completion/verification. Evidence: `frontend/src/lib/streamQuality.ts`, `backend/src/controller/search.controller.js`.
- [~] Listening history view/search/delete/clear/pause — view, clear, and export exist; complete search, per-item deletion, and pause-tracking control are not verified. Evidence: `backend/src/routes/user.route.js`, `backend/src/controller/user.controller.js`, `frontend/src/pages/dashboard/DashboardPage.tsx`.
- [~] Synced lyrics, translation, saved excerpts — lyrics lookup exists; sync/translation/excerpts are missing. **Needs provider** for licensed/synced lyrics. Evidence: `backend/src/routes/saavn.route.js`, `frontend/src/layout/components/LyricsPanel.tsx`.
- [~] Offline download management and per-show rules — offline library/downloads exist; storage management and podcast-specific rules are incomplete. Evidence: `frontend/src/hooks/useOfflineDownloads.ts`, `frontend/src/lib/offlineDownloads.ts`.

## Phase 3 — Discovery and personalization

- [ ] Recommendation feedback (“more/less”, exclude artist) stored and applied globally.
- [ ] Personalized scheduled daily mixes.
- [~] Mood/activity modes — mood-based playlist exists; focus/workout/commute/sleep modes are missing. Evidence: `backend/src/services/mood.service.js`, `frontend/src/pages`.
- [ ] Radio stations seeded from artist/song/album/playlist.
- [~] Text-prompt playlist generation with deterministic fallback — AI playlist generator exists; robust provider-free deterministic fallback is not verified. Evidence: `backend/src/controller/playlistGenerator.controller.js`, `frontend/src/pages/playlists/AIPlaylistPage.tsx`.
- [~] Discovery feed — friend activity and nearby trends exist; one feed integrating releases, rising artists, and privacy-aware listening is missing. Evidence: `frontend/src/pages/friends/FriendsActivityPage.tsx`, `backend/src/controller/location.controller.js`.
- [ ] Universal search across songs, podcasts, people, playlists, and messages with filters.

## Phase 4 — Library and playlists

- [ ] Playlist folders, sorting, bulk actions, and duplicate detection.
- [~] Collaborative roles and suggestion approval — collaborator editing exists; role types and approval flow are missing. Evidence: `backend/src/models/playlist.model.js`, `backend/src/routes/playlist.route.js`.
- [ ] Playlist insights, themed cover generator, voice intro.
- [~] Playlist import — **Needs provider** for service integrations; CSV/text import not found.
- [ ] Song credits/metadata — **Needs provider** and rights-aware source.

## Phase 5 — Podcasts

- [~] Transcripts and auto-chapters — RSS chapters supported; transcript ingestion and auto-chapter adapter are missing. Manual chapter editor not found. Evidence: `backend/src/services/podcast.service.js`, `backend/src/models/podcastEpisode.model.js`.
- [ ] Skip silence and voice boost; per-show playback-speed memory (current speed is user-level).
- [ ] Timestamped clips with captions.
- [~] Mixed music/podcast queue and episode bookmarks — podcast episode queue and progress exist; mixed queue/bookmarks need completion/verification. Evidence: `frontend/src/stores/usePlayerStore.ts`, `backend/src/models/podcastProgress.model.js`.
- [ ] Background refresh monitoring and failure alerts — refresh/retry exists, dashboard/alerts missing. Evidence: `backend/src/services/podcast.service.js`, `backend/src/index.js`.

## Phase 6 — Social and community

- [~] Friend activity feed and privacy — friend activity exists; verify all feed controls and pagination. Evidence: `frontend/src/pages/friends/FriendsActivityPage.tsx`, `backend/src/services/privacy.service.js`.
- [~] Friend suggestions by shared taste — recommendations/Blend compare listening; a dedicated suggestion flow is not verified. Evidence: `backend/src/services/recommendation.service.js`, `backend/src/controller/blend.controller.js`.
- [~] Taste compatibility score and breakdown — Blend match exists; detailed breakdown needs verification. Evidence: `frontend/src/pages/friends/BlendPage.tsx`, `backend/src/controller/blend.controller.js`.
- [~] Song of the day with replies/reactions/threaded discussion — song comments, stories, and reactions exist; song-of-day and threaded replies are missing. Evidence: `backend/src/routes/comment.route.js`, `backend/src/models/comment.model.js`, `backend/src/models/post.model.js`.
- [~] Listening rooms — host player track changes/play/pause/seek now sync to members while on the room page; join catch-up, host authority, and handoff exist. Scheduling, requests, vote-to-skip, room chat/invites/reminders/links and verified Redis scale remain. Evidence: `docs/specs/group-listening-host-sync.md`, `backend/src/lib/groupListening.js`, `backend/src/lib/groupListeningRedis.js`, `frontend/src/pages/group-listening/GroupListeningPage.tsx`.
- [ ] Polls, quizzes, and music games in rooms/groups.
- [ ] Future-unlock time-capsule playlists.
- [~] Profile customization — profiles/photos/bios exist; themes, pinned playlists, and mood status are missing. Evidence: `frontend/src/pages/profile/UserProfilePage.tsx`, `backend/src/models/user.model.js`.
- [ ] Fan clubs by artist, genre, or local scene.

## Phase 7 — Artists and creators

- [~] Follow artists, release calendar/reminders/announcements — liked artists and some release notifications exist; follow model/calendar/reminders need completion. Evidence: `backend/src/models/likedArtist.model.js`, `backend/src/services/push.service.js`, README.
- [~] Artist verification application and admin review — admin verification exists; public application queue is missing. Evidence: `backend/src/routes/admin.route.js`, `backend/src/models/verifiedArtist.model.js`.
- [~] Artist dashboard and internal insights — artist profile/catalog and admin stats exist; artist-facing analytics dashboard is missing. Evidence: `frontend/src/pages/home/components/ArtistPage.tsx`, `backend/src/controller/stat.controller.js`.
- [ ] Independent artist submission/review/takedown workflow.
- [~] Fan support links — no payment handling or dedicated external-links UI found.
- [ ] Embeddable player widget.

## Phase 8 — Messaging and notifications

- [~] Message search, pinned/saved messages, drafts, retry status, mute, unread summaries — mute/unread/retry and shared-message views exist; search, pins, saved messages, drafts need completion. Evidence: `backend/src/models/message.model.js`, `backend/src/controller/message.controller.js`, `frontend/src/components/chat/DirectMessageChat.tsx`.
- [~] Attachments for images/playlists/track collections — shared content and group images exist; full attachment set is not implemented. Evidence: `backend/src/models/message.model.js`, `backend/src/controller/groupChat.controller.js`.
- [~] Preferences by type/friend/quiet hours, push controls, weekly digest — push subscriptions and basic message preference exist; full preferences/quiet hours/digest are missing. Evidence: `backend/src/models/user.model.js`, `backend/src/routes/notification.route.js`, `backend/src/services/push.service.js`.
- [ ] Voice-note speed control and waveform scrubbing.

## Phase 9 — Trust, safety, accessibility, account

- [~] Reports, blocks, appeals, spam/abuse detection — reporting/blocking exist; appeals and automated abuse detection are missing. Evidence: `backend/src/routes/report.route.js`, `backend/src/controller/user.controller.js`, `backend/src/models/contentReport.model.js`.
- [ ] Teen-safe mode with stricter defaults.
- [~] Accessibility, text size, mobile refinements — responsive UI and some ARIA support exist; no WCAG 2.2 AA audit, full keyboard pass, contrast/reduced-motion audit, or text-size control found. Evidence: `frontend/src/components`, `frontend/src/layout`, `frontend/src/pages`.
- [~] Privacy dashboard, export, session/device management — settings and account export exist; consolidated dashboard and device/session revocation are missing. Evidence: `frontend/src/pages/settings/SettingsPage.tsx`, `backend/src/controller/account.controller.js`, `backend/src/routes/user.route.js`.
- [ ] Onboarding checklist, achievements, badges, streaks, listening goals.
- [ ] Referral and invite links.

## Phase 10 — Platform and operations

- [~] Admin console — user/catalog/moderation dashboard and feature-flag controls exist; support requests and service-status UI remain missing. Evidence: `frontend/src/pages/admin/AdminPage.tsx`, `backend/src/routes/admin.route.js`.
- [~] Rate-limit/upload abuse monitoring and background-job dashboard — protections and cron jobs exist; metrics/dashboard/alerts are missing. Evidence: `backend/src/middleware/rateLimit.middleware.js`, `backend/src/index.js`, `backend/src/services/podcast.service.js`.
- [ ] Backup/restore runbook with tested restore.
- [~] A/B test hooks — stable percentage cohorts exist in the workspace flag helper; experiment assignment/result metrics and admin controls are missing. Evidence: `backend/src/lib/featureFlags.js`.
- [~] Car mode, smartwatch, cast, widgets — mobile shell and limited browser remote-play UI exist; these platform integrations remain partial/not verified. Evidence: `frontend/android`, `frontend/ios`, `frontend/src/layout/components/PlaybackControls.tsx`, README.


## Change log / verification notes

- Phase 0 verification on the current worktree: backend tests **85 passed**, frontend tests **86 passed**, frontend lint **0 errors / 6 warnings**, frontend TypeScript/build **passed**. There is no browser E2E suite yet; build/test output includes existing warnings.
- Manual deployed chat/voice-note verification was not run because hosting settings and test accounts are unavailable in this workspace. Follow `docs/PHASE0_CHANGELOG.md` for manual QA.
