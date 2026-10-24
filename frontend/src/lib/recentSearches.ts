export const PLAYED_SEARCHES_KEY = "beatbond:played-searches:v1";
export const LEGACY_RECENT_SEARCHES_KEY = "beatbond:recent-searches";

export const normalizeSearchQuery = (query: unknown) =>
  String(query || "").trim().replace(/\s+/g, " ").slice(0, 120);

export const searchQueryKey = (query: unknown) => normalizeSearchQuery(query).toLocaleLowerCase();

export const getConfirmedSearchQuery = (query: unknown, currentQuery: unknown, resultsQuery: unknown) => {
  const normalized = normalizeSearchQuery(query);
  const key = searchQueryKey(normalized);
  return key && key === searchQueryKey(currentQuery) && key === searchQueryKey(resultsQuery) ? normalized : "";
};

export const mergePlayedSearches = (current: string[], query: unknown, limit = 8) => {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return current;
  return [normalized, ...current.filter((item) => searchQueryKey(item) !== searchQueryKey(normalized))].slice(0, limit);
};

type SearchStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const loadPlayedSearches = (storage: SearchStorage = localStorage): string[] => {
  try {
    // Older versions wrote each debounced input value, so those entries have
    // no reliable link to a played song and are intentionally discarded.
    storage.removeItem(LEGACY_RECENT_SEARCHES_KEY);
    const value: unknown = JSON.parse(storage.getItem(PLAYED_SEARCHES_KEY) || "[]");
    return Array.isArray(value)
      ? value.map(normalizeSearchQuery).filter((query): query is string => Boolean(query)).slice(0, 8)
      : [];
  } catch {
    return [];
  }
};

/** A query becomes recent only after a user starts playback from its results. */
export const savePlayedSearch = (query: unknown, storage: SearchStorage = localStorage) => {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return loadPlayedSearches(storage);
  const next = mergePlayedSearches(loadPlayedSearches(storage), normalized);
  try {
    storage.setItem(PLAYED_SEARCHES_KEY, JSON.stringify(next));
    // Old versions recorded every debounced keystroke; discard that untrusted list.
    storage.removeItem(LEGACY_RECENT_SEARCHES_KEY);
  } catch {
    // Browser storage may be disabled; recent searches are optional.
  }
  return next;
};

export const clearPlayedSearches = (storage: SearchStorage = localStorage) => {
  storage.removeItem(PLAYED_SEARCHES_KEY);
  storage.removeItem(LEGACY_RECENT_SEARCHES_KEY);
};
