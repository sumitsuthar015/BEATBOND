import express from 'express';
import { chatWithAI, checkChatHealth } from '../controller/chat.controller.js';
import { protectRoute } from '../middleware/auth.middleware.js';
import { rateLimit } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

// Chat endpoint
router.post('/', protectRoute, rateLimit({ name: "ai-chat", limit: 12, windowMs: 60 * 1000 }), chatWithAI);

// Health check endpoint
router.get('/health', checkChatHealth);

export default router;
