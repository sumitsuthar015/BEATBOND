import { Server } from "socket.io";
import { verifyToken } from "@clerk/express";
import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import { GroupConversation } from "../models/groupConversation.model.js";
import { GroupMessage } from "../models/groupMessage.model.js";
import { User } from "../models/user.model.js";
import { createGroupListeningRedis } from "./groupListeningRedis.js";
import { getAllowedOrigins } from "./allowedOrigins.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rooms = new Map();
const socketsByRoom = new Map();
const HOST_EVENT_LIMIT = 12;
const HOST_EVENT_WINDOW_MS = 5_000;

export const currentPosition = (state, now = Date.now()) => {
  const projected = Math.max(0, state.position + (state.playing ? (now - state.positionUpdatedAt) / 1000 : 0));
  return state.duration > 0 ? Math.min(projected, state.duration) : projected;
};

const snapshot = (room, now = Date.now()) => ({
  code: room.code,
  hostId: room.hostId,
  members: [...new Map([...room.members.values()].sort((a, b) => a.joinedAt - b.joinedAt).map((member) => [member.id, member])).values()],
  trackUrl: room.trackUrl,
  title: room.title,
  duration: room.duration,
  playing: room.playing,
  // Send the stored anchor and timestamp together. Clients project forward
  // from this pair using the server clock estimate.
  position: room.position,
  positionUpdatedAt: room.positionUpdatedAt,
  serverTime: now,
});

const validName = (value) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 40;
const validCode = (value) => typeof value === "string" && /^[A-HJ-NP-Z2-9]{5}$/.test(value.toUpperCase());
const validNumber = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const validHttpUrl = (value) => {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
};

const makeCode = () => {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
};

export const createGroupListeningServer = (httpServer, { authenticate } = {}) => {
  const io = new Server(httpServer, { cors: { origin: [...getAllowedOrigins()], credentials: true } });
  const roomStore = createGroupListeningRedis(io);
  const getRoom = async (code) => {
    const shared = await roomStore.get(code);
    if (shared) rooms.set(code, shared);
    if (roomStore.enabled && !shared) { rooms.delete(code); return null; }
    return shared || rooms.get(code) || null;
  };
  const saveRoom = async (room) => { rooms.set(room.code, room); await roomStore.set(room); };
  const removeRoom = async (code) => { rooms.delete(code); socketsByRoom.delete(code); await roomStore.remove(code); };
  io.use(async (socket, next) => {
    try {
      await roomStore.ready;
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || !token) return next(new Error("Sign in to use Group Listening."));
      const userId = authenticate ? await authenticate(token, socket) : (await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY, clockSkewInMs: 10_000 })).sub;
      if (!userId) return next(new Error("Sign in to use Group Listening."));
      socket.data.userId = userId;
      next();
    } catch {
      next(new Error("Your sign-in expired. Please reconnect."));
    }
  });

  const sendState = (room) => io.to(room.code).emit("room:state", snapshot(room));
  const ackError = (ack, message) => { if (typeof ack === "function") ack({ error: message }); };
  const bindRoom = async (socket, room, name) => {
    const current = socket.data.roomCode;
    if (current && current !== room.code) await leaveRoom(socket);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    room.members.set(socket.id, { id: socket.data.userId, name, joinedAt: Date.now() });
    const ids = socketsByRoom.get(room.code) ?? new Set();
    ids.add(socket.id); socketsByRoom.set(room.code, ids);
    await saveRoom(room);
  };
  const leaveRoom = async (socket) => {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = await getRoom(code);
    socket.data.roomCode = null;
    socket.leave(code);
    socketsByRoom.get(code)?.delete(socket.id);
    if (!socketsByRoom.get(code)?.size) socketsByRoom.delete(code);
    if (!room) return;
    const wasHost = room.hostId === socket.data.userId;
    room.members.delete(socket.id);
    if (room.members.size === 0) { await removeRoom(code); return; }
    const hostStillPresent = [...room.members.values()].some((member) => member.id === room.hostId);
    if (wasHost && !hostStillPresent) {
      const nextHost = [...room.members.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      room.hostId = nextHost.id;
      room.position = currentPosition(room);
      room.positionUpdatedAt = Date.now();
      room.playing = false;
    }
    await saveRoom(room);
    sendState(room);
  };
  const hostAction = async (socket, ack, action) => {
    const room = await getRoom(socket.data.roomCode);
    if (!room || !room.members.has(socket.id) || room.hostId !== socket.data.userId) return ackError(ack, "Only the host can control playback.");
    const now = Date.now();
    const rate = socket.data.hostRate ?? { start: now, count: 0 };
    if (now - rate.start >= HOST_EVENT_WINDOW_MS) { rate.start = now; rate.count = 0; }
    rate.count += 1; socket.data.hostRate = rate;
    if (rate.count > HOST_EVENT_LIMIT) return ackError(ack, "Playback controls are being used too quickly.");
    const result = action(room, now);
    if (result) return ackError(ack, result);
    room.positionUpdatedAt = now;
    await saveRoom(room);
    sendState(room);
    if (typeof ack === "function") ack({ ok: true });
  };

  io.on("connection", (socket) => {
    socket.on("time:ping", (_payload, ack) => { if (typeof ack === "function") ack({ serverTime: Date.now() }); });
    socket.on("room:create", async (payload = {}, ack) => {
      if (!validName(payload?.name)) return ackError(ack, "Enter a name of 1 to 40 characters.");
      let code = makeCode();
      for (let attempt = 0; attempt < 8 && await getRoom(code); attempt += 1) code = makeCode();
      if (await getRoom(code)) return ackError(ack, "Could not create a room code. Please try again.");
      const room = { code, hostId: socket.data.userId, members: new Map(), trackUrl: null, title: "", duration: 0, playing: false, position: 0, positionUpdatedAt: Date.now() };
      await bindRoom(socket, room, payload.name.trim());
      const state = snapshot(room); socket.emit("room:state", state);
      if (typeof ack === "function") ack({ ok: true, state });
    });
    socket.on("room:join", async (payload = {}, ack) => {
      const code = typeof payload?.code === "string" ? payload.code.trim().toUpperCase() : "";
      if (!validName(payload?.name)) return ackError(ack, "Enter a name of 1 to 40 characters.");
      if (!validCode(code)) return ackError(ack, "Enter a valid 5-character room code.");
      const room = await getRoom(code);
      if (!room) return ackError(ack, "That group was not found. Check the code and try again.");
      await bindRoom(socket, room, payload.name.trim());
      const state = snapshot(room); socket.emit("room:state", state); sendState(room);
      if (typeof ack === "function") ack({ ok: true, state });
    });
    socket.on("room:leave", () => { void leaveRoom(socket); });
    socket.data.groupChatIds = new Set();
    socket.on("chat:join", async (payload = {}, ack) => {
      const groupId = typeof payload?.groupId === "string" ? payload.groupId : "";
      if (!mongoose.isValidObjectId(groupId)) return ackError(ack, "Group chat not found.");
      const group = await GroupConversation.findOne({ _id: groupId, "members.userId": socket.data.userId }).select("_id").lean().catch(() => null);
      if (!group) return ackError(ack, "You are not a member of this group chat.");
      const roomName = `group-chat:${groupId}`;
      socket.join(roomName); socket.data.groupChatIds.add(groupId);
      if (typeof ack === "function") ack({ ok: true });
    });
    socket.on("chat:send", async (payload = {}, ack) => {
      try {
        const groupId = typeof payload?.groupId === "string" ? payload.groupId : "";
        const content = typeof payload?.content === "string" ? payload.content.trim() : "";
        if (!mongoose.isValidObjectId(groupId) || !content || content.length > 4000) return ackError(ack, "Enter a message up to 4,000 characters.");
        const group = await GroupConversation.findOne({ _id: groupId, "members.userId": socket.data.userId }).select("name").lean();
        if (!group || !socket.data.groupChatIds.has(groupId)) return ackError(ack, "Join this group chat before sending a message.");
        const message = await GroupMessage.create({ conversationId: groupId, senderId: socket.data.userId, content });
        await GroupConversation.updateOne({ _id: groupId }, { lastMessage: content.slice(0, 200), lastMessageAt: message.createdAt });
        const sender = await User.findOne({ clerkId: socket.data.userId }).select("fullName imageUrl").lean();
        const result = { ...message.toObject(), sender: sender ? { fullName: sender.fullName, imageUrl: sender.imageUrl } : null };
        io.to(`group-chat:${groupId}`).emit("chat:message", result);
        if (typeof ack === "function") ack({ ok: true, message: result });
      } catch { ackError(ack, "Message could not be sent. Please try again."); }
    });
    socket.on("chat:typing", async (payload = {}) => {
      const groupId = typeof payload?.groupId === "string" ? payload.groupId : "";
      if (!socket.data.groupChatIds.has(groupId)) return;
      socket.to(`group-chat:${groupId}`).emit("chat:typing", { groupId, userId: socket.data.userId, isTyping: Boolean(payload.isTyping) });
    });
    socket.on("host:load", (payload = {}, ack) => { void hostAction(socket, ack, (room, now) => {
      if (!validHttpUrl(payload?.url)) return "Enter a valid HTTP or HTTPS audio URL.";
      if (typeof payload?.title !== "string" || !payload.title.trim() || payload.title.trim().length > 120) return "Song title must be 1 to 120 characters.";
      if (payload.duration !== undefined && !validNumber(payload.duration)) return "Song duration must be a finite non-negative number.";
      const duration = payload.duration ?? 0;
      if (payload.url === room.trackUrl && payload.title.trim() === room.title && room.duration === 0 && duration > 0) {
        room.duration = duration;
        room.position = currentPosition(room, now);
        return null;
      }
      room.trackUrl = payload.url; room.title = payload.title.trim(); room.duration = duration;
      room.position = 0; room.positionUpdatedAt = now; room.playing = false;
    }); });
    socket.on("host:play", (_payload, ack) => { void hostAction(socket, ack, (room) => {
      if (!room.trackUrl) return "Load a song before starting playback.";
      room.playing = true;
    }); });
    socket.on("host:pause", (_payload, ack) => { void hostAction(socket, ack, (room, now) => {
      room.position = currentPosition(room, now); room.playing = false;
    }); });
    socket.on("host:seek", (payload = {}, ack) => { void hostAction(socket, ack, (room) => {
      if (!validNumber(payload?.position)) return "Seek position must be a finite non-negative number.";
      room.position = room.duration ? Math.min(payload.position, room.duration) : payload.position;
    }); });
    socket.on("disconnect", () => { void leaveRoom(socket); });
  });
  return { io, rooms, ready: roomStore.ready };
};
