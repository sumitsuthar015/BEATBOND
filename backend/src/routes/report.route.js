import { Router } from "express";
import { reportContent } from "../controller/report.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { rateLimit } from "../middleware/rateLimit.middleware.js";

const router = Router();
router.post("/", protectRoute, rateLimit({ name: "content-report", limit: 5, windowMs: 60 * 60 * 1000 }), reportContent);
export default router;
