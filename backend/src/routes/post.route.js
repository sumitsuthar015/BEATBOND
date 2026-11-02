import { Router } from "express";
import { addStoryComment, createMusicStory, createPost, deletePost, deleteStoryComment, getMusicStories, getStoryInteractions, getUserPosts, toggleStoryReaction } from "../controller/post.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { rateLimit } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.get("/stories", protectRoute, getMusicStories);
router.post("/stories", protectRoute, createMusicStory);
router.get("/stories/:storyId/interactions", protectRoute, getStoryInteractions);
router.post("/stories/:storyId/comments", protectRoute, rateLimit({ name: "story-comment", limit: 30, windowMs: 60 * 60_000 }), addStoryComment);
router.delete("/stories/:storyId/comments/:commentId", protectRoute, rateLimit({ name: "story-comment-delete", limit: 60, windowMs: 60 * 60_000 }), deleteStoryComment);
router.put("/stories/:storyId/reaction", protectRoute, rateLimit({ name: "story-reaction", limit: 120, windowMs: 60 * 60_000 }), toggleStoryReaction);
router.get("/user/:userId", protectRoute, getUserPosts);
router.post("/", protectRoute, createPost);
router.delete("/:postId", protectRoute, deletePost);

export default router;
