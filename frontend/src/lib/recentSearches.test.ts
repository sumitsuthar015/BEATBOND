import { describe, expect, it } from "vitest";
import {
  clearPlayedSearches,
  getConfirmedSearchQuery,
  loadPlayedSearches,
  mergePlayedSearches,
  PLAYED_SEARCHES_KEY,
  LEGACY_RECENT_SEARCHES_KEY,
  savePlayedSearch,
} from "@/lib/recentSearches";

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
};

describe("played search history", () => {
  it("accepts only a complete query whose matching results are currently displayed", () => {
    expect(getConfirmedSearchQuery(" Kesariya  Arijit Singh ", "kesariya arijit singh", "Kesariya Arijit Singh"))
      .toBe("Kesariya Arijit Singh");
    expect(getConfirmedSearchQuery("kesariya arijit", "kesariya arijit singh", "kesariya arijit"))
      .toBe("");
    expect(getConfirmedSearchQuery("new query", "new query", "previous query")).toBe("");
  });

  it("does not add a query until the caller records a played result", () => {
    const storage = createStorage();
    expect(loadPlayedSearches(storage)).toEqual([]);
    expect(savePlayedSearch("   ", storage)).toEqual([]);
    expect(storage.getItem(PLAYED_SEARCHES_KEY)).toBeNull();
  });

  it("stores the complete trimmed query and removes legacy per-keystroke history", () => {
    const storage = createStorage();
    storage.setItem(LEGACY_RECENT_SEARCHES_KEY, JSON.stringify(["q", "qu", "que"]));

    expect(savePlayedSearch("  Kesariya   Arijit Singh  ", storage)).toEqual(["Kesariya Arijit Singh"]);
    expect(loadPlayedSearches(storage)).toEqual(["Kesariya Arijit Singh"]);
    expect(storage.getItem(LEGACY_RECENT_SEARCHES_KEY)).toBeNull();
  });

  it("discards pre-fix per-character entries during migration", () => {
    const storage = createStorage();
    storage.setItem(LEGACY_RECENT_SEARCHES_KEY, JSON.stringify(["q", "qu", "que"]));

    expect(loadPlayedSearches(storage)).toEqual([]);
    expect(storage.getItem(LEGACY_RECENT_SEARCHES_KEY)).toBeNull();
  });

  it("moves a repeated query to the top once and caps history at eight", () => {
    const recent = mergePlayedSearches(
      ["Song 1", "Song 2", "Song 3", "Song 4", "Song 5", "Song 6", "Song 7", "Song 8"],
      " song 3 ",
    );

    expect(recent).toEqual(["song 3", "Song 1", "Song 2", "Song 4", "Song 5", "Song 6", "Song 7", "Song 8"]);
  });

  it("clears both current and legacy search history keys", () => {
    const storage = createStorage();
    storage.setItem(PLAYED_SEARCHES_KEY, JSON.stringify(["Song"]));
    storage.setItem(LEGACY_RECENT_SEARCHES_KEY, JSON.stringify(["S", "So"]));
    clearPlayedSearches(storage);

    expect(loadPlayedSearches(storage)).toEqual([]);
    expect(storage.getItem(LEGACY_RECENT_SEARCHES_KEY)).toBeNull();
  });
});
