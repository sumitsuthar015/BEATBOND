import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    type: { type: String, enum: ["image", "video"], required: true },
    publicId: { type: String, default: "" },
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    authorId: { type: String, required: true, index: true },
    postType: { type: String, enum: ["post", "story"], default: "post", index: true },
    expiresAt: { type: Date, default: null },
    content: { type: String, trim: true, maxlength: 2_000, default: "" },
    media: { type: mediaSchema, default: null },
    song: { type: mongoose.Schema.Types.ObjectId, ref: "Song", default: null },
    storySong: { type: mongoose.Schema.Types.Mixed, default: null },
    clipStartSeconds: { type: Number, default: 0, min: 0 },
    clipDurationSeconds: { type: Number, default: 15, min: 10, max: 15 },
    storyComments: [{
      userId: { type: String, required: true },
      content: { type: String, required: true, trim: true, maxlength: 500 },
      createdAt: { type: Date, default: Date.now },
    }],
    storyReactions: [{
      userId: { type: String, required: true },
      emoji: { type: String, enum: ["❤️", "🔥", "😂", "👏", "😍"], required: true },
      createdAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true }
);

postSchema.index({ authorId: 1, createdAt: -1 });
postSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Post = mongoose.model("Post", postSchema);
