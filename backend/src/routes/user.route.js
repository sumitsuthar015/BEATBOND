import { Router } from "express";
import { 
	getAllUsers, 
	getMessages, 
	getSharedMessages,
	clearConversation,
	searchUsers,
	getSuggestedUsers,
	updateUserProfile, 
	uploadProfilePhoto,
	uploadAvatarPhoto,
	setPhotoSource,
	getUserProfile,
	markAllMessagesAsRead,
	deleteMessage,
	updateMusicPrivacy,
	saveListeningActivity,
	getListeningHistory,
	clearListeningHistory,
	getProfileMusic,
	getBlockedUsers,
	blockUser,
	unblockUser,
	updatePrivacy,
	getHiddenListeners,
	hideListeningFrom,
	showListeningTo,
} from "../controller/user.controller.js";
import { getLikedArtists, syncLikedArtists, toggleLikedArtist } from "../controller/likedArtist.controller.js";
import { editMessage, muteChat, reactToMessage, unmuteChat, updateChatSettings } from "../controller/message.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = Router();

// Existing routes
router.get("/", protectRoute, getAllUsers);
router.get("/suggested", protectRoute, getSuggestedUsers);
router.get("/messages/:userId", protectRoute, getMessages);
router.get("/messages/:userId/shared", protectRoute, getSharedMessages);
router.get("/search", protectRoute, searchUsers);
router.put("/profile/:clerkId", protectRoute, updateUserProfile);
router.post("/profile/photo", protectRoute, uploadProfilePhoto);
router.post("/profile/avatar-photo", protectRoute, uploadAvatarPhoto);
router.patch("/profile/photo-source", protectRoute, setPhotoSource);
router.get("/profile/:userId", protectRoute, getUserProfile);
router.get("/profile/:userId/music", protectRoute, getProfileMusic);
router.put("/messages/:userId/mark-read", protectRoute, markAllMessagesAsRead);
router.delete("/messages/:messageId", protectRoute, deleteMessage);
router.patch("/messages/:messageId", protectRoute, editMessage);
router.post("/messages/:messageId/reactions", protectRoute, reactToMessage);
router.put("/chats/:userId/mute", protectRoute, muteChat);
router.delete("/chats/:userId/mute", protectRoute, unmuteChat);
router.patch("/chat-settings", protectRoute, updateChatSettings);
router.delete("/messages/:userId/clear", protectRoute, clearConversation);
router.get("/listening-history", protectRoute, getListeningHistory);
router.post("/listening-history", protectRoute, saveListeningActivity);
router.delete("/listening-history", protectRoute, clearListeningHistory);
router.get("/blocked", protectRoute, getBlockedUsers);
router.post("/block/:userId", protectRoute, blockUser);
router.delete("/block/:userId", protectRoute, unblockUser);
router.get("/liked-artists", protectRoute, getLikedArtists);
router.post("/liked-artists/toggle", protectRoute, toggleLikedArtist);
router.post("/liked-artists/sync", protectRoute, syncLikedArtists);

// ⭐ NEW ROUTE - Update Music Privacy
router.patch("/music-privacy", protectRoute, updateMusicPrivacy);
router.patch("/privacy", protectRoute, updatePrivacy);
router.get("/music-hidden", protectRoute, getHiddenListeners);
router.put("/music-hidden/:userId", protectRoute, hideListeningFrom);
router.delete("/music-hidden/:userId", protectRoute, showListeningTo);

export default router;
