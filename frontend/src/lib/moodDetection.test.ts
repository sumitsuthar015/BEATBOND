import { describe, expect, it } from "vitest";
import { detectMood, moodsOfSong, timeOfDayPrior } from "@/lib/moodDetection";
import type { ListeningEvent } from "@/lib/listeningHistory";

// A Tuesday, so weekend-night rules don't apply unless a test asks for them.
const at = (hour: number, day = 22) => new Date(2026, 8, day, hour, 0);
const play = (id: string, title: string, minutesAgo: number, now: Date): ListeningEvent => ({
  _id: id,
  title,
  artist: "Artist",
  audioUrl: "https://cdn/x",
  imageUrl: "",
  duration: 200,
  genre: "hindi",
  videoUrl: null,
  userId: "u1",
  createdAt: "",
  updatedAt: "",
  playedAt: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
});

describe("moodsOfSong", () => {
  it("reads the mood from whole words in the title", () => {
    expect(moodsOfSong({ title: "Ishq Hai" })).toEqual(["romantic"]);
    expect(moodsOfSong({ title: "Tanha Dil" })).toEqual(["sad", "romantic"]);
    expect(moodsOfSong({ title: "Dhol Jageero Da" })).toEqual(["party"]);
    expect(moodsOfSong({ title: "Tumhe Dillagi" })).toEqual([]);
  });
});

describe("timeOfDayPrior", () => {
  it("leans happy in the morning and party on weekend nights", () => {
    expect(timeOfDayPrior(at(8)).scores.happy).toBe(1);
    expect(timeOfDayPrior(at(22, 26)).scores.party).toBe(1); // a Saturday
  });
});

describe("detectMood", () => {
  it("follows what the listener has been playing", () => {
    const now = at(9); // morning would guess "happy" on its own
    const plays = [
      play("1", "Judai", 50, now),
      play("2", "Tanha Tanha", 30, now),
      play("3", "Yaad Aa Rahi Hai", 10, now),
    ];
    const result = detectMood({ plays, signals: [], now });

    expect(result.mood).toBe("sad");
    expect(result.confidence).toBe("high");
    expect(result.reasons[0]).toMatch(/3 recent songs sound sad/);
  });

  it("gives less weight to songs the listener skipped", () => {
    const now = at(14);
    const plays = [play("1", "Dance Floor", 20, now), play("2", "Party All Night", 15, now), play("3", "Ishq Wala Love", 5, now)];
    const signals = [
      { songId: "1", skipped: true, completed: false, listenedSeconds: 5, duration: 200, at: "" },
      { songId: "2", skipped: true, completed: false, listenedSeconds: 5, duration: 200, at: "" },
      { songId: "3", skipped: false, completed: true, listenedSeconds: 200, duration: 200, at: "" },
    ];

    expect(detectMood({ plays, signals, now }).mood).toBe("romantic");
  });

  it("ignores plays older than a few hours", () => {
    const now = at(8);
    const result = detectMood({ plays: [play("1", "Judai", 60 * 10, now)], signals: [], now });

    expect(result.mood).toBe("happy");
    expect(result.confidence).toBe("low");
    expect(result.reasons).toContain("Play a few songs and this gets more accurate");
  });
});
