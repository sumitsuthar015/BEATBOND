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

// Song comment feeds are always ordered newest-first. Keep this lookup and sort
// on an index so a popular song cannot make the comments request stall.
commentSchema.index({ songId: 1, createdAt: -1 });

export const Comment = mongoose.model("Comment", commentSchema);
