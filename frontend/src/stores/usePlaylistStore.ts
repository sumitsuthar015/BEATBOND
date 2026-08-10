import { create } from "zustand";
import { Song } from "@/types";
import { axiosInstance } from "@/lib/axios";
import { toast } from "react-hot-toast";
import { cachePlaylists, getCachedPlaylists } from "@/lib/offlineLibrary";

export interface Playlist {
  id: string;
  name: string;
  description: string;
  songs: Song[];
  ownerId: string;
  downloadedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
interface PlaylistStore {
  playlists: Playlist[];
  isLoading: boolean;
  error: string | null;
  fetchPlaylists: () => Promise<void>;
  fetchPlaylistById: (playlistId: string) => Promise<Playlist | null>;
  createPlaylist: (
    name: string,
    description?: string,
    song?: Song,
  ) => Promise<Playlist | null>;
  updatePlaylist: (
    playlistId: string,
    updates: Pick<Playlist, "name" | "description">,
  ) => Promise<void>;
  addSongToPlaylist: (playlistId: string, song: Song) => Promise<void>;
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  setPlaylistDownloaded: (playlistId: string, downloaded: boolean) => Promise<void>;
}
const replace = (playlist: Playlist) => (state: PlaylistStore) => ({
  playlists: state.playlists.map((item) =>
    item.id === playlist.id ? playlist : item,
  ),
});
export const usePlaylistStore = create<PlaylistStore>((set) => ({
  playlists: [],
  isLoading: false,
  error: null,
  fetchPlaylists: async () => {
    set({ isLoading: true, error: null });
    try {
      const playlists = (await axiosInstance.get("/playlists")).data;
      cachePlaylists(playlists);
      set({ playlists });
    } catch (error: any) {
      const cached = getCachedPlaylists();
      if (cached) {
        set({ playlists: cached, error: null });
        return;
      }
      set({
        error: error.response?.data?.message || "Could not load playlists",
      });
    } finally {
      set({ isLoading: false });
    }
  },
  fetchPlaylistById: async (playlistId: string) => {
    try {
      const { data } = await axiosInstance.get(`/playlists/${playlistId}`);
      if (data && data.id) {
        set((state) => {
          const exists = state.playlists.some((p) => p.id === data.id);
          const playlists = exists
            ? state.playlists.map((p) => (p.id === data.id ? data : p))
            : [data, ...state.playlists];
          cachePlaylists(playlists);
          return { playlists };
        });
        return data;
      }
      return null;
    } catch {
      return null;
    }
  },
  createPlaylist: async (name, description = "", song) => {
    try {
      const { data } = await axiosInstance.post("/playlists", {
        name,
        description,
      });
      set((state) => {
        const playlists = [data, ...state.playlists];
        cachePlaylists(playlists);
        return { playlists };
      });
      if (song) {
        await axiosInstance.post(`/playlists/${data.id}/songs`, { song });
        await usePlaylistStore.getState().fetchPlaylists();
      }
      toast.success("Playlist created");
      return data;
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not create playlist");
      return null;
    }
  },
  updatePlaylist: async (playlistId, updates) => {
    try {
      const { data } = await axiosInstance.put(
        `/playlists/${playlistId}`,
        updates,
      );
      set((state) => {
        const next = replace(data)(state);
        cachePlaylists(next.playlists);
        return next;
      });
      toast.success("Playlist updated");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not update playlist");
    }
  },
  addSongToPlaylist: async (playlistId, song) => {
    try {
      const { data } = await axiosInstance.post(
        `/playlists/${playlistId}/songs`,
        { song },
      );
      set((state) => {
        const next = replace(data)(state);
        cachePlaylists(next.playlists);
        return next;
      });
      toast.success("Song added to playlist");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not add song");
    }
  },
  removeSongFromPlaylist: async (playlistId, songId) => {
    try {
      const { data } = await axiosInstance.delete(
        `/playlists/${playlistId}/songs/${songId}`,
      );
      set((state) => {
        const next = replace(data)(state);
        cachePlaylists(next.playlists);
        return next;
      });
      toast.success("Song removed");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not remove song");
    }
  },
  deletePlaylist: async (playlistId) => {
    try {
      await axiosInstance.delete(`/playlists/${playlistId}`);
      set((state) => {
        const playlists = state.playlists.filter((item) => item.id !== playlistId);
        cachePlaylists(playlists);
        return { playlists };
      });
      toast.success("Playlist deleted");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not delete playlist");
    }
  },
  setPlaylistDownloaded: async (playlistId, downloaded) => {
    try {
      const { data } = await axiosInstance.put(`/playlists/${playlistId}/download`, { downloaded });
      set((state) => {
        const next = replace(data)(state);
        cachePlaylists(next.playlists);
        return next;
      });
      toast.success(downloaded ? "Playlist added to downloads" : "Playlist removed from downloads");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not update download");
    }
  },
}));
