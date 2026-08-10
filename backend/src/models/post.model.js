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
    content: { type: String, trim: true, maxlength: 2_000, default: "" },
    media: { type: mediaSchema, default: null },
    song: { type: mongoose.Schema.Types.ObjectId, ref: "Song", default: null },
  },
  { timestamps: true }
);

postSchema.index({ authorId: 1, createdAt: -1 });

export const Post = mongoose.model("Post", postSchema);
