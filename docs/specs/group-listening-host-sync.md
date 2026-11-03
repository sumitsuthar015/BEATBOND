# Group Listening: host player synchronization

## Goal
When a host is in a listening room, the host's normal BeatBond player controls the room. Track selection/skip, play/pause, and seek are reflected in the room; connected members hear the same stream at the shared server time. Members' independent player pauses while they listen in the room and resumes from its saved track/position when they leave.

## Acceptance criteria
- Host creates a room; its current playable song is published automatically.
- A host song change, play/pause, or seek updates room state, and joined clients synchronize.
- Joining mid-song starts at the projected room position. Existing clock correction remains active.
- Member's personal player is paused while in the room and restored on explicit leave or page teardown.
- Host remains the authority; existing authenticated host-only socket actions and rate limits remain enforced.
- The room UI has no manual upload or URL input; the host selects music through BeatBond's player.
- No database migration or third-party streaming integration is introduced.

## Implementation notes
The existing room audio elements already consume a host-authored URL and server-anchored playback state. The frontend bridges the global Zustand player to those existing host events while the room page is mounted. Stream URLs are copied from the host's current `Song`; room state does not persist beyond the existing in-memory/optional Redis room lifetime.

## Verification
Run focused frontend and backend tests, frontend lint/typecheck/build where available, and review room join/leave, reconnect, host/member, and song transition flows. Tests must use mocked sockets/audio and no live streaming calls.
