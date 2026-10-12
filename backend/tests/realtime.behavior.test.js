import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import WebSocket from "ws";

// This behavior test uses mocked app services and should never contact a real Redis instance.
process.env.REDIS_URL = "";

const users = new Map([
  [
    "user-a",
    {
      clerkId: "user-a",
      fullName: "Alice",
      friends: ["user-b"],
      blockedUsers: [],
      showActivityStatus: true,
      readReceipts: true,
      imageUrl: "/alice.png",
    },
  ],
  [
    "user-b",
    {
      clerkId: "user-b",
      fullName: "Bob",
      friends: ["user-a"],
      blockedUsers: [],
      showActivityStatus: true,
      readReceipts: true,
      imageUrl: "/bob.png",
    },
  ],
]);
const persisted = new Map();
const pushed = [];
let nextMessage = 1;
const query = (value) => ({
  select() {
    return this;
  },
  lean() {
    return this;
  },
  then(resolve, reject) {
    return Promise.resolve(value).then(resolve, reject);
  },
});

mock.module(new URL("../src/lib/db.js", import.meta.url).href, {
  namedExports: { isDatabaseConnected: () => true },
});
mock.module("@clerk/express", {
  namedExports: { verifyToken: async (token) => ({ sub: token }) },
});
mock.module(new URL("../src/models/user.model.js", import.meta.url).href, {
  namedExports: {
    User: {
      findOne: (filter) => query(users.get(filter.clerkId) ?? null),
      updateOne: async (filter, update) => {
        Object.assign(users.get(filter.clerkId) ?? {}, update);
        return {};
      },
      updateMany: async () => ({}),
      find: () => query([]),
    },
  },
});
mock.module(new URL("../src/models/message.model.js", import.meta.url).href, {
  namedExports: {
    Message: {
      find: () => query([]),
      updateMany: async () => ({}),
      findById: () => query(null),
      findOneAndUpdate: async (filter, update) => {
        if (update.$setOnInsert) {
          const key = `${filter.senderId}:${filter.clientMessageId}`;
          if (!persisted.has(key))
            persisted.set(key, {
              _id: `message-${nextMessage++}`,
              ...update.$setOnInsert,
              createdAt: new Date(),
              toObject() {
                return { ...this, toObject: undefined };
              },
            });
          return persisted.get(key);
        }
        return { _id: filter._id, senderId: "user-a", receiverId: "user-b" };
      },
    },
  },
});
mock.module(
  new URL("../src/models/notification.model.js", import.meta.url).href,
  { namedExports: { Notification: { create: async () => ({}) } } },
);
mock.module(new URL("../src/services/push.service.js", import.meta.url).href, {
  namedExports: {
    sendPushToUser: async (userId, payload) => {
      pushed.push({ userId, payload });
    },
  },
});

const { initializeWebSocket } = await import("../src/lib/realtime.js");

class Client {
  constructor(url, token, visible = true) {
    this.ws = new WebSocket(url);
    this.listeners = new Map();
    this.ws.on("message", (raw) => {
      const packet = JSON.parse(raw.toString());
      for (const listener of this.listeners.get(packet.type) ?? [])
        listener(packet.payload);
    });
    this.ws.on("open", () => this.send("authenticate", { token, visible }));
  }
  on(event, callback) {
    const list = this.listeners.get(event) ?? [];
    list.push(callback);
    this.listeners.set(event, list);
  }
  once(event, timeout = 2500) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for ${event}`)),
        timeout,
      );
      this.on(event, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
  }
  waitFor(event, predicate, timeout = 2500) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for matching ${event}`)),
        timeout,
      );
      this.on(event, (value) => {
        if (predicate(value)) {
          clearTimeout(timer);
          resolve(value);
        }
      });
    });
  }
  send(type, payload = {}) {
    this.ws.send(
      JSON.stringify({
        type,
        payload,
        requestId: `${type}-${Date.now()}-${Math.random()}`,
      }),
    );
  }
  close() {
    this.ws.close();
  }
}
const connect = async (url, token, visible = true) => {
  const client = new Client(url, token, visible);
  await client.once("authenticated");
  return client;
};

test("WebSocket behavior: messages, presence, typing, reads, and offline push", async () => {
  const server = createServer();
  const wss = initializeWebSocket(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  let alice;
  let bob;
  try {
    bob = await connect(url, "user-b");
    const connected = bob.once("user_connected");
    const online = bob.once("users_online");
    alice = await connect(url, "user-a");
    assert.equal(await connected, "user-a");
    assert.ok((await online).includes("user-b"));

    const typing = bob.once("typing");
    alice.send("typing", { receiverId: "user-b", isTyping: true });
    assert.deepEqual(await typing, { userId: "user-a", isTyping: true });

    const received = bob.once("messageReceived");
    const sent = alice.once("messageSent");
    const persistedEventPromise = alice.once("messagePersisted");
    const ackPromise = alice.waitFor(
      "ack",
      (value) => value.clientMessageId === "baseline-1",
    );
    alice.send("sendMessage", {
      receiverId: "user-b",
      content: "Hello Bob",
      clientMessageId: "baseline-1",
    });
    assert.equal((await received).message.content, "Hello Bob");
    await sent;
    assert.equal((await ackPromise).clientMessageId, "baseline-1");
    const persistedEvent = await persistedEventPromise;
    assert.equal(persistedEvent.message.content, "Hello Bob");

    const read = alice.once("messageStatusUpdate");
    bob.send("markMessageAsRead", { messageId: "message-1" });
    assert.equal((await read).status, "read");

    const disconnected = alice.once("user_disconnected");
    bob.close();
    await disconnected;
    const offlineSent = alice.once("messageSent");
    const offlinePersisted = alice.once("messagePersisted");
    alice.send("sendMessage", {
      receiverId: "user-b",
      content: "You were offline",
      clientMessageId: "baseline-2",
    });
    await offlineSent;
    await offlinePersisted;
    for (
      let i = 0;
      i < 50 && !pushed.some((item) => item.userId === "user-b");
      i++
    )
      await new Promise((r) => setTimeout(r, 10));
    assert.ok(
      pushed.some((item) => item.userId === "user-b"),
      "offline receiver triggers push notification",
    );
  } finally {
    alice?.close();
    bob?.close();
    await new Promise((resolve) => wss.close(resolve));
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
});
