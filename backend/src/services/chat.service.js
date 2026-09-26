// Rules for direct messages that the socket and the HTTP endpoints share.

/** Your own text can be corrected for a short while after sending it. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export const REACTIONS = ["❤️", "😂", "😮", "😢", "🔥", "👍"];

export const canEditMessage = (message, userId, now = Date.now()) =>
  Boolean(message) && message.senderId === userId && now - new Date(message.createdAt).getTime() <= EDIT_WINDOW_MS;

/** One reaction per person: a new emoji replaces theirs, the same one removes it. */
export const toggleReaction = (reactions = [], userId, emoji) => {
  const others = reactions.filter((reaction) => reaction.userId !== userId);
  const current = reactions.find((reaction) => reaction.userId === userId);
  return current?.emoji === emoji ? others : [...others, { userId, emoji }];
};

// Read receipts work both ways, like WhatsApp: someone who turned them off
// doesn't send them (their reads never mark messages "read") and doesn't see
// them on their own messages either.
export const statusForViewer = (message, viewer) =>
  message.status === "read" && message.senderId === viewer?.clerkId && viewer?.readReceipts === false ? "delivered" : message.status;

export const sendsReadReceipts = (user) => user?.readReceipts !== false;

// Online status and last seen also work both ways: hide yours and you don't
// see anyone else's.
export const canSeePresence = (owner, viewer) =>
  Boolean(owner && viewer) && (owner.clerkId === viewer.clerkId || (owner.showActivityStatus !== false && viewer.showActivityStatus !== false));
