import cloudinary from "../lib/cloudinary.js";
import { Post } from "../models/post.model.js";
import { Song } from "../models/song.model.js";
import { User } from "../models/user.model.js";
import mongoose from "mongoose";

const selectPost = "authorId content media song createdAt updatedAt";
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

export const getUserPosts = async (req, res, next) => {
  try {
    const posts = await Post.find({ authorId: req.params.userId, postType: { $ne: "story" } })
      .select(selectPost)
      .populate("song", "title artist imageUrl audioUrl duration")
      .sort({ createdAt: -1 })
      .lean();
    res.json(posts);
  } catch (error) {
    next(error);
  }
};

export const createPost = async (req, res, next) => {
  let mediaFile;
  try {
    const content =
      typeof req.body.content === "string" ? req.body.content.trim() : "";
    const songId = typeof req.body.songId === "string" ? req.body.songId : "";
    mediaFile = req.files?.media;

    if (!content && !songId && !mediaFile) {
      return res
        .status(400)
        .json({ message: "Add text, a photo/video, or a song to your post." });
    }
    if (content.length > 2_000) {
      return res
        .status(400)
        .json({ message: "Posts can be up to 2,000 characters." });
    }

    let song = null;
    if (songId) {
      song = await Song.findById(songId).select("_id");
      if (!song)
        return res
          .status(400)
          .json({ message: "The selected song no longer exists." });
    }

    let media = null;
    if (mediaFile) {
      if (
        Array.isArray(mediaFile) ||
        !["image", "video"].includes(mediaFile.mimetype?.split("/")[0])
      ) {
        return res
          .status(400)
          .json({ message: "Upload one image or video file." });
      }
      if (mediaFile.size > MAX_MEDIA_BYTES) {
        return res
          .status(400)
          .json({ message: "Images and videos must be 25 MB or smaller." });
      }
      if (
        !process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET
      ) {
        return res
          .status(503)
          .json({ message: "Media uploads are not configured yet." });
      }

      const type = mediaFile.mimetype.split("/")[0];
      let uploaded;
      try {
        uploaded = await cloudinary.uploader.upload(mediaFile.tempFilePath, {
          folder: "beatbond/posts",
          resource_type: type,
        });
      } catch (error) {
        console.error("Post media upload failed:", error);
        return res
          .status(502)
          .json({
            message: "Your media could not be uploaded. Please try again.",
          });
      }
      media = { url: uploaded.secure_url, type, publicId: uploaded.public_id };
    }

    const post = await Post.create({
      authorId: req.auth().userId,
      content,
      media,
      song: song?._id ?? null,
    });
    await post.populate("song", "title artist imageUrl audioUrl duration");
    res.status(201).json(post);
  } catch (error) {
    next(error);
  } finally {
    // express-fileupload leaves a temporary file behind when useTempFiles is
    // enabled. Removing it per request prevents large video uploads from
    // exhausting the server disk before the hourly cleanup runs.
    if (mediaFile?.tempFilePath) {
      import("node:fs/promises")
        .then(({ unlink }) => unlink(mediaFile.tempFilePath))
        .catch(() => {});
    }
  }
};

export const deletePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post not found." });
    if (post.authorId !== req.auth().userId)
      return res
        .status(403)
        .json({ message: "You can only delete your own posts." });

    await post.deleteOne();
    if (post.media?.publicId) {
      await cloudinary.uploader
        .destroy(post.media.publicId, { resource_type: post.media.type })
        .catch(() => {});
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const createMusicStory = async (req, res, next) => {
  try {
    const rawSong = req.body?.song;
    const clipStartSeconds = req.body?.clipStartSeconds ?? 0;
    const clipDurationSeconds = req.body?.clipDurationSeconds ?? 15;
    if (typeof clipStartSeconds !== "number" || !Number.isFinite(clipStartSeconds) || clipStartSeconds < 0) {
      return res.status(400).json({ message: "Clip start must be a finite number greater than or equal to zero." });
    }
    if (typeof clipDurationSeconds !== "number" || !Number.isFinite(clipDurationSeconds) || clipDurationSeconds < 10 || clipDurationSeconds > 15) {
      return res.status(400).json({ message: "Story clips must be between 10 and 15 seconds." });
    }
    const songId = typeof req.body?.songId === "string" ? req.body.songId : typeof rawSong?._id === "string" ? rawSong._id : "";
    let song = songId && mongoose.isValidObjectId(songId) ? await Song.findById(songId).select("_id title artist imageUrl audioUrl duration").lean() : null;
    if (!song && rawSong && typeof rawSong === "object") {
      const url = typeof rawSong.audioUrl === "string" ? rawSong.audioUrl : "";
      let validHttps = false;
      try { validHttps = new URL(url).protocol === "https:"; } catch { /* invalid URL */ }
      if (typeof rawSong.title === "string" && rawSong.title.trim() && rawSong.title.length <= 200 && validHttps) {
        song = { _id: songId || "external", title: rawSong.title.trim(), artist: String(rawSong.artist || "Unknown Artist").slice(0, 200), imageUrl: String(rawSong.imageUrl || "").slice(0, 2000), audioUrl: url.slice(0, 2000), duration: Math.max(0, Number(rawSong.duration) || 0) };
      }
    }
    if (!song?.audioUrl) return res.status(400).json({ message: "Choose a playable song to share." });
    if (song.duration > 0 && clipStartSeconds + clipDurationSeconds > song.duration) {
      return res.status(400).json({ message: "The selected clip extends past the end of the song." });
    }
    const now = new Date();
    const isLocalSong = song._id !== "external" && mongoose.isValidObjectId(song._id);
    const story = await Post.create({ authorId: req.auth().userId, postType: "story", song: isLocalSong ? song._id : null, storySong: isLocalSong ? null : song, clipStartSeconds, clipDurationSeconds, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) });
    if (isLocalSong) await story.populate("song", "title artist imageUrl audioUrl duration");
    const author = await User.findOne({ clerkId: story.authorId }).select("fullName imageUrl").lean();
    res.status(201).json({ ...story.toObject(), author, expiresAt: story.expiresAt });
  } catch (error) { next(error); }
};

export const getMusicStories = async (req, res, next) => {
  try {
    const viewerId = req.auth().userId;
    const viewer = await User.findOne({ clerkId: viewerId }).select("friends blockedUsers").lean();
    const friendIds = (viewer?.friends ?? []).filter((id) => !viewer?.blockedUsers?.includes(id));
    const visibleFriends = await User.find({ clerkId: { $in: friendIds }, blockedUsers: { $ne: viewerId } }).select("clerkId").lean();
    const allowedIds = [viewerId, ...visibleFriends.map((friend) => friend.clerkId)];
    const stories = await Post.find({ authorId: { $in: allowedIds }, postType: "story", expiresAt: { $gt: new Date() } })
      .select("-storyComments -storyReactions")
      .populate("song", "title artist imageUrl audioUrl duration")
      .sort({ createdAt: -1 }).limit(200).lean();
    const authors = await User.find({ clerkId: { $in: [...new Set(stories.map((story) => story.authorId))] } }).select("clerkId fullName imageUrl").lean();
    const byId = new Map(authors.map((author) => [author.clerkId, author]));
    res.json(stories.map((story) => ({ ...story, song: story.song || story.storySong, author: byId.get(story.authorId) ?? null })));
  } catch (error) { next(error); }
};

const findVisibleStory = async (storyId, viewerId) => {
  if (!mongoose.isValidObjectId(storyId)) return null;
  const story = await Post.findOne({ _id: storyId, postType: "story", expiresAt: { $gt: new Date() } });
  if (!story) return null;
  if (story.authorId === viewerId) return story;
  const [viewer, author] = await Promise.all([
    User.findOne({ clerkId: viewerId }).select("friends blockedUsers").lean(),
    User.findOne({ clerkId: story.authorId }).select("blockedUsers").lean(),
  ]);
  if (!viewer?.friends?.includes(story.authorId) || viewer.blockedUsers?.includes(story.authorId) || author?.blockedUsers?.includes(viewerId)) return null;
  return story;
};

const storyInteractionPayload = async (story, viewerId) => {
  const comments = story.storyComments || [];
  const userIds = [...new Set(comments.map((comment) => comment.userId))];
  const users = await User.find({ clerkId: { $in: userIds } }).select("clerkId fullName imageUrl").lean();
  const usersById = new Map(users.map((user) => [user.clerkId, user]));
  const reactions = (story.storyReactions || []).reduce((counts, reaction) => {
    counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1;
    return counts;
  }, {});
  return {
    comments: comments.map((comment) => ({ _id: String(comment._id), userId: comment.userId, content: comment.content, createdAt: comment.createdAt, user: usersById.get(comment.userId) || null })),
    reactions,
    viewerReaction: (story.storyReactions || []).find((reaction) => reaction.userId === viewerId)?.emoji || null,
  };
};

export const getStoryInteractions = async (req, res, next) => {
  try {
    const viewerId = req.auth().userId;
    const story = await findVisibleStory(req.params.storyId, viewerId);
    if (!story) return res.status(404).json({ message: "Story not found or is no longer available." });
    res.json(await storyInteractionPayload(story, viewerId));
  } catch (error) { next(error); }
};

export const addStoryComment = async (req, res, next) => {
  try {
    const viewerId = req.auth().userId;
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!content || content.length > 500) return res.status(400).json({ message: "Comment must be between 1 and 500 characters." });
    const story = await findVisibleStory(req.params.storyId, viewerId);
    if (!story) return res.status(404).json({ message: "Story not found or is no longer available." });
    if (story.storyComments.length >= 100) story.storyComments.shift();
    story.storyComments.push({ userId: viewerId, content });
    await story.save();
    const comment = story.storyComments.at(-1);
    const user = await User.findOne({ clerkId: viewerId }).select("clerkId fullName imageUrl").lean();
    res.status(201).json({ _id: String(comment._id), userId: viewerId, content: comment.content, createdAt: comment.createdAt, user: user || null });
  } catch (error) { next(error); }
};

export const deleteStoryComment = async (req, res, next) => {
  try {
    const viewerId = req.auth().userId;
    const story = await findVisibleStory(req.params.storyId, viewerId);
    if (!story) return res.status(404).json({ message: "Story not found or is no longer available." });
    const comment = story.storyComments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found." });
    if (comment.userId !== viewerId && story.authorId !== viewerId) return res.status(403).json({ message: "You cannot delete this comment." });
    comment.deleteOne();
    await story.save();
    res.status(204).end();
  } catch (error) { next(error); }
};

export const toggleStoryReaction = async (req, res, next) => {
  try {
    const viewerId = req.auth().userId;
    const emoji = req.body?.emoji;
    if (!["❤️", "🔥", "😂", "👏", "😍"].includes(emoji)) return res.status(400).json({ message: "Choose a supported reaction." });
    const story = await findVisibleStory(req.params.storyId, viewerId);
    if (!story) return res.status(404).json({ message: "Story not found or is no longer available." });
    const existing = story.storyReactions.find((reaction) => reaction.userId === viewerId);
    if (existing?.emoji === emoji) existing.deleteOne();
    else if (existing) { existing.emoji = emoji; existing.createdAt = new Date(); }
    else story.storyReactions.push({ userId: viewerId, emoji });
    await story.save();
    res.json(await storyInteractionPayload(story, viewerId));
  } catch (error) { next(error); }
};
