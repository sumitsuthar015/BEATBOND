// Who may see someone's listening. Every endpoint and socket event that sends
// one person's music activity to another goes through these checks.
//
// Two separate choices, each Everyone / Friends / Only me:
// - musicPrivacy: the song they're playing right now.
// - historyPrivacy: their top artists and recently played songs. Older
//   history was never shown to anyone, so this starts as Only me.
// On top of both, musicHiddenFrom lists people who never see either, and
// someone the owner blocked never sees anything.

export const LISTENING_LEVELS = ["everyone", "friends", "none"];
export const DEFAULT_MUSIC_PRIVACY = "friends";
export const DEFAULT_HISTORY_PRIVACY = "none";

const allowed = (owner, viewerId, level) => {
  if (!owner || !viewerId) return false;
  if (owner.clerkId === viewerId) return true;
  if (owner.blockedUsers?.includes(viewerId) || owner.musicHiddenFrom?.includes(viewerId)) return false;
  if (level === "everyone") return true;
  return level === "friends" && Boolean(owner.friends?.includes(viewerId));
};

export const canSeeLiveActivity = (owner, viewerId) => allowed(owner, viewerId, owner?.musicPrivacy ?? DEFAULT_MUSIC_PRIVACY);

export const canSeeListeningHistory = (owner, viewerId) => allowed(owner, viewerId, owner?.historyPrivacy ?? DEFAULT_HISTORY_PRIVACY);

/** The connected people who should receive the owner's live activity. */
export const liveActivityViewers = (owner, connectedUserIds) =>
  [...connectedUserIds].filter((viewerId) => viewerId !== owner.clerkId && canSeeLiveActivity(owner, viewerId));

/** The fields these checks need; select them whenever a check is made. */
export const PRIVACY_FIELDS = "clerkId friends blockedUsers musicPrivacy historyPrivacy musicHiddenFrom";
