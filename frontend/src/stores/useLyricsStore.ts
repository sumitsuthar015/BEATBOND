import { create } from "zustand";
import { toast } from "react-hot-toast";
import { fetchLyricsForSong, lyricsAsPlainText } from "@/lib/lyrics";
import type { Song } from "@/types";

interface LyricsStore {
    lyrics: string | null;
    isLoading: boolean;
    error: string | null;
    fetchLyrics: (song: Song) => Promise<void>;
}

export const useLyricsStore = create<LyricsStore>((set) => ({
    lyrics: null,
    isLoading: false,
    error: null,

    fetchLyrics: async (song: Song) => {
        set({ isLoading: true, error: null });
        try {
            const result = await fetchLyricsForSong(song);
            // The song details view shows the words only, without [mm:ss] timestamps.
            set({ lyrics: lyricsAsPlainText(result) });
        } catch (error: any) {
            console.error("Error fetching lyrics:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to fetch lyrics";
            set({ error: errorMessage, lyrics: null });
            toast.error(errorMessage);
        } finally {
            set({ isLoading: false });
        }
    },
}));
