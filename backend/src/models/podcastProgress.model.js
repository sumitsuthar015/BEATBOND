import mongoose from "mongoose";

const podcastProgressSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  episodeId: { type: mongoose.Schema.Types.ObjectId, ref: "PodcastEpisode", required: true },
  positionSeconds: { type: Number, default: 0, min: 0 },
  completed: { type: Boolean, default: false },
}, { timestamps: true });

podcastProgressSchema.index({ userId: 1, episodeId: 1 }, { unique: true });
podcastProgressSchema.index({ userId: 1, completed: 1, updatedAt: -1 });
export const PodcastProgress = mongoose.model("PodcastProgress", podcastProgressSchema);
