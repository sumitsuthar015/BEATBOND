import { beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/axios", () => ({ axiosInstance: { get, post: vi.fn(), delete: vi.fn() } }));

import { useSearchStore } from "@/stores/useSearchStore";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

describe("search suggestion request ordering", () => {
  beforeEach(() => {
    get.mockReset();
    useSearchStore.setState({
      suggestions: { songs: [], artists: [], albums: [], playlists: [], popular: [] },
      isLoadingSuggestions: false,
    });
  });

  it("keeps the newest query's suggestions when an older request resolves later", async () => {
    const oldRequest = deferred<{ data: { suggestions: { popular: { title: string }[] } } }>();
    const newRequest = deferred<{ data: { suggestions: { popular: { title: string }[] } } }>();
    get.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);

    const oldSearch = useSearchStore.getState().getSuggestions("arijit");
    const newSearch = useSearchStore.getState().getSuggestions("kesariya");
    newRequest.resolve({ data: { suggestions: { popular: [{ title: "kesariya" }] } } });
    await newSearch;
    oldRequest.resolve({ data: { suggestions: { popular: [{ title: "arijit" }] } } });
    await oldSearch;

    expect(useSearchStore.getState().suggestions.popular).toEqual([{ title: "kesariya" }]);
  });

  it("does not restore suggestions after the search is cleared", async () => {
    const pending = deferred<{ data: { suggestions: { popular: { title: string }[] } } }>();
    get.mockReturnValueOnce(pending.promise);
    const search = useSearchStore.getState().getSuggestions("kesariya");
    useSearchStore.getState().clearSuggestions();
    pending.resolve({ data: { suggestions: { popular: [{ title: "kesariya" }] } } });
    await search;

    expect(useSearchStore.getState().suggestions.popular).toEqual([]);
  });
});

describe("main music search", () => {
  beforeEach(() => {
    get.mockReset();
    useSearchStore.setState({
      searchResults: [], artistResults: [], albumResults: [], playlistResults: [],
      searchResultsQuery: "", isLoading: false, error: null,
    });
  });

  it("shows playable songs without waiting for playlist and metadata lookups", async () => {
    get.mockImplementation((url: string) => {
      if (url === "/saavn/search") return Promise.resolve({ data: { data: {
        songs: [{ id: "fast-song", name: "Fast Song", artists: { primary: [{ name: "Test Artist" }] }, image: [{ url: "cover" }], downloadUrl: [{ quality: "320kbps", url: "https://audio.test/fast" }] }],
        artists: [], albums: [],
      } } });
      return new Promise(() => undefined);
    });

    await useSearchStore.getState().searchSongs("speedy-test");

    expect(useSearchStore.getState().searchResults.map((song) => song._id)).toEqual(["fast-song"]);
    expect(useSearchStore.getState().isLoading).toBe(false);
    expect(get).toHaveBeenCalledWith("/playlists", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("aborts the previous catalogue request when a newer query starts", async () => {
    const signals: AbortSignal[] = [];
    get.mockImplementation((url: string, config?: { signal?: AbortSignal }) => {
      if (url === "/search") return Promise.resolve({ data: [] });
      if (url === "/saavn/search") {
        if (config?.signal) signals.push(config.signal);
        return Promise.resolve({ data: { data: { songs: [], artists: [], albums: [] } } });
      }
      return new Promise(() => undefined);
    });

    await useSearchStore.getState().searchSongs("first-cancel-test");
    await useSearchStore.getState().searchSongs("second-cancel-test");

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });
});
