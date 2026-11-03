import { mock, test } from "node:test";
import assert from "node:assert/strict";

let messageToReturn;
let deleteCalls = [];
let storageDeletes = [];
mock.module(new URL("../src/models/message.model.js", import.meta.url), {
  namedExports: { Message: {
    findOne: async (query) => query.senderId && query.senderId !== messageToReturn?.senderId ? null : messageToReturn,
    deleteOne: async (query) => { deleteCalls.push(query); return { deletedCount: 1 }; },
    updateOne: async () => ({ modifiedCount: 1 }),
  } },
});
mock.module(new URL("../src/lib/realtime.js", import.meta.url), {
  namedExports: { emitToUsers: (...args) => deleteCalls.push(args), isUserOnline: () => false, refreshActivityAudience: async () => {} },
});
mock.module(new URL("../src/lib/cloudinary.js", import.meta.url), {
  namedExports: { default: { uploader: { destroy: async (publicId, options) => { storageDeletes.push({ publicId, options }); return { result: "ok" }; } } } },
});

const { deleteMessage } = await import("../src/controller/user.controller.js");
const response = () => ({ statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const request = (userId, scope) => ({ params: { messageId: "507f1f77bcf86cd799439011" }, query: { scope }, auth: () => ({ userId }) });

test("a recipient cannot delete another sender's voice note for everyone", async () => {
  messageToReturn = { _id: "507f1f77bcf86cd799439011", senderId: "sender-1", receiverId: "receiver-1", voiceNote: { publicId: "private-audio-1" } };
  deleteCalls = [];
  storageDeletes = [];
  const res = response();
  await deleteMessage(request("receiver-1", "everyone"), res, (error) => { throw error; });
  assert.equal(res.statusCode, 404);
  assert.equal(deleteCalls.length, 0);
  assert.equal(storageDeletes.length, 0);
});

test("the sender can delete their voice note and its Cloudinary asset for everyone", async () => {
  messageToReturn = { _id: "507f1f77bcf86cd799439011", senderId: "sender-1", receiverId: "receiver-1", voiceNote: { publicId: "voice-asset-1" } };
  deleteCalls = [];
  storageDeletes = [];
  const res = response();
  await deleteMessage(request("sender-1", "everyone"), res, (error) => { throw error; });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(storageDeletes, [{ publicId: "voice-asset-1", options: { resource_type: "video" } }]);
});
