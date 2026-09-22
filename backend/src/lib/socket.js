import { verifyToken } from "@clerk/express";
import { Server } from "socket.io";
import mongoose from "mongoose";
import { isDatabaseConnected } from "./db.js";
import { Message } from "../models/message.model.js";
import { Notification } from "../models/notification.model.js";
import { User } from "../models/user.model.js";

const userSockets = new Map();
const userActivities = new Map();

// Socket membership is the only presence source of truth. Database fields are
// retained for last-seen/profile views, but are never used to infer presence.
export const isUserOnline = (userId) => userSockets.has(userId);
export const getOnlineUserIds = () => Array.from(userSockets.keys());

const SOCKET_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://beatbond-75ns.onrender.com",
];

const addUserSocket = (userId, socketId) => {
  const sockets = userSockets.get(userId) ?? new Set();
  sockets.add(socketId);
  userSockets.set(userId, sockets);
};

const removeUserSocket = (userId, socketId) => {
  const sockets = userSockets.get(userId);
  if (!sockets) return false;

  sockets.delete(socketId);
  if (sockets.size > 0) return false;

  userSockets.delete(userId);
  return true;
};

const emitToUser = (io, userId, event, payload) => {
  for (const socketId of userSockets.get(userId) ?? []) {
    io.to(socketId).emit(event, payload);
  }
};

export const emitLikedArtistsUpdate = (userId, artists) => {
  if (socketServer) emitToUser(socketServer, userId, "liked_artists_updated", artists);
};

// Realtime updates carry metadata only. Clients always re-fetch through the
// existing authenticated HTTP endpoints, so a socket event can never expose
// another user's private data.
export const emitRealtimeUpdate = ({ resource, actorId = null }) => {
  socketServer?.emit("data_updated", {
    resource,
    actorId,
    changedAt: Date.now(),
  });
};

let socketServer = null;
let presenceReset = Promise.resolve();
let hasResetStalePresence = false;

const resetStalePresence = () => {
  // This is a once-per-process startup action. Running it after a later
  // reconnect would incorrectly mark currently connected users as offline.
  if (hasResetStalePresence || !isDatabaseConnected()) return presenceReset;

  hasResetStalePresence = true;
  presenceReset = User.updateMany({ isOnline: true }, { isOnline: false }).catch((error) => {
    console.error("Unable to clear stale presence records:", error.message);
  });
  return presenceReset;
};

// Coordinates are never sent through the socket. This is only a refresh
// signal; the authenticated HTTP endpoint applies the visibility policy before
// it returns any location data to a client.
export const emitLocationToFriends = async (userId, location) => {
  if (!socketServer) return;
  if (location?.visibility === "everyone") {
    socketServer.emit("live_location_updated", { userId });
    return;
  }
  const user = await User.findOne({ clerkId: userId }).select("friends").lean();
  for (const friendId of user?.friends ?? []) {
    emitToUser(socketServer, friendId, "friend_location_updated", { userId });
  }
};

const emitOnlineUsers = (io) => {
  io.emit("users_online", getOnlineUserIds());
};

const isFriend = (user, otherUserId) => user.friends?.includes(otherUserId);

export const initializeSocket = (server) => {
  // A process restart invalidates every old socket. Wait until MongoDB is
  // actually connected before clearing persisted presence, rather than adding
  // the query to Mongoose's disconnected command buffer.
  resetStalePresence();
  mongoose.connection.once("connected", resetStalePresence);

  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || process.env.NODE_ENV !== "production") {
          return callback(null, true);
        }
        return callback(null, true);
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    // Detect lost network connections quickly; normal browser closes still
    // trigger `disconnect` immediately.
    pingTimeout: 20000,
    pingInterval: 10000,
  });
  socketServer = io;

  io.use(async (socket, next) => {
    if (!isDatabaseConnected()) {
      return next(new Error("Service temporarily unavailable"));
    }

    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication error"));

    try {
      const claims = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      const userId = claims?.sub;
      if (!userId) return next(new Error("Authentication error"));

      const user = await User.findOne({ clerkId: userId }).select(
        "clerkId fullName friends blockedUsers musicPrivacy"
      );
      if (!user) return next(new Error("Authentication error"));

      socket.user = user;
      next();
    } catch (error) {
      console.error("Socket authentication failed:", error.message);
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.user.clerkId;
    // Ensure startup cleanup cannot overwrite a connection that arrives while
    // MongoDB is clearing records left by the previous server process.
    await resetStalePresence();
    await presenceReset;
    const wasOffline = !userSockets.has(userId);
    addUserSocket(userId, socket.id);

    try {
      if (wasOffline) {
        await User.updateOne({ clerkId: userId }, { isOnline: true });
        io.emit("user_connected", userId);

        const pendingMessages = await Message.find({ receiverId: userId, status: "sent" }).select(
          "_id senderId"
        );
        if (pendingMessages.length > 0) {
          await Message.updateMany(
            { _id: { $in: pendingMessages.map((message) => message._id) } },
            { status: "delivered" }
          );
          for (const message of pendingMessages) {
            emitToUser(io, message.senderId, "messageStatusUpdate", {
              messageId: message._id.toString(),
              status: "delivered",
            });
          }
        }
      }
      emitOnlineUsers(io);

      const activityUsers = await User.find({
        clerkId: { $in: Array.from(userActivities.keys()) },
      }).select("clerkId musicPrivacy");
      const visibleActivities = activityUsers.flatMap((activityUser) => {
        const isVisible =
          activityUser.musicPrivacy === "everyone" ||
          (activityUser.musicPrivacy === "friends" && isFriend(socket.user, activityUser.clerkId));

        const activity = userActivities.get(activityUser.clerkId);
        return isVisible && activity ? [[activityUser.clerkId, activity]] : [];
      });
      socket.emit("activities", visibleActivities);
    } catch (error) {
      console.error("Socket connection setup failed:", error);
    }

    socket.on("update_activity", async (payload) => {
      const activity = typeof payload === "string" ? payload : payload?.activity;
      if (typeof activity !== "string" || !activity.trim()) return;

      const activityString = activity.trim().slice(0, 500);
      try {
        const currentUser = await User.findOne({ clerkId: userId }).select("friends musicPrivacy");
        if (!currentUser) return;

        userActivities.set(userId, activityString);
        await User.updateOne({ clerkId: userId }, { currentActivity: activityString });

        if (currentUser.musicPrivacy === "everyone") {
          io.emit("activity_updated", { userId, activity: activityString });
        } else if (currentUser.musicPrivacy === "friends") {
          for (const friendId of currentUser.friends ?? []) {
            emitToUser(io, friendId, "activity_updated", { userId, activity: activityString });
          }
        }
      } catch (error) {
        console.error("Error updating activity:", error);
      }
    });

    socket.on("clear_activity", async () => {
      try {
        const currentUser = await User.findOne({ clerkId: userId }).select("friends musicPrivacy");
        if (!currentUser) return;

        userActivities.delete(userId);
        await User.updateOne({ clerkId: userId }, { currentActivity: null });

        if (currentUser.musicPrivacy === "everyone") {
          io.emit("activity_cleared", { userId });
        } else if (currentUser.musicPrivacy === "friends") {
          for (const friendId of currentUser.friends ?? []) {
            emitToUser(io, friendId, "activity_cleared", { userId });
          }
        }
      } catch (error) {
        console.error("Error clearing activity:", error);
      }
    });

    socket.on("sendMessage", async (data = {}) => {
      try {
        const receiverId = typeof data.receiverId === "string" ? data.receiverId : "";
        const content = typeof data.content === "string" ? data.content.trim() : "";
        if (!receiverId || receiverId === userId) throw new Error("Invalid recipient");
        if (!content) throw new Error("Message cannot be empty");
        if (content.length > 4000) throw new Error("Message is too long");
        if (!isFriend(socket.user, receiverId)) {
          throw new Error("You can only message friends");
        }

        const receiver = await User.findOne({ clerkId: receiverId }).select("blockedUsers");
        if (!receiver) throw new Error("Recipient not found");
        if (socket.user.blockedUsers?.includes(receiverId) || receiver.blockedUsers?.includes(userId)) {
          throw new Error("You cannot message this user");
        }

        let replyTo = null;
        if (data.replyTo) {
          const originalMessage = await Message.findById(data.replyTo).select("senderId receiverId");
          const belongsToConversation =
            originalMessage &&
            [originalMessage.senderId, originalMessage.receiverId].includes(userId) &&
            [originalMessage.senderId, originalMessage.receiverId].includes(receiverId);
          if (!belongsToConversation) throw new Error("Invalid reply target");
          replyTo = originalMessage._id;
        }

        let sharedContent = undefined;
        if (data.sharedContent && typeof data.sharedContent === "object") {
          const rawType = data.sharedContent.type;
          const allowedTypes = ["song", "profile", "playlist", "post", "album"];
          const type = allowedTypes.includes(rawType) ? rawType : "song";
          
          const title = typeof data.sharedContent.title === "string" && data.sharedContent.title.trim()
            ? data.sharedContent.title.trim().slice(0, 200)
            : "Shared Item";
            
          const subtitle = typeof data.sharedContent.subtitle === "string"
            ? data.sharedContent.subtitle.slice(0, 300)
            : "";

          const imageUrl = typeof data.sharedContent.imageUrl === "string"
            ? data.sharedContent.imageUrl.slice(0, 2000)
            : "";

          let href = "";
          if (typeof data.sharedContent.href === "string" && data.sharedContent.href.trim()) {
            const rawHref = data.sharedContent.href.trim();
            if (rawHref.startsWith("http://") || rawHref.startsWith("https://")) {
              try {
                const parsed = new URL(rawHref);
                href = (parsed.pathname + parsed.search + parsed.hash).slice(0, 2000);
              } catch {
                href = rawHref.replace(/^https?:\/\/[^\/]+/, "").slice(0, 2000) || "/";
              }
            } else if (rawHref.startsWith("/")) {
              href = rawHref.slice(0, 2000);
            } else {
              href = ("/" + rawHref).slice(0, 2000);
            }
          }
          if (!href) href = "/";

          sharedContent = {
            type,
            title,
            subtitle,
            imageUrl,
            href,
            song: type === "song" && data.sharedContent.song && typeof data.sharedContent.song === "object" ? data.sharedContent.song : undefined,
          };
        }

        const receiverIsOnline = userSockets.has(receiverId);
        const message = await Message.create({
          senderId: userId,
          receiverId,
          content,
          replyTo,
          sharedContent,
          status: receiverIsOnline ? "delivered" : "sent",
        });

        // Deliver immediately after the message write. Notification storage is
        // intentionally asynchronous: it must never delay the visible chat.
        const messagePayload = { message: message.toObject() };
        if (receiverIsOnline) emitToUser(io, receiverId, "messageReceived", messagePayload);
        socket.emit("messageSent", messagePayload);

        void Notification.create({
          userId: receiverId,
          message: `New message from ${socket.user.fullName}`,
          type: "message",
          metadata: { messageId: message._id, senderId: userId },
        }).catch((notificationError) => {
          console.error("Unable to create message notification:", notificationError);
        });
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("messageError", { message: error.message || "Failed to send message" });
      }
    });

    socket.on("markMessageAsRead", async (data = {}) => {
      try {
        const messageId = typeof data.messageId === "string" ? data.messageId : "";
        if (!messageId) return;

        const message = await Message.findOneAndUpdate(
          { _id: messageId, receiverId: userId, status: { $ne: "read" } },
          { status: "read", readAt: new Date() },
          { new: true }
        );
        if (!message) return;

        emitToUser(io, message.senderId, "messageStatusUpdate", {
          messageId: message._id.toString(),
          status: "read",
        });
        // Keep every session owned by the reader in sync so unread badges in
        // a separate open chat list disappear without waiting for a refetch.
        emitToUser(io, userId, "conversationRead", { userId: message.senderId });
      } catch (error) {
        console.error("Error marking message as read:", error);
      }
    });

    socket.on("disconnect", async () => {
      if (!removeUserSocket(userId, socket.id)) return;

      // Broadcast from the in-memory source immediately. Do not make peers
      // wait for MongoDB before they see an offline state.
      userActivities.delete(userId);
      emitOnlineUsers(io);
      io.emit("user_disconnected", userId);
      io.emit("activity_cleared", { userId });

      try {
        await User.updateOne(
          { clerkId: userId },
          { isOnline: false, lastSeen: new Date(), currentActivity: null }
        );
      } catch (error) {
        console.error("Error handling disconnect:", error);
      }
    });
  });

  return io;
};
