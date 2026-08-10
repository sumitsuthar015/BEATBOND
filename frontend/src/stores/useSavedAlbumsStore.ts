import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Album } from "@/types";
import toast from "react-hot-toast";

interface SavedAlbumsState {
  savedAlbums: Album[];
  saveAlbum: (album: Album) => void;
  removeSavedAlbum: (albumId: string) => void;
  toggleSaveAlbum: (album: Album) => void;
  isAlbumSaved: (albumId: string) => boolean;
}

export const useSavedAlbumsStore = create<SavedAlbumsState>()(
  persist(
    (set, get) => ({
      savedAlbums: [],
      saveAlbum: (album) => {
        if (!album || !album.id) return;
        const exists = get().savedAlbums.some((a) => a.id === album.id);
        if (exists) return;
        set((state) => ({ savedAlbums: [album, ...state.savedAlbums] }));
        toast.success(`Saved "${album.name || album.title || "Album"}" to Library`);
      },
      removeSavedAlbum: (albumId) => {
        const album = get().savedAlbums.find((a) => a.id === albumId);
        set((state) => ({
          savedAlbums: state.savedAlbums.filter((a) => a.id !== albumId),
        }));
        toast.success(`Removed "${album?.name || album?.title || "Album"}" from Library`);
      },
      toggleSaveAlbum: (album) => {
        if (!album || !album.id) return;
        if (get().isAlbumSaved(album.id)) {
          get().removeSavedAlbum(album.id);
        } else {
          get().saveAlbum(album);
        }
      },
      isAlbumSaved: (albumId) => {
        if (!albumId) return false;
        return get().savedAlbums.some((a) => a.id === albumId);
      },
    }),
    {
      name: "beatbond-saved-albums",
    }
  )
);
