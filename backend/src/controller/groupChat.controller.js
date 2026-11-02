import mongoose from "mongoose";
import { GroupConversation } from "../models/groupConversation.model.js";
import { GroupMessage } from "../models/groupMessage.model.js";
import { User } from "../models/user.model.js";
import cloudinary from "../lib/cloudinary.js";
import fs from "node:fs/promises";

const accessible = (conversationId, userId) => GroupConversation.findOne({ _id: conversationId, "members.userId": userId });

export const listGroupChats = async (req, res, next) => {
  try {
    const groups = await GroupConversation.find({ "members.userId": req.auth().userId }).sort({ lastMessageAt: -1 }).lean();
    const ids = [...new Set(groups.flatMap((group) => group.members.map((member) => member.userId)))];
    const users = await User.find({ clerkId: { $in: ids } }).select("clerkId fullName imageUrl").lean();
    const userById = new Map(users.map((user) => [user.clerkId, user]));
    res.json(groups.map((group) => ({ ...group, id: String(group._id), members: group.members.map((member) => ({ ...member, user: userById.get(member.userId) })) })));
  } catch (error) { next(error); }
};

export const createGroupChat = async (req, res, next) => {
  try {
    const ownerId = req.auth().userId;
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    const imageUrl = typeof req.body?.imageUrl === "string" ? req.body.imageUrl.trim() : "";
    const requested = Array.isArray(req.body?.memberIds) ? [...new Set(req.body.memberIds.filter((id) => typeof id === "string" && id !== ownerId))] : [];
    if (!name || name.length > 80) return res.status(400).json({ message: "Group name must be 1 to 80 characters." });
    if (description.length > 300 || !validGroupImage(imageUrl)) return res.status(400).json({ message: "Group description or image URL is invalid." });
    if (requested.length < 2 || requested.length > 20) return res.status(400).json({ message: "Choose 2 to 20 friends for a group chat." });
    const [owner, members] = await Promise.all([
      User.findOne({ clerkId: ownerId }).select("friends blockedUsers").lean(),
      User.find({ clerkId: { $in: requested } }).select("clerkId blockedUsers").lean(),
    ]);
    const memberIds = [ownerId, ...requested];
    if (!owner || requested.some((id) => !owner.friends?.includes(id) || owner.blockedUsers?.includes(id)) || members.length !== requested.length || members.some((member) => memberIds.some((id) => id !== member.clerkId && member.blockedUsers?.includes(id)))) return res.status(403).json({ message: "Group chats can include your friends only." });
    const conversation = await GroupConversation.create({ name, description, imageUrl, ownerId, members: [ownerId, ...requested].map((userId) => ({ userId })) });
    res.status(201).json({ ...conversation.toObject(), id: String(conversation._id) });
  } catch (error) { next(error); }
};

const validGroupImage = (value) => {
  if (!value) return true;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
};

export const updateGroupChat = async (req, res, next) => {
  try {
    const groupId = req.params.groupId;
    if (!mongoose.isValidObjectId(groupId)) return res.status(404).json({ message: "Group chat not found." });
    const updates = {};
    if (req.body?.name !== undefined) {
      if (typeof req.body.name !== "string" || !req.body.name.trim() || req.body.name.trim().length > 80) return res.status(400).json({ message: "Group name must be 1 to 80 characters." });
      updates.name = req.body.name.trim();
    }
    if (req.body?.description !== undefined) {
      if (typeof req.body.description !== "string" || req.body.description.trim().length > 300) return res.status(400).json({ message: "Description must be 300 characters or fewer." });
      updates.description = req.body.description.trim();
    }
    if (req.body?.imageUrl !== undefined) {
      if (typeof req.body.imageUrl !== "string" || req.body.imageUrl.trim().length > 2000 || !validGroupImage(req.body.imageUrl.trim())) return res.status(400).json({ message: "Enter a valid HTTP or HTTPS image URL." });
      updates.imageUrl = req.body.imageUrl.trim();
    }
    if (!Object.keys(updates).length) return res.status(400).json({ message: "No group details were provided." });
    const group = await GroupConversation.findOneAndUpdate({ _id: groupId, ownerId: req.auth().userId }, updates, { new: true, runValidators: true }).lean();
    if (!group) return res.status(404).json({ message: "Group not found or you are not its owner." });
    res.json({ ...group, id: String(group._id) });
  } catch (error) { next(error); }
};

export const addGroupChatMember = async (req, res, next) => {
  try {
    const groupId = req.params.groupId;
    const ownerId = req.auth().userId;
    const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
    if (!mongoose.isValidObjectId(groupId)) return res.status(404).json({ message: "Group chat not found." });
    if (!userId || userId === ownerId) return res.status(400).json({ message: "Choose a friend to add." });
    const [group, owner, invitee] = await Promise.all([
      GroupConversation.findOne({ _id: groupId, ownerId }),
      User.findOne({ clerkId: ownerId }).select("friends blockedUsers").lean(),
      User.findOne({ clerkId: userId }).select("clerkId blockedUsers").lean(),
    ]);
    if (!group) return res.status(404).json({ message: "Group not found or you are not its owner." });
    if (group.members.some((member) => member.userId === userId)) return res.status(409).json({ message: "That friend is already in the group." });
    if (group.members.length >= 21) return res.status(400).json({ message: "A group can have up to 21 members." });
    if (!invitee || !owner?.friends?.includes(userId) || owner.blockedUsers?.includes(userId) || invitee.blockedUsers?.includes(ownerId)) return res.status(403).json({ message: "Only friends can be added to this group." });
    group.members.push({ userId });
    await group.save();
    const ids = group.members.map((member) => member.userId);
    const users = await User.find({ clerkId: { $in: ids } }).select("clerkId fullName imageUrl").lean();
    const userById = new Map(users.map((user) => [user.clerkId, user]));
    res.json({ ...group.toObject(), id: String(group._id), members: group.members.map((member) => ({ ...member.toObject(), user: userById.get(member.userId) })) });
  } catch (error) { next(error); }
};

const removeMemberFromGroup = async (req, group, userId, action) => {
  const groupId = String(group._id);
  const remainingMembers = group.members.filter((member) => member.userId !== userId);
  const isOwnerLeaving = group.ownerId === userId;
  if (remainingMembers.length === 0) {
    req.app.locals.groupChatIo?.to(`group-chat:${groupId}`).emit("chat:membership", { groupId, userId, action, groupDeleted: true });
    await GroupMessage.deleteMany({ conversationId: group._id });
    await group.deleteOne();
  } else {
    group.members = remainingMembers;
    if (isOwnerLeaving) {
      const nextOwner = [...remainingMembers].sort((first, second) => new Date(first.joinedAt).getTime() - new Date(second.joinedAt).getTime())[0];
      group.ownerId = nextOwner.userId;
    }
    await group.save();
    req.app.locals.groupChatIo?.to(`group-chat:${groupId}`).emit("chat:membership", { groupId, userId, action, groupDeleted: false, ownerId: group.ownerId });
  }

  const roomName = `group-chat:${groupId}`;
  const activeSockets = await req.app.locals.groupChatIo?.in(roomName).fetchSockets() || [];
  await Promise.all(activeSockets.filter((socket) => socket.data.userId === userId).map(async (socket) => {
    socket.leave(roomName);
    socket.data.groupChatIds?.delete(groupId);
  }));
  return { groupDeleted: remainingMembers.length === 0, ownerId: isOwnerLeaving && remainingMembers.length ? group.ownerId : undefined };
};

export const removeGroupChatMember = async (req, res, next) => {
  try {
    const { groupId, userId } = req.params;
    const ownerId = req.auth().userId;
    if (!mongoose.isValidObjectId(groupId)) return res.status(404).json({ message: "Group chat not found." });
    if (!userId || userId === ownerId) return res.status(400).json({ message: "The group owner cannot remove themselves. Use Leave group instead." });
    const group = await GroupConversation.findOne({ _id: groupId, ownerId });
    if (!group) return res.status(404).json({ message: "Group not found or you are not its owner." });
    if (!group.members.some((member) => member.userId === userId)) return res.status(404).json({ message: "That member is not in this group." });
    const result = await removeMemberFromGroup(req, group, userId, "removed");
    res.json({ ok: true, ...result });
  } catch (error) { next(error); }
};

export const leaveGroupChat = async (req, res, next) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.auth().userId;
    if (!mongoose.isValidObjectId(groupId)) return res.status(404).json({ message: "Group chat not found." });
    const group = await GroupConversation.findOne({ _id: groupId, "members.userId": userId });
    if (!group) return res.status(404).json({ message: "You are not a member of this group." });
    const result = await removeMemberFromGroup(req, group, userId, "left");
    res.json({ ok: true, ...result });
  } catch (error) { next(error); }
};

export const uploadGroupChatImage = async (req, res, next) => {
  const photo = req.files?.photo;
  try {
    const groupId = req.params.groupId;
    if (!mongoose.isValidObjectId(groupId)) return res.status(404).json({ message: "Group chat not found." });
    if (!photo || Array.isArray(photo)) return res.status(400).json({ message: "Choose a group photo to upload." });
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(photo.mimetype)) return res.status(400).json({ message: "Choose a JPEG, PNG, WebP, or GIF image." });
    if (photo.size > 5 * 1024 * 1024) return res.status(400).json({ message: "Group photos must be 5 MB or smaller." });
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return res.status(503).json({ message: "Photo uploads are not configured yet." });

    const group = await GroupConversation.findOne({ _id: groupId, ownerId: req.auth().userId });
    if (!group) return res.status(404).json({ message: "Group not found or you are not its owner." });
    const uploaded = await cloudinary.uploader.upload(photo.tempFilePath, { folder: "beatbond/group-chats", resource_type: "image" });
    const previousPublicId = group.imagePublicId;
    group.imageUrl = uploaded.secure_url;
    group.imagePublicId = uploaded.public_id;
    await group.save();
    if (previousPublicId) await cloudinary.uploader.destroy(previousPublicId, { resource_type: "image" }).catch(() => {});
    res.json({ id: String(group._id), imageUrl: group.imageUrl });
  } catch (error) {
    if (error?.http_code === 401 || /invalid signature/i.test(error?.message || "")) return res.status(503).json({ message: "Photo upload configuration is invalid." });
    next(error);
  } finally {
    if (photo?.tempFilePath) await fs.unlink(photo.tempFilePath).catch(() => {});
  }
};

export const getGroupMessages = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.groupId)) return res.status(404).json({ message: "Group chat not found." });
    const group = await accessible(req.params.groupId, req.auth().userId).lean();
    if (!group) return res.status(404).json({ message: "Group chat not found." });
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const before = req.query.before ? new Date(req.query.before) : null;
    const filter = { conversationId: group._id };
    if (before && Number.isFinite(before.getTime())) filter.createdAt = { $lt: before };
    const messages = await GroupMessage.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(messages.reverse());
  } catch (error) { next(error); }
};
