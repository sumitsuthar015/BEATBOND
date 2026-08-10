import { Router } from "express";
import { 
	getAllUsers, 
	getMessages, 
	getSharedMessages,
	clearConversation,
	searchUsers,
	getSuggestedUsers,
	updateUserProfile, 
	getUserProfile,
	markAllMessagesAsRead,
	deleteMessage,
	updateMusicPrivacy,
	saveListeningActivity,
	getListeningHistory
} from "../controller/user.controller.js";
import { getLikedArtists, syncLikedArtists, toggleLikedArtist } from "../controller/likedArtist.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = Router();

// Existing routes
router.get("/", protectRoute, getAllUsers);
router.get("/suggested", protectRoute, getSuggestedUsers);
router.get("/messages/:userId", protectRoute, getMessages);
router.get("/messages/:userId/shared", protectRoute, getSharedMessages);
router.get("/search", protectRoute, searchUsers);
router.put("/profile/:clerkId", protectRoute, updateUserProfile);
router.get("/profile/:userId", protectRoute, getUserProfile);
router.put("/messages/:userId/mark-read", protectRoute, markAllMessagesAsRead);
router.delete("/messages/:messageId", protectRoute, deleteMessage);
router.delete("/messages/:userId/clear", protectRoute, clearConversation);
router.get("/listening-history", protectRoute, getListeningHistory);
router.post("/listening-history", protectRoute, saveListeningActivity);
router.get("/liked-artists", protectRoute, getLikedArtists);
router.post("/liked-artists/toggle", protectRoute, toggleLikedArtist);
router.post("/liked-artists/sync", protectRoute, syncLikedArtists);

// ⭐ NEW ROUTE - Update Music Privacy
router.patch("/music-privacy", protectRoute, updateMusicPrivacy);

export default router;
