import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import mongoose from "mongoose";
import { io as createClient } from "socket.io-client";

const groupId = "000000000000000000000001";
const group = { _id: new mongoose.Types.ObjectId(groupId), name: "Test group" };
const query = (value) => ({ select() { return this; }, lean: async () => value });
const savedMessages = [];
mock.module("@clerk/express", { namedExports: { verifyToken: async (token) => ({ sub: token }) } });
mock.module(new URL("../src/models/groupConversation.model.js", import.meta.url).href, {
  namedExports: {
    GroupConversation: {
      findOne: () => query(group),
      updateOne: async () => ({}),
    },
  },
});
mock.module(new URL("../src/models/groupMessage.model.js", import.meta.url).href, {
  namedExports: {
    GroupMessage: {
      create: async (value) => {
        const message = { _id: new mongoose.Types.ObjectId(), ...value, createdAt: new Date() };
        message.toObject = () => ({ _id: message._id, ...value, createdAt: message.createdAt });
        savedMessages.push(message);
        return message;
      },
    },
  },
});
mock.module(new URL("../src/models/user.model.js", import.meta.url).href, {
  namedExports: {
    User: { findOne: () => query({ fullName: "Test Sender", imageUrl: "https://example.test/avatar.png" }) },
  },
});

const { createGroupListeningServer } = await import("../src/lib/groupListening.js");

const request = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
const waitFor = (socket, event, timeoutMs = 3_000) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { socket.off(event, onEvent); reject(new Error(`Timed out waiting for ${event}`)); }, timeoutMs);
  const onEvent = (value) => { clearTimeout(timeout); socket.off(event, onEvent); resolve(value); };
  socket.once(event, onEvent);
});

test("group chat send persists and broadcasts a message with sender details", async (t) => {
  savedMessages.length = 0;
  const server = createServer();
  createGroupListeningServer(server, { authenticate: async (token) => token });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const socket = createClient(`http://127.0.0.1:${server.address().port}`, { auth: { token: "member-1" }, transports: ["websocket"], reconnection: false });
  await once(socket, "connect");
  t.after(() => { socket.disconnect(); server.close(); });

  assert.equal((await request(socket, "chat:join", { groupId })).ok, true);
  const received = waitFor(socket, "chat:message");
  const result = await request(socket, "chat:send", { groupId, content: "Hello group" });
  assert.equal(result.ok, true);
  assert.equal(result.message.content, "Hello group");
  assert.equal(result.message.sender.fullName, "Test Sender");
  assert.equal((await received).content, "Hello group");
  assert.equal(savedMessages.length, 1);
});
