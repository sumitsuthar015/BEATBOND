import mongoose from "mongoose";
import { Song } from "../models/song.model.js";
import { Album } from "../models/album.model.js";
import { User } from "../models/user.model.js";
import { ListeningActivity } from "../models/listeningActivity.model.js";
import { Comment } from "../models/comment.model.js";
import { Message } from "../models/message.model.js";
import { Playlist } from "../models/playlist.model.js";
import { Notification } from "../models/notification.model.js";
import { VerifiedArtist } from "../models/verifiedArtist.model.js";
import cloudinary from "../lib/cloudinary.js";
import { isDatabaseConnected } from "../lib/db.js";
import { getOnlineUserIds, isUserOnline } from "../lib/realtime.js";
import { isAdminUser } from "../middleware/auth.middleware.js";
import { searchArtistCandidates } from "../services/saavn.service.js";
import { isSupportedAudio, isSupportedImage } from "../lib/uploadValidation.js";
import { unlink } from "node:fs/promises";

const cleanupRequestUploads = async (files) => {
	const uploads = Object.values(files || {}).flat().filter((file) => file?.tempFilePath);
	await Promise.all(uploads.map((file) => unlink(file.tempFilePath).catch(() => undefined)));
};

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
		console.error("Cloudinary upload failed:", error.message);
		throw new Error("Error uploading to cloudinary");
	}
};

export const createSong = async (req, res, next) => {
	const requestFiles = req.files;
	try {
		if (!req.files || !req.files.audioFile || !req.files.imageFile) {
			return res.status(400).json({ message: "Please upload all files" });
		}

		const { title, artist, albumId, duration } = req.body;
		const audioFile = req.files.audioFile;
		const imageFile = req.files.imageFile;
		const parsedDuration = Number(duration);
		if (typeof title !== "string" || !title.trim() || title.trim().length > 200 || typeof artist !== "string" || !artist.trim() || artist.trim().length > 200) {
			return res.status(400).json({ message: "Title and artist are required and must be under 200 characters." });
		}
		if (!Number.isFinite(parsedDuration) || parsedDuration < 1 || parsedDuration > 7_200) {
			return res.status(400).json({ message: "Duration must be between 1 and 7,200 seconds." });
		}
		if (albumId && !mongoose.isValidObjectId(albumId)) return res.status(400).json({ message: "Invalid album id." });
		if (albumId && !(await Album.exists({ _id: albumId }))) return res.status(400).json({ message: "Album not found." });
		if (Array.isArray(audioFile) || Array.isArray(imageFile) || audioFile.size > 25 * 1024 * 1024 || imageFile.size > 10 * 1024 * 1024) {
			return res.status(400).json({ message: "Upload one audio file up to 25 MB and one cover image up to 10 MB." });
		}
		if (!(await isSupportedAudio(audioFile)) || !(await isSupportedImage(imageFile))) {
			return res.status(400).json({ message: "Upload valid audio and JPEG, PNG, WebP, or GIF cover files." });
		}

		const audioUrl = await uploadToCloudinary(audioFile, true);
		const imageUrl = await uploadToCloudinary(imageFile);

		const song = new Song({
			title: title.trim(),
			artist: artist.trim(),
			audioUrl,
			imageUrl,
			duration: parsedDuration,
			albumId: albumId || null,
		});

		await song.save();

		// Catalog additions are rare and useful to surface in the notification
		// center. Persist these asynchronously so the admin upload response stays
		// focused on the song save.
		void User.distinct("clerkId", { clerkId: { $type: "string", $ne: "" } })
			.then((userIds) => userIds.length && Notification.insertMany(userIds.map((userId) => ({
				userId,
				message: `New song added: ${title} by ${artist}`,
				type: "system",
				metadata: { songId: song._id.toString(), songTitle: title, songArtist: artist },
			}))))
			.catch((notificationError) => console.error("Unable to notify users about new song:", notificationError));

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
	} finally { await cleanupRequestUploads(requestFiles); }
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
	const requestFiles = req.files;
	try {
		const { title, artist, releaseYear } = req.body;

		if (!req.files || !req.files.imageFile) {
			return res.status(400).json({ message: "Please upload an album cover image" });
		}

		const { imageFile } = req.files;
		const parsedYear = Number(releaseYear);
		if (typeof title !== "string" || !title.trim() || title.trim().length > 200 || typeof artist !== "string" || !artist.trim() || artist.trim().length > 200) {
			return res.status(400).json({ message: "Title and artist are required and must be under 200 characters." });
		}
		if (!Number.isInteger(parsedYear) || parsedYear < 1880 || parsedYear > new Date().getFullYear() + 1) {
			return res.status(400).json({ message: "Enter a valid album release year." });
		}
		if (Array.isArray(imageFile) || imageFile.size > 10 * 1024 * 1024 || !(await isSupportedImage(imageFile))) {
			return res.status(400).json({ message: "Upload one valid JPEG, PNG, WebP, or GIF cover image up to 10 MB." });
		}

		const imageUrl = await uploadToCloudinary(imageFile);

		const album = new Album({
			title: title.trim(),
			artist: artist.trim(),
			imageUrl,
			releaseYear: parsedYear,
		});

		await album.save();

		res.status(201).json(album);
	} catch (error) {
		console.log("Error in createAlbum", error);
		next(error);
	} finally { await cleanupRequestUploads(requestFiles); }
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
		res.status(200).json({ admin: await isAdminUser(req.auth().userId) });
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

export const getAdminArtists = async (req, res, next) => {
	if (!isDatabaseConnected()) return databaseUnavailable(res);
	try {
		const search = String(req.query.search || "").trim().slice(0, 80);
		const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
		const conditions = terms.map((term) => ({ name: { $regex: escapeRegex(term), $options: "i" } }));
		const approved = await VerifiedArtist.find(conditions.length ? { $and: conditions } : {})
			.sort({ name: 1 }).limit(1000).lean();
		const candidates = search.length >= 2 ? await searchArtistCandidates(search, 20) : [];
		const approvedById = new Map(approved.map((artist) => [artist.artistId, artist]));
		const artists = [
			...candidates.map((candidate) => {
				const saved = approvedById.get(candidate.id);
				return {
					id: candidate.id,
					name: saved?.name || candidate.name,
					imageUrl: saved?.imageUrl || candidate.imageUrl || "",
					followerCount: saved?.followerCount ?? candidate.followerCount ?? 0,
					providerVerified: Boolean(candidate.isVerified),
					isApproved: Boolean(saved),
				};
			}),
			...approved
				.filter((artist) => !candidates.some((candidate) => candidate.id === artist.artistId))
				.map((artist) => ({
					id: artist.artistId,
					name: artist.name,
					imageUrl: artist.imageUrl || "",
					followerCount: artist.followerCount || 0,
					providerVerified: Boolean(artist.providerVerified),
					isApproved: true,
				})),
		];
		res.status(200).json({ artists, approvedCount: await VerifiedArtist.countDocuments() });
	} catch (error) {
		console.error("Error in getAdminArtists", error);
		next(error);
	}
};

export const verifyArtistAsAdmin = async (req, res, next) => {
	if (!isDatabaseConnected()) return databaseUnavailable(res);
	const { artistId, name } = req.body || {};
	if (typeof artistId !== "string" || !artistId.trim() || artistId.length > 160 || typeof name !== "string" || !name.trim() || name.length > 160) {
		return res.status(400).json({ message: "A valid artist ID and name are required." });
	}
	try {
		const artist = await VerifiedArtist.findOneAndUpdate(
			{ artistId: artistId.trim() },
			{ $set: {
				name: name.trim(),
				imageUrl: typeof req.body.imageUrl === "string" ? req.body.imageUrl.slice(0, 1000) : "",
				followerCount: Math.max(0, Number(req.body.followerCount) || 0),
				dominantLanguage: typeof req.body.dominantLanguage === "string" ? req.body.dominantLanguage.slice(0, 80) : "",
				providerVerified: Boolean(req.body.providerVerified),
				verifiedBy: req.auth().userId,
				verifiedAt: new Date(),
			} },
			{ new: true, upsert: true, runValidators: true }
		).lean();
		res.status(200).json({ artist, message: "Artist approved for search." });
	} catch (error) {
		console.error("Error verifying artist", error);
		next(error);
	}
};

export const unverifyArtistAsAdmin = async (req, res, next) => {
	if (!isDatabaseConnected()) return databaseUnavailable(res);
	const artistId = String(req.params.id || "").trim();
	if (!artistId) return res.status(400).json({ message: "Artist ID is required." });
	try {
		const result = await VerifiedArtist.findOneAndDelete({ artistId });
		if (!result) return res.status(404).json({ message: "Approved artist not found." });
		res.status(200).json({ message: "Artist removed from search." });
	} catch (error) {
		console.error("Error removing approved artist", error);
		next(error);
	}
};
