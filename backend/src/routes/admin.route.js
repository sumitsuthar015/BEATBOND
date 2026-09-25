import { Router } from "express";
import {
	checkAdmin,
	createAlbum,
	createSong,
	deleteAlbum,
	deleteCommentAsAdmin,
	deleteSong,
	getAdminUsers,
	getDashboardOverview,
	getModerationFeed,
} from "../controller/admin.controller.js";
import { protectRoute, requireAdmin } from "../middleware/auth.middleware.js";

const router = Router();

// Every signed-in user asks this on load. It answers yes or no instead of
// sitting behind requireAdmin, whose 403 showed up as a console error for
// everyone who isn't the admin.
router.get("/check", protectRoute, checkAdmin);

router.use(protectRoute, requireAdmin);

router.get("/overview", getDashboardOverview);
router.get("/users", getAdminUsers);

router.post("/songs", createSong);
router.delete("/songs/:id", deleteSong);

router.post("/albums", createAlbum);
router.delete("/albums/:id", deleteAlbum);

router.get("/moderation", getModerationFeed);
router.delete("/comments/:id", deleteCommentAsAdmin);

export default router;
