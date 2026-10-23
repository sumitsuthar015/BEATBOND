import { Comment } from "../models/comment.model.js";
import { User } from "../models/user.model.js";

export const addComment = async (req, res, next) => {
  try {
    const userId = req.auth().userId;
    const { songId, songTitle, songArtist, songImageUrl, content } = req.body;

    if (typeof songId !== "string" || !songId.trim() || songId.length > 200 || typeof content !== "string" || !content.trim() || content.length > 2_000) {
      return res.status(400).json({ error: "Song ID and comment content are required" });
    }
    if (typeof songTitle !== "undefined" && (typeof songTitle !== "string" || songTitle.length > 200)) return res.status(400).json({ error: "Invalid song title" });
    if (typeof songArtist !== "undefined" && (typeof songArtist !== "string" || songArtist.length > 200)) return res.status(400).json({ error: "Invalid artist name" });
    if (typeof songImageUrl !== "undefined" && (typeof songImageUrl !== "string" || songImageUrl.length > 2_000 || !/^https:\/\//i.test(songImageUrl))) return res.status(400).json({ error: "Invalid cover image URL" });

    const comment = await Comment.create({
      userId,
      songId,
      songTitle: songTitle || "Unknown Track",
      songArtist: songArtist || "Unknown Artist",
      songImageUrl: songImageUrl || "",
      content: content.trim(),
    });

    const user = await User.findOne({ clerkId: userId }).select("fullName username imageUrl");

    res.status(201).json({
      ...comment.toObject(),
      user: user
        ? {
            fullName: user.fullName || "BeatBond Listener",
            username: user.username,
            imageUrl: user.imageUrl || "/default-avatar.png",
          }
        : null,
    });
  } catch (error) {
    console.error("Add comment error:", error);
    next(error);
  }
};

export const getSongComments = async (req, res, next) => {
  try {
    const { songId } = req.params;

    // Keep the modal payload bounded even for songs with a long comment history.
    const comments = await Comment.find({ songId }).sort({ createdAt: -1 }).limit(100).lean();

    const userIds = [...new Set(comments.map((c) => c.userId))];
    const users = await User.find({ clerkId: { $in: userIds } }).select("clerkId fullName username imageUrl").lean();
    const userMap = new Map(users.map((u) => [u.clerkId, u]));

    const commentsWithUser = comments.map((comment) => ({
      ...comment,
      user: userMap.get(comment.userId) || {
        fullName: "BeatBond Listener",
        username: comment.userId,
        imageUrl: "/default-avatar.png",
      },
    }));

    res.status(200).json(commentsWithUser);
  } catch (error) {
    console.error("Get song comments error:", error);
    next(error);
  }
};

export const getUserComments = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const comments = await Comment.find({ userId }).sort({ createdAt: -1 }).limit(100).lean();

    const user = await User.findOne({ clerkId: userId }).select("clerkId fullName username imageUrl").lean();
    const userInfo = user || {
      fullName: "BeatBond Listener",
      username: userId,
      imageUrl: "/default-avatar.png",
    };

    const commentsWithUser = comments.map((comment) => ({
      ...comment,
      user: userInfo,
    }));

    res.status(200).json(commentsWithUser);
  } catch (error) {
    console.error("Get user comments error:", error);
    next(error);
  }
};

export const deleteComment = async (req, res, next) => {
  try {
    const userId = req.auth().userId;
    const { commentId } = req.params;

    const comment = await Comment.findById(commentId);

    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    if (comment.userId !== userId) {
      return res.status(403).json({ error: "You can only delete your own comments" });
    }

    await Comment.findByIdAndDelete(commentId);

    res.status(200).json({ success: true, message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Delete comment error:", error);
    next(error);
  }
};
