import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { addGroupChatMember, createGroupChat, getGroupMessages, leaveGroupChat, listGroupChats, removeGroupChatMember, updateGroupChat, uploadGroupChatImage } from "../controller/groupChat.controller.js";

const router = Router();
router.use(protectRoute);
router.get("/", listGroupChats);
router.post("/", createGroupChat);
router.patch("/:groupId", updateGroupChat);
router.post("/:groupId/image", uploadGroupChatImage);
router.post("/:groupId/members", addGroupChatMember);
router.delete("/:groupId/members/me", leaveGroupChat);
router.delete("/:groupId/members/:userId", removeGroupChatMember);
router.get("/:groupId/messages", getGroupMessages);
export default router;
