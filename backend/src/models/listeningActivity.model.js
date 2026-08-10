import mongoose from "mongoose";

const listeningActivitySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    songId: { type: String, required: true },
    title: { type: String, required: true },
    artist: { type: String, default: "Unknown Artist" },
    imageUrl: { type: String, default: "" },
    audioUrl: { type: String, default: "" },
    albumId: { type: String, default: "" },
    genre: { type: String, default: "Unknown" },
    duration: { type: Number, default: 0 },
    playedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

listeningActivitySchema.index({ userId: 1, playedAt: -1 });

export const ListeningActivity = mongoose.model("ListeningActivity", listeningActivitySchema);
