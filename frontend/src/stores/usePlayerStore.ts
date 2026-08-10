import { create } from "zustand";
import { Song } from "@/types";
import { useChatStore } from "./useChatStore";
import { recordListeningEvent } from "@/lib/listeningHistory";
import { isVerifiedValidSong } from "@/lib/songUtils";
import { useMusicStore } from "./useMusicStore";
import toast from "react-hot-toast";

export type RepeatMode = "off" | "one" | "all";

interface PlayerStore {
  currentSong: Song | null;
  isPlaying: boolean;
  queue: Song[];
  playedSongs: Song[];
  currentIndex: number;
  progress: number;
  duration: number;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  playNonce: number;

  initializeQueue: (songs: Song[]) => void;
  initializeDefaultSong: (songs: Song[]) => void;
  playAlbum: (songs: Song[], startIndex?: number) => void;
  setCurrentSong: (song: Song | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  togglePlay: () => void;
  playNext: () => Promise<void>;
  playPrevious: () => void;
  handleTrackEnded: () => Promise<void>;
  autoQueueRelatedOrTrending: () => Promise<boolean>;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setProgress: (time: number) => void;
  setDuration: (time: number) => void;
  setCurrentSongLiked: (isLiked: boolean) => void;
  setQueue: (songs: Song[]) => void;
  removeFromQueue: (index: number) => void;
  playFromQueue: (index: number) => void;
  addToQueue: (song: Song) => void;
  addPlayNext: (song: Song) => void;
}

const reportActivity = (activity: string) =>
  useChatStore.getState().updateCurrentActivity(activity);

const announce = (song: Song) => {
  reportActivity(`Playing ${song.title} by ${song.artist}`);
  recordListeningEvent(song);
};

const selectNext = (
  state: Pick<PlayerStore, "queue" | "currentIndex" | "isShuffle" | "repeatMode">
): number | null => {
  const { queue, currentIndex, isShuffle, repeatMode } = state;
  if (!queue.length) return null;
  if (isShuffle && queue.length > 1) {
    const candidates = queue
      .map((_, index) => index)
      .filter((index) => index !== currentIndex);
    return candidates.length
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : null;
  }
  if (currentIndex + 1 < queue.length) return currentIndex + 1;
  return repeatMode === "all" ? 0 : null;
};

export const usePlayerStore = create<PlayerStore>((set, get) => {
  const moveTo = (index: number) => {
    const song = get().queue[index];
    if (!song || !isVerifiedValidSong(song)) return;
    announce(song);
    set((state) => ({
      currentSong: song,
      currentIndex: index,
      isPlaying: true,
      progress: 0,
      playNonce: state.playNonce + 1,
      duration: song.duration || 0,
      playedSongs: [
        ...state.playedSongs,
        { ...song, playedAt: new Date().toISOString() },
      ],
    }));
  };

  return {
    currentSong: null,
    isPlaying: false,
    queue: [],
    playedSongs: [],
    currentIndex: -1,
    progress: 0,
    duration: 0,
    isShuffle: false,
    repeatMode: "off",
    playNonce: 0,

    initializeQueue: (songs) => {
      const validSongs = (songs || []).filter(isVerifiedValidSong);
      if (!validSongs.length) return;
      const active = get().currentSong;
      const activeIndex = active
        ? validSongs.findIndex((song) => song._id === active._id)
        : -1;

      if (activeIndex !== -1) {
        set({
          queue: validSongs,
          currentIndex: activeIndex,
        });
      } else {
        set({
          queue: validSongs,
          currentSong: validSongs[0],
          currentIndex: 0,
          progress: 0,
          playNonce: get().playNonce + 1,
          duration: validSongs[0].duration || 0,
        });
      }
    },

    initializeDefaultSong: (songs) => {
      const validSongs = (songs || []).filter(isVerifiedValidSong);
      if (!validSongs.length || get().currentSong) return;
      set({
        queue: validSongs,
        currentSong: validSongs[0],
        currentIndex: 0,
        isPlaying: false,
        progress: 0,
        duration: validSongs[0].duration || 0,
      });
    },

    playAlbum: (songs, startIndex = 0) => {
      const validSongs = (songs || []).filter(isVerifiedValidSong);
      if (!validSongs.length) return;
      const safeIndex = Math.max(0, Math.min(startIndex, validSongs.length - 1));
      const song = validSongs[safeIndex];

      announce(song);
      set((state) => ({
        queue: validSongs,
        currentSong: song,
        currentIndex: safeIndex,
        isPlaying: true,
        progress: 0,
        playNonce: state.playNonce + 1,
        duration: song.duration || 0,
        playedSongs: [
          ...state.playedSongs,
          { ...song, playedAt: new Date().toISOString() },
        ],
      }));
    },

    setCurrentSong: (song) => {
      if (!song) {
        set({
          currentSong: null,
          isPlaying: false,
          currentIndex: -1,
          progress: 0,
          duration: 0,
        });
        return;
      }

      const queue = get().queue;
      const index = queue.findIndex((s) => s._id === song._id);
      announce(song);

      if (index !== -1) {
        set((state) => ({
          currentSong: song,
          currentIndex: index,
          isPlaying: true,
          progress: 0,
          playNonce: state.playNonce + 1,
          duration: song.duration || 0,
        }));
      } else {
        const newQueue = [song, ...queue];
        set((state) => ({
          queue: newQueue,
          currentSong: song,
          currentIndex: 0,
          isPlaying: true,
          progress: 0,
          playNonce: state.playNonce + 1,
          duration: song.duration || 0,
        }));
      }
    },

    setIsPlaying: (isPlaying) => set({ isPlaying }),

    togglePlay: () => {
      const { currentSong, queue } = get();
      if (!currentSong && queue.length) {
        moveTo(0);
        return;
      }
      set((state) => ({ isPlaying: !state.isPlaying }));
    },

    playNext: async () => {
      const state = get();
      let nextIndex = selectNext(state);

      if (nextIndex === null) {
        const added = await get().autoQueueRelatedOrTrending();
        if (added) {
          nextIndex = selectNext(get());
        }
      }

      if (nextIndex !== null) {
        moveTo(nextIndex);
      } else {
        set({ isPlaying: false });
      }
    },

    playPrevious: () => {
      const { queue, currentIndex, isShuffle } = get();
      if (!queue.length) return;

      if (isShuffle && queue.length > 1) {
        const randomIndex = Math.floor(Math.random() * queue.length);
        moveTo(randomIndex);
        return;
      }

      const prevIndex = currentIndex - 1;
      if (prevIndex >= 0) {
        moveTo(prevIndex);
      } else {
        moveTo(queue.length - 1);
      }
    },

    handleTrackEnded: async () => {
      const { repeatMode } = get();
      if (repeatMode === "one") {
        const audio = document.getElementById("global-audio-player") as HTMLAudioElement | null;
        if (audio) audio.currentTime = 0;
        set((state) => ({ progress: 0, playNonce: state.playNonce + 1, isPlaying: true }));
        return;
      }

      let nextIndex = selectNext(get());
      if (nextIndex === null) {
        const added = await get().autoQueueRelatedOrTrending();
        if (added) {
          nextIndex = selectNext(get());
        }
      }

      if (nextIndex !== null) {
        moveTo(nextIndex);
      } else {
        set({ isPlaying: false, progress: 0 });
      }
    },

    autoQueueRelatedOrTrending: async (): Promise<boolean> => {
      const { currentSong, queue } = get();

      let relatedSongs: Song[] = [];
      const primaryArtist = currentSong?.artist?.split(/,|&| feat\.? /i)[0]?.trim();

      if (primaryArtist) {
        try {
          const { searchSaavnSongs } = await import("@/lib/saavn");
          const results = await searchSaavnSongs(primaryArtist, 10);
          const queueIds = new Set(queue.map((song) => song._id));
          relatedSongs = results.filter(
            (song: Song) => isVerifiedValidSong(song) && !queueIds.has(song._id)
          );
        } catch {
          relatedSongs = [];
        }
      }

      if (!relatedSongs.length) {
        try {
          const musicStore = useMusicStore.getState();
          if (!musicStore.trendingSongs.length) {
            await musicStore.fetchTrendingSongs();
          }
          const queueIds = new Set(queue.map((song) => song._id));
          relatedSongs = musicStore.trendingSongs.filter(
            (song) => isVerifiedValidSong(song) && !queueIds.has(song._id)
          );
        } catch {
          relatedSongs = [];
        }
      }

      if (!relatedSongs.length) return false;

      const nextBatch = relatedSongs.slice(0, 5);
      set((state) => ({
        queue: [...state.queue, ...nextBatch],
      }));
      return true;
    },

    toggleShuffle: () => set((state) => ({ isShuffle: !state.isShuffle })),
    cycleRepeat: () =>
      set((state) => ({
        repeatMode:
          state.repeatMode === "off"
            ? "all"
            : state.repeatMode === "all"
            ? "one"
            : "off",
      })),

    setProgress: (progress) => set({ progress }),
    setDuration: (duration) => set({ duration }),
    setCurrentSongLiked: (isLiked) =>
      set((state) =>
        state.currentSong
          ? { currentSong: { ...state.currentSong, isLiked } }
          : {}
      ),
    setQueue: (queue) => set({ queue: (queue || []).filter(isVerifiedValidSong) }),
    removeFromQueue: (index) =>
      set((state) => {
        const queue = state.queue.filter((_, itemIndex) => itemIndex !== index);
        const currentIndex =
          index < state.currentIndex
            ? state.currentIndex - 1
            : state.currentIndex;
        return {
          queue,
          currentIndex: queue.length ? Math.min(currentIndex, queue.length - 1) : -1,
        };
      }),

    playFromQueue: (index) => {
      const queue = get().queue;
      const song = queue[index];
      if (!song || !isVerifiedValidSong(song)) return;
      announce(song);
      set((state) => ({
        currentSong: song,
        currentIndex: index,
        isPlaying: true,
        progress: 0,
        playNonce: state.playNonce + 1,
        duration: song.duration || 0,
        playedSongs: [
          ...state.playedSongs,
          { ...song, playedAt: new Date().toISOString() },
        ],
      }));
    },

    addToQueue: (song) => {
      if (!song || !isVerifiedValidSong(song)) return;
      const { queue, currentSong } = get();
      const updatedQueue = [...queue, song];
      set({ queue: updatedQueue });
      toast.success(`Added "${song.title}" to Queue`);
      if (!currentSong) {
        get().playAlbum(updatedQueue, updatedQueue.length - 1);
      }
    },

    addPlayNext: (song) => {
      if (!song || !isVerifiedValidSong(song)) return;
      const { queue, currentIndex, currentSong } = get();
      if (!currentSong || currentIndex === -1) {
        get().playAlbum([song], 0);
        toast.success(`Playing "${song.title}" next`);
        return;
      }
      const updatedQueue = [...queue];
      updatedQueue.splice(currentIndex + 1, 0, song);
      set({ queue: updatedQueue });
      toast.success(`"${song.title}" will play next`);
    },
  };
});
