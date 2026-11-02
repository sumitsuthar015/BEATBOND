import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { rateLimit } from "../middleware/rateLimit.middleware.js";
import { getMyPodcastSubscriptions, getPodcastDiscoverFeed, getPodcastFeed, searchPodcastCatalog, subscribeToPodcast, unsubscribeFromPodcast } from "../controller/podcast.controller.js";

const router = Router();
router.use(protectRoute);
router.get("/search", rateLimit({ name: "podcast-search", limit: 30, windowMs: 60_000 }), searchPodcastCatalog);
router.get("/discover", rateLimit({ name: "podcast-discover", limit: 12, windowMs: 60_000 }), getPodcastDiscoverFeed);
router.get("/subscriptions", getMyPodcastSubscriptions);
router.post("/subscriptions", rateLimit({ name: "podcast-subscribe", limit: 30, windowMs: 60 * 60_000 }), subscribeToPodcast);
router.delete("/subscriptions/:collectionId", unsubscribeFromPodcast);
router.get("/:collectionId/episodes", rateLimit({ name: "podcast-feed", limit: 60, windowMs: 60_000 }), getPodcastFeed);
export default router;
