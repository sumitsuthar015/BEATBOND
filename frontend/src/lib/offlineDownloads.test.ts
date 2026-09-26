import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Song } from "@/types";

vi.mock("@/lib/lyrics", () => ({ saveLyricsForOffline: vi.fn(async () => undefined), removeSavedLyrics: vi.fn() }));

const { downloadSongForOffline, getDownloadedSongs, getOfflineAudioUrl, isDownloaded, isDownloading, removeAllDownloads, removeDownloadedSong } =
  await import("@/lib/offlineDownloads");

const song: Song = {
  _id: "tum-hi-ho",
  title: "Tum Hi Ho",
  artist: "Arijit Singh",
  audioUrl: "https://cdn.test/tum_320.mp4",
  audioFallbackUrls: ["https://cdn.test/tum_160.mp4"],
  imageUrl: "",
  duration: 262,
  genre: "hindi",
  videoUrl: null,
  playedAt: "",
  userId: undefined,
  createdAt: "",
  updatedAt: "",
};

// Minimal in-memory stand-ins for the browser storage APIs.
const setUpBrowser = (available: Record<string, number>) => {
  const store = new Map<string, Map<string, Response>>();
  const storage: Record<string, string> = {};
  vi.stubGlobal("location", { origin: "https://beatbond.test" });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => { storage[key] = value; },
    removeItem: (key: string) => { delete storage[key]; },
  });
  vi.stubGlobal("window", { dispatchEvent: () => true });
  vi.stubGlobal("navigator", { storage: { persist: async () => true } });
  vi.stubGlobal("caches", {
    open: async (name: string) => {
      const cache = store.get(name) ?? new Map<string, Response>();
      store.set(name, cache);
      return {
        put: async (key: string, response: Response) => { cache.set(key, response); },
        match: async (key: string) => cache.get(key)?.clone(),
        delete: async (key: string) => cache.delete(key),
      };
    },
  });
  vi.stubGlobal("fetch", async (url: string) =>
    available[url] ? new Response(new Uint8Array(available[url]), { status: 200, headers: { "content-type": "audio/mp4" } }) : new Response("missing", { status: 404 })
  );
  URL.createObjectURL = vi.fn((blob: Blob) => `blob:test/${blob.size}`);
  return store;
};

describe("offline downloads", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("falls back to a lower quality when the 320kbps file doesn't exist", async () => {
    const store = setUpBrowser({ "https://cdn.test/tum_160.mp4": 1600 });

    await downloadSongForOffline(song);

    expect(isDownloaded("tum-hi-ho")).toBe(true);
    expect(getDownloadedSongs().map((item) => item._id)).toEqual(["tum-hi-ho"]);
    const saved = await store.get("beatbond-offline-downloads-v1")?.get("https://beatbond.test/offline/audio/tum-hi-ho")?.clone().blob();
    expect(saved?.size).toBe(1600);
  });

  it("plays downloads from the saved file, not the network", async () => {
    setUpBrowser({ "https://cdn.test/tum_320.mp4": 3200 });
    await downloadSongForOffline(song);

    expect(await getOfflineAudioUrl(song)).toBe("blob:test/3200");
    expect(await getOfflineAudioUrl({ ...song, _id: "not-downloaded" })).toBeNull();
  });

  it("refuses to save when no quality can be downloaded", async () => {
    setUpBrowser({});

    await expect(downloadSongForOffline(song)).rejects.toThrow(/could not be saved/);
    expect(isDownloaded("tum-hi-ho")).toBe(false);
  });

  it("removes the saved file along with the entry", async () => {
    setUpBrowser({ "https://cdn.test/tum_320.mp4": 3200 });
    await downloadSongForOffline(song);

    await removeDownloadedSong(song);

    expect(isDownloaded("tum-hi-ho")).toBe(false);
    expect(await getOfflineAudioUrl(song)).toBeNull();
  });

  it("a second tap while downloading reuses the running download", async () => {
    setUpBrowser({ "https://cdn.test/tum_320.mp4": 3200 });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const first = downloadSongForOffline(song);
    const second = downloadSongForOffline(song);
    expect(second).toBe(first);
    expect(isDownloading("tum-hi-ho")).toBe(true);
    await first;

    expect(isDownloading("tum-hi-ho")).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("removes every download at once", async () => {
    setUpBrowser({ "https://cdn.test/tum_320.mp4": 3200, "https://cdn.test/other.mp4": 100 });
    await downloadSongForOffline(song);
    await downloadSongForOffline({ ...song, _id: "other", audioUrl: "https://cdn.test/other.mp4", audioFallbackUrls: [] });

    await removeAllDownloads();

    expect(getDownloadedSongs()).toEqual([]);
  });
});
