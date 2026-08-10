import { Song } from "../models/song.model.js";
import { Album } from "../models/album.model.js";
import { Playlist } from "../models/playlist.model.js";
import { User } from "../models/user.model.js";
import { SearchHistory } from "../models/searchHistory.model.js";

// Main search function with advanced filters and ranking
export const searchSongs = async (req, res, next) => {
	try {
		const { 
			q, 
			genre, 
			year, 
			language, 
			explicit, 
			mood, 
			minDuration, 
			maxDuration,
			sortBy = "relevance",
			limit = 50,
			offset = 0
		} = req.query;

		if (!q || !q.trim()) {
			return res.status(200).json({ songs: [], total: 0, hasMore: false });
		}

		const phrase = String(q).trim();
		const userId = req.user?.id;

		// Build filter query
		const filterQuery = { $text: { $search: phrase } };
		
		if (genre) filterQuery.genre = genre;
		if (year) filterQuery.year = Number(year);
		if (language) filterQuery.language = language;
		if (explicit !== undefined) filterQuery.explicit = explicit === "true";
		if (mood) filterQuery.mood = mood;
		if (minDuration || maxDuration) {
			filterQuery.duration = {};
			if (minDuration) filterQuery.duration.$gte = Number(minDuration);
			if (maxDuration) filterQuery.duration.$lte = Number(maxDuration);
		}

		// Build sort options
		let sortOptions = { score: { $meta: "textScore" } };
		switch (sortBy) {
			case "popularity":
				sortOptions = { playCount: -1, score: { $meta: "textScore" } };
				break;
			case "newest":
				sortOptions = { createdAt: -1, score: { $meta: "textScore" } };
				break;
			case "oldest":
				sortOptions = { createdAt: 1, score: { $meta: "textScore" } };
				break;
			case "duration-asc":
				sortOptions = { duration: 1, score: { $meta: "textScore" } };
				break;
			case "duration-desc":
				sortOptions = { duration: -1, score: { $meta: "textScore" } };
				break;
			case "relevance":
			default:
				sortOptions = { score: { $meta: "textScore" } };
		}

		// Execute search with pagination - fetch more to allow for deduplication
		const fetchLimit = Math.min(Number(limit) * 3, 150); // Fetch 3x to account for duplicates
		const [songs, total] = await Promise.all([
			Song.find(filterQuery, { score: { $meta: "textScore" } })
				.sort(sortOptions)
				.skip(Number(offset))
				.limit(fetchLimit)
				.populate("albumId")
				.lean(),
			Song.countDocuments(filterQuery),
		]);

		// Deduplicate songs by title+artist combination (case-insensitive)
		const normalizeKey = (title, artist) => 
			`${title.trim().toLowerCase()}|${artist.trim().toLowerCase()}`;
		
		const seenSongs = new Set();
		const uniqueSongs = songs.filter((song) => {
			const key = normalizeKey(song.title, song.artist);
			if (seenSongs.has(key)) return false;
			seenSongs.add(key);
			return true;
		}).slice(0, Number(limit)); // Limit to requested amount after deduplication

		// Personalize results based on user's listening history
		let formattedSongs = uniqueSongs.map((song) => ({
			id: song._id,
			title: song.title,
			artist: song.artist,
			albumId: song.albumId?._id || null,
			albumTitle: song.albumId?.title || null,
			duration: song.duration,
			url: song.audioUrl,
			imageUrl: song.imageUrl,
			genre: song.genre,
			year: song.year,
			language: song.language,
			explicit: song.explicit,
			mood: song.mood,
			playCount: song.playCount,
			score: song.score,
		}));

		// If user is logged in, boost songs from their liked artists/genres
		if (userId) {
			const user = await User.findById(userId).select("likedArtists likedGenres").lean();
			if (user) {
				formattedSongs = formattedSongs.map((song) => {
					let boost = 0;
					if (user.likedArtists?.includes(song.artist)) boost += 10;
					if (user.likedGenres?.includes(song.genre)) boost += 5;
					return { ...song, personalizedScore: (song.score || 0) + boost };
				});
				formattedSongs.sort((a, b) => (b.personalizedScore || 0) - (a.personalizedScore || 0));
			}
		}

		// Log search to history if user is authenticated
		if (userId) {
			await SearchHistory.create({
				userId,
				query: phrase,
				resultCount: total,
				filters: { genre, year, language, explicit, mood, minDuration, maxDuration, sortBy },
			}).catch(() => {}); // Fire and forget
		}

		res.status(200).json({
			songs: formattedSongs,
			total,
			hasMore: Number(offset) + Number(limit) < total,
			pagination: {
				limit: Number(limit),
				offset: Number(offset),
			},
		});
	} catch (error) {
		console.error("Search error:", error);
		next(error);
	}
};

// Autocomplete/Suggestions endpoint
export const getSearchSuggestions = async (req, res, next) => {
	try {
		const { q, limit = 10 } = req.query;

		if (!q || q.trim().length < 2) {
			return res.status(200).json({ suggestions: [] });
		}

		const phrase = String(q).trim();
		const regex = new RegExp(`^${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");

		// Get suggestions from songs, artists, albums, playlists
		const [songSuggestions, artistSuggestions, albumSuggestions, playlistSuggestions] = await Promise.all([
			Song.find({ title: regex })
				.select("title artist imageUrl")
				.limit(Number(limit))
				.lean(),
			Song.find({ artist: regex })
				.select("artist")
				.distinct("artist")
				.limit(Number(limit)),
			Album.find({ title: regex })
				.select("title artist imageUrl")
				.limit(Number(limit))
				.lean(),
			Playlist.find({ title: regex, isPublic: true })
				.select("title imageUrl")
				.limit(Number(limit))
				.lean(),
		]);

		// Get popular searches from history
		const popularSearches = await SearchHistory.aggregate([
			{ $match: { query: regex, createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
			{ $group: { _id: "$query", count: { $sum: 1 } } },
			{ $sort: { count: -1 } },
			{ $limit: 5 },
			{ $project: { query: "$_id", _id: 0 } },
		]);

		// Deduplicate artists by normalizing names (case-insensitive, trim) and filtering junk names
		const JUNK_NAMES = new Set(["unknown", "unknown artist", "various artists", "various", "artist", "null", "undefined", "n/a", "na", "0", "soundtrack", "ost", "va"]);
		const normalizeArtistName = (name) => name.trim().toLowerCase();
		const seenArtists = new Set();
		const uniqueArtistSuggestions = artistSuggestions
			.filter((artist) => {
				if (!artist || typeof artist !== "string") return false;
				const normalized = normalizeArtistName(artist);
				if (normalized.length < 2 || JUNK_NAMES.has(normalized)) return false;
				if (seenArtists.has(normalized)) return false;
				seenArtists.add(normalized);
				return true;
			})
			.slice(0, Number(limit));

		const suggestions = {
			songs: songSuggestions.map((s) => ({
				type: "song",
				title: s.title,
				subtitle: s.artist,
				imageUrl: s.imageUrl,
				id: s._id,
			})),
			artists: uniqueArtistSuggestions.map((a) => ({
				type: "artist",
				title: a,
				subtitle: "Artist",
			})),
			albums: albumSuggestions.map((a) => ({
				type: "album",
				title: a.title,
				subtitle: a.artist,
				imageUrl: a.imageUrl,
				id: a._id,
			})),
			playlists: playlistSuggestions.map((p) => ({
				type: "playlist",
				title: p.title,
				subtitle: "Playlist",
				imageUrl: p.imageUrl,
				id: p._id,
			})),
			popular: popularSearches.map((p) => ({
				type: "popular",
				title: p.query,
				subtitle: "Popular search",
			})),
		};

		res.status(200).json({ suggestions });
	} catch (error) {
		console.error("Suggestions error:", error);
		next(error);
	}
};

// Search within a specific playlist
export const searchWithinPlaylist = async (req, res, next) => {
	try {
		const { playlistId } = req.params;
		const { q, limit = 50, offset = 0 } = req.query;

		if (!q || !q.trim()) {
			return res.status(200).json({ songs: [], total: 0, hasMore: false });
		}

		const playlist = await Playlist.findById(playlistId).populate("songs").lean();
		if (!playlist) {
			return res.status(404).json({ message: "Playlist not found" });
		}

		// Check access permissions
		if (!playlist.isPublic && playlist.userId !== req.user?.id) {
			return res.status(403).json({ message: "Access denied" });
		}

		const phrase = String(q).trim();
		const words = phrase.split(/\s+/).filter(Boolean);

		// Filter playlist songs
		const filteredSongs = playlist.songs.filter((song) => {
			const searchText = `${song.title} ${song.artist}`.toLowerCase();
			return words.every((word) => searchText.includes(word.toLowerCase()));
		});

		const total = filteredSongs.length;
		const paginatedSongs = filteredSongs.slice(Number(offset), Number(offset) + Number(limit));

		res.status(200).json({
			songs: paginatedSongs,
			total,
			hasMore: Number(offset) + Number(limit) < total,
		});
	} catch (error) {
		console.error("Playlist search error:", error);
		next(error);
	}
};

// Search within a specific album
export const searchWithinAlbum = async (req, res, next) => {
	try {
		const { albumId } = req.params;
		const { q, limit = 50, offset = 0 } = req.query;

		if (!q || !q.trim()) {
			return res.status(200).json({ songs: [], total: 0, hasMore: false });
		}

		const album = await Album.findById(albumId).populate("songs").lean();
		if (!album) {
			return res.status(404).json({ message: "Album not found" });
		}

		const phrase = String(q).trim();
		const words = phrase.split(/\s+/).filter(Boolean);

		const filteredSongs = album.songs.filter((song) => {
			const searchText = `${song.title} ${song.artist}`.toLowerCase();
			return words.every((word) => searchText.includes(word.toLowerCase()));
		});

		const total = filteredSongs.length;
		const paginatedSongs = filteredSongs.slice(Number(offset), Number(offset) + Number(limit));

		res.status(200).json({
			songs: paginatedSongs,
			total,
			hasMore: Number(offset) + Number(limit) < total,
		});
	} catch (error) {
		console.error("Album search error:", error);
		next(error);
	}
};

// Get filter options (genres, languages, moods, years)
export const getFilterOptions = async (req, res, next) => {
	try {
		const [genres, languages, moods, years] = await Promise.all([
			Song.distinct("genre", { genre: { $exists: true, $ne: null } }),
			Song.distinct("language", { language: { $exists: true, $ne: null } }),
			Song.distinct("mood", { mood: { $exists: true, $ne: null } }),
			Song.distinct("year", { year: { $exists: true, $ne: null } }),
		]);

		res.status(200).json({
			genres: genres.filter(Boolean).sort(),
			languages: languages.filter(Boolean).sort(),
			moods: moods.filter(Boolean).sort(),
			years: years.filter(Boolean).sort((a, b) => b - a),
		});
	} catch (error) {
		console.error("Filter options error:", error);
		next(error);
	}
};