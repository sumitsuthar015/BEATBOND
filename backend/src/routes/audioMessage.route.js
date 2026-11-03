import { Router } from "express";
import { createAudioMessage } from "../controller/audioMessage.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { rateLimit } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post(
  "/audio",
  protectRoute,
  rateLimit({ name: "audio-message-upload", limit: 20, windowMs: 60 * 60 * 1000 }),
  createAudioMessage,
);

export default router;
