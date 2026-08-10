import { Router } from "express";
import { createPost, deletePost, getUserPosts } from "../controller/post.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/user/:userId", protectRoute, getUserPosts);
router.post("/", protectRoute, createPost);
router.delete("/:postId", protectRoute, deletePost);

export default router;
