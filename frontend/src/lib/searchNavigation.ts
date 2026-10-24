export const getSearchQueryParams = (query: string): Record<string, string> =>
  query.trim() ? { q: query } : {};

export const SEARCH_QUERY_NAVIGATION_OPTIONS = { replace: true } as const;
