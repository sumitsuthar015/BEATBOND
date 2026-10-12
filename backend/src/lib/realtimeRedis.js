import { createClient } from "redis";
import { randomUUID } from "node:crypto";

const PRESENCE_TTL_MS = 45_000;
const REFRESH_INTERVAL_MS = 15_000;

const REGISTER_USER = `
  redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
  local wasOffline = redis.call('ZCARD', KEYS[1]) == 0
  redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
  redis.call('PEXPIRE', KEYS[1], ARGV[4])
  redis.call('ZADD', KEYS[2], ARGV[2], ARGV[5])
  return wasOffline and 1 or 0
`;

const UNREGISTER_USER = `
  redis.call('ZREM', KEYS[1], ARGV[1])
  redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[2])
  local count = redis.call('ZCARD', KEYS[1])
  if count == 0 then
    redis.call('ZREM', KEYS[2], ARGV[3])
    return 1
  end
  local latest = redis.call('ZREVRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  redis.call('ZADD', KEYS[2], latest[2], ARGV[3])
  return 0
`;

/** Redis Pub/Sub and leases shared by all app instances using the same URL. */
export const createRealtimeRedis = ({ onMessage, onReady = () => {} } = {}) => {
  const url = process.env.REDIS_URL;
  const prefix = process.env.REALTIME_REDIS_PREFIX || "beatbond:realtime";
  const instanceId = randomUUID();
  const channel = `${prefix}:events`;
  const onlineKey = `${prefix}:online-users`;
  const hiddenKey = `${prefix}:hidden-users`;
  const activitiesKey = `${prefix}:activities`;
  const instanceKey = (userId) => `${prefix}:user:${Buffer.from(userId).toString("base64url")}:instances`;
  let publisher;
  let subscriber;
  let enabled = false;
  let subscribed = false;
  let refreshTimer;
  let retryTimer;
  let connecting = null;

  const safePublish = async (message) => {
    if (!enabled || !publisher?.isReady) return;
    try {
      await publisher.publish(channel, JSON.stringify({ ...message, origin: instanceId }));
    } catch (error) {
      console.error("Redis realtime publish failed:", error.message);
    }
  };

  const onlineUsers = async () => {
    if (!enabled || !publisher?.isReady) return null;
    const now = Date.now();
    await publisher.zRemRangeByScore(onlineKey, "-inf", now);
    return publisher.zRange(onlineKey, 0, -1);
  };

  const refreshUsers = async (userIds) => {
    if (!enabled || !publisher?.isReady || !userIds.length) return;
    const expiresAt = Date.now() + PRESENCE_TTL_MS;
    const transaction = publisher.multi();
    for (const userId of new Set(userIds)) {
      transaction.zAdd(instanceKey(userId), [{ score: expiresAt, value: instanceId }]);
      transaction.pExpire(instanceKey(userId), PRESENCE_TTL_MS * 2);
      transaction.zAdd(onlineKey, [{ score: expiresAt, value: userId }]);
    }
    await transaction.exec();
  };

  const waitUntilReady = (client) => new Promise((resolve, reject) => {
    if (client.isReady) return resolve();
    const cleanup = () => {
      clearTimeout(timer);
      client.off("ready", onReadyEvent);
      client.off("error", onErrorEvent);
    };
    const onReadyEvent = () => { cleanup(); resolve(); };
    const onErrorEvent = (error) => { cleanup(); reject(error); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Redis connection timed out")); }, 10000);
    client.once("ready", onReadyEvent);
    client.once("error", onErrorEvent);
  });

  const connect = () => {
    if (!url) return Promise.resolve(false);
    if (enabled && publisher?.isReady && subscriber?.isReady) return Promise.resolve(true);
    if (connecting) return connecting;
    if (!publisher) {
      publisher = createClient({ url });
      subscriber = publisher.duplicate();
      publisher.on("error", (error) => console.error("Redis realtime client error:", error.message));
      subscriber.on("error", (error) => console.error("Redis realtime subscriber error:", error.message));
      publisher.on("ready", () => {
        if (enabled) void Promise.resolve(onReady?.()).catch((error) => console.error("Redis state refresh failed:", error.message));
      });
    }
    connecting = (async () => {
      try {
        for (const client of [publisher, subscriber]) {
          if (!client.isOpen) void client.connect().catch(() => {});
          if (!client.isReady) await waitUntilReady(client);
        }
        if (!subscribed) {
          await subscriber.subscribe(channel, (raw) => {
            try {
              const message = JSON.parse(raw);
              if (message.origin !== instanceId) onMessage?.(message);
            } catch (error) {
              console.error("Invalid Redis realtime event:", error.message);
            }
          });
          subscribed = true;
        }
        enabled = true;
        await onReady?.();
        refreshTimer ??= setInterval(() => {
          void Promise.resolve(onReady?.()).catch((error) =>
            console.error("Redis realtime state refresh failed:", error.message),
          );
        }, REFRESH_INTERVAL_MS);
        refreshTimer.unref?.();
        return true;
      } catch (error) {
        enabled = false;
        console.error("Redis realtime setup failed; using single-instance delivery until Redis reconnects:", error.message);
        retryTimer ??= setTimeout(() => {
          retryTimer = null;
          void connect();
        }, 5000);
        retryTimer.unref?.();
        return false;
      } finally {
        connecting = null;
      }
    })();
    return connecting;
  };

  return {
    instanceId,
    get enabled() { return enabled && publisher?.isReady === true && subscriber?.isReady === true; },
    connect,
    publish: safePublish,
    async registerUser(userId) {
      if (!this.enabled) return null;
      const expiresAt = Date.now() + PRESENCE_TTL_MS;
      try {
        const result = await publisher.eval(REGISTER_USER, {
          keys: [instanceKey(userId), onlineKey],
          arguments: [String(Date.now()), String(expiresAt), instanceId, String(PRESENCE_TTL_MS * 2), userId],
        });
        return Number(result) === 1;
      } catch (error) {
        console.error("Redis presence register failed:", error.message);
        return null;
      }
    },
    async unregisterUser(userId) {
      if (!this.enabled) return null;
      try {
        const result = await publisher.eval(UNREGISTER_USER, {
          keys: [instanceKey(userId), onlineKey],
          arguments: [instanceId, String(Date.now()), userId],
        });
        return Number(result) === 1;
      } catch (error) {
        console.error("Redis presence unregister failed:", error.message);
        return null;
      }
    },
    onlineUsers,
    async hiddenUsers() {
      return this.enabled ? publisher.sMembers(hiddenKey) : [];
    },
    async setHiddenUser(userId, hidden) {
      if (!this.enabled) return;
      try {
        const changed = hidden
          ? await publisher.sAdd(hiddenKey, userId)
          : await publisher.sRem(hiddenKey, userId);
        if (changed) await safePublish({ scope: "visibility", userId, hidden });
      } catch (error) { console.error("Redis visibility update failed:", error.message); }
    },
    async activities() {
      return this.enabled ? publisher.hGetAll(activitiesKey) : {};
    },
    async setActivity(userId, activity) {
      if (!this.enabled) return;
      try { await publisher.hSet(activitiesKey, userId, activity); }
      catch (error) { console.error("Redis activity update failed:", error.message); }
    },
    async clearActivity(userId) {
      if (!this.enabled) return;
      try { await publisher.hDel(activitiesKey, userId); }
      catch (error) { console.error("Redis activity clear failed:", error.message); }
    },
    async refreshPresence(userIds) {
      try { await refreshUsers(userIds); }
      catch (error) { console.error("Redis presence refresh failed:", error.message); }
    },
    async close() {
      clearInterval(refreshTimer);
      clearTimeout(retryTimer);
      enabled = false;
      await Promise.allSettled([subscriber, publisher].map((client) => {
        if (!client) return Promise.resolve();
        if (typeof client.destroy === "function") { client.destroy(); return Promise.resolve(); }
        return client.quit?.() ?? Promise.resolve();
      }));
    },
  };
};
