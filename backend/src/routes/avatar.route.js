import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getMyAvatar, saveMyAvatar } from "../controller/avatar.controller.js";
const router = Router();
router.use(protectRoute);
router.get("/me", getMyAvatar);
router.put("/me", saveMyAvatar);
export default router;
