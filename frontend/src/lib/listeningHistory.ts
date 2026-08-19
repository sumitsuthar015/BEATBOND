import { Song } from "@/types";

export type ListeningEvent = Song & { playedAt: string };

const keyFor = (userId: string) => `beatbond:listening-history:${userId}`;

export const setActiveListener = (userId: string | null) => {
  if (userId) localStorage.setItem("beatbond:active-listener", userId);
  else localStorage.removeItem("beatbond:active-listener");
};

export const readListeningHistory = (userId: string): ListeningEvent[] => {
  try {
    return JSON.parse(localStorage.getItem(keyFor(userId)) || "[]");
  } catch {
    return [];
  }
};

export const recordListeningEvent = (song: Song) => {
  const userId = localStorage.getItem("beatbond:active-listener");
  if (!userId || !song?._id) return;
  const history = readListeningHistory(userId);
  const event = { ...song, playedAt: new Date().toISOString(), userId };
  // Keep a generous, per-user history locally. It is never cleared by
  // navigation or refresh; a user can only clear it explicitly in storage.
  localStorage.setItem(keyFor(userId), JSON.stringify([...history, event].slice(-1000)));
  window.dispatchEvent(new CustomEvent("beatbond:history-updated", { detail: userId }));
  // Server persistence happens after a meaningful playback outcome, not on
  // an accidental click. See `recordPlaybackOutcome`.
};
