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
    durationPlayed: { type: Number, default: 0 },
    completionPercentage: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
    skipped: { type: Boolean, default: false },
    skipPosition: { type: Number, default: 0 },
    source: { type: String, default: "player" },
    playedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

listeningActivitySchema.index({ userId: 1, playedAt: -1 });
listeningActivitySchema.index({ userId: 1, songId: 1, playedAt: -1 });

export const ListeningActivity = mongoose.model("ListeningActivity", listeningActivitySchema);
