# Admin-managed feature flags

## User story

As the verified BeatBond administrator, I can view and turn a named feature flag on or off. The server evaluates flags for signed-in users, supports deterministic percentage rollout from environment configuration, and keeps production flags off unless explicitly enabled.

## Acceptance criteria

- Admins can list configured/database-backed flags and see whether their state comes from environment rollout or an admin override.
- Admins can turn a valid flag on/off; the change persists in MongoDB and is effective on the next feature-flags request.
- Admins can clear an override to restore the environment-defined rollout percentage.
- Non-admins cannot read or change the admin flag list. Unauthenticated requests fail.
- User-facing `GET /api/features` remains authenticated and returns booleans only, with private no-store caching.
- No flag is enabled by default when neither rollout config nor admin override enables it.
- The UI includes loading, empty, error/retry, and mutation states and works with keyboard controls and narrow screens.

## Data model and reversibility

- Add a `FeatureFlag` collection with unique `name`, `enabled`, and `updatedBy` fields plus timestamps.
- This is additive; no existing records are rewritten. Rollback is to remove the route/UI/model and optionally drop only the new collection after explicit operator choice. Runtime rollback does not delete data.

## API contract

- `GET /api/admin/feature-flags` — `protectRoute` + `requireAdmin`; returns `{ flags: [{ name, enabled, rolloutPercent, source, updatedAt }] }`.
- `PATCH /api/admin/feature-flags/:name` — `protectRoute` + `requireAdmin` + per-admin rate limit; accepts only `{ enabled: boolean }`; returns the updated flag or a `{ message }` error.
- `DELETE /api/admin/feature-flags/:name` — `protectRoute` + `requireAdmin` + per-admin rate limit; deletes the admin override and restores environment rollout behavior.
- Existing `GET /api/features` evaluates config and persisted overrides for the caller; it never accepts a user ID from the client.

## UI states and accessibility

- Add a Feature Flags tab to the existing admin tabs.
- Show skeleton/loading, empty state, error with retry, and disabled-while-saving state.
- Use the existing Radix switch/button primitives, visible focus styles, accessible labels, and responsive layout.
- Keep all displayed copy in English/Hindi dictionaries.

## Edge cases and privacy

- Validate names against a bounded lowercase identifier pattern; reject other request fields and non-boolean values.
- Repeated writes are idempotent upserts. Authenticated admins only; never trust a client-supplied updater identity.
- Only expose flag names and rollout values to the admin view. User endpoint exposes only boolean values for that caller.
- A disabled or missing MongoDB connection returns the standard service error and does not silently claim an admin toggle succeeded.

## Test plan

- Unit-test default-off, environment rollout, deterministic cohort, and database override resolution.
- Test route auth/admin/validation and error behavior with existing Node test mocks.
- Run backend/frontend unit tests, frontend lint, and frontend build/type-check.
- Manual QA: admin can toggle a flag, reload and see persisted state, then a test user receives the expected boolean; a non-admin is denied.

