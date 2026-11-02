import { createHash } from "node:crypto";
import { createClient } from "redis";

const incrementWindow = `
local value = redis.call('INCR', KEYS[1])
if value == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { value, redis.call('PTTL', KEYS[1]) }
`;
let client;
let connecting;

const redisClient = () => {
  if (!process.env.REDIS_URL) return null;
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL, socket: { reconnectStrategy: (retries) => Math.min(retries * 250, 5000) } });
    client.on("error", (error) => console.error("Shared rate-limit Redis error:", error.message));
    connecting = client.connect().catch((error) => {
      console.error("Shared rate-limit Redis connection failed; using local limits until it reconnects:", error.message);
    });
  }
  return client;
};

/** Atomically increments a shared Redis window. Returns null when Redis is not ready. */
export const consumeSharedRateLimit = async ({ name, identity, windowMs }) => {
  const redis = redisClient();
  if (!redis || !redis.isReady) {
    if (connecting && redis?.isOpen) await Promise.race([connecting, new Promise((resolve) => setTimeout(resolve, 250))]);
    if (!redis?.isReady) return null;
  }
  const identityHash = createHash("sha256").update(String(identity)).digest("hex");
  try {
    const [count, ttl] = await redis.eval(incrementWindow, {
      keys: [`beatbond:rate-limit:${name}:${identityHash}`],
      arguments: [String(windowMs)],
    });
    return { count: Number(count), resetMs: Math.max(0, Number(ttl)) };
  } catch (error) {
    console.error("Shared rate-limit request failed; using local limits:", error.message);
    return null;
  }
};
