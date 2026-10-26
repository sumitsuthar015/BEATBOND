import type { Song } from "@/types";
import { getUniqueRecentTracks, type ListeningEvent } from "@/lib/listeningHistory";

const SEARCH_RECENT_SONGS_KEY = "beatbond:search-recent-songs:v1";
const SEARCH_RECENTS_UPDATED = "beatbond:search-recents-updated";

export const readSearchRecentSongs = (limit = 6): ListeningEvent[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(SEARCH_RECENT_SONGS_KEY) || "[]");
    return Array.isArray(saved) ? getUniqueRecentTracks(saved, limit) : [];
  } catch {
    return [];
  }
};

export const recordSearchRecentSong = (song: Song) => {
  if (!song?._id) return;
  const history = readSearchRecentSongs(100);
  const event: ListeningEvent = { ...song, playedAt: new Date().toISOString() };
  const next = getUniqueRecentTracks([event, ...history], 100);
  try {
    localStorage.setItem(SEARCH_RECENT_SONGS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(SEARCH_RECENTS_UPDATED));
  } catch {
    // Search recents are optional when browser storage is unavailable.
  }
};

export const removeSearchRecentSong = (songId: string) => {
  const next = readSearchRecentSongs(100).filter((song) => song._id !== songId);
  try {
    localStorage.setItem(SEARCH_RECENT_SONGS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(SEARCH_RECENTS_UPDATED));
  } catch {
    // Keep the current view usable even if storage is unavailable.
  }
  return next.slice(0, 6);
};

export const clearSearchRecentSongs = () => {
  try {
    localStorage.removeItem(SEARCH_RECENT_SONGS_KEY);
    window.dispatchEvent(new Event(SEARCH_RECENTS_UPDATED));
  } catch {
    // Search recents are optional when browser storage is unavailable.
  }
};
