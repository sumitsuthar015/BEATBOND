# BeatBond Repo Map

## Stack and layout

- **Frontend:** React 18, TypeScript, Vite, React Router, TanStack Query, Zustand, Tailwind, Vitest, and ESLint (`frontend/src`).
- **Backend:** Node.js ES modules, Express, Mongoose/MongoDB, Clerk, `ws`, Socket.IO, Redis, and Node's test runner (`backend/src`).
- **Persistence:** Mongoose schemas live in `backend/src/models`; HTTP handlers are in `backend/src/controller`; route composition and middleware are in `backend/src/routes` and `backend/src/middleware`.
- **Deployment/configuration:** backend settings are read from platform environment variables in production and `backend/.env` locally. Vite `VITE_*` values are compiled into the browser bundle. Examples are in `backend/.env.example` and `frontend/.env.example`.

## Main request flows

- **Authentication:** Clerk creates the browser session. `AuthProvider` supplies fresh Clerk tokens to the shared Axios and socket clients. Backend `clerkMiddleware` verifies requests, and `protectRoute` verifies the user and ensures an account exists after legal consent.
- **Playback:** frontend player and music state are managed by `usePlayerStore`, `useMusicStore`, and `AudioPlayer`. Catalog/search endpoints live in the backend song, music, and Saavn routes. The player supports fallback stream sources.
- **Direct chat:** message history and actions use authenticated HTTP routes; delivery, typing, and presence use the authenticated custom WebSocket at `/ws` (`backend/src/lib/realtime.js`, `frontend/src/lib/realtimeSocket.ts`).
- **Group chat/listening:** group-chat history and membership use MongoDB-backed routes/models; realtime room events use Socket.IO. Optional Redis adapters share group rooms and realtime presence/events across instances.
- **Uploads:** profile and other media use backend upload controllers. Voice notes are recorded in the browser and posted to `/api/messages/audio`; the backend validates duration/size/type and uploads to Cloudinary before saving the message.
- **Health/monitoring:** `/health` reports MongoDB status. Sentry is optional via `SENTRY_DSN` and `VITE_SENTRY_DSN`; the backend error handler and frontend React error boundary are already connected.

## README implementation status

The README marks group listening, collaborative playlists, Blend, group chats, voice notes, stories, nearby trends, Wrapped, notifications, podcasts, reporting/moderation, deletion/export, and several other enhancements as implemented. Crossfade, equalizer, native mobile, artist self-service, full multilingual coverage, and several provider-dependent items remain partial or future work. See the README enhancement table for the complete status list.

## Deployment-sensitive settings

- `CLIENT_URL`, `FRONTEND_URL`, and `ALLOWED_ORIGINS` define browser origins accepted by API CORS and realtime handshakes.
- `VITE_API_URL` and `VITE_SOCKET_URL` select separately hosted backend endpoints; leave them unset when the frontend and API share an origin.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are required for voice-note uploads.
- MongoDB is required for the API. Redis is optional for single-instance operation and needed for shared realtime state across instances. JioSaavn is the primary external music catalog; the optional Saavn relay is controlled by `SAAVN_API_BASE` and `SAAVN_RELAY_KEY`.

