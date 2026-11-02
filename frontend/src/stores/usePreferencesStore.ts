import { create } from "zustand";
import type { StreamQuality } from "@/lib/streamQuality";

type Preferences = {
  language: "en" | "hi";
  streamQuality: StreamQuality;
  /** Keep playing similar songs when the queue runs out. */
  autoplay: boolean;
  sleepTimerEndsAt: number | null;
  sleepTimerAtTrackEnd: boolean;
  podcastPlaybackSpeed: number;
};

interface PreferencesStore extends Preferences {
  setStreamQuality: (quality: StreamQuality) => void;
  setLanguage: (language: "en" | "hi") => void;
  setAutoplay: (autoplay: boolean) => void;
  setSleepTimer: (minutes: number | null) => void;
  setSleepTimerAtTrackEnd: (enabled: boolean) => void;
  setPodcastPlaybackSpeed: (speed: number) => void;
}

// Playback choices belong to the device (a phone on mobile data may want the
// data saver while a laptop streams in high quality).
const STORAGE_KEY = "beatbond-preferences";
const DEFAULTS: Preferences = { language: "en", streamQuality: "high", autoplay: true, sleepTimerEndsAt: null, sleepTimerAtTrackEnd: false, podcastPlaybackSpeed: 1 };

const load = (): Preferences => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<Preferences>;
    return {
      language: saved.language === "hi" ? "hi" : "en",
      streamQuality: saved.streamQuality === "normal" || saved.streamQuality === "saver" ? saved.streamQuality : DEFAULTS.streamQuality,
      autoplay: typeof saved.autoplay === "boolean" ? saved.autoplay : DEFAULTS.autoplay,
      sleepTimerEndsAt: typeof saved.sleepTimerEndsAt === "number" && saved.sleepTimerEndsAt > Date.now() ? saved.sleepTimerEndsAt : null,
      sleepTimerAtTrackEnd: saved.sleepTimerAtTrackEnd === true,
      podcastPlaybackSpeed: typeof saved.podcastPlaybackSpeed === "number" && saved.podcastPlaybackSpeed >= 0.5 && saved.podcastPlaybackSpeed <= 3 ? saved.podcastPlaybackSpeed : 1,
    };
  } catch {
    return DEFAULTS;
  }
};

const save = ({ language, streamQuality, autoplay, sleepTimerEndsAt, sleepTimerAtTrackEnd, podcastPlaybackSpeed }: Preferences) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ language, streamQuality, autoplay, sleepTimerEndsAt, sleepTimerAtTrackEnd, podcastPlaybackSpeed }));
  } catch {
    /* Private mode: the choice lasts for this visit. */
  }
};

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  ...load(),
  setStreamQuality: (streamQuality) => {
    set({ streamQuality });
    save(get());
  },
  setLanguage: (language) => { set({ language }); save(get()); },
  setAutoplay: (autoplay) => {
    set({ autoplay });
    save(get());
  },
  setSleepTimer: (minutes) => {
    set({ sleepTimerEndsAt: minutes === null ? null : Date.now() + minutes * 60_000, sleepTimerAtTrackEnd: false });
    save(get());
  },
  setSleepTimerAtTrackEnd: (sleepTimerAtTrackEnd) => {
    set({ sleepTimerAtTrackEnd, sleepTimerEndsAt: null });
    save(get());
  },
  setPodcastPlaybackSpeed: (podcastPlaybackSpeed) => {
    if (!Number.isFinite(podcastPlaybackSpeed) || podcastPlaybackSpeed < 0.5 || podcastPlaybackSpeed > 3) return;
    set({ podcastPlaybackSpeed });
    save(get());
  },
}));
