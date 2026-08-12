// @/stores/useSearchStore.ts
import {
  mapSaavnArtist,
  mapSaavnAlbum,
  mapSaavnSong,
  searchSaavnAlbums,
  searchSaavnArtists,
  searchSaavnSongs,
  SaavnArtistResult,
  SaavnPlaylistResult,
} from "@/lib/saavn";
import { Album, Song } from "@/types";
import { axiosInstance } from "@/lib/axios";
import { create } from "zustand";
import Fuse from "fuse.js";

let latestSearchRequest = 0;

const normalise = (value: unknown) => String(value || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

// These words describe the kind of query, not the music being searched for.
// Ignoring them prevents searches such as "Arijit songs" and "song Kesariya"
// from promoting unrelated results that merely contain "song" or "official".
const SEARCH_NOISE_WORDS = new Set([
  "song", "songs", "music", "official", "video", "audio", "lyrics",
  "full", "new", "latest", "download", "listen", "play",
]);
const meaningfulTerms = (query: string) => {
  const terms = normalise(query).split(" ").filter(Boolean);
  const filtered = terms.filter((term) => !SEARCH_NOISE_WORDS.has(term));
  return filtered.length ? filtered : terms;
};
const containsAllTerms = (text: string, terms: string[]) => terms.length > 0 && terms.every((term) => text.includes(term));

// JioSaavn exposes free-text search rather than Spotify-style `track:` and
// `artist:` filters. For a multi-word query we probe likely artist phrases at
// either end ("Kesariya Arijit Singh" / "Arijit Singh Kesariya") and then
// search the remaining title separately once an exact artist is found.
const artistPhraseCandidates = (query: string) => {
  const words = meaningfulTerms(query);
  if (words.length < 3) return [];
  const candidates = [
    words.slice(0, 3).join(" "), words.slice(0, 2).join(" "),
    words.slice(-3).join(" "), words.slice(-2).join(" "),
  ].filter((value) => value.split(" ").length >= 2);
  return [...new Set(candidates)];
};

// Provider result ordering changes from request to request. Rank locally so
// an exact title/artist match always stays ahead of a loose match.
const rankSongs = (songs: Song[], query: string) => {
  const terms = meaningfulTerms(query);
  const meaningfulPhrase = terms.join(" ");
  const score = (song: Song) => {
    const title = normalise(song.title);
    const artist = normalise(song.artist);
    const album = normalise(song.albumName || song.albumTitle || song.albumId);
    const combined = `${title} ${artist} ${album}`;
    const artistTerms = normalise(song.artist).split(" ").filter(Boolean);
    const titleTerms = normalise(song.title).split(" ").filter(Boolean);
    const queryWithoutArtist = terms.filter((term) => !artistTerms.includes(term));
    const queryWithoutTitle = terms.filter((term) => !titleTerms.includes(term));
    let value = title === meaningfulPhrase ? 10_000 : artist === meaningfulPhrase ? 9_000 : 0;
    if (title.startsWith(meaningfulPhrase)) value += 4_000;
    if (artist.startsWith(meaningfulPhrase)) value += 3_500;
    if (combined.includes(meaningfulPhrase)) value += 1_000;
    value += terms.reduce((total, term) => {
      if (title.includes(term)) return total + 800;
      if (artist.includes(term)) return total + 700;
      if (album.includes(term)) return total + 300;
      return total - 600;
    }, 0);
    // Handle either word order: "Kesariya Arijit Singh" and "Arijit Singh
    // Kesariya" should both place the actual track above partial matches.
    if (containsAllTerms(combined, terms)) value += 2_500;
    if (artistTerms.length && meaningfulPhrase.includes(artist) && containsAllTerms(title, queryWithoutArtist)) value += 12_000;
    if (titleTerms.length && meaningfulPhrase.includes(title) && containsAllTerms(artist, queryWithoutTitle)) value += 12_000;
    return value;
  };

  // First deduplicate by ID
  const uniqueById = [...new Map(songs.map((song) => [song._id, song])).values()];
  
  // Then deduplicate by title+artist combination (case-insensitive)
  const titleArtistMap = new Map<string, Song>();
  for (const song of uniqueById) {
    const key = `${normalise(song.title)}|${normalise(song.artist)}`;
    const existing = titleArtistMap.get(key);
    if (!existing) {
      titleArtistMap.set(key, song);
    } else {
      // Keep the one with higher play count or better quality indicators
      const existingScore = (existing.playCount || 0) + (existing.duration || 0);
      const newScore = (song.playCount || 0) + (song.duration || 0);
      if (newScore > existingScore) {
        titleArtistMap.set(key, song);
      }
    }
  }
  
  const ranked = [...titleArtistMap.values()].map((song) => ({ song, score: score(song) }));
  // If relevant matches exist, do not let unrelated provider suggestions take
  // their place. Keep a small fallback only when the provider has no direct
  // match at all (useful for spelling variations).
  const relevant = ranked.filter(({ score }) => score > 0);
  return (relevant.length ? relevant : ranked)
    .sort((left, right) => right.score - left.score || left.song.title.localeCompare(right.song.title) || left.song.artist.localeCompare(right.song.artist))
    .map(({ song }) => song);
};

const matchesQuery = (value: string, query: string) => {
  const text = normalise(value);
  const terms = meaningfulTerms(query);
  return terms.length > 0 && terms.every((term) => text.includes(term));
};

const JUNK_ARTIST_NAMES = new Set([
  "unknown",
  "unknown artist",
  "various artists",
  "various",
  "artist",
  "null",
  "undefined",
  "n/a",
  "na",
  "none",
  "0",
  "soundtrack",
  "ost",
  "v/a",
  "va",
  "official",
  "topic",
]);

const isRealImage = (imageUrl?: string) => {
  if (!imageUrl) return false;
  const lower = imageUrl.toLowerCase();
  return (
    !lower.includes("artist-default") &&
    !lower.includes("default-image") &&
    !lower.includes("placeholder") &&
    !lower.includes("avatar-default") &&
    lower !== "/default-image.png" &&
    lower !== ""
  );
};

const isCollabOrAliasArtist = (artistName: string, query: string) => {
  const normName = normalise(artistName);
  const normQuery = normalise(query);

  // 1. If artist name contains quotes e.g. Abel "The Weeknd" Tesfaye
  if (artistName.includes('"') || artistName.includes("'")) {
    if (normName !== normQuery) return true;
  }

  // 2. Filter out collaboration strings (containing &, feat, ft, x, with, comma) when searching a single artist
  const isCollab = /\b(and|feat|ft|with|vs)\b|[&,/x]/i.test(artistName);
  if (isCollab) {
    if (!normQuery.includes("&") && !normQuery.includes("and") && !normQuery.includes(",")) {
      return true;
    }
  }

  // 3. Filter out wordy noise suffix variations like "The Weeknd Topic" or "The Weeknd Live"
  if (normQuery.length >= 3 && normName.includes(normQuery) && normName.length > normQuery.length + 6) {
    return true;
  }

  return false;
};

const isTrueArtist = (artist: SaavnArtistResult) => {
  if (!artist || !artist.name) return false;
  const clean = normalise(artist.name);
  if (clean.length < 2) return false;
  if (JUNK_ARTIST_NAMES.has(clean)) return false;
  const alphaNumericCount = (clean.match(/[a-z0-9]/g) || []).length;
  if (alphaNumericCount < 2) return false;
  return true;
};

const rankArtists = (artists: SaavnArtistResult[], query: string) => {
  const phrase = normalise(query);

  // First deduplicate by ID
  const uniqueById = [...new Map(artists.map((artist) => [artist.id, artist])).values()];
  
  // Deduplicate by name (case-insensitive), preferring verified, real photo, and follower count
  const nameMap = new Map<string, SaavnArtistResult>();
  for (const artist of uniqueById) {
    const normalizedName = normalise(artist.name);
    const existing = nameMap.get(normalizedName);
    if (!existing) {
      nameMap.set(normalizedName, artist);
    } else {
      const existingScore = (existing.isVerified ? 1000 : 0) + (isRealImage(existing.imageUrl) ? 500 : 0) + (existing.followerCount || 0);
      const newScore = (artist.isVerified ? 1000 : 0) + (isRealImage(artist.imageUrl) ? 500 : 0) + (artist.followerCount || 0);
      if (newScore > existingScore) {
        nameMap.set(normalizedName, artist);
      }
    }
  }
  
  // Filter out junk ("altu faltu") artists
  let validArtists = [...nameMap.values()].filter(isTrueArtist);

  // If a clean or exact artist match exists, filter out collaboration strings and alias names
  const cleanMatchExists = validArtists.some(
    (a) => normalise(a.name) === phrase || (normalise(a.name).startsWith(phrase) && !isCollabOrAliasArtist(a.name, phrase))
  );

  if (cleanMatchExists) {
    validArtists = validArtists.filter((artist) => !isCollabOrAliasArtist(artist.name, phrase));
  }

  // Prioritize artists with real photos over default placeholders
  const withRealPhotos = validArtists.filter((a) => isRealImage(a.imageUrl));
  if (withRealPhotos.length > 0) {
    validArtists = [...withRealPhotos, ...validArtists.filter((a) => !isRealImage(a.imageUrl))];
  }
  
  const direct = validArtists.filter((artist) => matchesQuery(artist.name, phrase));
  const score = (artist: SaavnArtistResult) => {
    const name = normalise(artist.name);
    const popularity = Math.min(Math.log10((artist.followerCount || 0) + 1) * 10, 80);
    const hasPhoto = isRealImage(artist.imageUrl) ? 200 : 0;
    return (name === phrase ? 1000 : name.startsWith(phrase) ? 700 : 400) + popularity + (artist.isVerified ? 50 : 0) + hasPhoto;
  };

  if (direct.length) return direct.sort((left, right) => score(right) - score(left));

  const threshold = phrase.length <= 3 ? 0.15 : 0.32;
  const fuzzy = new Fuse(validArtists, {
    keys: ["name"],
    includeScore: true,
    threshold,
    ignoreLocation: true,
    minMatchCharLength: Math.min(3, phrase.length),
  }).search(phrase);

  return fuzzy
    .filter((result) => (result.score ?? 1) <= threshold)
    .sort((left, right) => (left.score ?? 1) - (right.score ?? 1) || score(right.item) - score(left.item))
    .map((result) => result.item);
};

interface SearchFilters {
  genre?: string;
  year?: number;
  language?: string;
  explicit?: boolean;
  mood?: string;
  minDuration?: number;
  maxDuration?: number;
  sortBy?: "relevance" | "popularity" | "newest" | "oldest" | "duration-asc" | "duration-desc";
}

interface SearchSuggestion {
  songs: Array<{
    type: "song";
    title: string;
    subtitle: string;
    imageUrl: string;
    id: string;
  }>;
  artists: Array<{
    type: "artist";
    title: string;
    subtitle: string;
  }>;
  albums: Array<{
    type: "album";
    title: string;
    subtitle: string;
    imageUrl: string;
    id: string;
  }>;
  playlists: Array<{
    type: "playlist";
    title: string;
    subtitle: string;
    imageUrl: string;
    id: string;
  }>;
  popular: Array<{
    type: "popular";
    title: string;
    subtitle: string;
  }>;
}

interface SearchHistoryEntry {
  query: string;
  timestamp: string;
  resultCount: number;
  filters?: SearchFilters;
  clickedResult?: string;
  clickedResultType?: string;
}

interface SavedSearch {
  _id: string;
  name: string;
  query: string;
  filters: SearchFilters;
  notifyOnNewResults: boolean;
  lastChecked: string | null;
  lastResultCount: number;
  createdAt: string;
}

interface SearchStore {
  searchQuery: string;
  searchResults: Song[];
  artistResults: SaavnArtistResult[];
  albumResults: Album[];
  playlistResults: SaavnPlaylistResult[];
  isLoading: boolean;
  error: string | null;
  filters: SearchFilters;
  suggestions: SearchSuggestion;
  isLoadingSuggestions: boolean;
  searchHistory: SearchHistoryEntry[];
  savedSearches: SavedSearch[];
  filterOptions: {
    genres: string[];
    languages: string[];
    moods: string[];
    years: number[];
  };
  setSearchQuery: (query: string) => void;
  setFilters: (filters: SearchFilters) => void;
  searchSongs: (query: string) => Promise<void>;
  getSuggestions: (query: string) => Promise<void>;
  clearSearch: () => void;
  clearSuggestions: () => void;
  loadSearchHistory: () => Promise<void>;
  addToSearchHistory: (entry: SearchHistoryEntry) => Promise<void>;
  clearSearchHistory: () => Promise<void>;
  deleteSearchHistoryEntry: (id: string) => Promise<void>;
  loadSavedSearches: () => Promise<void>;
  createSavedSearch: (name: string, query: string, filters: SearchFilters, notifyOnNewResults: boolean) => Promise<void>;
  updateSavedSearch: (id: string, updates: Partial<SavedSearch>) => Promise<void>;
  deleteSavedSearch: (id: string) => Promise<void>;
  loadFilterOptions: () => Promise<void>;
  searchWithinPlaylist: (playlistId: string, query: string) => Promise<Song[]>;
  searchWithinAlbum: (albumId: string, query: string) => Promise<Song[]>;
}

export const useSearchStore = create<SearchStore>((set, get) => ({
  searchQuery: "",
  searchResults: [],
  artistResults: [],
  albumResults: [],
  playlistResults: [],
  isLoading: false,
  error: null,
  filters: {},
  suggestions: {
    songs: [],
    artists: [],
    albums: [],
    playlists: [],
    popular: [],
  },
  isLoadingSuggestions: false,
  searchHistory: [],
  savedSearches: [],
  filterOptions: {
    genres: [],
    languages: [],
    moods: [],
    years: [],
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  setFilters: (filters) => {
    set({ filters });
  },

  searchSongs: async (query: string) => {
    const requestId = ++latestSearchRequest;
    const normalizedQuery = query.trim().replace(/\s+/g, " ").toLowerCase();
    if (!normalizedQuery) {
      set({ searchResults: [], artistResults: [], albumResults: [], playlistResults: [], isLoading: false, error: null });
      return;
    }

    const { filters } = get();
    set({ isLoading: true, error: null });

    try {
      // Build query params
      const params = new URLSearchParams();
      params.append("q", normalizedQuery);
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          params.append(key, String(value));
        }
      });

      // The specialised endpoints keep every result type complete; the
      // aggregate endpoint is also requested as a fallback for API variants
      // that return an empty specialised collection.
      const artistCandidates = artistPhraseCandidates(normalizedQuery);
      const [songs, artists, albums, playlists, ...artistLookups] = await Promise.allSettled([
        searchSaavnSongs(normalizedQuery, 50),
        searchSaavnArtists(normalizedQuery, 10),
        searchSaavnAlbums(normalizedQuery, 20),
        axiosInstance.get("/playlists"),
        ...artistCandidates.map((candidate) => searchSaavnArtists(candidate, 5)),
      ]);
      let rawSongs = songs.status === "fulfilled" ? songs.value : [];
      const rawArtists = artists.status === "fulfilled" ? artists.value : [];
      const rawAlbums = albums.status === "fulfilled" ? albums.value : [];
      const rawPlaylists = playlists.status === "fulfilled" && Array.isArray(playlists.value.data)
        ? playlists.value.data
        : [];

      const detectedArtist = artistLookups.flatMap((lookup, index) => {
        if (lookup.status !== "fulfilled") return [];
        const candidate = artistCandidates[index];
        return lookup.value
          .map((artist: any) => mapSaavnArtist(artist))
          .filter((artist: SaavnArtistResult | null): artist is SaavnArtistResult => Boolean(artist))
          .filter((artist: SaavnArtistResult) => normalise(artist.name) === normalise(candidate));
      })[0];
      if (detectedArtist) {
        const artistTerms = normalise(detectedArtist.name).split(" ").filter(Boolean);
        const titleQuery = meaningfulTerms(normalizedQuery).filter((term) => !artistTerms.includes(term)).join(" ");
        if (titleQuery) {
          try {
            const titleResults = await searchSaavnSongs(titleQuery, 50);
            rawSongs = [...rawSongs, ...titleResults];
          } catch {
            // Keep the original broad search result if this refinement fails.
          }
        }
      }

      // Saavn is an enhancement, not a single point of failure. Fall back to
      // our own indexed catalogue when the upstream search is unavailable.
      if (!rawSongs.length) {
        try {
          const { data } = await axiosInstance.get("/search", { params });
          rawSongs = (Array.isArray(data) ? data : []).map((song: any) => ({
            id: song.id || song._id,
            name: song.title,
            artists: { primary: [{ name: song.artist }] },
            image: song.imageUrl ? [{ url: song.imageUrl }] : [],
            downloadUrl: song.url ? [{ quality: "320kbps", url: song.url }] : [],
            duration: song.duration,
            album: song.albumId ? { id: song.albumId, name: song.albumName || "" } : undefined,
          }));
        } catch {
          // Preserve the primary upstream error below if both providers fail.
        }
      }

      // A slow response from an earlier query must never replace newer results.
      if (requestId !== latestSearchRequest) return;

      if (songs.status === "rejected" && artists.status === "rejected" && albums.status === "rejected" && !rawSongs.length) {
        throw new Error("Search services are currently unavailable");
      }

      const mappedArtists: SaavnArtistResult[] = rawArtists
        .map((artist: any) => mapSaavnArtist(artist))
        .filter((artist: SaavnArtistResult | null): artist is SaavnArtistResult => Boolean(artist));
      // Some Saavn deployments return songs but an empty artist collection.
      // Use the artists embedded in those song results as a safe fallback so
      // searching an artist never produces an empty Artists section.
      const artistsFromSongs = rawSongs
        .flatMap((song: any) => {
          const primaryList = song?.artists?.primary || song?.artists?.all || [];
          if (Array.isArray(primaryList) && primaryList.length > 0) return primaryList;
          const artistField = song?.artist || song?.primaryArtists || "";
          if (typeof artistField === "string" && artistField) {
            return artistField
              .split(/,|&|\bfeat\.?\b|\bft\.?\b|\bwith\b/i)
              .map((name: string) => ({ name: name.trim() }))
              .filter((item: any) => item.name);
          }
          return [];
        })
        .map((artist: any) => mapSaavnArtist(artist))
        .filter((artist: SaavnArtistResult | null): artist is SaavnArtistResult => Boolean(artist));
      const discoveredArtists = [...mappedArtists, ...artistsFromSongs];
      const uniqueArtists: SaavnArtistResult[] = rankArtists(discoveredArtists, normalizedQuery);
      set({
        searchResults: rankSongs(rawSongs.map((song: any) => mapSaavnSong(song)).filter(Boolean) as Song[], normalizedQuery),
        artistResults: uniqueArtists,
        albumResults: rawAlbums.map((album: any) => mapSaavnAlbum(album)).filter(Boolean) as Album[],
        playlistResults: rawPlaylists
          .filter((playlist: any) => matchesQuery(`${playlist.name || ""} ${playlist.description || ""}`, normalizedQuery))
          .map((playlist: any) => ({
            id: String(playlist.id),
            name: String(playlist.name || "Playlist"),
            imageUrl: String(playlist.songs?.[0]?.imageUrl || "/default-image.png"),
            description: String(playlist.description || ""),
            songCount: Array.isArray(playlist.songs) ? playlist.songs.length : 0,
          })),
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      if (requestId !== latestSearchRequest) return;
      console.error("Search error:", error);
      const errorMessage = error.response?.data?.message || "Failed to search songs";
      
      set({ 
        searchResults: [],
        artistResults: [],
        albumResults: [],
        playlistResults: [],
        isLoading: false, 
        error: errorMessage 
      });
      
    }
  },

  getSuggestions: async (query: string) => {
    if (!query || query.trim().length < 2) {
      set({ 
        suggestions: {
          songs: [],
          artists: [],
          albums: [],
          playlists: [],
          popular: [],
        }, 
        isLoadingSuggestions: false 
      });
      return;
    }

    set({ isLoadingSuggestions: true });
    try {
      const { data } = await axiosInstance.get("/search/suggestions", {
        params: { q: query.trim(), limit: 10 },
      });
      set({ suggestions: data.suggestions || {
        songs: [],
        artists: [],
        albums: [],
        playlists: [],
        popular: [],
      }, isLoadingSuggestions: false });
    } catch (error) {
      console.error("Suggestions error:", error);
      set({ 
        suggestions: {
          songs: [],
          artists: [],
          albums: [],
          playlists: [],
          popular: [],
        }, 
        isLoadingSuggestions: false 
      });
    }
  },

  clearSearch: () => {
    latestSearchRequest += 1;
    set({ 
      searchQuery: "", 
      searchResults: [], 
      artistResults: [],
      albumResults: [],
      playlistResults: [],
      isLoading: false, 
      error: null 
    });
  },

  clearSuggestions: () => {
    set({ 
      suggestions: {
        songs: [],
        artists: [],
        albums: [],
        playlists: [],
        popular: [],
      }
    });
  },

  loadSearchHistory: async () => {
    try {
      const { data } = await axiosInstance.get("/search/history", {
        params: { limit: 50 },
      });
      set({ searchHistory: data.history || [] });
    } catch (error) {
      console.error("Load search history error:", error);
    }
  },

  addToSearchHistory: async (entry: SearchHistoryEntry) => {
    try {
      await axiosInstance.post("/search/history", entry);
      // Refresh history
      get().loadSearchHistory();
    } catch (error) {
      console.error("Add to search history error:", error);
    }
  },

  clearSearchHistory: async () => {
    try {
      await axiosInstance.delete("/search/history");
      set({ searchHistory: [] });
    } catch (error) {
      console.error("Clear search history error:", error);
    }
  },

  deleteSearchHistoryEntry: async (id: string) => {
    try {
      await axiosInstance.delete(`/search/history/${id}`);
      get().loadSearchHistory();
    } catch (error) {
      console.error("Delete search history entry error:", error);
    }
  },

  loadSavedSearches: async () => {
    try {
      const { data } = await axiosInstance.get("/search/saved", {
        params: { limit: 50 },
      });
      set({ savedSearches: data.searches || [] });
    } catch (error) {
      console.error("Load saved searches error:", error);
    }
  },

  createSavedSearch: async (name: string, query: string, filters: SearchFilters, notifyOnNewResults: boolean) => {
    try {
      const { data } = await axiosInstance.post("/search/saved", {
        name,
        query,
        filters,
        notifyOnNewResults,
      });
      get().loadSavedSearches();
      return data.search;
    } catch (error) {
      console.error("Create saved search error:", error);
      throw error;
    }
  },

  updateSavedSearch: async (id: string, updates: Partial<SavedSearch>) => {
    try {
      await axiosInstance.patch(`/search/saved/${id}`, updates);
      get().loadSavedSearches();
    } catch (error) {
      console.error("Update saved search error:", error);
      throw error;
    }
  },

  deleteSavedSearch: async (id: string) => {
    try {
      await axiosInstance.delete(`/search/saved/${id}`);
      get().loadSavedSearches();
    } catch (error) {
      console.error("Delete saved search error:", error);
    }
  },

  loadFilterOptions: async () => {
    try {
      const { data } = await axiosInstance.get("/search/filters");
      set({ filterOptions: data });
    } catch (error) {
      console.error("Load filter options error:", error);
    }
  },

  searchWithinPlaylist: async (playlistId: string, query: string) => {
    try {
      const { data } = await axiosInstance.get(`/search/playlist/${playlistId}`, {
        params: { q: query },
      });
      return data.songs || [];
    } catch (error) {
      console.error("Search within playlist error:", error);
      return [];
    }
  },

  searchWithinAlbum: async (albumId: string, query: string) => {
    try {
      const { data } = await axiosInstance.get(`/search/album/${albumId}`, {
        params: { q: query },
      });
      return data.songs || [];
    } catch (error) {
      console.error("Search within album error:", error);
      return [];
    }
  },
}));
