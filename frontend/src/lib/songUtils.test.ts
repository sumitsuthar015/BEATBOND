import { describe, expect, it } from "vitest";
import { isVerifiedValidSong } from "@/lib/songUtils";
import type { Song } from "@/types";

const song = (overrides: Partial<Song> = {}): Song => ({
  _id: "s1",
  title: "Kesariya",
  artist: "Arijit Singh",
  audioUrl: "https://cdn.example.com/kesariya.mp4",
  imageUrl: "",
  duration: 268,
  genre: "hindi",
  videoUrl: null,
  playedAt: "",
  userId: undefined,
  createdAt: "",
  updatedAt: "",
  ...overrides,
});

describe("isVerifiedValidSong", () => {
  it("accepts a song with a real title, artist and playable URL", () => {
    expect(isVerifiedValidSong(song())).toBe(true);
    expect(isVerifiedValidSong(song({ audioUrl: "blob:http://localhost/abc" }))).toBe(true);
  });

  it("rejects placeholder titles and artists", () => {
    expect(isVerifiedValidSong(song({ title: "Unknown Track" }))).toBe(false);
    expect(isVerifiedValidSong(song({ artist: "Unknown Artist" }))).toBe(false);
    expect(isVerifiedValidSong(song({ artist: "Various Artists" }))).toBe(false);
  });

  it("rejects missing songs and non-playable audio URLs", () => {
    expect(isVerifiedValidSong(null)).toBe(false);
    expect(isVerifiedValidSong(song({ audioUrl: "" }))).toBe(false);
    expect(isVerifiedValidSong(song({ audioUrl: "ftp://files/song.mp3" }))).toBe(false);
  });
});
