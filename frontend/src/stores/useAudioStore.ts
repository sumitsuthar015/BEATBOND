import { create } from 'zustand';

interface Song {
  id: string;
  name: string;
  url: string;
  image: string;
  duration: string;
  primaryArtists: string;
  language: string;
}

interface AudioStore {
  currentSong: Song | null;
  isPlaying: boolean;
  queue: Song[];
  currentIndex: number;
  setCurrentSong: (song: Song | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  playSong: (song: Song, songList?: Song[]) => void;
  togglePlayPause: () => void;
  playNext: () => void;
  playPrevious: () => void;
  addToQueue: (song: Song) => void;
  clearQueue: () => void;
}

interface AudioProgressStore {
  progress: number;
  duration: number;
  setProgress: (progress: number) => void;
  setDuration: (duration: number) => void;
  handleSeek: (time: number) => void;
  audioRef: React.RefObject<HTMLAudioElement> | null;
  playerRef: React.RefObject<any> | null;
  setAudioRef: (ref: React.RefObject<HTMLAudioElement>) => void;
  setPlayerRef: (ref: React.RefObject<any>) => void;
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  currentSong: null,
  isPlaying: false,
  queue: [],
  currentIndex: -1,
  setCurrentSong: (song) => set({ currentSong: song }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  playSong: (song, songList) => {
    if (songList) {
      const index = songList.findIndex(s => s.id === song.id);
      set({ 
        currentSong: song, 
        isPlaying: true,
        queue: songList,
        currentIndex: index
      });
    } else {
      set({ 
        currentSong: song, 
        isPlaying: true,
        queue: [song],
        currentIndex: 0
      });
    }
  },
  togglePlayPause: () => set((state) => ({ isPlaying: !state.isPlaying })),
  playNext: () => {
    const { queue, currentIndex } = get();
    if (currentIndex < queue.length - 1) {
      const nextSong = queue[currentIndex + 1];
      set({ currentSong: nextSong, currentIndex: currentIndex + 1 });
    }
  },
  playPrevious: () => {
    const { queue, currentIndex } = get();
    if (currentIndex > 0) {
      const previousSong = queue[currentIndex - 1];
      set({ currentSong: previousSong, currentIndex: currentIndex - 1 });
    }
  },
  addToQueue: (song) => set((state) => ({ queue: [...state.queue, song] })),
  clearQueue: () => set({ queue: [], currentIndex: -1 }),
}));

export const useAudioProgressStore = create<AudioProgressStore>((set) => ({
  progress: 0,
  duration: 0,
  audioRef: null,
  playerRef: null,
  setProgress: (progress) => set({ progress }),
  setDuration: (duration) => set({ duration }),
  handleSeek: (time) => {
    const { audioRef, playerRef } = useAudioProgressStore.getState();
    if (audioRef?.current) {
      audioRef.current.currentTime = time;
    }
    if (playerRef?.current) {
      playerRef.current.seekTo(time, 'seconds');
    }
  },
  setAudioRef: (ref) => set({ audioRef: ref }),
  setPlayerRef: (ref) => set({ playerRef: ref }),
})); 