import { describe, expect, it } from "vitest";
import { bestOf, cleanTitle, lyricsAsPlainText, matchLyricsTrack, toLines } from "@/lib/lyrics";

const song = { title: "Channa Mereya (From \"Ae Dil Hai Mushkil\")", artist: "Pritam, Arijit Singh", duration: 289 };

describe("matchLyricsTrack", () => {
  it("accepts the same recording with trustworthy timing", () => {
    expect(matchLyricsTrack(song, { trackName: "Channa Mereya", artistName: "Arijit Singh", duration: 290 })).toBe("timed");
  });

  it("accepts provider titles written as 'Artist - Title'", () => {
    expect(matchLyricsTrack(
      { title: "Espresso", artist: "Sabrina Carpenter", duration: 175 },
      { trackName: "Sabrina Carpenter - Espresso", artistName: "Sabrina Carpenter", duration: 175 }
    )).toBe("timed");
  });

  it("keeps the words but drops timing for a different cut of the song", () => {
    expect(matchLyricsTrack(song, { trackName: "Channa Mereya", artistName: "Arijit Singh", duration: 299 })).toBe("plain");
  });

  it("rejects a different song or a different artist", () => {
    expect(matchLyricsTrack(song, { trackName: "Ae Dil Hai Mushkil", artistName: "Arijit Singh", duration: 289 })).toBeNull();
    expect(matchLyricsTrack(song, { trackName: "Channa Mereya", artistName: "Some Cover Band", duration: 289 })).toBeNull();
  });

  it("rejects a version whose length is far off", () => {
    expect(matchLyricsTrack(song, { trackName: "Channa Mereya", artistName: "Arijit Singh", duration: 120 })).toBeNull();
  });
});

describe("toLines", () => {
  it("expands repeated timestamps and keeps lines in time order", () => {
    const lines = toLines("[00:30.00]Verse\n[00:10.00][00:50.00]Chorus", true);
    expect(lines).toEqual([
      { text: "Chorus", time: 10 },
      { text: "Verse", time: 30 },
      { text: "Chorus", time: 50 },
    ]);
  });

  it("never shows timestamps in the plain-text view", () => {
    expect(lyricsAsPlainText({ text: "[00:01.00]Hello\n\n[00:02.50]World", synced: true })).toBe("Hello\nWorld");
  });
});

describe("cleanTitle", () => {
  it("removes film credits and version tags", () => {
    expect(cleanTitle("Tum Hi Ho (From &quot;Aashiqui 2&quot;)")).toBe("Tum Hi Ho");
    expect(cleanTitle("Jhol - Acoustic")).toBe("Jhol");
  });
});

describe("bestOf", () => {
  const later = <T,>(value: T, ms: number) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

  it("waits for a better provider instead of taking the fastest answer", async () => {
    const best = await bestOf([
      { bestRank: 0, run: () => later({ text: "synced", synced: true, rank: 0 }, 30) },
      { bestRank: 2, run: () => later({ text: "plain", synced: false, rank: 2 }, 1) },
    ]);
    expect(best?.text).toBe("synced");
  });

  it("answers as soon as nothing better can arrive", async () => {
    const started = Date.now();
    const best = await bestOf([
      { bestRank: 0, run: () => later({ text: "synced", synced: true, rank: 0 }, 1) },
      { bestRank: 5, run: () => later(null, 500) },
    ]);
    expect(best?.text).toBe("synced");
    expect(Date.now() - started).toBeLessThan(400);
  });

  it("falls back to a lower-ranked result when better providers find nothing", async () => {
    const best = await bestOf([
      { bestRank: 0, run: () => later(null, 5) },
      { bestRank: 2, run: () => later({ text: "plain", synced: false, rank: 2 }, 10) },
    ]);
    expect(best?.text).toBe("plain");
  });
});
