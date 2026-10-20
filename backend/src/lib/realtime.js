import { verifyToken } from "@clerk/express";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { createRealtimeRedis } from "./realtimeRedis.js";
import mongoose from "mongoose";
import { isDatabaseConnected } from "./db.js";
import { Message } from "../models/message.model.js";
import { User } from "../models/user.model.js";
import { PRIVACY_FIELDS, canSeeLiveActivity, liveActivityViewers } from "../services/privacy.service.js";
import { sendsReadReceipts } from "../services/chat.service.js";
import { Notification } from "../models/notification.model.js";
import { sendPushToUser } from "../services/push.service.js";

const userSockets = new Map();
const socketsById = new Map();
const socketHandlers = new WeakMap();
const userForegroundSockets = new Map();
const userActivities = new Map();
const clusterOnlineUsers = new Set();
const hiddenPresence = new Set();
let socketServer = null;
let redisBridge = null;
let redisReady = Promise.resolve(false);

// WebSocket membership is the only presence source of truth. Database fields are
// retained for last-seen/profile views, but are never used to infer presence.
export const isUserOnline = (userId) => userSockets.has(userId) || clusterOnlineUsers.has(userId);
export const getOnlineUserIds = () => Array.from(new Set([...clusterOnlineUsers, ...userSockets.keys()]));

const SOCKET_ORIGINS = [
  "https://beatbond-75ns.onrender.com",
];
const DEV_SOCKET_ORIGINS = ["http://localhost:3000", "http://localhost:5173", "http://localhost:4173"];

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

const sendPacket = (socket, type, payload) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, payload }));
};
const sendToLocalUser = (userId, event, payload, foregroundOnly = false) => {
  const socketIds = foregroundOnly ? userForegroundSockets.get(userId) ?? [] : userSockets.get(userId) ?? [];
  for (const socketId of socketIds) sendPacket(socketsById.get(socketId), event, payload);
};
const sendToAllLocalUsers = (event, payload) => {
  for (const userId of userSockets.keys()) sendToLocalUser(userId, event, payload);
};
const emitToUser = (_hub, userId, event, payload, foregroundOnly = false) => {
  sendToLocalUser(userId, event, payload, foregroundOnly);
  socketServer?.publishUser(userId, event, payload, foregroundOnly);
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

let presenceReset = Promise.resolve();
let hasResetStalePresence = false;

const resetStalePresence = () => {
  // This is a once-per-process startup action. Running it after a later
  // reconnect would incorrectly mark currently connected users as offline.
  if (hasResetStalePresence || !isDatabaseConnected()) return presenceReset;

  hasResetStalePresence = true;
  presenceReset = Promise.resolve().then(async () => {
    if (process.env.REDIS_URL) await redisReady;
    if (redisBridge?.enabled) {
      const onlineUsers = await redisBridge.onlineUsers() ?? [];
      await User.updateMany(
        { isOnline: true, clerkId: { $nin: onlineUsers } },
        { isOnline: false },
      );
      if (onlineUsers.length) await User.updateMany({ clerkId: { $in: onlineUsers } }, { isOnline: true });
    } else {
      await User.updateMany({ isOnline: true }, { isOnline: false });
    }
  }).catch((error) => {
    console.error("Unable to synchronize stale presence records:", error.message);
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

// People who hide their online status. Hiding works
// both ways: they aren't shown as online, and they don't see who else is.
const presenceVisibleTo = (ownerId, viewerId) =>
  ownerId === viewerId || (!hiddenPresence.has(ownerId) && !hiddenPresence.has(viewerId));

// Each person gets the list of online people they're allowed to see.
const emitOnlineUsers = (io) => {
  const online = getOnlineUserIds();
  for (const viewerId of userSockets.keys()) {
    sendToLocalUser(viewerId, "users_online", online.filter((ownerId) => presenceVisibleTo(ownerId, viewerId)));
  }
};

const broadcastPresence = (io, ownerId, event) => {
  for (const viewerId of userSockets.keys())
    if (viewerId !== ownerId && presenceVisibleTo(ownerId, viewerId)) sendToLocalUser(viewerId, event, ownerId);
};

/** Applies a change to someone's "show online status" setting straight away. */
export const setPresenceVisibility = (userId, visible) => {
  if (visible) hiddenPresence.delete(userId);
  else hiddenPresence.add(userId);
  if (socketServer) emitOnlineUsers(socketServer);
  void redisBridge?.setHiddenUser(userId, !visible);
};

/** Sends an event to every open session of each of these people. */
export const emitToUsers = (userIds, event, payload) => {
  if (!socketServer) return;
  for (const userId of new Set(userIds)) emitToUser(socketServer, userId, event, payload);
};


const isFriend = (user, otherUserId) => user.friends?.includes(otherUserId);

export const initializeWebSocket = (server) => {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const io = {
    emit(event, payload) {
      sendToAllLocalUsers(event, payload);
      void redisBridge?.publish({ scope: "all", event, payload });
    },
    publishUser(userId, event, payload, foregroundOnly = false) {
      void redisBridge?.publish({ scope: "user", userId, event, payload, foregroundOnly });
    },
  };
  socketServer = io;

  const handleRedisMessage = (message) => {
    if (message.scope === "presence") {
      if (message.online) clusterOnlineUsers.add(message.userId);
      else clusterOnlineUsers.delete(message.userId);
      if (!message.online) userActivities.delete(message.userId);
      broadcastPresence(io, message.userId, message.online ? "user_connected" : "user_disconnected");
      emitOnlineUsers(io);
      if (!message.online) sendToAllLocalUsers("activity_cleared", { userId: message.userId });
      return;
    }
    if (message.scope === "visibility") {
      if (message.hidden) hiddenPresence.add(message.userId);
      else hiddenPresence.delete(message.userId);
      emitOnlineUsers(io);
      return;
    }
    if (message.scope === "user") {
      if (message.event === "activity_updated")
        userActivities.set(message.payload.userId, message.payload.activity);
      else if (message.event === "activity_cleared")
        userActivities.delete(message.payload.userId);
      sendToLocalUser(message.userId, message.event, message.payload, message.foregroundOnly);
      return;
    }
    if (message.scope === "all") {
      if (message.event === "activity_cleared") userActivities.delete(message.payload.userId);
      sendToAllLocalUsers(message.event, message.payload);
    }
  };

  const syncRedisState = async () => {
    if (!redisBridge?.enabled) return;
    await redisBridge.refreshPresence(Array.from(userSockets.keys()));
    const [onlineUsers, hiddenUsers, activities] = await Promise.all([
      redisBridge.onlineUsers(),
      redisBridge.hiddenUsers(),
      redisBridge.activities(),
    ]);
    if (!onlineUsers) return;
    const previousUsers = new Set(clusterOnlineUsers);
    clusterOnlineUsers.clear();
    for (const userId of onlineUsers) clusterOnlineUsers.add(userId);
    hiddenPresence.clear();
    for (const userId of hiddenUsers) hiddenPresence.add(userId);
    userActivities.clear();
    for (const [userId, activity] of Object.entries(activities)) userActivities.set(userId, activity);

    const nextUsers = new Set(clusterOnlineUsers);
    for (const userId of previousUsers) {
      if (!nextUsers.has(userId) && !userSockets.has(userId)) {
        broadcastPresence(io, userId, "user_disconnected");
        sendToAllLocalUsers("activity_cleared", { userId });
        void redisBridge.clearActivity(userId);
        void User.updateOne(
          { clerkId: userId },
          { isOnline: false, lastSeen: new Date(), currentActivity: null },
        ).catch((error) => console.error("Unable to clear expired Redis presence:", error.message));
      }
    }
    for (const userId of nextUsers) {
      if (!previousUsers.has(userId) && !userSockets.has(userId)) broadcastPresence(io, userId, "user_connected");
    }
    emitOnlineUsers(io);
  };

  redisBridge = createRealtimeRedis({ onMessage: handleRedisMessage, onReady: syncRedisState });
  redisReady = redisBridge.connect();
  // When Redis is enabled, Mongo presence is reconciled against its live lease
  // set so this process never marks users on other instances as offline.
  resetStalePresence();
  mongoose.connection.once("connected", resetStalePresence);
  if (!process.env.REDIS_URL && process.env.NODE_ENV === "production")
    console.warn("REDIS_URL is unset; realtime presence and events are local to this server instance.");

  server.on("upgrade", (request, networkSocket, head) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname !== "/ws") { networkSocket.destroy(); return; }
    const origin = request.headers.origin;
    const allowedOrigins = new Set([
      ...SOCKET_ORIGINS,
      ...(process.env.NODE_ENV === "production" ? [] : DEV_SOCKET_ORIGINS),
      process.env.CLIENT_URL,
      process.env.FRONTEND_URL,
    ].filter(Boolean));
    if (origin && !allowedOrigins.has(origin)) {
      networkSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      networkSocket.destroy();
      return;
    }
    wss.handleUpgrade(request, networkSocket, head, (ws) => wss.emit("connection", ws, request));
  });

  const onAuthenticatedConnection = async (socket) => {
    const userId = socket.user.clerkId;
    // Ensure startup cleanup cannot overwrite a connection that arrives while
    // MongoDB is clearing records left by the previous server process.
    await resetStalePresence();
    await presenceReset;
    await redisReady;
    if (socket.closed) return;
    const sharedWasOffline = await redisBridge.registerUser(userId);
    const wasOffline = sharedWasOffline ?? !isUserOnline(userId);
    addUserSocket(userId, socket.id, socket.clientVisible);
    clusterOnlineUsers.add(userId);
    const showActivityStatus = socket.user.showActivityStatus !== false;
    if (showActivityStatus) hiddenPresence.delete(userId);
    else hiddenPresence.add(userId);
    await redisBridge.setHiddenUser(userId, !showActivityStatus);

    try {
      if (wasOffline) {
        await User.updateOne({ clerkId: userId }, { isOnline: true });
        broadcastPresence(io, userId, "user_connected");
        void redisBridge.publish({ scope: "presence", userId, online: true });

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
        await redisBridge.setActivity(userId, activityString);
        await User.updateOne({ clerkId: userId }, { currentActivity: activityString });

        for (const viewerId of liveActivityViewers(currentUser, getOnlineUserIds())) {
          emitToUser(io, viewerId, "activity_updated", { userId, activity: activityString });
        }
      } catch (error) {
        console.error("Error updating activity:", error);
      }
    });

    socket.on("clear_activity", async () => {
      try {
        userActivities.delete(userId);
        await redisBridge.clearActivity(userId);
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
          User.findOne({ clerkId: receiverId }).select("blockedUsers").lean(),
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

        const receiverIsOnline = isUserOnline(receiverId);
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
        // CHANGED: persistence, notification storage, and Web Push run off the
        // realtime event's critical path. A persistence failure retracts the
        // temporary row from every open session.
        void (async () => {
          let message;
          try {
            message = await Message.findOneAndUpdate(
              { senderId: userId, clientMessageId },
              {
                $setOnInsert: {
                  senderId: userId,
                  receiverId,
                  clientMessageId,
                  content,
                  replyTo,
                  sharedContent,
                  status: receiverIsOnline ? "delivered" : "sent",
                }
              },
              { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
            );
            const persistedPayload = { clientMessageId, message: message.toObject() };
            emitToUser(io, userId, "messagePersisted", persistedPayload);
            if (receiverIsOnline) emitToUser(io, receiverId, "messagePersisted", persistedPayload);

            // Persist the notification only after the message itself is saved.
            // Notification and push failures must not roll back or hide a chat
            // message that has already been delivered and persisted.
            try {
              const notification = await Notification.create({
                userId: receiverId,
                message: content.slice(0, 4000),
                type: "message",
                metadata: { messageId: message._id.toString(), senderId: userId },
              });
              emitToUser(io, receiverId, "notificationReceived", {
                ...notification.toObject(),
                sender: {
                  clerkId: userId,
                  fullName: sender.fullName || "BeatBond user",
                  imageUrl: sender.imageUrl || "",
                },
              });
            } catch (notificationError) {
              console.error("Unable to save chat notification:", notificationError);
            }

            // Web Push is already a backend dependency; it is sent only to
            // registered devices and the service worker suppresses alerts
            // while BeatBond is visible.
            void sendPushToUser(receiverId, {
              title: sender.fullName || "New message",
              body: content.slice(0, 160),
              url: `/chat?userId=${encodeURIComponent(userId)}`,
              tag: `beatbond-message-${userId}`,
              data: { senderId: userId, messageId: message._id.toString() },
            }).catch((pushError) => console.error("Unable to send chat push notification:", pushError));
          } catch (persistError) {
            console.error("Unable to persist realtime message:", persistError);
            const failedPayload = { clientMessageId, senderId: userId, receiverId, message: "Message could not be saved. Please retry." };
            emitToUser(io, userId, "messageFailed", failedPayload);
            if (receiverIsOnline) emitToUser(io, receiverId, "messageFailed", failedPayload);
            return;
          }

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
      const globallyOffline = await redisBridge.unregisterUser(userId);
      if (globallyOffline === false) return;

      // Broadcast from the in-memory source immediately. Do not make peers
      // wait for MongoDB before they see an offline state.
      userActivities.delete(userId);
      clusterOnlineUsers.delete(userId);
      await redisBridge.clearActivity(userId);
      broadcastPresence(io, userId, "user_disconnected");
      emitOnlineUsers(io);
      void redisBridge.publish({ scope: "presence", userId, online: false });
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
  };

  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });
    const socket = {
      id: randomUUID(), user: null, clientVisible: false, readyState: ws.readyState,
      on(event, handler) {
        const handlers = socketHandlers.get(this) ?? new Map();
        const list = handlers.get(event) ?? [];
        list.push(handler); handlers.set(event, list); socketHandlers.set(this, handlers);
      },
      emit(event, payload) { sendPacket(ws, event, payload); },
    };
    ws.socket = socket;
    socket.closed = false;
    let setupComplete = false;
    let disconnectedBeforeSetup = false;
    let disconnectHandled = false;
    const runDisconnectHandlers = () => {
      if (disconnectHandled) return;
      const handlers = socketHandlers.get(socket)?.get("disconnect") ?? [];
      if (!handlers.length) { disconnectedBeforeSetup = true; return; }
      disconnectHandled = true;
      for (const handler of handlers) void handler();
    };
    const authTimeout = setTimeout(() => {
      if (!socket.user) ws.close(1008, "Authentication timeout");
    }, 10000);
    authTimeout.unref?.();
    ws.on("message", async (raw) => {
      let packet;
      try { packet = JSON.parse(raw.toString()); } catch { ws.close(1003, "Invalid JSON"); return; }
      if (!socket.user) {
        if (packet?.type !== "authenticate" || typeof packet.payload?.token !== "string" || !isDatabaseConnected()) {
          sendPacket(ws, "connect_error", { message: "Authentication error" }); ws.close(1008, "Authentication required"); return;
        }
        try {
          const claims = await verifyToken(packet.payload.token, { secretKey: process.env.CLERK_SECRET_KEY, clockSkewInMs: 10_000 });
          const userId = claims?.sub;
          const user = userId && await User.findOne({ clerkId: userId }).select("clerkId fullName friends blockedUsers musicPrivacy showActivityStatus");
          if (!user) throw new Error("Authentication error");
          socket.user = user;
          clearTimeout(authTimeout);
          socket.clientVisible = packet.payload.visible === true;
          socket.readyState = ws.readyState;
          socketsById.set(socket.id, ws);
          await onAuthenticatedConnection(socket);
          setupComplete = true;
          if (socket.closed || disconnectedBeforeSetup) { runDisconnectHandlers(); return; }
          sendPacket(ws, "authenticated", { userId });
        } catch (error) {
          console.error("WebSocket authentication failed:", error.message);
          sendPacket(ws, "connect_error", { message: "Authentication error" }); ws.close(1008, "Authentication failed");
        }
        return;
      }
      if (!setupComplete) return;
      if (packet?.type === "ping") { sendPacket(ws, "pong", { at: Date.now() }); return; }
      const handler = socketHandlers.get(socket)?.get(packet?.type)?.[0];
      if (handler) {
        try {
          await handler(packet.payload ?? {});
          if (packet.requestId) sendPacket(ws, "ack", { requestId: packet.requestId, clientMessageId: packet.payload?.clientMessageId ?? null });
        } catch (error) { console.error(`WebSocket handler failed (${packet.type}):`, error); }
      }
    });
    ws.on("close", () => {
      clearTimeout(authTimeout);
      socket.closed = true;
      socketsById.delete(socket.id);
      if (socket.user && setupComplete) runDisconnectHandlers();
      else if (socket.user) disconnectedBeforeSetup = true;
    });
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false; ws.ping();
    }
  }, 25000);
  heartbeat.unref?.();
  wss.on("close", () => clearInterval(heartbeat));
  server.once("close", () => {
    clearInterval(heartbeat);
    void redisBridge?.close();
  });

  return wss;
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
