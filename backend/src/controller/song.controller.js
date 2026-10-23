import { Song } from "../models/song.model.js";
import { getMoodBasedSongs } from '../services/mood.service.js';
import { getDailyTrendingSongs } from "../services/saavn.service.js";
import mongoose from "mongoose";
import { LikedSong } from "../models/likedSong.model.js";

export const getAllSongs = async (req, res, next) => {
	try {
		// -1 = Descending => newest -> oldest
		// 1 = Ascending => oldest -> newest
		const songs = await Song.find().select('title artist imageUrl audioUrl duration albumId createdAt updatedAt').sort({ createdAt: -1 });
		res.json(songs);
	} catch (error) {
		next(error);
	}
};

export const getFeaturedSongs = async (req, res, next) => {
	try {
		// fetch 6 random songs using mongodb's aggregation pipeline
		const songs = await Song.aggregate([
			{
				$sample: { size: 6 },
			},
			{
				$project: {
					_id: 1,
					title: 1,
					artist: 1,
					imageUrl: 1,
					audioUrl: 1,
					duration: 1,
					albumId: 1,
					createdAt: 1,
					updatedAt: 1,
				},
			},
		]);

		res.json(songs);
	} catch (error) {
		next(error);
	}
};

export const getMadeForYouSongs = async (req, res, next) => {
	try {
		const songs = await Song.aggregate([
			{
				$sample: { size: 5 },
			},
			{
				$project: {
					_id: 1,
					title: 1,
					artist: 1,
					imageUrl: 1,
					audioUrl: 1,
					duration: 1,
					albumId: 1,
					createdAt: 1,
					updatedAt: 1,
				},
			},
		]);

		res.json(songs);
	} catch (error) {
		next(error);
	}
};

export const getTrendingSongs = async (req, res, next) => {
	try {
		const songs = await getDailyTrendingSongs();
		res.json(songs);
	} catch (error) {
		next(error);
	}
};

export const getMoodSongs = async (req, res) => {
	try {
		const { mood } = req.params;
		
		if (!['happy', 'sad', 'romantic', 'party'].includes(mood)) {
			return res.status(400).json({ message: 'Invalid mood' });
		}

		const songs = await getMoodBasedSongs(mood);
		res.json(songs);
	} catch (error) {
		console.error('Error in getMoodSongs:', error);
		res.status(500).json({ message: 'Failed to fetch mood-based songs' });
	}
};

export const toggleLike = async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.auth()?.userId;

		if (!userId) {
			return res.status(401).json({ message: 'Unauthorized - you must be logged in' });
		}

		const desiredLiked = req.body?.isLiked;
		if (typeof desiredLiked !== "boolean") return res.status(400).json({ message: "Like state is required" });

		if (mongoose.isValidObjectId(id)) {
			const song = await Song.findByIdAndUpdate(
				id,
				desiredLiked ? { $addToSet: { likedBy: userId } } : { $pull: { likedBy: userId } },
				{ new: true, runValidators: true },
			).select("title artist imageUrl audioUrl duration albumId genre year language explicit mood tags playCount likedBy createdAt updatedAt");
			if (song) {
				const { likedBy, ...safeSong } = song.toJSON();
				const isLiked = likedBy.includes(userId);
				return res.json({ ...safeSong, isLiked, userId: isLiked ? userId : undefined });
			}
			return res.status(404).json({ message: "Song not found" });
		}

		if (typeof id !== "string" || !id.trim() || id.length > 200) return res.status(400).json({ message: "Invalid song id" });
		if (desiredLiked) {
			const raw = req.body?.song;
			if (!raw || typeof raw !== "object" || Array.isArray(raw)) return res.status(400).json({ message: "Song details are required to save this track" });
			const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 200) : "";
			const artist = typeof raw.artist === "string" ? raw.artist.trim().slice(0, 200) : "";
			const audioUrl = typeof raw.audioUrl === "string" ? raw.audioUrl.trim() : "";
			if (String(raw._id || raw.id || "") !== id || !title || !artist || audioUrl.length > 2_000 || !/^https:\/\//i.test(audioUrl)) {
				return res.status(400).json({ message: "Track details are invalid or incomplete" });
			}
			const safeSong = {
				_id: id,
				title,
				artist,
				imageUrl: typeof raw.imageUrl === "string" && raw.imageUrl.length <= 2_000 ? raw.imageUrl : "",
				audioUrl,
				duration: Math.max(0, Math.min(Number(raw.duration) || 0, 7_200)),
				albumId: typeof raw.albumId === "string" ? raw.albumId.slice(0, 200) : "",
				albumName: typeof raw.albumName === "string" ? raw.albumName.slice(0, 200) : "",
				genre: typeof raw.genre === "string" ? raw.genre.slice(0, 100) : "",
				language: typeof raw.language === "string" ? raw.language.slice(0, 100) : "",
				isLiked: true,
			};
			await LikedSong.findOneAndUpdate(
				{ userId, songId: id },
				{ $set: { song: safeSong } },
				{ upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
			);
			return res.json({ ...safeSong, isLiked: true, userId });
		}

		await LikedSong.deleteOne({ userId, songId: id });
		return res.json({ _id: id, isLiked: false });
	} catch (error) {
		console.error('Error in toggleLike:', error);
		res.status(500).json({ message: 'Failed to toggle like status' });
	}
};

export const getLikedSongs = async (req, res) => {
	try {
		const userId = req.auth()?.userId;

		if (!userId) {
			return res.status(401).json({ message: 'Unauthorized - you must be logged in' });
		}

		const [likedSongs, externalLikes] = await Promise.all([
			Song.find({ likedBy: userId }).select("title artist imageUrl audioUrl duration likedBy"),
			LikedSong.find({ userId }).sort({ createdAt: -1 }).lean(),
		]);

		const songsWithLikeStatus = likedSongs.map((song) => ({
			...song.toJSON(),
			isLiked: true,
			userId,
		}));

		const nativeIds = new Set(likedSongs.map((song) => song._id.toString()));
		res.json([
			...songsWithLikeStatus,
			...externalLikes.filter((like) => !nativeIds.has(like.songId)).map((like) => ({ ...like.song, _id: like.songId, isLiked: true, userId })),
		]);
	} catch (error) {
		console.error('Error in getLikedSongs:', error);
		res.status(500).json({ message: 'Failed to fetch liked songs' });
	}
};
