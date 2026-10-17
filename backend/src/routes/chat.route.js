import express from 'express';
import { chatWithAI, checkChatHealth } from '../controller/chat.controller.js';
import { protectRoute } from '../middleware/auth.middleware.js';

const router = express.Router();

// Chat endpoint
router.post('/', protectRoute, chatWithAI);

// Health check endpoint
router.get('/health', checkChatHealth);

export default router;
