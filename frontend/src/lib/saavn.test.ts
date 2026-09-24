import { describe, expect, it } from "vitest";
import { getBestAudioUrl, getCleanArtistSongs, isSameArtistName, mapSaavnSong } from "@/lib/saavn";

const saavnSong = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  language: "hindi",
  duration: "240",
  year: "2022",
  album: { id: "al1", name: "Brahmastra" },
  image: [{ url: "small.jpg" }, { url: "medium.jpg" }, { url: "large.jpg" }],
  artists: { primary: [{ name: "Arijit Singh" }] },
  downloadUrl: [{ quality: "160kbps", url: `https://cdn/${id}-160` }, { quality: "320kbps", url: `https://cdn/${id}-320` }],
  ...extra,
});

describe("getBestAudioUrl", () => {
  it("prefers 320kbps, then 160kbps, then any available stream", () => {
    expect(getBestAudioUrl([{ quality: "160kbps", url: "a" }, { quality: "320kbps", url: "b" }])).toBe("b");
    expect(getBestAudioUrl([{ quality: "96kbps", url: "a" }, { quality: "160kbps", url: "c" }])).toBe("c");
    expect(getBestAudioUrl([{ quality: "12kbps", url: "d" }])).toBe("d");
    expect(getBestAudioUrl(undefined)).toBe("");
  });
});

describe("mapSaavnSong", () => {
  it("maps a JioSaavn song into the app's Song shape", () => {
    const song = mapSaavnSong(saavnSong("k1", "Kesariya &amp; Reprise"));

    expect(song).toMatchObject({
      _id: "k1",
      title: "Kesariya & Reprise",
      artist: "Arijit Singh",
      audioUrl: "https://cdn/k1-320",
      audioFallbackUrls: ["https://cdn/k1-160"],
      imageUrl: "large.jpg",
      albumName: "Brahmastra",
      releaseYear: 2022,
      duration: 240,
    });
  });

  it("returns null when the song cannot be played", () => {
    expect(mapSaavnSong(saavnSong("k2", "No Audio", { downloadUrl: [] }))).toBeNull();
    expect(mapSaavnSong({ name: "No id" })).toBeNull();
  });
});

describe("artist matching", () => {
  it("isSameArtistName ignores case and matches partial names", () => {
    expect(isSameArtistName("ARIJIT SINGH", "arijit singh")).toBe(true);
    expect(isSameArtistName("Arijit Singh & Shreya Ghoshal", "Arijit Singh")).toBe(true);
    expect(isSameArtistName("Shreya Ghoshal", "Arijit Singh")).toBe(false);
  });

  it("getCleanArtistSongs keeps the original over remixes and removes other artists", () => {
    const songs = getCleanArtistSongs(
      [
        saavnSong("r1", "Kesariya (Remix)"),
        saavnSong("o1", "Kesariya"),
        saavnSong("x1", "Other Artist Song", { artists: { primary: [{ name: "Badshah" }] } }),
      ],
      "Arijit Singh",
    );

    expect(songs.map((song) => song._id)).toEqual(["o1"]);
  });
});
