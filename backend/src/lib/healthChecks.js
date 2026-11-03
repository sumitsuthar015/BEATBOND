import { createClient } from "redis";
import { isDatabaseConnected } from "./db.js";

const timedFetch = async (url, options = {}, timeoutMs = 5000) => fetch(url, {
  ...options,
  signal: AbortSignal.timeout(timeoutMs),
});

const checkCloudinary = async () => {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const key = process.env.CLOUDINARY_API_KEY?.trim();
  const secret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloud || !key || !secret) return "not_configured";
  try {
    const auth = Buffer.from(`${key}:${secret}`).toString("base64");
    const response = await timedFetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/ping`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    return response.ok ? "ok" : "unavailable";
  } catch {
    return "unavailable";
  }
};

const checkRedis = async () => {
  if (!process.env.REDIS_URL) return "not_configured";
  const client = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 3000 } });
  client.on("error", () => {});
  try {
    await client.connect();
    await client.ping();
    return "ok";
  } catch {
    return "unavailable";
  } finally {
    if (client.isOpen) await client.quit().catch(() => client.destroy());
  }
};

const checkMusicProvider = async () => {
  try {
    const response = await timedFetch("https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&ctx=web6dot0&query=beatbond", {}, 5000);
    return response.ok ? "ok" : "unavailable";
  } catch {
    return "unavailable";
  }
};

export const runHealthChecks = async () => {
  const [cloudinaryStatus, redisStatus, musicProviderStatus] = await Promise.all([
    checkCloudinary(), checkRedis(), checkMusicProvider(),
  ]);
  const databaseStatus = isDatabaseConnected() ? "ok" : "unavailable";
  return {
    status: databaseStatus === "ok" ? "ok" : "degraded",
    database: databaseStatus,
    cloudinary: cloudinaryStatus,
    redis: redisStatus,
    musicProvider: musicProviderStatus,
    checkedAt: new Date().toISOString(),
  };
};

