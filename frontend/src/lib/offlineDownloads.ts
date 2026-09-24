import type { Song } from "@/types";
import { removeSavedLyrics, saveLyricsForOffline } from "@/lib/lyrics";

const CACHE_NAME = "beatbond-offline-downloads-v1";
// The service worker serves <img> requests from this cache (vite.config.ts),
// so covers saved here still show when the device is offline.
const IMAGE_CACHE_NAME = "beatbond-images";
const STORAGE_KEY = "beatbond-offline-downloads";
export type OfflineSong = Song & { downloadedAt: string };

const read = (): OfflineSong[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
};
const write = (songs: OfflineSong[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
  window.dispatchEvent(new Event("beatbond-downloads-changed"));
};

// Saved files are keyed by song id, not by their CDN link: stream links can
// change between sessions, but a download must keep playing forever.
const audioKey = (songId: string) => `${location.origin}/offline/audio/${encodeURIComponent(songId)}`;

export const getDownloadedSongs = () => read();

export const isDownloaded = (songId: string | undefined) =>
  Boolean(songId) && read().some((song) => song._id === songId);

const isAudio = (response: Response) => {
  const type = response.headers.get("content-type") || "";
  return response.ok && (type.startsWith("audio/") || type.startsWith("video/") || type === "application/octet-stream" || !type);
};

export const downloadSongForOffline = async (song: Song) => {
  const sources = [song.audioUrl, ...(song.audioFallbackUrls || [])].filter(Boolean);
  if (!sources.length) throw new Error("This song has no downloadable audio source.");

  // Some songs have no 320kbps file, so fall back to the lower qualities the
  // player also uses. The whole file is fetched (no Range) so it plays offline.
  let audio: Response | null = null;
  for (const url of sources) {
    try {
      const response = await fetch(url);
      if (isAudio(response)) { audio = response; break; }
    } catch { /* Try the next quality. */ }
  }
  if (!audio) throw new Error("The audio source could not be saved for offline playback.");

  const cache = await caches.open(CACHE_NAME);
  await cache.put(audioKey(song._id), audio);
  if (song.imageUrl) {
    try {
      const image = await fetch(song.imageUrl);
      if (image.ok) await (await caches.open(IMAGE_CACHE_NAME)).put(song.imageUrl, image);
    } catch { /* Album art is optional for offline playback. */ }
  }
  // Ask the browser not to clear downloads when the device is low on space.
  void navigator.storage?.persist?.().catch(() => undefined);

  const songs = read().filter((item) => item._id !== song._id);
  write([{ ...song, downloadedAt: new Date().toISOString() }, ...songs]);
  // Lyrics are small; keep them too so the lyrics panel works offline.
  void saveLyricsForOffline(song);
};

export const removeDownloadedSong = async (song: Song) => {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all([
    cache.delete(audioKey(song._id)),
    // Downloads made before files were keyed by song id.
    cache.delete(song.audioUrl),
    song.imageUrl ? cache.delete(song.imageUrl) : Promise.resolve(false),
  ]);
  removeSavedLyrics(song._id);
  write(read().filter((item) => item._id !== song._id));
};

const cachedResponse = async (songId: string, legacyUrl?: string) => {
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(audioKey(songId))) || (legacyUrl ? await cache.match(legacyUrl) : undefined);
};

/**
 * A playable `blob:` URL for a downloaded song, or null if it isn't saved.
 * The caller owns the URL and must revoke it with URL.revokeObjectURL.
 */
export const getOfflineAudioUrl = async (song: Pick<Song, "_id" | "audioUrl">): Promise<string | null> => {
  if (!isDownloaded(song._id) || typeof caches === "undefined") return null;
  try {
    const response = await cachedResponse(song._id, song.audioUrl);
    return response ? URL.createObjectURL(await response.blob()) : null;
  } catch {
    return null;
  }
};
