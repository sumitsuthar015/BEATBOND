import { axiosInstance } from "@/lib/axios";
import { Album, Song, Stats } from "@/types";
import toast from "react-hot-toast";
import { create } from "zustand";
import { cacheHomeShelf, getCachedHomeShelf } from "@/lib/offlineLibrary";
import { usePlayerStore } from "./usePlayerStore";

// Add Artist type
export interface Artist {
	id: string;
	name: string;
	role: string;
	image: Array<{ quality: string; url: string }>;
	imageUrl: string;
	type: string;
	url: string;
	// Attached by fetchArtists/searchArtistWithTrending so the homepage can
	// render and play an artist's trending tracks without a second fetch.
	topSongs?: Song[];
}

// Add ArtistDetail type for individual artist page
export interface ArtistDetail {
	id: string;
	name: string;
	image: Array<{ quality: string; url: string }>;
	followerCount?: number;
	fanCount?: string;
	isVerified?: boolean;
	dominantLanguage?: string;
	dominantType?: string;
	bio?: string;
	topSongs?: Song[];
	topAlbums?: Album[];
	hasMoreSongs?: boolean;
}

interface MusicStore {
	songs: Song[];
	albums: Album[];
	isLoading: boolean;
	// Dedicated loading flag just for fetchAlbums, so components that only
	// care about album-loading state (e.g. sidebars) don't re-render every
	// time an unrelated fetch (songs, stats, artists, etc) flips the
	// shared `isLoading` flag.
	albumsLoading: boolean;
	// Dedicated flags for the artist-related fetches, for the same reason
	// as albumsLoading: so unrelated fetches elsewhere don't cause spurious
	// loading flicker on the Home page's artist rail or the Artist page.
	artistsLoading: boolean;
	artistDetailLoading: boolean;
	error: string | null;
	currentAlbum: Album | null;
	featuredSongs: Song[];
	madeForYouSongs: Song[];
	trendingSongs: Song[];
	likedSongs: Song[];
	stats: Stats;
	madeForYouAlbums: Album[];
	madeForYouAlbumsId: string[];
	artists: Artist[];
	currentArtist: ArtistDetail | null;
	artistSongsPage: number;
	artistSongsHasMore: boolean;
	artistSongsLoadingMore: boolean;

	fetchAlbums: () => Promise<void>;
	fetchAlbumById: (id: string) => Promise<void>;
	fetchFeaturedSongs: (force?: boolean) => Promise<void>;
	fetchMadeForYouSongs: (force?: boolean) => Promise<void>;
	fetchTrendingSongs: (force?: boolean) => Promise<void>;
	fetchLikedSongs: () => Promise<void>;
	fetchStats: () => Promise<void>;
	fetchSongs: () => Promise<void>;
	deleteSong: (id: string) => Promise<void>;
	deleteAlbum: (id: string) => Promise<void>;
	fetchMadeForYouAlbums: (force?: boolean) => Promise<void>;
	fetchMadeForYouAlbumsId: () => Promise<void>;
	toggleLike: (id: string, song?: Song) => Promise<void>;
	fetchArtists: (force?: boolean) => Promise<void>;
	fetchArtistById: (id: string) => Promise<void>;
	loadMoreArtistSongs: (id: string) => Promise<void>;
	// Used by the Topbar search: resolves a typed name to a real, verified
	// artist plus a handful of their trending songs, or null if nothing
	// confident was found (so the UI never shows a random/unknown artist).
	searchArtistWithTrending: (query: string) => Promise<{ artist: Artist; topSongs: Song[] } | null>;
}

// ---------------------------------------------------------------------------
// Shared Saavn helpers used by fetchArtists / fetchArtistById /
// searchArtistWithTrending. Centralized here so the "don't show unknown
// artists" and "always try to have playable songs" logic lives in one place
// instead of being duplicated (and drifting) across call sites.
// ---------------------------------------------------------------------------

// axiosInstance applies VITE_API_URL in production and the local API origin in
// development. Keep this path relative to its /api base URL.
const SAAVN_BASE = "/saavn";
type HomeShelf = "featured" | "made-for-you" | "trending";
const homeShelfRequests = new Map<HomeShelf, Promise<Song[]>>();
const likeRequests = new Map<string, Promise<void>>();
const MADE_FOR_YOU_ALBUMS_CACHE_KEY = "beatbond:made-for-you-albums";

const readCachedAlbums = (): Album[] => {
	try {
		const value = localStorage.getItem(MADE_FOR_YOU_ALBUMS_CACHE_KEY);
		const parsed = value ? JSON.parse(value) : [];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

const cacheAlbums = (albums: Album[]) => {
	try { localStorage.setItem(MADE_FOR_YOU_ALBUMS_CACHE_KEY, JSON.stringify(albums)); } catch { /* Storage is optional. */ }
};

const normalizeAlbum = (album: any): Album => ({
	_id: String(album?._id || album?.id || ""),
	id: String(album?.id || album?._id || ""),
	name: album?.name || album?.title || "Untitled album",
	title: album?.title || album?.name || "Untitled album",
	description: album?.description || "",
	year: Number(album?.year || album?.releaseYear) || new Date().getFullYear(),
	image: Array.isArray(album?.image) ? album.image : [],
	imageUrl: album?.imageUrl || album?.image?.[2]?.url || album?.image?.[0]?.url || "/default-image.png",
	url: album?.url || "",
	songCount: Number(album?.songCount) || 0,
	artist: album?.artist || album?.artists?.primary?.[0]?.name || album?.artists?.all?.[0]?.name || "Various Artists",
	releaseYear: Number(album?.releaseYear || album?.year) || undefined,
	songs: Array.isArray(album?.songs) ? album.songs : [],
});


const normalizeName = (value: string) =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s]/g, "");

// Loose bidirectional match: catches "King" vs "King (Punjabi)" style
// variations while still rejecting names that aren't actually related.
const namesLooselyMatch = (a: string, b: string) => {
	const na = normalizeName(a || "");
	const nb = normalizeName(b || "");
	if (!na || !nb) return false;
	return na === nb || na.includes(nb) || nb.includes(na);
};

const safeFetchJson = async (url: string): Promise<any | null> => {
	try {
		const { data } = await axiosInstance.get(url);
		return data;
	} catch (err) {
		console.error(`Saavn request failed: ${url}`, err);
		return null;
	}
};

const fetchHomeShelf = async (path: "/songs/featured" | "/songs/made-for-you" | "/songs/trending", shelf: HomeShelf, force = false): Promise<Song[]> => {
  const cached = getCachedHomeShelf(shelf);
  // Render previously loaded shelves instantly on refresh. A forced refresh
  // still bypasses this cache, while an offline user remains fully usable.
  if (cached && !force) return cached;
  if (!navigator.onLine && cached) return cached;

  const inFlight = homeShelfRequests.get(shelf);
  if (inFlight) return inFlight;

  const request = axiosInstance.get<Song[]>(path)
    .then(({ data }) => {
      cacheHomeShelf(shelf, data);
      return data;
    })
    .catch((error) => {
      if (cached) return cached;
      throw error;
    })
    .finally(() => homeShelfRequests.delete(shelf));
  homeShelfRequests.set(shelf, request);
  return request;
};

const searchArtistsRaw = async (query: string): Promise<any[]> => {
	const data = await safeFetchJson(`${SAAVN_BASE}/search/artists?query=${encodeURIComponent(query)}`);
	return data?.data?.results || [];
};

const fetchArtistDetailRaw = async (id: string): Promise<any | null> => {
	const data = await safeFetchJson(`${SAAVN_BASE}/artists/${id}`);
	return data?.data || null;
};

const fetchArtistSongsRaw = async (id: string): Promise<any[]> => {
	const data = await safeFetchJson(`${SAAVN_BASE}/artists/${id}/songs?page=1&limit=100&sortBy=popularity&sortOrder=desc`);
	return data?.data?.songs || data?.data?.results || [];
};

const searchSongsRaw = async (query: string): Promise<any[]> => {
	const data = await safeFetchJson(`${SAAVN_BASE}/search/songs?query=${encodeURIComponent(query)}`);
	return data?.data?.results || [];
};

// Maps a raw Saavn song object into this app's Song shape. Picks the
// highest-quality entry in downloadUrl (the last one) instead of assuming a
// fixed index, since not every song has all 5 quality tiers.
const mapSaavnSong = (song: any): Song => {
	const downloadUrls: Array<{ quality: string; url: string }> = song.downloadUrl || [];
	// The API commonly returns 320, 160, then 96 kbps. Do not assume array
	// order: the final entry is often the legacy web stream that fails in some
	// browsers, while the AAC stream is the reliable default.
	const bestUrl = downloadUrls.find((item) => item?.quality === "320kbps")?.url
		|| downloadUrls.find((item) => item?.quality === "160kbps")?.url
		|| downloadUrls[0]?.url
		|| "";
	const audioFallbackUrls = downloadUrls
		.map((item) => item?.url)
		.filter((url): url is string => typeof url === "string" && Boolean(url) && url !== bestUrl);
	const title =
		song.name ||
		song.title ||
		song.song ||
		song.songName ||
		song.more_info?.song ||
		song.moreInfo?.song ||
		"Unknown Song";

	return {
		_id: song.id,
		title,
		artist:
			song.artists?.primary?.[0]?.name ||
			song.artists?.all?.[0]?.name ||
			"Unknown Artist",
		imageUrl: song.image?.[2]?.url || song.image?.[1]?.url || song.image?.[0]?.url || "",
		audioUrl: bestUrl,
		audioFallbackUrls,
		duration: Number(song.duration) || 0,
		lyricsId: String(song.lyricsId || ""),
		albumId: song.album?.id || null,
		albumName: song.album?.name || null,
	} as unknown as Song;
};

// The artist API may return duplicate entries from overlapping result sets.
// Use both the stable ID and a title/artist fallback because legacy responses
// occasionally assign different IDs to the same track.
const uniqueArtistSongs = (songs: Song[]): Song[] => {
	const seenIds = new Set<string>();
	const seenTracks = new Set<string>();

	return songs.filter((song) => {
		const id = String(song._id || "").trim();
		const trackKey = `${String(song.title || "").trim().toLowerCase()}::${String(song.artist || "").trim().toLowerCase()}`;
		if ((id && seenIds.has(id)) || (trackKey !== "::" && seenTracks.has(trackKey))) return false;
		if (id) seenIds.add(id);
		if (trackKey !== "::") seenTracks.add(trackKey);
		return true;
	});
};

const rawSongIsCreditedToArtist = (song: any, artistName: string, artistId: string) => {
	const artists = [...(song.artists?.primary || []), ...(song.artists?.all || [])];
	const names = [
		...artists.map((artist: any) => artist?.name || artist?.title || ""),
		song.artist,
		song.primary_artists,
		song.more_info?.primary_artists,
	].filter(Boolean);
	const normalizedArtist = artistName.trim().toLowerCase();

	return artists.some((artist: any) => String(artist?.id || artist?.artistId || "") === artistId) ||
		names.some((name: string) => name.split(/,|&| feat\.? /i).some((part) => part.trim().toLowerCase() === normalizedArtist));
};

// Artist album responses are inconsistent between the search and legacy
// JioSaavn endpoints, so normalize every known field shape before rendering.
const mapArtistAlbum = (album: any, fallbackArtist: string): Album | null => {
	const id = album?.id || album?.albumId || album?.albumid || album?._id;
	if (!id) return null;
	const image = album.image || album.images || album.imageUrl;
	const imageUrl =
		(Array.isArray(image) ? image[2]?.url || image[1]?.url || image[0]?.url : image) ||
		"/default-image.png";
	const artist =
		album.artists?.primary?.map((item: any) => item.name).filter(Boolean).join(", ") ||
		album.artist ||
		album.primary_artists ||
		album.primaryArtists ||
		fallbackArtist;
	const name = album.name || album.title || album.album || album.albumName || "Unknown Album";

	return {
		_id: String(id),
		id: String(id),
		name,
		title: name,
		imageUrl,
		image: Array.isArray(image) ? image : [],
		artist,
		year: Number(album.year || album.releaseYear) || new Date().getFullYear(),
		songCount: Number(album.songCount || album.song_count) || 0,
		songs: [],
	};
};


// Given a typed-in or curated artist name, finds a real, verified/popular
// match on Saavn (never a random loose match) and a handful of their songs
// -- trying the dedicated songs endpoint first, and falling back to a
// filtered song search if that endpoint comes back empty (it does for some
// artist IDs, confirmed while testing).
const resolvedArtistCache = new Map<string, { artist: Artist; topSongs: Song[] } | null>();

const resolveArtistWithSongs = async (
	query: string
): Promise<{ artist: Artist; topSongs: Song[] } | null> => {
	const cacheKey = query.toLowerCase().trim();
	if (resolvedArtistCache.has(cacheKey)) {
		return resolvedArtistCache.get(cacheKey)!;
	}

	const candidates = await searchArtistsRaw(query);

	const nameMatches = candidates.filter((c: any) => {
		const hasRealImage = c.image?.[2]?.url && !c.image[2].url.includes("artist-default");
		return hasRealImage && namesLooselyMatch(c.name, query);
	});

	for (const candidate of nameMatches) {
		const detail = await fetchArtistDetailRaw(candidate.id);
		if (!detail) continue;

		// Popularity is not proof of identity. Keep only profiles that the
		// provider explicitly marks as verified.
		if (detail.isVerified !== true) continue;

		let rawSongs = await fetchArtistSongsRaw(candidate.id);

		if (rawSongs.length === 0) {
			const searchResults = await searchSongsRaw(detail.name);
			rawSongs = searchResults.filter((song: any) =>
				rawSongIsCreditedToArtist(song, detail.name, candidate.id)
			);
		}

		const topSongs = uniqueArtistSongs(rawSongs
			.filter((song: any) => rawSongIsCreditedToArtist(song, detail.name, candidate.id))
			.map(mapSaavnSong)
			.filter((song) => Boolean(song.audioUrl)))
			.slice(0, 15);
		// Never render an artist card/page that cannot actually play music.
		if (topSongs.length < 2) continue;

		const getBestImage = (image: any): string => {
			if (typeof image === "string") return image;
			if (Array.isArray(image)) {
				return image[2]?.url || image[1]?.url || image[0]?.url || (typeof image[0] === "string" ? image[0] : "") || "";
			}
			return image?.url || "";
		};

		const artist: Artist = {
			id: detail.id,
			name: detail.name,
			role: detail.dominantType || "Artist",
			image: detail.image || [],
			imageUrl: getBestImage(detail.image),
			type: detail.type || "artist",
			url: detail.url || "",
		};

		const result = { artist, topSongs };
		resolvedArtistCache.set(cacheKey, result);
		return result;
	}

	resolvedArtistCache.set(cacheKey, null);
	return null;
};

export const useMusicStore = create<MusicStore>((set, get) => ({
	albums: [],
	songs: [],
	isLoading: false,
	albumsLoading: false,
	artistsLoading: false,
	artistDetailLoading: false,
	error: null,
	currentAlbum: null,
	madeForYouSongs: [],
	featuredSongs: [],
	trendingSongs: [],
	likedSongs: [],
	madeForYouAlbums: [],
	madeForYouAlbumsId: [],
	artists: [],
	currentArtist: null,
	artistSongsPage: 1,
	artistSongsHasMore: false,
	artistSongsLoadingMore: false,
	stats: {
		totalSongs: 0,
		totalAlbums: 0,
		totalUsers: 0,
		totalArtists: 0,
	},

	fetchArtists: async (force = false) => {
		if (get().artistsLoading || (!force && get().artists.length > 0)) return;
		set({ artistsLoading: true, error: null });
		try {
			// The verified artist directory is the source of truth for this shelf.
			// Resolving only the trending-song credits hid curated approved artists
			// whenever Saavn lacked a standalone profile or a real profile image.
			const response = await safeFetchJson(`${SAAVN_BASE}/search/artists?limit=50`);
			const results = response?.data?.results || [];
			const artists: Artist[] = results
				.filter((artist: any) => artist?.isVerified && artist?.id && artist?.name)
				.map((artist: any) => ({
					id: String(artist.id),
					name: String(artist.name),
					role: "Artist",
					image: Array.isArray(artist.image) ? artist.image : [],
					imageUrl: artist.imageUrl || artist.image?.[2]?.url || artist.image?.[0]?.url || "/default-image.png",
					type: "artist",
					url: "",
					topSongs: [],
				}));
			set({ artists: artists.slice(0, 8) });
		} catch (err: any) {
			console.error("Error fetching artists:", err);
			set({ error: err.message });
			toast.error("Failed to fetch artists");
		} finally {
			set({ artistsLoading: false });
		}
	},

	searchArtistWithTrending: async (query: string) => {
		if (!query || query.trim().length === 0) return null;
		return resolveArtistWithSongs(query.trim());
	},

	fetchArtistById: async (id: string) => {
		set({ artistDetailLoading: true, artistSongsPage: 1, artistSongsHasMore: false, artistSongsLoadingMore: false, error: null });
		try {
			// Fetch artist details
			const { data: artistData } = await axiosInstance.get(`/saavn/artists/${encodeURIComponent(id)}`);
			if (artistData?.status !== "SUCCESS" || !artistData?.data) {
				throw new Error("Artist details are unavailable right now");
			}
			
			// The artist detail payload contains topSongs even when the
			// dedicated endpoint is empty (notably for several English artists).
			// Use it as a reliable fallback before doing a broad song search.
			const detailTopSongs = artistData?.data?.topSongs || [];
			// The details response already contains fully mapped songs. Avoid
			// calling the dedicated songs route unless the provider omitted them;
			// that route itself has to resolve artist details again.
			const endpointSongs = detailTopSongs.length ? [] : await fetchArtistSongsRaw(id);
			let rawSongs = [...detailTopSongs, ...endpointSongs].filter(
				(song, index, all) => all.findIndex((item) => item?.id === song?.id) === index
			);

			// Some artist IDs come back with an empty songs list from the
			// dedicated endpoint (confirmed while testing) -- fall back to
			// searching by name and keeping only songs actually credited to
			// this artist, so the page never ends up with zero playable songs.
			if (rawSongs.length === 0 && artistData?.data?.name) {
				const searchResults = await searchSongsRaw(artistData.data.name);
				rawSongs = searchResults.filter((s: any) =>
					(s.artists?.primary || s.artists?.all || []).some((a: any) => a.id === id)
				);
			}

			// Provider artist pages can contain noisy related tracks. Keep only
			// songs whose artist credit contains this exact artist ID or name.
			const creditedSongs = rawSongs.filter((song: any) =>
				rawSongIsCreditedToArtist(song, artistData.data.name, id)
			);
			let fetchedSongs = uniqueArtistSongs(creditedSongs.map(mapSaavnSong).filter((song) => Boolean(song.audioUrl)));
			if (fetchedSongs.length < 50 && artistData?.data?.name) {
				const searchResults = await searchSongsRaw(artistData.data.name);
				const additionalSongs = searchResults
					.filter((song: any) => rawSongIsCreditedToArtist(song, artistData.data.name, id))
					.map(mapSaavnSong)
					.filter((song) => Boolean(song.audioUrl));
				fetchedSongs = uniqueArtistSongs([...fetchedSongs, ...additionalSongs]);
			}
			// The home card is admitted only after its hits were verified playable.
			// Reuse those hits if the detail endpoint is temporarily incomplete.
			const cachedSongs = get().artists.find((artist) => artist.id === id)?.topSongs || [];
			const topSongs = uniqueArtistSongs(fetchedSongs.length ? fetchedSongs : cachedSongs);

			// Artist details include albums too. Reuse them to avoid another
			// expensive provider lookup; request the albums route only as fallback.
			let rawAlbumList = artistData?.data?.topAlbums || [];
			if (!rawAlbumList.length) {
				const albumsData = await safeFetchJson(`${SAAVN_BASE}/artists/${encodeURIComponent(id)}/albums`);
				rawAlbumList = albumsData?.data?.albums || albumsData?.data?.results || (Array.isArray(albumsData?.data) ? albumsData.data : []);
			}
			let topAlbums = rawAlbumList
				.slice(0, 12)
				.map((album: any) => mapArtistAlbum(album, artistData?.data?.name || "Unknown Artist"))
				.filter((album: Album | null): album is Album => Boolean(album));

			if (topAlbums.length === 0 && artistData?.data?.topAlbums?.length) {
				topAlbums = artistData.data.topAlbums
					.slice(0, 12)
					.map((album: any) => mapArtistAlbum(album, artistData.data.name || "Unknown Artist"))
					.filter((album: Album | null): album is Album => Boolean(album));
			}

			if (topAlbums.length === 0 && artistData?.data?.name) {
				const searchAlbumData = await safeFetchJson(`${SAAVN_BASE}/search/albums?query=${encodeURIComponent(artistData.data.name)}`);
				if (searchAlbumData?.data?.results?.length) {
					topAlbums = searchAlbumData.data.results
						.slice(0, 12)
						.map((album: any) => mapArtistAlbum(album, artistData.data.name || "Unknown Artist"))
						.filter((album: Album | null): album is Album => Boolean(album));
				}
			}
			
			const artist: ArtistDetail = {
				id: artistData.data.id,
				name: artistData.data.name,
				image: artistData.data.image || [],
				followerCount: artistData.data.followerCount,
				fanCount: artistData.data.fanCount,
				isVerified: artistData.data.isVerified,
				dominantLanguage: artistData.data.dominantLanguage,
				dominantType: artistData.data.dominantType,
				bio: typeof artistData.data.bio === "string" ? artistData.data.bio.trim() : "",
				topSongs,
				topAlbums,
				hasMoreSongs: Boolean(artistData.data.hasMoreSongs || artistData.data.hasMore || topSongs.length >= 50),
			};

			set({ currentArtist: artist, artistSongsHasMore: Boolean(artist.hasMoreSongs) });
		} catch (err: any) {
			console.error("Error fetching artist details:", err);
			set({ error: err.message });
			toast.error("Failed to fetch artist details");
		} finally {
			set({ artistDetailLoading: false });
		}
	},
	loadMoreArtistSongs: async (id: string) => {
		const { currentArtist, artistSongsPage, artistSongsHasMore, artistSongsLoadingMore } = get();
		if (!currentArtist || currentArtist.id !== id || !artistSongsHasMore || artistSongsLoadingMore) return;
		set({ artistSongsLoadingMore: true });
		try {
			const page = artistSongsPage + 1;
			const { data } = await axiosInstance.get(`/saavn/artists/${encodeURIComponent(id)}/songs`, { params: { page, limit: 50 } });
			const payload = data?.data || {};
			const moreSongs = (payload.songs || payload.results || [])
				.filter((song: any) => rawSongIsCreditedToArtist(song, currentArtist.name, id))
				.map(mapSaavnSong)
				.filter((song: Song) => Boolean(song.audioUrl));
			const latestArtist = get().currentArtist;
			if (!latestArtist || latestArtist.id !== id) return;
			set({
				currentArtist: { ...latestArtist, topSongs: uniqueArtistSongs([...(latestArtist.topSongs || []), ...moreSongs]) },
				artistSongsPage: page,
				artistSongsHasMore: Boolean(payload.hasMore),
			});
		} catch (err: any) {
			console.error("Error loading more artist songs:", err);
			toast.error("Could not load more songs. Please try again.");
		} finally {
			set({ artistSongsLoadingMore: false });
		}
	},

	fetchMadeForYouAlbums: async (force = false) => {
		if (!force && get().madeForYouAlbums.length > 0) return;
		const cachedAlbums = readCachedAlbums();
		if (!force && cachedAlbums.length) {
			set({ madeForYouAlbums: cachedAlbums });
		}
		set({ isLoading: true });
		try {
			const currentYear = new Date().getFullYear();
			if (!get().trendingSongs.length) await get().fetchTrendingSongs();
			const chartSongs = get().trendingSongs;
			const chartAlbums: Album[] = [];
			const seenChartAlbums = new Set<string>();
			for (const song of chartSongs) {
				const id = String(song.albumId || "").trim();
				const name = String(song.albumName || song.albumTitle || "").trim();
				if (!id || !name || seenChartAlbums.has(id)) continue;
				seenChartAlbums.add(id);
				chartAlbums.push(normalizeAlbum({
					id,
					name,
					title: name,
					artist: song.artist,
					imageUrl: song.imageUrl,
					year: song.releaseYear || song.year,
					songCount: 0,
				}));
			}

			// Search by current chart artists and broad new-release terms so this
			// shelf can surface fresh real albums instead of one artist's backlist.
			const chartArtistQueries = [...new Set(chartSongs
				.flatMap((song) => String(song.artist || "").split(/,|&| feat\.? | featuring /i))
				.map((artist) => artist.trim())
				.filter((artist) => artist.length > 1))].slice(0, 3);
			const albumQueries = [...new Set([
				`new albums ${currentYear}`,
				`latest albums ${currentYear}`,
				...chartArtistQueries,
			])];
			const searchResults = await Promise.allSettled(albumQueries.map(async (query) => {
				const data = await safeFetchJson(`${SAAVN_BASE}/search/albums?query=${encodeURIComponent(query)}&limit=20`);
				return Array.isArray(data?.data?.results) ? data.data.results : [];
			}));
			const discovered = searchResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
			const searchedAlbums = discovered.map(normalizeAlbum).filter((album: Album) => Boolean(album.id));
			const uniqueAlbums = new Map<string, Album>();
			// Lead with a couple of chart albums, then mix in current search results
			// so the first screen includes both what's trending and recent releases.
			for (const album of chartAlbums.slice(0, 2)) uniqueAlbums.set(album.id, album);
			for (const album of searchedAlbums.sort((a, b) => (b.releaseYear || b.year || 0) - (a.releaseYear || a.year || 0))) {
				if (!uniqueAlbums.has(album.id)) uniqueAlbums.set(album.id, album);
			}
			for (const album of chartAlbums.slice(2)) if (!uniqueAlbums.has(album.id)) uniqueAlbums.set(album.id, album);

			// This endpoint has database and bundled fallbacks, so it keeps the
			// home page useful and retains the existing catalogue when search is down.
			const { data: fallback } = await axiosInstance.get<Album[]>("/albums");
			const albums = (fallback || []).map(normalizeAlbum).filter((album) => Boolean(album.id));
			for (const album of albums) if (!uniqueAlbums.has(album.id)) uniqueAlbums.set(album.id, album);
			const mergedAlbums = [...uniqueAlbums.values()];
			if (mergedAlbums.length) {
				cacheAlbums(mergedAlbums);
				set({ madeForYouAlbums: mergedAlbums, error: null });
				return;
			}
			if (!cachedAlbums.length) set({ error: "Albums are temporarily unavailable" });
		} catch (err: any) {
			// Preserve cached albums and do not show a disruptive toast for a
			// background catalogue refresh failure.
			if (!cachedAlbums.length) set({ error: err?.message || "Albums are temporarily unavailable" });
			console.warn("Made For You album refresh failed; keeping cached content.", err);
		} finally {
			set({ isLoading: false });
		}
	},

	fetchMadeForYouAlbumsId: async () => {
		const state = get();
		const ids = state.madeForYouAlbums.map((album) => album.id || album._id);
		set({ madeForYouAlbumsId: ids });
	},

	fetchLikedSongs: async () => {
		try {
			const response = await axiosInstance.get('/songs/liked');
			set({ likedSongs: response.data });
		} catch (error) {
			console.error('Error fetching liked songs:', error);
			toast.error('Failed to fetch liked songs');
		}
	},

	toggleLike: (id, suppliedSong) => {
		const existingRequest = likeRequests.get(id);
		if (existingRequest) return existingRequest;

		const state = get();
		const currentSong = usePlayerStore.getState().currentSong;
		const song = suppliedSong
			|| state.songs.find((item) => item._id === id)
			|| state.featuredSongs.find((item) => item._id === id)
			|| state.madeForYouSongs.find((item) => item._id === id)
			|| state.trendingSongs.find((item) => item._id === id)
			|| state.likedSongs.find((item) => item._id === id)
			|| (currentSong?._id === id ? currentSong : undefined);
		const currentlyLiked = state.likedSongs.some((item) => item._id === id) || Boolean(song?.isLiked);
		const desiredLiked = !currentlyLiked;

		const request = (async () => {
			try {
				const response = await axiosInstance.post(`/songs/${encodeURIComponent(id)}/toggle-like`, {
					isLiked: desiredLiked,
					song: song ? {
						_id: song._id,
						title: song.title,
						artist: song.artist,
						imageUrl: song.imageUrl,
						audioUrl: song.audioUrl,
						duration: song.duration,
						albumId: song.albumId,
						albumName: song.albumName,
						genre: song.genre,
						language: song.language,
					} : undefined,
				});
				const updatedSong = { ...(song || {}), ...response.data, _id: id } as Song;
				set((current) => {
					const updateList = (list: Song[]) => list.map((item) => item._id === id ? { ...item, isLiked: response.data.isLiked, userId: response.data.userId } : item);
					const likedSongs = response.data.isLiked
						? [...current.likedSongs.filter((item) => item._id !== id), updatedSong]
						: current.likedSongs.filter((item) => item._id !== id);
					return {
						songs: updateList(current.songs),
						featuredSongs: updateList(current.featuredSongs),
						madeForYouSongs: updateList(current.madeForYouSongs),
						trendingSongs: updateList(current.trendingSongs),
						likedSongs,
					};
				});
				if (currentSong?._id === id) usePlayerStore.getState().setCurrentSongLiked(response.data.isLiked);
				toast.success(response.data.isLiked ? "Added to Liked Songs" : "Removed from Liked Songs");
			} catch (error: any) {
				console.error("Error toggling like:", error);
				toast.error(error.response?.data?.message || "Could not update the like. Please try again.");
			} finally {
				likeRequests.delete(id);
			}
		})();
		likeRequests.set(id, request);
		return request;
	},

	deleteSong: async (id) => {
		set({ isLoading: true, error: null });
		try {
			await axiosInstance.delete(`/admin/songs/${id}`);

			set((state) => ({
				songs: state.songs.filter((song) => song._id !== id),
			}));
			toast.success("Song deleted successfully");
		} catch (error: any) {
			console.log("Error in deleteSong", error);
			toast.error("Error deleting song");
		} finally {
			set({ isLoading: false });
		}
	},
	deleteAlbum: async (id) => {
		try {
			await axiosInstance.delete(`/admin/albums/${id}`);
			// The server deletes the album's songs too, so drop them locally as well.
			set((state) => ({
				albums: state.albums.filter((album) => album._id !== id),
				songs: state.songs.filter((song) => song.albumId !== id),
			}));
			toast.success("Album deleted successfully");
		} catch (error: any) {
			console.log("Error in deleteAlbum", error);
			toast.error(error.response?.data?.message || "Error deleting album");
			throw error;
		}
	},

	fetchSongs: async () => {
		set({ isLoading: true, error: null });
		try {
			const response = await axiosInstance.get("/songs");
			set({ songs: response.data });
		} catch (error: any) {
			set({ error: error.message });
		} finally {
			set({ isLoading: false });
		}
	},

	fetchStats: async () => {
		set({ isLoading: true, error: null });
		try {
			const response = await axiosInstance.get("/stats");
			set({ stats: response.data });
		} catch (error: any) {
			set({ error: error.message });
		} finally {
			set({ isLoading: false });
		}
	},

	fetchAlbums: async () => {
		set({ albumsLoading: true, error: null });

		try {
			const response = await axiosInstance.get("/albums");
			if (response && response.data) {
				set({ albums: response.data });
			} else {
				set({ albums: [], error: "No data received from server" });
			}
		} catch (error: any) {
			const errorMessage = error.response?.data?.message || error.message || "Failed to fetch albums";
			set({ albums: [], error: errorMessage });
			console.error("Error fetching albums:", error);
		} finally {
			set({ albumsLoading: false });
		}
	},

	fetchAlbumById: async (id) => {
		set({ isLoading: true, error: null });
		try {
			const response = await axiosInstance.get(`/albums/${id}`);
			set({ currentAlbum: response.data });
		} catch (error: any) {
			set({ error: error.response?.data?.message || error.message });
		} finally {
			set({ isLoading: false });
		}
	},

	fetchFeaturedSongs: async (force = false) => {
		if (!force && get().featuredSongs.length > 0) return;
		if (force && !get().featuredSongs.length) {
			const cached = getCachedHomeShelf("featured");
			if (cached?.length) set({ featuredSongs: cached });
		}
		set({ isLoading: true, error: null });
		try {
			const songs = await fetchHomeShelf("/songs/featured", "featured", force);
			set({ featuredSongs: songs });
			if (songs.length) usePlayerStore.getState().initializeDefaultSong(songs);
		} catch (error: any) {
			set({ error: error.response?.data?.message || error.message });
		} finally {
			set({ isLoading: false });
		}
	},

	fetchMadeForYouSongs: async (force = false) => {
		if (!force && get().madeForYouSongs.length > 0) return;
		if (force && !get().madeForYouSongs.length) {
			const cached = getCachedHomeShelf("made-for-you");
			if (cached?.length) set({ madeForYouSongs: cached });
		}
		set({ isLoading: true, error: null });
		try {
			const songs = await fetchHomeShelf("/songs/made-for-you", "made-for-you", force);
			set({ madeForYouSongs: songs });
			if (songs.length) usePlayerStore.getState().initializeDefaultSong(songs);
		} catch (error: any) {
			set({ error: error.response?.data?.message || error.message });
		} finally {
			set({ isLoading: false });
		}
	},

	fetchTrendingSongs: async (force = false) => {
		if (!force && get().trendingSongs.length > 0) return;
		set({ isLoading: true, error: null });
		const cached = getCachedHomeShelf("trending");
		if (cached?.length && !get().trendingSongs.length) set({ trendingSongs: cached });
		try {
			// Always ask the backend for the current provider chart on a fresh app
			// load; the persistent offline shelf is a fallback only, not the source
			// of today's trending order.
			const { data } = await axiosInstance.get<any[]>("/songs/trending");
			const songs = (Array.isArray(data) ? data : []).map(mapSaavnSong).filter((song) => Boolean(song._id && song.audioUrl));
			cacheHomeShelf("trending", songs);
			set({ trendingSongs: songs });
			if (songs.length) usePlayerStore.getState().initializeDefaultSong(songs);
		} catch (error: any) {
			if (cached?.length) set({ trendingSongs: cached });
			else set({ error: error.response?.data?.message || error.message });
		} finally {
			set({ isLoading: false });
		}
	},
}));
