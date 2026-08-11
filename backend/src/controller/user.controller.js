import { User } from "../models/user.model.js";
import { Message } from "../models/message.model.js";
import { ListeningActivity } from "../models/listeningActivity.model.js";
import { FriendRequest } from "../models/friendRequest.model.js";
import mongoose from "mongoose";
import { isUserOnline } from "../lib/socket.js";

export const saveListeningActivity = async (req, res, next) => {
	try {
		const { _id, title, artist, imageUrl, audioUrl, albumId, genre, duration } = req.body;
		if (!_id || !title) return res.status(400).json({ message: "Song id and title are required" });
		const activity = await ListeningActivity.create({
			userId: req.auth.userId,
			songId: String(_id), title, artist, imageUrl, audioUrl, albumId, genre,
			duration: Number(duration) || 0, playedAt: new Date(),
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
			lyrics: "", createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
		})));
	} catch (error) { next(error); }
};

export const getAllUsers = async (req, res, next) => {
	try {
		const currentUserId = req.auth.userId;
		const users = await User.find({ clerkId: { $ne: currentUserId } }).lean();
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

		const totalMessages = await Message.countDocuments({
			$or: [
				{ senderId: userId, receiverId: myId },
				{ senderId: myId, receiverId: userId },
			],
		});

		const messages = await Message.find({
			$or: [
				{ senderId: userId, receiverId: myId },
				{ senderId: myId, receiverId: userId },
			],
		})
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
			messages: reversedMessages,
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
		const result = await Message.deleteMany({
			$or: [
				{ senderId: myId, receiverId: userId },
				{ senderId: userId, receiverId: myId },
			],
		});
		res.status(200).json({ success: true, deletedCount: result.deletedCount });
	} catch (error) {
		next(error);
	}
};

import { clerkClient } from "@clerk/express";

export const syncClerkUsersToDatabase = async () => {
	try {
		const clerkUsersResponse = await clerkClient.users.getUserList({ limit: 100 });
		const clerkUsers = clerkUsersResponse?.data || (Array.isArray(clerkUsersResponse) ? clerkUsersResponse : []);
		if (!clerkUsers.length) return;

		for (const clerkUser of clerkUsers) {
			const email = clerkUser.emailAddresses?.[0]?.emailAddress || "";
			const username = clerkUser.username || (email ? email.split("@")[0] : `user_${clerkUser.id.slice(-6)}`);
			const fullName = `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || username;
			const imageUrl = clerkUser.imageUrl || "";

			await User.findOneAndUpdate(
				{ clerkId: clerkUser.id },
				{
					$setOnInsert: {
						clerkId: clerkUser.id,
						email,
						username,
						fullName,
						imageUrl,
						isOnline: false,
					},
					$set: {
						imageUrl,
						fullName: fullName || username,
						username,
					}
				},
				{ upsert: true, new: true }
			);
		}
	} catch (error) {
		console.error("Error syncing Clerk users to DB:", error.message);
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
		const escaped = queryStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const searchRegex = new RegExp(escaped, 'i');

		const users = await User.find({
			clerkId: { $ne: currentUserId },
			$or: [
				{ fullName: searchRegex },
				{ username: searchRegex },
				{ email: searchRegex }
			]
		})
		.select('clerkId fullName username imageUrl bio isOnline friends')
		.limit(30)
		.lean();

		const formattedUsers = users.map((user) => ({
			...user,
			fullName: user.fullName || user.username || "Beatbond User",
			imageUrl: user.imageUrl || "/default-avatar.png",
			isOnline: isUserOnline(user.clerkId),
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
			clerkId: { $nin: [currentUserId, ...friendIds] },
		})
			.select('clerkId fullName username imageUrl bio isOnline friends')
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
				isOnline: isUserOnline(user.clerkId),
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
		const currentUserId = req.auth.userId;

		if (currentUserId !== clerkId) {
			return res.status(403).json({ message: "You can only update your own profile" });
		}

		const { fullName, username, bio, imageUrl, email, location, website } = req.body;

		const user = await User.findOne({ clerkId });
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Update user fields
		if (fullName) user.fullName = fullName;
		if (username) user.username = username;
		if (bio !== undefined) user.bio = bio;
		if (imageUrl) user.imageUrl = imageUrl;
		if (email) user.email = email;
		if (location !== undefined) user.location = location;
		if (website !== undefined) user.website = website;

		await user.save();

		res.status(200).json({
			message: "Profile updated successfully",
			user
		});
	} catch (error) {
		next(error);
	}
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
		const isFriend = currentUser?.friends?.includes(profileUserId) || false;
		
		// ⭐ NEW - Determine if viewer can see music activity
		let canSeeMusicActivity = false;
		if (profileUserId === currentUserId) {
			canSeeMusicActivity = true; // Own profile
		} else if (user.musicPrivacy === 'everyone') {
			canSeeMusicActivity = true;
		} else if (user.musicPrivacy === 'friends' && isFriend) {
			canSeeMusicActivity = true;
		}

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
			isOnline: isUserOnline(user.clerkId),
			lastSeen: user.lastSeen,
			// ⭐ NEW FIELDS
			musicPrivacy: user.musicPrivacy || 'friends',
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

		console.log(`🔒 User ${userId} updated music privacy to: ${musicPrivacy}`);

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

		const result = await Message.updateMany(
			{
				senderId: userId,
				receiverId: myId,
				status: { $ne: 'read' }
			},
			{
				status: 'read',
				readAt: new Date()
			}
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
export const deleteMessage = async (req, res, next) => {
	try {
		const myId = req.auth.userId;
		const { messageId } = req.params;

		// Find the message
		const message = await Message.findById(messageId);

		if (!message) {
			return res.status(404).json({ message: "Message not found" });
		}

		// Only allow sender to delete their own message
		if (message.senderId !== myId) {
			return res.status(403).json({ message: "You can only delete your own messages" });
		}

		// Hard delete (or you can implement soft delete by adding a 'deleted' field)
		await Message.findByIdAndDelete(messageId);

		console.log(`🗑️ Message ${messageId} deleted by user ${myId}`);

		res.status(200).json({
			message: 'Message deleted successfully',
			messageId
		});

	} catch (error) {
		console.error("Error deleting message:", error);
		next(error);
	}
};
