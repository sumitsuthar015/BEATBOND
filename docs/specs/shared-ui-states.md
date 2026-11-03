# Shared loading, empty, and error panel

## User story

As a user on a data-driven screen, I get a clear and accessible status when content is loading, unavailable, or empty, with an optional retry/action.

## Acceptance criteria

- One shared React primitive supports `loading`, `empty`, and `error` variants.
- It uses existing Tailwind, icon, and Button conventions; it adds no dependency.
- State title/description/action copy is passed in by the caller so applications can localize it.
- Loading uses a polite status/live region; errors use an alert role; focus remains visible for actions.
- Layout remains usable on narrow screens and long localized text.

## Data/API/privacy

- No database or API changes. It renders only caller-supplied text and does not expose raw server details itself.

## Tests and QA

- Server-render each variant and assert its role, title, and optional action.
- Run frontend tests, lint, and TypeScript/build.
- Manual QA at mobile width with keyboard-only focus and English/Hindi copy.

