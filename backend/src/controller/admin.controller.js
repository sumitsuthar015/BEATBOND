import mongoose from "mongoose";
import { Song } from "../models/song.model.js";
import { Album } from "../models/album.model.js";
import { User } from "../models/user.model.js";
import { ListeningActivity } from "../models/listeningActivity.model.js";
import { Comment } from "../models/comment.model.js";
import { Message } from "../models/message.model.js";
import { Playlist } from "../models/playlist.model.js";
import cloudinary from "../lib/cloudinary.js";
import { isDatabaseConnected } from "../lib/db.js";
import { getOnlineUserIds, isUserOnline } from "../lib/socket.js";
import { isAdminUser } from "../middleware/auth.middleware.js";

// helper function for cloudinary uploads
const uploadToCloudinary = async (file, isAudio = false) => {
	try {
		const options = {
			resource_type: "auto",
		};

		if (isAudio) {
			options.format = 'mp3';
			options.audio_codec = "mp3";
			options.bit_rate = "128k";
			options.raw_transform = "f_mp3"; // Force MP3 format
			if (file.mimetype && file.mimetype.includes('mp4')) {
				options.resource_type = "video";
				options.audio_codec = "mp3";
				options.format = "mp3";
			}
		}

		const result = await cloudinary.uploader.upload(file.tempFilePath, options);
		return result.secure_url;
	} catch (error) {
		console.log("Error in uploadToCloudinary", error);
		throw new Error("Error uploading to cloudinary");
	}
};

export const createSong = async (req, res, next) => {
	try {
		if (!req.files || !req.files.audioFile || !req.files.imageFile) {
			return res.status(400).json({ message: "Please upload all files" });
		}

		const { title, artist, albumId, duration } = req.body;
		const audioFile = req.files.audioFile;
		const imageFile = req.files.imageFile;

		const audioUrl = await uploadToCloudinary(audioFile, true);
		const imageUrl = await uploadToCloudinary(imageFile);

		const song = new Song({
			title,
			artist,
			audioUrl,
			imageUrl,
			duration,
			albumId: albumId || null,
		});

		await song.save();

		// if song belongs to an album, update the album's songs array
		if (albumId) {
			await Album.findByIdAndUpdate(albumId, {
				$push: { songs: song._id },
			});
		}
		res.status(201).json(song);
	} catch (error) {
		console.log("Error in createSong", error);
		next(error);
	}
};

export const deleteSong = async (req, res, next) => {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid song id" });

		const song = await Song.findById(id);

		if (!song) {
			return res.status(404).json({ message: "Song not found" });
		}

		if (song.albumId) {
			await Album.findByIdAndUpdate(song.albumId, {
				$pull: { songs: song._id },
			});
		}

		await Song.findByIdAndDelete(id);

		res.status(200).json({ message: "Song deleted successfully" });
	} catch (error) {
		console.log("Error in deleteSong", error);
		next(error);
	}
};

export const createAlbum = async (req, res, next) => {
	try {
		const { title, artist, releaseYear } = req.body;

		if (!req.files || !req.files.imageFile) {
			return res.status(400).json({ message: "Please upload an album cover image" });
		}

		const { imageFile } = req.files;

		const imageUrl = await uploadToCloudinary(imageFile);

		const album = new Album({
			title,
			artist,
			imageUrl,
			releaseYear,
		});

		await album.save();

		res.status(201).json(album);
	} catch (error) {
		console.log("Error in createAlbum", error);
		next(error);
	}
};

export const deleteAlbum = async (req, res, next) => {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid album id" });

		const album = await Album.findByIdAndDelete(id);
		if (!album) return res.status(404).json({ message: "Album not found" });
		await Song.deleteMany({ albumId: id });
		res.status(200).json({ message: "Album deleted successfully" });
	} catch (error) {
		console.log("Error in deleteAlbum", error);
		next(error);
	}
};

export const checkAdmin = async (req, res, next) => {
	try {
		res.status(200).json({ admin: await isAdminUser(req.auth.userId) });
	} catch (error) {
		next(error);
	}
};

// ---------------------------------------------------------------------------
// Dashboard analytics, user directory and moderation
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_DAYS = 14;
const TOP_WINDOW_DAYS = 30;

const databaseUnavailable = (res) =>
	res.status(503).json({ message: "Database is not connected. Try again in a moment." });

// Charts are bucketed by the admin's local day, so "today" matches their clock.
export const resolveTimeZone = (timeZone) => {
	if (typeof timeZone !== "string" || !timeZone) return "UTC";
	try {
		new Intl.DateTimeFormat("en-US", { timeZone });
		return timeZone;
	} catch {
		return "UTC";
	}
};

// Oldest -> newest "YYYY-MM-DD" keys for the last `days` days in `timeZone`.
export const buildDayKeys = (now, days, timeZone) => {
	const format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
	const keys = [];
	for (let offset = days - 1; offset >= 0; offset -= 1) {
		const key = format.format(new Date(now.getTime() - offset * DAY_MS));
		if (!keys.includes(key)) keys.push(key);
	}
	return keys;
};

const percent = (part, total) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const countByDay = (Model, field, since, timeZone) =>
	Model.aggregate([
		{ $match: { [field]: { $gte: since } } },
		{ $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: `$${field}`, timezone: timeZone } }, count: { $sum: 1 } } },
	]);

export const getDashboardOverview = async (req, res, next) => {
	if (!isDatabaseConnected()) return databaseUnavailable(res);

	try {
		const timeZone = resolveTimeZone(req.query.tz);
		const now = new Date();
		const daysAgo = (days) => new Date(now.getTime() - days * DAY_MS);
		const weekAgo = daysAgo(7);
		const twoWeeksAgo = daysAgo(14);
		const topWindow = { playedAt: { $gte: daysAgo(TOP_WINDOW_DAYS) } };
		// One extra day so the oldest local day is complete in every timezone.
		const activitySince = daysAgo(ACTIVITY_DAYS + 1);

		const [
			totalUsers,
			newUsers7d,
			newUsersPrev7d,
			listeners7d,
			totalPlays,
			plays7d,
			playsPrev7d,
			totalSongs,
			totalAlbums,
			artistCount,
			comments,
			messages,
			playlists,
			dailyPlays,
			dailySignups,
			topSongs,
			topArtists,
			hourly,
			listening,
			recentUsers,
		] = await Promise.all([
			User.countDocuments(),
			User.countDocuments({ createdAt: { $gte: weekAgo } }),
			User.countDocuments({ createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } }),
			ListeningActivity.aggregate([
				{ $match: { playedAt: { $gte: weekAgo } } },
				{ $group: { _id: "$userId" } },
				{ $count: "count" },
			]),
			ListeningActivity.estimatedDocumentCount(),
			ListeningActivity.countDocuments({ playedAt: { $gte: weekAgo } }),
			ListeningActivity.countDocuments({ playedAt: { $gte: twoWeeksAgo, $lt: weekAgo } }),
			Song.countDocuments(),
			Album.countDocuments(),
			Song.aggregate([{ $unionWith: { coll: "albums", pipeline: [] } }, { $group: { _id: "$artist" } }, { $count: "count" }]),
			Comment.countDocuments(),
			Message.estimatedDocumentCount(),
			Playlist.countDocuments(),
			countByDay(ListeningActivity, "playedAt", activitySince, timeZone),
			countByDay(User, "createdAt", activitySince, timeZone),
			ListeningActivity.aggregate([
				{ $match: topWindow },
				{ $sort: { playedAt: -1 } },
				{
					$group: {
						_id: "$songId",
						title: { $first: "$title" },
						artist: { $first: "$artist" },
						imageUrl: { $first: "$imageUrl" },
						plays: { $sum: 1 },
						listeners: { $addToSet: "$userId" },
					},
				},
				{ $sort: { plays: -1 } },
				{ $limit: 5 },
				{ $project: { _id: 0, songId: "$_id", title: 1, artist: 1, imageUrl: 1, plays: 1, listeners: { $size: "$listeners" } } },
			]),
			ListeningActivity.aggregate([
				{ $match: topWindow },
				// "Artist A, Artist B" credits count once for each artist.
				{ $project: { artist: { $split: ["$artist", ","] } } },
				{ $unwind: "$artist" },
				{ $project: { artist: { $trim: { input: "$artist" } } } },
				{ $match: { artist: { $nin: ["", "Unknown Artist"] } } },
				{ $group: { _id: "$artist", plays: { $sum: 1 } } },
				{ $sort: { plays: -1 } },
				{ $limit: 5 },
				{ $project: { _id: 0, name: "$_id", plays: 1 } },
			]),
			ListeningActivity.aggregate([
				{ $match: topWindow },
				{ $group: { _id: { $hour: { date: "$playedAt", timezone: timeZone } }, plays: { $sum: 1 } } },
			]),
			ListeningActivity.aggregate([
				{ $match: topWindow },
				{
					$group: {
						_id: null,
						plays: { $sum: 1 },
						completed: { $sum: { $cond: ["$completed", 1, 0] } },
						skipped: { $sum: { $cond: ["$skipped", 1, 0] } },
						secondsPlayed: { $sum: "$durationPlayed" },
					},
				},
			]),
			User.find().sort({ createdAt: -1 }).limit(6).select("clerkId fullName username imageUrl createdAt").lean(),
		]);

		const playsByDay = new Map(dailyPlays.map((row) => [row._id, row.count]));
		const signupsByDay = new Map(dailySignups.map((row) => [row._id, row.count]));
		const playsByHour = new Map(hourly.map((row) => [row._id, row.plays]));
		const health = listening[0] || { plays: 0, completed: 0, skipped: 0, secondsPlayed: 0 };

		res.status(200).json({
			generatedAt: now.toISOString(),
			timeZone,
			windowDays: TOP_WINDOW_DAYS,
			users: {
				total: totalUsers,
				new7d: newUsers7d,
				newPrev7d: newUsersPrev7d,
				onlineNow: getOnlineUserIds().length,
				listeners7d: listeners7d[0]?.count || 0,
			},
			plays: { total: totalPlays, last7d: plays7d, prev7d: playsPrev7d },
			catalogue: { songs: totalSongs, albums: totalAlbums, artists: artistCount[0]?.count || 0 },
			community: { comments, messages, playlists },
			daily: buildDayKeys(now, ACTIVITY_DAYS, timeZone).map((date) => ({
				date,
				plays: playsByDay.get(date) || 0,
				signups: signupsByDay.get(date) || 0,
			})),
			topSongs,
			topArtists,
			hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, plays: playsByHour.get(hour) || 0 })),
			listening: {
				plays: health.plays,
				completionRate: percent(health.completed, health.plays),
				skipRate: percent(health.skipped, health.plays),
				avgSecondsPlayed: health.plays ? Math.round(health.secondsPlayed / health.plays) : 0,
				hoursPlayed: Math.round((health.secondsPlayed / 3600) * 10) / 10,
			},
			recentUsers: recentUsers.map((user) => ({
				_id: user._id,
				fullName: user.fullName,
				username: user.username,
				imageUrl: user.imageUrl,
				createdAt: user.createdAt,
				isOnline: isUserOnline(user.clerkId),
			})),
		});
	} catch (error) {
		console.log("Error in getDashboardOverview", error);
		next(error);
	}
};

export const getAdminUsers = async (req, res, next) => {
	if (!isDatabaseConnected()) return databaseUnavailable(res);

	try {
		const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
		const page = Math.max(Number(req.query.page) || 1, 1);
		const search = String(req.query.search || "").trim().slice(0, 80);
		const filter = search
			? {
					$or: ["fullName", "username", "email"].map((field) => ({
						[field]: { $regex: escapeRegex(search), $options: "i" },
					})),
				}
			: {};

		const [total, users] = await Promise.all([
			User.countDocuments(filter),
			User.find(filter)
				.sort({ createdAt: -1 })
				.skip((page - 1) * limit)
				.limit(limit)
				.select("clerkId fullName username email imageUrl createdAt lastSeen friends")
				.lean(),
		]);

		const playCounts = await ListeningActivity.aggregate([
			{ $match: { userId: { $in: users.map((user) => user.clerkId) } } },
			{ $group: { _id: "$userId", plays: { $sum: 1 }, lastPlayedAt: { $max: "$playedAt" } } },
		]);
		const playsByUser = new Map(playCounts.map((row) => [row._id, row]));

		res.status(200).json({
			total,
			page,
			pages: Math.max(Math.ceil(total / limit), 1),
			users: users.map((user) => ({
				_id: user._id,
				fullName: user.fullName,
				username: user.username,
				email: user.email,
				imageUrl: user.imageUrl,
				createdAt: user.createdAt,
				lastSeen: user.lastSeen,
				isOnline: isUserOnline(user.clerkId),
				friendsCount: user.friends?.length || 0,
				plays: playsByUser.get(user.clerkId)?.plays || 0,
				lastPlayedAt: playsByUser.get(user.clerkId)?.lastPlayedAt || null,
			})),
		});
	} catch (error) {
		console.log("Error in getAdminUsers", error);
		next(error);
	}
};

const authorsFor = async (clerkIds) => {
	const users = await User.find({ clerkId: { $in: [...new Set(clerkIds)] } })
		.select("clerkId fullName username imageUrl")
		.lean();
	return new Map(users.map((user) => [user.clerkId, { fullName: user.fullName, username: user.username, imageUrl: user.imageUrl }]));
};

const unknownAuthor = { fullName: "Deleted user", username: "", imageUrl: "" };

export const getModerationFeed = async (req, res, next) => {
	if (!isDatabaseConnected()) return databaseUnavailable(res);

	try {
		const comments = await Comment.find()
			.sort({ createdAt: -1 })
			.limit(30)
			.select("userId songTitle songArtist songImageUrl content createdAt")
			.lean();
		const authors = await authorsFor(comments.map((comment) => comment.userId));

		res.status(200).json({
			comments: comments.map(({ userId, ...comment }) => ({ ...comment, author: authors.get(userId) || unknownAuthor })),
		});
	} catch (error) {
		console.log("Error in getModerationFeed", error);
		next(error);
	}
};

export const deleteCommentAsAdmin = async (req, res, next) => {
	if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid comment id" });
	if (!isDatabaseConnected()) return databaseUnavailable(res);

	try {
		const comment = await Comment.findByIdAndDelete(req.params.id);
		if (!comment) return res.status(404).json({ message: "Comment not found" });
		res.status(200).json({ message: "Comment removed" });
	} catch (error) {
		console.log("Error in deleteCommentAsAdmin", error);
		next(error);
	}
};
