import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let savedMessage;
let createdMessage;
let uploadCount = 0;
let emitted = [];
let sender = { clerkId: "sender-1", fullName: "Sender", friends: ["receiver-1"], blockedUsers: [] };
let recipient = { clerkId: "receiver-1", blockedUsers: [] };
const uploaded = { secure_url: "https://res.cloudinary.com/demo/video/upload/voice.mp3", public_id: "voice-note-1" };

mock.module(new URL("../src/models/message.model.js", import.meta.url), {
  namedExports: { Message: {
    findOne: async (query) => savedMessage && savedMessage.senderId === query.senderId && savedMessage.clientMessageId === query.clientMessageId ? savedMessage : null,
    create: async (data) => {
      createdMessage = { ...data, _id: "message-1", createdAt: new Date("2026-01-01T00:00:00.000Z") };
      savedMessage = createdMessage;
      return { toObject: () => createdMessage };
    },
  } },
});
mock.module(new URL("../src/models/user.model.js", import.meta.url), {
  namedExports: { User: { findOne: (query) => ({ select: () => ({ lean: async () => query.clerkId === sender.clerkId ? sender : query.clerkId === recipient.clerkId ? recipient : null }) }) } },
});
mock.module(new URL("../src/lib/cloudinary.js", import.meta.url), {
  defaultExport: { uploader: {
    upload: async () => { uploadCount += 1; return uploaded; },
    destroy: async () => ({ result: "ok" }),
  } },
});
mock.module(new URL("../src/lib/realtime.js", import.meta.url), {
  namedExports: { isUserOnline: () => false, emitToUsers: (...args) => emitted.push(args) },
});
mock.module(new URL("../src/models/notification.model.js", import.meta.url), { namedExports: { Notification: { create: async () => ({ toObject: () => ({ _id: "notification-1" }) }) } } });
mock.module(new URL("../src/services/push.service.js", import.meta.url), { namedExports: { sendPushToUser: async () => {} } });

const { createAudioMessage, sniffAudioMime } = await import("../src/controller/audioMessage.controller.js");
let tempDirectory;
beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "beatbond-audio-test-"));
  savedMessage = null;
  createdMessage = null;
  uploadCount = 0;
  emitted = [];
  sender = { clerkId: "sender-1", fullName: "Sender", friends: ["receiver-1"], blockedUsers: [] };
  recipient = { clerkId: "receiver-1", blockedUsers: [] };
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_API_KEY = "test-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";
  delete process.env.AUDIO_MAX_SIZE_BYTES;
  delete process.env.AUDIO_MAX_DURATION_SECONDS;
});
afterEach(async () => { if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true }); });

const response = () => ({ statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const request = (body = {}, file) => ({ body, files: file ? { audio: file } : {}, auth: () => ({ userId: "sender-1" }) });
const webmFile = async (size = 16) => {
  const tempFilePath = path.join(tempDirectory, "note.webm");
  const bytes = Buffer.alloc(size);
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(bytes);
  await writeFile(tempFilePath, bytes);
  return { tempFilePath, size, mimetype: "audio/webm" };
};
const body = () => ({ receiverId: "receiver-1", clientMessageId: "12345678-voice", duration: "2.5" });

test("audio type is determined from file bytes instead of its declared MIME", () => {
  assert.equal(sniffAudioMime(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Array(8).fill(0)])), "audio/webm");
  assert.equal(sniffAudioMime(Buffer.from("0000ftypisom")), "audio/mp4");
  assert.equal(sniffAudioMime(Buffer.from("not an audio file")), "");
});

test("audio upload requires a recording and rejects oversize files", async () => {
  let res = response();
  await createAudioMessage(request(body()), res, (error) => { throw error; });
  assert.equal(res.statusCode, 400);
  process.env.AUDIO_MAX_SIZE_BYTES = "1024";
  res = response();
  await createAudioMessage(request(body(), { tempFilePath: "unused", size: 1025 }), res, (error) => { throw error; });
  assert.equal(res.statusCode, 413);
});

test("audio duration is bounded by configured server limits", async () => {
  process.env.AUDIO_MAX_DURATION_SECONDS = "5";
  const res = response();
  await createAudioMessage(request({ ...body(), duration: "5.1" }, await webmFile()), res, (error) => { throw error; });
  assert.equal(res.statusCode, 400);
  assert.equal(uploadCount, 0);
});

test("audio upload rejects unsupported content even when the header claims audio", async () => {
  const file = await webmFile();
  const bytes = Buffer.from("this is not audio");
  await writeFile(file.tempFilePath, bytes);
  file.size = bytes.length;
  const res = response();
  await createAudioMessage(request(body(), file), res, (error) => { throw error; });
  assert.equal(res.statusCode, 415);
  assert.equal(uploadCount, 0);
});

test("audio upload checks friendship before storage and message creation", async () => {
  sender = { ...sender, friends: [] };
  const res = response();
  await createAudioMessage(request(body(), await webmFile()), res, (error) => { throw error; });
  assert.equal(res.statusCode, 403);
  assert.equal(uploadCount, 0);
  assert.equal(createdMessage, null);
});

test("a duplicate retry returns the existing message without another upload", async () => {
  savedMessage = { senderId: "sender-1", receiverId: "receiver-1", clientMessageId: "12345678-voice", _id: "message-existing" };
  const res = response();
  await createAudioMessage(request(body(), await webmFile()), res, (error) => { throw error; });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.duplicate, true);
  assert.equal(uploadCount, 0);
});

test("valid audio is stored for the authenticated sender and broadcast to the chat", async () => {
  const res = response();
  await createAudioMessage(request({ ...body(), senderId: "forged-sender", duration: "2.5" }, await webmFile()), res, (error) => { throw error; });
  assert.equal(res.statusCode, 201);
  assert.equal(createdMessage.senderId, "sender-1");
  assert.equal(createdMessage.receiverId, "receiver-1");
  assert.equal(createdMessage.voiceNote.duration, 2.5);
  assert.equal(createdMessage.voiceNote.mimeType, "audio/webm");
  assert.equal(emitted.some(([users, event]) => users.includes("receiver-1") && event === "messagePersisted"), true);
});
