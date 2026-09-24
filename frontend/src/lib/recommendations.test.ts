import { beforeEach, describe, expect, it, vi } from "vitest";
import { rankRecommendations } from "@/lib/recommendations";
import type { Song } from "@/types";

const song = (id: string, title: string, artist: string, language = "hindi"): Song => ({
  _id: id,
  title,
  artist,
  language,
  audioUrl: `https://cdn/${id}`,
  imageUrl: "",
  duration: 200,
  genre: language,
  videoUrl: null,
  playedAt: "",
  userId: undefined,
  createdAt: "",
  updatedAt: "",
});

describe("rankRecommendations", () => {
  beforeEach(() => {
    // No signed-in listener, so ranking relies only on the current song.
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  });

  it("ranks songs by the same artist first, then the same language", () => {
    const current = song("c", "Kesariya", "Arijit Singh");
    const ranked = rankRecommendations(
      current,
      [song("a", "English Pop", "Ed Sheeran", "english"), song("b", "Hindi Song", "Pritam"), song("d", "Tum Hi Ho", "Arijit Singh")],
      [],
    );

    expect(ranked.map((item) => item._id)).toEqual(["d", "b", "a"]);
  });

  it("removes queued songs, duplicates and invalid tracks", () => {
    const current = song("c", "Kesariya", "Arijit Singh");
    const queued = song("q", "Channa Mereya", "Arijit Singh");
    const ranked = rankRecommendations(
      current,
      [queued, song("d", "Tum Hi Ho", "Arijit Singh"), song("d", "Tum Hi Ho", "Arijit Singh"), song("u", "Mystery", "Unknown Artist")],
      [queued],
    );

    expect(ranked.map((item) => item._id)).toEqual(["d"]);
  });
});

describe("rankRecommendations with listening history", () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const withHistory = (history: Array<Song & { playedAt: string }>) => {
    const store: Record<string, string> = {
      "beatbond:active-listener": "u1",
      "beatbond:listening-history:u1": JSON.stringify(history),
    };
    vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: () => undefined });
  };

  it("keeps songs heard before out while there are enough new ones", () => {
    withHistory([{ ...song("old", "Old Favourite", "Arijit Singh"), playedAt: daysAgo(3) }]);
    const current = song("c", "Kesariya", "Arijit Singh");
    const ranked = rankRecommendations(
      current,
      [song("old", "Old Favourite", "Arijit Singh"), song("n1", "New 1", "Arijit Singh"), song("n2", "New 2", "Pritam"), song("n3", "New 3", "Pritam")],
      [],
    );

    expect(ranked.map((item) => item._id)).toEqual(["n1", "n2", "n3"]);
  });

  it("brings older plays back after the new ones instead of stopping auto-play", () => {
    withHistory([
      { ...song("old", "Old Favourite", "Arijit Singh"), playedAt: daysAgo(3) },
      { ...song("today", "Played Today", "Arijit Singh"), playedAt: daysAgo(0.1) },
    ]);
    const current = song("c", "Kesariya", "Arijit Singh");
    const ranked = rankRecommendations(
      current,
      [song("old", "Old Favourite", "Arijit Singh"), song("today", "Played Today", "Arijit Singh"), song("n1", "New 1", "Pritam")],
      [],
    );

    // Songs from today are still never repeated.
    expect(ranked.map((item) => item._id)).toEqual(["n1", "old"]);
  });
});
