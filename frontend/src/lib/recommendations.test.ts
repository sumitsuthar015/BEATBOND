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
