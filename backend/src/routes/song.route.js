import express from 'express';
import { getAllSongs, getFeaturedSongs, getMadeForYouSongs, getMoodSongs, getTrendingSongs, toggleLike, getLikedSongs } from '../controller/song.controller.js';
import { protectRoute } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', getAllSongs);
router.get('/featured', getFeaturedSongs);
router.get('/made-for-you', getMadeForYouSongs);
router.get('/trending', getTrendingSongs);
router.get('/mood/:mood', getMoodSongs);
router.get('/liked', protectRoute, getLikedSongs);
router.post('/:id/toggle-like', protectRoute, toggleLike);

export default router;
