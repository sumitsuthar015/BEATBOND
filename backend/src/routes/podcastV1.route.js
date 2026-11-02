import { Router } from "express";
import {
  addPodcastByRSS, browsePodcasts, getContinueListening, getMyPodcastSubscriptionsV1,
  getNewPodcastEpisodes, getPodcastById, getPodcastEpisodesPage,
  getPodcastPlaybackPreference, saveEpisodeProgress, setPodcastPlaybackPreference,
  subscribeToPodcastById, unsubscribeFromPodcastById,
} from "../controller/podcast.controller.js";
import { protectRoute, requireAdmin } from "../middleware/auth.middleware.js";
import { rateLimit } from "../middleware/rateLimit.middleware.js";

const router = Router();
router.use(protectRoute);
router.get("/me/subscriptions", getMyPodcastSubscriptionsV1);
router.get("/me/continue-listening", getContinueListening);
router.get("/me/new-episodes", getNewPodcastEpisodes);
router.get("/me/playback-preference", getPodcastPlaybackPreference);
router.put("/me/playback-preference", rateLimit({ name: "podcast-speed", limit: 30, windowMs: 60 * 60_000 }), setPodcastPlaybackPreference);
router.put("/episodes/:id/progress", rateLimit({ name: "podcast-progress", limit: 120, windowMs: 60 * 60_000 }), saveEpisodeProgress);
router.patch("/episodes/:id/progress", rateLimit({ name: "podcast-progress", limit: 60, windowMs: 60 * 60_000 }), saveEpisodeProgress);
router.get("/", browsePodcasts);
router.post("/", requireAdmin, rateLimit({ name: "podcast-add-feed", limit: 20, windowMs: 60 * 60_000 }), addPodcastByRSS);
router.post("/:id/subscribe", rateLimit({ name: "podcast-subscribe-v1", limit: 40, windowMs: 60 * 60_000 }), subscribeToPodcastById);
router.delete("/:id/subscribe", rateLimit({ name: "podcast-subscribe-v1", limit: 40, windowMs: 60 * 60_000 }), unsubscribeFromPodcastById);
router.get("/:id/episodes", getPodcastEpisodesPage);
router.get("/:id", getPodcastById);
export default router;
