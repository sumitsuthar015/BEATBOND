import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { rateLimit } from "../middleware/rateLimit.middleware.js";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
  getPushPublicKey,
  subscribeToPush,
  unsubscribeFromPush,
} from "../controller/notification.controller.js";

const router = Router();

router.get("/push/public-key", getPushPublicKey);

router.use(protectRoute);

router.post("/push/subscriptions", rateLimit({ name: "push-subscription", limit: 10, windowMs: 60 * 60 * 1000 }), subscribeToPush);
router.delete("/push/subscriptions", unsubscribeFromPush);

router.get("/", getNotifications);
router.put("/read-all", markAllAsRead);
router.delete("/all", clearAllNotifications);
router.put("/:notificationId/read", markAsRead);
router.delete("/:notificationId", deleteNotification);

export default router;
