import { Router } from "express";
import { getSongRecommendations } from "../controller/recommendation.controller.js";

const router = Router();
const buckets = new Map();

// Lightweight per-process protection for the public provider. This can be
// replaced by a shared Redis limiter when the app is horizontally scaled.
const rateLimit = (req, res, next) => {
  const key = req.auth?.userId || req.ip;
  const now = Date.now();
  const bucket = buckets.get(key) || { startedAt: now, count: 0 };
  if (now - bucket.startedAt > 60_000) { bucket.startedAt = now; bucket.count = 0; }
  bucket.count += 1;
  buckets.set(key, bucket);
  if (bucket.count > 30) return res.status(429).json({ message: "Too many recommendation requests. Please try again shortly." });
  next();
};

router.get("/recommendations/:songId", rateLimit, getSongRecommendations);
export default router;
