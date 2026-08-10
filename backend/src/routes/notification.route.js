import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
} from "../controller/notification.controller.js";

const router = Router();

router.use(protectRoute);

router.get("/", getNotifications);
router.put("/read-all", markAllAsRead);
router.delete("/all", clearAllNotifications);
router.put("/:notificationId/read", markAsRead);
router.delete("/:notificationId", deleteNotification);

export default router;