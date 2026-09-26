import { FriendRequest } from "../models/friendRequest.model.js";
import { User } from "../models/user.model.js";
import { Notification } from "../models/notification.model.js";
import { Message } from "../models/message.model.js";
import { isUserOnline, refreshActivityAudience } from "../lib/socket.js";
import { canSeePresence } from "../services/chat.service.js";

export const sendFriendRequest = async (req, res, next) => {
  try {
    const senderId = req.auth.userId;
    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).json({ error: "Receiver ID is required" });
    }

    if (senderId === receiverId) {
      return res.status(400).json({ error: "You cannot send a friend request to yourself" });
    }

    // Check if receiver exists
    const receiver = await User.findOne({ clerkId: receiverId });
    if (!receiver) {
      return res.status(404).json({ error: "User not found" });
    }

    const sender = await User.findOne({ clerkId: senderId });
    const senderName = sender?.fullName || 'Someone';

    if (receiver.blockedUsers?.includes(senderId) || sender?.blockedUsers?.includes(receiverId)) {
      return res.status(403).json({ error: "You can't send a friend request to this user" });
    }

    // Check if request already exists
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId }
      ]
    });

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return res.status(400).json({ error: "Friend request already sent" });
      } else if (existingRequest.status === 'accepted') {
        return res.status(400).json({ error: "You are already friends" });
      } else if (existingRequest.status === 'rejected') {
        // Update rejected request to pending
        existingRequest.status = 'pending';
        existingRequest.senderId = senderId;
        existingRequest.receiverId = receiverId;
        await existingRequest.save();

        // Create notification
        await Notification.create({
          userId: receiverId,
          message: `${senderName} sent you a friend request`,
          type: 'friend_request',
          metadata: { requestId: existingRequest._id, senderId }
        });

        return res.status(200).json(existingRequest);
      }
    }

    // Create new friend request
    const request = await FriendRequest.create({
      senderId,
      receiverId
    });

    // Create notification for receiver
    await Notification.create({
      userId: receiverId,
      message: `${senderName} sent you a friend request`,
      type: 'friend_request',
      metadata: { requestId: request._id, senderId }
    });

    res.status(201).json(request);
  } catch (error) {
    console.error("Send friend request error:", error);
    next(error);
  }
};

export const respondToFriendRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body;
    const userId = req.auth.userId;

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be 'accepted' or 'rejected'" });
    }

    const request = await FriendRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({ error: "Friend request not found" });
    }

    // Verify the user is the receiver
    if (request.receiverId !== userId) {
      return res.status(403).json({ error: "You are not authorized to respond to this request" });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: "This request has already been responded to" });
    }

    request.status = status;
    await request.save();

    if (status === 'accepted') {
      await User.updateOne(
        { clerkId: request.senderId },
        { $addToSet: { friends: request.receiverId } }
      );
      await User.updateOne(
        { clerkId: request.receiverId },
        { $addToSet: { friends: request.senderId } }
      );
    }

    const currentUser = await User.findOne({ clerkId: userId });

    await Notification.create({
      userId: request.senderId,
      message: `${currentUser?.fullName || 'Someone'} ${status} your friend request`,
      type: 'friend_request_response',
      metadata: { action: status }
    });

    res.status(200).json(request);
  } catch (error) {
    console.error("Respond to friend request error:", error);
    next(error);
  }
};

export const cancelFriendRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const userId = req.auth.userId;

    const request = await FriendRequest.findOneAndDelete({
      _id: requestId,
      senderId: userId,
      status: "pending",
    });

    if (!request) {
      return res.status(404).json({ error: "Pending friend request not found" });
    }

    await Notification.deleteMany({
      userId: request.receiverId,
      type: "friend_request",
      "metadata.requestId": request._id,
    });

    res.status(200).json({ success: true, message: "Friend request cancelled" });
  } catch (error) {
    console.error("Cancel friend request error:", error);
    next(error);
  }
};

export const getFriends = async (req, res, next) => {
  try {
    const viewerId = req.auth.userId;
    const userId = req.params.userId || viewerId;

    const profileUser = await User.findOne({ clerkId: userId }).select("friends").lean();
    if (!profileUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const acceptedRequests = await FriendRequest.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
      status: "accepted"
    }).lean();

    // Keep existing accounts working: older connections may only exist in the
    // User.friends array, while newer ones also have an accepted request.
    const friendIds = [...new Set([
      ...(profileUser.friends || []),
      ...acceptedRequests.map(request =>
      request.senderId === userId ? request.receiverId : request.senderId
      ),
    ])];

    // Public profile fields only (never emails). Online status and last seen
    // follow both people's "show online status" choice.
    const [friends, viewer] = await Promise.all([
      User.find({ clerkId: { $in: friendIds } }).select("clerkId fullName username imageUrl lastSeen showActivityStatus").lean(),
      User.findOne({ clerkId: viewerId }).select("clerkId showActivityStatus mutedChats").lean(),
    ]);
    const present = ({ showActivityStatus, lastSeen, ...friend }) => {
      const shown = canSeePresence({ clerkId: friend.clerkId, showActivityStatus }, viewer ?? { clerkId: viewerId });
      return { ...friend, isOnline: shown && isUserOnline(friend.clerkId), lastSeen: shown ? lastSeen : undefined };
    };

    // A public profile's connections should not expose the viewer's private
    // message previews or unread counts.
    if (userId !== viewerId) {
      return res.status(200).json(friends.map(present));
    }

    const [latestMessages, unreadMessages] = await Promise.all([
      Message.aggregate([
        { $match: { $or: [{ senderId: userId, receiverId: { $in: friendIds } }, { receiverId: userId, senderId: { $in: friendIds } }], deletedFor: { $ne: userId } } },
        { $addFields: { conversationUserId: { $cond: [{ $eq: ["$senderId", userId] }, "$receiverId", "$senderId"] } } },
        { $sort: { createdAt: -1, _id: -1 } },
        { $group: { _id: "$conversationUserId", content: { $first: "$content" }, createdAt: { $first: "$createdAt" }, senderId: { $first: "$senderId" }, sharedTitle: { $first: "$sharedContent.title" } } },
      ]),
      Message.aggregate([
        { $match: { receiverId: userId, senderId: { $in: friendIds }, readAt: null, deletedFor: { $ne: userId } } },
        { $group: { _id: "$senderId", unreadCount: { $sum: 1 } } },
      ]),
    ]);
    const latestByFriend = new Map(latestMessages.map((message) => [message._id, message]));
    const unreadByFriend = new Map(unreadMessages.map((message) => [message._id, message.unreadCount]));

    res.status(200).json(friends.map((friend) => {
      const latest = latestByFriend.get(friend.clerkId);
      return {
        ...present(friend),
        lastMessage: latest?.content || (latest?.sharedTitle ? `🎵 ${latest.sharedTitle}` : undefined),
        lastMessageTime: latest?.createdAt,
        lastMessageFromMe: latest ? latest.senderId === userId : undefined,
        unreadCount: unreadByFriend.get(friend.clerkId) ?? 0,
        isMuted: Boolean(viewer?.mutedChats?.includes(friend.clerkId)),
      };
    }).sort((a, b) => new Date(b.lastMessageTime || 0).getTime() - new Date(a.lastMessageTime || 0).getTime()));
  } catch (error) {
    console.error("Get friends error:", error);
    next(error);
  }
};

export const getPendingRequests = async (req, res, next) => {
  try {
    const userId = req.auth.userId;
    
    const pendingRequests = await FriendRequest.find({
      receiverId: userId,
      status: "pending"
    }).sort({ createdAt: -1 });

    // Manually get sender info for each request
    const requestsWithSenderInfo = await Promise.all(
      pendingRequests.map(async (request) => {
        const sender = await User.findOne({ clerkId: request.senderId })
          .select('clerkId fullName imageUrl email');
        
        return {
          _id: request._id,
          senderId: request.senderId,
          receiverId: request.receiverId,
          status: request.status,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt,
          sender: sender ? {
            clerkId: sender.clerkId,
            fullName: sender.fullName,
            imageUrl: sender.imageUrl,
            email: sender.email
          } : null
        };
      })
    );

    res.status(200).json(requestsWithSenderInfo);
  } catch (error) {
    console.error("Get pending requests error:", error);
    next(error);
  }
};

export const getFriendshipStatus = async (req, res, next) => {
  try {
    const userId = req.auth.userId;
    const { targetUserId } = req.params;

    if (!targetUserId) {
      return res.status(400).json({ error: "Target user ID is required" });
    }

    if (userId === targetUserId) {
      return res.status(400).json({ error: "Cannot check friendship status with yourself" });
    }

    const request = await FriendRequest.findOne({
      $or: [
        { senderId: userId, receiverId: targetUserId },
        { senderId: targetUserId, receiverId: userId }
      ]
    });

    if (!request) {
      return res.status(200).json({
        status: 'none',
        requestId: null,
        receiverId: null,
        senderId: null
      });
    }

    res.status(200).json({
      status: request.status,
      requestId: request._id,
      receiverId: request.receiverId,
      senderId: request.senderId
    });
  } catch (error) {
    console.error("Get friendship status error:", error);
    next(error);
  }
};

export const removeFriend = async (req, res, next) => {
  try {
    const userId = req.auth.userId;
    const { friendId } = req.params;

    if (!friendId) {
      return res.status(400).json({ error: "Friend ID is required" });
    }

    const result = await FriendRequest.findOneAndDelete({
      $or: [
        { senderId: userId, receiverId: friendId, status: 'accepted' },
        { senderId: friendId, receiverId: userId, status: 'accepted' }
      ]
    });

    if (!result) {
      return res.status(404).json({ error: "Friendship not found" });
    }

    await User.updateOne(
      { clerkId: userId },
      { $pull: { friends: friendId } }
    );
    await User.updateOne(
      { clerkId: friendId },
      { $pull: { friends: userId } }
    );
    // Friends-only listening stops reaching each other straight away.
    await Promise.all([refreshActivityAudience(userId), refreshActivityAudience(friendId)]);

    res.status(200).json({ success: true, message: "Friend removed successfully" });
  } catch (error) {
    console.error("Remove friend error:", error);
    next(error);
  }
};

export const getMutualFriends = async (req, res, next) => {
  try {
    const viewerId = req.auth.userId;
    const { userId } = req.params;

    const [viewer, target] = await Promise.all([
      User.findOne({ clerkId: viewerId }).select("friends").lean(),
      User.findOne({ clerkId: userId }).select("friends").lean(),
    ]);

    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }

    const viewerFriends = viewer?.friends || [];
    const targetFriends = target?.friends || [];

    const mutualIds = targetFriends.filter((id) => viewerFriends.includes(id));

    const mutualFriends = await User.find({
      clerkId: { $in: mutualIds }
    }).select("clerkId fullName username imageUrl email isOnline lastSeen").lean();

    res.status(200).json(
      mutualFriends.map((friend) => ({
        ...friend,
        isOnline: isUserOnline(friend.clerkId),
      }))
    );
  } catch (error) {
    console.error("Get mutual friends error:", error);
    next(error);
  }
};
