// Helpers for the direct-message screen.

export const REACTIONS = ["❤️", "😂", "😮", "😢", "🔥", "👍"] as const;

/** Matches the server: your own text can be edited for 15 minutes. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export type Reaction = { userId: string; emoji: string };

type ChatMessage = { _id: string; senderId: string; createdAt: string };

export type ChatItem<T extends ChatMessage> =
  | { type: "day"; key: string; label: string }
  | { type: "message"; key: string; message: T; startsGroup: boolean; endsGroup: boolean };

// Messages from the same person within a few minutes read as one group.
const GROUP_GAP_MS = 5 * 60 * 1000;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** "Today", "Yesterday", a weekday for the last week, then a date. */
export const dayLabel = (value: string | Date, now = new Date()) => {
  const date = new Date(value);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
};

export const clockTime = (value: string | Date) =>
  new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Splits a conversation (oldest first) into day separators and grouped messages. */
export const buildChatItems = <T extends ChatMessage>(messages: T[], now = new Date()): ChatItem<T>[] => {
  const items: ChatItem<T>[] = [];
  messages.forEach((message, index) => {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const day = startOfDay(new Date(message.createdAt));
    if (!previous || startOfDay(new Date(previous.createdAt)) !== day) {
      items.push({ type: "day", key: `day-${day}`, label: dayLabel(message.createdAt, now) });
    }
    const joins = (other: T | undefined) => Boolean(other)
      && other!.senderId === message.senderId
      && startOfDay(new Date(other!.createdAt)) === day
      && Math.abs(new Date(other!.createdAt).getTime() - new Date(message.createdAt).getTime()) <= GROUP_GAP_MS;
    items.push({ type: "message", key: message._id, message, startsGroup: !joins(previous), endsGroup: !joins(next) });
  });
  return items;
};

/** Reactions counted per emoji, marking the one you chose. */
export const summarizeReactions = (reactions: Reaction[] = [], myId?: string) => {
  const counts = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const { emoji, userId } of reactions) {
    const entry = counts.get(emoji) ?? { emoji, count: 0, mine: false };
    entry.count += 1;
    entry.mine ||= userId === myId;
    counts.set(emoji, entry);
  }
  return [...counts.values()];
};

/** The same toggle the server applies, for an instant update. */
export const toggleReaction = (reactions: Reaction[] = [], userId: string, emoji: string) => {
  const others = reactions.filter((reaction) => reaction.userId !== userId);
  const current = reactions.find((reaction) => reaction.userId === userId);
  return current?.emoji === emoji ? others : [...others, { userId, emoji }];
};

export const canEditMessage = (message: { senderId: string; createdAt: string; _id: string }, userId?: string, now = Date.now()) =>
  Boolean(userId) && message.senderId === userId && !message._id.startsWith("temp-") && now - new Date(message.createdAt).getTime() <= EDIT_WINDOW_MS;
