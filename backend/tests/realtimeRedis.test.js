import { test, mock } from "node:test";
import assert from "node:assert/strict";

const shared = {
  channels: new Map(),
  sorted: new Map(),
  sets: new Map(),
  hashes: new Map(),
};

class FakeRedis {
  isReady = false;
  duplicate() { return new FakeRedis(); }
  on() { return this; }
  async connect() { this.isReady = true; }
  async subscribe(channel, callback) {
    const subscribers = shared.channels.get(channel) ?? new Set();
    subscribers.add(callback);
    shared.channels.set(channel, subscribers);
  }
  async publish(channel, message) {
    for (const callback of shared.channels.get(channel) ?? []) callback(message);
    return shared.channels.get(channel)?.size ?? 0;
  }
  sortedSet(key) {
    const value = shared.sorted.get(key) ?? new Map();
    shared.sorted.set(key, value);
    return value;
  }
  async zRemRangeByScore(key, min, max) {
    const set = this.sortedSet(key);
    let removed = 0;
    for (const [member, score] of set) {
      if ((min === "-inf" || score >= Number(min)) && score <= Number(max)) {
        set.delete(member);
        removed += 1;
      }
    }
    return removed;
  }
  async zRange(key, start, stop) {
    const values = [...this.sortedSet(key)].sort((a, b) => a[1] - b[1]).map(([member]) => member);
    return values.slice(start, stop === -1 ? undefined : stop + 1);
  }
  async eval(script, { keys, arguments: args }) {
    const [membersKey, onlineKey] = keys;
    const members = this.sortedSet(membersKey);
    const online = this.sortedSet(onlineKey);
    if (script.includes("wasOffline")) {
      await this.zRemRangeByScore(membersKey, "-inf", args[0]);
      const wasOffline = members.size === 0;
      members.set(args[2], Number(args[1]));
      online.set(args[4], Number(args[1]));
      return wasOffline ? 1 : 0;
    }
    members.delete(args[0]);
    await this.zRemRangeByScore(membersKey, "-inf", args[1]);
    if (members.size === 0) {
      online.delete(args[2]);
      return 1;
    }
    online.set(args[2], Math.max(...members.values()));
    return 0;
  }
  async sMembers(key) { return [...(shared.sets.get(key) ?? new Set())]; }
  async sAdd(key, value) {
    const values = shared.sets.get(key) ?? new Set();
    const oldSize = values.size;
    values.add(value);
    shared.sets.set(key, values);
    return values.size - oldSize;
  }
  async sRem(key, value) {
    return Number(shared.sets.get(key)?.delete(value) ?? false);
  }
  async hGetAll(key) { return Object.fromEntries(shared.hashes.get(key) ?? []); }
  async hSet(key, field, value) {
    const hash = shared.hashes.get(key) ?? new Map();
    hash.set(field, value);
    shared.hashes.set(key, hash);
  }
  async hDel(key, field) { return Number(shared.hashes.get(key)?.delete(field) ?? false); }
  multi() {
    const operations = [];
    const transaction = {
      zAdd: (key, entries) => { operations.push(() => { for (const item of entries) this.sortedSet(key).set(item.value, item.score); }); return transaction; },
      pExpire: () => transaction,
      exec: async () => { for (const operation of operations) operation(); },
    };
    return transaction;
  }
  async quit() { this.isReady = false; }
}

process.env.REDIS_URL = "redis://test.invalid";
process.env.REALTIME_REDIS_PREFIX = `test:${Date.now()}`;
mock.module("redis", { namedExports: { createClient: () => new FakeRedis() } });

const { createRealtimeRedis } = await import("../src/lib/realtimeRedis.js");

test("Redis bridge shares events, online leases, visibility, and activities", async () => {
  const receivedBySecondInstance = [];
  const first = createRealtimeRedis();
  const second = createRealtimeRedis({ onMessage: (message) => receivedBySecondInstance.push(message) });
  assert.equal(await first.connect(), true);
  assert.equal(await second.connect(), true);
  try {
    assert.equal(await first.registerUser("user-a"), true);
    await first.publish({ scope: "presence", userId: "user-a", online: true });
    assert.equal(receivedBySecondInstance.at(-1).userId, "user-a");

    assert.equal(await second.registerUser("user-a"), false);
    assert.deepEqual((await second.onlineUsers()).sort(), ["user-a"]);
    assert.equal(await first.unregisterUser("user-a"), false);
    assert.equal(await second.unregisterUser("user-a"), true);
    assert.deepEqual(await first.onlineUsers(), []);

    await first.setHiddenUser("user-a", true);
    assert.deepEqual(await second.hiddenUsers(), ["user-a"]);
    await first.setActivity("user-a", "Night Drive");
    assert.deepEqual(await second.activities(), { "user-a": "Night Drive" });
    await first.clearActivity("user-a");
    assert.deepEqual(await second.activities(), {});
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
