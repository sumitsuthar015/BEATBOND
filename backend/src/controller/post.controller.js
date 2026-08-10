import cloudinary from "../lib/cloudinary.js";
import { Post } from "../models/post.model.js";
import { Song } from "../models/song.model.js";

const selectPost = "authorId content media song createdAt updatedAt";
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

export const getUserPosts = async (req, res, next) => {
  try {
    const posts = await Post.find({ authorId: req.params.userId })
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
      authorId: req.auth.userId,
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
    if (post.authorId !== req.auth.userId)
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
