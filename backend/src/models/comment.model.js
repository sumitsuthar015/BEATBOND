import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    songId: { type: String, required: true, index: true },
    songTitle: { type: String, required: true },
    songArtist: { type: String, required: true },
    songImageUrl: { type: String, default: "" },
    content: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export const Comment = mongoose.model("Comment", commentSchema);
