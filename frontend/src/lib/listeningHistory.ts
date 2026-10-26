import { Song } from "@/types";

export type ListeningEvent = Song & { playedAt: string };

const keyFor = (userId: string) => `beatbond:listening-history:${userId}`;
type HistoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const normalizeTrackPart = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const primaryArtist = (artist: string) => artist.split(/,|&|\bfeat\.?\b|\bft\.?\b|\bwith\b| x /i)[0];

export const getUniqueRecentTracks = (events: ListeningEvent[], limit = 6) => {
  const newestFirst = [...events].sort((a, b) => {
    const aTime = Date.parse(a.playedAt || "") || 0;
    const bTime = Date.parse(b.playedAt || "") || 0;
    return bTime - aTime;
  });
  const seenIds = new Set<string>();
  const seenTracks = new Set<string>();
  const unique: ListeningEvent[] = [];
  for (const event of newestFirst) {
    const id = String(event._id || "");
    const track = `${normalizeTrackPart(event.title || "")}|${normalizeTrackPart(primaryArtist(event.artist || ""))}`;
    if ((id && seenIds.has(id)) || (track !== "|" && seenTracks.has(track))) continue;
    if (id) seenIds.add(id);
    if (track !== "|") seenTracks.add(track);
    unique.push(event);
    if (unique.length >= limit) break;
  }
  return unique;
};

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

/** Forgets this device's copy of the history (the server copy is cleared separately). */
export const clearLocalListeningHistory = (userId: string) => {
  localStorage.removeItem(keyFor(userId));
  window.dispatchEvent(new CustomEvent("beatbond:history-updated", { detail: userId }));
};

/** Removes one played item from this device's history, preserving other plays of the same song. */
export const removeListeningEventsForSong = (
  userId: string,
  songId: string,
  storage: HistoryStorage = localStorage,
): ListeningEvent[] => {
  let history: ListeningEvent[];
  try {
    history = JSON.parse(storage.getItem(keyFor(userId)) || "[]");
    if (!Array.isArray(history)) history = [];
  } catch {
    history = [];
  }

  const next = history.filter((event) => event._id !== songId);
  if (next.length === history.length) return history;

  try {
    storage.setItem(keyFor(userId), JSON.stringify(next));
  } catch {
    return history;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("beatbond:history-updated", { detail: userId }));
  }
  return next;
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
