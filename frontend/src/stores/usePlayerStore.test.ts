import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordListeningEvent } = vi.hoisted(() => ({ recordListeningEvent: vi.fn() }));

vi.mock("@/lib/listeningHistory", () => ({ recordListeningEvent }));
vi.mock("@/lib/recommendations", () => ({
  fetchRecommendations: vi.fn(),
  rankRecommendations: vi.fn(),
  recordPlaybackOutcome: vi.fn(),
}));
vi.mock("@/stores/useChatStore", () => ({
  useChatStore: { getState: () => ({ updateCurrentActivity: vi.fn() }) },
}));

import { usePlayerStore } from "@/stores/usePlayerStore";
import type { Song } from "@/types";

const song = {
  _id: "recent-track",
  title: "Recent track",
  artist: "BeatBond artist",
  audioUrl: "https://example.com/track.mp3",
  imageUrl: "https://example.com/cover.jpg",
  duration: 180,
} as Song;

describe("playing a recently listed track", () => {
  beforeEach(() => {
    recordListeningEvent.mockClear();
    usePlayerStore.setState({ currentSong: null, queue: [], isPlaying: false, currentIndex: -1 });
  });

  it("starts playback without recording the same track into history again", () => {
    usePlayerStore.getState().setCurrentSong(song, { recordHistory: false });

    expect(usePlayerStore.getState().currentSong?._id).toBe(song._id);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(recordListeningEvent).not.toHaveBeenCalled();
  });

  it("keeps normal history tracking for regular song playback", () => {
    usePlayerStore.getState().setCurrentSong(song);

    expect(recordListeningEvent).toHaveBeenCalledWith(song);
  });
});
