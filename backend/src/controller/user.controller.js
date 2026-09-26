import { User } from "../models/user.model.js";
import { Message } from "../models/message.model.js";
import { ListeningActivity } from "../models/listeningActivity.model.js";
import { FriendRequest } from "../models/friendRequest.model.js";
import mongoose from "mongoose";
import { emitToUsers, isUserOnline, refreshActivityAudience } from "../lib/socket.js";
import { LISTENING_LEVELS, PRIVACY_FIELDS, canSeeListeningHistory, canSeeLiveActivity } from "../services/privacy.service.js";
import { canSeePresence, statusForViewer } from "../services/chat.service.js";
import cloudinary from "../lib/cloudinary.js";
import fs from "fs/promises";
import { PHOTO_SOURCES, escapeRegex, photoSourceAvailable, photoStateOf, photoUpdate, summarizeListening, validateProfileUpdate } from "../services/profile.service.js";

export const saveListeningActivity = async (req, res, next) => {
	try {
		const { _id, title, artist, imageUrl, audioUrl, albumId, genre, duration, durationPlayed, completionPercentage, completed, skipped, skipPosition, source } = req.body;
		if (!_id || !title) return res.status(400).json({ message: "Song id and title are required" });
		const safeDuration = Number(duration) || 0;
		const played = Math.max(0, Math.min(Number(durationPlayed) || 0, safeDuration || Number(durationPlayed) || 0));
		const completion = Math.max(0, Math.min(Number(completionPercentage) || (safeDuration ? (played / safeDuration) * 100 : 0), 100));
		// Ignore accidental taps: playback history should represent meaningful use.
		if (!completed && !skipped && played < 10) return res.status(204).end();
		const activity = await ListeningActivity.create({
			userId: req.auth.userId,
			songId: String(_id), title, artist, imageUrl, audioUrl, albumId, genre,
			duration: safeDuration, durationPlayed: played, completionPercentage: completion,
			completed: Boolean(completed), skipped: Boolean(skipped), skipPosition: Math.max(0, Number(skipPosition) || 0), source: String(source || "player").slice(0, 40), playedAt: new Date(),
		});
		res.status(201).json(activity);
	} catch (error) { next(error); }
};

export const getListeningHistory = async (req, res, next) => {
	try {
		const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
		const history = await ListeningActivity.find({ userId: req.auth.userId }).sort({ playedAt: -1 }).limit(limit).lean();
		res.status(200).json(history.map((item) => ({
			_id: item.songId, title: item.title, artist: item.artist, imageUrl: item.imageUrl,
			audioUrl: item.audioUrl, albumId: item.albumId, genre: item.genre, duration: item.duration,
			playedAt: item.playedAt.toISOString(), userId: item.userId, videoUrl: null, isLiked: false,
			durationPlayed: item.durationPlayed, completionPercentage: item.completionPercentage, completed: item.completed, skipped: item.skipped, source: item.source,
			lyrics: "", createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
		})));
	} catch (error) { next(error); }
};

export const getAllUsers = async (req, res, next) => {
	try {
		const currentUserId = req.auth.userId;
		const me = await User.findOne({ clerkId: currentUserId }).select("blockedUsers").lean();
		// Public profile fields only: never emails, activity, friends or blocks.
		const users = await User.find({ clerkId: { $nin: [currentUserId, ...(me?.blockedUsers ?? [])] }, blockedUsers: { $ne: currentUserId } })
			.select("clerkId fullName username imageUrl bio")
			.lean();
		res.status(200).json(users.map((user) => ({ ...user, isOnline: isUserOnline(user.clerkId) })));
	} catch (error) {
		next(error);
	}
};

export const getMessages = async (req, res, next) => {
	try {
		const myId = req.auth.userId; // Current user ID
		let { userId } = req.params; // Other user's Clerk ID (or legacy Mongo ID)
		if (mongoose.isValidObjectId(userId)) {
			const resolvedUser = await User.findById(userId).select("clerkId").lean();
			if (resolvedUser?.clerkId) userId = resolvedUser.clerkId;
		}
		const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
		const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

		const conversation = {
			$or: [
				{ senderId: userId, receiverId: myId },
				{ senderId: myId, receiverId: userId },
			],
			deletedFor: { $ne: myId },
		};
		const [totalMessages, viewer] = await Promise.all([
			Message.countDocuments(conversation),
			User.findOne({ clerkId: myId }).select("clerkId readReceipts").lean(),
		]);

		const messages = await Message.find(conversation)
			.sort({ createdAt: -1 })
			.skip((page - 1) * limit)
			.limit(limit)
			.populate('replyTo', 'content senderId') // Populate reply info if exists
			.lean();

		const hasNextPage = totalMessages > page * limit;

		// Reverse to show oldest first (since we sorted desc for pagination)
		const reversedMessages = messages.reverse();

		// Auto-mark unread messages from the other user as delivered when fetched
		const undeliveredMessageIds = reversedMessages
			.filter(msg => msg.senderId === userId && msg.status === 'sent')
			.map(msg => msg._id);

		if (undeliveredMessageIds.length > 0) {
			await Message.updateMany(
				{ _id: { $in: undeliveredMessageIds } },
				{ status: 'delivered' }
			);
			
			// Update the messages array with delivered status
			reversedMessages.forEach(msg => {
				if (undeliveredMessageIds.some(id => id.equals(msg._id))) {
					msg.status = 'delivered';
				}
			});

		}

		res.status(200).json({
			messages: reversedMessages.map((msg) => ({ ...msg, status: statusForViewer(msg, viewer ?? { clerkId: myId }), deletedFor: undefined })),
			nextPage: hasNextPage ? page + 1 : undefined,
			totalPages: Math.ceil(totalMessages / limit),
		});
	} catch (error) {
		next(error);
	}
};

export const getSharedMessages = async (req, res, next) => {
	try {
		const myId = req.auth.userId;
		const { userId } = req.params;
		const messages = await Message.find({
			$or: [
				{ senderId: myId, receiverId: userId },
				{ senderId: userId, receiverId: myId },
			],
			"sharedContent.type": "song",
			deletedFor: { $ne: myId },
		}).sort({ createdAt: -1 }).lean();
		res.status(200).json(messages);
	} catch (error) {
		next(error);
	}
};

export const clearConversation = async (req, res, next) => {
	try {
		const myId = req.auth.userId;
		const { userId } = req.params;
		const result = await Message.updateMany({
			$or: [
				{ senderId: myId, receiverId: userId },
				{ senderId: userId, receiverId: myId },
			],
		}, { $addToSet: { deletedFor: myId } });
		res.status(200).json({ success: true, clearedCount: result.modifiedCount });
	} catch (error) {
		next(error);
	}
};

import { clerkClient } from "@clerk/express";

// Adds people who signed up with Clerk but never reached the app's sign-in
// callback. Existing accounts are left alone: their name, username and
// photo are managed in BeatBond.
export const syncClerkUsersToDatabase = async () => {
	let clerkUsers = [];
	try {
		const clerkUsersResponse = await clerkClient.users.getUserList({ limit: 100 });
		clerkUsers = clerkUsersResponse?.data || (Array.isArray(clerkUsersResponse) ? clerkUsersResponse : []);
	} catch (error) {
		console.error("Error syncing Clerk users to DB:", error.message);
		return;
	}

	for (const clerkUser of clerkUsers) {
		const email = clerkUser.emailAddresses?.[0]?.emailAddress || "";
		const username = clerkUser.username || (email ? email.split("@")[0] : `user_${clerkUser.id.slice(-6)}`);
		const fullName = `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || username;
		const imageUrl = clerkUser.imageUrl || "";
		try {
			await User.updateOne(
				{ clerkId: clerkUser.id },
				{ $setOnInsert: { clerkId: clerkUser.id, email, username, fullName, imageUrl, photoSource: "provider", providerImageUrl: imageUrl, isOnline: false } },
				{ upsert: true },
			);
		} catch (error) {
			// One account (e.g. a username already taken) must not stop the rest.
			console.error(`Could not sync Clerk user ${clerkUser.id}:`, error.message);
		}
	}
};

export const searchUsers = async (req, res, next) => {
	try {
		const { q } = req.query;
		const currentUserId = req.auth.userId;

		if (!q || !q.trim()) {
			return res.status(200).json([]);
		}

		await syncClerkUsersToDatabase();

		const queryStr = q.trim();
		const me = await User.findOne({ clerkId: currentUserId }).select("clerkId blockedUsers showActivityStatus").lean();
		const escaped = queryStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const searchRegex = new RegExp(escaped, 'i');

		const users = await User.find({
			clerkId: { $nin: [currentUserId, ...(me?.blockedUsers ?? [])] },
			blockedUsers: { $ne: currentUserId },
			$or: [
				{ fullName: searchRegex },
				{ username: searchRegex },
				{ email: searchRegex }
			]
		})
		.select('clerkId fullName username imageUrl bio friends showActivityStatus')
		.limit(30)
		.lean();

		const formattedUsers = users.map(({ showActivityStatus, ...user }) => ({
			...user,
			fullName: user.fullName || user.username || "Beatbond User",
			imageUrl: user.imageUrl || "/default-avatar.png",
			isOnline: canSeePresence({ clerkId: user.clerkId, showActivityStatus }, me ?? { clerkId: currentUserId }) && isUserOnline(user.clerkId),
			friendsCount: user.friends?.length || 0,
		}));

		res.status(200).json(formattedUsers);
	} catch (error) {
		console.error("Search users error:", error);
		next(error);
	}
};

export const getSuggestedUsers = async (req, res, next) => {
	try {
		const currentUserId = req.auth.userId;

		await syncClerkUsersToDatabase();

		const currentUser = await User.findOne({ clerkId: currentUserId }).lean();
		const friendIds = currentUser?.friends || [];

		const suggestedUsers = await User.find({
			clerkId: { $nin: [currentUserId, ...friendIds, ...(currentUser?.blockedUsers ?? [])] },
			blockedUsers: { $ne: currentUserId },
		})
			.select('clerkId fullName username imageUrl bio friends showActivityStatus')
			.limit(15)
			.sort({ createdAt: -1 })
			.lean();

		const usersWithMutual = suggestedUsers.map((user) => {
			const mutualFriends = (user.friends || []).filter((id) =>
				friendIds.includes(id)
			).length;

			return {
				clerkId: user.clerkId,
				fullName: user.fullName || user.username || "Beatbond User",
				username: user.username,
				imageUrl: user.imageUrl || "/default-avatar.png",
				bio: user.bio || "",
				isOnline: canSeePresence(user, currentUser ?? { clerkId: currentUserId }) && isUserOnline(user.clerkId),
				mutualFriends,
				friendsCount: user.friends?.length || 0,
			};
		});

		res.status(200).json(usersWithMutual);
	} catch (error) {
		console.error("Suggested users error:", error);
		next(error);
	}
};

export const updateUserProfile = async (req, res, next) => {
	try {
		const { clerkId } = req.params;
		if (req.auth.userId !== clerkId) {
			return res.status(403).json({ message: "You can only update your own profile" });
		}

		const { updates, error } = validateProfileUpdate(req.body);
		if (error) return res.status(400).json({ message: error });

		if (updates.username) {
			const taken = await User.exists({ username: new RegExp("^" + escapeRegex(updates.username) + "$", "i"), clerkId: { $ne: clerkId } });
			if (taken) return res.status(409).json({ message: "That username is already taken. Try another one." });
		}

		const user = await User.findOneAndUpdate({ clerkId }, updates, { new: true, runValidators: true });
		if (!user) return res.status(404).json({ message: "User not found" });

		res.status(200).json({ message: "Profile updated successfully", user });
	} catch (error) {
		next(error);
	}
};

// Checks the uploaded "photo" file and stores it in Cloudinary. Sends the
// error response itself and returns null when the upload can't go ahead.
const storeUploadedImage = async (req, res, cloudinaryOptions) => {
	const photo = req.files?.photo;
	if (!photo || Array.isArray(photo)) { res.status(400).json({ message: "Choose a profile photo to upload." }); return null; }
	if (!photo.mimetype?.startsWith("image/")) { res.status(400).json({ message: "Please upload an image file." }); return null; }
	if (photo.size > 5 * 1024 * 1024) { res.status(400).json({ message: "Profile photos must be 5 MB or smaller." }); return null; }
	if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
		res.status(503).json({ message: "Photo uploads are not configured yet." });
		return null;
	}
	try {
		const uploaded = await cloudinary.uploader.upload(photo.tempFilePath, { resource_type: "image", ...cloudinaryOptions });
		return uploaded.secure_url;
	} finally {
		if (photo.tempFilePath) await fs.unlink(photo.tempFilePath).catch(() => undefined);
	}
};

const handleCloudinaryError = (error, res) => {
	if (error?.http_code === 401 || /invalid signature/i.test(error?.message || "")) {
		res.status(503).json({ message: "Photo upload configuration is invalid. Update CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET with matching values from one Cloudinary account." });
		return true;
	}
	return false;
};

const PHOTO_FIELDS = "imageUrl photoSource photoUrl providerImageUrl avatarImageUrl";
const publicPhoto = (state) => ({ source: state.photoSource, uploadedUrl: state.photoUrl, providerUrl: state.providerImageUrl, avatarUrl: state.avatarImageUrl });

/** Applies a change to someone's photo choice and saves the picture everyone sees. */
const savePhotoChange = async (clerkId, change) => {
	const user = await User.findOne({ clerkId }).select(PHOTO_FIELDS).lean();
	if (!user) return null;
	const update = photoUpdate({ ...photoStateOf(user), ...change });
	await User.updateOne({ clerkId }, update);
	return { imageUrl: update.imageUrl, photo: publicPhoto(update) };
};

export const uploadProfilePhoto = async (req, res, next) => {
	try {
		const url = await storeUploadedImage(req, res, {
			folder: "beatbond/profile-photos",
			transformation: [{ width: 512, height: 512, crop: "fill", gravity: "face" }, { fetch_format: "auto", quality: "auto" }],
		});
		if (!url) return;
		const result = await savePhotoChange(req.auth.userId, { photoUrl: url, photoSource: "upload" });
		if (!result) return res.status(404).json({ message: "User not found" });
		res.json(result);
	} catch (error) {
		if (!handleCloudinaryError(error, res)) next(error);
	}
};

// The app draws the avatar and uploads it as a picture, so it shows anywhere a
// normal photo does. One picture per person, replaced when the avatar changes.
export const uploadAvatarPhoto = async (req, res, next) => {
	try {
		const url = await storeUploadedImage(req, res, {
			folder: "beatbond/avatar-photos",
			public_id: req.auth.userId,
			overwrite: true,
			invalidate: true,
			transformation: [{ width: 512, height: 512, crop: "fill" }, { fetch_format: "auto", quality: "auto" }],
		});
		if (!url) return;
		const result = await savePhotoChange(req.auth.userId, { avatarImageUrl: url, photoSource: "avatar" });
		if (!result) return res.status(404).json({ message: "User not found" });
		res.json(result);
	} catch (error) {
		if (!handleCloudinaryError(error, res)) next(error);
	}
};

export const setPhotoSource = async (req, res, next) => {
	try {
		const source = req.body?.source;
		if (!PHOTO_SOURCES.includes(source)) return res.status(400).json({ message: "Choose provider, upload, avatar or none" });
		const user = await User.findOne({ clerkId: req.auth.userId }).select(PHOTO_FIELDS).lean();
		if (!user) return res.status(404).json({ message: "User not found" });
		if (!photoSourceAvailable(photoStateOf(user), source)) return res.status(400).json({ message: "That picture isn't available yet." });
		res.json(await savePhotoChange(req.auth.userId, { photoSource: source }));
	} catch (error) { next(error); }
};

// ⭐ UPDATED - getUserProfile with privacy checks
export const getUserProfile = async (req, res, next) => {
	try {
		const { userId } = req.params;
		const currentUserId = req.auth.userId; // Logged in user

		const lookup = [{ clerkId: userId }];
		if (mongoose.isValidObjectId(userId)) lookup.push({ _id: userId });
		const user = await User.findOne({ $or: lookup });
		
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const currentUser = await User.findOne({ clerkId: currentUserId });
		
		// Check if they are friends
		const profileUserId = user.clerkId;
		if (profileUserId !== currentUserId && user.blockedUsers?.includes(currentUserId)) {
			return res.status(404).json({ message: "User not found" });
		}
		const isBlocked = currentUser?.blockedUsers?.includes(profileUserId) || false;
		const presenceShown = !isBlocked && canSeePresence(user, currentUser ?? { clerkId: currentUserId });
		const isFriend = currentUser?.friends?.includes(profileUserId) || false;
		
		// ⭐ NEW - Determine if viewer can see music activity
		const canSeeMusicActivity = !isBlocked && canSeeLiveActivity(user, currentUserId);

		// Get mutual friends count
		const mutualFriendsCount = currentUser?.friends?.filter(
			friendId => user.friends?.includes(friendId)
		).length || 0;

		// `friends` can include stale IDs from older records. Use the same union
		// of accepted requests and valid users as the Friends API for profile UI.
		const acceptedRequests = await FriendRequest.find({
			$or: [{ senderId: profileUserId }, { receiverId: profileUserId }],
			status: "accepted",
		}).select("senderId receiverId createdAt").lean();
		const connectionIds = [...new Set([
			...(user.friends || []),
			...acceptedRequests.map((request) => request.senderId === profileUserId ? request.receiverId : request.senderId),
		])];
		const friendsCount = await User.countDocuments({ clerkId: { $in: connectionIds } });
		const friendshipRequest = acceptedRequests.find(
			(request) => request.senderId === currentUserId || request.receiverId === currentUserId
		);
		const conversationCount = currentUserId
			? await Message.countDocuments({
				$or: [
					{ senderId: currentUserId, receiverId: profileUserId },
					{ senderId: profileUserId, receiverId: currentUserId },
				],
			})
			: 0;

		res.status(200).json({
			clerkId: user.clerkId,
			fullName: user.fullName,
			username: user.username,
			imageUrl: user.imageUrl,
			bio: user.bio || "",
			email: user.email,
			location: user.location,
			website: user.website,
			joinedDate: user.createdAt,
			friendsCount,
			mutualFriendsCount,
			friendshipSince: friendshipRequest?.createdAt || null,
			conversationCount,
			isFriend,
			friendshipStatus: isFriend ? 'accepted' : 'none',
			isBlocked,
			isOnline: presenceShown && isUserOnline(user.clerkId),
			lastSeen: presenceShown ? user.lastSeen : undefined,
			// ⭐ NEW FIELDS
			...(profileUserId === currentUserId
				? { musicPrivacy: user.musicPrivacy || "friends", historyPrivacy: user.historyPrivacy || "none", photo: publicPhoto(photoStateOf(user)),
					chatSettings: { readReceipts: user.readReceipts !== false, showActivityStatus: user.showActivityStatus !== false, messageNotifications: user.messageNotifications !== false } }
				: { listeningHiddenFromThem: currentUser?.musicHiddenFrom?.includes(profileUserId) || false }),
			canSeeMusicActivity,
			currentActivity: canSeeMusicActivity ? user.currentActivity : null
		});
	} catch (error) {
		console.error("Error fetching user profile:", error);
		next(error);
	}
};

// ⭐ NEW FUNCTION - Update Music Privacy
export const updateMusicPrivacy = async (req, res, next) => {
	try {
		const { musicPrivacy } = req.body;
		const userId = req.auth.userId; // Clerk userId

		// Validate privacy value
		if (!['everyone', 'friends', 'none'].includes(musicPrivacy)) {
			return res.status(400).json({ 
				message: "Invalid privacy setting. Use 'everyone', 'friends', or 'none'" 
			});
		}

		const user = await User.findOneAndUpdate(
			{ clerkId: userId },
			{ musicPrivacy },
			{ new: true }
		);

		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		await refreshActivityAudience(userId);

		res.json({ 
			message: "Music privacy updated successfully", 
			musicPrivacy: user.musicPrivacy 
		});
	} catch (error) {
		console.error("Error updating music privacy:", error);
		next(error);
	}
};

// NEW: Mark all messages from a specific user as read
export const markAllMessagesAsRead = async (req, res, next) => {
	try {
		const myId = req.auth.userId; // Current user ID
		const { userId } = req.params; // The sender's ID

		const reader = await User.findOne({ clerkId: myId }).select("readReceipts").lean();
		const result = await Message.updateMany(
			{ senderId: userId, receiverId: myId, readAt: null },
			// readAt drives unread badges; "read" ticks only when the reader shares receipts.
			{ readAt: new Date(), ...(reader?.readReceipts !== false ? { status: "read" } : {}) }
		);

		console.log(`✅ Marked ${result.modifiedCount} messages as read from user ${userId}`);

		res.status(200).json({
			message: 'Messages marked as read',
			modifiedCount: result.modifiedCount
		});

	} catch (error) {
		console.error("Error marking messages as read:", error);
		next(error);
	}
};

// NEW: Delete a specific message (soft delete or hard delete based on your needs)
// "Delete for me" hides a message from your own chat. "Delete for everyone"
// removes it for both people and is only for the sender.
export const deleteMessage = async (req, res, next) => {
	try {
		const myId = req.auth.userId;
		const { messageId } = req.params;
		if (!mongoose.isValidObjectId(messageId)) return res.status(404).json({ message: "Message not found" });

		const message = await Message.findById(messageId);
		if (!message || ![message.senderId, message.receiverId].includes(myId)) {
			return res.status(404).json({ message: "Message not found" });
		}

		// Older app versions sent no scope and meant "everyone" for their own messages.
		const scope = req.query.scope === "me" || req.query.scope === "everyone"
			? req.query.scope
			: message.senderId === myId ? "everyone" : "me";

		if (scope === "everyone") {
			if (message.senderId !== myId) {
				return res.status(403).json({ message: "You can only delete your own messages for everyone" });
			}
			await Message.deleteOne({ _id: messageId });
			// The other person's open chat drops it straight away.
			emitToUsers([message.senderId, message.receiverId], "messageDeleted", { messageId });
		} else {
			await Message.updateOne({ _id: messageId }, { $addToSet: { deletedFor: myId } });
		}

		res.status(200).json({ message: "Message deleted", messageId, scope });
	} catch (error) {
		console.error("Error deleting message:", error);
		next(error);
	}
};

// Top artists and recent songs for a profile, when its owner's listening
// privacy lets this viewer see them.
export const getProfileMusic = async (req, res, next) => {
	try {
		const viewerId = req.auth.userId;
		const { userId } = req.params;
		const owner = await User.findOne({ clerkId: userId }).select(PRIVACY_FIELDS).lean();
		if (!owner || (userId !== viewerId && owner.blockedUsers?.includes(viewerId))) {
			return res.status(404).json({ message: "User not found" });
		}
		if (!canSeeListeningHistory(owner, viewerId)) return res.json({ visible: false, topArtists: [], recent: [] });

		const activities = await ListeningActivity.find({ userId })
			.sort({ playedAt: -1 })
			.limit(500)
			.select("songId title artist imageUrl audioUrl albumId genre duration playedAt")
			.lean();
		res.json({ visible: true, ...summarizeListening(activities) });
	} catch (error) { next(error); }
};

export const clearListeningHistory = async (req, res, next) => {
	try {
		await ListeningActivity.deleteMany({ userId: req.auth.userId });
		res.status(204).end();
	} catch (error) { next(error); }
};

export const getBlockedUsers = async (req, res, next) => {
	try {
		const me = await User.findOne({ clerkId: req.auth.userId }).select("blockedUsers").lean();
		const users = await User.find({ clerkId: { $in: me?.blockedUsers ?? [] } })
			.select("clerkId fullName username imageUrl")
			.lean();
		res.json(users);
	} catch (error) { next(error); }
};

// Blocking ends the friendship and any pending request, and hides both
// people from each other's search, profile, messages and live map.
export const blockUser = async (req, res, next) => {
	try {
		const me = req.auth.userId;
		const target = String(req.params.userId || "");
		if (!target || target === me) return res.status(400).json({ message: "You can't block yourself" });
		if (!(await User.exists({ clerkId: target }))) return res.status(404).json({ message: "User not found" });
		await Promise.all([
			User.updateOne({ clerkId: me }, { $addToSet: { blockedUsers: target }, $pull: { friends: target } }),
			User.updateOne({ clerkId: target }, { $pull: { friends: me } }),
			FriendRequest.deleteMany({ $or: [{ senderId: me, receiverId: target }, { senderId: target, receiverId: me }] }),
		]);
		await refreshActivityAudience(me);
		res.json({ blocked: true });
	} catch (error) { next(error); }
};

export const unblockUser = async (req, res, next) => {
	try {
		await User.updateOne({ clerkId: req.auth.userId }, { $pull: { blockedUsers: String(req.params.userId || "") } });
		res.json({ blocked: false });
	} catch (error) { next(error); }
};

// Who can see what you're playing now and your listening history.
export const updatePrivacy = async (req, res, next) => {
	try {
		const updates = {};
		for (const key of ["musicPrivacy", "historyPrivacy"]) {
			if (req.body[key] === undefined) continue;
			if (!LISTENING_LEVELS.includes(req.body[key])) return res.status(400).json({ message: "Use everyone, friends or none" });
			updates[key] = req.body[key];
		}
		if (!Object.keys(updates).length) return res.status(400).json({ message: "Nothing to update" });
		const user = await User.findOneAndUpdate({ clerkId: req.auth.userId }, updates, { new: true }).select("musicPrivacy historyPrivacy").lean();
		if (!user) return res.status(404).json({ message: "User not found" });
		if (updates.musicPrivacy) await refreshActivityAudience(req.auth.userId);
		res.json({ musicPrivacy: user.musicPrivacy, historyPrivacy: user.historyPrivacy });
	} catch (error) { next(error); }
};

// People who never see your listening, whatever the settings above say.
export const getHiddenListeners = async (req, res, next) => {
	try {
		const me = await User.findOne({ clerkId: req.auth.userId }).select("musicHiddenFrom").lean();
		const users = await User.find({ clerkId: { $in: me?.musicHiddenFrom ?? [] } })
			.select("clerkId fullName username imageUrl")
			.lean();
		res.json(users);
	} catch (error) { next(error); }
};

export const hideListeningFrom = async (req, res, next) => {
	try {
		const target = String(req.params.userId || "");
		if (!target || target === req.auth.userId) return res.status(400).json({ message: "Choose someone else" });
		if (!(await User.exists({ clerkId: target }))) return res.status(404).json({ message: "User not found" });
		await User.updateOne({ clerkId: req.auth.userId }, { $addToSet: { musicHiddenFrom: target } });
		await refreshActivityAudience(req.auth.userId);
		res.json({ hidden: true });
	} catch (error) { next(error); }
};

export const showListeningTo = async (req, res, next) => {
	try {
		await User.updateOne({ clerkId: req.auth.userId }, { $pull: { musicHiddenFrom: String(req.params.userId || "") } });
		await refreshActivityAudience(req.auth.userId);
		res.json({ hidden: false });
	} catch (error) { next(error); }
};
