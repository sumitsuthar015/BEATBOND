import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

const ROOM_TTL_SECONDS = 24 * 60 * 60;

/** Adds cross-instance Socket.IO delivery and a small shared store for active room snapshots. */
export const createGroupListeningRedis = (io) => {
  const url = process.env.REDIS_URL;
  if (!url) return { ready: Promise.resolve(false), get: async () => null, set: async () => false, remove: async () => false, close: async () => {} };

  const publisher = createClient({ url });
  const subscriber = publisher.duplicate();
  for (const client of [publisher, subscriber]) client.on("error", (error) => console.error("Group Listening Redis error:", error.message));
  let enabled = false;
  const prefix = process.env.GROUP_LISTENING_REDIS_PREFIX || "beatbond:group-listening:room:";
  const ready = Promise.all([publisher.connect(), subscriber.connect()]).then(() => {
    io.adapter(createAdapter(publisher, subscriber));
    enabled = true;
    console.info("Group Listening Redis adapter and shared room storage enabled.");
    return true;
  }).catch((error) => {
    console.error("Group Listening Redis setup failed; using in-process rooms:", error.message);
    return false;
  });
  const keyFor = (code) => `${prefix}${code}`;
  return {
    ready,
    get enabled() { return enabled; },
    async get(code) {
      if (!enabled) return null;
      try {
        const raw = await publisher.get(keyFor(code));
        if (!raw) return null;
        const value = JSON.parse(raw);
        return { ...value, members: new Map(value.members.map((member) => [member.socketId, { id: member.id, name: member.name, joinedAt: member.joinedAt }])) };
      } catch (error) { console.error("Unable to load shared group room:", error.message); return null; }
    },
    async set(room) {
      if (!enabled) return false;
      try {
        const value = { ...room, members: [...room.members].map(([socketId, member]) => ({ socketId, ...member })) };
        await publisher.set(keyFor(room.code), JSON.stringify(value), { EX: ROOM_TTL_SECONDS });
        return true;
      } catch (error) { console.error("Unable to save shared group room:", error.message); return false; }
    },
    async remove(code) {
      if (!enabled) return false;
      try { await publisher.del(keyFor(code)); return true; }
      catch (error) { console.error("Unable to remove shared group room:", error.message); return false; }
    },
    async close() {
      enabled = false;
      await Promise.allSettled([subscriber, publisher].map((client) => client.isOpen ? client.quit() : Promise.resolve()));
    },
  };
};
