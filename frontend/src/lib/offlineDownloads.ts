import type { Song } from "@/types";

const CACHE_NAME = "beatbond-offline-downloads-v1";
const STORAGE_KEY = "beatbond-offline-downloads";
export type OfflineSong = Song & { downloadedAt: string };

const read = (): OfflineSong[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
};
const write = (songs: OfflineSong[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
  window.dispatchEvent(new Event("beatbond-downloads-changed"));
};

export const getDownloadedSongs = () => read();

export const downloadSongForOffline = async (song: Song) => {
  if (!song.audioUrl) throw new Error("This song has no downloadable audio source.");
  const cache = await caches.open(CACHE_NAME);
  const audio = await fetch(song.audioUrl);
  if (!audio.ok) throw new Error("The audio source could not be saved for offline playback.");
  await cache.put(song.audioUrl, audio.clone());
  if (song.imageUrl) {
    try {
      const image = await fetch(song.imageUrl);
      if (image.ok) await cache.put(song.imageUrl, image.clone());
    } catch { /* Album art is optional for offline playback. */ }
  }
  const songs = read().filter((item) => item._id !== song._id);
  write([{ ...song, downloadedAt: new Date().toISOString() }, ...songs]);
};

export const removeDownloadedSong = async (song: Song) => {
  const cache = await caches.open(CACHE_NAME);
  await cache.delete(song.audioUrl);
  if (song.imageUrl) await cache.delete(song.imageUrl);
  write(read().filter((item) => item._id !== song._id));
};

export const cachedAudioUrl = async (audioUrl: string) => {
  const response = await caches.match(audioUrl);
  if (!response) return null;
  return URL.createObjectURL(await response.blob());
};
