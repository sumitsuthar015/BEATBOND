import express from 'express';
import { chatWithAI, checkChatHealth } from '../controller/chat.controller.js';

const router = express.Router();

// Chat endpoint
router.post('/', chatWithAI);

// Health check endpoint
router.get('/health', checkChatHealth);

export default router;