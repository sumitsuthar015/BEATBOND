import mongoose from "mongoose";
import { Comment } from "../models/comment.model.js";
import { ContentReport } from "../models/contentReport.model.js";
import { Post } from "../models/post.model.js";

const reasons = new Set(["spam", "harassment", "hate", "nudity", "violence", "copyright", "other"]);

export const reportContent = async (req, res, next) => {
  try {
    const { targetType, targetId, reason } = req.body || {};
    const details = typeof req.body?.details === "string" ? req.body.details.trim() : "";
    if (!["post", "comment"].includes(targetType) || !mongoose.isValidObjectId(targetId) || !reasons.has(reason) || details.length > 500) {
      return res.status(400).json({ message: "Choose valid content and a report reason. Details can be up to 500 characters." });
    }
    const reporterId = req.auth().userId;
    const existing = await ContentReport.findOne({ reporterId, targetType, targetId, status: "open" }).select("_id").lean();
    if (existing) return res.status(409).json({ message: "You have already reported this content." });

    const target = targetType === "post"
      ? await Post.findById(targetId).select("authorId content storySong song postType").populate("song", "title artist").lean()
      : await Comment.findById(targetId).select("userId content songTitle songArtist").lean();
    if (!target) return res.status(404).json({ message: "This content is no longer available." });
    const targetAuthorId = targetType === "post" ? target.authorId : target.userId;
    if (targetAuthorId === reporterId) return res.status(400).json({ message: "You cannot report your own content." });
    const song = target.song || target.storySong;
    const preview = target.content || (song ? `${song.title || "Shared song"} by ${song.artist || "Unknown artist"}` : `${target.songTitle || "Song"} by ${target.songArtist || "Unknown artist"}`);
    const report = await ContentReport.create({ reporterId, targetType, targetId, targetAuthorId, reason, details, contentPreview: String(preview || "").slice(0, 500) });
    res.status(201).json({ message: "Report sent to the moderation team.", reportId: report.id });
  } catch (error) { next(error); }
};
