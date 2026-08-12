import { Album, Song } from "@/types";
import { axiosInstance } from "@/lib/axios";

// Retained for legacy browser helpers. New API requests below use
// axiosInstance so they honour VITE_API_URL in a separately hosted frontend.
export const SAAVN_API_BASE = "/api/saavn";

const searchCache = new Map<string, { expiresAt: number; request: Promise<any[]> }>();
const SEARCH_CACHE_MS = 5 * 60 * 1000;

/** Deduplicated, short-lived Saavn song search used by every search surface. */
const searchSaavn = async (type: "songs" | "artists" | "albums", query: string, limit: number) => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const key = `${type}:${normalizedQuery.toLowerCase()}:${limit}`;
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.request;

  // Never use a browser-relative `/api` path for search. It works through
  // Vite's local proxy, but a separately hosted frontend would query its own
  // host after deployment and silently fall back to a different catalogue.
  const request = axiosInstance.get(`/saavn/search/${type}`, {
    params: { query: normalizedQuery, limit },
  })
    .then((response) => response.data?.data?.results || response.data?.data || [])
    .catch((error) => {
      searchCache.delete(key);
      throw error;
    });

  searchCache.set(key, { expiresAt: Date.now() + SEARCH_CACHE_MS, request });
  return request;
};

export const searchSaavnSongs = (query: string, limit = 50) => searchSaavn("songs", query, limit);
export const searchSaavnArtists = (query: string, limit = 10) => searchSaavn("artists", query, limit);
export const searchSaavnAlbums = (query: string, limit = 20) => searchSaavn("albums", query, limit);

export type SaavnCatalogueSearch = {
  query: string;
  intent: "artist" | "song" | "album" | "general";
  songs: any[];
  artists: any[];
  albums: any[];
};

/** One normalized, ranked JioSaavn search response for the main search UI. */
export const searchSaavnCatalogue = async (query: string, limit = 30): Promise<SaavnCatalogueSearch> => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return { query: "", intent: "general", songs: [], artists: [], albums: [] };
  try {
    const response = await axiosInstance.get("/saavn/search", { params: { query: normalizedQuery, limit } });
    return response.data?.data || { query: normalizedQuery, intent: "general", songs: [], artists: [], albums: [] };
  } catch {
    // A deployed frontend can briefly be newer than its backend. Keep search
    // working against the established individual endpoints during that window.
    const [songs, artists, albums] = await Promise.all([
      searchSaavn("songs", normalizedQuery, limit),
      searchSaavn("artists", normalizedQuery, 10),
      searchSaavn("albums", normalizedQuery, 20),
    ]);
    return { query: normalizedQuery, intent: "general", songs, artists, albums };
  }
};

export const TRENDING_ARTIST_NAMES = [
  "Arijit Singh",
  "Pritam",
  "Shreya Ghoshal",
  "A. R. Rahman",
  "Vishal-Shekhar",
  "Amit Trivedi",
  "Sonu Nigam",
  "Jubin Nautiyal",
  "Taylor Swift",
  "Ed Sheeran",
  "The Weeknd",
  "Dua Lipa",
  "Billie Eilish",
  "Justin Bieber",
  "Ariana Grande",
  "Drake",
];

const normalise = (value: string) =>
  value
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const decodeText = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

export const isSameArtistName = (candidate: string, expected: string) => {
  const left = normalise(candidate);
  const right = normalise(expected);

  return left === right || left.includes(right) || right.includes(left);
};

export const getImageUrl = (image?: Array<{ url?: string }>) =>
  image?.[2]?.url || image?.[1]?.url || image?.[0]?.url || "";

export const getBestAudioUrl = (
  downloadUrl?: Array<{ quality?: string; url?: string }>
) =>
  downloadUrl?.find((item) => item?.quality === "320kbps")?.url ||
  downloadUrl?.find((item) => item?.quality === "160kbps")?.url ||
  downloadUrl?.[4]?.url ||
  downloadUrl?.[3]?.url ||
  downloadUrl?.[0]?.url ||
  "";

const VERSION_PATTERNS = [
  /\bremix\b/i,
  /\blo-?fi\b/i,
  /\bslowed\b/i,
  /\breverb\b/i,
  /\bsped\s*up\b/i,
  /\bspeed\s*up\b/i,
  /\bnightcore\b/i,
  /\bcover\b/i,
  /\bkaraoke\b/i,
  /\binstrumental\b/i,
  /\bunplugged\b/i,
  /\bacoustic\b/i,
  /\brepris(?:e|ed)\b/i,
  /\bredux\b/i,
  /\bmashup\b/i,
  /\bremake\b/i,
  /\bclub\s*mix\b/i,
  /\bdj\s*mix\b/i,
  /\bradio\s*edit\b/i,
  /\bversion\b/i,
  /\bfrom\s+["“]/i,
];

const COLLECTION_PATTERNS = [
  /\bbest\s*of\b/i,
  /\bcollection\b/i,
  /\bclassics?\b/i,
  /\bhits?\b/i,
  /\btop\s+\d+/i,
  /\bromantic\b/i,
  /\btimeless\b/i,
];

const canonicalTitle = (title: string) =>
  decodeText(title)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+-\s+.*$/g, " ")
    .replace(/\b(from|remix|lofi|slowed|reverb|version|reprised|reprise)\b.*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();

const hasVersionText = (value = "") =>
  VERSION_PATTERNS.some((pattern) => pattern.test(decodeText(value)));

const hasCollectionText = (value = "") =>
  COLLECTION_PATTERNS.some((pattern) => pattern.test(decodeText(value)));

export const getPrimaryArtistName = (song: any) => {
  const primary =
    song?.artists?.primary
      ?.map((artist: { name?: string }) => artist.name)
      .filter(Boolean)
      .join(", ") ||
    song?.artists?.all
      ?.map((artist: { name?: string }) => artist.name)
      .filter(Boolean)
      .join(", ") ||
    song?.primaryArtists ||
    song?.artist ||
    "";

  return primary && primary !== "NULL" ? decodeText(primary) : "";
};

export const isSaavnSongByArtist = (song: any, artistName: string) => {
  const artists = [
    ...(song?.artists?.primary || []),
    ...(song?.artists?.featured || []),
    ...(song?.artists?.all || []),
  ];

  return artists.some((artist: { name?: string }) =>
    isSameArtistName(artist.name || "", artistName)
  );
};

export const getCleanArtistSongs = (
  songs: any[],
  artistName: string,
  limit = 12
): Song[] => {
  const ranked = songs
    .filter((song) => isSaavnSongByArtist(song, artistName))
    .map((song, index) => {
      const mapped = mapSaavnSong(song, artistName);
      if (!mapped) return null;

      const title = decodeText(String(song?.name || song?.title || ""));
      const albumName = decodeText(String(song?.album?.name || ""));
      const baseTitle = canonicalTitle(title) || title;
      const playCount = Number(song?.playCount) || 0;
      const primaryArtistMatch = (song?.artists?.primary || []).some((artist: { name?: string }) =>
        isSameArtistName(artist.name || "", artistName)
      );

      let score = 100000 - index;
      score += Math.min(playCount / 100000, 5000);
      if (primaryArtistMatch) score += 2000;
      if (normalise(title) === normalise(baseTitle)) score += 1500;
      if (hasVersionText(title)) score -= 4000;
      if (hasCollectionText(albumName)) score -= 2500;
      if (hasVersionText(albumName)) score -= 1500;

      return {
        key: normalise(baseTitle || mapped.title),
        mapped,
        score,
      };
    })
    .filter(Boolean) as Array<{ key: string; mapped: Song; score: number }>;

  const bestByTitle = new Map<string, { mapped: Song; score: number }>();

  for (const candidate of ranked) {
    const existing = bestByTitle.get(candidate.key);
    if (!existing || candidate.score > existing.score) {
      bestByTitle.set(candidate.key, {
        mapped: candidate.mapped,
        score: candidate.score,
      });
    }
  }

  return [...bestByTitle.values()]
    .sort((left, right) => right.score - left.score)
    .map((item) => item.mapped)
    .slice(0, limit);
};

export const mapSaavnSong = (song: any, fallbackArtist = ""): Song | null => {
  const audioUrl = getBestAudioUrl(song?.downloadUrl);
  const audioFallbackUrls = (song?.downloadUrl || [])
    .map((item: { url?: string }) => item?.url)
    .filter((url: unknown): url is string => typeof url === "string" && Boolean(url) && url !== audioUrl);
  const artist = getPrimaryArtistName(song) || fallbackArtist;
  const title = song?.name || song?.title;

  if (!song?.id || !title || !artist || !audioUrl) return null;

  return {
    _id: String(song.id),
    title: decodeText(String(title)),
    artist,
    genre: String(song.language || "Unknown"),
    videoUrl: null,
    playedAt: "",
    userId: undefined,
    imageUrl: getImageUrl(song.image) || "/default-image.png",
    audioUrl,
    audioFallbackUrls,
    albumId: String(song.album?.id || song.albumId || ""),
    albumName: decodeText(String(song.album?.name || song.albumName || "")),
    language: String(song.language || "Unknown"),
    releaseYear: Number(String(song.year || song.releaseDate || "").slice(0, 4)) || undefined,
    duration: parseInt(String(song.duration), 10) || 0,
    createdAt: String(song.releaseDate || ""),
    updatedAt: "",
    isLiked: false,
    lyrics: String(song.lyrics || ""),
    lyricsId: String(song.lyricsId || ""),
  };
};

export type SaavnArtistResult = {
  id: string;
  name: string;
  imageUrl: string;
  isVerified: boolean;
  followerCount?: number;
};

export type SaavnPlaylistResult = {
  id: string;
  name: string;
  imageUrl: string;
  description: string;
  songCount: number;
};

export const mapSaavnArtist = (artist: any): SaavnArtistResult | null => {
  if (!artist?.id || !(artist?.name || artist?.title)) return null;
  return {
    id: String(artist.id),
    name: decodeText(String(artist.name || artist.title)),
    imageUrl: getImageUrl(artist.image) || "/default-image.png",
    isVerified: Boolean(artist.isVerified),
    followerCount: Number(artist.followerCount) || undefined,
  };
};

export const mapSaavnAlbum = (album: any): Album | null => {
  if (!album?.id || !(album?.name || album?.title)) return null;
  return {
    _id: String(album.id),
    id: String(album.id),
    name: decodeText(String(album.name || album.title)),
    title: decodeText(String(album.name || album.title)),
    description: decodeText(String(album.description || "")),
    year: Number(album.year) || new Date().getFullYear(),
    image: album.image || [],
    imageUrl: getImageUrl(album.image) || "/default-image.png",
    url: album.url || "",
    songCount: Number(album.songCount) || 0,
    artist: getPrimaryArtistName(album) || "Various Artists",
    songs: [],
  };
};

export const mapSaavnPlaylist = (playlist: any): SaavnPlaylistResult | null => {
  if (!playlist?.id || !(playlist?.name || playlist?.title)) return null;
  return {
    id: String(playlist.id),
    name: decodeText(String(playlist.name || playlist.title)),
    imageUrl: getImageUrl(playlist.image) || "/default-image.png",
    description: decodeText(String(playlist.description || "")),
    songCount: Number(playlist.songCount) || 0,
  };
};
