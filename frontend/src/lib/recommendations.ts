import { Song } from "@/types";
import { readListeningHistory } from "@/lib/listeningHistory";
import { isVerifiedValidSong } from "@/lib/songUtils";
import { axiosInstance } from "@/lib/axios";

const normalise = (value?: string) => String(value || "").trim().toLowerCase();
const artistTokens = (song: Song) => normalise(song.artist).split(/,|&| feat\.? | ft\.? /i).map((item) => item.trim()).filter(Boolean);
const key = (song: Song) => `${normalise(song.title)}|${normalise(song.artist)}`;

type PlaybackSignal = { songId: string; listenedSeconds: number; duration: number; completed: boolean; skipped: boolean; at: string };
const signalKey = (userId: string) => `beatbond:playback-signals:${userId}`;

export const recordPlaybackOutcome = (song: Song, listenedSeconds: number, duration: number) => {
  const userId = localStorage.getItem("beatbond:active-listener");
  if (!userId || !song?._id) return;
  const ratio = duration > 0 ? listenedSeconds / duration : 0;
  const signal: PlaybackSignal = { songId: song._id, listenedSeconds, duration, completed: ratio >= 0.8, skipped: listenedSeconds > 0 && ratio < 0.2, at: new Date().toISOString() };
  try {
    const existing: PlaybackSignal[] = JSON.parse(localStorage.getItem(signalKey(userId)) || "[]");
    localStorage.setItem(signalKey(userId), JSON.stringify([...existing, signal].slice(-500)));
  } catch { /* local recommendations still work from listening history */ }
  // Persist only meaningful playback events; the backend derives the user
  // identity from Clerk rather than trusting any client-provided user id.
  if (listenedSeconds >= 10 || signal.completed || signal.skipped) {
    void axiosInstance.post("/users/listening-history", {
      ...song,
      durationPlayed: Math.round(listenedSeconds),
      completionPercentage: duration > 0 ? Math.round(ratio * 100) : 0,
      completed: signal.completed,
      skipped: signal.skipped,
      skipPosition: Math.round(listenedSeconds),
      source: "autoplay",
    }).catch(() => undefined);
  }
};

const getSignals = (userId: string): PlaybackSignal[] => {
  try { return JSON.parse(localStorage.getItem(signalKey(userId)) || "[]"); } catch { return []; }
};

/** Fetches provider-backed recommendations through BeatBond's backend, never
 * exposing external-provider details to the player UI. */
export const fetchRecommendations = async (song: Song, limit = 10): Promise<Song[]> => {
  const { data } = await axiosInstance.get(`/music/recommendations/${encodeURIComponent(song._id)}`, {
    params: {
      limit,
      title: song.title,
      artist: song.artist,
      language: song.language || song.genre,
      album: song.albumName || "",
      albumId: song.albumId || "",
    },
  });
  const { mapSaavnSong } = await import("@/lib/saavn");
  return (data?.data?.recommendations || [])
    .map((item: { song?: unknown }) => mapSaavnSong(item.song))
    .filter((item: Song | null): item is Song => Boolean(item));
};

/** Scores provider candidates using the active track and the listener's real behaviour. */
export const rankRecommendations = (current: Song, candidates: Song[], queued: Song[]): Song[] => {
  const userId = localStorage.getItem("beatbond:active-listener");
  const history = userId ? readListeningHistory(userId) : [];
  const signals = userId ? getSignals(userId) : [];
  // IDs can differ across catalogue/API responses for the same release, so
  // block both the provider ID and normalized title + artist identity.
  // Keep the whole retained listening history out of auto-play suggestions.
  const excluded = new Set([...queued, ...history].map((song) => song._id));
  const recentKeys = new Set([...queued, ...history].map(key));
  const currentArtists = new Set(artistTokens(current));
  const currentLanguage = normalise(current.language || current.genre);
  const preferredArtists = new Map<string, number>();
  history.slice(-100).forEach((song, index) => artistTokens(song).forEach((artist) => preferredArtists.set(artist, (preferredArtists.get(artist) || 0) + (100 - index) / 100)));
  const positiveIds = new Set(signals.filter((signal) => signal.completed).map((signal) => signal.songId));
  const skippedIds = new Set(signals.filter((signal) => signal.skipped).map((signal) => signal.songId));

  return [...new Map(candidates.filter(isVerifiedValidSong).map((song) => [song._id, song])).values()]
    .filter((song) => !excluded.has(song._id) && !recentKeys.has(key(song)))
    .map((song) => {
      const artists = artistTokens(song);
      let score = 0;
      if (artists.some((artist) => currentArtists.has(artist))) score += 100;
      if (current.albumId && song.albumId === current.albumId) score += 35;
      if (currentLanguage && normalise(song.language || song.genre) === currentLanguage) score += 45;
      score += artists.reduce((total, artist) => total + (preferredArtists.get(artist) || 0) * 10, 0);
      if (positiveIds.has(song._id)) score += 30;
      if (skippedIds.has(song._id)) score -= 200;
      return { song, score };
    })
    .sort((left, right) => right.score - left.score || left.song.title.localeCompare(right.song.title))
    .map(({ song }) => song);
};
