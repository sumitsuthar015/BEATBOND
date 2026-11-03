# Request tracing and operational logging

## User story

As an operator, I can correlate an HTTP request with its response and error report without logging private message, upload, token, or query data.

## Acceptance criteria

- Every HTTP response includes a server-generated `X-Request-Id` UUID.
- A completion log is one-line JSON with timestamp, event, request ID, method, Express route pattern, status, and duration.
- Error logs and Sentry API events include the request ID and bounded route/status metadata.
- Rate-limit rejections emit structured events without logging account IDs, IPs, request bodies, or secrets.
- Successful `OPTIONS` CORS preflights and `304 Not Modified` cache responses are omitted; failed preflights remain visible.
- Logging failures do not change request outcomes.

## Data/API/UI

- No database changes or API contract change beyond a response header.
- No UI changes. Existing global `{ message }` error responses remain.

## Edge cases, privacy, tests

- Request IDs are generated server-side rather than trusting a caller header.
- Route patterns are logged rather than raw paths so route parameters, query strings, and search terms are not exposed.
- Unit tests cover JSON-safe event formatting and middleware header/log metadata; integration verification checks success, 4xx/5xx, and rate-limited responses.
- No third-party call is added by tests.

