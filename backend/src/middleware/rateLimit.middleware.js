const buckets = new Map();

/** Small per-process limiter for sensitive endpoints; use Redis for multi-instance enforcement. */
export const rateLimit = ({ limit, windowMs, name }) => (req, res, next) => {
  const userId = typeof req.auth === "function" ? req.auth()?.userId : null;
  // Authenticated limits are per account. Public route limits use the socket
  // peer IP because request headers must not define an attacker-controlled key.
  const key = `${name}:${userId || req.socket?.remoteAddress || req.ip || "unknown"}`;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    bucket = { startedAt: now, count: 0 };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  if (buckets.size > 10_000) {
    for (const [bucketKey, candidate] of buckets) {
      if (now - candidate.startedAt >= windowMs) buckets.delete(bucketKey);
    }
  }
  if (bucket.count > limit) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((windowMs - (now - bucket.startedAt)) / 1000))));
    return res.status(429).json({ message: "Too many requests. Please try again shortly." });
  }
  next();
};
