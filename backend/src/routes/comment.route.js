import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  addComment,
  getSongComments,
  getUserComments,
  deleteComment,
} from "../controller/comment.controller.js";

const router = Router();

router.get("/song/:songId", getSongComments);
router.get("/user/:userId", getUserComments);

router.use(protectRoute);
router.post("/", addComment);
router.delete("/:commentId", deleteComment);

export default router;
