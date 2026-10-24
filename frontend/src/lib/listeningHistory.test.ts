import { describe, expect, it } from "vitest";
import { getUniqueRecentTracks, removeListeningEventsForSong, type ListeningEvent } from "@/lib/listeningHistory";

const makeStorage = (entries: Record<string, string> = {}) => {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
};

const history: ListeningEvent[] = [
  { _id: "song-1", title: "Song 1", artist: "Artist", playedAt: "2026-10-24T10:00:00.000Z" } as ListeningEvent,
  { _id: "song-1", title: "Song 1", artist: "Artist", playedAt: "2026-10-24T11:00:00.000Z" } as ListeningEvent,
  { _id: "song-2", title: "Song 2", artist: "Artist", playedAt: "2026-10-24T12:00:00.000Z" } as ListeningEvent,
];

describe("recently played history", () => {
  it("shows one latest row per track even when the song has been played repeatedly", () => {
    expect(getUniqueRecentTracks(history.slice().reverse())).toEqual([history[2], history[1]]);
  });

  it("removes every duplicate play of the dismissed track from local history", () => {
    const storage = makeStorage({ "beatbond:listening-history:user-1": JSON.stringify(history) });

    const next = removeListeningEventsForSong("user-1", "song-1", storage);

    expect(next).toEqual([history[2]]);
    expect(JSON.parse(storage.getItem("beatbond:listening-history:user-1") || "[]")).toEqual(next);
  });

  it("leaves history unchanged when the selected play is already absent", () => {
    const storage = makeStorage({ "beatbond:listening-history:user-1": JSON.stringify(history) });

    expect(removeListeningEventsForSong("user-1", "missing", storage)).toEqual(history);
  });
});
