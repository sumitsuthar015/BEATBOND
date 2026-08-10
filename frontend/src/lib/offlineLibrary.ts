import type { Song } from "@/types";
import type { Playlist } from "@/stores/usePlaylistStore";

const PREFIX = "beatbond-offline-library:";
type Shelf = "featured" | "made-for-you" | "trending";

const read = <T,>(key: string): T | null => {
  try {
    const value = localStorage.getItem(`${PREFIX}${key}`);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
};

const write = <T,>(key: string, value: T) => {
  try { localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value)); } catch { /* Storage can be unavailable/private. */ }
};

export const cachePlaylists = (playlists: Playlist[]) => write("playlists", playlists);
export const getCachedPlaylists = () => read<Playlist[]>("playlists");
export const cacheHomeShelf = (shelf: Shelf, songs: Song[]) => write(`home:${shelf}`, songs);
export const getCachedHomeShelf = (shelf: Shelf) => read<Song[]>(`home:${shelf}`);
