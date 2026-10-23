import { Router } from "express";
import {
  handleSearchSongs,
  handleSearchArtists,
  handleSearchAlbums,
  handleSearchCatalogue,
  handleGetAlbumById,
  handleGetArtistById,
  handleGetArtistSongs,
  handleGetArtistAlbums,
  handleGetSongLyrics,
} from "../controller/saavn.controller.js";

const router = Router();
const searchBuckets = new Map();

// Search is debounced in the client and cached server-side. This limit is a
// final guard for provider-backed endpoints, scoped per account when available.
const searchRateLimit = (req, res, next) => {
  const userId = typeof req.auth === "function" ? req.auth()?.userId : "";
  const key = userId || req.ip || "anonymous";
  const now = Date.now();
  const bucket = searchBuckets.get(key) || { startedAt: now, count: 0 };
  if (now - bucket.startedAt >= 60_000) {
    bucket.startedAt = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  searchBuckets.set(key, bucket);
  if (searchBuckets.size > 5_000) {
    for (const [bucketKey, entry] of searchBuckets) {
      if (now - entry.startedAt >= 60_000) searchBuckets.delete(bucketKey);
    }
  }
  if (bucket.count > 120) {
    return res.status(429).json({ status: "FAILED", message: "Too many searches. Please wait a moment and try again." });
  }
  next();
};

router.get("/search", searchRateLimit, handleSearchCatalogue);
router.get("/search/songs", searchRateLimit, handleSearchSongs);
router.get("/search/artists", searchRateLimit, handleSearchArtists);
router.get("/search/albums", searchRateLimit, handleSearchAlbums);

router.get("/artists/:id/songs", searchRateLimit, handleGetArtistSongs);
router.get("/artists/:id/albums", searchRateLimit, handleGetArtistAlbums);
router.get("/artists/:id", searchRateLimit, handleGetArtistById);

router.get("/albums", searchRateLimit, handleGetAlbumById);
router.get("/albums/:id", searchRateLimit, handleGetAlbumById);

router.get("/lyrics/:id", searchRateLimit, handleGetSongLyrics);
router.get("/lyrics", searchRateLimit, handleGetSongLyrics);

export default router;
