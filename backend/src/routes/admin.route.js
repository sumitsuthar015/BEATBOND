import { Router } from "express";
import {
	checkAdmin,
	createAlbum,
	createSong,
	deleteAlbum,
	deleteCommentAsAdmin,
	deleteSong,
	getAdminUsers,
	getAdminArtists,
	verifyArtistAsAdmin,
	unverifyArtistAsAdmin,
	getDashboardOverview,
	getModerationFeed,
} from "../controller/admin.controller.js";
import { protectRoute, requireAdmin } from "../middleware/auth.middleware.js";
import { rateLimit } from "../middleware/rateLimit.middleware.js";

const router = Router();

// Every signed-in user asks this on load. It answers yes or no instead of
// sitting behind requireAdmin, whose 403 showed up as a console error for
// everyone who isn't the admin.
router.get("/check", protectRoute, checkAdmin);

router.use(protectRoute, requireAdmin);

router.get("/overview", getDashboardOverview);
router.get("/users", getAdminUsers);
router.get("/artists", getAdminArtists);
router.post("/artists/verify", verifyArtistAsAdmin);
router.delete("/artists/:id/verify", unverifyArtistAsAdmin);

router.post("/songs", rateLimit({ name: "admin-upload", limit: 20, windowMs: 60 * 60 * 1000 }), createSong);
router.delete("/songs/:id", deleteSong);

router.post("/albums", rateLimit({ name: "admin-upload", limit: 20, windowMs: 60 * 60 * 1000 }), createAlbum);
router.delete("/albums/:id", deleteAlbum);

router.get("/moderation", getModerationFeed);
router.delete("/comments/:id", deleteCommentAsAdmin);

export default router;
