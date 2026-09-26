import { create } from "zustand";
import type { StreamQuality } from "@/lib/streamQuality";

type Preferences = {
  streamQuality: StreamQuality;
  /** Keep playing similar songs when the queue runs out. */
  autoplay: boolean;
};

interface PreferencesStore extends Preferences {
  setStreamQuality: (quality: StreamQuality) => void;
  setAutoplay: (autoplay: boolean) => void;
}

// Playback choices belong to the device (a phone on mobile data may want the
// data saver while a laptop streams in high quality).
const STORAGE_KEY = "beatbond-preferences";
const DEFAULTS: Preferences = { streamQuality: "high", autoplay: true };

const load = (): Preferences => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<Preferences>;
    return {
      streamQuality: saved.streamQuality === "normal" || saved.streamQuality === "saver" ? saved.streamQuality : DEFAULTS.streamQuality,
      autoplay: typeof saved.autoplay === "boolean" ? saved.autoplay : DEFAULTS.autoplay,
    };
  } catch {
    return DEFAULTS;
  }
};

const save = ({ streamQuality, autoplay }: Preferences) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ streamQuality, autoplay }));
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
  setAutoplay: (autoplay) => {
    set({ autoplay });
    save(get());
  },
}));
