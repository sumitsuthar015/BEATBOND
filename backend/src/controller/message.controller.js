import mongoose from "mongoose";
import { Message } from "../models/message.model.js";
import { User } from "../models/user.model.js";
import { emitToUsers, setPresenceVisibility } from "../lib/socket.js";
import { REACTIONS, canEditMessage, toggleReaction } from "../services/chat.service.js";

const participants = (message) => [message.senderId, message.receiverId];

/** A message the signed-in user can see (they're in the chat and haven't deleted it). */
const findVisibleMessage = async (messageId, userId) => {
	if (!mongoose.isValidObjectId(messageId)) return null;
	const message = await Message.findById(messageId);
	if (!message || !participants(message).includes(userId) || message.deletedFor?.includes(userId)) return null;
	return message;
};

export const editMessage = async (req, res, next) => {
	try {
		const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
		if (!content) return res.status(400).json({ message: "Message cannot be empty" });
		if (content.length > 4000) return res.status(400).json({ message: "Message is too long" });
		const message = await findVisibleMessage(req.params.messageId, req.auth.userId);
		if (!message) return res.status(404).json({ message: "Message not found" });
		if (!canEditMessage(message, req.auth.userId)) {
			return res.status(403).json({ message: "You can edit your own messages for 15 minutes after sending them." });
		}
		message.content = content;
		message.editedAt = new Date();
		await message.save();
		const update = { messageId: message._id.toString(), content: message.content, editedAt: message.editedAt };
		emitToUsers(participants(message), "messageUpdated", update);
		res.json(update);
	} catch (error) { next(error); }
};

export const reactToMessage = async (req, res, next) => {
	try {
		const emoji = req.body?.emoji;
		if (!REACTIONS.includes(emoji)) return res.status(400).json({ message: "Unsupported reaction" });
		const message = await findVisibleMessage(req.params.messageId, req.auth.userId);
		if (!message) return res.status(404).json({ message: "Message not found" });
		const current = message.reactions.map(({ userId, emoji: existing }) => ({ userId, emoji: existing }));
		message.reactions = toggleReaction(current, req.auth.userId, emoji);
		await message.save();
		const update = { messageId: message._id.toString(), reactions: message.reactions.map(({ userId, emoji: value }) => ({ userId, emoji: value })) };
		emitToUsers(participants(message), "messageUpdated", update);
		res.json(update);
	} catch (error) { next(error); }
};

// A muted chat still delivers messages; it just doesn't create notifications.
const setMuted = (muted) => async (req, res, next) => {
	try {
		const friendId = String(req.params.userId || "");
		if (!friendId) return res.status(400).json({ message: "Choose a chat" });
		await User.updateOne({ clerkId: req.auth.userId }, muted ? { $addToSet: { mutedChats: friendId } } : { $pull: { mutedChats: friendId } });
		res.json({ muted });
	} catch (error) { next(error); }
};
export const muteChat = setMuted(true);
export const unmuteChat = setMuted(false);

const CHAT_SETTINGS = ["readReceipts", "showActivityStatus", "messageNotifications"];

export const updateChatSettings = async (req, res, next) => {
	try {
		const updates = Object.fromEntries(CHAT_SETTINGS.filter((key) => typeof req.body?.[key] === "boolean").map((key) => [key, req.body[key]]));
		if (!Object.keys(updates).length) return res.status(400).json({ message: "Nothing to update" });
		const user = await User.findOneAndUpdate({ clerkId: req.auth.userId }, updates, { new: true }).select(CHAT_SETTINGS.join(" ")).lean();
		if (!user) return res.status(404).json({ message: "User not found" });
		if ("showActivityStatus" in updates) setPresenceVisibility(req.auth.userId, updates.showActivityStatus);
		res.json(Object.fromEntries(CHAT_SETTINGS.map((key) => [key, user[key] !== false])));
	} catch (error) { next(error); }
};
