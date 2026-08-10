import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { 
  sendFriendRequest, 
  respondToFriendRequest, 
  cancelFriendRequest,
  getFriends,
  getPendingRequests,
  getFriendshipStatus,
  removeFriend,
  getMutualFriends
} from "../controller/friend.controller.js";

const router = Router();

router.use(protectRoute);

router.post("/request", sendFriendRequest);
router.put("/request/:requestId", respondToFriendRequest);
router.delete("/request/:requestId", cancelFriendRequest);
router.get("/", getFriends);
router.get("/pending", getPendingRequests);
router.get("/status/:targetUserId", getFriendshipStatus);
router.get("/user/:userId", getFriends);
router.get("/mutual/:userId", getMutualFriends);
router.delete("/:friendId", removeFriend);

export default router;
