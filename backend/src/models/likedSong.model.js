import mongoose from "mongoose";

const likedSongSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  songId: { type: String, required: true },
  song: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

likedSongSchema.index({ userId: 1, songId: 1 }, { unique: true });

export const LikedSong = mongoose.model("LikedSong", likedSongSchema);
