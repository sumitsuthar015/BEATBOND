import { verifyToken } from "@clerk/express";
import { Server } from "socket.io";
import mongoose from "mongoose";
import { isDatabaseConnected } from "./db.js";
import { Message } from "../models/message.model.js";
import { Notification } from "../models/notification.model.js";
import { User } from "../models/user.model.js";
import { PRIVACY_FIELDS, canSeeLiveActivity, liveActivityViewers } from "../services/privacy.service.js";
import { sendsReadReceipts } from "../services/chat.service.js";
import { sendPushToUser } from "../services/push.service.js";

const userSockets = new Map();
const userForegroundSockets = new Map();
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

const addUserSocket = (userId, socketId, isVisible) => {
  const sockets = userSockets.get(userId) ?? new Set();
  sockets.add(socketId);
  userSockets.set(userId, sockets);
  if (isVisible) setSocketVisibility(userId, socketId, true);
};

const setSocketVisibility = (userId, socketId, isVisible) => {
  const sockets = userForegroundSockets.get(userId) ?? new Set();
  if (isVisible) sockets.add(socketId);
  else sockets.delete(socketId);
  if (sockets.size) userForegroundSockets.set(userId, sockets);
  else userForegroundSockets.delete(userId);
};

const removeUserSocket = (userId, socketId) => {
  setSocketVisibility(userId, socketId, false);
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

// People who hide their online status, among those connected. Hiding works
// both ways: they aren't shown as online, and they don't see who else is.
const hiddenPresence = new Set();

const presenceVisibleTo = (ownerId, viewerId) =>
  ownerId === viewerId || (!hiddenPresence.has(ownerId) && !hiddenPresence.has(viewerId));

// Each person gets the list of online people they're allowed to see.
const emitOnlineUsers = (io) => {
  const online = getOnlineUserIds();
  for (const viewerId of userSockets.keys()) {
    emitToUser(io, viewerId, "users_online", online.filter((ownerId) => presenceVisibleTo(ownerId, viewerId)));
  }
};

const broadcastPresence = (io, ownerId, event) => {
  for (const viewerId of userSockets.keys()) {
    if (viewerId !== ownerId && presenceVisibleTo(ownerId, viewerId)) emitToUser(io, viewerId, event, ownerId);
  }
};

/** Applies a change to someone's "show online status" setting straight away. */
export const setPresenceVisibility = (userId, visible) => {
  if (!socketServer || !userSockets.has(userId)) return;
  if (visible) hiddenPresence.delete(userId);
  else hiddenPresence.add(userId);
  emitOnlineUsers(socketServer);
};

/** Sends an event to every open session of each of these people. */
export const emitToUsers = (userIds, event, payload) => {
  if (!socketServer) return;
  for (const userId of new Set(userIds)) emitToUser(socketServer, userId, event, payload);
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
    transports: ["websocket"],
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
        clockSkewInMs: 10_000,
      });
      const userId = claims?.sub;
      if (!userId) return next(new Error("Authentication error"));

      const user = await User.findOne({ clerkId: userId }).select(
        "clerkId fullName friends blockedUsers musicPrivacy showActivityStatus"
      );
      if (!user) return next(new Error("Authentication error"));

      socket.user = user;
      socket.clientVisible = socket.handshake.auth?.visible === true;
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
    addUserSocket(userId, socket.id, socket.clientVisible);
    if (socket.user.showActivityStatus === false) hiddenPresence.add(userId);

    try {
      if (wasOffline) {
        await User.updateOne({ clerkId: userId }, { isOnline: true });
        broadcastPresence(io, userId, "user_connected");

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

    socket.on("client_visibility", ({ visible } = {}) => {
      socket.clientVisible = visible === true;
      setSocketVisibility(userId, socket.id, socket.clientVisible);
    });

      const activityUsers = await User.find({
        clerkId: { $in: Array.from(userActivities.keys()) },
      }).select(PRIVACY_FIELDS).lean();
      const visibleActivities = activityUsers.flatMap((activityUser) => {
        const activity = userActivities.get(activityUser.clerkId);
        return activity && canSeeLiveActivity(activityUser, userId) ? [[activityUser.clerkId, activity]] : [];
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
        const currentUser = await User.findOne({ clerkId: userId }).select(PRIVACY_FIELDS).lean();
        if (!currentUser) return;

        userActivities.set(userId, activityString);
        await User.updateOne({ clerkId: userId }, { currentActivity: activityString });

        for (const viewerId of liveActivityViewers(currentUser, userSockets.keys())) {
          emitToUser(io, viewerId, "activity_updated", { userId, activity: activityString });
        }
      } catch (error) {
        console.error("Error updating activity:", error);
      }
    });

    socket.on("clear_activity", async () => {
      try {
        userActivities.delete(userId);
        await User.updateOne({ clerkId: userId }, { currentActivity: null });
        // Stopping reveals nothing, and anyone who saw the old song (even
        // under an older privacy choice) must drop it.
        io.emit("activity_cleared", { userId });
      } catch (error) {
        console.error("Error clearing activity:", error);
      }
    });

    socket.on("typing", (data = {}) => {
      const receiverId = typeof data.receiverId === "string" ? data.receiverId : "";
      if (!receiverId || !isFriend(socket.user, receiverId)) return;
      emitToUser(io, receiverId, "typing", { userId, isTyping: Boolean(data.isTyping) });
    });

    socket.on("sendMessage", async (data = {}) => {
      try {
        const receiverId = typeof data.receiverId === "string" ? data.receiverId : "";
        const content = typeof data.content === "string" ? data.content.trim() : "";
        if (!receiverId || receiverId === userId) throw new Error("Invalid recipient");
        if (!content) throw new Error("Message cannot be empty");
        if (content.length > 4000) throw new Error("Message is too long");
        const [sender, receiver] = await Promise.all([
          User.findOne({ clerkId: userId }).select("fullName imageUrl friends blockedUsers").lean(),
          User.findOne({ clerkId: receiverId }).select("blockedUsers mutedChats messageNotifications").lean(),
        ]);
        if (!sender) throw new Error("Sender not found");
        if (!receiver) throw new Error("Recipient not found");
        socket.user.friends = sender.friends;
        socket.user.blockedUsers = sender.blockedUsers;
        if (!isFriend(socket.user, receiverId)) {
          throw new Error("You can only message friends");
        }

        if (socket.user.blockedUsers?.includes(receiverId) || receiver.blockedUsers?.includes(userId)) {
          throw new Error("You cannot message this user");
        }

        let replyTo = null;
        let replyPreview = null;
        if (data.replyTo) {
          const originalMessage = await Message.findById(data.replyTo).select("senderId receiverId content");
          const belongsToConversation =
            originalMessage &&
            [originalMessage.senderId, originalMessage.receiverId].includes(userId) &&
            [originalMessage.senderId, originalMessage.receiverId].includes(receiverId);
          if (!belongsToConversation) throw new Error("Invalid reply target");
          replyTo = originalMessage._id;
          replyPreview = { _id: originalMessage._id.toString(), senderId: originalMessage.senderId, content: originalMessage.content };
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
        const clientMessageId = typeof data.clientMessageId === "string" && data.clientMessageId.trim().length > 0 && data.clientMessageId.length <= 100
          ? data.clientMessageId
          : new mongoose.Types.ObjectId().toString();
        const now = new Date().toISOString();
        const transientMessage = {
          _id: `temp-${clientMessageId}`,
          clientMessageId,
          senderId: userId,
          receiverId,
          content,
          replyTo: replyPreview,
          sharedContent,
          createdAt: now,
          status: receiverIsOnline ? "delivered" : "sent",
        };

        // CHANGED: deliver to connected clients before waiting for the message
        // insert. Client IDs reconcile this instant placeholder to MongoDB.
        const realtimePayload = { message: transientMessage, clientMessageId };
        if (receiverIsOnline) emitToUser(io, receiverId, "messageReceived", realtimePayload);
        socket.emit("messageSent", realtimePayload);
        const wantsNotification = receiver.messageNotifications !== false && !receiver.mutedChats?.includes(userId);
        if (wantsNotification) {
          const preview = content || sharedContent?.title || "Sent you a message";
          const notificationPayload = {
            senderId: userId,
            senderName: sender.fullName,
            senderImageUrl: sender.imageUrl || "",
            preview: preview.slice(0, 180),
            chatUrl: `/chat?userId=${encodeURIComponent(userId)}`,
          };
          for (const socketId of userForegroundSockets.get(receiverId) ?? []) {
            io.to(socketId).emit("newMessageNotification", notificationPayload);
          }
        }

        // CHANGED: persistence, notification storage, and Web Push run off the
        // Socket.IO event's critical path. A persistence failure retracts the
        // temporary row from every open session.
        void (async () => {
          let message;
          try {
            message = await Message.findOneAndUpdate(
              { senderId: userId, clientMessageId },
              { $setOnInsert: {
                senderId: userId,
                receiverId,
                clientMessageId,
                content,
                replyTo,
                sharedContent,
                status: receiverIsOnline ? "delivered" : "sent",
              } },
              { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
            );
            const persistedPayload = { clientMessageId, message: message.toObject() };
            emitToUser(io, userId, "messagePersisted", persistedPayload);
            if (receiverIsOnline) emitToUser(io, receiverId, "messagePersisted", persistedPayload);
          } catch (persistError) {
            console.error("Unable to persist realtime message:", persistError);
            const failedPayload = { clientMessageId, senderId: userId, receiverId, message: "Message could not be saved. Please retry." };
            emitToUser(io, userId, "messageFailed", failedPayload);
            if (receiverIsOnline) emitToUser(io, receiverId, "messageFailed", failedPayload);
            return;
          }

          // Notification storage and Web Push run off the Socket.IO critical
          // path and only after the message is safely in history.
          if (wantsNotification) void (async () => {
            try {
              const preview = content || sharedContent?.title || "Sent you a message";
              const notificationPromise = Notification.create({
                userId: receiverId,
                message: `New message from ${sender.fullName}`,
                type: "message",
                metadata: {
                  messageId: message._id.toString(),
                  senderId: userId,
                  senderName: sender.fullName,
                  senderImageUrl: sender.imageUrl || "",
                  preview: preview.slice(0, 180),
                },
              });
              void sendPushToUser(receiverId, {
                title: sender.fullName || "New message",
                body: preview.slice(0, 180),
                icon: sender.imageUrl || "/pwa-192x192.png",
                url: `/chat?userId=${encodeURIComponent(userId)}`,
                tag: `chat-${userId}`,
              }).catch((pushError) => console.error("Unable to send chat push notification:", pushError.message));
              await notificationPromise;
            } catch (notificationError) {
              console.error("Unable to create message notification:", notificationError.message);
            }
          })();
        })();
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("messageError", { clientMessageId: data.clientMessageId, message: error.message || "Failed to send message" });
      }
    });

    socket.on("markMessageAsRead", async (data = {}) => {
      try {
        const messageId = typeof data.messageId === "string" ? data.messageId : "";
        if (!messageId) return;

        // readAt always records the read (it drives unread badges); the
        // visible "read" tick only exists when the reader shares receipts.
        const reader = await User.findOne({ clerkId: userId }).select("readReceipts").lean();
        const shareReceipt = sendsReadReceipts(reader);
        const message = await Message.findOneAndUpdate(
          { _id: messageId, receiverId: userId, readAt: null },
          { readAt: new Date(), ...(shareReceipt ? { status: "read" } : {}) },
          { new: true }
        );
        if (!message) return;

        const sender = shareReceipt ? await User.findOne({ clerkId: message.senderId }).select("readReceipts").lean() : null;
        if (shareReceipt && sendsReadReceipts(sender)) {
          emitToUser(io, message.senderId, "messageStatusUpdate", {
            messageId: message._id.toString(),
            status: "read",
          });
        }
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
      broadcastPresence(io, userId, "user_disconnected");
      hiddenPresence.delete(userId);
      emitOnlineUsers(io);
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

// After someone changes who can see their listening (or blocks someone),
// take their current song off every screen and send it again only to the
// people who may still see it.
export const refreshActivityAudience = async (userId) => {
  if (!socketServer) return;
  socketServer.emit("activity_cleared", { userId });
  const activity = userActivities.get(userId);
  if (!activity) return;
  const owner = await User.findOne({ clerkId: userId }).select(PRIVACY_FIELDS).lean();
  if (!owner) return;
  for (const viewerId of liveActivityViewers(owner, userSockets.keys())) {
    emitToUser(socketServer, viewerId, "activity_updated", { userId, activity });
  }
};
